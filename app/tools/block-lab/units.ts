import { Direction } from './engine/animation';
import { ThemeName } from './engine/themes';

export interface Collectible { x: number; y: number; }

export interface BlockChallenge {
  title: string;
  hint: string;
  /** Block-count target for the 3rd star — solve with this many blocks or fewer */
  par: number;
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
      hint: 'That is a very long corridor! Use Repeat so you don\'t write Move Forward nine times.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:1, collectibles:[],
    },
    {
      title: 'Double Stretch',
      par: 12,
      hint: 'Use Repeat for each straight section — and Collect both acorns on the way.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1],[1,1,1,1,0,1,1,1,1],[1,1,1,1,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3,
      collectibles:[{x:2,y:1},{x:6,y:3}],
    },
    {
      title: 'Staircase',
      par: 15,
      hint: 'Every stair is the same moves — put them (and a Collect) inside one Repeat!',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:6,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6}],
    },
    {
      title: 'Tall Staircase',
      par: 16,
      hint: 'Same staircase pattern but with 4 steps instead of 3. Just change the Repeat number!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1],[1,1,1,0,1,1,1,1,1],[1,1,1,0,0,1,1,1,1],[1,1,1,1,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:8,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6},{x:4,y:8}],
    },
    {
      title: 'Acorn Row',
      par: 5,
      hint: 'Acorns every other cell: Repeat { Move, Move, Collect } scoops them all up!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:11, exitY:1,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:6,y:1},{x:8,y:1},{x:10,y:1}],
    },
    {
      title: 'Triple Corridor',
      par: 18,
      hint: 'Three horizontal corridors stacked — Repeat gets you down each one.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,0,0,0,0,0,0,1],[1,0,1,1,1,1,1,1],[1,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:3,y:1},{x:3,y:3},{x:4,y:5}],
    },
    {
      title: 'Square Route',
      par: 5,
      hint: 'Travel three sides of a square. Repeat 3 with { Move×3, Turn Right } does it!',
      grid: [[1,1,1,1,1],[0,0,0,0,1],[1,1,1,0,1],[1,1,1,0,1],[0,0,0,0,1],[1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:0, exitY:4, collectibles:[],
    },
    {
      title: 'Forest Maze',
      par: 18,
      hint: 'A winding forest path — combine Repeat and single-use blocks.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,1,1,1,1,1],[1,1,1,1,0,1,1,1,1,1],[1,1,1,1,0,0,0,0,1,1],[1,1,1,1,1,1,1,0,1,1],[1,1,1,1,1,1,1,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:5,
      collectibles:[{x:2,y:1},{x:6,y:3},{x:8,y:5}],
    },
    {
      title: 'Zigzag Valley',
      par: 9,
      hint: 'The same zigzag repeats — one Repeat (with a Collect inside) solves it!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1],[1,0,1,1,1,1,1,1,1],[1,0,0,1,1,1,1,1,1],[1,1,0,1,1,1,1,1,1],[1,1,0,0,1,1,1,1,1],[1,1,1,0,1,1,1,1,1],[1,1,1,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:7,
      collectibles:[{x:1,y:2},{x:2,y:4},{x:3,y:6}],
    },
    {
      title: 'Forest Boss',
      par: 18,
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
Use sensors so STEM Bot can navigate mazes without knowing the exact layout in advance. A good sensor program can solve many different mazes with the same code!

> Tip: put **Collect** inside your while loop and STEM Bot will scoop up items automatically as it explores — Collect does nothing on empty squares, so it is always safe.`,

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
      par: 3,
      hint: 'Use "While not at goal" — STEM Bot drives itself no matter how far the goal is!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:10, exitY:1, collectibles:[],
    },
    {
      title: 'Sensor Run',
      par: 9,
      hint: 'Walk forward while the path is clear, then turn and use "While not at goal" for the rest.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,1],[1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:3,y:1},{x:6,y:3}],
    },
    {
      title: 'Path Detector',
      par: 7,
      hint: 'Put "If path ahead" inside a "While not at goal" — the bot moves when it can.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,0,0,0,1],[1,0,1,0,1,0,1],[1,0,0,0,1,0,0],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:3,
      collectibles:[{x:3,y:1},{x:5,y:1}],
    },
    {
      title: 'Left Explorer',
      par: 9,
      hint: 'At each junction check left first. "If path left" + "If path ahead" inside while solves it.',
      grid: [[1,1,1,1,1,1,1,1],[0,0,1,0,0,0,0,1],[1,0,1,0,1,1,0,1],[1,0,1,0,1,1,0,1],[1,0,0,0,1,1,0,1],[1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:7, exitY:5,
      collectibles:[{x:3,y:1},{x:6,y:2}],
    },
    {
      title: 'Right Wall Hugger',
      par: 9,
      hint: 'Always check right first, then ahead, then left. This is the right-hand rule!',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,1,0,0,0,0,1],[1,1,0,1,0,1,1,0,1],[1,1,0,0,0,1,1,0,1],[1,1,1,1,1,1,1,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:4,
      collectibles:[{x:4,y:1},{x:7,y:2}],
    },
    {
      title: 'Dead End',
      par: 10,
      hint: 'Sometimes all paths are blocked! Add "If path right" as a fallback turn.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,1,0,0,0,1,0],[1,1,0,1,0,1,0,1,0],[1,1,0,0,0,1,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:1,
      collectibles:[{x:4,y:1},{x:6,y:3}],
    },
    {
      title: 'Data Nodes',
      par: 10,
      hint: 'Put Collect inside your loop — STEM Bot picks up every node it crosses.',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,0,0,1,0,0,0,1,0,0],[1,1,1,0,1,0,1,0,1,0,1],[1,0,0,0,0,0,1,0,0,0,1],[1,0,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:10, exitY:5,
      collectibles:[{x:3,y:1},{x:5,y:1},{x:7,y:1},{x:5,y:3},{x:5,y:5}],
    },
    {
      title: 'Space Station Alpha',
      par: 10,
      hint: 'A real labyrinth. Combine while not at goal with if sensors to find the path.',
      grid: [[1,1,1,1,1,1,1,1,1],[0,0,0,0,1,0,0,0,1],[1,1,1,0,1,0,1,0,1],[1,0,0,0,0,0,1,0,0],[1,0,1,1,1,1,1,1,1],[1,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:5,
      collectibles:[{x:3,y:1},{x:5,y:1},{x:5,y:3},{x:4,y:5}],
    },
    {
      title: 'Warp Grid',
      par: 10,
      hint: 'Tall and wide — sensors handle it without knowing dimensions.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,1,0,0,1,0,0,1],[1,1,0,1,0,1,1,0,1,1],[1,0,0,0,0,1,0,0,1,1],[1,0,1,1,1,1,0,1,1,1],[1,0,0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:5,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:7,y:1},{x:6,y:3},{x:3,y:5}],
    },
    {
      title: 'Final Mission',
      par: 10,
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
    {
      question: 'Which program can cross a straight corridor of ANY length?',
      options: ['Move Forward written 10 times', 'Repeat 10 { Move Forward }', 'While path ahead { Move Forward }', 'Turn Left, then Move Forward'],
      answer: 2,
      explanation: 'A while loop keeps stepping as long as the path is open, so it adapts to any corridor length. Fixed step counts only work for one specific maze.',
    },
  ],
};

// ─── Unit 4 — Functions (Tricks) ─────────────────────────────────────────────

const U4: BlockUnit = {
  id: 4,
  title: 'Functions',
  tagline: 'Teach STEM Bot tricks — name a routine once, use it anywhere',
  color: '#DB2777',
  theme: 'space',
  story: 'STEM Bot made it home a hero — and landed a new job: professor at the Orbital Academy, where rookie robots learn to explore. A great teacher never repeats themselves. Instead of spelling out every step, STEM Bot now TEACHES each maneuver once as a named trick — then just says "do the trick!" Master this and you\'re thinking like a real programmer.',
  introNotes: `# Unit 4 — Functions

## Teaching Tricks
So far, when a maze repeats a pattern, you had to build the same blocks again (or wrap them in a Repeat). But what if the pattern shows up in *different places*, not just back-to-back?

A **function** is a set of blocks with a **name**. In Block Lab we call them **tricks**:

| Block | What it does |
|---|---|
| **🎓 Teach Trick** | Give a name to the blocks inside — this is the *definition* |
| **Do Trick** | Perform the named trick, wherever you are |

## Teaching ≠ Doing
This is the big idea: **Teach Trick does nothing by itself.** It just gets STEM Bot ready. The trick only runs when a **Do Trick** block asks for it — and you can ask as many times as you like.

> Teach Trick ⭐1: how: Move Forward, Move Forward, Collect
>
> Do Trick ⭐1 · Do Trick ⭐1 · Do Trick ⭐1

That program takes 6 steps and collects 3 crystals — but the marching pattern is written only **once**.

## Why Programmers Love Functions
- **Fewer blocks:** Do Trick counts as ONE block, no matter how big the trick is. Watch your par scores!
- **One fix, everywhere:** made a mistake inside the trick? Fix the definition once — every Do Trick is instantly repaired.
- **Readable programs:** "stair-step, stair-step, dash" tells the story better than 14 raw blocks.

## Mix and Match
Tricks work with everything you already know: put **Do Trick inside a Repeat**, put a **while sensor inside a trick**, even have one trick **perform another trick**. The best programs in this unit combine all three.

## Your Goal
Every maze in the Academy has a repeating pattern hiding in it. Find the pattern, teach it as a trick, and reuse it. Beat par and you'll feel the power — in Python next year, you'll meet the exact same idea under its grown-up name: **def**, for defining a function.`,

  newBlocks: [
    { blockId: 'define_trick', label: '🎓 Teach Trick', desc: 'Name a set of blocks. Teaching alone does nothing — it waits to be used.' },
    { blockId: 'do_trick',     label: 'Do Trick',      desc: 'Perform a taught trick. Counts as one block, no matter how big the trick is.' },
  ],

  challenges: [
    {
      title: 'First Lesson',
      par: 7,
      hint: 'Teach Trick 1: Move, Move, Collect. Then Do Trick three times — the pattern is written once!',
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:1,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:6,y:1}],
    },
    {
      title: 'The Stair Step',
      par: 10,
      hint: 'One stair = Move, Turn Right, Move, Turn Left. Teach it once, do it three times, then walk to the flag.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:4, collectibles:[],
    },
    {
      title: 'Crystal Stairs',
      par: 11,
      hint: 'Same stairs — but now add Collect INSIDE the trick. Fix the trick once and every step collects.',
      grid: [[1,1,1,1,1,1,1],[0,0,1,1,1,1,1],[1,0,0,1,1,1,1],[1,1,0,0,1,1,1],[1,1,1,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:5, exitY:4,
      collectibles:[{x:1,y:2},{x:2,y:3},{x:3,y:4}],
    },
    {
      title: 'Two Tricks',
      par: 14,
      hint: 'This maze has TWO patterns: a stair (Move, Turn Right, Move, Turn Left) and a crystal dash (Move, Move, Collect). Teach both!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1,1],[1,0,0,0,0,1,1,1,1,1],[1,1,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:8, exitY:3,
      collectibles:[{x:4,y:3},{x:6,y:3},{x:8,y:3}],
    },
    {
      title: 'Trick × Repeat',
      par: 10,
      hint: 'FIVE stair steps — too many to write out. Put Do Trick inside a Repeat 5! (Collect in the trick is safe on empty steps.)',
      grid: [[1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1],[1,0,0,1,1,1,1,1],[1,1,0,0,1,1,1,1],[1,1,1,0,0,1,1,1],[1,1,1,1,0,0,1,1],[1,1,1,1,1,0,0,1],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:6,
      collectibles:[{x:1,y:2},{x:3,y:4},{x:5,y:6}],
    },
    {
      title: 'The Square Dance',
      par: 8,
      hint: 'One side of the square = Move, Move, Turn Right, Collect. Three sides in a Repeat, then one last step home.',
      grid: [[1,1,1,1,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,1,1,1,1]],
      startX:1, startY:1, startDir:'right', exitX:1, exitY:2,
      collectibles:[{x:3,y:1},{x:3,y:3},{x:1,y:3}],
    },
    {
      title: 'A Trick Inside a Trick',
      par: 12,
      hint: 'Trick 1 = the stair (with Collect). Trick 2 = Do Trick 1, then Move, Move. Yes — tricks can perform other tricks!',
      grid: [[1,1,1,1,1,1,1,1,1,1,1],[0,0,1,1,1,1,1,1,1,1,1],[1,0,0,0,0,1,1,1,1,1,1],[1,1,1,1,0,0,0,0,1,1,1],[1,1,1,1,1,1,1,0,0,0,1],[1,1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:9, exitY:4,
      collectibles:[{x:1,y:2},{x:4,y:3},{x:7,y:4}],
    },
    {
      title: 'The Hallway Trick',
      par: 8,
      hint: 'Teach: While path ahead { Move, Collect }, then Turn Right. One trick walks ANY hallway — do it three times.',
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,0,0,1],[1,1,1,1,1,0,1],[1,1,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:1, exitY:4,
      collectibles:[{x:2,y:1},{x:4,y:1},{x:5,y:2},{x:5,y:3},{x:3,y:4}],
    },
    {
      title: 'The Spiral',
      par: 7,
      hint: 'The hallway trick again — but this maze spirals inward. Repeat 5 { Do Trick } solves the WHOLE thing.',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,1,1,1,1,1,0,1],[1,1,0,0,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:6, exitY:3,
      collectibles:[{x:4,y:1},{x:8,y:4},{x:4,y:6},{x:2,y:4},{x:5,y:3}],
    },
    {
      title: 'Graduation Day',
      par: 15,
      hint: 'The final exam: hallways AND stairs in one maze. Two tricks (put Collect in both!), two Repeats — show the rookies how it\'s done, professor!',
      grid: [[1,1,1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0,0,1],[1,0,0,1,1,1,1,1,0,1],[1,1,0,0,1,1,1,1,0,1],[1,1,1,0,0,1,1,1,0,1],[1,1,1,1,0,0,0,0,0,1],[1,1,1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:'right', exitX:1, exitY:2,
      collectibles:[{x:3,y:1},{x:7,y:1},{x:8,y:3},{x:6,y:5},{x:2,y:3}],
    },
  ],

  quiz: [
    {
      question: 'Your program is ONLY a "Teach Trick 1" block with 5 blocks inside. What happens when you press Run?',
      options: ['The 5 blocks run once', 'The 5 blocks run over and over', 'Nothing — teaching a trick does not perform it', 'STEM Bot crashes'],
      answer: 2,
      explanation: 'A definition just names the blocks and waits. Nothing runs until a "Do Trick" block asks for it.',
    },
    {
      question: 'Trick 1 is: Move Forward, Move Forward, Turn Right. You use "Do Trick 1" three times. How many times does STEM Bot move forward?',
      options: ['2', '3', '6', '9'],
      answer: 2,
      explanation: 'Each Do Trick performs the whole trick once — 2 moves each time. 3 performances × 2 moves = 6 moves.',
    },
    {
      question: 'You used Trick 1 in five different places, then spot a mistake inside the trick. What is the best fix?',
      options: ['Fix the blocks inside the ONE Teach Trick definition', 'Find and fix all five Do Trick blocks', 'Delete the program and start over', 'Add extra Move Forward blocks to cover the mistake'],
      answer: 0,
      explanation: 'Every Do Trick performs the definition. Fix the definition once and all five uses are repaired instantly — a superpower of functions.',
    },
    {
      question: 'What is the difference between "Repeat 3 { Move }" and a trick?',
      options: ['There is no difference', 'Repeat runs blocks again right away; a trick has a NAME so you can use it anywhere in your program', 'Tricks can only hold 3 blocks', 'Repeat is only for crystals'],
      answer: 1,
      explanation: 'Repeat replays blocks in one spot. A trick is named and reusable — you can perform it here, later, inside a Repeat, or even inside another trick.',
    },
    {
      question: 'Next year in Python, "teaching a trick" has a grown-up name. What is it called?',
      options: ['A loop', 'A variable', 'Defining a function', 'A comment'],
      answer: 2,
      explanation: 'Python uses def to define a function — a named set of instructions you can call whenever you need it. You already know how it works!',
    },
  ],
};

export const UNITS: BlockUnit[] = [U1, U2, U3, U4];

export function chalKey(ui: number, ci: number) { return `${ui}_${ci}`; }
export function countCompleted(ui: number, completed: Record<string, boolean>) {
  return UNITS[ui].challenges.filter((_, ci) => completed[chalKey(ui, ci)]).length;
}
