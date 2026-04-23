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
import { MazeRuntime, ScriptNode } from '../engine/runtime';
import {
  Particle,
  renderBoard,
  renderBot,
  renderCollectible,
  renderGoal,
  renderParticles,
  spawnParticles,
  updateParticles,
} from '../engine/mazeRenderer';
import { THEMES, ThemeName } from '../engine/themes';
import type { BlockChallenge } from '../units';

const CELL = 52;

export interface MazeBoardHandle {
  run: (script: ScriptNode[]) => void;
  stop: () => void;
  reset: () => void;
}

type LevelProp = BlockChallenge & { theme: ThemeName; [key: string]: unknown };

interface Props {
  level: LevelProp;
  onWin: () => void;
  onBump: () => void;
}

const MazeBoard = forwardRef<MazeBoardHandle, Props>(({ level, onWin, onBump }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(new STEMBotAnimator());
  const runtimeRef = useRef<MazeRuntime | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const removedRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef(0);
  const rafRef = useRef(0);
  const [won, setWon] = useState(false);

  const rows = level.grid.length;
  const cols = level.grid[0].length;
  const canvasW = cols * CELL;
  const canvasH = rows * CELL;
  const theme = THEMES[level.theme];

  const doReset = useCallback(() => {
    runtimeRef.current?.stop();
    animRef.current.reset(level.startX, level.startY, level.startDir);
    removedRef.current = new Set();
    particlesRef.current = [];
    setWon(false);
  }, [level]);

  useEffect(() => {
    doReset();
  }, [doReset]);

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
            },
            onWin() {
              setWon(true);
              onWin();
            },
            onBump() {
              onBump();
            },
          },
        );
        runtimeRef.current = runtime;
        runtime.run(script);
      }, 30);
    },
    stop() {
      runtimeRef.current?.stop();
    },
    reset() {
      doReset();
    },
  }));

  return (
    <div className="relative inline-block">
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH}
        style={{ display: 'block', borderRadius: 14 }}
      />
      {won && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl"
          style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="bg-white rounded-2xl px-8 py-6 text-center shadow-2xl">
            <div style={{ fontSize: 52 }}>🎉</div>
            <div className="text-2xl font-bold mt-2 text-gray-800">Nice work!</div>
            <div className="text-gray-500 mt-1 text-sm">STEM Bot reached the goal</div>
          </div>
        </div>
      )}
    </div>
  );
});

MazeBoard.displayName = 'MazeBoard';
export default MazeBoard;
