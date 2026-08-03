import { Direction } from './engine/animation';
import { ThemeName } from './engine/themes';

export interface Collectible { x: number; y: number; }

export interface BlockChallenge {
  title: string;
  hint: string;
  /** Block-count target for the 3rd star — solve with this many blocks or fewer */
  par: number;
  /** Hard cap: Run refuses above this. Set between par (with headroom for other
   *  valid approaches) and the brute-force cost, so literal step-by-step
   *  scripts can't skip the unit's concept. Unit 1 has none — sequencing IS
   *  the lesson there. */
  maxBlocks?: number;
  /** Exact toolbox for this challenge (block ids). Missing = cumulative
   *  unlock via blocksForLevel. Used to keep each unit honest: no Repeat
   *  count-cheese in the conditionals unit, no while wall-follow in the
   *  nested unit, no repeat-of-raw-body in the functions unit. */
  blockIds?: string[];
  grid: number[][];
  startX: number; startY: number; startDir: Direction;
  exitX: number; exitY: number;
  collectibles: Collectible[];
}

export interface QuizQ {
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface BlockUnit {
  id: number;
  title: string;
  tagline: string;
  color: string;
  theme: ThemeName;
  /** Mission briefing — the story hook shown on the unit intro page */
  story: string;
  introNotes: string;
  newBlocks: { blockId: string; label: string; desc: string }[];
  challenges: BlockChallenge[];
  quiz: QuizQ[];
}

// ─── Unit 1 — Sequence (Desert) ───────────────────────────────────────────────

const U1: BlockUnit = {
  id: 1,
  title: 'Sequence',
  tagline: 'Give STEM Bot step-by-step instructions',
  color: '#D97706',
  theme: 'desert',
  story: 'STEM Bot the explorer has touched down in the Great Amber Desert on an important mission: recover the rare power crystals its rocket needs for the flight home. Guide the bot through the canyons one instruction at a time — collect the crystals, and raise a flag at every waypoint.',
  introNotes: `# Unit 1 — Sequence

## What Is a Program?
A **program** is a list of instructions you give to a computer. The computer follows them **one at a time, top to bottom**, in the exact order you wrote them.

In Block Lab you control STEM Bot through a desert maze. STEM Bot understands four instructions:

| Block | What it does |
|---|---|
| **Move Forward** | Move one step in the direction you are facing |
| **Turn Left** | Rotate 90° counter-clockwise (left) |
| **Turn Right** | Rotate 90° clockwise (right) |
| **Collect** | Pick up the item on the square you are standing on |

Here is a real program — read it top to bottom, exactly like STEM Bot does:

:::blocks
move
move
collect
turn right
move
:::

That reads: two steps, pick up the crystal, turn, one more step.

## Turning vs. Moving
Turning changes the direction STEM Bot faces — **but it does not move**. After turning you still need Move Forward to actually step forward.

## Collecting
Walking over a crystal is not enough — STEM Bot has to stop **on** the crystal's square and use **Collect** to pick it up. Using Collect on an empty square is safe: nothing happens.

## Order Matters
If you put the blocks in the wrong order, STEM Bot goes the wrong way. Read your script like a recipe — top to bottom — before you hit Run.

## Errors
If STEM Bot tries to walk into a wall, the program stops. Look at what the bot was trying to do and fix the block that caused the problem.

## Your Goal
Guide STEM Bot to the waypoint flag at the end of each maze. Collect every crystal along the way (stand on it, then use Collect!) and stay at or under the block **par** to earn all 3 stars. The mazes get longer and twistier as you go — by Challenge 10 you'll notice something interesting about your scripts…`,

  newBlocks: [
    { blockId: 'move_forward', label: 'Move Forward', desc: 'Move one step in the direction you are facing.' },
    { blockId: 'turn_left',    label: 'Turn Left',    desc: 'Rotate 90° to the left (counter-clockwise).' },
    { blockId: 'turn_right',   label: 'Turn Right',   desc: 'Rotate 90° to the right (clockwise).' },
    { blockId: 'collect',      label: 'Collect',      desc: 'Pick up the item on the square STEM Bot is standing on.' },
  ],

  challenges: [
    {
      title: 'First Steps',
      par: 5,
      hint: 'Click Move Forward to take one step at a time. Reach the gold marker!',
      grid: [[1,1,1,1,1,1],[0,0,0,0,0,0],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:1, collectibles:[],
    },
    {
      title: 'Right Turn Ahead',
      par: 8,
      hint: 'Walk to the wall, then Turn Right to change direction.',
      grid: [[1,1,1,1,1],[0,0,0,0,1],[1,1,1,0,1],[1,1,1,0,0],[1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:4, exitY:3, collectibles:[],
    },
    {
      title: 'Two Turns',
      par: 9,
      hint: 'You will need to turn twice. Think ahead before you start!',
      grid: [[1,1,1,1,1,1],[0,0,0,1,1,1],[1,1,0,1,1,1],[1,1,0,0,0,0],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:3, collectibles:[],
    },
    {
      title: 'The Long Way',
      par: 12,
      hint: 'A longer corridor then a turn — count your steps carefully.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3, collectibles:[],
    },
    {
      title: 'Desert Crystals',
      par: 13,
      hint: 'Stop on each crystal and use Collect to pick it up — then head for the flag.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:3,
      collectibles:[{x:2,y:1},{x:5,y:1}],
    },
    {
      title: 'U-Turn',
      par: 13,
      hint: 'Follow the path all the way around — three turns to get home.',
      grid: [[1,1,1,1,1,1],[0,0,0,0,0,1],[1,1,1,1,0,1],[1,1,1,1,0,1],[0,0,0,0,0,1],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:4, collectibles:[],
    },
    {
      title: 'Winding Road',
      par: 15,
      hint: 'Four turns — read your path like a map before placing blocks.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,1,1,1,1],[1,1,1,0,1,1,1,1],[1,1,1,0,0,0,1,1],[1,1,1,1,1,0,1,1],[1,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5, collectibles:[],
    },
    {
      title: 'Triple Crystal',
      par: 16,
      hint: 'Three crystals along the path — remember to Collect each one!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:3,
      collectibles:[{x:2,y:1},{x:5,y:1},{x:8,y:1}],
    },
    {
      title: 'The S-Curve',
      par: 12,
      hint: 'Right, down, right, down — four segments, three turns.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,1,1,1],[1,1,1,0,1,1,1],[1,1,1,0,0,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:5, collectibles:[],
    },
    {
      title: 'Desert Boss',
      par: 24,
      hint: 'The biggest sequential maze yet. Map out every turn — and Collect all three crystals!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,1,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1,1],[1,1,0,0,0,0,1,1,1,1],[1,1,1,1,1,0,1,1,1,1],[1,1,1,1,1,0,0,0,1,1],[1,1,1,1,1,1,1,0,1,1],[1,1,1,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:7,
      collectibles:[{x:2,y:3},{x:5,y:5},{x:7,y:7}],
    },
  ],

  quiz: [
    {
      question: 'When STEM Bot runs your program, it executes the blocks…',
      options: ['All at the same time', 'Top to bottom, one at a time', 'Bottom to top', 'In a random order'],
      answer: 1,
      explanation: 'Programs are executed sequentially — each block runs fully before the next one begins.',
    },
    {
      question: 'What does Turn Right do on its own (without Move Forward after it)?',
      options: ['Moves STEM Bot one cell to the right', 'Rotates STEM Bot to face a new direction, but stays in the same cell', 'Moves STEM Bot diagonally', 'Does nothing'],
      answer: 1,
      explanation: 'Turning changes the direction STEM Bot faces but does NOT move it. You still need Move Forward to actually step.',
    },
    {
      question: 'STEM Bot is facing the TOP of the screen. After one Turn Right, which way is it facing?',
      options: ['The right side of the screen', 'The top of the screen', 'The bottom of the screen', 'The left side of the screen'],
      answer: 0,
      explanation: 'Turn Right spins STEM Bot 90° clockwise — from facing the top to facing the right side. Watch its arrow: it always points where the bot is facing.',
    },
    {
      question: 'STEM Bot crashed into a wall and the program stopped. What is the best thing to do next?',
      options: ['Delete everything and start over', 'Find the block that sent it the wrong way and fix just that part', 'Add extra Move Forward blocks to push through the wall', 'Run the exact same script again'],
      answer: 1,
      explanation: 'Programmers call this debugging: watch what the robot did, find the block where things went wrong, fix that one part, and run it again.',
    },
    {
      question: 'STEM Bot is facing the RIGHT side of the screen. Which script makes it face the LEFT side?',
      options: ['Turn Left twice', 'Turn Right once', 'Move Forward twice', 'Turn Left once'],
      answer: 0,
      explanation: 'Facing the opposite way is a half spin (180°). Each turn block is only 90°, so it takes two turns — Turn Left twice (or Turn Right twice) both work.',
    },
  ],
};

// ─── Unit 2 — Loops (Forest) ──────────────────────────────────────────────────

const U2: BlockUnit = {
  id: 2,
  title: 'Loops',
  tagline: 'Repeat instructions instead of writing them over and over',
  color: '#16A34A',
  theme: 'forest',
  story: 'The crystal trail leads into the Whispering Woods, where the paths are long and winding — and STEM Bot\'s battery is precious. There\'s a pattern to every trail here: teach the bot to repeat itself so every step counts, and gather acorn fuel cells along the way.',
  introNotes: `# Unit 2 — Loops

## The Problem With Counting
In Unit 1 you probably wrote something like this to cross a long corridor:

:::blocks
move
move
move
move
move
:::

That gets tedious. What if the corridor is 50 cells long? What if you want to change the number of steps?

## The Repeat Block
A **Repeat** block runs its body a fixed number of times:

| Block | What it does |
|---|---|
| **Repeat N** | Runs everything inside it exactly N times |

The blocks you put **inside** Repeat are called the **body**. The body can contain any blocks — even multiple blocks!

## Why This Is Powerful
Instead of writing Move Forward ten times you write:

:::blocks
repeat 10
  move
:::

If you want twelve steps instead, just change the 10 to a 12.

## Patterns
Loops shine when there is a **repeating pattern** in the maze. Look for paths where the same sequence of moves appears multiple times. That is your cue to use Repeat.

## Collect Inside Loops
Collect works great inside a loop. If acorns appear every 2 steps, then **Repeat { Move, Move, Collect }** scoops them all up. Remember: Collect on an empty square is safe — nothing happens — so a rhythm like this never breaks your program.

## Nesting
You can put Repeat inside another Repeat. This is called **nesting** and unlocks even more compact programs.

## Your Goal
Solve each maze using as few blocks as possible. The hint on each challenge tells you what the expected pattern is.`,

  newBlocks: [
    { blockId: 'repeat', label: 'Repeat N', desc: 'Run the blocks inside exactly N times.' },
  ],

  challenges: [
    {
      title: 'Long Trail',
      par: 3,
      maxBlocks: 6,
      hint: 'That is a very long corridor! Use Repeat so you don\'t write Move Forward nine times.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:1, collectibles:[],
    },
    {
      title: 'Double Stretch',
      par: 12,
      maxBlocks: 13,
      hint: 'Use Repeat for each straight section — and Collect both acorns on the way.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1],[1,1,1,1,0,1,1,1,1],[1,1,1,1,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3,
      collectibles:[{x:2,y:1},{x:6,y:3}],
    },
    {
      title: 'Staircase',
      par: 15,
      maxBlocks: 18,
      hint: 'Every stair is the same moves — put them (and a Collect) inside one Repeat!',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:6,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6}],
    },
    {
      title: 'Tall Staircase',
      par: 16,
      maxBlocks: 20,
      hint: 'Same staircase pattern but with 4 steps instead of 3. Just change the Repeat number!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1],[1,1,1,0,1,1,1,1,1],[1,1,1,0,0,1,1,1,1],[1,1,1,1,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:8,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6},{x:4,y:8}],
    },
    {
      title: 'Acorn Row',
      par: 5,
      maxBlocks: 9,
      hint: 'Acorns every other cell: Repeat { Move, Move, Collect } scoops them all up!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:11, exitY:1,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:6,y:1},{x:8,y:1},{x:10,y:1}],
    },
    {
      title: 'Triple Corridor',
      par: 18,
      maxBlocks: 24,
      hint: 'Three horizontal corridors stacked — Repeat gets you down each one.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,0,0,0,0,0,0,1],[1,0,1,1,1,1,1,1],[1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:3,y:1},{x:3,y:3},{x:4,y:5}],
    },
    {
      title: 'Square Route',
      par: 5,
      maxBlocks: 8,
      hint: 'Travel three sides of a square. Repeat 3 with { Move×3, Turn Right } does it!',
      grid: [[1,1,1,1,1],[0,0,0,0,1],[1,1,1,0,1],[1,1,1,0,1],[0,0,0,0,1],[1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:4, collectibles:[],
    },
    {
      title: 'Forest Maze',
      par: 18,
      maxBlocks: 22,
      hint: 'A winding forest path — combine Repeat and single-use blocks.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1,1],[1,1,1,1,0,1,1,1,1,1],[1,1,1,1,0,0,0,0,1,1],[1,1,1,1,1,1,1,0,1,1],[1,1,1,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:5,
      collectibles:[{x:2,y:1},{x:6,y:3},{x:8,y:5}],
    },
    {
      title: 'Zigzag Valley',
      par: 9,
      maxBlocks: 15,
      hint: 'The same zigzag repeats — one Repeat (with a Collect inside) solves it!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1],[1,1,1,0,1,1,1,1,1],[1,1,1,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:7,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6}],
    },
    {
      title: 'Forest Boss',
      par: 18,
      maxBlocks: 24,
      hint: 'Long corridors and a staircase all in one maze. Use Repeat wisely!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,1,1,1,1,1],[1,1,1,1,1,0,1,1,1,1,1],[1,1,1,1,1,0,0,1,1,1,1],[1,1,1,1,1,1,0,1,1,1,1],[1,1,1,1,1,1,0,0,1,1,1],[1,1,1,1,1,1,1,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:10, exitY:6,
      collectibles:[{x:2,y:1},{x:5,y:3},{x:6,y:5},{x:9,y:6}],
    },
  ],

  quiz: [
    {
      question: 'Repeat 6 { Move Forward } moves STEM Bot forward how many times?',
      options: ['1', '5', '6', '7'],
      answer: 2,
      explanation: 'Repeat 6 runs its body exactly 6 times — each time running Move Forward once.',
    },
    {
      question: 'Which is the better program for a 12-cell corridor?',
      options: ['Move Forward written 12 times', 'Repeat 12 { Move Forward }', 'Both are equally good', 'Neither works'],
      answer: 1,
      explanation: 'Repeat 12 { Move Forward } is shorter, easier to read, and easier to change if the corridor length changes.',
    },
    {
      question: 'You put Turn Right INSIDE a Repeat 4 block. How many times does STEM Bot turn?',
      options: ['1', '2', '4', '0'],
      answer: 2,
      explanation: 'Every block inside the loop body runs once per iteration. Repeat 4 means the body runs 4 times, so Turn Right runs 4 times.',
    },
    {
      question: 'Repeat 3 { Move Forward, Turn Right } makes STEM Bot trace what shape?',
      options: ['A straight line', 'An L-shape', 'Three sides of a square', 'A spiral'],
      answer: 2,
      explanation: 'Each iteration moves forward then turns 90° right. After 3 iterations you have moved along three sides of a square.',
    },
    {
      question: 'Repeat 3 { Repeat 2 { Move Forward } } — how many steps does STEM Bot take in total?',
      options: ['5', '6', '8', '12'],
      answer: 1,
      explanation: 'The inner loop takes 2 steps, and the outer loop runs it 3 times: 3 × 2 = 6 steps. Putting a loop inside a loop is called nesting.',
    },
  ],
};

// ─── Unit 3 — While & If (Space) ─────────────────────────────────────────────

const U3: BlockUnit = {
  id: 3,
  title: 'While & If',
  tagline: 'Let STEM Bot sense its surroundings and decide what to do',
  color: '#7C3AED',
  theme: 'space',
  story: 'Fully fueled at last, STEM Bot blasts off! But docking at the orbital station is the trickiest part of the trip — its corridors rearrange themselves on every visit, so no map will help. Upgrade the bot\'s sensors and teach it to feel its own way to the warp portal home.',
  introNotes: `# Unit 3 — While & If

## From Counting to Sensing
In Units 1 and 2 you told STEM Bot exactly how many steps to take. But what if the maze changes, or you don't know the length in advance?

**Sensors** let STEM Bot check its surroundings at runtime:

| Sensor | True when… |
|---|---|
| **While path ahead** | There is an open cell in front of STEM Bot |
| **While not at goal** | STEM Bot has not yet reached the goal |
| **If path ahead** | Open cell ahead (runs body once if true) |
| **If path left** | Open cell to the left |
| **If path right** | Open cell to the right |
| **If on a crystal** | STEM Bot is standing on an uncollected crystal |

## While Loops
A **while** loop keeps running its body **as long as a condition is true**:

:::blocks
while ahead
  move
:::

When the path is blocked the loop stops automatically. No counting needed!

## If Blocks
An **if** block runs its body **once** only if the condition is true at that moment. Combine multiple if blocks inside a while loop to create decision logic:

:::blocks
while goal
  if ahead
    move
  if left
    turn left
  if right
    turn right
:::

## Order Is Part of the Program
The ifs inside your loop run **in order, top to bottom, every single lap**. Early mazes won't care which check comes first — but keep going and you'll meet mazes where checking in the wrong order sends STEM Bot in circles forever. Choosing WHICH condition to check first is a real programming decision!

## Infinite Loops
If the condition is never false, the loop runs forever (or until the safety limit stops it). Always make sure the bot is actually making progress toward the goal.

## Your Goal
Use sensors so STEM Bot can navigate mazes without knowing the exact layout in advance. A good sensor program can solve many different mazes with the same code!

> Tip: **"If on a crystal → Collect"** inside your loop is the cleanest way to grab everything — the bot checks each square and collects only when something is really there. (Plain Collect in the loop also works: it is a safe no-op on empty squares.)`,

  newBlocks: [
    { blockId: 'while_path_ahead',  label: 'While path ahead',  desc: 'Keep running the body as long as there is an open cell ahead.' },
    { blockId: 'while_not_at_goal', label: 'While not at goal', desc: 'Keep running the body until STEM Bot reaches the goal.' },
    { blockId: 'if_path_ahead',     label: 'If path ahead',     desc: 'Run the body once if there is an open cell ahead.' },
    { blockId: 'if_path_left',      label: 'If path left',      desc: 'Run the body once if there is an open cell to the left.' },
    { blockId: 'if_path_right',     label: 'If path right',     desc: 'Run the body once if there is an open cell to the right.' },
    { blockId: 'if_on_item',        label: 'If on a crystal',   desc: 'Run the body once if STEM Bot is standing on an uncollected crystal.' },
  ],

  challenges: [
    {
      title: 'Straight Shot',
      par: 3,
      maxBlocks: 4,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'A condition beats counting: "While not at goal → Move Forward" walks any distance!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:1, collectibles:[],
    },
    {
      title: 'Same Code, Longer Road',
      par: 3,
      maxBlocks: 4,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'A much longer hallway — run the EXACT program from Challenge 1. Conditions adapt; counting does not!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:11, exitY:1, collectibles:[],
    },
    {
      title: 'One Right Turn',
      par: 6,
      maxBlocks: 6,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: '"While path ahead" walks to the wall. Turn toward the goal, then let "While not at goal" finish the job.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,0,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:4, collectibles:[],
    },
    {
      title: 'Right Turns Only',
      par: 6,
      maxBlocks: 6,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'Three turns — every one to the right. "If path ahead → Move" plus "If path right → Turn Right" in one loop handles them all.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:2, exitY:4, collectibles:[],
    },
    {
      title: 'One Left Turn',
      par: 6,
      maxBlocks: 6,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'This goal is up the OTHER way — walk to the wall, Turn Left, then "While not at goal".',
      grid: [[1,1,1,1,1,1,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[0,0,0,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:4, startDir:'right', exitX:5, exitY:1, collectibles:[],
    },
    {
      title: 'Left Turns Only',
      par: 6,
      maxBlocks: 6,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'Three turns, all to the left this time. Swap your fallback to "If path left → Turn Left".',
      grid: [[1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1]],
      startX:0, startY:4, startDir:'right', exitX:1, exitY:1, collectibles:[],
    },
    {
      title: 'Crystal Scanner',
      par: 8,
      maxBlocks: 9,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'Crystals! Add "If on a crystal → Collect" to your loop and the bot grabs every one it crosses.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:4,
      collectibles:[{x:2,y:1},{x:5,y:1},{x:6,y:3}],
    },
    {
      title: 'Both Ways',
      par: 9,
      maxBlocks: 10,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'This path turns BOTH ways. Your loop needs an "If path right" AND an "If path left" — plus the crystal scanner.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1],[1,1,1,1,0,1,1,1,1],[1,1,1,1,0,0,0,0,1],[1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:2,y:1},{x:6,y:3},{x:7,y:4}],
    },
    {
      title: 'The Loop Trap',
      par: 9,
      maxBlocks: 10,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'A ring that goes in circles! Check "If path left" BEFORE moving ahead — or the bot orbits forever. The ORDER of your conditions matters!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,1,1],[1,0,1,1,1,1,1,0,0,1],[1,0,1,1,1,1,1,0,1,1],[1,0,0,0,0,0,0,0,1,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:1, startY:1, startDir:'right', exitX:8, exitY:2,
      collectibles:[{x:3,y:1},{x:6,y:1}],
    },
    {
      title: 'The Mirror Trap',
      par: 9,
      maxBlocks: 10,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'while_not_at_goal', 'if_path_ahead', 'if_path_left', 'if_path_right', 'if_on_item'],
      hint: 'The mirror ring: this time check "If path right" FIRST. Try the wrong order and watch what happens!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[1,1,0,0,0,0,0,0,0,1],[1,0,0,1,1,1,1,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:8, startY:1, startDir:'left', exitX:1, exitY:2,
      collectibles:[{x:6,y:1},{x:3,y:1}],
    },
  ],

  quiz: [
    {
      question: '"While path ahead" keeps running until…',
      options: ['STEM Bot reaches the goal', 'There is no longer an open cell directly ahead', 'The program has run 10 times', 'STEM Bot turns around'],
      answer: 1,
      explanation: '"While path ahead" checks whether the cell directly in front is open. When that cell becomes a wall the condition is false and the loop stops.',
    },
    {
      question: 'What is the key difference between Repeat 5 and While not at goal?',
      options: ['Repeat is faster', 'Repeat runs a fixed number of times; While runs until a condition changes', 'While can only be used in space mazes', 'There is no difference'],
      answer: 1,
      explanation: 'Repeat counts iterations. While checks a condition each time — it can run 2 times or 200 times depending on the situation.',
    },
    {
      question: '"If path left" inside a while loop will…',
      options: ['Always turn left', 'Turn left only when there is an open cell to the left, once per loop iteration', 'Loop forever turning left', 'Check behind STEM Bot'],
      answer: 1,
      explanation: '"If" checks its condition once and runs the body at most once — it is not a loop itself. Placing it inside a while loop means it checks on each iteration.',
    },
    {
      question: 'In the ring mazes, putting "If path ahead → Move" BEFORE "If path left → Turn Left" made STEM Bot circle forever. What is the lesson?',
      options: [
        'STEM Bot needs more Move Forward blocks',
        'While loops should be avoided in mazes with rings',
        'The ORDER of your conditions changes what the program does — check for the turn you need before charging ahead',
        'Ring mazes are impossible to solve',
      ],
      answer: 2,
      explanation: 'Your ifs run top to bottom on every lap. If "move ahead" fires first at the doorway, the bot sails right past it and the turn check never gets its moment. Same blocks, different order, completely different program — that is an infinite loop born from ordering.',
    },
    {
      question: 'Which program can cross a straight corridor of ANY length?',
      options: ['Move Forward written 10 times', 'Repeat 10 { Move Forward }', 'While path ahead { Move Forward }', 'Turn Left, then Move Forward'],
      answer: 2,
      explanation: 'A while loop keeps stepping as long as the path is open, so it adapts to any corridor length. Fixed step counts only work for one specific maze.',
    },
  ],
};

// ─── Unit 4 — Nested Loops (Forest) ──────────────────────────────────────────

const U4: BlockUnit = {
  id: 4,
  title: 'Nested Loops',
  tagline: 'Put a loop inside a loop — patterns made of patterns',
  color: '#0D9488',
  theme: 'forest',
  story: 'Almost home! On the final descent, STEM Bot spots the Emerald Terraces — a legendary hillside farm planted in patterns of patterns: rows inside fields, squares inside spirals. The farmers need every terrace walked and every crystal harvested before the season turns. One loop won\'t cut it here. It\'s time to put loops INSIDE loops.',
  introNotes: `# Unit 4 — Nested Loops

## A Loop Inside a Loop
You already know Repeat. The new idea is simple to say and powerful to use: **the body of a loop can contain another loop.**

:::blocks
repeat 4
  repeat 3
    move
  turn right
:::

Read it from the **inside out**: the inner loop takes 3 steps. The outer loop does that — plus a turn — 4 times. Result: STEM Bot walks a full **square**, 12 steps and 4 corners, from just 4 blocks of logic.

## The Multiplication Rule
The inner loop runs ALL of its repeats during EACH single repeat of the outer loop:

:::blocks
repeat 3
  repeat 4
    move
:::

The inner loop takes 4 steps, the outer runs it 3 times: 3 × 4 = **12 moves**.

If you can multiply, you can predict exactly what a nested loop will do.

## Why Nest?
Big jobs are usually patterns **of** patterns:
- A square = 4 × (one side)
- A staircase = 3 × (one zigzag run)
- Mowing a field = rows × (one row plus a U-turn)

Write the small pattern once as the inner loop. Let the outer loop stamp it across the maze. Your block counts will crash — check the pars in this unit!

## Not Just Repeat × Repeat
ANY loop can go inside any other. A **While path ahead** inside a **Repeat** says: "walk to the wall — whatever distance that is — then turn. Again." You'll use that one on the final terrace.

## Watch the U-Turn
The classic mowing bug: at the end of a row you need to turn, step DOWN to the next row, and turn again — and the second row runs the OPPOSITE direction. Walk it with your finger before you code it. If your bot mows two rows perfectly, the outer loop can mow the whole field.`,

  newBlocks: [
    { blockId: 'repeat', label: 'Repeat N (nested!)', desc: 'Nothing new to unlock — the discovery is that a Repeat fits INSIDE another Repeat. Inner pattern × outer stamps.' },
  ],

  challenges: [
    {
      title: 'Warm-Up Lap',
      par: 4,
      maxBlocks: 6,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'One loop, like old times: Repeat 4 { Move, Move, Collect } harvests the whole row.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:1,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:6,y:1},{x:8,y:1}],
    },
    {
      title: 'The Square',
      par: 5,
      maxBlocks: 7,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'One side = Repeat 2 { Move }, then Turn Right. Put THAT inside Repeat 3, add one last step home — a loop inside a loop!',
      grid: [[1,1,1,1,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,1,1,1,1]],
      startX:1, startY:1, startDir:'right', exitX:1, exitY:2,
      collectibles:[],
    },
    {
      title: 'Crystal Corners',
      par: 6,
      maxBlocks: 8,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'Same square — now add ONE Collect after each turn. Where does it go: inner loop or outer loop?',
      grid: [[1,1,1,1,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,1,1,1,1]],
      startX:1, startY:1, startDir:'right', exitX:1, exitY:2,
      collectibles:[{x:3,y:1},{x:3,y:3},{x:1,y:3}],
    },
    {
      title: 'Zigzag Runs',
      par: 8,
      maxBlocks: 9,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'Each zig is TWO runs of 3: Repeat 3 { Move }, Turn Right, Repeat 3 { Move }, Turn Left. Stamp the whole zig with an outer Repeat 2.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,1,1,1,1],[1,1,1,0,1,1,1,1],[1,1,1,0,1,1,1,1],[1,1,1,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:7,
      collectibles:[],
    },
    {
      title: 'The Grand Square',
      par: 7,
      maxBlocks: 9,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'A bigger square: sides of 3 now. Change ONE number in your inner loop — that\'s the power of nesting.',
      grid: [[1,1,1,1,1,1],[1,0,0,0,0,1],[1,0,1,1,0,1],[1,0,1,1,0,1],[1,0,0,0,0,1],[1,1,1,1,1,1]],
      startX:1, startY:1, startDir:'right', exitX:1, exitY:3,
      collectibles:[{x:4,y:1},{x:4,y:4},{x:1,y:4}],
    },
    {
      title: 'Triple Zig',
      par: 10,
      maxBlocks: 12,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'Three zigzags, and a crystal on the way down each one. Build one perfect zig (with its Collect), then Repeat 3.',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,1,1,1,1,1,1,1],[1,1,1,0,1,1,1,1,1,1,1],[1,1,1,0,1,1,1,1,1,1,1],[1,1,1,0,0,0,0,1,1,1,1],[1,1,1,1,1,1,0,1,1,1,1],[1,1,1,1,1,1,0,1,1,1,1],[1,1,1,1,1,1,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:10,
      collectibles:[{x:3,y:2},{x:6,y:5},{x:9,y:8}],
    },
    {
      title: 'Mow the Lawn',
      par: 11,
      maxBlocks: 13,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'Two rows, like mowing grass: harvest the top row, U-turn (Turn Right, Move, Move, Turn Right), harvest the bottom row the other way.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,0,1,1],[1,1,1,1,0,1,1],[1,0,0,0,0,1,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:1, exitY:3,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:3,y:3}],
    },
    {
      title: 'The Big Mow',
      par: 15,
      maxBlocks: 17,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'FOUR rows. Your two-row mowing pattern from last level — rows, U-turn right, row back, U-turn left — is the body. Outer Repeat 2 mows the whole field!',
      grid: [[1,1,1,1,1,1],[0,0,0,0,0,1],[1,1,1,1,0,1],[0,0,0,0,0,1],[0,1,1,1,1,1],[0,0,0,0,0,1],[1,1,1,1,0,1],[0,0,0,0,0,1],[0,1,1,1,1,1],[0,1,1,1,1,1],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:9,
      collectibles:[{x:2,y:1},{x:3,y:3},{x:1,y:5},{x:2,y:7}],
    },
    {
      title: 'Crystal Farm',
      par: 10,
      maxBlocks: 12,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat'],
      hint: 'Every single square of both rows has a crystal. Put Collect INSIDE the inner loop and harvest everything in one pass.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,0,1,1],[1,1,1,1,0,1,1],[1,0,0,0,0,1,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:1, exitY:3,
      collectibles:[{x:1,y:1},{x:2,y:1},{x:3,y:1},{x:4,y:1},{x:3,y:3},{x:2,y:3},{x:1,y:3}],
    },
    {
      title: 'The Spiral Terrace',
      par: 6,
      maxBlocks: 8,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat', 'while_path_ahead'],
      hint: 'The final terrace spirals inward, and the hallways are all different lengths. Nest a "While path ahead { Move, Collect }" inside a Repeat 5 — a while INSIDE a repeat!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:3,
      collectibles:[{x:4,y:1},{x:8,y:4},{x:4,y:6},{x:2,y:4},{x:5,y:3}],
    },
  ],

  quiz: [
    {
      question: 'Repeat 3 { Repeat 4 { Move Forward } } — how many steps does STEM Bot take?',
      options: ['7', '4', '12', '34'],
      answer: 2,
      explanation: 'The inner loop takes 4 steps, and the outer loop runs it 3 times: 3 × 4 = 12. Nested loops multiply.',
    },
    {
      question: 'In a nested loop, when does the INNER loop run?',
      options: ['Once, before the outer loop starts', 'All of its repeats, during EACH single repeat of the outer loop', 'Only on the last repeat of the outer loop', 'At the same time as the outer loop'],
      answer: 1,
      explanation: 'Each time the outer loop runs its body once, the inner loop inside that body runs completely — all of its repeats — before the outer loop continues.',
    },
    {
      question: 'Repeat 4 { Repeat 3 { Move }, Turn Right } makes STEM Bot trace…',
      options: ['A straight line of 12 steps', 'A full square — 4 sides of 3 steps with a turn at each corner', 'A zigzag', 'A circle'],
      answer: 1,
      explanation: 'The inner loop draws one side (3 steps), the turn makes a corner, and the outer loop stamps that side-plus-corner 4 times: a complete square lap.',
    },
    {
      question: 'You want STEM Bot to mow 3 rows of grass. Which plan uses nesting correctly?',
      options: ['One giant Repeat 30 { Move }', 'Repeat 3 { walk one row, then U-turn to the next row }', 'Write all three rows out block by block', 'Repeat 3 { Turn Right }'],
      answer: 1,
      explanation: 'The row-plus-U-turn is the repeating pattern. Build it once as the outer loop\'s body (with an inner loop walking the row), and Repeat 3 stamps it down the field.',
    },
    {
      question: 'Repeat 2 { Repeat 3 { Move, Collect } } — how many times does Collect run?',
      options: ['2', '3', '5', '6'],
      answer: 3,
      explanation: 'Collect is inside the inner loop: 3 runs per outer repeat, and 2 outer repeats. 2 × 3 = 6. (On empty squares it is a safe no-op!)',
    },
  ],
};

// ─── Unit 5 — Functions (Tricks) ─────────────────────────────────────────────

const U5: BlockUnit = {
  id: 5,
  title: 'Functions',
  tagline: 'Define a function once — call it anywhere',
  color: '#DB2777',
  theme: 'space',
  story: 'STEM Bot made it home a hero — and landed a new job: professor at the Orbital Academy, training rookie robots to explore. A great programmer never writes the same code twice. Instead of spelling out every maneuver step by step, STEM Bot now DEFINES each one as a named function — then simply calls it by name, wherever it\'s needed. Master this and you are writing real code.',
  introNotes: `# Unit 4 — Functions

## The Problem Functions Solve
Look at this program for a maze with the same stair pattern in two different places:

:::blocks
move
turn right
move
turn left
collect
move
move
move
turn right
move
turn left
collect
:::

**12 blocks — and the stair is written twice.** A Repeat can't help: the two stairs aren't next to each other. What we need is a way to write the stair ONCE, give it a name, and use the name in both places.

## Define, Then Call
That is exactly what a **function** is: a named set of blocks.

| Block | What it does |
|---|---|
| **🎓 Define Function** | Give a name to the blocks inside — this runs NOTHING by itself |
| **Call Function** | Run the named function, wherever you are, as many times as you like |

:::blocks
define 1
  move
  turn right
  move
  turn left
  collect
call 1
move
move
call 1
:::

Same maze, and the stair is written **once**. Fewer blocks, and the program reads like a story: "stair, walk, stair."

## Defining ≠ Calling
This is the big idea — and the #1 beginner mistake. **A definition alone does nothing when you press Run.** It just gets the function ready. The blocks only run when a **Call Function** block asks for them. A program that is all definitions and no calls sits perfectly still!

## Why Programmers Use Functions Everywhere
- **Write once, use anywhere:** a call counts as ONE block, no matter how big the function is. Watch your par scores.
- **One fix repairs every call:** mistake inside the function? Fix the definition — all the calls are instantly correct.
- **Readable programs:** names tell the story better than 20 raw blocks.

## Functions + Everything Else
Functions work with all your earlier tools: put a **Call inside a Repeat**, put a **while sensor inside a function**, even have one function **call another function**. The strongest programs in this unit use all three.

## The Real Vocabulary
You are learning the exact words programmers use: you **define** a function, then **call** it. Next year in Python it looks like this:

> def stair():
>     ...

Same idea, same words. You already know how it works.`,

  newBlocks: [
    { blockId: 'define_trick', label: '🎓 Define Function', desc: 'Name a set of blocks. Defining alone does nothing — the blocks wait to be called.' },
    { blockId: 'do_trick',     label: 'Call Function',      desc: 'Run a defined function. A call counts as one block, no matter how big the function is.' },
  ],

  challenges: [
    {
      title: 'One Function, Two Places',
      par: 11,
      maxBlocks: 12,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'define_trick', 'do_trick'],
      hint: 'The stair pattern appears in TWO different spots — and a Repeat can\'t jump the gap between them. Define the stair as Function 1 (Move, Turn Right, Move, Turn Left, Collect), then CALL it in both places.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,0,0,0,1,1],[1,1,1,1,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:3,
      collectibles:[{x:1,y:2},{x:4,y:3}],
    },
    {
      title: 'The Stair Step',
      par: 10,
      maxBlocks: 12,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'define_trick', 'do_trick'],
      hint: 'One stair = Move, Turn Right, Move, Turn Left. Define it once, call it three times, then walk to the flag.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:4, collectibles:[],
    },
    {
      title: 'Crystal Stairs',
      par: 11,
      maxBlocks: 14,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'define_trick', 'do_trick'],
      hint: 'Same stairs — but now add Collect INSIDE the function. Fix the definition once and every call collects.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:4,
      collectibles:[{x:1,y:2},{x:2,y:3},{x:3,y:4}],
    },
    {
      title: 'Two Functions',
      par: 14,
      maxBlocks: 16,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'define_trick', 'do_trick'],
      hint: 'This maze has TWO patterns: a stair (Move, Turn Right, Move, Turn Left) and a crystal dash (Move, Move, Collect). Define both — call each where it fits!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1,1],[1,0,0,0,0,1,1,1,1,1],[1,1,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3,
      collectibles:[{x:4,y:3},{x:6,y:3},{x:8,y:3}],
    },
    {
      title: 'Call It in a Loop',
      par: 11,
      maxBlocks: 12,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'repeat', 'define_trick', 'do_trick'],
      hint: 'FIVE stairs in a row — put Call Function inside a Repeat 5. Then look ahead: after the walkway, the SAME stair appears once more. Call it again!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1,1],[1,1,1,0,0,1,1,1,1,1],[1,1,1,1,0,0,1,1,1,1],[1,1,1,1,1,0,0,0,0,1],[1,1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:7,
      collectibles:[{x:1,y:2},{x:3,y:4},{x:5,y:6},{x:8,y:7}],
    },
    {
      title: 'The Square Dance',
      par: 9,
      maxBlocks: 10,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'define_trick', 'do_trick'],
      hint: 'One side of the square = Move, Move, Turn Right, Collect. Define it once, call it three times, then one last step home.',
      grid: [[1,1,1,1,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,1,1,1,1]],
      startX:1, startY:1, startDir:'right', exitX:1, exitY:2,
      collectibles:[{x:3,y:1},{x:3,y:3},{x:1,y:3}],
    },
    {
      title: 'A Function Calls a Function',
      par: 13,
      maxBlocks: 14,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'define_trick', 'do_trick'],
      hint: 'Function 1 = the stair (with Collect). Function 2 = Call Function 1, then Move, Move. Call Function 2 three times — functions calling functions!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,1,1,1,1,1,1],[1,1,1,1,0,0,0,0,1,1,1],[1,1,1,1,1,1,1,0,0,0,1],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:4,
      collectibles:[{x:1,y:2},{x:4,y:3},{x:7,y:4}],
    },
    {
      title: 'The Hallway Function',
      par: 8,
      maxBlocks: 11,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'define_trick', 'do_trick'],
      hint: 'Define: While path ahead { Move, Collect }, then Turn Right. One function walks ANY hallway — call it three times.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,0,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:1, exitY:4,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:5,y:2},{x:5,y:3},{x:3,y:4}],
    },
    {
      title: 'The Spiral',
      par: 10,
      maxBlocks: 11,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'define_trick', 'do_trick'],
      hint: 'You solved this terrace with nested loops — now do it the function way: define the hallway once, then CALL it five times. No Repeat blocks this time!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:3,
      collectibles:[{x:4,y:1},{x:8,y:4},{x:4,y:6},{x:2,y:4},{x:5,y:3}],
    },
    {
      title: 'Graduation Day',
      par: 17,
      maxBlocks: 18,
      blockIds: ['move_forward', 'turn_left', 'turn_right', 'collect', 'while_path_ahead', 'define_trick', 'do_trick'],
      hint: 'The final exam: hallways AND stairs. Two functions with Collect in both — three calls each. Show the rookies real code, professor!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,0,0,1,1,1,1,1,0,1],[1,1,0,0,1,1,1,1,0,1],[1,1,1,0,0,1,1,1,0,1],[1,1,1,1,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:1, exitY:2,
      collectibles:[{x:3,y:1},{x:7,y:1},{x:8,y:3},{x:6,y:5},{x:2,y:3}],
    },
  ],

  quiz: [
    {
      question: 'Your program is ONLY a "Define Function 1" block with 5 blocks inside. What happens when you press Run?',
      options: ['The 5 blocks run once', 'The 5 blocks run over and over', 'Nothing — defining a function does not run it', 'STEM Bot crashes'],
      answer: 2,
      explanation: 'A definition just names the blocks and waits. Nothing runs until a "Call Function" block asks for it. Define, THEN call.',
    },
    {
      question: 'Function 1 is: Move Forward, Move Forward, Turn Right. You call it three times. How many times does STEM Bot move forward?',
      options: ['2', '3', '6', '9'],
      answer: 2,
      explanation: 'Each call runs the whole function once — 2 moves per call. 3 calls × 2 moves = 6 moves.',
    },
    {
      question: 'You called Function 1 in five different places, then spot a mistake inside it. What is the best fix?',
      options: ['Fix the blocks inside the ONE definition', 'Find and fix all five Call blocks', 'Delete the program and start over', 'Add extra Move Forward blocks to cover the mistake'],
      answer: 0,
      explanation: 'Every call runs the definition. Fix the definition once and all five calls are repaired instantly — a superpower of functions.',
    },
    {
      question: 'A stair pattern appears at the START of a maze and again at the END, with other moves in between. Why is a function better than a Repeat here?',
      options: ['Repeat blocks are slower', 'A Repeat only replays blocks in ONE spot — a function has a name, so you can call it in BOTH places', 'Functions can hold more blocks than Repeats', 'It is not better — they are the same'],
      answer: 1,
      explanation: 'Repeat replays its body back-to-back in one place. A function is named and callable anywhere — start, end, inside a loop, even inside another function.',
    },
    {
      question: 'In Python, which keyword DEFINES a function?',
      options: ['loop', 'def', 'call', 'if'],
      answer: 1,
      explanation: 'Python uses def to define a function — then you call it by name, exactly like Call Function. You already know how it works!',
    },
  ],
};

export const UNITS: BlockUnit[] = [U1, U2, U3, U4, U5];

export function chalKey(ui: number, ci: number) { return `${ui}_${ci}`; }
export function countCompleted(ui: number, completed: Record<string, boolean>) {
  return UNITS[ui].challenges.filter((_, ci) => completed[chalKey(ui, ci)]).length;
}
