'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import SiteHeader from '@/app/components/SiteHeader';
import {
  Backdrop, CompiledRules, GameDef, ObjectType, ScriptOwner,
  TILE, COLS, ROWS, emptyRules,
} from '../engine/types';
import { initGame, stepGame, emptyInput, GameState, InputState, KEY_LOOKUP } from '../engine/physics';
import { renderGame, renderDesign, DesignHover } from '../engine/render';
import { compileScripts } from '../engine/blocks';
import { BotConfig, defaultBot, loadBotLocal, fetchCloudBot } from '../engine/bot';
import ArcadeWorkspace from '../components/ArcadeWorkspace';
import {
  ARCADE_MISSIONS, ARCADE_QUIZ, ArcadeMission, ArcadeUnitProgress,
  checkCapstone, checkRequirements, emptyUnitProgress,
  loadUnitProgress, loadCloudUnitProgress, mergeUnitProgress, saveUnitProgress, syncUnitToCloud,
} from '../unit';
import {
  Particle, renderParticles, spawnConfetti, spawnParticles, updateParticles,
} from '../../block-lab/engine/mazeRenderer';
import { isMuted, setMuted, playBump, playCollect, playMove, playStomp, playWin, playZap } from '../../block-lab/engine/sfx';

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

const CONFETTI = ['#FFD54A', '#4C8DFF', '#22C55E', '#FF6BD6', '#7DF9FF'];
const SOUND_FN = { chime: playCollect, pop: playStomp, thud: playBump, zap: playZap } as const;

const CONCEPTS = [
  'Events & keys', 'More events', 'Scoring rules', 'Danger rules', 'Two-hat enemies',
  'Chain reactions', 'Difficulty tuning', 'Debugging', 'Level design', 'Capstone',
];

const OWNERS: { owner: ScriptOwner; icon: string; label: string }[] = [
  { owner: 'player', icon: '🤖', label: 'Player' },
  { owner: 'coin',   icon: '🪙', label: 'Crystal' },
  { owner: 'spike',  icon: '🔺', label: 'Spikes' },
  { owner: 'enemy',  icon: '👾', label: 'Enemy' },
  { owner: 'flag',   icon: '🚩', label: 'Goal' },
  { owner: 'game',   icon: '🎮', label: 'Game' },
];

type Tool = ObjectType | 'eraser';
const PALETTE: { tool: Tool; icon: string; label: string }[] = [
  { tool: 'platform', icon: '🧱', label: 'Block' },
  { tool: 'coin',     icon: '🪙', label: 'Crystal' },
  { tool: 'spike',    icon: '🔺', label: 'Spikes' },
  { tool: 'enemy',    icon: '👾', label: 'Enemy' },
  { tool: 'flag',     icon: '🚩', label: 'Goal' },
  { tool: 'spawn',    icon: '🤖', label: 'Start' },
  { tool: 'eraser',   icon: '🧽', label: 'Eraser' },
];

function missionKey(ci: number) { return `arcade_mission_${ci}`; }

function buildMissionDef(m: ArcadeMission): GameDef {
  return {
    title: m.title, backdrop: m.backdrop, cols: COLS, rows: ROWS,
    objects: m.objects.map(o => ({ ...o })),
    scripts: { ...m.scripts },
  };
}

function loadMissionDef(ci: number, m: ArcadeMission): GameDef {
  try {
    const raw = localStorage.getItem(missionKey(ci));
    if (raw) {
      const parsed = JSON.parse(raw);
      // Title acts as a version stamp: a redesigned mission discards stale saves
      if (Array.isArray(parsed?.objects) && parsed?.cols === COLS && parsed?.scripts && parsed?.title === m.title) {
        return parsed as GameDef;
      }
    }
  } catch { /* ignore */ }
  return buildMissionDef(m);
}

function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}

// ─── Mission view ─────────────────────────────────────────────────────────────

type MissionMode = 'code' | 'design' | 'play';

function MissionView({ ci, onSuccess, onBack, onNext, isComplete, isLast }: {
  ci: number;
  onSuccess: () => void;
  onBack: () => void;
  onNext: () => void;
  isComplete: boolean;
  isLast: boolean;
}) {
  const mission = ARCADE_MISSIONS[ci];
  const canCode = mission.editableOwners.length > 0;
  const canDesign = mission.designEditable;

  const [def, setDef] = useState<GameDef>(() =>
    typeof window === 'undefined' ? buildMissionDef(mission) : loadMissionDef(ci, mission));
  const [mode, setMode] = useState<MissionMode>(canCode ? 'code' : 'design');
  const [owner, setOwner] = useState<ScriptOwner>(mission.editableOwners[0] ?? 'player');
  const [tool, setTool] = useState<Tool>('platform');
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [outcome, setOutcome] = useState<null | { success: boolean; missing: string[] }>(null);
  const [muted, setMutedState] = useState(() => (typeof window === 'undefined' ? false : isMuted()));
  const [missingLive, setMissingLive] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
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
  const botRef = useRef<BotConfig>(defaultBot());

  useEffect(() => {
    const local = loadBotLocal();
    if (local) { botRef.current = local; return; }
    fetchCloudBot().then(c => { if (c) botRef.current = c; });
  }, []);

  defRef.current = def;
  modeRef.current = mode;
  toolRef.current = tool;

  const canvasW = COLS * TILE;
  const canvasH = ROWS * TILE;

  // Persist mission work + live requirement checklist (debounced)
  useEffect(() => {
    try { localStorage.setItem(missionKey(ci), JSON.stringify(def)); } catch { /* ignore */ }
    const timer = setTimeout(() => {
      const missing = [
        ...checkRequirements(compileScripts(def.scripts), mission.requirements),
        ...(mission.capstone ? checkCapstone(def, mission.capstone) : []),
      ];
      setMissingLive(missing);
    }, 400);
    return () => clearTimeout(timer);
  }, [def, ci, mission]);

  // ── Design editing (only for design-editable missions) ──
  const placeAt = useCallback((cx: number, cy: number, t: Tool) => {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    const key = `${cx},${cy},${t}`;
    if (lastPaintRef.current === key) return;
    lastPaintRef.current = key;
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
    return {
      x: Math.floor(((e.clientX - r.left) / r.width) * COLS),
      y: Math.floor(((e.clientY - r.top) / r.height) * ROWS),
    };
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (modeRef.current !== 'design' || !canDesign || e.button !== 0) return;
    const c = cellFromEvent(e);
    if (!c) return;
    paintingRef.current = true;
    lastPaintRef.current = '';
    placeAt(c.x, c.y, toolRef.current);
  }, [cellFromEvent, placeAt, canDesign]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (modeRef.current !== 'design' || !canDesign) return;
    const c = cellFromEvent(e);
    if (!c) return;
    hoverRef.current = { ...c, tool: toolRef.current };
    if (paintingRef.current) placeAt(c.x, c.y, toolRef.current);
  }, [cellFromEvent, placeAt, canDesign]);

  const onMouseUp = useCallback(() => { paintingRef.current = false; }, []);
  const onMouseLeave = useCallback(() => { paintingRef.current = false; hoverRef.current = null; }, []);
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (modeRef.current !== 'design' || !canDesign) return;
    const c = cellFromEvent(e);
    if (!c) return;
    lastPaintRef.current = '';
    placeAt(c.x, c.y, 'eraser');
  }, [cellFromEvent, placeAt, canDesign]);

  // ── Modes ──
  const enterPlay = useCallback(() => {
    rulesRef.current = compileScripts(defRef.current.scripts);
    stateRef.current = initGame(defRef.current, rulesRef.current);
    particlesRef.current = [];
    inputRef.current = emptyInput();
    setStatus('playing');
    setOutcome(null);
    setMode('play');
  }, []);

  const enterCode = useCallback(() => { stateRef.current = null; setOutcome(null); setMode('code'); }, []);
  const enterDesign = useCallback(() => { stateRef.current = null; setOutcome(null); setMode('design'); }, []);

  const restart = useCallback(() => {
    stateRef.current = initGame(defRef.current, rulesRef.current);
    particlesRef.current = [];
    inputRef.current = emptyInput();
    setStatus('playing');
    setOutcome(null);
  }, []);

  const resetMission = useCallback(() => {
    if (!confirm('Reset this mission to its starting state? Your changes here will be lost.')) return;
    try { localStorage.removeItem(missionKey(ci)); } catch { /* ignore */ }
    setDef(buildMissionDef(mission));
    stateRef.current = null;
    setOutcome(null);
    setMode(canCode ? 'code' : 'design');
  }, [ci, mission, canCode]);

  // ── Keyboard ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (modeRef.current !== 'play') return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      const k = KEY_LOOKUP[e.key] ?? KEY_LOOKUP[e.key.toLowerCase()];
      if (k) inputRef.current[k] = true;
    };
    const up = (e: KeyboardEvent) => {
      const k = KEY_LOOKUP[e.key] ?? KEY_LOOKUP[e.key.toLowerCase()];
      if (k) inputRef.current[k] = false;
    };
    const blur = () => { inputRef.current = emptyInput(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // ── Game loop ──
  useEffect(() => {
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

      if (modeRef.current !== 'play') {
        renderDesign(ctx, defRef.current, now, modeRef.current === 'design' && canDesign ? hoverRef.current : null, { x: 0, y: 0 });
      } else {
        const s = stateRef.current;
        if (s) {
          const events = stepGame(s, inputRef.current, dt, rulesRef.current);
          for (const ev of events) {
            const px = ev.x * TILE, py = ev.y * TILE;
            if (ev.type === 'jump') playMove();
            else if (ev.type === 'sound' && ev.sound) playSoundThrottled(ev.sound, now);
            else if (ev.type === 'poof') {
              particlesRef.current = [...particlesRef.current, ...spawnParticles(px, py, '#FFD54A', 10)];
            } else if (ev.type === 'hurt' || ev.type === 'lose') {
              playBump();
              particlesRef.current = [...particlesRef.current, ...spawnParticles(px, py, '#EF4444')];
              if (ev.type === 'lose') setStatus('lost');
            } else if (ev.type === 'win') {
              const missing = [
                ...checkRequirements(rulesRef.current, mission.requirements),
                ...(mission.capstone ? checkCapstone(defRef.current, mission.capstone) : []),
              ];
              const success = missing.length === 0;
              if (success) {
                playWin();
                particlesRef.current = [...particlesRef.current, ...spawnConfetti(px, py, CONFETTI)];
                onSuccess();
              } else {
                playCollect();
              }
              setStatus('won');
              setOutcome({ success, missing });
            }
          }
          renderGame(ctx, defRef.current, s, now, botRef.current);
        }
      }

      particlesRef.current = updateParticles(particlesRef.current, dt);
      renderParticles(ctx, particlesRef.current, TILE);
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // `mode` is a dep because the canvas unmounts in code mode — the loop must
    // re-bind to the freshly mounted canvas element on every mode switch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ci, mode]);

  const toggleMute = useCallback(() => {
    setMutedState(m => { setMuted(!m); return !m; });
  }, []);

  const SEG = (active: boolean, enabled = true): React.CSSProperties => ({
    padding: '9px 18px', fontSize: 14, fontWeight: 800, cursor: enabled ? 'pointer' : 'not-allowed', border: 'none',
    background: active ? '#7C3AED' : 'rgba(255,255,255,0.06)',
    color: active ? '#fff' : enabled ? '#94a3b8' : '#475569', transition: 'all 130ms',
  });

  const checklist = [
    ...mission.requirements.map(r => ({ label: r.label, done: !missingLive.includes(r.label) })),
    ...(mission.capstone
      ? [
          { label: `Place at least ${mission.capstone.minCoins} crystals`, done: !missingLive.some(m => m.startsWith('Place at least') && m.includes('crystal')) },
          { label: 'Place at least 1 spike', done: !missingLive.some(m => m.includes('spike')) },
          { label: 'Place at least 1 enemy', done: !missingLive.some(m => m.includes('enem')) },
        ]
      : []),
    { label: 'Beat the level yourself', done: isComplete || outcome?.success === true },
  ];

  return (
    <SiteChrome>
      <div style={{ maxWidth: canvasW + 200, margin: '0 auto', padding: '20px 32px' }}>

        {/* Mission header */}
        <div style={{ ...CARD, padding: '14px 22px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Missions</button>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Mission {ci + 1}</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0' }}>{mission.title}</span>
            {isComplete && <span style={{ fontSize: 14 }}>✅</span>}

            <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)', marginLeft: 'auto' }}>
              {canDesign && <button style={SEG(mode === 'design')} onClick={enterDesign}>🔨 Design</button>}
              {canCode && <button style={SEG(mode === 'code')} onClick={enterCode}>🧩 Code</button>}
              <button style={SEG(mode === 'play')} onClick={enterPlay}>▶ Play</button>
            </div>
            <button onClick={resetMission} title="Reset mission"
              style={{ padding: '8px 12px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
              ↺
            </button>
            <button onClick={toggleMute}
              style={{ padding: '8px 12px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
              {muted ? '🔇' : '🔊'}
            </button>
          </div>

          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginTop: 10 }}>
            📋 {mission.brief}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>💡 {mission.hint}</span>
          </div>

          {/* Checklist */}
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {checklist.map((c, i) => (
              <span key={i} style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 14,
                background: c.done ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${c.done ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
                color: c.done ? '#4ade80' : '#94a3b8' }}>
                {c.done ? '✓' : '○'} {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Work area */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

          {/* Rails */}
          {mode === 'code' && (
            <div style={{ ...CARD, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              {OWNERS.map(o => {
                const editable = mission.editableOwners.includes(o.owner);
                const active = owner === o.owner;
                return (
                  <button key={o.owner} onClick={() => editable && setOwner(o.owner)}
                    title={editable ? undefined : 'Locked for this mission'}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
                      cursor: editable ? 'pointer' : 'not-allowed', width: 134, textAlign: 'left',
                      background: active ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.05)',
                      border: active ? '2px solid #7C3AED' : '2px solid transparent',
                      color: editable ? (active ? '#e2e8f0' : '#94a3b8') : '#475569',
                      opacity: editable ? 1 : 0.6, fontSize: 13, fontWeight: 700 }}>
                    <span style={{ fontSize: 18 }}>{o.icon}</span>{o.label}{!editable && ' 🔒'}
                  </button>
                );
              })}
            </div>
          )}
          {mode === 'design' && canDesign && (
            <div style={{ ...CARD, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              {PALETTE.map(p => (
                <button key={p.tool} onClick={() => setTool(p.tool)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', width: 134, textAlign: 'left',
                    background: tool === p.tool ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.05)',
                    border: tool === p.tool ? '2px solid #7C3AED' : '2px solid transparent',
                    color: tool === p.tool ? '#e2e8f0' : '#94a3b8', fontSize: 13, fontWeight: 700 }}>
                  <span style={{ fontSize: 18 }}>{p.icon}</span>{p.label}
                </button>
              ))}
            </div>
          )}

          {/* Canvas or workspace */}
          {mode !== 'code' ? (
            <div style={{ position: 'relative' }}>
              <style>{`
                @keyframes arcade-banner-in {
                  from { transform: translateY(14px) scale(0.92); opacity: 0; }
                  to { transform: translateY(0) scale(1); opacity: 1; }
                }
              `}</style>
              <canvas ref={canvasRef} width={canvasW} height={canvasH}
                onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave} onContextMenu={onContextMenu}
                style={{ display: 'block', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', maxWidth: '100%',
                  cursor: mode === 'design' && canDesign ? 'crosshair' : 'default' }} />

              {mode === 'play' && status !== 'playing' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', borderRadius: 14 }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: '26px 38px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', animation: 'arcade-banner-in 300ms ease-out both', maxWidth: '85%' }}>
                    {status === 'lost' ? (
                      <>
                        <div style={{ fontSize: 50 }}>💀</div>
                        <div style={{ fontSize: 23, fontWeight: 900, color: '#1f2937', marginTop: 6 }}>Game over!</div>
                        <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Adjust your fix and try again.</div>
                        <button onClick={restart}
                          style={{ marginTop: 16, padding: '10px 26px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                          ↺ Try Again
                        </button>
                      </>
                    ) : outcome?.success ? (
                      <>
                        <div style={{ fontSize: 50 }}>🏆</div>
                        <div style={{ fontSize: 23, fontWeight: 900, color: '#1f2937', marginTop: 6 }}>Mission complete!</div>
                        <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                          ⏱ {((stateRef.current?.timeMs ?? 0) / 1000).toFixed(2)}s — you fixed the game AND beat it. That&apos;s real programming.
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
                          <button onClick={onNext}
                            style={{ padding: '10px 24px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                            {isLast ? 'Take the Quiz →' : 'Next Mission →'}
                          </button>
                          <button onClick={restart}
                            style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.08)', color: '#374151', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                            ↺ Play Again
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 50 }}>🧐</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#1f2937', marginTop: 6 }}>You won the round — but the mission isn&apos;t done:</div>
                        <ul style={{ textAlign: 'left', margin: '10px auto 0', fontSize: 13, color: '#6b7280', maxWidth: 380 }}>
                          {outcome?.missing.map((m, i) => <li key={i}>{m}</li>)}
                        </ul>
                        <button onClick={canCode ? enterCode : enterDesign}
                          style={{ marginTop: 16, padding: '10px 26px', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                          {canCode ? '🧩 Back to Code' : '🔨 Back to Design'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...CARD, flex: 1, height: canvasH, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', fontSize: 13, fontWeight: 700, color: '#cbd5e1', flexShrink: 0 }}>
                {OWNERS.find(o => o.owner === owner)?.icon} {OWNERS.find(o => o.owner === owner)?.label} rules
              </div>
              <div style={{ flex: 1 }}>
                <ArcadeWorkspace
                  key={`${ci}_${owner}`}
                  owner={owner}
                  xml={def.scripts[owner] ?? ''}
                  onXmlChange={xml => setDef(d => ({ ...d, scripts: { ...d.scripts, [owner]: xml } }))}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

function QuizView({ onDone }: { onDone: (score: number) => void }) {
  const [answers, setAnswers] = useState<(number | null)[]>(ARCADE_QUIZ.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const [order] = useState<number[][]>(() => ARCADE_QUIZ.map(() => {
    const idx = [0, 1, 2, 3];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }));

  const score = submitted ? ARCADE_QUIZ.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0) : 0;

  return (
    <SiteChrome>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#7C3AED', padding: '18px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Arcade Lab Quiz</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>Game Coder Missions</div>
          </div>
          <div style={{ padding: '24px 28px' }}>
            {ARCADE_QUIZ.map((q, qi) => {
              const chosen = answers[qi];
              return (
                <div key={qi} style={{ marginBottom: 26 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', marginBottom: 10 }}>{qi + 1}. {q.question}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {order[qi].map(oi => {
                      const opt = q.options[oi];
                      const picked = chosen === oi;
                      const isCorrect = submitted && oi === q.answer;
                      const isWrong = submitted && picked && oi !== q.answer;
                      return (
                        <button key={oi} disabled={submitted}
                          onClick={() => setAnswers(prev => { const a = [...prev]; a[qi] = oi; return a; })}
                          style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: submitted ? 'default' : 'pointer', border: `2px solid ${isCorrect ? '#22c55e' : isWrong ? '#ef4444' : picked ? '#7C3AED' : 'rgba(255,255,255,0.15)'}`, background: isCorrect ? 'rgba(74,222,128,0.15)' : isWrong ? 'rgba(239,68,68,0.15)' : picked ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)', color: '#e2e8f0', transition: 'all 120ms' }}>
                          {opt}{isCorrect && ' ✓'}{isWrong && ' ✗'}
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', background: 'rgba(124,58,237,0.08)', borderRadius: 8, padding: '8px 12px', borderLeft: '4px solid #7C3AED' }}>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
            {!submitted ? (
              <button
                disabled={answers.some(a => a === null)}
                onClick={() => setSubmitted(true)}
                style={{ width: '100%', padding: '14px 0', background: answers.some(a => a === null) ? '#94a3b8' : '#7C3AED', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: answers.some(a => a === null) ? 'not-allowed' : 'pointer' }}>
                Submit Answers
              </button>
            ) : (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 40 }}>{score === ARCADE_QUIZ.length ? '🏆' : score >= 3 ? '🎉' : '📚'}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0' }}>{score} / {ARCADE_QUIZ.length}</div>
                </div>
                <button onClick={() => onDone(score)}
                  style={{ width: '100%', padding: '14px 0', background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                  {score >= 3 ? 'Continue →' : 'Try Again →'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

type Phase = { tag: 'list' } | { tag: 'mission'; ci: number } | { tag: 'quiz' } | { tag: 'complete'; score: number };

export default function ArcadeMissionsPage() {
  const { status: authStatus } = useSession();
  const [progress, setProgress] = useState<ArcadeUnitProgress>(emptyUnitProgress);
  const [phase, setPhase] = useState<Phase>({ tag: 'list' });
  const [quizAttempt, setQuizAttempt] = useState(0);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    if (authStatus === 'loading') return;
    const local = loadUnitProgress();
    setProgress(local);
    loadCloudUnitProgress().then(cloud => {
      const merged = mergeUnitProgress(local, cloud);
      setProgress(merged);
      saveUnitProgress(merged);
    });
  }, [authStatus]);

  const markComplete = useCallback((ci: number) => {
    const next: ArcadeUnitProgress = {
      ...progressRef.current,
      completed: { ...progressRef.current.completed, [ci]: true },
    };
    setProgress(next);
    saveUnitProgress(next);
    syncUnitToCloud(ci, true);
  }, []);

  const allMissionsDone = useMemo(
    () => ARCADE_MISSIONS.every((_, i) => progress.completed[i]),
    [progress],
  );

  if (phase.tag === 'mission') {
    const { ci } = phase;
    return (
      <MissionView
        key={ci}
        ci={ci}
        isComplete={!!progress.completed[ci]}
        isLast={ci === ARCADE_MISSIONS.length - 1}
        onSuccess={() => markComplete(ci)}
        onBack={() => setPhase({ tag: 'list' })}
        onNext={() => setPhase(ci === ARCADE_MISSIONS.length - 1 ? { tag: 'quiz' } : { tag: 'mission', ci: ci + 1 })}
      />
    );
  }

  if (phase.tag === 'quiz') {
    return (
      <QuizView key={quizAttempt} onDone={score => {
        const passed = score >= 3;
        if (passed) {
          const next: ArcadeUnitProgress = { ...progressRef.current, quizScore: score, unitComplete: true };
          setProgress(next);
          saveUnitProgress(next);
          syncUnitToCloud(null, true, score);
          setPhase({ tag: 'complete', score });
        } else {
          setQuizAttempt(a => a + 1); // remount QuizView fresh for the retake
        }
      }} />
    );
  }

  if (phase.tag === 'complete') {
    return (
      <SiteChrome>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '60px 32px', textAlign: 'center' }}>
          <div style={{ ...CARD, padding: '44px 36px' }}>
            <div style={{ fontSize: 60 }}>🎓</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#e2e8f0', margin: '10px 0 4px' }}>Game Coder — Certified!</div>
            <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 8 }}>Quiz score: {phase.score} / {ARCADE_QUIZ.length}</div>
            <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 26 }}>
              You wired controls, wrote rules, tuned difficulty, debugged broken code, and designed a level of your own.
              The full game studio is now yours.
            </p>
            <Link href="/tools/arcade-lab/create" style={{ display: 'block', padding: '14px 0', background: '#7C3AED', color: '#fff', borderRadius: 12, fontWeight: 800, fontSize: 16, textDecoration: 'none', marginBottom: 12 }}>
              🛠️ Enter Free Build →
            </Link>
            <button onClick={() => setPhase({ tag: 'list' })} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              ← Back to Missions
            </button>
          </div>
        </div>
      </SiteChrome>
    );
  }

  // ── Mission list ──
  return (
    <SiteChrome>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ ...CARD, padding: '18px 24px', marginBottom: 24 }}>
          <Link href="/tools/arcade-lab" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Arcade Lab</Link>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>🎓 Game Coder Missions</h1>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', margin: 0 }}>
            Every mission is a broken game. Fix the code (or the design), then prove it works by beating it yourself.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {ARCADE_MISSIONS.map((m, i) => {
            const done = !!progress.completed[i];
            const locked = i > 0 && !progress.completed[i - 1];
            return (
              <div key={i}
                onClick={() => !locked && setPhase({ tag: 'mission', ci: i })}
                style={{ ...CARD, width: 204, padding: 18, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.55 : 1, position: 'relative' }}>
                {done && <span style={{ position: 'absolute', top: 10, right: 12 }}>✅</span>}
                {locked && <span style={{ position: 'absolute', top: 10, right: 12 }}>🔒</span>}
                <div style={{ fontSize: 11, fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mission {i + 1}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#e2e8f0', margin: '3px 0 4px' }}>{m.title}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{CONCEPTS[i]}</div>
              </div>
            );
          })}

          {/* Quiz card */}
          <div
            onClick={() => allMissionsDone && setPhase({ tag: 'quiz' })}
            style={{ ...CARD, width: 204, padding: 18, cursor: allMissionsDone ? 'pointer' : 'not-allowed', opacity: allMissionsDone ? 1 : 0.55, position: 'relative', border: '1px solid rgba(124,58,237,0.5)' }}>
            {progress.unitComplete && <span style={{ position: 'absolute', top: 10, right: 12 }}>✅</span>}
            {!allMissionsDone && <span style={{ position: 'absolute', top: 10, right: 12 }}>🔒</span>}
            <div style={{ fontSize: 11, fontWeight: 800, color: '#FFD54A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Final Step</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#e2e8f0', margin: '3px 0 4px' }}>The Quiz</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
              {progress.quizScore !== null ? `Best score: ${progress.quizScore}/5` : '5 questions · pass to unlock Free Build'}
            </div>
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}
