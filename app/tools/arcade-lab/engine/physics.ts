// Platformer physics + rule execution, in tile units (positions are floats).
// Physics (gravity, collision, patrol) comes free; everything else — controls,
// scoring, damage, winning — is executed from student-compiled block rules.

import { ArcadeAction, ArcadeKey, ArcadeSound, CompiledRules, DEFENDER_MARCHERS, ENEMY_TYPES, GameDef, Genre, PlacedObject, genreOf, solidSet } from './types';

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
  /** Springs: 1 right after a bounce, decays to 0 (drives the squash animation) */
  springSquash?: number;
  /** Stomps remaining before this enemy squashes (toughness) */
  hp?: number;
  maxHp?: number;
  /** Defender: this alien already triggered its reach-the-bottom scripts */
  bottomFired?: boolean;
  /** Defender: when this bomber drops its next bomb (timeMs) */
  nextBombAt?: number;
}

/** Defender: a blaster bolt in flight (tile coords, travels straight up) */
export interface Blaster {
  x: number;
  y: number;
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
  /** Enemies defeated this run (any enemy kind that a script made disappear) */
  kills: number;
  /** Indexes of "when score reaches N" rules that already fired */
  firedScoreRules: Set<number>;
  firedKillRules: Set<number>;
  // ── Space Defender ──
  genre: Genre;
  blasters: Blaster[];
  /** Bombs dropped by bombers, falling toward the ship */
  bombs: Blaster[];
  /** Remaining blaster shots; null = unlimited (no shot-limit block) */
  ammo: number | null;
  /** March speed multiplier from "aliens march …" blocks */
  paceMult: number;
  /** timeMs before which the blaster is still reloading */
  fireCooldownUntil: number;
  /** Which way the alien formation is marching */
  alienDir: 1 | -1;
  /** How far the formation has drifted from its designed tiles */
  alienOffsetX: number;
  alienOffsetY: number;
  aliensClearedFired: boolean;
}

export interface GameEvent {
  type: 'jump' | 'hurt' | 'win' | 'lose' | 'poof' | 'sound' | 'needScore' | 'hit';
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
const SPRING_V = 20;  // clears ~5.9 tiles — the super bounce
const MAX_FALL = 26;
const ENEMY_SPEED = 2.2;
const FLYER_SPEED = 2.6;
const FLYER_AMP = 0.45;   // hover wave height in tiles
const INVULN_MS = 1500;
const BOLT_SPEED = 16;       // blaster bolts, tiles/s straight up
const FIRE_COOLDOWN_MS = 260;
const MARCH_BASE = 1.2;      // formation speed with a full armada...
const MARCH_PANIC = 2.2;     // ...plus this much extra as it thins out
const MARCH_STEP_DOWN = 0.4; // tiles the formation drops at each edge
const BOMB_SPEED = 5.5;      // bomber bombs, tiles/s straight down
const BOMB_INTERVAL_MS = 2600;
const AMMO_FALL = 0.9;       // ⚡ pickups drift down, tiles/s
const PACE_MULT = { slow: 0.55, normal: 1, fast: 1.7 } as const;

/** Anything a script's "disappear" counts as a defeat */
const KILLABLE: readonly string[] = [...ENEMY_TYPES, ...DEFENDER_MARCHERS];

export function initGame(def: GameDef, rules: CompiledRules): GameState {
  const spawnObj = def.objects.find(o => o.type === 'spawn');
  const spawn = spawnObj ? { x: spawnObj.x + (1 - PW) / 2, y: spawnObj.y + (1 - PH) } : { x: 1, y: 1 };
  let id = 0;
  const entities: EntityState[] = def.objects
    .filter(o => o.type !== 'platform' && o.type !== 'spawn')
    .map(o => {
      const maxHp = o.type === 'enemy' ? rules.enemyToughness
        : o.type === 'flyer' ? rules.flyerToughness
        : o.type === 'alien' ? rules.alienToughness
        : o.type === 'brute' ? rules.bruteToughness
        : o.type === 'bomber' ? rules.bomberToughness
        : undefined;
      const e: EntityState = { ...o, id: id++, alive: true, px: o.x, py: o.y, dir: 1 as const, touching: false, hp: maxHp, maxHp };
      // Bombers stagger their first drops so the sky doesn't fill at once
      if (o.type === 'bomber') e.nextBombAt = 1600 + (e.id % 5) * 800;
      return e;
    });

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
    kills: 0,
    firedScoreRules: new Set(),
    firedKillRules: new Set(),
    genre: genreOf(def),
    blasters: [],
    bombs: [],
    ammo: null,
    paceMult: 1,
    fireCooldownUntil: 0,
    alienDir: 1,
    alienOffsetX: 0,
    alienOffsetY: 0,
    aliensClearedFired: false,
  };

  // "when the game starts" — only setup actions make sense before the first frame
  for (const script of rules.gameStart) {
    for (const a of script) {
      if (a.kind === 'setLives') s.lives = a.n;
      else if (a.kind === 'setScore') s.score = a.n;
      else if (a.kind === 'changeScore') s.score += a.n;
      else if (a.kind === 'setPace') s.paceMult = PACE_MULT[a.pace];
      else if (a.kind === 'setAmmo') s.ammo = a.n;
      else if (a.kind === 'addAmmo' && s.ammo !== null) s.ammo += a.n;
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
  // Defender mercy: the sky clears of bombs while the ship respawns
  s.bombs.length = 0;
  // A fresh life resets the dangers: every enemy (including squashed ones)
  // returns to its home tile. Collected coins stay collected.
  for (const e of s.entities) {
    if (ENEMY_TYPES.includes(e.type)) {
      e.alive = true;
      e.px = e.x;
      e.py = e.y;
      e.dir = 1;
      e.touching = false;
      e.hp = e.maxHp;
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
        case 'launch':
          // strength n = multiples of jump HEIGHT → velocity scales by √n
          p.vy = -JUMP_V * Math.sqrt(a.n >= 2 && a.n <= 4 ? a.n : 2);
          p.grounded = false;
          if (entity?.type === 'spring') entity.springSquash = 1;
          break;
        case 'disappear':
          if (entity) {
            entity.alive = false;
            if (KILLABLE.includes(entity.type)) s.kills++;
            events.push({ type: 'poof', x: entity.px + 0.5, y: entity.py + 0.5 });
          }
          break;
        case 'fire':
          // Defender-only: in a platformer nothing would move or draw the bolts
          if (s.genre === 'defender' && s.timeMs >= s.fireCooldownUntil && (s.ammo === null || s.ammo > 0)) {
            s.fireCooldownUntil = s.timeMs + FIRE_COOLDOWN_MS;
            if (s.ammo !== null) s.ammo--;
            s.blasters.push({ x: p.x + PW / 2, y: p.y - 0.15 });
            events.push({ type: 'sound', x: p.x, y: p.y, sound: 'zap' });
          }
          break;
        case 'setPace': s.paceMult = PACE_MULT[a.pace]; break;
        case 'setAmmo': s.ammo = a.n; break;
        case 'addAmmo': if (s.ammo !== null) s.ammo += a.n; break;
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
        case 'requireScore':
          if (s.score < a.n) {
            // "locked" cue only for object touches (key chains would spam it)
            if (entity) events.push({ type: 'needScore', x: entity.px + 0.5, y: entity.py + 0.5, need: a.n - s.score });
            return; // guard failed — skip the rest of this chain
          }
          break;
        case 'requireKills':
          if (s.kills < a.n) {
            if (entity) events.push({ type: 'needScore', x: entity.px + 0.5, y: entity.py + 0.5, need: a.n - s.kills });
            return;
          }
          break;
        case 'disappearAll':
          for (const e of s.entities) {
            // "enemies" covers every enemy kind: walkers, spiky, flyers
            const matches = a.target === 'enemy' ? ENEMY_TYPES.includes(e.type) : e.type === a.target;
            if (matches && e.alive) {
              e.alive = false;
              if (KILLABLE.includes(e.type)) s.kills++;
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

  // ══ Space Defender: ship + blasters + marching formation, no gravity ══
  if (s.genre === 'defender') {
    // The ship slides along its row; jump/launch are no-ops in space
    p.vy = 0;
    p.grounded = false;
    p.x = Math.max(0, Math.min(p.x + p.vx * dt, s.cols - PW));
    p.y = s.spawn.y;

    // Bolts fly straight up, bombs fall straight down
    for (const b of s.blasters) b.y -= BOLT_SPEED * dt;
    s.blasters = s.blasters.filter(b => b.y > -1);
    for (const b of s.bombs) b.y += BOMB_SPEED * dt;
    s.bombs = s.bombs.filter(b => b.y < s.rows + 1);

    // Per-kind rule buckets (aliens, brutes, and bombers each have a sheet)
    const hitRulesFor = (t: string) => t === 'brute' ? rules.bruteHit : t === 'bomber' ? rules.bomberHit : rules.alienHit;
    const bottomRulesFor = (t: string) => t === 'brute' ? rules.bruteBottom : t === 'bomber' ? rules.bomberBottom : rules.alienBottom;
    const shipRulesFor = (t: string) => t === 'brute' ? rules.bruteShip : t === 'bomber' ? rules.bomberShip : rules.alienShip;

    // Formation march: sweep sideways, drop a step at each edge, speed up as
    // the armada thins out — all scaled by the coded pace
    const marchers = s.entities.filter(e => DEFENDER_MARCHERS.includes(e.type));
    const alive = marchers.filter(e => e.alive);
    if (alive.length) {
      const speed = (MARCH_BASE + MARCH_PANIC * (1 - alive.length / marchers.length)) * s.paceMult;
      s.alienOffsetX += s.alienDir * speed * dt;
      let minX = Infinity, maxX = -Infinity;
      for (const e of alive) {
        minX = Math.min(minX, e.x + s.alienOffsetX);
        maxX = Math.max(maxX, e.x + s.alienOffsetX);
      }
      if (s.alienDir > 0 && maxX > s.cols - 1.05) {
        s.alienDir = -1;
        s.alienOffsetX += s.cols - 1.05 - maxX;
        s.alienOffsetY += MARCH_STEP_DOWN;
      } else if (s.alienDir < 0 && minX < 0.05) {
        s.alienDir = 1;
        s.alienOffsetX += 0.05 - minX;
        s.alienOffsetY += MARCH_STEP_DOWN;
      }
      for (const e of marchers) {
        e.px = e.x + s.alienOffsetX;
        e.py = e.y + s.alienOffsetY;
        e.dir = s.alienDir;
      }
    }

    // Bombers drop bombs on their own clock
    for (const e of alive) {
      if (e.type !== 'bomber' || e.nextBombAt === undefined) continue;
      if (s.timeMs >= e.nextBombAt) {
        e.nextBombAt = s.timeMs + BOMB_INTERVAL_MS + ((e.id * 7919) % 1400);
        s.bombs.push({ x: e.px + 0.5, y: e.py + 0.9 });
      }
    }

    // Blaster bolt hits a marcher → dent armor, or run its "blaster hits me"
    for (const b of s.blasters) {
      for (const e of alive) {
        if (!e.alive) continue; // an earlier bolt got it this frame
        if (overlaps(b.x - 0.06, b.y - 0.35, 0.12, 0.35, e.px + 0.12, e.py + 0.15, 0.76, 0.7)) {
          b.y = -99; // spent
          events.push({ type: 'hit', x: e.px + 0.5, y: e.py + 0.5 });
          if ((e.hp ?? 1) > 1) {
            e.hp = (e.hp ?? 1) - 1; // armored — this hit just dents it
          } else {
            for (const script of hitRulesFor(e.type)) runActions(script, e);
          }
          break;
        }
        if (s.status !== 'playing') break;
      }
      if (s.status !== 'playing') break;
    }
    if (s.status !== 'playing') return events;
    s.blasters = s.blasters.filter(b => b.y > -1);

    // Bomb hits the ship → the bomber sheet's "when my bomb hits the ship"
    for (const b of s.bombs) {
      if (overlaps(p.x, p.y, PW, PH, b.x - 0.18, b.y - 0.18, 0.36, 0.36)) {
        b.y = s.rows + 99; // spent
        for (const script of rules.bombHit) runActions(script, null);
        if (s.status !== 'playing') return events;
      }
    }
    s.bombs = s.bombs.filter(b => b.y < s.rows + 1);

    // ⚡ ammo pickups drift down; catching one runs its sheet
    for (const e of s.entities) {
      if (e.type !== 'ammo' || !e.alive) continue;
      e.py += AMMO_FALL * dt;
      if (e.py > s.rows + 1) { e.alive = false; continue; }
      const touchingNow = overlaps(p.x - 0.1, p.y - 0.15, PW + 0.2, PH + 0.3, e.px + 0.2, e.py + 0.2, 0.6, 0.6);
      if (touchingNow && !e.touching) {
        for (const script of rules.ammoCatch) runActions(script, e);
        if (s.status !== 'playing') return events;
      }
      e.touching = touchingNow;
    }

    for (const e of alive) {
      if (!e.alive) continue;
      // Descended to the ship's row → "when I reach the bottom" (once per alien)
      if (!e.bottomFired && e.py + 0.85 >= s.spawn.y + PH) {
        e.bottomFired = true;
        for (const script of bottomRulesFor(e.type)) runActions(script, e);
        if (s.status !== 'playing') return events;
      }
      // Contact with the ship → "when I touch the ship" (once per contact)
      const touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.12, e.py + 0.15, 0.76, 0.7);
      if (touchingNow && !e.touching) {
        for (const script of shipRulesFor(e.type)) runActions(script, e);
        if (s.status !== 'playing') return events;
      }
      e.touching = touchingNow;
    }

    // Last marcher destroyed → "when every alien is destroyed" (once)
    if (!s.aliensClearedFired && marchers.length > 0 && marchers.every(e => !e.alive)) {
      s.aliensClearedFired = true;
      for (const script of rules.aliensCleared) runActions(script, null);
      if (s.status !== 'playing') return events;
    }

    rules.scoreRules.forEach((rule, idx) => {
      if (s.status !== 'playing') return;
      if (!s.firedScoreRules.has(idx) && s.score >= rule.n) {
        s.firedScoreRules.add(idx);
        runActions(rule.actions, null);
      }
    });
    rules.killRules.forEach((rule, idx) => {
      if (s.status !== 'playing') return;
      if (!s.firedKillRules.has(idx) && s.kills >= rule.n) {
        s.firedKillRules.add(idx);
        runActions(rule.actions, null);
      }
    });
    return events;
  }

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

  // ── Enemies patrol ──
  for (const e of s.entities) {
    if (!e.alive) continue;
    if (e.type === 'enemy' || e.type === 'spiky') {
      // ground walkers: flip at walls, platform edges, and level bounds
      e.px += e.dir * ENEMY_SPEED * dt;
      const frontX = e.dir > 0 ? e.px + 0.9 : e.px + 0.1;
      const wallAhead = s.solids.has(`${Math.floor(frontX)},${Math.floor(e.py + 0.5)}`);
      const groundAhead = s.solids.has(`${Math.floor(frontX)},${Math.floor(e.py + 0.5) + 1}`);
      if (e.px < 0 || e.px > s.cols - 1 || wallAhead || !groundAhead) {
        e.dir = (e.dir * -1) as 1 | -1;
        e.px = Math.max(0, Math.min(e.px, s.cols - 1));
      }
    } else if (e.type === 'flyer') {
      // air patrol: flip only at walls and level bounds, hover in a sine wave
      e.px += e.dir * FLYER_SPEED * dt;
      const frontX = e.dir > 0 ? e.px + 0.9 : e.px + 0.1;
      const wallAhead = s.solids.has(`${Math.floor(frontX)},${Math.floor(e.py + 0.5)}`);
      if (e.px < 0 || e.px > s.cols - 1 || wallAhead) {
        e.dir = (e.dir * -1) as 1 | -1;
        e.px = Math.max(0, Math.min(e.px, s.cols - 1));
      }
      e.py = e.y + Math.sin(s.timeMs / 420 + e.id * 1.7) * FLYER_AMP;
    } else if (e.type === 'spring' && e.springSquash && e.springSquash > 0) {
      e.springSquash = Math.max(0, e.springSquash - dt * 5);
    }
  }

  // ── Player vs entities: touch events fire once per contact ──
  // Snapshot the player's motion before resolving any contact, so a stomp's
  // bounce can't reclassify a same-frame second stomp as a deadly side-hit
  const impactVy = p.vy;
  const impactFeetY = p.y + PH;
  let stompedThisFrame = false;
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
        for (const gated of rules.touchFlagKills) {
          if (s.status !== 'playing') break;
          if (s.kills >= gated.n) runActions(gated.actions, e);
          else events.push({ type: 'needScore', x: e.px + 0.5, y: e.py + 0.5, need: gated.n - s.kills });
        }
      }
    } else if (e.type === 'enemy' || e.type === 'flyer') {
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.12, e.py + 0.25, 0.76, 0.7);
      if (touchingNow && !e.touching) {
        // Judge the stomp by the player's motion AT IMPACT (snapshotted before
        // this loop) — the first stomp's bounce must not turn a simultaneous
        // second stomp into a side-hit (landing on two crossing enemies).
        const stomping = impactVy > 2 && impactFeetY < e.py + 0.62;
        if (stomping && (e.hp ?? 1) > 1) {
          // Tough enemy: this stomp only dents it — flinch, bounce the player off
          e.hp = (e.hp ?? 1) - 1;
          p.vy = -BOUNCE_V;
          p.grounded = false;
          stompedThisFrame = true;
          events.push({ type: 'hit', x: e.px + 0.5, y: e.py + 0.3 });
        } else if (stomping) {
          stompedThisFrame = true;
          const scripts = e.type === 'flyer' ? rules.flyerTop : rules.enemyTop;
          for (const script of scripts) runActions(script, e);
        } else if (!stompedThisFrame) {
          // side-hit — but a stomp in this same frame grants grace against
          // other walkers/flyers brushing the player during the bounce
          const scripts = e.type === 'flyer' ? rules.flyerSide : rules.enemySide;
          for (const script of scripts) runActions(script, e);
        }
      }
    } else if (e.type === 'spiky') {
      // Spiky can NEVER be stomped — every contact, including from above,
      // runs its "touches me" scripts (usually: hurt the player)
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.12, e.py + 0.2, 0.76, 0.75);
      if (touchingNow && !e.touching) {
        for (const script of rules.spikyTouch) runActions(script, e);
      }
    } else if (e.type === 'spring') {
      // "lands on me" = falling into the spring's pad zone; scripted from there
      touchingNow = overlaps(p.x, p.y, PW, PH, e.px + 0.15, e.py + 0.45, 0.7, 0.55) && p.vy > 1;
      if (touchingNow && !e.touching) {
        for (const script of rules.springLand) runActions(script, e);
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

  // ── "when N enemies are defeated" rules ──
  rules.killRules.forEach((rule, idx) => {
    if (s.status !== 'playing') return;
    if (!s.firedKillRules.has(idx) && s.kills >= rule.n) {
      s.firedKillRules.add(idx);
      runActions(rule.actions, null);
    }
  });

  return events;
}
