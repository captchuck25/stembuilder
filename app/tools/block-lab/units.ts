import { Direction } from './engine/animation';
import { ThemeName } from './engine/themes';

export interface Collectible { x: number; y: number; }

export interface BlockChallenge {
  title: string;
  hint: string;
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
  introNotes: `# Unit 1 — Sequence

## What Is a Program?
A **program** is a list of instructions you give to a computer. The computer follows them **one at a time, top to bottom**, in the exact order you wrote them.

In Block Lab you control STEM Bot through a desert maze. STEM Bot understands three instructions:

| Block | What it does |
|---|---|
| **Move Forward** | Move one step in the direction you are facing |
| **Turn Left** | Rotate 90° counter-clockwise (left) |
| **Turn Right** | Rotate 90° clockwise (right) |

## Turning vs. Moving
Turning changes the direction STEM Bot faces — **but it does not move**. After turning you still need Move Forward to actually step forward.

## Order Matters
If you put the blocks in the wrong order, STEM Bot goes the wrong way. Read your script like a recipe — top to bottom — before you hit Run.

## Errors
If STEM Bot tries to walk into a wall, the program stops. Look at what the bot was trying to do and fix the block that caused the problem.

## Your Goal
Guide STEM Bot from the start (blue circle) to the goal (gold star). The mazes get longer and twistier as you go — by Challenge 10 you'll notice something interesting about your scripts…`,

  newBlocks: [
    { blockId: 'move_forward', label: 'Move Forward', desc: 'Move one step in the direction you are facing.' },
    { blockId: 'turn_left',    label: 'Turn Left',    desc: 'Rotate 90° to the left (counter-clockwise).' },
    { blockId: 'turn_right',   label: 'Turn Right',   desc: 'Rotate 90° to the right (clockwise).' },
  ],

  challenges: [
    {
      title: 'First Steps',
      hint: 'Click Move Forward to take one step at a time. Reach the gold marker!',
      grid: [[1,1,1,1,1,1],[0,0,0,0,0,0],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:1, collectibles:[],
    },
    {
      title: 'Right Turn Ahead',
      hint: 'Walk to the wall, then Turn Right to change direction.',
      grid: [[1,1,1,1,1],[0,0,0,0,1],[1,1,1,0,1],[1,1,1,0,0],[1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:4, exitY:3, collectibles:[],
    },
    {
      title: 'Two Turns',
      hint: 'You will need to turn twice. Think ahead before you start!',
      grid: [[1,1,1,1,1,1],[0,0,0,1,1,1],[1,1,0,1,1,1],[1,1,0,0,0,0],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:3, collectibles:[],
    },
    {
      title: 'The Long Way',
      hint: 'A longer corridor then a turn — count your steps carefully.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3, collectibles:[],
    },
    {
      title: 'Desert Crystals',
      hint: 'Collect the crystals along the way — then reach the exit.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:3,
      collectibles:[{x:2,y:1},{x:5,y:1}],
    },
    {
      title: 'U-Turn',
      hint: 'Follow the path all the way around — three turns to get home.',
      grid: [[1,1,1,1,1,1],[0,0,0,0,0,1],[1,1,1,1,0,1],[1,1,1,1,0,1],[0,0,0,0,0,1],[1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:4, collectibles:[],
    },
    {
      title: 'Winding Road',
      hint: 'Four turns — read your path like a map before placing blocks.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,1,1,1,1],[1,1,1,0,1,1,1,1],[1,1,1,0,0,0,1,1],[1,1,1,1,1,0,1,1],[1,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5, collectibles:[],
    },
    {
      title: 'Triple Crystal',
      hint: 'Three crystals hidden along a winding path.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,0,1],[1,1,1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:3,
      collectibles:[{x:2,y:1},{x:5,y:1},{x:8,y:1}],
    },
    {
      title: 'The S-Curve',
      hint: 'Right, down, right, down — four segments, three turns.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,1,1,1],[1,1,1,0,1,1,1],[1,1,1,0,0,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:5, collectibles:[],
    },
    {
      title: 'Desert Boss',
      hint: 'The biggest sequential maze yet. Map out every turn before you begin.',
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
      question: 'STEM Bot faces North. After one Turn Right, STEM Bot faces…',
      options: ['South', 'North', 'West', 'East'],
      answer: 3,
      explanation: 'Turn Right rotates clockwise: North → East → South → West → North.',
    },
    {
      question: 'Your script has 8 blocks but STEM Bot only needs 5 steps to reach the goal. What most likely happened?',
      options: ['The extra blocks are ignored', 'STEM Bot crashes into a wall before reaching the goal', 'The blocks run in a loop', 'Nothing — extra blocks are fine'],
      answer: 1,
      explanation: 'After the goal is reached any remaining blocks still run, which often causes STEM Bot to walk into a wall and crash.',
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
  introNotes: `# Unit 2 — Loops

## The Problem With Counting
In Unit 1 you probably wrote something like this to cross a long corridor:

> Move Forward, Move Forward, Move Forward, Move Forward, Move Forward…

That gets tedious. What if the corridor is 50 cells long? What if you want to change the number of steps?

## The Repeat Block
A **Repeat** block runs its body a fixed number of times:

| Block | What it does |
|---|---|
| **Repeat N** | Runs everything inside it exactly N times |

The blocks you put **inside** Repeat are called the **body**. The body can contain any blocks — even multiple blocks!

## Why This Is Powerful
Instead of writing Move Forward ten times you write:

> Repeat 10 { Move Forward }

If you want twelve steps instead, just change the 10 to a 12.

## Patterns
Loops shine when there is a **repeating pattern** in the maze. Look for paths where the same sequence of moves appears multiple times. That is your cue to use Repeat.

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
      hint: 'That is a very long corridor! Use Repeat so you don\'t write Move Forward nine times.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:1, collectibles:[],
    },
    {
      title: 'Double Stretch',
      hint: 'Two long corridors connected by a turn. Use Repeat for each straight section.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1],[1,1,1,1,0,1,1,1,1],[1,1,1,1,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3,
      collectibles:[{x:2,y:1},{x:6,y:3}],
    },
    {
      title: 'Staircase',
      hint: 'Each step is: one right, one down. Use Repeat with TWO blocks inside!',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:6,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6}],
    },
    {
      title: 'Tall Staircase',
      hint: 'Same staircase pattern but with 4 steps instead of 3. Just change the Repeat number!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1],[1,1,1,0,1,1,1,1,1],[1,1,1,0,0,1,1,1,1],[1,1,1,1,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:8,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6},{x:4,y:8}],
    },
    {
      title: 'Acorn Row',
      hint: 'A long path with acorns every other cell. Repeat handles it efficiently.',
      grid: [[1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:11, exitY:1,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:6,y:1},{x:8,y:1},{x:10,y:1}],
    },
    {
      title: 'Triple Corridor',
      hint: 'Three horizontal corridors stacked — Repeat gets you down each one.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,0,1,1,1,1,0,1],[1,0,1,1,1,1,0,1],[1,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:5,
      collectibles:[{x:3,y:1},{x:3,y:5}],
    },
    {
      title: 'Square Route',
      hint: 'Travel three sides of a square. Repeat 3 with { Move×3, Turn Right } does it!',
      grid: [[1,1,1,1,1],[0,0,0,0,1],[1,1,1,0,1],[1,1,1,0,1],[0,0,0,0,1],[1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:4, collectibles:[],
    },
    {
      title: 'Forest Maze',
      hint: 'A winding forest path — combine Repeat and single-use blocks.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1,1],[1,1,1,1,0,1,1,1,1,1],[1,1,1,1,0,0,0,0,1,1],[1,1,1,1,1,1,1,0,1,1],[1,1,1,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:5,
      collectibles:[{x:2,y:1},{x:6,y:3},{x:8,y:5}],
    },
    {
      title: 'Zigzag Valley',
      hint: 'The same two-step zigzag repeats four times. One Repeat block solves it!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1],[1,1,1,0,1,1,1,1,1],[1,1,1,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:7,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6}],
    },
    {
      title: 'Forest Boss',
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
  ],
};

// ─── Unit 3 — While & If (Space) ─────────────────────────────────────────────

const U3: BlockUnit = {
  id: 3,
  title: 'While & If',
  tagline: 'Let STEM Bot sense its surroundings and decide what to do',
  color: '#7C3AED',
  theme: 'space',
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

## While Loops
A **while** loop keeps running its body **as long as a condition is true**:

> While path ahead → keep moving forward

When the path is blocked the loop stops automatically. No counting needed!

## If Blocks
An **if** block runs its body **once** only if the condition is true at that moment. Combine multiple if blocks inside a while loop to create decision logic:

> While not at goal:
>   If path ahead → move forward
>   If path left → turn left
>   If path right → turn right

## Infinite Loops
If the condition is never false, the loop runs forever (or until the safety limit stops it). Always make sure the bot is actually making progress toward the goal.

## Your Goal
Use sensors so STEM Bot can navigate mazes without knowing the exact layout in advance. A good sensor program can solve many different mazes with the same code!`,

  newBlocks: [
    { blockId: 'while_path_ahead',  label: 'While path ahead',  desc: 'Keep running the body as long as there is an open cell ahead.' },
    { blockId: 'while_not_at_goal', label: 'While not at goal', desc: 'Keep running the body until STEM Bot reaches the goal.' },
    { blockId: 'if_path_ahead',     label: 'If path ahead',     desc: 'Run the body once if there is an open cell ahead.' },
    { blockId: 'if_path_left',      label: 'If path left',      desc: 'Run the body once if there is an open cell to the left.' },
    { blockId: 'if_path_right',     label: 'If path right',     desc: 'Run the body once if there is an open cell to the right.' },
  ],

  challenges: [
    {
      title: 'Autopilot',
      hint: 'Use "While not at goal" — STEM Bot drives itself no matter how far the goal is!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:10, exitY:1, collectibles:[],
    },
    {
      title: 'Sensor Run',
      hint: 'Walk forward while the path is clear, then turn and use "While not at goal" for the rest.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:3,y:1},{x:6,y:3}],
    },
    {
      title: 'Path Detector',
      hint: 'Put "If path ahead" inside a "While not at goal" — the bot moves when it can.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,0,0,0,1],[1,0,1,0,1,0,1],[1,0,0,0,1,0,0],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:3,
      collectibles:[{x:3,y:1},{x:5,y:1}],
    },
    {
      title: 'Left Explorer',
      hint: 'At each junction check left first. "If path left" + "If path ahead" inside while solves it.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,1,0,0,0,0,1],[1,0,1,0,1,1,0,1],[1,0,1,0,1,1,0,1],[1,0,0,0,1,1,0,1],[1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:3,y:1},{x:6,y:2}],
    },
    {
      title: 'Right Wall Hugger',
      hint: 'Always check right first, then ahead, then left. This is the right-hand rule!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,1,0,0,0,0,1],[1,1,0,1,0,1,1,0,1],[1,1,0,0,0,1,1,0,1],[1,1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:4,
      collectibles:[{x:4,y:1},{x:7,y:2}],
    },
    {
      title: 'Dead End',
      hint: 'Sometimes all paths are blocked! Add "If path right" as a fallback turn.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,1,0,0,0,1,0],[1,1,0,1,0,1,0,1,0],[1,1,0,0,0,1,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:1,
      collectibles:[{x:4,y:1},{x:6,y:3}],
    },
    {
      title: 'Data Nodes',
      hint: 'Navigate to each glowing data node using sensors.',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,1,0,0,0,1,0,0],[1,1,1,0,1,0,1,0,1,0,1],[1,0,0,0,0,0,1,0,0,0,1],[1,0,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:10, exitY:5,
      collectibles:[{x:3,y:1},{x:5,y:1},{x:7,y:1},{x:5,y:3},{x:5,y:5}],
    },
    {
      title: 'Space Station Alpha',
      hint: 'A real labyrinth. Combine while not at goal with if sensors to find the path.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,1,0,0,0,1],[1,1,1,0,1,0,1,0,1],[1,0,0,0,0,0,1,0,0],[1,0,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:5,
      collectibles:[{x:3,y:1},{x:5,y:1},{x:5,y:3},{x:4,y:5}],
    },
    {
      title: 'Warp Grid',
      hint: 'Tall and wide — sensors handle it without knowing dimensions.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,1,0,0,1,0,0,1],[1,1,0,1,0,1,1,0,1,1],[1,0,0,0,0,1,0,0,1,1],[1,0,1,1,1,1,0,1,1,1],[1,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:5,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:7,y:1},{x:6,y:3},{x:3,y:5}],
    },
    {
      title: 'Final Mission',
      hint: 'The ultimate maze. A complete sensor program can solve any path — can yours?',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,1,0,0,0,1,0,0],[1,1,1,0,1,0,1,0,1,0,1],[1,0,0,0,0,0,1,0,0,0,1],[1,0,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:10, exitY:5,
      collectibles:[{x:3,y:1},{x:5,y:1},{x:7,y:1},{x:5,y:3},{x:5,y:5}],
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
      question: 'Why is there a safety limit (max steps) on while loops in this tool?',
      options: ['To make the game harder', 'To prevent infinite loops that would freeze the browser', 'Because space mazes have limited fuel', 'Because while loops can only run 400 times in Python'],
      answer: 1,
      explanation: 'An infinite loop — where the condition never becomes false — would run forever and crash the program. The safety limit stops execution after 400 iterations.',
    },
  ],
};

export const UNITS: BlockUnit[] = [U1, U2, U3];

export function chalKey(ui: number, ci: number) { return `${ui}_${ci}`; }
export function countCompleted(ui: number, completed: Record<string, boolean>) {
  return UNITS[ui].challenges.filter((_, ci) => completed[chalKey(ui, ci)]).length;
}
