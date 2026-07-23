// Arcade Lab — core data model.
// v1 decisions (locked): single-screen levels (no scrolling), scripts per object
// TYPE (not per instance), standalone tool, class-share with teacher takedown.

export type Backdrop = 'hills' | 'cave' | 'candy' | 'space';

export type ObjectType = 'platform' | 'coin' | 'spike' | 'enemy' | 'flag' | 'spawn';

/** Which object type a script sheet belongs to ('game' = global rules) */
export type ScriptOwner = 'player' | 'coin' | 'spike' | 'enemy' | 'flag' | 'game';

export interface PlacedObject {
  type: ObjectType;
  x: number;
  y: number;
}

export interface GameDef {
  title: string;
  backdrop: Backdrop;
  cols: number;
  rows: number;
  objects: PlacedObject[];
  /** Blockly XML per script owner — these ARE the game's rules */
  scripts: Record<ScriptOwner, string>;
}

export const TILE = 40;
export const COLS = 20;
export const ROWS = 12;

/** Fixed on-screen viewport (in px) — levels larger than this scroll */
export const VIEW_W = COLS * TILE;  // 800
export const VIEW_H = ROWS * TILE;  // 480

export type LevelShape = 'classic' | 'long' | 'tall';

export const LEVEL_SHAPES: Record<LevelShape, { cols: number; rows: number; label: string; blurb: string }> = {
  classic: { cols: 20, rows: 12, label: 'Classic',  blurb: 'One screen — everything in view' },
  long:    { cols: 60, rows: 12, label: 'Long',     blurb: 'Side-scrolling adventure, 3 screens wide' },
  tall:    { cols: 20, rows: 36, label: 'Tall',     blurb: 'Climb to the top, 3 screens high' },
};

/** Sanity bounds for loading saved level data */
export function validDims(cols: unknown, rows: unknown): boolean {
  return typeof cols === 'number' && typeof rows === 'number' &&
    cols >= 10 && cols <= 120 && rows >= 8 && rows <= 60;
}

export function solidSet(def: GameDef): Set<string> {
  return new Set(def.objects.filter(o => o.type === 'platform').map(o => `${o.x},${o.y}`));
}

// ── Compiled rules (produced by blocks.ts, executed by physics.ts) ────────────

export type ArcadeKey = 'left' | 'right' | 'up' | 'space' | 'a' | 'd' | 'w' | 's';
export type ArcadeSound = 'chime' | 'pop' | 'thud' | 'zap';

export type ArcadeAction =
  | { kind: 'move'; dir: 'left' | 'right' }
  | { kind: 'jump' }
  | { kind: 'disappear' }
  | { kind: 'changeScore'; n: number }
  | { kind: 'setScore'; n: number }
  | { kind: 'setLives'; n: number }
  | { kind: 'hurtPlayer' }
  | { kind: 'bouncePlayer' }
  | { kind: 'win' }
  | { kind: 'gameOver' }
  | { kind: 'sound'; name: ArcadeSound }
  | { kind: 'disappearAll'; target: 'spike' | 'enemy' | 'coin' };

export interface CompiledRules {
  /** Player: run while the key is held */
  keys: { key: ArcadeKey; actions: ArcadeAction[] }[];
  /** Object touch scripts (a touch triggers once per contact) */
  touchCoin: ArcadeAction[][];
  touchSpike: ArcadeAction[][];
  touchFlag: ArcadeAction[][];
  enemyTop: ArcadeAction[][];
  enemySide: ArcadeAction[][];
  gameStart: ArcadeAction[][];
  scoreRules: { n: number; actions: ArcadeAction[] }[];
}

export function emptyRules(): CompiledRules {
  return { keys: [], touchCoin: [], touchSpike: [], touchFlag: [], enemyTop: [], enemySide: [], gameStart: [], scoreRules: [] };
}

// ── Default scripts ───────────────────────────────────────────────────────────
// A new level starts fully wired (the classic rules) so free-build feels alive.
// The M4 guided challenges hand students deliberately broken subsets of these.

const X = '<xml xmlns="https://developers.google.com/blockly/xml">';

export const DEFAULT_SCRIPTS: Record<ScriptOwner, string> = {
  player: `${X}
<block type="arcade_when_key" x="16" y="16"><field name="KEY">left</field><next><block type="arcade_move"><field name="DIR">left</field></block></next></block>
<block type="arcade_when_key" x="16" y="130"><field name="KEY">right</field><next><block type="arcade_move"><field name="DIR">right</field></block></next></block>
<block type="arcade_when_key" x="16" y="244"><field name="KEY">up</field><next><block type="arcade_jump"></block></next></block>
</xml>`,
  coin: `${X}
<block type="arcade_when_touch_me" x="16" y="16"><next><block type="arcade_change_score"><field name="N">1</field><next><block type="arcade_disappear"><next><block type="arcade_play_sound"><field name="SOUND">chime</field></block></next></block></next></block></next></block>
</xml>`,
  spike: `${X}
<block type="arcade_when_touch_me" x="16" y="16"><next><block type="arcade_hurt_player"><next><block type="arcade_play_sound"><field name="SOUND">thud</field></block></next></block></next></block>
</xml>`,
  enemy: `${X}
<block type="arcade_when_stomped" x="16" y="16"><next><block type="arcade_disappear"><next><block type="arcade_bounce_player"><next><block type="arcade_play_sound"><field name="SOUND">pop</field></block></next></block></next></block></next></block>
<block type="arcade_when_touch_side" x="16" y="200"><next><block type="arcade_hurt_player"><next><block type="arcade_play_sound"><field name="SOUND">thud</field></block></next></block></next></block>
</xml>`,
  flag: `${X}
<block type="arcade_when_touch_me" x="16" y="16"><next><block type="arcade_win"></block></next></block>
</xml>`,
  game: `${X}
<block type="arcade_when_game_starts" x="16" y="16"><next><block type="arcade_set_lives"><field name="N">3</field></block></next></block>
</xml>`,
};

/** Ensure a loaded draft (possibly saved before scripts existed) has all script sheets */
export function withScripts(def: Omit<GameDef, 'scripts'> & { scripts?: Partial<Record<ScriptOwner, string>> }): GameDef {
  return { ...def, scripts: { ...DEFAULT_SCRIPTS, ...(def.scripts ?? {}) } };
}

// ── Templates ────────────────────────────────────────────────────────────────

export function span(type: ObjectType, x0: number, x1: number, y: number): PlacedObject[] {
  const out: PlacedObject[] = [];
  for (let x = x0; x <= x1; x++) out.push({ type, x, y });
  return out;
}

/** Blank-slate template for new student levels: ground, start, and a goal */
export function starterLevel(shape: LevelShape = 'classic'): GameDef {
  const { cols, rows } = LEVEL_SHAPES[shape];
  return {
    title: 'My First Level',
    backdrop: 'hills',
    cols,
    rows,
    objects: [
      ...span('platform', 0, cols - 1, rows - 1),
      { type: 'spawn', x: 1, y: rows - 2 },
      { type: 'flag', x: cols - 2, y: rows - 2 },
    ],
    scripts: { ...DEFAULT_SCRIPTS },
  };
}

export const DEMO_LEVEL: GameDef = {
  title: 'Crystal Canyon',
  backdrop: 'hills',
  cols: COLS,
  rows: ROWS,
  objects: [
    // ground with a pit at x8-9
    ...span('platform', 0, 7, 11),
    ...span('platform', 10, 19, 11),
    // floating platforms
    ...span('platform', 5, 7, 8),
    ...span('platform', 9, 11, 6),
    ...span('platform', 14, 15, 8),
    // coins
    { type: 'coin', x: 2, y: 10 },
    { type: 'coin', x: 3, y: 10 },
    { type: 'coin', x: 6, y: 7 },
    { type: 'coin', x: 8, y: 9 },
    { type: 'coin', x: 9, y: 9 },
    { type: 'coin', x: 9, y: 5 },
    { type: 'coin', x: 11, y: 5 },
    { type: 'coin', x: 14, y: 7 },
    { type: 'coin', x: 15, y: 7 },
    // hazards
    { type: 'spike', x: 4, y: 10 },
    { type: 'spike', x: 12, y: 10 },
    { type: 'spike', x: 13, y: 10 },
    { type: 'enemy', x: 10, y: 5 },
    // start + goal
    { type: 'spawn', x: 1, y: 10 },
    { type: 'flag', x: 18, y: 10 },
  ],
  scripts: { ...DEFAULT_SCRIPTS },
};
