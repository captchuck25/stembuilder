import { STEMBotAnimator, Direction } from './animation';

export interface ScriptNode {
  id: string;
  blockId: string;
  params: Record<string, number | string>;
  children?: ScriptNode[];
}

export interface RuntimeCallbacks {
  onCollect: (x: number, y: number) => void;
  onWin: () => void;
  onBump: () => void;
}

export class MazeRuntime {
  private grid: number[][];
  private readonly rows: number;
  private readonly cols: number;
  private botX: number;
  private botY: number;
  private botDir: Direction;
  private readonly exitX: number;
  private readonly exitY: number;
  private collectibles: Set<string>;
  private animator: STEMBotAnimator;
  private cb: RuntimeCallbacks;
  private _running = false;
  private _stopped = false;
  private _bumped = false;
  private readonly stepGap = 55;

  constructor(
    grid: number[][],
    startX: number,
    startY: number,
    startDir: Direction,
    exitX: number,
    exitY: number,
    collectibles: { x: number; y: number }[],
    animator: STEMBotAnimator,
    callbacks: RuntimeCallbacks,
  ) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = grid[0].length;
    this.botX = startX;
    this.botY = startY;
    this.botDir = startDir;
    this.exitX = exitX;
    this.exitY = exitY;
    this.collectibles = new Set(collectibles.map(c => `${c.x},${c.y}`));
    this.animator = animator;
    this.cb = callbacks;
  }

  get running() {
    return this._running;
  }

  stop() {
    this._running = false;
    this._stopped = true;
  }

  async run(script: ScriptNode[]) {
    this._running = true;
    this._stopped = false;
    this._bumped = false;
    await this.execMany(script);
    this._running = false;
    if (!this._stopped && this.atGoal() && !this._bumped) {
      this.cb.onWin();
    }
  }

  private isPath(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && this.grid[y][x] === 0;
  }

  private delta(dir: Direction): { dx: number; dy: number } {
    if (dir === 'right') return { dx: 1, dy: 0 };
    if (dir === 'left')  return { dx: -1, dy: 0 };
    if (dir === 'up')    return { dx: 0, dy: -1 };
    return { dx: 0, dy: 1 };
  }

  private pathInDir(dir: Direction) {
    const { dx, dy } = this.delta(dir);
    return this.isPath(this.botX + dx, this.botY + dy);
  }

  private left(dir: Direction): Direction {
    const m: Record<Direction, Direction> = { right: 'up', up: 'left', left: 'down', down: 'right' };
    return m[dir];
  }

  private right(dir: Direction): Direction {
    const m: Record<Direction, Direction> = { right: 'down', down: 'left', left: 'up', up: 'right' };
    return m[dir];
  }

  private atGoal() {
    return this.botX === this.exitX && this.botY === this.exitY;
  }

  private gap(multiplier = 1): Promise<void> {
    return new Promise(r => setTimeout(r, this.stepGap * multiplier));
  }

  private async execMany(nodes: ScriptNode[]) {
    for (const node of nodes) {
      if (!this._running) return;
      await this.execNode(node);
    }
  }

  private async execNode(node: ScriptNode): Promise<void> {
    if (!this._running) return;

    switch (node.blockId) {
      case 'move_forward': {
        const { dx, dy } = this.delta(this.botDir);
        const nx = this.botX + dx;
        const ny = this.botY + dy;
        if (this.isPath(nx, ny)) {
          this.animator.moveTo(nx, ny, this.botDir);
          this.botX = nx;
          this.botY = ny;
          const key = `${nx},${ny}`;
          if (this.collectibles.has(key)) {
            this.collectibles.delete(key);
            this.animator.collect();
            this.cb.onCollect(nx, ny);
          }
          await this.animator.waitForMove();
          await this.gap();
        } else {
          this.animator.bump();
          this._bumped = true;
          this.cb.onBump();
          await this.gap(3);
        }
        break;
      }

      case 'turn_left': {
        this.botDir = this.left(this.botDir);
        this.animator.direction = this.botDir;
        await this.gap(2);
        break;
      }

      case 'turn_right': {
        this.botDir = this.right(this.botDir);
        this.animator.direction = this.botDir;
        await this.gap(2);
        break;
      }

      case 'repeat': {
        const times = Number(node.params.times ?? 3);
        for (let i = 0; i < times && this._running; i++) {
          await this.execMany(node.children ?? []);
        }
        break;
      }

      case 'while_path_ahead': {
        let guard = 0;
        while (this.pathInDir(this.botDir) && this._running && guard++ < 400) {
          await this.execMany(node.children ?? []);
        }
        break;
      }

      case 'while_not_at_goal': {
        let guard = 0;
        while (!this.atGoal() && this._running && guard++ < 400) {
          await this.execMany(node.children ?? []);
        }
        break;
      }

      case 'if_path_ahead': {
        if (this.pathInDir(this.botDir)) {
          await this.execMany(node.children ?? []);
        }
        break;
      }

      case 'if_path_left': {
        if (this.pathInDir(this.left(this.botDir))) {
          await this.execMany(node.children ?? []);
        }
        break;
      }

      case 'if_path_right': {
        if (this.pathInDir(this.right(this.botDir))) {
          await this.execMany(node.children ?? []);
        }
        break;
      }
    }
  }
}

// ── Script tree helpers ────────────────────────────────────────────────────

export function appendNode(
  nodes: ScriptNode[],
  targetId: string | null,
  newNode: ScriptNode,
): ScriptNode[] {
  if (targetId === null) return [...nodes, newNode];
  return nodes.map(n => {
    if (n.id === targetId) {
      return { ...n, children: [...(n.children ?? []), newNode] };
    }
    if (n.children) {
      const updated = appendNode(n.children, targetId, newNode);
      if (updated !== n.children) return { ...n, children: updated };
    }
    return n;
  });
}

export function deleteNode(nodes: ScriptNode[], targetId: string): ScriptNode[] {
  return nodes
    .filter(n => n.id !== targetId)
    .map(n => n.children ? { ...n, children: deleteNode(n.children, targetId) } : n);
}

export function updateParam(
  nodes: ScriptNode[],
  targetId: string,
  key: string,
  value: number | string,
): ScriptNode[] {
  return nodes.map(n => {
    if (n.id === targetId) return { ...n, params: { ...n.params, [key]: value } };
    if (n.children) return { ...n, children: updateParam(n.children, targetId, key, value) };
    return n;
  });
}

export function moveNode(nodes: ScriptNode[], id: string, dir: 'up' | 'down'): ScriptNode[] {
  const idx = nodes.findIndex(n => n.id === id);
  if (idx !== -1) {
    const arr = [...nodes];
    if (dir === 'up' && idx > 0) [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
    else if (dir === 'down' && idx < arr.length - 1) [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
    return arr;
  }
  return nodes.map(n => n.children ? { ...n, children: moveNode(n.children, id, dir) } : n);
}
