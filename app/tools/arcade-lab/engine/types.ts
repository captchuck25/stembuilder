// Arcade Lab — core data model.
// v1 decisions (locked): single-screen levels (no scrolling), scripts per object
// TYPE (not per instance), standalone tool, class-share with teacher takedown.

export type Backdrop = 'hills' | 'cave' | 'candy' | 'space';

/** Two game genres share the engine: side-view platformer, and Space Defender
 *  (ship at the bottom, alien formation above, blasters). */
export type Genre = 'platformer' | 'defender';

export type ObjectType =
  | 'platform' | 'coin' | 'spike' | 'enemy' | 'spiky' | 'flyer' | 'spring' | 'flag' | 'spawn'
  | 'alien' | 'brute' | 'bomber' | 'ammo';

/** All enemy kinds — they share the Enemy script sheet (platformer) */
export const ENEMY_TYPES: ObjectType[] = ['enemy', 'spiky', 'flyer'];

/** Defender: everything that marches in the formation */
export const DEFENDER_MARCHERS: ObjectType[] = ['alien', 'brute', 'bomber'];

/** Which object type a script sheet belongs to ('game' = global rules) */
export type ScriptOwner =
  | 'player' | 'coin' | 'spike' | 'enemy' | 'spiky' | 'flyer' | 'spring' | 'flag' | 'game'
  | 'alien' | 'brute' | 'bomber' | 'ammo';

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
  /** Missing = platformer (all pre-Defender saves) */
  genre?: Genre;
}

export function genreOf(def: Pick<GameDef, 'genre'>): Genre {
  return def.genre === 'defender' ? 'defender' : 'platformer';
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
export type ArcadeSound = 'chime' | 'pop' | 'thud' | 'zap' | 'boing';

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
  | { kind: 'disappearAll'; target: 'spike' | 'enemy' | 'coin' }
  | { kind: 'launch'; n: number }
  // Guards: if the condition isn't met, the REST of this chain doesn't run
  | { kind: 'requireScore'; n: number }
  | { kind: 'requireKills'; n: number }
  // Defender: fire a blaster bolt from the ship
  | { kind: 'fire' }
  // Defender: how fast the armada marches (works at game start OR mid-game)
  | { kind: 'setPace'; pace: 'slow' | 'normal' | 'fast' }
  // Defender: limited blaster shots (setAmmo turns the limit on)
  | { kind: 'setAmmo'; n: number }
  | { kind: 'addAmmo'; n: number };

export interface CompiledRules {
  /** Player: run while the key is held */
  keys: { key: ArcadeKey; actions: ArcadeAction[] }[];
  /** Object touch scripts (a touch triggers once per contact) */
  touchCoin: ArcadeAction[][];
  touchSpike: ArcadeAction[][];
  touchFlag: ArcadeAction[][];
  /** Score-gated flag touches: only fire when score >= n (else a "need more" cue) */
  touchFlagScored: { n: number; actions: ArcadeAction[] }[];
  enemyTop: ArcadeAction[][];
  enemySide: ArcadeAction[][];
  /** Spiky: ANY contact (there is no safe stomp) */
  spikyTouch: ArcadeAction[][];
  flyerTop: ArcadeAction[][];
  flyerSide: ArcadeAction[][];
  /** Spring: the player lands on it (falling) */
  springLand: ArcadeAction[][];
  gameStart: ArcadeAction[][];
  scoreRules: { n: number; actions: ArcadeAction[] }[];
  /** "when N enemies are defeated" (Game sheet) */
  killRules: { n: number; actions: ArcadeAction[] }[];
  /** Defender: alien sheet + game-sheet events */
  alienHit: ArcadeAction[][];
  alienBottom: ArcadeAction[][];
  alienShip: ArcadeAction[][];
  aliensCleared: ArcadeAction[][];
  /** Defender: the armored one — same three events, its own sheet */
  bruteHit: ArcadeAction[][];
  bruteBottom: ArcadeAction[][];
  bruteShip: ArcadeAction[][];
  /** Defender: the bomb-dropper — bombs fall for free, what they DO is coded */
  bomberHit: ArcadeAction[][];
  bomberBottom: ArcadeAction[][];
  bomberShip: ArcadeAction[][];
  bombHit: ArcadeAction[][];
  /** Defender: falling ⚡ pickups — "when the ship catches me" */
  ammoCatch: ArcadeAction[][];
  /** Kill-gated flag touches: only fire when kills >= n */
  touchFlagKills: { n: number; actions: ArcadeAction[] }[];
  /** Head-stomps needed to squash (1-3); property blocks on the sheets */
  enemyToughness: number;
  flyerToughness: number;
  /** Defender: blaster hits needed to destroy (armor blocks on the sheets) */
  alienToughness: number;
  bruteToughness: number;
  bomberToughness: number;
}

export function emptyRules(): CompiledRules {
  return {
    keys: [], touchCoin: [], touchSpike: [], touchFlag: [], touchFlagScored: [],
    enemyTop: [], enemySide: [], spikyTouch: [], flyerTop: [], flyerSide: [], springLand: [],
    gameStart: [], scoreRules: [], killRules: [], touchFlagKills: [],
    alienHit: [], alienBottom: [], alienShip: [], aliensCleared: [],
    bruteHit: [], bruteBottom: [], bruteShip: [],
    bomberHit: [], bomberBottom: [], bomberShip: [], bombHit: [],
    ammoCatch: [],
    enemyToughness: 1, flyerToughness: 1,
    alienToughness: 1, bruteToughness: 1, bomberToughness: 1,
  };
}

// ── Human-readable rules summary ─────────────────────────────────────────────
// Derived from the COMPILED rules, so what it says is exactly what the game
// does — shown before playing your own or a classmate's game.

export interface RulesSummary {
  controls: string[];
  goals: string[];
  danger: string[];
}

const KEY_LABEL: Record<ArcadeKey, string> = {
  left: '←', right: '→', up: '↑', space: 'Space', a: 'A', d: 'D', w: 'W', s: 'S',
};

function keyVerb(actions: ArcadeAction[]): string | null {
  for (const a of actions) {
    if (a.kind === 'move') return a.dir === 'left' ? 'move left' : 'move right';
    if (a.kind === 'jump') return 'jump';
    if (a.kind === 'fire') return '🔫 fire!';
    if (a.kind === 'sound') return 'sound';
  }
  return null;
}

function scriptsContain(scripts: ArcadeAction[][], kind: ArcadeAction['kind']): boolean {
  return scripts.some(s => s.some(a => a.kind === kind));
}

export function summarizeRules(rules: CompiledRules, def?: GameDef): RulesSummary {
  const controls: string[] = [];
  for (const kr of rules.keys) {
    const verb = keyVerb(kr.actions);
    if (verb) controls.push(`${KEY_LABEL[kr.key]} ${verb}`);
  }
  if (controls.length === 0) controls.push('⚠ No keys wired — the player can’t move!');

  const goals: string[] = [];
  // Flag scripts: read guards in the same chain as the win
  for (const script of rules.touchFlag) {
    if (!script.some(a => a.kind === 'win')) continue;
    const sc = script.find(a => a.kind === 'requireScore') as Extract<ArcadeAction, { kind: 'requireScore' }> | undefined;
    const kl = script.find(a => a.kind === 'requireKills') as Extract<ArcadeAction, { kind: 'requireKills' }> | undefined;
    if (sc && kl) goals.push(`🚩 Flag needs ${sc.n} ✦ AND ${kl.n} defeat${kl.n === 1 ? '' : 's'}`);
    else if (sc) goals.push(`🚩 Reach the flag with at least ${sc.n} ✦`);
    else if (kl) goals.push(`🚩 Reach the flag after defeating ${kl.n} enem${kl.n === 1 ? 'y' : 'ies'}`);
    else goals.push('🚩 Reach the flag');
  }
  for (const gated of rules.touchFlagScored) {
    if (gated.actions.some(a => a.kind === 'win')) goals.push(`🚩 Reach the flag with at least ${gated.n} ✦`);
    else if (gated.actions.length) goals.push(`🚩 Flag does something special at ${gated.n} ✦`);
  }
  for (const kr of rules.killRules) {
    if (kr.actions.some(a => a.kind === 'win')) goals.push(`👾 Defeat ${kr.n} enem${kr.n === 1 ? 'y' : 'ies'} to win`);
    else if (kr.actions.length) goals.push(`👾 Something happens after ${kr.n} defeat${kr.n === 1 ? '' : 's'}`);
  }
  if (rules.aliensCleared.some(s2 => s2.some(a => a.kind === 'win'))) goals.push('👽 Destroy EVERY alien to win');
  if (scriptsContain(rules.alienHit, 'changeScore') || scriptsContain(rules.bruteHit, 'changeScore') || scriptsContain(rules.bomberHit, 'changeScore')) {
    goals.push('🔫 Blasting aliens scores points');
  }
  if (scriptsContain(rules.ammoCatch, 'addAmmo')) goals.push('⚡ Catch falling ammo for extra shots');
  for (const gated of rules.touchFlagKills) {
    if (gated.actions.some(a => a.kind === 'win')) goals.push(`🚩 Reach the flag after defeating ${gated.n} enem${gated.n === 1 ? 'y' : 'ies'}`);
  }
  for (const sr of rules.scoreRules) {
    if (sr.actions.some(a => a.kind === 'win')) goals.push(`✦ Collect ${sr.n} points to win`);
    if (sr.actions.some(a => a.kind === 'disappearAll')) {
      const t = sr.actions.find(a => a.kind === 'disappearAll') as Extract<ArcadeAction, { kind: 'disappearAll' }>;
      const label = t.target === 'spike' ? 'the spikes' : t.target === 'enemy' ? 'the enemies' : 'the crystals';
      goals.push(`✦ At ${sr.n} points, ${label} disappear`);
    }
  }
  if (goals.length === 0) goals.push('⚠ No way to win yet!');

  const danger: string[] = [];
  const lives = rules.gameStart.flat().find(a => a.kind === 'setLives') as Extract<ArcadeAction, { kind: 'setLives' }> | undefined;
  danger.push(`❤️ ${lives?.n ?? 3} lives`);
  if (scriptsContain(rules.touchSpike, 'hurtPlayer')) danger.push('🔺 Spikes hurt');
  if (scriptsContain(rules.enemySide, 'hurtPlayer')) danger.push('👾 Enemies hurt');
  if (scriptsContain(rules.enemyTop, 'disappear')) danger.push('👾 Stomp enemies to squash them');
  if (scriptsContain(rules.spikyTouch, 'hurtPlayer')) danger.push('🦔 Spiky hurts — NEVER stomp it!');
  if (scriptsContain(rules.flyerSide, 'hurtPlayer')) danger.push('🦇 Flyers hurt');
  if (scriptsContain(rules.flyerTop, 'disappear')) danger.push('🦇 Stomp flyers to squash them');
  if (scriptsContain(rules.springLand, 'launch')) danger.push('🌀 Springs launch you sky-high');
  if (scriptsContain(rules.springLand, 'hurtPlayer')) danger.push('⚠ Some springs are traps!');
  if (rules.enemyToughness > 1) danger.push(`🛡 Enemies take ${rules.enemyToughness} stomps`);
  if (rules.flyerToughness > 1) danger.push(`🛡 Flyers take ${rules.flyerToughness} stomps`);
  if (scriptsContain(rules.alienBottom, 'gameOver') || scriptsContain(rules.bruteBottom, 'gameOver') || scriptsContain(rules.bomberBottom, 'gameOver')) {
    danger.push("👽 Don't let the aliens reach the bottom!");
  }
  if (scriptsContain(rules.alienShip, 'hurtPlayer') || scriptsContain(rules.bruteShip, 'hurtPlayer') || scriptsContain(rules.bomberShip, 'hurtPlayer')) {
    danger.push('👽 Alien contact hurts your ship');
  }
  if (scriptsContain(rules.bombHit, 'hurtPlayer')) danger.push('💣 Dodge the falling bombs!');
  const armor = Math.max(rules.alienToughness, rules.bruteToughness, rules.bomberToughness);
  if (armor > 1) danger.push(`🛡 Armored aliens take ${armor} blaster hits`);
  for (const script of rules.gameStart) {
    for (const a of script) {
      if (a.kind === 'setAmmo') danger.push(`🔫 Only ${a.n} shots — make them count!`);
      else if (a.kind === 'setPace' && a.pace === 'fast') danger.push('🔥 The armada marches FAST');
      else if (a.kind === 'setPace' && a.pace === 'slow') goals.push('🐢 The armada marches slowly');
    }
  }
  if (scriptsContain(rules.touchCoin, 'changeScore')) danger.push('🪙 Crystals give points');
  void def; // level layout no longer needed — the per-type rules tell the whole story

  return { controls, goals: [...new Set(goals)], danger: [...new Set(danger)] };
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
  spiky: `${X}
<block type="arcade_when_touch_me" x="16" y="16"><next><block type="arcade_hurt_player"><next><block type="arcade_play_sound"><field name="SOUND">thud</field></block></next></block></next></block>
</xml>`,
  flyer: `${X}
<block type="arcade_when_stomped" x="16" y="16"><next><block type="arcade_disappear"><next><block type="arcade_bounce_player"><next><block type="arcade_play_sound"><field name="SOUND">pop</field></block></next></block></next></block></next></block>
<block type="arcade_when_touch_side" x="16" y="200"><next><block type="arcade_hurt_player"><next><block type="arcade_play_sound"><field name="SOUND">thud</field></block></next></block></next></block>
</xml>`,
  spring: `${X}
<block type="arcade_when_landed" x="16" y="16"><next><block type="arcade_launch"><next><block type="arcade_play_sound"><field name="SOUND">boing</field></block></next></block></next></block>
</xml>`,
  flag: `${X}
<block type="arcade_when_touch_me" x="16" y="16"><next><block type="arcade_win"></block></next></block>
</xml>`,
  game: `${X}
<block type="arcade_when_game_starts" x="16" y="16"><next><block type="arcade_set_lives"><field name="N">3</field></block></next></block>
</xml>`,
  alien: `${X}
<block type="arcade_when_blaster_hits" x="16" y="16"><next><block type="arcade_change_score"><field name="N">1</field><next><block type="arcade_disappear"><next><block type="arcade_play_sound"><field name="SOUND">pop</field></block></next></block></next></block></next></block>
<block type="arcade_when_reach_bottom" x="16" y="230"><next><block type="arcade_game_over"></block></next></block>
<block type="arcade_when_touch_ship" x="16" y="340"><next><block type="arcade_hurt_player"></block></next></block>
</xml>`,
  brute: `${X}
<block type="arcade_when_blaster_hits" x="16" y="16"><next><block type="arcade_change_score"><field name="N">2</field><next><block type="arcade_disappear"><next><block type="arcade_play_sound"><field name="SOUND">pop</field></block></next></block></next></block></next></block>
<block type="arcade_armor" x="16" y="230"><field name="N">2</field></block>
<block type="arcade_when_reach_bottom" x="16" y="330"><next><block type="arcade_game_over"></block></next></block>
<block type="arcade_when_touch_ship" x="16" y="440"><next><block type="arcade_hurt_player"></block></next></block>
</xml>`,
  bomber: `${X}
<block type="arcade_when_blaster_hits" x="16" y="16"><next><block type="arcade_change_score"><field name="N">1</field><next><block type="arcade_disappear"><next><block type="arcade_play_sound"><field name="SOUND">pop</field></block></next></block></next></block></next></block>
<block type="arcade_when_bomb_hits" x="16" y="230"><next><block type="arcade_hurt_player"></block></next></block>
<block type="arcade_when_reach_bottom" x="16" y="340"><next><block type="arcade_game_over"></block></next></block>
</xml>`,
  ammo: `${X}
<block type="arcade_when_caught" x="16" y="16"><next><block type="arcade_add_shots"><field name="N">5</field><next><block type="arcade_disappear"><next><block type="arcade_play_sound"><field name="SOUND">chime</field></block></next></block></next></block></next></block>
</xml>`,
};

/** Ensure a loaded draft (possibly saved before scripts existed) has all script sheets */
export function withScripts(def: Omit<GameDef, 'scripts'> & { scripts?: Partial<Record<ScriptOwner, string>> }): GameDef {
  return { ...def, scripts: { ...DEFAULT_SCRIPTS, ...(def.scripts ?? {}) } };
}

// Fresh Free Build levels start with EMPTY sheets — certified students wire
// every element themselves (keys, coins, dangers, springs, the win). The
// classic DEFAULT_SCRIPTS remain for missions and for migrating old saves.
const EMPTY_SHEET = `${X}</xml>`;
export const STARTER_SCRIPTS: Record<ScriptOwner, string> = {
  player: EMPTY_SHEET, coin: EMPTY_SHEET, spike: EMPTY_SHEET, enemy: EMPTY_SHEET,
  spiky: EMPTY_SHEET, flyer: EMPTY_SHEET, spring: EMPTY_SHEET, flag: EMPTY_SHEET, game: EMPTY_SHEET,
  alien: EMPTY_SHEET, brute: EMPTY_SHEET, bomber: EMPTY_SHEET, ammo: EMPTY_SHEET,
};

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
    scripts: { ...STARTER_SCRIPTS },
  };
}

/** Defender board sizes — wide sweeps sideways, tall gives the armada a long descent */
export type DefenderShape = 'classic' | 'wide' | 'tall';
export const DEFENDER_SHAPES: Record<DefenderShape, { cols: number; rows: number; label: string; blurb: string }> = {
  classic: { cols: COLS, rows: ROWS, label: 'Classic', blurb: 'One-screen space battle' },
  wide:    { cols: 36, rows: ROWS,   label: 'Wide',    blurb: 'A broad battlefield, almost 2 screens wide — fly to defend every sector' },
  tall:    { cols: COLS, rows: 22,   label: 'Tall',    blurb: 'The armada starts WAY up high — watch the map as it descends' },
};

/** Fresh Space Defender arena: an alien armada up top, your ship below —
 *  and every sheet empty. Wire the fire button yourself, commander. */
export function starterDefenderLevel(shape: DefenderShape = 'classic'): GameDef {
  const { cols, rows } = DEFENDER_SHAPES[shape];
  const objects: PlacedObject[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 3; col <= cols - 4; col += 2) {
      objects.push({ type: 'alien', x: col, y: 2 + row });
    }
  }
  objects.push({ type: 'spawn', x: Math.floor(cols / 2), y: rows - 2 });
  return {
    title: 'My Space Battle',
    backdrop: 'space',
    cols,
    rows,
    objects,
    scripts: { ...STARTER_SCRIPTS },
    genre: 'defender',
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
