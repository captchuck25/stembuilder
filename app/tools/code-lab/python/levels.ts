// ─── Types ────────────────────────────────────────────────────────────────────

export type Dir = 0 | 1 | 2 | 3; // N=0  E=1  S=2  W=3

export interface ChallengeImage {
  src: string;       // public path, e.g. "/python-maze/1-1.png"
  width: number;     // natural pixel width
  height: number;    // natural pixel height
  cellPx: number;    // size of one logical grid cell in image pixels
  originX: number;   // pixel x of grid cell (0,0) top-left
  originY: number;   // pixel y of grid cell (0,0) top-left
}

export interface Challenge {
  title: string;
  hint: string;
  grid: number[][];   // grid[row][col]  0=open  1=wall
  startX: number;
  startY: number;
  startDir: Dir;
  exitX: number;
  exitY: number;
  starterCode: string;
  image?: ChallengeImage; // when set, renders this PNG instead of procedural cells
  blackHoles?: { x: number; y: number }[]; // code grid coords; sprite landing here = failure
  aliens?: { x: number; y: number }[];      // code grid coords; block forward movement until shot
  plasmaSupply?: number;                    // L5+: max number of times fire() can hit an alien. fire() past this fizzles silently.
  plasmaPickups?: { x: number; y: number }[]; // L5-10+: walking onto this cell grants +1 plasma (once)
}

export interface QuizQ {
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface Level {
  id: number;
  title: string;
  tagline: string;
  color: string;           // accent hex
  introNotes: string;      // lesson content (markdown-like)
  newCommands: { cmd: string; desc: string }[];
  challenges: Challenge[];
  quiz: QuizQ[];
}

// ─── Level 1 — Commands ───────────────────────────────────────────────────────

const L1: Level = {
  id: 1,
  title: "Commands",
  tagline: "Give the robot step-by-step instructions",
  color: "#2563eb",
  newCommands: [
    { cmd: "forward()", desc: "Move one cell in the direction you are facing." },
    { cmd: "turn_right()",   desc: "Rotate 90° clockwise (right)." },
    { cmd: "turn_left()",    desc: "Rotate 90° counter-clockwise (left)." },
  ],
  introNotes: `# Level 1 — Commands

## What Is a Command?
A **command** is an instruction you give to the computer. When Python sees a command, it executes it immediately and then moves to the next line.

In these challenges you control a robot inside a maze. The robot understands three commands:

| Command | What it does |
|---|---|
| \`forward()\` | Move one step in the direction you are facing |
| \`turn_right()\` | Rotate 90° to the right (clockwise) |
| \`turn_left()\` | Rotate 90° to the left (counter-clockwise) |

## How to Call a Command
A command name is followed by **parentheses** — that is what tells Python to run it:

\`\`\`python
forward()
turn_right()
forward()
\`\`\`

Python runs each line **top to bottom, one at a time**.

## Turning Does NOT Move You
Turning changes the direction you face, but you stay in the same cell. You still need \`forward()\` after turning to actually move.

## Errors
If you try to move into a wall, you will get an error and the run stops. Read the error message — it tells you exactly what went wrong.

## Your Goal
Each challenge shows a maze. Guide the robot from the blue circle to the gold star using only the three commands above.

Start with Challenge 1 and work your way through. The mazes get longer and more complex — and by the end of this level you will notice something interesting about your code…`,

  challenges: [
    {
      // ██████
      // S..E
      // ██████
      title: "Baby Steps",
      hint: "The exit is 3 steps to your right. Call forward() three times.",
      grid: [[1,1,1,1],[0,0,0,0],[1,1,1,1]],
      startX:0, startY:1, startDir:1, exitX:3, exitY:1,
      image: {
        src: "/python-maze/python_1-1.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 157.5, originY: 105,  // grid (0,0) top-left in image px
      },
      starterCode: `# Move forward to reach the exit!

forward()
`,
    },
    {
      // █████████
      // S.......E
      // █████████
      title: "Keep Going",
      hint: "Seven steps forward. Add more forward() calls.",
      grid: [[1,1,1,1,1,1,1,1],[0,0,0,0,0,0,0,0],[1,1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:1, exitX:7, exitY:1,
      image: {
        src: "/python-maze/python_1-2.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 57.5, originY: 105,
      },
      starterCode: `# The corridor is longer this time.

forward()
forward()
`,
    },
    {
      // █████
      // SXXXX     S = start (left), then 3 forwards to the corner
      // ████X     turn right (south), then forward
      // ████E     forward → gear
      title: "First Corner",
      hint: "Go forward to the end of the hallway, then turn right and head down to the gear.",
      grid: [
        [1,1,1,1],
        [0,0,0,0],
        [1,1,1,0],
        [1,1,1,0],
        [1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:3, exitY:3,
      image: {
        src: "/python-maze/python_1-3.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 107.5, originY: 54.5,
      },
      starterCode: `# The path turns! Go forward across the top, then turn_right() and go down.

forward()
forward()
forward()
# now turn and keep going to the gear
`,
    },
    {
      // ██████
      // SXXX██
      // ███X██
      // ███X██
      // ███XXE
      title: "The S-Curve",
      hint: "This time you will need to use turn_left() and turn_right()",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,0,1,1,1],
        [1,1,1,0,1,1,1],
        [1,1,1,0,1,1,1],
        [1,1,1,0,0,0,0],
        [1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:4,
      image: {
        src: "/python-maze/python_1-4.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 107.5, originY: 54.5,
      },
      starterCode: `# This time you will need to use turn_left() and turn_right()

forward()
forward()
forward()
turn_right()
`,
    },
    {
      // ███████
      // SXXXX██
      // ████X██
      // ████X██
      // EXXXXX█
      title: "U-Turn",
      hint: "Be sure to count your moves while using different commands.",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,0,0,1],
        [1,1,1,1,0,1],
        [1,1,1,1,0,1],
        [0,0,0,0,0,1],
        [1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:0, exitY:4,
      image: {
        src: "/python-maze/python_1-5.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 107.5, originY: 54.5,
      },
      starterCode: `# Be sure to count your moves while using different commands.

forward()
forward()
forward()
forward()
turn_right()
`,
    },
    {
      // █████
      // SX███
      // █XX██
      // ██XE█
      title: "Stairstep",
      hint: "Things are getting a little repetative here!",
      grid: [
        [1,1,1,1],
        [0,0,1,1],
        [1,0,0,1],
        [1,1,0,0],
        [1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:3, exitY:3,
      image: {
        src: "/python-maze/python_1-6.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 157.5, originY: 54.5,
      },
      starterCode: `# Things are getting a little repetative here!

forward()
turn_right()
forward()
turn_left()
`,
    },
    {
      // ████████
      // SXXXX███
      // ████XX██
      // █████XE█
      title: "Down the Stairs",
      hint: "Work your way down the staircase!",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,1,1,1],
        [1,1,1,1,0,0,1,1],
        [1,1,1,1,1,0,0,0],
        [1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:3,
      image: {
        src: "/python-maze/python_1-7.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 57.5, originY: 54.5,
      },
      starterCode: `# Work your way down the staircase!

forward()
forward()
forward()
forward()
turn_right()
`,
    },
    {
      // ████████
      // SXXXX███   long hall — but it's a TRAP, you can't reach the gear from the right end
      // ████X███
      // ████X███
      // ████X███
      // ████XE██   gear is below the middle of the hall, not at the right
      title: "The Trap",
      hint: "Be sure not to overshoot your path.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,1],
        [1,1,1,0,1,1,1,1],
        [1,1,1,0,1,1,1,1],
        [1,1,1,0,1,1,1,1],
        [1,1,1,0,0,0,0,1],
        [1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:5,
      image: {
        src: "/python-maze/python_1-8.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 57.5, originY: 4.5,
      },
      starterCode: `# Be sure not to overshoot your path.

forward()
forward()
forward()
turn_right()
`,
    },
    {
      // serpentine: 7 across, drop 1, 7 back left, drop 1, 5 right with gear
      title: "The Marathon",
      hint: "Snakes top-to-bottom: across, drop, back across, drop, across again. Count each segment.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0],
        [1,1,1,1,1,1,0],
        [1,0,0,0,0,0,0],
        [1,0,1,1,1,1,1],
        [1,0,0,0,0,0,1],
        [1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:5,
      image: {
        src: "/python-maze/python_1-9.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 57.5, originY: 4.5,
      },
      starterCode: `# A long winding path. Plan each segment before you write it.

forward()
forward()
forward()
forward()
forward()
forward()
turn_right()
# drop down, then turn right and head back the other way…
`,
    },
    {
      // winding maze with gear up top — path snakes around and ends back near the top
      title: "The Gauntlet",
      hint: "Use all you have learned on this long journey :)",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,1,1,1,0,0],
        [1,0,0,0,1,1,0],
        [1,1,1,0,1,1,0],
        [1,1,1,0,1,1,0],
        [1,1,1,0,0,0,0],
        [1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:1,
      image: {
        src: "/python-maze/python_1-10.png",
        width: 510, height: 360,
        cellPx: 50,
        originX: 57.5, originY: 4.5,
      },
      starterCode: `# Use all you have learned on this long journey :)
# Notice: this is getting LONG. Level 2 will show you how to repeat with a loop!

`,
    },
  ],

  quiz: [
    {
      question: "Does it matter if you use capital letters in a command name — for example, typing Forward() instead of forward()?",
      options: [
        "No — Python does not care about uppercase or lowercase",
        "Yes — Python is case-sensitive, so Forward() will cause an error",
        "Only the first letter must be lowercase",
        "Only matters inside a loop",
      ],
      answer: 1,
      explanation: "Python is case-sensitive. forward() and Forward() are completely different names. Only the exact lowercase spelling works.",
    },
    {
      question: "What happens if you misspell a command — for example, you type forwad() (missing the 'r')?",
      options: [
        "Python guesses what you meant and runs it anyway",
        "The robot moves half a step",
        "You get a NameError — Python does not recognize the name and stops",
        "The line is quietly skipped",
      ],
      answer: 2,
      explanation: "Python only knows names you define exactly. A single typo like forwad is an unknown name, so Python raises a NameError and the run stops.",
    },
    {
      question: "What if you forget the parentheses and write forward instead of forward()?",
      options: [
        "The robot still moves — Python knows what you mean",
        "The command is referenced but never actually called, so the robot does not move",
        "Python raises a SyntaxError immediately",
        "Python calls the command twice to compensate",
      ],
      answer: 1,
      explanation: "The parentheses are what tell Python to run the command. Without (), you are just naming the function, not calling it — the robot stays still.",
    },
    {
      question: "What happens when you call forward() and there is a wall directly ahead?",
      options: [
        "The robot stops safely at the wall",
        "The robot turns around automatically",
        "You get an error and the run stops",
        "The wall is removed",
      ],
      answer: 2,
      explanation: "Moving into a wall raises an error and stops the run. You need to plan your turns before each forward().",
    },
    {
      question: "In what order does Python run your commands?",
      options: [
        "Randomly — a different order each time",
        "Bottom to top",
        "Top to bottom, one line at a time",
        "All at the same time",
      ],
      answer: 2,
      explanation: "Python always reads your code top to bottom, executing one line at a time. The order you write your commands matters.",
    },
    {
      question: "You need the robot to move 5 steps forward. How many times must you call forward()?",
      options: ["4", "5", "6", "It depends on which direction you are facing"],
      answer: 1,
      explanation: "Each call to forward() moves the robot exactly one cell, so 5 calls = 5 steps, regardless of direction.",
    },
  ],
};

// ─── Level 2 — For Loops ──────────────────────────────────────────────────────

const L2: Level = {
  id: 2,
  title: "For Loops",
  tagline: "Stop repeating yourself — let the computer repeat for you",
  color: "#16a34a",
  newCommands: [
    { cmd: "for i in range(n):", desc: "Repeat the indented block n times. i counts from 0 to n−1." },
    { cmd: "fire()",              desc: "Fire a plasma shot — destroys the alien in line of sight ahead." },
  ],
  introNotes: `# Level 2 — For Loops

## The Problem with Repetition
In Level 1 you probably wrote code like this:

\`\`\`python
forward()
forward()
forward()
forward()
forward()
forward()
forward()
forward()
\`\`\`

Eight identical lines. Imagine if the corridor was 100 cells long!

## The Solution: for Loops
A **for loop** tells Python to run the same block of code a set number of times:

\`\`\`python
for i in range(8):
    forward()
\`\`\`

This does exactly the same thing as the eight lines above — but in just two lines.

## How It Works
- \`range(8)\` produces the numbers 0, 1, 2, 3, 4, 5, 6, 7 (eight values).
- On each pass through the loop, \`i\` holds the current number.
- Everything **indented** under \`for\` runs once per pass.

## Indentation Is Required
Python uses indentation (spaces) to know what belongs inside the loop:

\`\`\`python
for i in range(3):
    forward()   # inside the loop — runs 3 times
    turn_right()     # also inside — runs 3 times
turn_left()          # outside the loop — runs only once
\`\`\`

Use **4 spaces** (or one Tab) to indent.

## Multiple Loops
You can have more than one loop in your program:

\`\`\`python
for i in range(5):
    forward()
turn_right()
for i in range(5):
    forward()
\`\`\`

## Look for the Pattern
Before writing a loop, ask: *"Am I doing the same thing multiple times in a row?"* If yes — use a loop.

## 👽 Aliens Show Up
Halfway through this level, **aliens** appear in the maze. Walking into one ends the run! Use the new \`fire()\` command to destroy any alien in your way:

\`\`\`python
fire()       # plasma shot travels forward, destroys the first alien it hits
forward()    # now you can safely walk onto that cell
\`\`\`

The plasma travels along the corridor until it hits an alien or a wall. If there's no alien ahead, the shot just sails out — no harm done, but it still counts as one move. You'll combine \`fire()\` with your loops to clear paths and reach the gear.`,

  challenges: [
    {
      title: "Loop Warm-Up",
      hint: "6 Steps forward! Use aloop to keep your coding task short...",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,0,0,0],
        [1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:1,
      image: {
        src: "/python-maze/python_2-1.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 205, originY: 205,
      },
      starterCode: `#6 Steps forward! Use aloop to keep your coding task short...

for i in range(6):
    forward()
`,
    },
    {
      title: "Longer Corridor",
      hint: "How many steps to the exit? Put that number in range().",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:11, exitY:1,
      image: {
        src: "/python-maze/python_2-2.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 205,
      },
      starterCode: `# Count the cells, then loop.

`,
    },
    {
      title: "Staircase Return",
      hint: "The staircase from Level 1! Each step is: forward, turn right, forward, turn left. Loop it.",
      grid: [
        [1,1,1,1],
        [0,0,1,1],
        [1,0,0,1],
        [1,1,0,0],
        [1,1,1,0],
      ],
      startX:0, startY:1, startDir:1, exitX:3, exitY:4,
      image: {
        src: "/python-maze/python_2-3.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 255, originY: 105,
      },
      starterCode: `# Same maze as Level 1 — but this time use a loop.
# Pattern: forward, right, forward, left.

for i in range(3):
    forward()
    turn_right()
    forward()
    turn_left()
`,
    },
    {
      title: "Longer Staircase",
      hint: "Staircase and a little more... After using a loop you will need to add some individual commands.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [1,0,0,1,1,1,1,1],
        [1,1,0,0,1,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,1,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:5,
      image: {
        src: "/python-maze/python_2-4.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 155, originY: 55,
      },
      starterCode: `#Staircase and a little more...
#After using a loop you will need to add some individual commands.

`,
    },
    {
      title: "First Alien",
      hint: "An alien blocks your way! Use the new fire() command to destroy it, then count your way to the gear.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,1,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,1,0,0,1,1],
        [1,1,1,1,1,0,0,1],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:5,
      image: {
        src: "/python-maze/python_2-5.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 155, originY: 105,
      },
      aliens: [{ x: 1, y: 1 }],
      starterCode: `# NEW COMMAND: fire() destroys the alien in line of sight.
# Use it before walking into the alien, then count your loop to the gear.

`,
    },
    {
      title: "Two Loop Sandwhich",
      hint: "Two loops and a command sandwhich. This challenge require a single command between 2 loops.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:9, exitY:7,
      image: {
        src: "/python-maze/python_2-6.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 105, originY: 55,
      },
      starterCode: `#Two loops and a command sandwhich.
#This challenge require a single command between 2 loops.

`,
    },
    {
      title: "Loopy Horse Shoe",
      hint: "Two aliens guard the vertical drop! Fire to clear them, then loop your way to the gear.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,0],
        [0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:0, exitY:4,
      image: {
        src: "/python-maze/python_2-7.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 105, originY: 105,
      },
      aliens: [{ x: 9, y: 2 }, { x: 9, y: 4 }],
      starterCode: `# Two aliens block the way down! Use fire() and loops to get to the gear.

`,
    },
    {
      title: "5 Loops",
      hint: "Long corridors plus TWO aliens to clear along the way! Loop through each section and fire when needed.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,1,1],
        [1,1,1,1,1,0,1,1,1,1],
        [0,0,0,0,0,0,1,1,1,1],
        [1,0,1,1,1,1,1,1,1,0],
        [1,0,1,1,1,1,1,1,1,0],
        [1,0,1,1,1,1,1,1,1,0],
        [1,0,1,1,1,1,1,1,1,0],
        [1,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:9, exitY:5,
      image: {
        src: "/python-maze/python_2-8.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 5,
      },
      aliens: [{ x: 5, y: 2 }, { x: 9, y: 6 }],
      starterCode: `# Long corridors plus aliens. Loop through each section and fire when one's in your way.

`,
    },
    {
      title: "Double Case",
      hint: "Four aliens line the way down! Each descending stair step needs to be cleared. Reverse your loop on the way up.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [1,0,0,1,1,1,1,1,1,0,0,1],
        [1,1,0,0,1,1,1,1,0,0,1,1],
        [1,1,1,0,0,1,1,0,0,1,1,1],
        [1,1,1,1,0,0,0,0,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:11, exitY:1,
      image: {
        src: "/python-maze/python_2-9.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }],
      starterCode: `# Four aliens! Each descending step needs a fire() before you move. Then loop back up.

`,
    },
    {
      title: "The Big One",
      hint: "Combine everything: multiple loops, multiple turns, different step counts.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,1,1,1,1,1],
        [1,1,1,1,1,1,0,0,1,1,1,1],
        [0,0,1,1,1,1,1,0,0,1,1,1],
        [1,0,0,1,1,1,1,1,0,0,1,1],
        [1,1,0,0,1,1,1,1,1,0,0,1],
        [1,1,1,0,0,1,1,1,1,1,0,0],
        [1,1,1,1,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:0, exitY:3,
      image: {
        src: "/python-maze/python_2-10.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 5,
      },
      starterCode: `# Staircase, then a long corridor to the exit.
# Use a loop for the staircase and another for the corridor.

`,
    },
  ],

  quiz: [
    {
      question: "What does `for i in range(5):` do?",
      options: [
        "Runs the loop body 5 times, with i counting from 0 to 4",
        "Runs the loop body 6 times",
        "Runs the loop body until i equals 5",
        "Creates a variable called range",
      ],
      answer: 0,
      explanation: "range(5) produces 0,1,2,3,4 — five values — so the loop body runs 5 times.",
    },
    {
      question: "Which line is INSIDE the loop in this code?\n\nfor i in range(3):\n    forward()\nturn_right()",
      options: [
        "turn_right()",
        "forward()",
        "for i in range(3):",
        "Both forward() and turn_right()",
      ],
      answer: 1,
      explanation: "Only forward() is indented under the for statement, so only it runs 3 times. turn_right() runs once, after the loop.",
    },
    {
      question: "What is the value of i on the very first iteration of `for i in range(10):`?",
      options: ["1", "10", "0", "It varies"],
      answer: 2,
      explanation: "range() always starts at 0 by default, so i is 0 on the first pass.",
    },
    {
      question: "How many times does forward() run here?\n\nfor i in range(4):\n    forward()\n    turn_right()",
      options: ["4", "8", "2", "1"],
      answer: 0,
      explanation: "The entire loop body (both lines) runs 4 times, so forward() runs 4 times.",
    },
    {
      question: "You need to move forward 0 times. Which call produces no iterations?",
      options: ["range(0)", "range(1)", "range(-1)", "range()"],
      answer: 0,
      explanation: "range(0) produces no values, so the loop body never runs.",
    },
    {
      question: "Can you have TWO separate loops in the same program?",
      options: [
        "Yes — they run one after the other",
        "No — only one loop is allowed per program",
        "Yes — but they must be nested inside each other",
        "No — you must combine them into one loop",
      ],
      answer: 0,
      explanation: "You can have as many loops as you need. Each one runs to completion before the next one starts.",
    },
  ],
};

// ─── Level 3 — If Statements ─────────────────────────────────────────────────

const L3: Level = {
  id: 3,
  title: "If Statements",
  tagline: "Make decisions based on what the robot can sense",
  color: "#dc2626",
  newCommands: [
    { cmd: "if condition:",      desc: "Run the indented block only when condition is True." },
    { cmd: "elif condition:",    desc: "Check another condition if the first was False." },
    { cmd: "else:",              desc: "Run this block when all conditions above were False." },
    { cmd: "forward()",          desc: "Move one cell in the direction you are facing." },
    { cmd: "has_path_ahead()",   desc: "Returns True when the path ahead is clear (no wall)." },
    { cmd: "has_path_left()",    desc: "Returns True when the path to the left is clear." },
    { cmd: "has_path_right()",   desc: "Returns True when the path to the right is clear." },
    { cmd: "alien_in_sight()",   desc: "Returns True when an alien is in the cell directly in front of the robot." },
    { cmd: "for i in range(n):", desc: "Repeat the indented block n times (review from Level 2)." },
  ],
  introNotes: `# Level 3 — If Statements

## Sensing the World
So far your robot followed a fixed script — the same commands every time. But what if the maze changes? You need code that can **make decisions**.

In Level 3 you get three sensor commands you can plug into a decision:

| Command | What it does |
|---|---|
| \`has_path_ahead()\` | Returns True when the path ahead is **clear** |
| \`has_path_left()\` | Returns True when the path to the left is **clear** |
| \`has_path_right()\` | Returns True when the path to the right is **clear** |

## If Statements
An **if statement** runs a block of code only when a condition is True:

\`\`\`python
if has_path_right():
    turn_right()
\`\`\`

If the path to the right is clear, turn right. If it is blocked, nothing happens.

## If / Else
Add \`else:\` to handle both cases:

\`\`\`python
if has_path_ahead():
    forward()
else:
    turn_right()
\`\`\`

Exactly one branch runs — either the if block or the else block, never both.

## If / Elif / Else
Chain multiple conditions with \`elif\` ("else if"):

\`\`\`python
if has_path_ahead():
    forward()
elif has_path_right():
    turn_right()
else:
    turn_left()
\`\`\`

Python checks top to bottom and runs only the **first matching branch**.

## Combining with For Loops
Everything you learned in Level 2 still applies. Put an if statement **inside** a for loop to make a decision on every step:

\`\`\`python
for i in range(8):
    if has_path_ahead():
        forward()
    else:
        turn_right()
\`\`\`

The loop runs 8 times — each step the robot decides: move forward or turn. That is already much smarter than a fixed script.

## not, and, or
- \`not has_path_ahead()\` → True when the path is **blocked**
- \`has_path_ahead() and has_path_right()\` → True only when **both** are clear
- \`has_path_ahead() or has_path_right()\` → True when **either** is clear

## 👽 Spotting Aliens
You met \`fire()\` in Level 2. Now you can let the robot **decide on its own** whether to fire, using the new sensor:

\`\`\`python
if alien_in_sight():
    fire()
else:
    forward()
\`\`\`

\`alien_in_sight()\` only sees **one cell at a time** — it returns True when an alien is sitting in the cell directly in front of the robot. If the alien is two cells away, the robot can't see it yet; you have to walk closer before deciding what to do. (Plasma from \`fire()\` still travels the full corridor — see Level 4.) Combine the sensor with the path sensors to build smart logic that handles every cell.`,

  challenges: [
    {
      title: "Straight Shot",
      hint: "Just walk forward to the gear! Use a for loop to repeat forward().",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:4, startDir:1, exitX:11, exitY:4,
      image: {
        src: "/python-maze/python_3-1.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# Walk forward to reach the gear. How many cells away is it?
# Count the cells and put that number in range().

for i in range(0):  # change 0 to the right count
    forward()
`,
    },
    {
      title: "One Right Turn",
      hint: "Walk east, then turn right when the path runs out and head south to the gear. Use if/else!",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1],
      ],
      startX:1, startY:1, startDir:1, exitX:8, exitY:5,
      image: {
        src: "/python-maze/python_3-2.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# Walk east, then turn right when the path is blocked.
# The "if" branch is done — finish the "else" branch!

for i in range(0):  # how many iterations do you need?
    if has_path_ahead():
        forward()
    else:
        # which way should the robot turn?
`,
    },
    {
      title: "One Left Turn",
      hint: "Another single corner — but you'll need a different sensor this time. Which has_path_* fits?",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,0,1,1,1,1],
        [1,1,1,1,1,1,1,0,1,1,1,1],
        [1,1,1,0,0,0,0,0,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:3, startY:4, startDir:1, exitX:7, exitY:2,
      image: {
        src: "/python-maze/python_3-3.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# One corner. Add an elif with the right has_path_*() check.

for i in range(0):  # how many iterations do you need?
    if has_path_ahead():
        forward()
    # add an elif here to handle the corner
`,
    },
    {
      title: "The Compound",
      hint: "A maze inside a rectangle! Navigate the inner corridors with if/elif/else to find the gear.",
      grid: [
        [1,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
        [1,0,0,0,0,0,0,0,0,0,1,0],
        [1,0,1,1,1,1,1,1,1,0,1,0],
        [1,0,1,1,1,1,1,1,1,0,1,0],
        [1,0,1,0,0,0,0,0,0,0,1,0],
        [1,0,1,1,1,1,1,1,1,1,1,0],
        [1,0,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:0, startDir:1, exitX:3, exitY:5,
      image: {
        src: "/python-maze/python_3-4.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# A bigger maze with internal corridors.
# Build your own if/elif/else chain to navigate to the gear!

for i in range(0):  # how many iterations do you need?
    # your logic here
`,
    },
    {
      title: "The Vault",
      hint: "Three aliens are hidden in the corridors! Use alien_in_sight() in your if/elif chain to fire only when needed.",
      grid: [
        [1,0,0,0,0,0,0,0,0,0,0,0],
        [1,0,1,1,1,1,1,1,1,1,1,0],
        [1,0,1,0,0,0,0,0,0,0,1,0],
        [1,0,1,1,1,1,1,1,1,0,1,0],
        [1,0,1,1,1,1,1,1,1,0,1,0],
        [1,0,0,0,0,0,0,0,0,0,1,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:7, startDir:1, exitX:3, exitY:2,
      image: {
        src: "/python-maze/python_3-5.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 6, y: 7 }, { x: 11, y: 4 }, { x: 1, y: 1 }],
      starterCode: `# NEW SENSOR: alien_in_sight() — True when an alien is ahead.
# The pattern looks like this:
#     if alien_in_sight():
#         fire()
# Add it to your if/elif/else chain so the robot decides on its own.

for i in range(0):  # how many iterations do you need?
    # your logic here
`,
    },
    {
      title: "Right or Left?",
      hint: "This maze zigzags — turns go both right and left! Use if/elif/else to handle every corner.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,0,0,0,0,1,1,1,1,1,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
        [1,1,1,1,1,0,0,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:2, startY:1, startDir:1, exitX:8, exitY:6,
      image: {
        src: "/python-maze/python_3-6.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# This maze turns both directions.
# Build your own if/elif/else chain to handle every corner.

for i in range(0):  # how many iterations do you need?
    # your logic here
`,
    },
    {
      title: "The U-Curve",
      hint: "A U-shape with three aliens guarding the corners. Combine alien_in_sight() with your turn logic.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,0,0,0,0,1,1,1,1,1,1],
        [1,1,1,1,1,0,1,1,0,1,1,1],
        [1,1,1,1,1,0,1,1,0,1,1,1],
        [1,1,1,1,1,0,0,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:2, startY:1, startDir:1, exitX:8, exitY:2,
      image: {
        src: "/python-maze/python_3-7.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 5, y: 1 }, { x: 5, y: 4 }, { x: 8, y: 4 }],
      starterCode: `# Three aliens — one at each corner of the U!
# Pattern reminder:
#     if alien_in_sight():
#         fire()
# Put it at the top of your if/elif chain.

for i in range(0):  # how many iterations do you need?
    # your code here
`,
    },
    {
      title: "The Switchback",
      hint: "A long zigzag through the maze. Use if/elif/else to handle right turns AND left turns.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,0,0,0,1,1],
        [1,1,0,0,0,1,1,0,1,0,1,1],
        [1,1,0,1,0,1,1,0,1,0,0,0],
        [1,1,0,1,0,0,0,0,1,1,1,1],
        [0,0,0,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:6, startDir:1, exitX:10, exitY:4,
      image: {
        src: "/python-maze/python_3-8.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# A long zigzag through the maze.
# Build your if/elif/else chain to handle every corner.

for i in range(0):  # how many iterations do you need?
    # your code here
`,
    },
    {
      title: "The Valley",
      hint: "A V-shape with aliens on the way down AND on the way back up. Detect them with alien_in_sight().",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1,1,1,0,0],
        [1,0,0,1,1,1,1,1,1,0,0,1],
        [1,1,0,0,1,1,1,1,0,0,1,1],
        [1,1,1,0,0,1,1,0,0,1,1,1],
        [1,1,1,1,0,0,0,0,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:11, exitY:1,
      image: {
        src: "/python-maze/python_3-9.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 3, y: 3 }, { x: 7, y: 4 }, { x: 10, y: 2 }],
      starterCode: `# Three aliens along the V — one going down, two on the way up.
# Pattern reminder:
#     if alien_in_sight():
#         fire()
# Put it at the top of your if/elif chain.

for i in range(0):  # how many iterations do you need?
    # your code here
`,
    },
    {
      title: "The Long Journey",
      hint: "A long winding path through multiple sections. Plan your if/elif/else carefully to handle every kind of turn.",
      grid: [
        [0,0,0,0,0,0,0,1,1,1,1,1],
        [1,1,1,1,1,1,0,0,1,1,1,1],
        [0,0,1,1,1,1,1,0,0,1,1,1],
        [1,0,0,1,1,1,1,1,0,0,1,1],
        [1,1,0,0,1,1,1,1,1,0,0,1],
        [1,1,1,0,0,1,1,1,1,1,0,1],
        [1,1,1,1,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:0, startDir:1, exitX:0, exitY:2,
      image: {
        src: "/python-maze/python_3-10.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# The biggest maze yet. Build your own logic to find the way through.

for i in range(0):  # how many iterations do you need?
    # your code here
`,
    },
  ],

  quiz: [
    {
      question: "When does the code inside an `if` statement run?",
      options: [
        "Only when the condition is True",
        "Always, regardless of the condition",
        "Only when the condition is False",
        "Only on the first loop iteration",
      ],
      answer: 0,
      explanation: "The if block runs only when its condition evaluates to True.",
    },
    {
      question: "What does has_path_ahead() return when the path in front is clear?",
      options: ["True", "False", "0", "None"],
      answer: 0,
      explanation: "has_path_ahead() returns True when the path IS clear — no wall blocking the way.",
    },
    {
      question: "In an if / elif / else chain, how many branches run?",
      options: [
        "Exactly one — the first condition that is True",
        "All of them, top to bottom",
        "Only the else branch",
        "All branches whose condition is True",
      ],
      answer: 0,
      explanation: "Python checks conditions top to bottom and runs only the first matching branch.",
    },
    {
      question: "In this code, when does `turn_right()` execute?\n\nfor i in range(5):\n    if has_path_ahead():\n        forward()\n    else:\n        turn_right()",
      options: [
        "When the path ahead is blocked",
        "Every loop iteration, no matter what",
        "When the path ahead is clear",
        "Only on the very last iteration",
      ],
      answer: 0,
      explanation: "The else block runs when the if condition is False — meaning has_path_ahead() is False, so the path is blocked. That's when the robot turns.",
    },
    {
      question: "What does the `else` block do in an if / else statement?",
      options: [
        "Runs only when the if condition is False",
        "Runs every time, before the if block",
        "Runs when the if condition is True",
        "Only works inside a for loop",
      ],
      answer: 0,
      explanation: "The else block is the fallback — it runs only when the if (and any elif) conditions were all False.",
    },
    {
      question: "You want to turn left only when the path to the left is clear. Which code is correct?",
      options: [
        "if has_path_left(): turn_left()",
        "if turn_left(): has_path_left()",
        "has_path_left(turn_left())",
        "for has_path_left() in range(5):",
      ],
      answer: 0,
      explanation: "has_path_left() is the condition — it returns True or False. Put it in the if, then call turn_left() in the body.",
    },
  ],
};

// ─── Level 4 — While Loops ────────────────────────────────────────────────────

const L4: Level = {
  id: 4,
  title: "While Loops",
  tagline: "Repeat until the goal is reached — no counting required",
  color: "#7c3aed",
  newCommands: [
    { cmd: "while condition:", desc: "Repeat the indented block as long as condition is True." },
    { cmd: "not",              desc: "Flips True to False and False to True." },
    { cmd: "at_goal()",        desc: "Returns True when the robot is standing on the goal tile." },
    { cmd: "has_path_forward()", desc: "Returns True when the path directly ahead is clear." },
    { cmd: "alien_in_sight()", desc: "Returns True if an alien is in the cell directly ahead of the robot (one cell only)." },
    { cmd: "fire()",           desc: "Fires a plasma shot — destroys the alien in line of sight." },
  ],
  introNotes: `# Level 4 — While Loops

## The Problem with For Loops
A \`for\` loop works great when you know exactly how many steps to take. But what if the maze changes or you don't know the distance ahead of time? You need a loop that keeps going **until a goal is reached**.

## While Loops
A **while loop** repeats its body as long as its condition stays \`True\`:

\`\`\`python
while not at_goal():
    forward()
\`\`\`

Python checks the condition before every iteration. The moment \`at_goal()\` returns True, the loop stops automatically — no counting needed.

## While vs For

| | **for** loop | **while** loop |
|---|---|---|
| Best for | A known number of steps | Unknown number of steps |
| Stops when | All iterations are done | Condition becomes False |
| Example | Walk exactly 5 steps | Walk until you reach the goal |

## Checking the Path
Use \`has_path_forward()\` to loop only while the way ahead is clear:

\`\`\`python
while has_path_forward():
    forward()
\`\`\`

The loop stops the moment a wall blocks the path.

## Combining While + If
Put if statements inside a while loop to make decisions on every step:

\`\`\`python
while not at_goal():
    if has_path_right():
        turn_right()
    if has_path_forward():
        forward()
\`\`\`

## 👽 Aliens Block the Path
Later challenges in this level add **aliens** — obstacles that block movement. Walking into one ends the run! Detect them with \`alien_in_sight()\` and clear them with \`fire()\`:

\`\`\`python
while not at_goal():
    if alien_in_sight():
        fire()
    elif has_path_forward():
        forward()
    else:
        turn_right()
\`\`\`

\`alien_in_sight()\` only reports what's in the **cell directly in front** of the robot — not the whole corridor. If an alien is two or more cells away, the sensor returns False until you step closer. This forces you to think about position, not just direction.

\`fire()\`, on the other hand, is **long range** — the plasma travels forward until it hits an alien or a wall, destroying the first alien it finds. So you can shoot an alien several cells down a corridor even if your sensor can't see it yet. Useful when you've planned the layout and want to clear a path before walking into it.

If there's no alien in the plasma's path, the shot harmlessly sails to the wall.

## ⚠️ Infinite Loops
If the condition **never** becomes False, the loop runs forever. This is called an **infinite loop**.

\`\`\`python
# DANGER — this never stops!
while True:
    forward()
\`\`\`

Always make sure something inside the loop can eventually make the condition False. The maze runner will stop after 2000 steps to protect you.
`,

  challenges: [
    {
      title: "Straight to the Goal",
      hint: "Walk forward until you reach the goal — but you don't need to count steps this time. A `while` loop can run until a condition becomes False.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,0,0,0,0,0,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:2, startY:4, startDir:1, exitX:8, exitY:4,
      image: {
        src: "/python-maze/python_4-1.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# Loop until you arrive at the goal. Use at_goal() in your condition.

while not at_goal():
    # what should the robot do each step?
`,
    },
    {
      title: "Long Corridor",
      hint: "A longer hallway, but the same while loop still works. That's the magic — no counting needed!",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:4, startDir:1, exitX:11, exitY:4,
      image: {
        src: "/python-maze/python_4-2.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# Same idea as before — the while loop handles any length corridor.

while not at_goal():
    # what should the robot do each step?
`,
    },
    {
      title: "Walk Until Blocked",
      hint: "Walk east as far as you can, then turn at the corner. Use `while has_path_forward():` for the first stretch.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,0,0,0,0,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:3, startY:6, startDir:1, exitX:8, exitY:2,
      image: {
        src: "/python-maze/python_4-3.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# Walk until the wall, turn, walk until the goal.
# Two while loops with a turn between them.

while has_path_forward():
    # fill in the body

# now what?
`,
    },
    {
      title: "The S-Curve",
      hint: "Same idea — walk until blocked, turn, walk again. Which way does this corner turn?",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,0,0,0,0,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:3, startY:1, startDir:1, exitX:8, exitY:5,
      image: {
        src: "/python-maze/python_4-4.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# Two while loops, one turn between them.

while has_path_forward():
    # fill in the body

# turn and finish
`,
    },
    {
      title: "Follow the Left Wall",
      hint: "An inner-corridor maze. A single while loop with if/elif/else handles every turn — try keeping your hand on the left wall.",
      grid: [
        [1,0,0,0,0,0,0,0,0,0,0,0],
        [1,0,1,1,1,1,1,1,1,1,1,0],
        [1,0,1,0,0,0,0,0,0,0,1,0],
        [1,0,1,1,1,1,1,1,1,0,1,0],
        [1,0,1,1,1,1,1,1,1,0,1,0],
        [1,0,0,0,0,0,0,0,0,0,1,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:7, startDir:1, exitX:3, exitY:2,
      image: {
        src: "/python-maze/python_4-5.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      starterCode: `# A while loop + if/elif/else. Try a left-hand wall-follow strategy.

while not at_goal():
    # your logic here
`,
    },
    {
      title: "First Encounter",
      hint: "Aliens block your path. Use `alien_in_sight()` to spot them and `fire()` to clear them out.",
      grid: [
        [1,1,1,1,1,1,1,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,0,0,1],
        [1,1,1,0,0,0,1,1,0,1,1,1],
        [1,1,1,0,1,0,1,1,0,1,1,1],
        [1,1,1,0,1,0,0,0,0,1,1,1],
        [1,0,0,0,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:1, startY:6, startDir:1, exitX:8, exitY:0,
      image: {
        src: "/python-maze/python_4-6.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 6, y: 5 }, { x: 10, y: 2 }],
      starterCode: `# Aliens block the path. Add an alien_in_sight() / fire() branch to your logic.

while not at_goal():
    # your logic here
`,
    },
    {
      title: "Two Paths",
      hint: "Two routes to the gear — each blocked by an alien. Pick a path and clear what's in the way.",
      grid: [
        [0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,0,1,1,1,1,0,1],
        [1,1,1,1,1,0,1,1,0,0,0,1],
        [1,1,1,1,1,0,1,1,0,1,1,1],
        [1,1,1,1,1,0,1,1,0,1,1,1],
        [1,1,1,1,1,0,0,0,0,1,1,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
      ],
      startX:0, startY:0, startDir:1, exitX:7, exitY:5,
      image: {
        src: "/python-maze/python_4-7.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 5, y: 3 }, { x: 9, y: 2 }],
      starterCode: `# Two paths, two aliens. Plan a route and handle the alien with alien_in_sight() + fire().

while not at_goal():
    # your logic here
`,
    },
    {
      title: "Alien Gauntlet",
      hint: "Three aliens! One blocks the only way forward — the others lurk on side paths you can avoid (or destroy).",
      grid: [
        [0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,0,0,0,0,0,0,1],
        [1,1,1,1,1,0,1,1,0,1,1,1],
        [1,1,1,1,1,0,1,1,0,1,1,1],
        [1,1,1,1,1,0,0,0,0,1,1,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
        [1,1,0,0,0,0,1,1,1,1,1,1],
      ],
      startX:0, startY:0, startDir:1, exitX:3, exitY:7,
      image: {
        src: "/python-maze/python_4-8.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 3, y: 0 }, { x: 8, y: 4 }, { x: 6, y: 5 }],
      starterCode: `# Three aliens — one blocks the only way out. Use alien_in_sight() + fire().

while not at_goal():
    # your logic here
`,
    },
    {
      title: "The Climb",
      hint: "Descend the staircase, then climb back up the other side. Watch for the alien up top — it's a wrong turn!",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,0,1],
        [0,0,1,1,1,1,1,1,1,1,0,1],
        [1,0,0,1,1,1,1,1,1,0,0,0],
        [1,1,0,0,1,1,1,1,0,0,1,0],
        [1,1,1,0,0,1,1,0,0,1,1,0],
        [1,1,1,1,0,0,0,0,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:7,
      image: {
        src: "/python-maze/python_4-9.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 10, y: 0 }],
      starterCode: `# Down the stair, back up the other side, then down to the gear.
# An alien hides on a wrong turn — only shoot if you take that path!

while not at_goal():
    # your logic here
`,
    },
    {
      title: "The Trident",
      hint: "Three aliens guard three branches. Plan which path you'll take — and which aliens you'll shoot!",
      grid: [
        [0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,0,1,1,1,1,1,0,1],
        [1,1,1,1,0,1,1,1,0,0,0,1],
        [1,1,1,1,0,1,1,1,0,1,1,1],
        [1,0,0,0,0,0,0,0,0,1,1,1],
        [1,1,1,1,0,1,1,1,1,1,1,1],
        [1,1,1,1,0,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:0, startDir:1, exitX:1, exitY:4,
      image: {
        src: "/python-maze/python_4-10.png",
        width: 710, height: 510,
        cellPx: 50,
        originX: 55, originY: 55,
      },
      aliens: [{ x: 4, y: 1 }, { x: 4, y: 6 }, { x: 10, y: 1 }],
      starterCode: `# Three aliens, multiple paths. Build your decision logic to find a route to the gear.

while not at_goal():
    # your logic here
`,
    },
  ],

  quiz: [
    {
      question: "A while loop runs its body…",
      options: [
        "A fixed number of times",
        "Only once",
        "As long as its condition is True",
        "Until the program ends",
      ],
      answer: 2,
      explanation: "The while loop checks its condition before every iteration and keeps running while it remains True.",
    },
    {
      question: "What happens if a while loop's condition is never False?",
      options: [
        "Python raises a SyntaxError",
        "The loop skips its body",
        "Python automatically breaks after 10 iterations",
        "The loop runs forever (infinite loop)",
      ],
      answer: 3,
      explanation: "An infinite loop runs without stopping — always make sure your condition can eventually become False.",
    },
    {
      question: "Which code correctly moves the robot forward until it reaches the goal?",
      options: [
        "while at_goal():\n    forward()",
        "while not at_goal():\n    forward()",
        "if not at_goal():\n    forward()",
        "for at_goal() in range(10):\n    forward()",
      ],
      answer: 1,
      explanation: "`while not at_goal()` keeps looping as long as the robot has NOT reached the goal.",
    },
    {
      question: "You want to walk forward while the path ahead is clear. Which condition should you use?",
      options: [
        "while not has_path_forward():",
        "if has_path_forward():",
        "while has_path_forward():",
        "for has_path_forward() in steps:",
      ],
      answer: 2,
      explanation: "`while has_path_forward()` means 'keep going as long as the path ahead is clear'.",
    },
    {
      question: "What is the main difference between a for loop and a while loop?",
      options: [
        "A while loop always runs faster than a for loop",
        "A for loop repeats a known number of times; a while loop repeats until a condition changes",
        "A for loop can use if statements; a while loop cannot",
        "There is no difference — they are interchangeable",
      ],
      answer: 1,
      explanation: "Use for when you know how many repetitions you need; use while when you loop until something changes.",
    },
    {
      question: "In the right-hand rule algorithm, what does the robot check FIRST at each step?",
      options: [
        "Move forward immediately",
        "Turn left first",
        "Check if it has reached the goal",
        "if has_path_right() — is there a clear path to the right?",
      ],
      answer: 3,
      explanation: "The right-hand rule always checks has_path_right() first — if the path is clear to the right, turn and move that way.",
    },
  ],
};

// ─── Level 5 — elif and else ──────────────────────────────────────────────────

const L5: Level = {
  id: 5,
  title: "Strategy & Plasma",
  tagline: "Combine every tool — and watch your ammo!",
  color: "#059669",
  newCommands: [
    { cmd: "(plasma supply)", desc: "L5 mazes give you a LIMITED number of plasma shots. Pick a path you can actually clear!" },
    { cmd: "and / or",        desc: "Combine two conditions: `a and b` is True only when both are True; `a or b` is True when either is True." },
    { cmd: "(nested loops)",  desc: "Put a loop inside another loop to repeat a repeating pattern. Inner loop runs fully on each outer tick." },
  ],
  introNotes: `# Level 5 — Strategy & Plasma

## Bring It All Together
You've learned a lot:

- \`forward()\` and turns (Level 1)
- \`for\` loops to repeat counted actions (Level 2)
- \`if / elif / else\` to make decisions (Level 3)
- \`while\` loops to keep going until a condition changes (Level 4)
- \`fire()\` and \`alien_in_sight()\` to handle aliens

Level 5 adds two more building blocks — **nested loops** (a loop inside a loop) and **\`and\` / \`or\`** (combining two conditions) — and asks you to **choose the right tool for the moment**.

## Mix and Match
Real solutions usually combine forms. You might:

- Use a few **individual commands** to position the robot first
- Then a **for loop** to clear a known number of aliens
- Then a **while loop** to walk to the goal
- All decisions inside an **if/elif/else chain**

Example:

\`\`\`python
forward()             # walk past the entrance
forward()
fire()                # clear the first alien
forward()

while not at_goal():  # then auto-pilot the rest
    if alien_in_sight():
        fire()
    elif has_path_forward():
        forward()
    else:
        turn_right()
\`\`\`

There's almost never just **one** right structure. Match the tool to the situation.

## Nesting Loops
Sometimes the same pattern repeats several times — a corridor that needs "fire, then walk" three times in a row, for example. Put a small **loop inside another loop** and your code shrinks dramatically.

\`\`\`python
# Long version — works, but lots of repetition
fire()
forward()
forward()
turn_right()
forward()
fire()
forward()
forward()
turn_right()
forward()
\`\`\`

The exact same path with a nested loop:

\`\`\`python
# Two segments, each: fire + 2 forwards + a right turn + 1 step
for segment in range(2):
    fire()
    for i in range(2):
        forward()
    turn_right()
    forward()
\`\`\`

The **outer loop** repeats the whole pattern. The **inner loop** handles the repeated forwards inside one segment. Read it inside-out: "do 2 forwards, then the whole thing 2 times."

Nesting works with any loop combo — \`for\` inside \`for\`, \`for\` inside \`while\`, even \`while\` inside \`while\`. Look for repetition in your own code and ask: "Could a loop do this?"

## ⚫ Black Holes
Level 5 adds **black holes** — pulsing dark traps scattered through the mazes. Stepping onto one **ends the run immediately**.

Unlike aliens, black holes do **not** block your movement — there's no wall to bump into. The robot will happily walk straight into a black hole if your code tells it to. The only defense is **looking at the maze** and planning turns that avoid every dark cell.

Side branches often lead to black holes — a blind "always turn right" or "always go forward" rule will doom you. Decide each turn deliberately.

## ⚡ Plasma Supply
Level 5 mazes give you a **limited number of plasma shots** — watch the ⚡ PLASMA badge above the maze.

- Each \`fire()\` uses 1 plasma — whether it hits or misses
- When plasma hits 0, future \`fire()\` calls fizzle silently (no shot leaves the robot)
- Walking into an alien you couldn't shoot ends the run

This means **route choice matters**. Some mazes have multiple paths to the goal:

- A short path with 4 aliens — needs at least 4 plasma
- A longer winding path with 1 alien — works on a small supply

Count the aliens on each path **before you start writing code**. Pick a path your supply can handle.

## ⚡ Plasma Pickups (late-level)
Some mazes drop **glowing blue plasma pickups** in the corridors. Walk onto one and it's gone — your ⚡ PLASMA badge ticks up by 1 and flashes briefly. Pickups are one-time only and reset when you Run again. Use them when the maze has more aliens than starting plasma.

## Why Order Still Matters
Inside your \`if / elif / else\` chains, the **first matching branch** is the only one that runs. Use that to your advantage:

\`\`\`python
if alien_in_sight():       # check this first — don't walk into aliens!
    fire()
elif has_path_forward():
    forward()
else:
    turn_right()
\`\`\`

If you put \`has_path_forward()\` first, the robot would walk into the alien (because forward is technically open until you collide). Order = intent.

## Combining Conditions — \`and\` / \`or\`
Sometimes one check isn't enough. Python's \`and\` and \`or\` let you combine two conditions into one:

- \`a and b\` is True **only when both** a and b are True
- \`a or b\` is True when **either** a or b (or both) are True

This is the clean way to express "right AND left both open" — without nesting one if inside another:

\`\`\`python
# Nested — has the gap we hit on L5-6
if has_path_right():
    if has_path_left():       # if this is False, nothing runs
        turn_left()
        forward()
elif has_path_forward():       # never reached when right was True

# Flat with \`and\` — every branch is reachable
if has_path_right() and has_path_left():
    turn_left()
    forward()
elif has_path_forward():
    forward()
\`\`\`

\`or\` shines when several different conditions all deserve the same action:

\`\`\`python
if alien_in_sight() or not has_path_forward():
    # do something other than walking forward
    ...
\`\`\`

**Rule of thumb:** if you're about to nest \`if X: if Y:\`, ask whether \`if X and Y:\` says the same thing. Usually it does — and the flat version stays inside the elif/else chain, so every branch keeps its fallback.`,

  challenges: [
    {
      title: "Stay the Course",
      hint: "⚫ NEW: BLACK HOLES! Stepping on one ends the run. The corridor is straight — ignore the side branches.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,0,1,1,1,1,1,1,1,1,1],
        [1,1,0,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
        [1,1,1,1,1,0,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:3, startDir:1, exitX:10, exitY:3,
      image: { src: "/python-maze/python_5-1.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 2, y: 1 }, { x: 5, y: 5 }],
      starterCode: `# NEW: ⚫ black holes! Walking onto one ends your run instantly.
# Your code controls every step — turn carefully and stay on the safe path.

`,
    },
    {
      title: "Knowing When to Turn",
      hint: "Only ONE branch leads to the gear — the others dead-end in black holes. Walking past your turn is just as fatal.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,0,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,0,1,1,1,1,1,1,1,1],
        [1,1,1,0,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:3, startDir:1, exitX:8, exitY:1,
      image: { src: "/python-maze/python_5-2.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 10, y: 3 }, { x: 3, y: 5 }],
      starterCode: `# One branch leads to the gear — the others end the run.
# Count cells on the maze before you write your moves.

`,
    },
    {
      title: "Three Wrong Turns",
      hint: "Several decision points, each with one safe turn and at least one black-hole trap. Don't pattern-match — plan every turn.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,0,1,1,1,1,1,1,1,1],
        [1,1,1,0,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,1,1,1,0,1,1],
        [1,1,1,1,1,0,1,1,1,0,1,1],
        [1,1,1,1,1,0,0,0,0,0,1,1],
        [1,1,1,1,1,1,1,1,1,0,1,1],
        [1,1,1,1,1,1,1,1,1,0,1,1],
      ],
      startX:0, startY:3, startDir:1, exitX:9, exitY:7,
      image: { src: "/python-maze/python_5-3.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 9, y: 3 }, { x: 3, y: 1 }],
      starterCode: `# Three intersections, each with a trap. There's no single rule that works.
# Look at the maze and decide each turn one by one.

`,
    },
    {
      title: "The Maze With Eyes",
      hint: "FIVE black holes scattered everywhere. Almost every branch off the main corridor is a trap.",
      grid: [
        [1,1,1,1,1,1,1,1,0,0,0,0],
        [1,0,1,1,1,1,1,1,0,1,1,1],
        [1,1,0,1,1,1,1,1,0,1,1,1],
        [1,1,0,1,1,1,1,1,0,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,1,1],
        [1,1,0,1,1,1,1,1,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:4, startDir:1, exitX:10, exitY:0,
      image: { src: "/python-maze/python_5-4.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 11, y: 0 }, { x: 9, y: 4 }, { x: 8, y: 5 }, { x: 2, y: 2 }, { x: 2, y: 5 }],
      starterCode: `# Think about some basic commands prior to the while statement...

`,
    },
    {
      title: "Aliens Return",
      hint: "Nesting your loops could shorten your code here...",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,1,1,1,1,1,1],
        [1,0,1,1,0,1,1,1,1,1,1,1],
        [1,0,1,1,0,1,1,1,1,1,1,0],
        [1,0,1,1,0,0,0,0,0,0,0,0],
        [1,1,1,1,0,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
      ],
      startX:0, startY:1, startDir:1, exitX:11, exitY:7,
      image: { src: "/python-maze/python_5-5.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 5, y: 1 }, { x: 1, y: 4 }, { x: 4, y: 5 }, { x: 11, y: 3 }],
      aliens: [{ x: 2, y: 1 }, { x: 4, y: 3 }, { x: 7, y: 4 }],
      starterCode: `# Nesting your loops could shorten your code here...

`,
    },
    {
      title: "Make Every Shot Count",
      hint: "⚡ NEW: limited plasma! Check the ⚡ PLASMA badge above the maze — every fire() ticks it down by 1. When it hits 0, no more shots.",
      grid: [
        [0,0,0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,0,1,1,1,1,1,0,1],
        [1,1,1,1,0,1,1,1,0,0,0,1],
        [1,1,1,1,0,1,1,1,0,1,1,1],
        [1,0,0,0,0,0,0,0,0,1,1,1],
        [1,1,1,1,0,1,1,1,1,1,1,1],
        [1,1,1,1,0,0,0,0,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:0, startDir:1, exitX:7, exitY:6,
      image: { src: "/python-maze/python_5-6.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 1, y: 4 }, { x: 4, y: 2 }],
      aliens: [{ x: 3, y: 0 }, { x: 9, y: 2 }, { x: 6, y: 4 }, { x: 6, y: 6 }],
      plasmaSupply: 4,
      starterCode: `# ⚡ NEW: limited plasma! The ⚡ PLASMA badge above the maze shows shots left.
# Every fire() costs 1 — hit or miss. Wasted shots cost runs.

`,
    },
    {
      title: "Six Aliens, Two Shots",
      hint: "More aliens than shots. You can't kill them all — find a route that only forces you past two.",
      grid: [
        [0,0,0,0,0,0,0,1,1,1,1,1],
        [1,1,1,1,0,1,0,0,0,1,1,1],
        [1,1,1,1,0,1,1,1,0,0,0,1],
        [1,1,1,1,0,1,1,1,0,1,0,1],
        [1,0,0,0,0,0,0,0,0,1,0,1],
        [1,1,1,1,0,1,1,1,1,1,0,1],
        [1,1,1,1,0,0,0,0,0,0,0,1],
        [0,0,0,0,0,1,1,1,1,1,1,1],
      ],
      startX:0, startY:0, startDir:1, exitX:1, exitY:7,
      image: { src: "/python-maze/python_5-7.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 1, y: 4 }],
      aliens: [{ x: 4, y: 1 }, { x: 4, y: 3 }, { x: 3, y: 7 }, { x: 8, y: 3 }, { x: 10, y: 4 }, { x: 7, y: 6 }],
      plasmaSupply: 2,
      starterCode: `# Six aliens, two shots. You can't clear them all.
# Find a route that only forces you past two.

`,
    },
    {
      title: "The Long Way Around",
      hint: "Six aliens, two shots. The short paths are traps — find the LONG route that needs only two fires.",
      grid: [
        [0,0,0,0,0,0,0,0,0,0,1,1],
        [0,1,1,1,1,1,1,1,1,0,1,1],
        [0,1,1,1,1,0,1,1,0,0,0,0],
        [0,0,0,0,0,0,1,1,0,1,1,0],
        [0,1,1,1,1,0,0,0,0,1,1,0],
        [0,1,1,1,1,0,1,1,1,1,1,0],
        [0,1,1,1,1,0,1,1,1,0,0,0],
        [0,0,0,0,0,0,1,1,1,1,1,0],
      ],
      startX:11, startY:7, startDir:3, exitX:5, exitY:5,
      image: { src: "/python-maze/python_5-8.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 5, y: 2 }, { x: 9, y: 6 }],
      aliens: [{ x: 8, y: 2 }, { x: 8, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 0 }, { x: 2, y: 3 }, { x: 5, y: 6 }],
      plasmaSupply: 2,
      starterCode: `# The shortest-looking routes are traps. Find the long path that costs only 2 fires.

`,
    },
    {
      title: "Walk Around, Don't Shoot",
      hint: "Not every alien is in your way. Plan a route that walks past the ones you don't need to clear.",
      grid: [
        [1,1,1,1,1,1,1,0,0,0,0,1],
        [0,0,1,1,1,1,1,0,1,1,0,1],
        [1,0,0,1,1,1,1,0,1,0,0,0],
        [1,1,0,0,1,1,1,0,0,0,1,0],
        [1,1,1,0,0,1,1,0,0,1,1,0],
        [1,1,1,0,0,0,0,0,1,1,1,0],
        [1,1,1,0,1,1,1,1,1,1,1,0],
        [1,1,1,0,1,1,1,1,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:7,
      image: { src: "/python-maze/python_5-9.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 3, y: 7 }, { x: 4, y: 4 }, { x: 8, y: 4 }],
      aliens: [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 9, y: 0 }, { x: 10, y: 2 }, { x: 11, y: 5 }, { x: 5, y: 5 }],
      plasmaSupply: 4,
      starterCode: `# Some aliens are on the path. Some aren't. Spot the difference before you code.

`,
    },
    {
      title: "Pick Up the Pieces",
      hint: "⚡ NEW: plasma pickups! Glowing blue circles on the maze. Walk onto one and your ⚡ PLASMA counter ticks UP by 1. They're one-time only.",
      grid: [
        [0,1,0,1,0,0,0,0,0,0,0,0],
        [0,1,0,1,0,1,0,1,1,1,1,0],
        [0,0,0,0,0,1,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,0],
        [0,0,0,0,0,1,1,1,0,0,0,0],
        [0,0,0,1,0,0,1,1,1,1,1,0],
        [0,0,0,1,1,0,0,1,1,1,1,0],
        [0,0,0,1,1,1,0,0,0,0,0,0],
      ],
      startX:0, startY:7, startDir:0, exitX:0, exitY:0,
      image: { src: "/python-maze/python_5-10.png", width: 710, height: 510, cellPx: 50, originX: 55, originY: 55 },
      blackHoles: [{ x: 8, y: 4 }, { x: 2, y: 0 }, { x: 1, y: 5 }],
      aliens: [{ x: 0, y: 4 }, { x: 5, y: 5 }, { x: 8, y: 2 }, { x: 1, y: 2 }, { x: 5, y: 0 }],
      plasmaPickups: [{ x: 10, y: 4 }, { x: 2, y: 1 }],
      plasmaSupply: 3,
      starterCode: `# NEW: ⚡ pickups! Glowing blue cells give +1 plasma when you walk onto them.
# More aliens than starting shots — plan a route that grabs the plasma you need.

`,
    },
  ],

  quiz: [
    {
      question: "What does `elif` do that a second `if` statement does not?",
      options: [
        "It only checks its condition if every condition above was False",
        "It runs at the same time as the first if",
        "It always runs, regardless of the first if",
        "It repeats the previous block",
      ],
      answer: 0,
      explanation: "elif is only evaluated when all conditions above it were False. A second if is always evaluated, regardless of what came before.",
    },
    {
      question: "In an if / elif / else chain, how many branches run when a condition is True?",
      options: [
        "Exactly one — the first matching branch",
        "All branches whose conditions are True",
        "Two — the if and the else",
        "It depends on the number of elif statements",
      ],
      answer: 0,
      explanation: "Python checks top to bottom and stops at the first True condition. Only that one branch runs.",
    },
    {
      question: "Both has_path_right() and has_path_forward() are True. Which branch runs?\n\nif has_path_right():\n    turn_right()\nelif has_path_forward():\n    forward()",
      options: [
        "if has_path_right() — it is checked first",
        "elif has_path_forward() — forward takes priority",
        "Both branches run",
        "Neither — you need an else",
      ],
      answer: 0,
      explanation: "Python checks if first. Since has_path_right() is True, it runs turn_right() and skips the elif entirely.",
    },
    {
      question: "What happens if no condition is True and there is no else?",
      options: [
        "Nothing runs — the robot does nothing that step",
        "Python raises an error",
        "The last elif runs as a default",
        "The if block runs anyway",
      ],
      answer: 0,
      explanation: "Without an else, if no condition matches, the entire chain is skipped and nothing happens that iteration.",
    },
    {
      question: "Why is if/elif/else generally better than multiple separate if statements for maze control?",
      options: [
        "It ensures exactly one action happens per step — multiple ifs could all run at once",
        "It runs faster in Python",
        "It allows more than three choices",
        "It works without indentation",
      ],
      answer: 0,
      explanation: "With separate ifs, multiple branches can all be True and all run in one step. if/elif/else guarantees only one action per loop iteration.",
    },
    {
      question: "You swap the order so has_path_forward() comes before has_path_right(). What changes?",
      options: [
        "The robot now prefers going forward over turning right when both are open",
        "Nothing — elif/else order does not matter",
        "The else block stops working",
        "The robot moves twice as fast",
      ],
      answer: 0,
      explanation: "Order sets priority. Whichever condition appears first is checked first and wins when multiple conditions are True.",
    },
  ],
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const LEVELS: Level[] = [L1, L2, L3, L4, L5];
