// Platformer physics + rule execution, in tile units (positions are floats).
// Physics (gravity, collision, patrol) comes free; everything else — controls,
// scoring, damage, winning — is executed from student-compiled block rules.

import { ArcadeAction, ArcadeKey, ArcadeSound, CompiledRules, GameDef, PlacedObject, solidSet } from './types';

/** Held state per wireable key — arrows AND letters are separate, real keys */
export type InputState = Record<ArcadeKey, boolean>;

export function emptyInput(): InputState {
  return { left: false, right: false, up: false, space: false, a: false, d: false, w: false, s: false };
}

/** Browser KeyboardEvent.key → wireable arcade key */
export const KEY_LOOKUP: Record<string, ArcadeKey> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ' ': 'space',
  a: 'a', d: 'd', w: 'w', s: 's',
};

export interface EntityState extends PlacedObject {
  id: number;
  alive: boolean;
  /** Float position — enemies move; everything else stays on its tile */
  px: number;
  py: number;
  dir: 1 | -1;
  /** Was the player overlapping last frame? (touch events fire on contact start) */
  touching: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: 1 | -1;
  invulnUntil: number;
}

export type GameStatus = 'playing' | 'won' | 'lost';

export interface GameState {
  player: PlayerState;
  entities: EntityState[];
  solids: Set<string>;
  cols: number;
  rows: number;
  spawn: { x: number; y: number };
  score: number;
  coinsTotal: number;
  lives: number;
  status: GameStatus;
  timeMs: number;
  /** Indexes of "when score reaches N" rules that already fired */
  firedScoreRules: Set<number>;
}

export interface GameEvent {
  type: 'jump' | 'hurt' | 'win' | 'lose' | 'poof' | 'sound' | 'needScore';
  x: number;
  y: number;
  sound?: ArcadeSound;
  /** For needScore: how many more points the player needs at this goal */
  need?: number;
}

// Player AABB (in tiles)
export const PW = 0.66;
export const PH = 0.85;

const SPEED = 7;
const GRAVITY = 34;
const JUMP_V = 14.8; // clears ~3.2 tiles
const BOUNCE_V = 8.5;
const MAX_FALL = 26;
const ENEMY_SPEED = 2.2;
const INVULN_MS = 1500;

export function initGame(def: GameDef, rules: CompiledRules): GameState {
  const spawnObj = def.objects.find(o => o.type === 'spawn');
  const spawn = spawnObj ? { x: spawnObj.x + (1 - PW) / 2, y: spawnObj.y + (1 - PH) } : { x: 1, y: 1 };
  let id = 0;
  const entities: EntityState[] = def.objects
    .filter(o => o.type !== 'platform' && o.type !== 'spawn')
    .map(o => ({ ...o, id: id++, alive: true, px: o.x, py: o.y, dir: 1 as const, touching: false }));

  const s: GameState = {
    player: { x: spawn.x, y: spawn.y, vx: 0, vy: 0, grounded: false, facing: 1, invulnUntil: 0 },
    entities,
    solids: solidSet(def),
    cols: def.cols,
    rows: def.rows,
    spawn,
    score: 0,
    coinsTotal: entities.filter(e => e.type === 'coin').length,
    lives: 3,
    status: 'playing',
    timeMs: 0,
    firedScoreRules: new Set(),
  };

  // "when the game starts" — only setup actions make sense before the first frame
  for (const script of rules.gameStart) {
    for (const a of script) {
      if (a.kind === 'setLives') s.lives = a.n;
      else if (a.kind === 'setScore') s.score = a.n;
      else if (a.kind === 'changeScore') s.score += a.n;
    }
  }

  return s;
}

function boxHitsSolid(s: GameState, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x + 1e-6);
  const x1 = Math.floor(x + w - 1e-6);
  const y0 = Math.floor(y + 1e-6);
  const y1 = Math.floor(y + h - 1e-6);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (s.solids.has(`${tx},${ty}`)) return true;
    }
  }
  return false;
}

function overlaps(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function hurt(s: GameState, events: GameEvent[]) {
  const p = s.player;
  if (s.timeMs < p.invulnUntil) return;
  s.lives--;
  if (s.lives <= 0) {
    s.status = 'lost';
    events.push({ type: 'lose', x: p.x, y: p.y });
    return;
  }
  events.push({ type: 'hurt', x: p.x + PW / 2, y: p.y + PH / 2 });
  p.x = s.spawn.x;
  p.y = s.spawn.y;
  p.vx = 0;
  p.vy = 0;
  p.invulnUntil = s.timeMs + INVULN_MS;
  // A fresh life resets the dangers: every enemy (including squashed ones)
  // returns to its home tile. Collected coins stay collected.
  for (const e of s.entities) {
    if (e.type === 'enemy') {
      e.alive = true;
      e.px = e.x;
      e.py = e.y;
      e.dir = 1;
      e.touching = false;
    }
  }
}

export function stepGame(s: GameState, input: InputState, dtMs: number, rules: CompiledRules): GameEvent[] {
  const events: GameEvent[] = [];
  if (s.status !== 'playing') return events;

  const dt = Math.min(dtMs, 40) / 1000;
  s.timeMs += dtMs;
  const p = s.player;

  const runActions = (actions: ArcadeAction[], entity: EntityState | null) => {
    for (const a of actions) {
      if (s.status !== 'playing') return;
      switch (a.kind) {
        case 'move':
          p.vx = a.dir === 'left' ? -SPEED : SPEED;
          p.facing = a.dir === 'left' ? -1 : 1;
          break;
        case 'jump':
          if (p.grounded) {
            p.vy = -JUMP_V;
            p.grounded = false;
            events.push({ type: 'jump', x: p.x, y: p.y });
          }
          break;
        case 'bouncePlayer':
          p.vy = -BOUNCE_V;
          p.grounded = false;
          break;
        case 'disappear':
          if (entity) {
            entity.alive = false;
            events.push({ type: 'poof', x: entity.px + 0.5, y: entity.py + 0.5 });
          }
          break;
        case 'changeScore': s.score = Math.max(0, s.score + a.n); break;
        case 'setScore': s.score = Math.max(0, a.n); break;
        case 'setLives': s.lives = a.n; break;
        case 'hurtPlayer': hurt(s, events); break;
        case 'win':
          s.status = 'won';
          events.push({ type: 'win', x: p.x + PW / 2, y: p.y + PH / 2 });
          break;
        case 'gameOver':
          s.status = 'lost';
          events.push({ type: 'lose', x: p.x, y: p.y });
          break;
        case 'sound':
          events.push({ type: 'sound', x: p.x, y: p.y, sound: a.name });
          break;
        case 'disappearAll':
          for (const e of s.entities) {
            if (e.type === a.target && e.alive) {
              e.alive = false;
              events.push({ type: 'poof', x: e.px + 0.5, y: e.py + 0.5 });
            }
          }
          break;
      }
    }
  };

  // ── Player input: only student-wired keys do anything ──
  p.vx = 0;
  for (const kr of rules.keys) {
    if (input[kr.key]) runActions(kr.actions, null);
  }
  if (s.status !== 'playing') return events;
  p.vy = Math.min(p.vy + GRAVITY * dt, MAX_FALL);

  // ── Move X, resolve ──
  let nx = p.x + p.vx * dt;
  nx = Math.max(0, Math.min(nx, s.cols - PW));
  if (boxHitsSolid(s, nx, p.y, PW, PH)) {
    nx = p.vx > 0 ? Math.floor(nx + PW) - PW - 1e-4 : Math.floor(nx) + 1 + 1e-4;
  }
  p.x = nx;

  // ── Move Y, resolve ──
  let ny = p.y + p.vy * dt;
  const wasFalling = p.vy > 0;
  p.grounded = false;
  if (boxHitsSolid(s, p.x, ny, PW, PH)) {
    if (wasFalling) {
      ny = Math.floor(ny + PH) - PH - 1e-4;
      p.grounded = true;
    } else {
      ny = Math.floor(ny) + 1 + 1e-4;
    }
    p.vy = 0;
  }
  p.y = ny;

  // Falling off the bottom always hurts (that's physics, not a rule)
  if (p.y > s.rows + 1) hurt(s, events);
  if (s.status !== 'playing') return events;

  // ── Enemies patrol: flip at walls, platform edges, and level bounds ──
  for (const e of s.entities) {
    if (!e.alive || e.type !== 'enemy') continue;
    e.px += e.dir * ENEMY_SPEED * dt;
    const frontX = e.dir > 0 ? e.px + 0.9 : e.px + 0.1;
    const wallAhead = s.solids.has(`${Math.floor(frontX)},${Math.floor(e.py + 0.5)}`);
    const groundAhead = s.solids.has(`${Math.floor(frontX)},${Math.floor(e.py + 0.5) + 1}`);
    if (e.px < 0 || e.px > s.cols - 1 || wallAhead || !groundAhead) {
      e.dir = (e.dir * -1) as 1 | -1;
      e.px = Math.max(0, Math.min(e.px, s.cols - 1));
    }
  }

  // ── Player vs entities: touch events fire once per contact ──
  for (const e of s.entities) {
    if (!e.alive) continue;
    let touchingNow = false;

    if (e.type === 'coin') {
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.25, e.py + 0.25, 0.5, 0.5);
      if (touchingNow && !e.touching) {
        for (const script of rules.touchCoin) runActions(script, e);
      }
    } else if (e.type === 'spike') {
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.15, e.py + 0.5, 0.7, 0.5);
      if (touchingNow && !e.touching) {
        for (const script of rules.touchSpike) runActions(script, e);
      }
    } else if (e.type === 'flag') {
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.2, e.py, 0.6, 1);
      if (touchingNow && !e.touching) {
        for (const script of rules.touchFlag) runActions(script, e);
        for (const gated of rules.touchFlagScored) {
          if (s.status !== 'playing') break;
          if (s.score >= gated.n) runActions(gated.actions, e);
          else events.push({ type: 'needScore', x: e.px + 0.5, y: e.py + 0.5, need: gated.n - s.score });
        }
      }
    } else if (e.type === 'enemy') {
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.12, e.py + 0.25, 0.76, 0.7);
      if (touchingNow && !e.touching) {
        const stomping = p.vy > 2 && p.y + PH < e.py + 0.62;
        const scripts = stomping ? rules.enemyTop : rules.enemySide;
        for (const script of scripts) runActions(script, e);
      }
    }

    e.touching = touchingNow;
    if (s.status !== 'playing') return events;
  }

  // ── "when the score reaches N" rules ──
  rules.scoreRules.forEach((rule, idx) => {
    if (s.status !== 'playing') return;
    if (!s.firedScoreRules.has(idx) && s.score >= rule.n) {
      s.firedScoreRules.add(idx);
      runActions(rule.actions, null);
    }
  });

  return events;
}
