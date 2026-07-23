'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import SiteHeader from '@/app/components/SiteHeader';
import {
  Backdrop, CompiledRules, DEMO_LEVEL, GameDef, LevelShape, ObjectType, ScriptOwner,
  TILE, LEVEL_SHAPES, VIEW_W, VIEW_H, emptyRules, starterLevel, validDims, withScripts,
} from '../engine/types';
import { initGame, stepGame, emptyInput, GameState, InputState, KEY_LOOKUP } from '../engine/physics';
import { renderGame, renderDesign, renderMinimap, cameraFor, DesignHover } from '../engine/render';
import { compileScripts } from '../engine/blocks';
import { BotConfig, defaultBot, loadBotLocal, fetchCloudBot } from '../engine/bot';
import ArcadeWorkspace from '../components/ArcadeWorkspace';
import RuleSummary from '../components/RuleSummary';
import { loadUnitProgress, loadCloudUnitProgress, mergeUnitProgress } from '../unit';
// Shared juice from Block Lab (particles + synth SFX). If the two labs diverge,
// extract these into a shared lib alongside the unit-shell refactor (M0).
import {
  Particle,
  renderParticles,
  spawnConfetti,
  spawnParticles,
  updateParticles,
} from '../../block-lab/engine/mazeRenderer';
import { isMuted, setMuted, playBump, playCollect, playMove, playStomp, playWin, playZap } from '../../block-lab/engine/sfx';

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

const CONFETTI = ['#FFD54A', '#4C8DFF', '#22C55E', '#FF6BD6', '#7DF9FF'];

// ── Save slots ────────────────────────────────────────────────────────────────
// Students keep up to 6 level designs. Slot 0 uses the legacy single-draft key
// so pre-slots work carries over untouched. Cloud storage: user_progress rows
// (tool arcade-lab, level 0, challenge = slot).
const SLOT_COUNT = 6;
const SLOT_PICK_KEY = 'arcade_lab_slot';
function draftKey(slot: number) {
  return slot === 0 ? 'arcade_lab_draft' : `arcade_lab_draft_${slot}`;
}
function shapeName(d: GameDef): string {
  if (d.cols * TILE > VIEW_W) return 'Long';
  if (d.rows * TILE > VIEW_H) return 'Tall';
  return 'Classic';
}

type Mode = 'design' | 'code' | 'play';
type Tool = ObjectType | 'eraser';

const PALETTE: { tool: Tool; icon: string; label: string; hint: string }[] = [
  { tool: 'platform', icon: '🧱', label: 'Block',   hint: 'Solid ground — drag to paint a row' },
  { tool: 'coin',     icon: '🪙', label: 'Crystal', hint: 'Players collect these for points' },
  { tool: 'spike',    icon: '🔺', label: 'Spikes',  hint: 'Ouch — costs a life!' },
  { tool: 'enemy',    icon: '👾', label: 'Enemy',   hint: 'Patrols its platform. Stomp it!' },
  { tool: 'flag',     icon: '🚩', label: 'Goal',    hint: 'Reach it to win (one per level)' },
  { tool: 'spawn',    icon: '🤖', label: 'Start',   hint: 'Where the player begins (one per level)' },
  { tool: 'eraser',   icon: '🧽', label: 'Eraser',  hint: 'Remove anything (or right-click)' },
];

const OWNERS: { owner: ScriptOwner; icon: string; label: string; hint: string }[] = [
  { owner: 'player', icon: '🤖', label: 'Player',  hint: 'Wire the keyboard — how does the player move?' },
  { owner: 'coin',   icon: '🪙', label: 'Crystal', hint: 'What happens when the player touches a crystal?' },
  { owner: 'spike',  icon: '🔺', label: 'Spikes',  hint: 'What do spikes do to the player?' },
  { owner: 'enemy',  icon: '👾', label: 'Enemy',   hint: 'Head-stomps and side-bumps — you make the rules.' },
  { owner: 'flag',   icon: '🚩', label: 'Goal',    hint: 'What does reaching the flag do?' },
  { owner: 'game',   icon: '🎮', label: 'Game',    hint: 'Starting rules and score goals.' },
];

const BACKDROPS: { id: Backdrop; label: string; swatch: string }[] = [
  { id: 'hills', label: 'Hills', swatch: 'linear-gradient(135deg,#7EC8F0,#53B54B)' },
  { id: 'cave',  label: 'Cave',  swatch: 'linear-gradient(135deg,#241A38,#4A4258)' },
  { id: 'candy', label: 'Candy', swatch: 'linear-gradient(135deg,#FFD9EC,#FF8FBE)' },
  { id: 'space', label: 'Space', swatch: 'linear-gradient(135deg,#141B33,#5A6888)' },
];

const SOUND_FN = { chime: playCollect, pop: playStomp, thud: playBump, zap: playZap } as const;

function loadLocalDraft(slot: number): GameDef | null {
  try {
    const raw = localStorage.getItem(draftKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.objects) && validDims(parsed?.cols, parsed?.rows)) return withScripts(parsed);
  } catch { /* ignore */ }
  return null;
}

function CreateInner() {
  const { data: session, status: authStatus } = useSession();
  const userId = session?.user?.id ?? null;
  const role = session?.user?.role ?? 'student';
  const searchParams = useSearchParams();

  // ── Unlock gate: Free Build is the reward for finishing the Missions unit,
  //    and teachers can additionally lock it outright (arcade-lab level 1) ──
  const [gate, setGate] = useState<'checking' | 'locked' | 'open'>('checking');
  const [gateReason, setGateReason] = useState<'missions' | 'teacher'>('missions');
  useEffect(() => {
    if (authStatus === 'loading') return;
    if (role !== 'student') { setGate('open'); return; }
    fetch('/api/student/locks?tool=arcade-lab')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { level_idx: number; challenge_idx: number }[]) => {
        if ((rows ?? []).some(l => l.level_idx === 1 && l.challenge_idx === -1)) {
          setGateReason('teacher');
          setGate('locked');
          return;
        }
        const local = loadUnitProgress();
        if (local.unitComplete) { setGate('open'); return; }
        loadCloudUnitProgress().then(cloud => {
          setGate(mergeUnitProgress(local, cloud).unitComplete ? 'open' : 'locked');
        });
      })
      .catch(() => setGate('locked'));
  }, [authStatus, role]);

  const [def, setDef] = useState<GameDef>(starterLevel);
  const [mode, setMode] = useState<Mode>('design');
  const [tool, setTool] = useState<Tool>('platform');
  const [owner, setOwner] = useState<ScriptOwner>('player');
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [muted, setMutedState] = useState(() => (typeof window === 'undefined' ? false : isMuted()));
  const [synced, setSynced] = useState(false);
  const [keysUnwired, setKeysUnwired] = useState(false);
  const [publish, setPublish] = useState<{ state: 'idle' | 'busy' | 'done' | 'error'; msg?: string }>({ state: 'idle' });
  const [slot, setSlot] = useState(0);
  const [showLevels, setShowLevels] = useState(false);
  const [slotsMeta, setSlotsMeta] = useState<({ title: string; shape: string } | null)[] | null>(null);
  const slotRef = useRef(0);
  // Guards the cloud autosave: a pristine, untouched page must NEVER overwrite
  // a cloud design (this bug once wiped a saved level with a blank starter)
  const dirtyRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const miniDragRef = useRef(false);
  const viewRef = useRef({ x: 0, y: 0 });
  const defRef = useRef(def);
  const modeRef = useRef(mode);
  const toolRef = useRef(tool);
  const hoverRef = useRef<DesignHover | null>(null);
  const paintingRef = useRef(false);
  const lastPaintRef = useRef('');
  const stateRef = useRef<GameState | null>(null);
  const rulesRef = useRef<CompiledRules>(emptyRules());
  const inputRef = useRef<InputState>(emptyInput());
  const particlesRef = useRef<Particle[]>([]);
  const lastTimeRef = useRef(0);
  const lastSoundRef = useRef<Record<string, number>>({});
  const loadedRef = useRef(false);
  const botRef = useRef<BotConfig>(defaultBot());

  useEffect(() => {
    const local = loadBotLocal();
    if (local) { botRef.current = local; return; }
    fetchCloudBot().then(c => { if (c) botRef.current = c; });
  }, []);

  defRef.current = def;
  modeRef.current = mode;
  toolRef.current = tool;

  const clampView = useCallback(() => {
    const d = defRef.current;
    const v = viewRef.current;
    v.x = Math.max(0, Math.min(v.x, d.cols * TILE - VIEW_W));
    v.y = Math.max(0, Math.min(v.y, d.rows * TILE - VIEW_H));
  }, []);

  // Open the editor looking at the spawn point (matters on Tall/Long levels)
  const focusSpawn = useCallback((d: GameDef) => {
    const sp = d.objects.find(o => o.type === 'spawn');
    viewRef.current = {
      x: Math.max(0, Math.min((sp?.x ?? 0) * TILE - VIEW_W / 2, d.cols * TILE - VIEW_W)),
      y: Math.max(0, Math.min((sp?.y ?? 0) * TILE - VIEW_H / 2, d.rows * TILE - VIEW_H)),
    };
  }, []);

  const isBigLevel = def.cols * TILE > VIEW_W || def.rows * TILE > VIEW_H;
  const miniScale = Math.min(VIEW_W / (def.cols * TILE), 120 / (def.rows * TILE), 0.2);
  const miniW = Math.round(def.cols * TILE * miniScale);
  const miniH = Math.round(def.rows * TILE * miniScale);

  const hasSpawn = def.objects.some(o => o.type === 'spawn');
  const hasFlag = def.objects.some(o => o.type === 'flag');
  const playable = hasSpawn && hasFlag;

  // ── Slot persistence ────────────────────────────────────────────────────────
  const fetchCloudSlot = useCallback(async (s: number): Promise<GameDef | null> => {
    try {
      const res = await fetch('/api/progress?tool=arcade-lab');
      const rows = res.ok ? await res.json() : [];
      const row = (rows ?? []).find(
        (r: { level_idx: number; challenge_idx: number; saved_code?: string }) =>
          r.level_idx === 0 && r.challenge_idx === s && r.saved_code,
      );
      if (row?.saved_code) {
        const parsed = JSON.parse(row.saved_code);
        if (Array.isArray(parsed?.objects) && validDims(parsed?.cols, parsed?.rows)) return withScripts(parsed);
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const loadSlot = useCallback(async (s: number) => {
    setSlot(s);
    slotRef.current = s;
    try { localStorage.setItem(SLOT_PICK_KEY, String(s)); } catch { /* ignore */ }
    setPublish({ state: 'idle' });
    stateRef.current = null;
    setMode('design');
    setShowLevels(false);
    dirtyRef.current = false; // loading is not editing — don't touch the cloud yet
    const local = loadLocalDraft(s);
    if (local) {
      setDef(local);
      focusSpawn(local);
      return;
    }
    const cloud = await fetchCloudSlot(s);
    if (cloud) {
      try { localStorage.setItem(draftKey(s), JSON.stringify(cloud)); } catch { /* ignore */ }
      setDef(cloud);
      focusSpawn(cloud);
      return;
    }
    const fresh = starterLevel();
    setDef(fresh);
    focusSpawn(fresh);
  }, [fetchCloudSlot, focusSpawn]);

  // Initial slot: ?slot= in the URL wins (My Work links), else last used
  useEffect(() => {
    let s = Number(searchParams.get('slot'));
    if (!Number.isInteger(s) || s < 0 || s >= SLOT_COUNT) {
      try { s = Number(localStorage.getItem(SLOT_PICK_KEY)); } catch { s = 0; }
      if (!Number.isInteger(s) || s < 0 || s >= SLOT_COUNT) s = 0;
    }
    loadSlot(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave — only after a real edit this session (dirty guard)
  useEffect(() => {
    if (!dirtyRef.current) return;
    try { localStorage.setItem(draftKey(slot), JSON.stringify(def)); } catch { /* ignore */ }
    if (!userId) return;
    setSynced(false);
    const timer = setTimeout(() => {
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'arcade-lab', level_idx: 0, challenge_idx: slot, completed: false, saved_code: JSON.stringify(def) }),
      }).then(r => { if (r.ok) setSynced(true); });
    }, 1500);
    return () => clearTimeout(timer);
  }, [def, userId, slot]);

  // ── My Levels manager ───────────────────────────────────────────────────────
  const openLevels = useCallback(async () => {
    setShowLevels(true);
    setSlotsMeta(null);
    const metas: ({ title: string; shape: string } | null)[] =
      Array.from({ length: SLOT_COUNT }, (_, i) => {
        const d = loadLocalDraft(i);
        return d ? { title: d.title || 'Untitled level', shape: shapeName(d) } : null;
      });
    try {
      const res = await fetch('/api/progress?tool=arcade-lab');
      const rows = res.ok ? await res.json() : [];
      for (const r of rows ?? []) {
        if (r.level_idx === 0 && r.challenge_idx >= 0 && r.challenge_idx < SLOT_COUNT && r.saved_code && !metas[r.challenge_idx]) {
          try {
            const parsed = JSON.parse(r.saved_code);
            if (Array.isArray(parsed?.objects)) metas[r.challenge_idx] = { title: parsed.title || 'Untitled level', shape: shapeName(parsed) };
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    setSlotsMeta(metas);
  }, []);

  const copyCurrentTo = useCallback((i: number) => {
    const d = { ...defRef.current, scripts: { ...defRef.current.scripts } };
    try { localStorage.setItem(draftKey(i), JSON.stringify(d)); } catch { /* ignore */ }
    if (userId) {
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'arcade-lab', level_idx: 0, challenge_idx: i, completed: false, saved_code: JSON.stringify(d) }),
      });
    }
    loadSlot(i);
  }, [userId, loadSlot]);

  const deleteSlot = useCallback((i: number) => {
    if (!confirm(`Delete the level in slot ${i + 1}? This can't be undone.`)) return;
    try { localStorage.removeItem(draftKey(i)); } catch { /* ignore */ }
    if (userId) {
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'arcade-lab', level_idx: 0, challenge_idx: i, completed: false, saved_code: '' }),
      });
    }
    if (i === slotRef.current) loadSlot(i);
    else openLevels();
  }, [userId, loadSlot, openLevels]);

  // ── Design-mode editing ─────────────────────────────────────────────────────
  const placeAt = useCallback((cx: number, cy: number, t: Tool) => {
    const d = defRef.current;
    if (cx < 0 || cy < 0 || cx >= d.cols || cy >= d.rows) return;
    const key = `${cx},${cy},${t}`;
    if (lastPaintRef.current === key) return;
    lastPaintRef.current = key;
    dirtyRef.current = true;
    setDef(d => {
      let objects = d.objects.filter(o => !(o.x === cx && o.y === cy));
      if (t !== 'eraser') {
        if (t === 'spawn' || t === 'flag') objects = objects.filter(o => o.type !== t);
        objects = [...objects, { type: t, x: cx, y: cy }];
      }
      return { ...d, objects };
    });
  }, []);

  const cellFromEvent = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * VIEW_W + viewRef.current.x;
    const wy = ((e.clientY - r.top) / r.height) * VIEW_H + viewRef.current.y;
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE) };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (modeRef.current !== 'design' || e.button !== 0) return;
    const c = cellFromEvent(e);
    if (!c) return;
    paintingRef.current = true;
    lastPaintRef.current = '';
    placeAt(c.x, c.y, toolRef.current);
  }, [cellFromEvent, placeAt]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (modeRef.current !== 'design') return;
    const c = cellFromEvent(e);
    if (!c) return;
    hoverRef.current = { ...c, tool: toolRef.current };
    if (paintingRef.current) placeAt(c.x, c.y, toolRef.current);
  }, [cellFromEvent, placeAt]);

  const onMouseUp = useCallback(() => { paintingRef.current = false; }, []);
  const onMouseLeave = useCallback(() => { paintingRef.current = false; hoverRef.current = null; }, []);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (modeRef.current !== 'design') return;
    const c = cellFromEvent(e);
    if (!c) return;
    lastPaintRef.current = '';
    placeAt(c.x, c.y, 'eraser');
  }, [cellFromEvent, placeAt]);

  // ── Mode switching ──────────────────────────────────────────────────────────
  const enterPlay = useCallback(() => {
    const rules = compileScripts(defRef.current.scripts);
    rulesRef.current = rules;
    setKeysUnwired(rules.keys.length === 0);
    stateRef.current = initGame(defRef.current, rules);
    particlesRef.current = [];
    inputRef.current = emptyInput();
    setStatus('playing');
    setMode('play');
  }, []);

  const enterDesign = useCallback(() => {
    stateRef.current = null;
    particlesRef.current = [];
    setMode('design');
  }, []);

  const enterCode = useCallback(() => {
    stateRef.current = null;
    particlesRef.current = [];
    setMode('code');
  }, []);

  const restart = useCallback(() => {
    stateRef.current = initGame(defRef.current, rulesRef.current);
    particlesRef.current = [];
    inputRef.current = emptyInput();
    setStatus('playing');
  }, []);

  // ── Keyboard (play mode only) ───────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (modeRef.current === 'design') {
        // arrows/WASD pan the editor view on big levels
        const pan: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
          a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1],
        };
        const p = pan[e.key] ?? pan[e.key.toLowerCase()];
        if (p) {
          e.preventDefault();
          viewRef.current.x += p[0] * TILE * 2;
          viewRef.current.y += p[1] * TILE * 2;
          clampView();
        }
        return;
      }
      if (modeRef.current !== 'play') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      const k = KEY_LOOKUP[e.key] ?? KEY_LOOKUP[e.key.toLowerCase()];
      if (k) inputRef.current[k] = true;
      if (e.key === 'r' && stateRef.current?.status !== 'playing') restart();
    };
    const up = (e: KeyboardEvent) => {
      const k = KEY_LOOKUP[e.key] ?? KEY_LOOKUP[e.key.toLowerCase()];
      if (k) inputRef.current[k] = false;
    };
    // If the window loses focus mid-run we never get the keyup — clear held keys
    const blur = () => {
      inputRef.current = emptyInput();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [restart, clampView]);

  // ── Render / game loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gate !== 'open') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;

    const playSoundThrottled = (name: keyof typeof SOUND_FN, now: number) => {
      if ((lastSoundRef.current[name] ?? 0) > now - 120) return;
      lastSoundRef.current[name] = now;
      SOUND_FN[name]();
    };

    const loop = (now: number) => {
      const dt = Math.min(now - (lastTimeRef.current || now), 50);
      lastTimeRef.current = now;

      if (modeRef.current === 'design' || modeRef.current === 'code') {
        clampView();
        renderDesign(ctx, defRef.current, now, modeRef.current === 'design' ? hoverRef.current : null, viewRef.current);
      } else {
        const s = stateRef.current;
        if (s) {
          const events = stepGame(s, inputRef.current, dt, rulesRef.current);
          for (const ev of events) {
            const px = ev.x * TILE, py = ev.y * TILE;
            if (ev.type === 'jump') {
              playMove();
            } else if (ev.type === 'sound' && ev.sound) {
              playSoundThrottled(ev.sound, now);
            } else if (ev.type === 'needScore') {
              playBump();
              particlesRef.current = [...particlesRef.current, ...spawnParticles(px, py, '#FFD54A', 6)];
            } else if (ev.type === 'poof') {
              particlesRef.current = [...particlesRef.current, ...spawnParticles(px, py, '#FFD54A', 10)];
            } else if (ev.type === 'hurt' || ev.type === 'lose') {
              playBump();
              particlesRef.current = [...particlesRef.current, ...spawnParticles(px, py, '#EF4444')];
              if (ev.type === 'lose') setStatus('lost');
            } else if (ev.type === 'win') {
              playWin();
              particlesRef.current = [...particlesRef.current, ...spawnConfetti(px, py, CONFETTI)];
              setStatus('won');
              // Beating your own level marks the arcade draft complete
              if (userId) {
                fetch('/api/progress', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tool: 'arcade-lab', level_idx: 0, challenge_idx: slotRef.current, completed: true, saved_code: JSON.stringify(defRef.current) }),
                });
              }
            }
          }
          renderGame(ctx, defRef.current, s, now, botRef.current);
        }
      }

      particlesRef.current = updateParticles(particlesRef.current, dt);
      const off = modeRef.current === 'play' && stateRef.current
        ? cameraFor(defRef.current, stateRef.current)
        : viewRef.current;
      ctx.save();
      ctx.translate(-off.x, -off.y);
      renderParticles(ctx, particlesRef.current, TILE);
      ctx.restore();

      // minimap (rendered when the level is bigger than one screen)
      const mini = miniCanvasRef.current;
      if (mini) {
        const mctx = mini.getContext('2d')!;
        renderMinimap(
          mctx, defRef.current, off, mini.width, mini.height,
          modeRef.current === 'play' && stateRef.current
            ? { x: stateRef.current.player.x, y: stateRef.current.player.y }
            : undefined,
        );
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // `mode` is a dep because the canvas unmounts in code mode — the loop must
    // re-bind to the freshly mounted canvas element on every mode switch
  }, [userId, gate, mode, clampView]);

  const toggleMute = useCallback(() => {
    setMutedState(m => { setMuted(!m); return !m; });
  }, []);

  const loadDemo = useCallback(() => {
    if (!confirm('Replace your level with the demo level "Crystal Canyon"? Your current design will be overwritten.')) return;
    dirtyRef.current = true;
    setDef({ ...DEMO_LEVEL, title: 'Crystal Canyon (my copy)', scripts: { ...DEMO_LEVEL.scripts } });
    viewRef.current = { x: 0, y: 0 };
  }, []);

  const newLevel = useCallback((shape: LevelShape) => {
    const s = LEVEL_SHAPES[shape];
    if (!confirm(`Start a fresh ${s.label} level? (${s.blurb}.) Your current design will be replaced — your code blocks are kept.`)) return;
    dirtyRef.current = true;
    const fresh = starterLevel(shape);
    setDef(d => ({ ...fresh, title: d.title, backdrop: d.backdrop, scripts: d.scripts }));
    focusSpawn(fresh);
  }, [focusSpawn]);

  // Minimap: click or drag to jump the editor view
  const miniNav = useCallback((e: React.MouseEvent) => {
    if (modeRef.current !== 'design') return;
    const mini = miniCanvasRef.current;
    if (!mini) return;
    const r = mini.getBoundingClientRect();
    const d = defRef.current;
    const scale = Math.min(mini.width / (d.cols * TILE), mini.height / (d.rows * TILE));
    const fx = mini.width / r.width;
    viewRef.current.x = ((e.clientX - r.left) * fx) / scale - VIEW_W / 2;
    viewRef.current.y = ((e.clientY - r.top) * fx) / scale - VIEW_H / 2;
    clampView();
  }, [clampView]);

  const setScriptXml = useCallback((o: ScriptOwner, xml: string) => {
    dirtyRef.current = true;
    setDef(d => ({ ...d, scripts: { ...d.scripts, [o]: xml } }));
  }, []);

  // ── Publish to the Class Arcade ─────────────────────────────────────────────
  const publishGame = useCallback(async () => {
    setPublish({ state: 'busy' });
    try {
      const res = await fetch('/api/arcade/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: defRef.current.title, data: defRef.current, bot: botRef.current, slot: slotRef.current }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) setPublish({ state: 'done' });
      else setPublish({ state: 'error', msg: data?.message ?? 'Publish failed — try again.' });
    } catch {
      setPublish({ state: 'error', msg: 'Publish failed — check your connection.' });
    }
  }, []);

  const publishUI = (
    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button onClick={publishGame} disabled={publish.state === 'busy' || !playable}
        title={playable ? 'Share this game to your class arcade (republishing replaces your old game and resets its leaderboard)' : 'Your level needs a Start and a Goal first'}
        style={{ padding: '7px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12,
          background: '#FFD54A', color: '#0f172a', border: 'none',
          cursor: publish.state === 'busy' || !playable ? 'not-allowed' : 'pointer', opacity: publish.state === 'busy' ? 0.6 : 1 }}>
        {publish.state === 'busy' ? 'Publishing…' : '🚀 Publish'}
      </button>
      {publish.state === 'done' && (
        <Link href="/tools/arcade-lab/arcade" style={{ fontSize: 12, fontWeight: 800, color: '#4ade80', textDecoration: 'none' }}>
          ✓ In the arcade — see it →
        </Link>
      )}
      {publish.state === 'error' && (
        <span style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>{publish.msg}</span>
      )}
    </span>
  );

  if (gate !== 'open') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
        <SiteHeader />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {gate === 'locked' && (
            <div style={{ ...CARD, padding: '48px 44px', textAlign: 'center', maxWidth: 460 }}>
              <div style={{ fontSize: 56 }}>🔒</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: '12px 0 8px' }}>Free Build is locked</h2>
              {gateReason === 'teacher' ? (
                <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 24px' }}>
                  Your teacher has locked Free Build for now. Check back once it&apos;s been opened.
                </p>
              ) : (
                <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, margin: '0 0 24px' }}>
                  Finish the <strong style={{ color: '#cbd5e1' }}>Game Coder Missions</strong> to earn the full game studio — every block you learn there is a tool you get to keep.
                </p>
              )}
              <Link href={gateReason === 'teacher' ? '/tools/arcade-lab' : '/tools/arcade-lab/missions'} style={{ display: 'inline-block', padding: '12px 28px', background: '#7C3AED', color: '#fff', borderRadius: 12, fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>
                {gateReason === 'teacher' ? '← Back to Arcade Lab' : '🎓 Go to Missions →'}
              </Link>
            </div>
          )}
        </main>
      </div>
    );
  }

  const coinsPlaced = def.objects.filter(o => o.type === 'coin').length;
  const stateNow = stateRef.current;
  const ownerInfo = OWNERS.find(o => o.owner === owner)!;

  const SEG = (active: boolean): React.CSSProperties => ({
    padding: '9px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', border: 'none',
    background: active ? '#7C3AED' : 'rgba(255,255,255,0.06)',
    color: active ? '#fff' : '#94a3b8', transition: 'all 130ms',
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: VIEW_W + 200, margin: '0 auto', padding: '24px 32px' }}>

          {/* Header */}
          <div style={{ ...CARD, padding: '14px 22px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/tools/arcade-lab" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Arcade Lab</Link>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#e2e8f0', margin: 0 }}>🛠️ Free Build</h1>

              {/* Mode toggle */}
              <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)', marginLeft: 'auto' }}>
                <button style={SEG(mode === 'design')} onClick={enterDesign}>🔨 Design</button>
                <button style={SEG(mode === 'code')} onClick={enterCode}>🧩 Code</button>
                <button style={SEG(mode === 'play')} onClick={enterPlay} disabled={!playable}
                  title={playable ? 'Test your game' : `Your level needs ${!hasSpawn ? 'a Start' : ''}${!hasSpawn && !hasFlag ? ' and ' : ''}${!hasFlag ? 'a Goal flag' : ''}`}>
                  ▶ Play{!playable ? ' 🔒' : ''}
                </button>
              </div>
              <button onClick={toggleMute}
                style={{ padding: '8px 12px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                {muted ? '🔇' : '🔊'}
              </button>
            </div>

            {/* Sub-header per mode */}
            {mode === 'design' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
                <input
                  value={def.title}
                  maxLength={40}
                  onChange={e => { dirtyRef.current = true; setDef(d => ({ ...d, title: e.target.value })); }}
                  placeholder="Name your level…"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, padding: '8px 14px', fontSize: 14, fontWeight: 700, color: '#e2e8f0', width: 240, outline: 'none' }}
                />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Backdrop:</span>
                  {BACKDROPS.map(b => (
                    <button key={b.id} onClick={() => { dirtyRef.current = true; setDef(d => ({ ...d, backdrop: b.id })); }}
                      title={b.label}
                      style={{ width: 42, height: 28, borderRadius: 8, cursor: 'pointer', background: b.swatch,
                        border: def.backdrop === b.id ? '2.5px solid #FFD54A' : '2px solid rgba(255,255,255,0.2)' }} />
                  ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button onClick={openLevels}
                    style={{ padding: '7px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12, background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.4)', cursor: 'pointer' }}>
                    📁 My Levels · slot {slot + 1}
                  </button>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {userId ? (synced ? '☁️ Saved to your account' : dirtyRef.current ? '💾 Saving…' : '💾 Saved') : '💾 Saved on this device'}
                  </span>
                </div>
              </div>
            )}
            {mode === 'code' && (
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
                <strong style={{ color: '#e2e8f0' }}>These blocks ARE your game&apos;s rules.</strong> Nothing is automatic —
                if the jump key isn&apos;t wired, the player can&apos;t jump. Pick an object on the left and write its rules.
              </div>
            )}
            {mode === 'play' && (
              <>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 8 }}>
                  Testing <strong style={{ color: '#e2e8f0' }}>{def.title || 'Untitled level'}</strong> with YOUR rules — can you beat your own game?
                  {keysUnwired && (
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}> ⚠ No keys are wired — the player can&apos;t move! Go to 🧩 Code → Player.</span>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <RuleSummary rules={rulesRef.current} />
                </div>
              </>
            )}
          </div>

          {/* My Levels modal */}
          {showLevels && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setShowLevels(false)}>
              <div style={{ ...CARD, padding: '22px 26px', width: 460, maxWidth: '92%' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0', margin: 0 }}>📁 My Levels</h2>
                  <button onClick={() => setShowLevels(false)}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#64748b', fontSize: 18, fontWeight: 900, cursor: 'pointer' }}>✕</button>
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 14px' }}>
                  Six save slots. Each slot is its own level — design, code, and all.
                </p>
                {slotsMeta === null ? (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#64748b', fontWeight: 600, fontSize: 13 }}>Loading…</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {slotsMeta.map((meta, i) => {
                      const current = i === slot;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
                          background: current ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.04)',
                          border: current ? '2px solid #7C3AED' : '1px solid rgba(255,255,255,0.1)' }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', width: 18 }}>{i + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: meta ? '#e2e8f0' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {meta ? meta.title : 'Empty slot'}
                            </div>
                            {meta && <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{meta.shape}</div>}
                          </div>
                          {current ? (
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#c4b5fd' }}>Editing now</span>
                          ) : (
                            <>
                              <button onClick={() => loadSlot(i)}
                                style={{ padding: '6px 14px', borderRadius: 8, fontWeight: 800, fontSize: 12, background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                {meta ? 'Open' : 'Start here'}
                              </button>
                              <button onClick={() => copyCurrentTo(i)} title="Copy the level you're editing into this slot"
                                style={{ padding: '6px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                                ⧉ Copy
                              </button>
                            </>
                          )}
                          {meta && (
                            <button onClick={() => deleteSlot(i)} title="Delete this level"
                              style={{ padding: '6px 10px', borderRadius: 8, fontWeight: 700, fontSize: 12, background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}>
                              🗑
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Work area */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

            {/* Design palette */}
            {mode === 'design' && (
              <div style={{ ...CARD, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {PALETTE.map(p => (
                  <button key={p.tool} onClick={() => setTool(p.tool)} title={p.hint}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', width: 130, textAlign: 'left',
                      background: tool === p.tool ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.05)',
                      border: tool === p.tool ? '2px solid #7C3AED' : '2px solid transparent',
                      color: tool === p.tool ? '#e2e8f0' : '#94a3b8', fontSize: 13, fontWeight: 700 }}>
                    <span style={{ fontSize: 18 }}>{p.icon}</span>{p.label}
                  </button>
                ))}
              </div>
            )}

            {/* Code rail */}
            {mode === 'code' && (
              <div style={{ ...CARD, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {OWNERS.map(o => (
                  <button key={o.owner} onClick={() => setOwner(o.owner)} title={o.hint}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', width: 130, textAlign: 'left',
                      background: owner === o.owner ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.05)',
                      border: owner === o.owner ? '2px solid #7C3AED' : '2px solid transparent',
                      color: owner === o.owner ? '#e2e8f0' : '#94a3b8', fontSize: 13, fontWeight: 700 }}>
                    <span style={{ fontSize: 18 }}>{o.icon}</span>{o.label}
                  </button>
                ))}
              </div>
            )}

            {/* Canvas (design/play) or Blockly (code) */}
            {mode !== 'code' ? (
              <div style={{ position: 'relative' }}>
                <style>{`
                  @keyframes arcade-banner-in {
                    from { transform: translateY(14px) scale(0.92); opacity: 0; }
                    to { transform: translateY(0) scale(1); opacity: 1; }
                  }
                `}</style>
                <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H}
                  onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
                  onMouseLeave={onMouseLeave} onContextMenu={onContextMenu}
                  style={{ display: 'block', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', maxWidth: '100%',
                    cursor: mode === 'design' ? 'crosshair' : 'default' }} />

                {isBigLevel && (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                    <canvas ref={miniCanvasRef} width={miniW} height={miniH}
                      onMouseDown={e => { miniDragRef.current = true; miniNav(e); }}
                      onMouseMove={e => { if (miniDragRef.current) miniNav(e); }}
                      onMouseUp={() => { miniDragRef.current = false; }}
                      onMouseLeave={() => { miniDragRef.current = false; }}
                      title={mode === 'design' ? 'Click or drag to move the view' : 'Level map'}
                      style={{ display: 'block', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)',
                        cursor: mode === 'design' ? 'pointer' : 'default' }} />
                  </div>
                )}

                {mode === 'play' && status !== 'playing' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', borderRadius: 14 }}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: '26px 38px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', animation: 'arcade-banner-in 300ms ease-out both' }}>
                      <div style={{ fontSize: 50 }}>{status === 'won' ? '🏆' : '💀'}</div>
                      <div style={{ fontSize: 23, fontWeight: 900, color: '#1f2937', marginTop: 6 }}>
                        {status === 'won' ? 'Level beaten!' : 'Game over!'}
                      </div>
                      <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                        {status === 'won'
                          ? `⏱ ${((stateNow?.timeMs ?? 0) / 1000).toFixed(2)}s — Crystals: ${stateNow?.score ?? 0} / ${stateNow?.coinsTotal ?? 0}${stateNow && stateNow.score === stateNow.coinsTotal && stateNow.coinsTotal > 0 ? ' — all of them!' : ''}`
                          : 'Tweak the design or the rules and try again.'}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
                        <button onClick={restart}
                          style={{ padding: '10px 22px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                          ↺ Play Again (R)
                        </button>
                        <button onClick={enterDesign}
                          style={{ padding: '10px 22px', background: 'rgba(0,0,0,0.08)', color: '#374151', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                          🔨 Design
                        </button>
                        <button onClick={enterCode}
                          style={{ padding: '10px 22px', background: 'rgba(0,0,0,0.08)', color: '#374151', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                          🧩 Code
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...CARD, flex: 1, height: VIEW_H, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', fontSize: 13, fontWeight: 700, color: '#cbd5e1', flexShrink: 0 }}>
                  {ownerInfo.icon} {ownerInfo.label} rules — <span style={{ color: '#94a3b8', fontWeight: 600 }}>{ownerInfo.hint}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <ArcadeWorkspace
                    key={owner}
                    owner={owner}
                    xml={def.scripts[owner] ?? ''}
                    onXmlChange={xml => setScriptXml(owner, xml)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer bar */}
          <div style={{ ...CARD, padding: '12px 20px', marginTop: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {mode === 'design' && (
              <>
                <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                  💡 Test with ▶ Play — a good level <strong style={{ color: '#cbd5e1' }}>can be beaten</strong>.
                  {isBigLevel ? ' Arrow keys pan the view; click the map below to jump.' : ' Use crystals to show players the way.'}
                  {coinsPlaced > 0 && ` (${coinsPlaced} crystal${coinsPlaced === 1 ? '' : 's'} placed)`}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                  {publishUI}
                  <button onClick={loadDemo}
                    style={{ padding: '7px 14px', borderRadius: 10, fontWeight: 700, fontSize: 12, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                    📦 Demo
                  </button>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>New:</span>
                  {(Object.keys(LEVEL_SHAPES) as LevelShape[]).map(sh => (
                    <button key={sh} onClick={() => newLevel(sh)} title={LEVEL_SHAPES[sh].blurb}
                      style={{ padding: '7px 12px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                        background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.4)', cursor: 'pointer' }}>
                      {sh === 'classic' ? '⬜' : sh === 'long' ? '↔️' : '↕️'} {LEVEL_SHAPES[sh].label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {mode === 'code' && (
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                🧪 Try experiments: lock your goal with <strong style={{ color: '#cbd5e1' }}>&quot;when the player touches me with at least 5 ✦&quot;</strong> on the Goal sheet…
                make crystals worth <strong style={{ color: '#cbd5e1' }}>-1</strong>… add <strong style={{ color: '#cbd5e1' }}>&quot;when the score reaches 5 → win&quot;</strong> for a flag-free victory!
              </span>
            )}
            {mode === 'play' && (
              <>
                <button onClick={restart}
                  style={{ padding: '7px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                  ↺ Restart
                </button>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  Beat it yourself, then share it:
                </span>
                <span style={{ marginLeft: 'auto' }}>{publishUI}</span>
              </>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

// useSearchParams requires a Suspense boundary in the app router
export default function ArcadeCreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateInner />
    </Suspense>
  );
}
