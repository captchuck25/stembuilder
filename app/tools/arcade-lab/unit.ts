// Arcade Lab — Missions unit: 10 fix-the-broken-game challenges + quiz.
// Each mission hands the student a game with something deliberately missing or
// wrong. The level design guarantees you cannot win until it's fixed (or a
// requirements check enforces the fix), so "beat it" IS the assessment.

import {
  ArcadeAction, Backdrop, CompiledRules, GameDef, PlacedObject, ScriptOwner,
  COLS, ROWS, DEFAULT_SCRIPTS, span,
} from './engine/types';

const X = '<xml xmlns="https://developers.google.com/blockly/xml">';
const EMPTY = `${X}</xml>`;

// Script variants used by missions
const P_LEFT_RIGHT_ONLY = `${X}
<block type="arcade_when_key" x="16" y="16"><field name="KEY">left</field><next><block type="arcade_move"><field name="DIR">left</field></block></next></block>
<block type="arcade_when_key" x="16" y="130"><field name="KEY">right</field><next><block type="arcade_move"><field name="DIR">right</field></block></next></block>
</xml>`;

const P_SCRAMBLED = `${X}
<block type="arcade_when_key" x="16" y="16"><field name="KEY">left</field><next><block type="arcade_jump"></block></next></block>
<block type="arcade_when_key" x="16" y="130"><field name="KEY">right</field><next><block type="arcade_move"><field name="DIR">left</field></block></next></block>
<block type="arcade_when_key" x="16" y="244"><field name="KEY">up</field><next><block type="arcade_move"><field name="DIR">right</field></block></next></block>
</xml>`;

const ENEMY_SIDE_ONLY = `${X}
<block type="arcade_when_touch_side" x="16" y="16"><next><block type="arcade_hurt_player"><next><block type="arcade_play_sound"><field name="SOUND">thud</field></block></next></block></next></block>
</xml>`;

function gameWinAtScore(n: number) {
  return `${X}
<block type="arcade_when_game_starts" x="16" y="16"><next><block type="arcade_set_lives"><field name="N">3</field></block></next></block>
<block type="arcade_when_score" x="16" y="150"><field name="N">${n}</field><next><block type="arcade_win"></block></next></block>
</xml>`;
}

// ── Mission + check types ────────────────────────────────────────────────────

export interface Requirement {
  bucket: 'keys' | 'touchCoin' | 'touchSpike' | 'touchFlag' | 'enemyTop' | 'enemySide' | 'gameStart' | 'scoreRules';
  kind: ArcadeAction['kind'];
  min?: number;
  max?: number;
  /** For disappearAll: which object type must be targeted */
  target?: string;
  /** Shown to the student when the requirement is missing */
  label: string;
}

export interface CapstoneSpec {
  minCoins: number;
  minSpikes: number;
  minEnemies: number;
}

export interface ArcadeMission {
  title: string;
  /** The mission briefing shown beside the game */
  brief: string;
  hint: string;
  backdrop: Backdrop;
  objects: PlacedObject[];
  scripts: Record<ScriptOwner, string>;
  /** Which script sheets the student may edit (others show locked) */
  editableOwners: ScriptOwner[];
  designEditable: boolean;
  requirements: Requirement[];
  capstone?: CapstoneSpec;
}

const ground = () => span('platform', 0, COLS - 1, ROWS - 1);
const groundExcept = (skip: number[]) =>
  span('platform', 0, COLS - 1, ROWS - 1).filter(o => !skip.includes(o.x));

function scriptsWith(overrides: Partial<Record<ScriptOwner, string>>): Record<ScriptOwner, string> {
  return { ...DEFAULT_SCRIPTS, ...overrides };
}

export const ARCADE_MISSIONS: ArcadeMission[] = [
  // 1 ── wire a key
  {
    title: 'Power Up',
    brief: 'STEM Bot is frozen! The keyboard does nothing, because NO keys are wired — a game only does what its code says. Open the Player sheet, wire the → key to move right, and beat the level.',
    hint: 'Drag out "when → key is pressed" and snap "move →" underneath it. Prefer letters? Wire D, A, and W instead — your keyboard, your choice!',
    backdrop: 'hills',
    objects: [...ground(), { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 }],
    scripts: scriptsWith({ player: EMPTY }),
    editableOwners: ['player'],
    designEditable: false,
    requirements: [],
  },
  // 2 ── wire jump
  {
    title: 'Learn to Jump',
    brief: 'You can walk — but there is a wall and a pit in the way, and the jump key was never wired. Add it to the Player sheet.',
    hint: 'You need a third event hat: "when ↑ key is pressed → jump".',
    backdrop: 'hills',
    objects: [
      ...groundExcept([13, 14]),
      { type: 'platform', x: 9, y: 10 }, { type: 'platform', x: 9, y: 9 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({ player: P_LEFT_RIGHT_ONLY }),
    editableOwners: ['player'],
    designEditable: false,
    requirements: [],
  },
  // 3 ── coin rules
  {
    title: 'Crystals That Count',
    brief: 'This game wins when the score reaches 3 (check the Game sheet) — but touching a crystal does absolutely nothing. Write the Crystal rules: add to the score and make it disappear.',
    hint: 'On the Crystal sheet: "when the player touches me" → "change score by 1" → "disappear".',
    backdrop: 'cave',
    objects: [
      ...ground(),
      { type: 'coin', x: 5, y: 10 }, { type: 'coin', x: 9, y: 10 }, { type: 'coin', x: 13, y: 10 },
      { type: 'spawn', x: 1, y: 10 },
    ],
    scripts: scriptsWith({ coin: EMPTY, game: gameWinAtScore(3) }),
    editableOwners: ['coin'],
    designEditable: false,
    requirements: [
      { bucket: 'touchCoin', kind: 'changeScore', label: 'Crystals must change the score' },
      { bucket: 'touchCoin', kind: 'disappear', label: 'Crystals should disappear when collected' },
    ],
  },
  // 4 ── spike rules
  {
    title: 'Danger Zone',
    brief: 'Walk straight across the spikes — nothing happens. A game with no danger is no game at all! Make spikes hurt, then beat the level the honest way.',
    hint: 'On the Spikes sheet: "when the player touches me" → "hurt the player". Then jump over them!',
    backdrop: 'cave',
    objects: [
      ...ground(),
      { type: 'spike', x: 7, y: 10 }, { type: 'spike', x: 8, y: 10 },
      { type: 'spike', x: 12, y: 10 }, { type: 'spike', x: 13, y: 10 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({ spike: EMPTY }),
    editableOwners: ['spike'],
    designEditable: false,
    requirements: [
      { bucket: 'touchSpike', kind: 'hurtPlayer', label: 'Spikes must hurt the player' },
    ],
  },
  // 5 ── stomp rules
  {
    title: 'Stomp School',
    brief: 'The enemy hurts you from the side — but landing on its head does nothing. Enemies have TWO event hats. Write the head-stomp rule: squash it and bounce the player.',
    hint: '"when the player lands on my head" → "disappear" → "bounce the player up".',
    backdrop: 'candy',
    objects: [
      ...ground(),
      { type: 'enemy', x: 10, y: 10 },
      { type: 'coin', x: 6, y: 10 }, { type: 'coin', x: 14, y: 10 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({ enemy: ENEMY_SIDE_ONLY }),
    editableOwners: ['enemy'],
    designEditable: false,
    requirements: [
      { bucket: 'enemyTop', kind: 'disappear', label: 'A stomp must squash the enemy (disappear)' },
      { bucket: 'enemyTop', kind: 'bouncePlayer', label: 'Give the player a bounce after the stomp' },
    ],
  },
  // 6 ── chain reaction: crystals unlock the flag
  {
    title: 'The Crystal Key',
    brief: 'The flag is sealed inside a spike cage — there is NO way through. The 5 crystals are the key: add a Game rule so that when the score reaches 5, ALL the spikes disappear. Then walk in and claim the flag.',
    hint: 'On the Game sheet: "when the score reaches 5" → "make all 🔺 spikes disappear". Watch the cage open!',
    backdrop: 'hills',
    objects: [
      ...ground(),
      { type: 'platform', x: 5, y: 8 }, { type: 'platform', x: 6, y: 8 },
      { type: 'platform', x: 10, y: 7 }, { type: 'platform', x: 11, y: 7 },
      { type: 'coin', x: 3, y: 10 }, { type: 'coin', x: 5, y: 7 }, { type: 'coin', x: 11, y: 6 },
      { type: 'coin', x: 8, y: 10 }, { type: 'coin', x: 13, y: 10 },
      // the cage: spike floor + a roof so there is no way in from above
      { type: 'platform', x: 15, y: 8 }, { type: 'platform', x: 16, y: 8 },
      { type: 'platform', x: 17, y: 8 }, { type: 'platform', x: 18, y: 8 }, { type: 'platform', x: 19, y: 8 },
      { type: 'spike', x: 15, y: 10 }, { type: 'spike', x: 16, y: 10 },
      { type: 'spike', x: 17, y: 10 }, { type: 'spike', x: 19, y: 10 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({}),
    editableOwners: ['game'],
    designEditable: false,
    requirements: [
      { bucket: 'scoreRules', kind: 'disappearAll', target: 'spike', label: 'When the score reaches 5, make all the spikes disappear' },
    ],
  },
  // 7 ── lives / difficulty tuning
  {
    title: 'The Gauntlet',
    brief: 'This spike gauntlet is brutal — 3 lives is not enough for most players. Game designers tune difficulty with numbers. Give the player 5 lives, then prove the gauntlet can be survived.',
    hint: 'On the Game sheet, change "set lives to 3" — or add a new one with a bigger number.',
    backdrop: 'space',
    objects: [
      ...ground(),
      { type: 'spike', x: 5, y: 10 }, { type: 'spike', x: 6, y: 10 }, { type: 'spike', x: 7, y: 10 },
      { type: 'spike', x: 10, y: 10 }, { type: 'spike', x: 11, y: 10 },
      { type: 'spike', x: 14, y: 10 }, { type: 'spike', x: 15, y: 10 },
      { type: 'coin', x: 9, y: 10 }, { type: 'coin', x: 13, y: 10 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({}),
    editableOwners: ['game'],
    designEditable: false,
    requirements: [
      { bucket: 'gameStart', kind: 'setLives', min: 5, label: 'Set lives to 5 or more' },
    ],
  },
  // 8 ── debugging
  {
    title: 'Scrambled Controls',
    brief: 'Someone mixed up ALL the wiring — pressing keys does the wrong things! Do not delete everything. Read the Player sheet like a detective, find what is wrong, and fix it. That is called debugging.',
    hint: 'Each hat has the wrong action under it. Check what each key SHOULD do, then swap the actions around.',
    backdrop: 'space',
    objects: [
      ...groundExcept([12, 13]),
      { type: 'platform', x: 7, y: 10 }, { type: 'platform', x: 7, y: 9 },
      { type: 'coin', x: 10, y: 10 }, { type: 'coin', x: 16, y: 10 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({ player: P_SCRAMBLED }),
    editableOwners: ['player'],
    designEditable: false,
    requirements: [],
  },
  // 9 ── design challenge
  {
    title: 'Mission: Impossible?',
    brief: 'Nothing is wrong with the code this time — the DESIGN is broken: the goal cannot be reached. Switch to Design mode and rebuild the level so it CAN be beaten. Level design is engineering too.',
    hint: 'The gap is too wide to jump. Add platforms (🧱) to build a path across.',
    backdrop: 'candy',
    objects: [
      ...span('platform', 0, 4, 11),
      ...span('platform', 15, 19, 11),
      { type: 'coin', x: 3, y: 10 }, { type: 'coin', x: 16, y: 10 },
      { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 },
    ],
    scripts: scriptsWith({}),
    editableOwners: [],
    designEditable: true,
    requirements: [],
  },
  // 10 ── mini-capstone
  {
    title: 'Your First Real Game',
    brief: 'Everything is unlocked: design AND code. Build a short level another student would enjoy — at least 3 crystals to guide the way, at least 1 spike and 1 enemy for danger. Keep it fair, and prove it: beat it yourself.',
    hint: 'Danger is fun; impossible is frustrating. Test with ▶ Play as you build!',
    backdrop: 'hills',
    objects: [...ground(), { type: 'spawn', x: 1, y: 10 }, { type: 'flag', x: 18, y: 10 }],
    scripts: scriptsWith({}),
    editableOwners: ['player', 'coin', 'spike', 'enemy', 'flag', 'game'],
    designEditable: true,
    requirements: [],
    capstone: { minCoins: 3, minSpikes: 1, minEnemies: 1 },
  },
];

// ── Requirement checking ─────────────────────────────────────────────────────

function actionMatches(a: ArcadeAction, req: Requirement): boolean {
  if (a.kind !== req.kind) return false;
  const n = 'n' in a ? a.n : undefined;
  if (req.min !== undefined && (n === undefined || n < req.min)) return false;
  if (req.max !== undefined && (n === undefined || n > req.max)) return false;
  if (req.target !== undefined && (!('target' in a) || a.target !== req.target)) return false;
  return true;
}

function bucketActions(rules: CompiledRules, bucket: Requirement['bucket']): ArcadeAction[] {
  switch (bucket) {
    case 'keys': return rules.keys.flatMap(k => k.actions);
    case 'scoreRules': return rules.scoreRules.flatMap(r => r.actions);
    case 'touchCoin': return rules.touchCoin.flat();
    case 'touchSpike': return rules.touchSpike.flat();
    case 'touchFlag': return rules.touchFlag.flat();
    case 'enemyTop': return rules.enemyTop.flat();
    case 'enemySide': return rules.enemySide.flat();
    case 'gameStart': return rules.gameStart.flat();
  }
}

/** Returns the labels of requirements the current rules do NOT satisfy */
export function checkRequirements(rules: CompiledRules, reqs: Requirement[]): string[] {
  return reqs
    .filter(req => !bucketActions(rules, req.bucket).some(a => actionMatches(a, req)))
    .map(req => req.label);
}

/** Returns missing capstone design requirements */
export function checkCapstone(def: GameDef, spec: CapstoneSpec): string[] {
  const count = (t: string) => def.objects.filter(o => o.type === t).length;
  const missing: string[] = [];
  if (count('coin') < spec.minCoins) missing.push(`Place at least ${spec.minCoins} crystals (you have ${count('coin')})`);
  if (count('spike') < spec.minSpikes) missing.push(`Place at least ${spec.minSpikes} spike${spec.minSpikes > 1 ? 's' : ''}`);
  if (count('enemy') < spec.minEnemies) missing.push(`Place at least ${spec.minEnemies} enem${spec.minEnemies > 1 ? 'ies' : 'y'}`);
  return missing;
}

// ── Quiz ─────────────────────────────────────────────────────────────────────

export interface ArcadeQuizQ {
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

export const ARCADE_QUIZ: ArcadeQuizQ[] = [
  {
    question: 'Which kind of block STARTS a script running?',
    options: [
      'A yellow event block, like "when the player touches me"',
      'A move block',
      'A sound block',
      'Any block starts a script',
    ],
    answer: 0,
    explanation: 'Event blocks (the yellow "hats") wait for something to happen — a key press, a touch, the game starting — and then run the blocks under them.',
  },
  {
    question: 'The Crystal sheet says: "when the player touches me → change score by 1". There are 6 crystals in the level. What happens?',
    options: [
      'Only the first crystal works',
      'Every crystal follows the same rule — each one adds 1 when touched',
      'The score jumps by 6 when you touch any crystal',
      'Nothing — you need 6 separate scripts',
    ],
    answer: 1,
    explanation: 'A script sheet belongs to the whole object TYPE. Write the rule once and every crystal in the level follows it.',
  },
  {
    question: 'You are holding → to run when you touch a crystal, so the crystal script fires too. What does the game do?',
    options: [
      'It pauses running until the crystal script finishes',
      'It ignores the crystal until you stop moving',
      'Both scripts run at the same time',
      'The game crashes',
    ],
    answer: 2,
    explanation: 'Game programs run many scripts at once — moving, collecting, patrolling enemies. That is called running in parallel.',
  },
  {
    question: 'Score and lives are numbers the game remembers and changes while you play. Programmers call values like these…',
    options: ['Sprites', 'Variables', 'Backdrops', 'Levels'],
    answer: 1,
    explanation: 'A variable is a named value the program can read and change — score goes up when you collect, lives go down when you get hurt.',
  },
  {
    question: 'Your spikes are not hurting the player. What is the FIRST thing a good programmer does?',
    options: [
      'Delete all the code and start over',
      'Add ten more spikes to the level',
      'Open the Spikes sheet and read the script — is there an event hat with "hurt the player" under it?',
      'Assume the game is broken and give up',
    ],
    answer: 2,
    explanation: 'Debugging starts with reading. Find the sheet that controls the behavior, check the event hat and its actions, and fix only what is wrong.',
  },
];

// ── Unit progress (local + cloud on tool "arcade-lab", level_idx 1) ──────────

export interface ArcadeUnitProgress {
  completed: Record<number, boolean>;
  quizScore: number | null;
  unitComplete: boolean;
}

const UNIT_KEY = 'arcade_lab_unit';

export function emptyUnitProgress(): ArcadeUnitProgress {
  return { completed: {}, quizScore: null, unitComplete: false };
}

export function loadUnitProgress(): ArcadeUnitProgress {
  try {
    const raw = localStorage.getItem(UNIT_KEY);
    if (raw) return { ...emptyUnitProgress(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyUnitProgress();
}

export function saveUnitProgress(p: ArcadeUnitProgress) {
  try { localStorage.setItem(UNIT_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export async function loadCloudUnitProgress(): Promise<ArcadeUnitProgress> {
  const p = emptyUnitProgress();
  try {
    const res = await fetch('/api/progress?tool=arcade-lab');
    const rows = res.ok ? await res.json() : [];
    for (const row of rows ?? []) {
      if (row.level_idx !== 1) continue;
      if (row.challenge_idx >= 0 && row.completed) p.completed[row.challenge_idx] = true;
      if (row.challenge_idx === -1) {
        if (row.completed) p.unitComplete = true;
        if (typeof row.quiz_score === 'number') p.quizScore = row.quiz_score;
      }
    }
  } catch { /* ignore */ }
  return p;
}

export function mergeUnitProgress(a: ArcadeUnitProgress, b: ArcadeUnitProgress): ArcadeUnitProgress {
  return {
    completed: { ...a.completed, ...b.completed },
    quizScore: Math.max(a.quizScore ?? -1, b.quizScore ?? -1) >= 0 ? Math.max(a.quizScore ?? 0, b.quizScore ?? 0) : null,
    unitComplete: a.unitComplete || b.unitComplete,
  };
}

export function syncUnitToCloud(ci: number | null, completed: boolean, quizScore?: number) {
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'arcade-lab', level_idx: 1, challenge_idx: ci ?? -1,
      completed, quiz_score: quizScore ?? null,
    }),
  }).catch(() => { /* offline is fine — localStorage has it */ });
}
