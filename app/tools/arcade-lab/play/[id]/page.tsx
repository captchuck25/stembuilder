'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SiteHeader from '@/app/components/SiteHeader';
import { CompiledRules, GameDef, TILE, VIEW_W, VIEW_H, emptyRules, validDims, withScripts } from '../../engine/types';
import { initGame, stepGame, emptyInput, GameState, KEY_LOOKUP } from '../../engine/physics';
import { renderGame, renderMinimap, cameraFor } from '../../engine/render';
import { compileScripts } from '../../engine/blocks';
import { BotConfig, defaultBot, loadBotLocal, fetchCloudBot, sanitizeBot } from '../../engine/bot';
import { renderBotPortrait } from '../../engine/render';
import {
  Particle, renderParticles, spawnConfetti, spawnParticles, updateParticles,
} from '../../../block-lab/engine/mazeRenderer';
import { isMuted, setMuted, playBump, playCollect, playMove, playStomp, playWin, playZap } from '../../../block-lab/engine/sfx';

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

const CONFETTI = ['#FFD54A', '#4C8DFF', '#22C55E', '#FF6BD6', '#7DF9FF'];
const SOUND_FN = { chime: playCollect, pop: playStomp, thud: playBump, zap: playZap } as const;

interface RunRow { name: string; ms: number; mine: boolean }
interface LoadedGame {
  id: string; title: string; data: GameDef; bot: unknown;
  plays: number; ownerName: string; isMine: boolean;
}

function fmt(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

function CreatorBot({ bot }: { bot: unknown }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const cfg: BotConfig = sanitizeBot(bot) ?? defaultBot();
    renderBotPortrait(canvas.getContext('2d')!, canvas.width, canvas.height, 0, cfg);
  }, [bot]);
  return <canvas ref={ref} width={44} height={44} style={{ display: 'block' }} />;
}

export default function PlayArcadeGamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;

  const [loaded, setLoaded] = useState<LoadedGame | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [myBestMs, setMyBestMs] = useState<number | null>(null);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');
  const [finishMs, setFinishMs] = useState<number | null>(null);
  const [improved, setImproved] = useState(false);
  const [muted, setMutedState] = useState(() => (typeof window === 'undefined' ? false : isMuted()));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniCanvasRef = useRef<HTMLCanvasElement>(null);
  const defRef = useRef<GameDef | null>(null);
  const rulesRef = useRef<CompiledRules>(emptyRules());
  const stateRef = useRef<GameState | null>(null);
  const inputRef = useRef(emptyInput());
  const particlesRef = useRef<Particle[]>([]);
  const lastTimeRef = useRef(0);
  const lastSoundRef = useRef<Record<string, number>>({});
  const botRef = useRef<BotConfig>(defaultBot());
  const countedPlayRef = useRef(false);

  // My bot plays their level
  useEffect(() => {
    const local = loadBotLocal();
    if (local) { botRef.current = local; return; }
    fetchCloudBot().then(c => { if (c) botRef.current = c; });
  }, []);

  // Load the game
  useEffect(() => {
    fetch(`/api/arcade/games/${gameId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.game?.data || !validDims(data.game.data.cols, data.game.data.rows)) {
          setNotFound(true);
          return;
        }
        const def = withScripts(data.game.data);
        defRef.current = def;
        rulesRef.current = compileScripts(def.scripts);
        stateRef.current = initGame(def, rulesRef.current);
        setLoaded({ ...data.game, data: def });
        setRuns(data.runs ?? []);
        setMyBestMs(data.myBestMs ?? null);
        if (!countedPlayRef.current) {
          countedPlayRef.current = true;
          fetch(`/api/arcade/games/${gameId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'play' }),
          });
        }
      })
      .catch(() => setNotFound(true));
  }, [gameId]);

  const restart = useCallback(() => {
    if (!defRef.current) return;
    stateRef.current = initGame(defRef.current, rulesRef.current);
    particlesRef.current = [];
    inputRef.current = emptyInput();
    setStatus('playing');
    setFinishMs(null);
    setImproved(false);
  }, []);

  const submitRun = useCallback((ms: number) => {
    fetch(`/api/arcade/games/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'run', ms }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data) return;
        setRuns(data.runs ?? []);
        setMyBestMs(data.myBestMs ?? null);
        setImproved(!!data.improved);
      });
  }, [gameId]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      const k = KEY_LOOKUP[e.key] ?? KEY_LOOKUP[e.key.toLowerCase()];
      if (k) inputRef.current[k] = true;
      if (e.key === 'r' && stateRef.current?.status !== 'playing') restart();
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
  }, [restart]);

  // Game loop
  useEffect(() => {
    if (!loaded) return;
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
      const s = stateRef.current;
      const def = defRef.current;
      if (s && def) {
        const events = stepGame(s, inputRef.current, dt, rulesRef.current);
        for (const ev of events) {
          const px = ev.x * TILE, py = ev.y * TILE;
          if (ev.type === 'jump') playMove();
          else if (ev.type === 'sound' && ev.sound) playSoundThrottled(ev.sound, now);
          else if (ev.type === 'needScore') {
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
            setFinishMs(s.timeMs);
            submitRun(Math.round(s.timeMs));
          }
        }
        renderGame(ctx, def, s, now, botRef.current);

        particlesRef.current = updateParticles(particlesRef.current, dt);
        const cam = cameraFor(def, s);
        ctx.save();
        ctx.translate(-cam.x, -cam.y);
        renderParticles(ctx, particlesRef.current, TILE);
        ctx.restore();

        const mini = miniCanvasRef.current;
        if (mini) {
          renderMinimap(mini.getContext('2d')!, def, cam, mini.width, mini.height,
            { x: s.player.x, y: s.player.y });
        }
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [loaded, submitRun]);

  const toggleMute = useCallback(() => {
    setMutedState(m => { setMuted(!m); return !m; });
  }, []);

  const def = defRef.current;
  const isBigLevel = !!def && (def.cols * TILE > VIEW_W || def.rows * TILE > VIEW_H);
  const miniScale = def ? Math.min(VIEW_W / (def.cols * TILE), 120 / (def.rows * TILE), 0.2) : 0.2;

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat' }}>
        <SiteHeader />
        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...CARD, padding: '44px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 48 }}>🫥</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', margin: '12px 0 8px' }}>Game not found</h2>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 20px' }}>It may have been unpublished or taken down.</p>
            <Link href="/tools/arcade-lab/arcade" style={{ display: 'inline-block', padding: '11px 26px', background: '#7C3AED', color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
              ← Back to the Arcade
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <div style={{ maxWidth: VIEW_W + 320, margin: '0 auto', padding: '24px 32px' }}>

          {/* Header */}
          <div style={{ ...CARD, padding: '12px 20px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link href="/tools/arcade-lab/arcade" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Arcade</Link>
            {loaded && (
              <>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>
                  <CreatorBot bot={loaded.bot} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0' }}>{loaded.title}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>by {loaded.ownerName}{loaded.isMine ? ' (you!)' : ''}</div>
                </div>
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {myBestMs != null && (
                <span style={{ fontSize: 12, fontWeight: 800, color: '#7DF9FF', background: 'rgba(125,249,255,0.1)', padding: '4px 12px', borderRadius: 12 }}>
                  My best: {fmt(myBestMs)}
                </span>
              )}
              <button onClick={restart}
                style={{ padding: '8px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                ↺ Restart
              </button>
              <button onClick={toggleMute}
                style={{ padding: '8px 12px', borderRadius: 10, fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                {muted ? '🔇' : '🔊'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>

            {/* Game canvas */}
            <div style={{ position: 'relative' }}>
              <style>{`
                @keyframes arcade-banner-in {
                  from { transform: translateY(14px) scale(0.92); opacity: 0; }
                  to { transform: translateY(0) scale(1); opacity: 1; }
                }
              `}</style>
              <canvas ref={canvasRef} width={VIEW_W} height={VIEW_H}
                style={{ display: 'block', borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.45)', maxWidth: '100%' }} />

              {isBigLevel && def && (
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
                  <canvas ref={miniCanvasRef}
                    width={Math.round(def.cols * TILE * miniScale)}
                    height={Math.round(def.rows * TILE * miniScale)}
                    style={{ display: 'block', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)' }} />
                </div>
              )}

              {!loaded && !notFound && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontWeight: 700 }}>
                  Loading game…
                </div>
              )}

              {loaded && status !== 'playing' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', borderRadius: 14 }}>
                  <div style={{ background: '#fff', borderRadius: 16, padding: '26px 38px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.4)', animation: 'arcade-banner-in 300ms ease-out both' }}>
                    <div style={{ fontSize: 50 }}>{status === 'won' ? (improved ? '🏆' : '🎉') : '💀'}</div>
                    <div style={{ fontSize: 23, fontWeight: 900, color: '#1f2937', marginTop: 6 }}>
                      {status === 'won'
                        ? finishMs != null ? `Finished in ${fmt(finishMs)}!` : 'Level beaten!'
                        : 'Out of lives!'}
                    </div>
                    <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                      {status === 'won'
                        ? improved ? '⚡ New personal best — check the leaderboard!' : myBestMs != null ? `Your best is still ${fmt(myBestMs)}.` : ''
                        : 'This one bites back. Try again!'}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
                      <button onClick={restart}
                        style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                        ↺ {status === 'won' ? 'Beat the clock (R)' : 'Try Again (R)'}
                      </button>
                      <Link href="/tools/arcade-lab/arcade"
                        style={{ padding: '10px 20px', background: 'rgba(0,0,0,0.08)', color: '#374151', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                        ← Arcade
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div style={{ ...CARD, padding: '16px 18px', width: 260, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#e2e8f0', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                ⏱ Fastest Runs
              </div>
              {runs.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                  No one has beaten this game yet. Be the first!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {runs.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8,
                      background: r.mine ? 'rgba(125,249,255,0.1)' : 'rgba(255,255,255,0.04)',
                      border: r.mine ? '1px solid rgba(125,249,255,0.35)' : '1px solid transparent' }}>
                      <span style={{ fontSize: 13, width: 24 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: r.mine ? '#7DF9FF' : '#cbd5e1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.name}{r.mine ? ' (me)' : ''}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#FFD54A' }}>{fmt(r.ms)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
