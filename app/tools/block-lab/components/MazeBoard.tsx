'use client';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { STEMBotAnimator } from '../engine/animation';
import { MazeRuntime, ScriptNode, countBlocks } from '../engine/runtime';
import {
  Particle,
  renderBoard,
  renderBot,
  renderCollectible,
  renderGoal,
  renderParticles,
  spawnConfetti,
  spawnParticles,
  updateParticles,
} from '../engine/mazeRenderer';
import { THEMES, ThemeName } from '../engine/themes';
import { playBump, playCollect, playEmpty, playMove, playWin } from '../engine/sfx';
import type { BlockChallenge } from '../units';

const CELL = 52;

export interface MazeBoardHandle {
  run: (script: ScriptNode[]) => void;
  stop: () => void;
  reset: () => void;
}

type LevelProp = BlockChallenge & { theme: ThemeName; [key: string]: unknown };

export interface WinResult {
  stars: number;
  blocksUsed: number;
  collectedAll: boolean;
}

interface Props {
  level: LevelProp;
  speed?: number;
  onWin: (result: WinResult) => void;
  onBump: () => void;
  /** Currently executing block id (null when idle) — for Blockly highlighting */
  onStep?: (id: string | null) => void;
  /** Fires whenever a run finishes for any reason */
  onRunEnd?: () => void;
}

const MazeBoard = forwardRef<MazeBoardHandle, Props>(({ level, speed = 1, onWin, onBump, onStep, onRunEnd }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(new STEMBotAnimator());
  const runtimeRef = useRef<MazeRuntime | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const removedRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef(0);
  const rafRef = useRef(0);
  const [won, setWon] = useState<WinResult | null>(null);
  const [fail, setFail] = useState<'bump' | 'incomplete' | null>(null);
  const wonRef = useRef(false);
  const bumpedRef = useRef(false);
  const userStopRef = useRef(false);

  const rows = level.grid.length;
  const cols = level.grid[0].length;
  const canvasW = cols * CELL;
  const canvasH = rows * CELL;
  const theme = THEMES[level.theme];

  const doReset = useCallback(() => {
    userStopRef.current = true; // silence the onDone of any in-flight run
    runtimeRef.current?.stop();
    animRef.current.reset(level.startX, level.startY, level.startDir);
    animRef.current.speed = speed;
    removedRef.current = new Set();
    particlesRef.current = [];
    setWon(null);
    setFail(null);
    onStep?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    doReset();
  }, [doReset]);

  // Live speed changes apply mid-run
  useEffect(() => {
    animRef.current.speed = speed;
    runtimeRef.current?.setSpeed(speed);
  }, [speed]);

  // rAF render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const loop = (now: number) => {
      const dt = Math.min(now - (lastTimeRef.current || now), 50);
      lastTimeRef.current = now;

      particlesRef.current = updateParticles(particlesRef.current, dt);

      const state = animRef.current.getRenderState(now);

      renderBoard(ctx, canvasW, canvasH, level.grid, CELL, CELL, theme, now);
      renderGoal(ctx, level.exitX, level.exitY, CELL, CELL, theme, now);

      for (const c of level.collectibles) {
        if (!removedRef.current.has(`${c.x},${c.y}`)) {
          renderCollectible(ctx, c.x, c.y, CELL, CELL, theme, now);
        }
      }

      renderBot(ctx, state, CELL, CELL, theme);
      renderParticles(ctx, particlesRef.current, CELL);

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [level, theme, canvasW, canvasH]);

  useImperativeHandle(ref, () => ({
    run(script: ScriptNode[]) {
      doReset();
      const blocksUsed = countBlocks(script);
      wonRef.current = false;
      bumpedRef.current = false;
      userStopRef.current = false;
      // Small delay so reset animation frame fires before we start
      setTimeout(() => {
        const anim = animRef.current;
        const runtime = new MazeRuntime(
          level.grid,
          level.startX, level.startY, level.startDir,
          level.exitX, level.exitY,
          level.collectibles,
          anim,
          {
            onCollect(x, y) {
              removedRef.current = new Set([...removedRef.current, `${x},${y}`]);
              particlesRef.current = [
                ...particlesRef.current,
                ...spawnParticles(x * CELL + CELL / 2, y * CELL + CELL / 2, theme.particleColor),
              ];
              playCollect();
            },
            onWin(collectedAll) {
              wonRef.current = true;
              const stars = 1 + (collectedAll ? 1 : 0) + (blocksUsed <= level.par ? 1 : 0);
              anim.celebrate();
              particlesRef.current = [
                ...particlesRef.current,
                ...spawnConfetti(anim.gridX * CELL + CELL / 2, anim.gridY * CELL + CELL / 2, theme.confetti),
              ];
              playWin();
              setWon({ stars, blocksUsed, collectedAll });
              onWin({ stars, blocksUsed, collectedAll });
            },
            onBump() {
              bumpedRef.current = true;
              playBump();
              onBump();
            },
            onStep(id) {
              onStep?.(id);
            },
            onMove() {
              playMove();
            },
            onCollectMiss() {
              playEmpty();
            },
            onDone() {
              if (!wonRef.current && !userStopRef.current) {
                setFail(bumpedRef.current ? 'bump' : 'incomplete');
              }
              onRunEnd?.();
            },
          },
        );
        runtime.setSpeed(speed);
        runtimeRef.current = runtime;
        runtime.run(script);
      }, 30);
    },
    stop() {
      userStopRef.current = true;
      runtimeRef.current?.stop();
    },
    reset() {
      doReset();
    },
  }));

  return (
    <div className="relative inline-block">
      <style>{`
        @keyframes blocklab-star-pop {
          0% { transform: scale(0) rotate(-30deg); opacity: 0; }
          70% { transform: scale(1.35) rotate(8deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes blocklab-banner-in {
          from { transform: translateY(14px) scale(0.92); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        style={{ display: 'block', borderRadius: 14 }}
      />
      {won && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-2xl"
            style={{ animation: 'blocklab-banner-in 300ms ease-out both' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: 40 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  animation: i < won.stars ? `blocklab-star-pop 420ms ease-out ${200 + i * 260}ms both` : 'none',
                  filter: i < won.stars ? 'none' : 'grayscale(1) opacity(0.35)',
                }}>⭐</span>
              ))}
            </div>
            <div className="text-2xl font-bold mt-2 text-gray-800">
              {won.stars === 3 ? 'Perfect run!' : 'Nice work!'}
            </div>
            <div className="text-gray-500 mt-1 text-sm">
              {won.blocksUsed} block{won.blocksUsed === 1 ? '' : 's'} used — par {level.par}
              {level.collectibles.length > 0 && !won.collectedAll && <><br />Use Collect ✦ on every item for another star!</>}
              {won.stars < 3 && won.collectedAll && won.blocksUsed > level.par && <><br />Solve it in {level.par} blocks or fewer for another star!</>}
            </div>
          </div>
        </div>
      )}
      {fail && !won && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
          style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-2xl"
            style={{ animation: 'blocklab-banner-in 300ms ease-out both', maxWidth: '85%' }}>
            <div style={{ fontSize: 44 }}>{fail === 'bump' ? '💥' : '🤔'}</div>
            <div className="text-2xl font-bold mt-2 text-gray-800">
              {fail === 'bump' ? 'Crash!' : 'Not there yet!'}
            </div>
            <div className="text-gray-500 mt-1 text-sm">
              {fail === 'bump'
                ? 'STEM Bot hit a wall and the program stopped. Check which block sent it the wrong way.'
                : 'The script finished, but STEM Bot never reached the flag. Add or fix some blocks and run it again.'}
            </div>
            <button onClick={doReset}
              style={{ marginTop: 14, padding: '10px 26px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
              ↺ Try Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

MazeBoard.displayName = 'MazeBoard';
export default MazeBoard;
