// ─── Types ────────────────────────────────────────────────────────────────────

export type Dir = 0 | 1 | 2 | 3; // N=0  E=1  S=2  W=3

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
    { cmd: "move_forward()", desc: "Move one cell in the direction you are facing." },
    { cmd: "turn_right()",   desc: "Rotate 90° clockwise (right)." },
    { cmd: "turn_left()",    desc: "Rotate 90° counter-clockwise (left)." },
  ],
  introNotes: `# Level 1 — Commands

## What Is a Command?
A **command** is an instruction you give to the computer. When Python sees a command, it executes it immediately and then moves to the next line.

In these challenges you control a robot inside a maze. The robot understands three commands:

| Command | What it does |
|---|---|
| \`move_forward()\` | Move one step in the direction you are facing |
| \`turn_right()\` | Rotate 90° to the right (clockwise) |
| \`turn_left()\` | Rotate 90° to the left (counter-clockwise) |

## How to Call a Command
A command name is followed by **parentheses** — that is what tells Python to run it:

\`\`\`python
move_forward()
turn_right()
move_forward()
\`\`\`

Python runs each line **top to bottom, one at a time**.

## Turning Does NOT Move You
Turning changes the direction you face, but you stay in the same cell. You still need \`move_forward()\` after turning to actually move.

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
      hint: "The exit is 3 steps to your right. Call move_forward() three times.",
      grid: [[1,1,1,1],[0,0,0,0],[1,1,1,1]],
      startX:0, startY:1, startDir:1, exitX:3, exitY:1,
      starterCode: `# Move forward to reach the exit!

move_forward()
`,
    },
    {
      // ████████
      // S......E
      // ████████
      title: "Keep Going",
      hint: "Six steps forward. Add more move_forward() calls.",
      grid: [[1,1,1,1,1,1,1],[0,0,0,0,0,0,0],[1,1,1,1,1,1,1]],
      startX:0, startY:1, startDir:1, exitX:6, exitY:1,
      starterCode: `# The corridor is longer this time.

move_forward()
move_forward()
`,
    },
    {
      // █████
      // S..██
      // ███.█
      // ███.E
      title: "First Corner",
      hint: "Go forward twice, turn right, go forward twice, turn left, go forward twice.",
      grid: [
        [1,1,1,1,1],
        [0,0,0,1,1],
        [1,1,0,1,1],
        [1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:4, exitY:3,
      starterCode: `# The path turns! Use turn_right() or turn_left().

move_forward()
move_forward()
# what comes next?
`,
    },
    {
      // ████
      // ██.E
      // ██.█
      // S..█
      title: "Going North",
      hint: "Go right to the corner, turn left (to face North), go up, then turn right and step to the exit.",
      grid: [
        [1,1,0,0],
        [1,1,0,1],
        [1,1,0,1],
        [0,0,0,1],
      ],
      startX:0, startY:3, startDir:1, exitX:3, exitY:0,
      starterCode: `# This time the exit is above you.
# turn_left() from East faces you North.

`,
    },
    {
      // ███████
      // S..████
      // ██..███
      // ████..E
      title: "The S-Curve",
      hint: "The path steps down twice. Each step is: forward, turn right, forward, turn left.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,1,1,1,1],
        [1,1,0,0,1,1,1],
        [1,1,1,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# Spot the repeating pattern: forward, turn right, forward, turn left

`,
    },
    {
      // ██████
      // S....█
      // ████.█
      // E....█  (exit at left end)
      title: "U-Turn",
      hint: "Go right, turn south, go down, turn again to face west, go back the other way.",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,0,0,1],
        [1,1,1,1,0,1],
        [0,0,0,0,0,1],
      ],
      startX:0, startY:1, startDir:1, exitX:0, exitY:3,
      starterCode: `# You will need to turn right twice on this one.

`,
    },
    {
      // ████████
      // S....███
      // █████.██
      // █████..E
      title: "Stair Step",
      hint: "Two right turns and two left turns. Plan the sequence on paper first.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,1,1,1],
        [1,1,1,1,0,0,1,1],
        [1,1,1,1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:3,
      starterCode: `# Three segments connected by two right turns.
# Count the steps in each segment carefully.

`,
    },
    {
      // ███████████████
      // S.............E   (13 steps!)
      // ███████████████
      title: "The Long Hall",
      hint: "Count the open cells — that's how many move_forward() calls you need. This is going to feel repetitive…",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:14, exitY:1,
      starterCode: `# 14 cells to cross. Type them all out — for now.
# (Notice how long this code is getting!)

move_forward()
`,
    },
    {
      // Long winding path requiring ~22 commands
      title: "The Marathon",
      hint: "Six segments connected by four turns. Label each segment length before you start coding.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,0,1],
        [1,0,0,0,0,0,0,1],
        [1,0,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:5,
      starterCode: `# A long winding path.
# Trace the route first, then write the commands.

`,
    },
    {
      // Staircase — clear repeating pattern
      title: "The Gauntlet",
      hint: "Look carefully — the path repeats the SAME pattern over and over. Count how many times. There must be a better way to write this…",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [1,0,0,1,1,1,1,1],
        [1,1,0,0,1,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,1,0,0,1,1],
        [1,1,1,1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:6,
      starterCode: `# The staircase pattern repeats: forward, turn right, forward, turn left
# Write it out the long way for now — then think about Level 2!

`,
    },
  ],

  quiz: [
    {
      question: "Does it matter if you use capital letters in a command name — for example, typing Move_Forward() instead of move_forward()?",
      options: [
        "No — Python does not care about uppercase or lowercase",
        "Yes — Python is case-sensitive, so Move_Forward() will cause an error",
        "Only the first letter must be lowercase",
        "Only matters inside a loop",
      ],
      answer: 1,
      explanation: "Python is case-sensitive. move_forward() and Move_Forward() are completely different names. Only the exact lowercase spelling works.",
    },
    {
      question: "What happens if you misspell a command — for example, you type move_foward() (missing the 'r')?",
      options: [
        "Python guesses what you meant and runs it anyway",
        "The robot moves half a step",
        "You get a NameError — Python does not recognize the name and stops",
        "The line is quietly skipped",
      ],
      answer: 2,
      explanation: "Python only knows names you define exactly. A single typo like move_foward is an unknown name, so Python raises a NameError and the run stops.",
    },
    {
      question: "What if you forget the parentheses and write move_forward instead of move_forward()?",
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
      question: "What happens when you call move_forward() and there is a wall directly ahead?",
      options: [
        "The robot stops safely at the wall",
        "The robot turns around automatically",
        "You get an error and the run stops",
        "The wall is removed",
      ],
      answer: 2,
      explanation: "Moving into a wall raises an error and stops the run. You need to plan your turns before each move_forward().",
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
      question: "You need the robot to move 5 steps forward. How many times must you call move_forward()?",
      options: ["4", "5", "6", "It depends on which direction you are facing"],
      answer: 1,
      explanation: "Each call to move_forward() moves the robot exactly one cell, so 5 calls = 5 steps, regardless of direction.",
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
  ],
  introNotes: `# Level 2 — For Loops

## The Problem with Repetition
In Level 1 you probably wrote code like this:

\`\`\`python
move_forward()
move_forward()
move_forward()
move_forward()
move_forward()
move_forward()
move_forward()
move_forward()
\`\`\`

Eight identical lines. Imagine if the corridor was 100 cells long!

## The Solution: for Loops
A **for loop** tells Python to run the same block of code a set number of times:

\`\`\`python
for i in range(8):
    move_forward()
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
    move_forward()   # inside the loop — runs 3 times
    turn_right()     # also inside — runs 3 times
turn_left()          # outside the loop — runs only once
\`\`\`

Use **4 spaces** (or one Tab) to indent.

## Multiple Loops
You can have more than one loop in your program:

\`\`\`python
for i in range(5):
    move_forward()
turn_right()
for i in range(5):
    move_forward()
\`\`\`

## Look for the Pattern
Before writing a loop, ask: *"Am I doing the same thing multiple times in a row?"* If yes — use a loop.`,

  challenges: [
    {
      title: "Loop Warm-Up",
      hint: "Replace 8 repeated move_forward() calls with a for loop.",
      grid: [
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:1,
      starterCode: `# 8 steps forward — write a for loop instead of 8 calls.

for i in range(8):
    move_forward()
`,
    },
    {
      title: "Longer Corridor",
      hint: "How many steps to the exit? Put that number in range().",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:12, exitY:1,
      starterCode: `# Count the cells, then loop.

`,
    },
    {
      title: "Staircase Return",
      hint: "The staircase from Level 1! Each step is: forward, turn right, forward, turn left. Loop it.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1],
        [1,0,0,1,1,1,1,1],
        [1,1,0,0,1,1,1,1],
        [1,1,1,0,0,1,1,1],
        [1,1,1,1,0,0,1,1],
        [1,1,1,1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:6,
      starterCode: `# Same maze as Level 1 — but this time use a loop.
# Pattern: forward, right, forward, left — repeat 5 times, then forward twice.

for i in range(5):
    move_forward()
    turn_right()
    move_forward()
    turn_left()
`,
    },
    {
      title: "Longer Staircase",
      hint: "Same pattern, more steps. Just change the number in range().",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1,1,1],
        [1,0,0,1,1,1,1,1,1,1],
        [1,1,0,0,1,1,1,1,1,1],
        [1,1,1,0,0,1,1,1,1,1],
        [1,1,1,1,0,0,1,1,1,1],
        [1,1,1,1,1,0,0,1,1,1],
        [1,1,1,1,1,1,0,0,1,1],
        [1,1,1,1,1,1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:9, exitY:8,
      starterCode: `# How many steps in this staircase?
# Adjust the loop accordingly.

`,
    },
    {
      title: "Two Corridors",
      hint: "Two long straight sections connected by a turn. Use a separate loop for each section.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1,1,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:9, exitY:6,
      starterCode: `# Two loops — one for each corridor.

for i in range(8):
    move_forward()
turn_right()
`,
    },
    {
      title: "The U-Turn Returns",
      hint: "U-turn from Level 1. Use a loop for each straight section.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,0,1],
        [0,0,0,0,0,0,0,1],
      ],
      startX:0, startY:1, startDir:1, exitX:0, exitY:3,
      starterCode: `# Three sections. A loop makes each one clean.

`,
    },
    {
      title: "Square Spiral",
      hint: "Four steps right, four down, three left, two down, four right to the exit. Use a for loop for each section.",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,0,0,1],
        [1,1,1,1,0,1],
        [1,1,1,1,0,1],
        [1,1,1,1,0,1],
        [1,0,0,0,0,1],
        [1,0,1,1,1,1],
        [1,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:7,
      starterCode: `# The path winds: right, down, left, down, right.
# Use a for loop for each straight section.

for i in range(4):
    move_forward()
turn_right()
`,
    },
    {
      title: "Three Loops",
      hint: "Three long corridors separated by two turns. Use a separate for loop for each corridor.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,1,1,1,1,1],
        [1,1,1,1,1,1,0,1,1,1,1,1],
        [1,1,1,1,1,1,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:11, exitY:3,
      starterCode: `# Three corridors, two turns.
# Use a for loop for each long straight section.

`,
    },
    {
      title: "Loop Sandwich",
      hint: "A few literal commands, then a loop, then a few more literal commands.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,0,1,1,1,1,1,1,1],
        [1,1,0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,1,1,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:9, exitY:3,
      starterCode: `# Not everything needs to be in a loop.
# Some moves come before, some after.

move_forward()
move_forward()
turn_right()
`,
    },
    {
      title: "The Big One",
      hint: "Combine everything: multiple loops, multiple turns, different step counts.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,0,0,1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,0,0,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,0,0,1,1,1,1,1,1,1,1,1],
        [1,1,1,1,1,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:14, exitY:6,
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
      question: "Which line is INSIDE the loop in this code?\n\nfor i in range(3):\n    move_forward()\nturn_right()",
      options: [
        "turn_right()",
        "move_forward()",
        "for i in range(3):",
        "Both move_forward() and turn_right()",
      ],
      answer: 1,
      explanation: "Only move_forward() is indented under the for statement, so only it runs 3 times. turn_right() runs once, after the loop.",
    },
    {
      question: "What is the value of i on the very first iteration of `for i in range(10):`?",
      options: ["1", "10", "0", "It varies"],
      answer: 2,
      explanation: "range() always starts at 0 by default, so i is 0 on the first pass.",
    },
    {
      question: "How many times does move_forward() run here?\n\nfor i in range(4):\n    move_forward()\n    turn_right()",
      options: ["4", "8", "2", "1"],
      answer: 0,
      explanation: "The entire loop body (both lines) runs 4 times, so move_forward() runs 4 times.",
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
    { cmd: "for i in range(n):", desc: "Repeat the indented block n times (review from Level 2)." },
  ],
  introNotes: `# Level 3 — If Statements

## Sensing the World
So far your robot followed a fixed script — the same commands every time. But what if the maze changes? You need code that can **make decisions**.

In Level 3 you get three sensor commands and a new movement shortcut:

| Command | What it does |
|---|---|
| \`forward()\` | Move one cell forward (same as \`move_forward()\`) |
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
- \`has_path_ahead() or has_path_right()\` → True when **either** is clear`,

  challenges: [
    {
      title: "One Right Turn",
      hint: "Move forward until you can't, turn right, then keep going to the exit. Put an if statement inside a for loop!",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,0,0,1],
        [1,1,1,1,0,1],
        [1,1,1,1,0,1],
        [1,1,1,1,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:4,
      starterCode: `# Go forward along the top, turn when blocked, reach the exit.
# Try putting an if statement inside a for loop!

for i in range(7):
    if has_path_ahead():
        forward()
    else:
        turn_right()
`,
    },
    {
      title: "Check Before You Move",
      hint: "Use if has_path_ahead() to decide whether to move or turn at each step.",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,1,1,1],
        [1,1,0,0,0,1],
        [1,1,1,1,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:3,
      starterCode: `# At each corner: if path ahead, move. Otherwise turn right.

for i in range(6):
    if has_path_ahead():
        forward()
    else:
        turn_right()
`,
    },
    {
      title: "The Fork",
      hint: "Two right turns in this maze. Use if has_path_ahead() to detect each corner.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,1,1,1,1],
        [1,1,0,0,0,1,1],
        [1,1,1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# Two turns in this maze.
# Use if has_path_ahead() to detect when to turn.

for i in range(8):
    if has_path_ahead():
        forward()
    else:
        turn_right()
`,
    },
    {
      title: "Path on the Side",
      hint: "The path turns down then right. Use if/elif/else with has_path_right() to navigate.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,0,0,0,1],
        [1,0,1,1,1,0,1],
        [1,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# Hint: if has_path_right(): turn right — use elif, not a second if!

for i in range(12):
    if has_path_ahead():
        forward()
    elif has_path_right():
        turn_right()
    else:
        turn_left()
`,
    },
    {
      title: "Left Turn Ahead",
      hint: "This maze needs a LEFT turn. Use has_path_left() inside an elif to catch it.",
      grid: [
        [1,1,0,0,0],
        [1,1,1,1,0],
        [0,0,0,0,0],
      ],
      startX:0, startY:2, startDir:1, exitX:4, exitY:0,
      starterCode: `# Go east, then the path turns left (north).
# Add an elif that checks has_path_left().

for i in range(7):
    if has_path_ahead():
        forward()
    elif has_path_left():
        turn_left()
`,
    },
    {
      title: "Right or Left?",
      hint: "At different points the path turns right and then left. Use if/elif/else to handle both.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,1,0,0,1],
        [1,1,0,1,0,1,1],
        [1,1,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# The path turns right at one corner and needs a left turn later.
# Use all three branches: if / elif / else

for i in range(10):
    if has_path_ahead():
        forward()
    elif has_path_right():
        turn_right()
    else:
        turn_left()
`,
    },
    {
      title: "Three-Way Decision",
      hint: "Use if / elif / else to handle right, forward, and left cases. Find the EXACT range — too many steps and you'll overshoot the finish!",
      grid: [
        [1,1,1,1,1,1,1,1,1,1],
        [0,0,1,0,0,0,1,0,0,1],
        [1,0,1,0,1,0,1,0,1,1],
        [1,0,0,0,1,0,0,0,1,1],
        [1,1,1,0,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:5,
      starterCode: `# Each step: try right first, then ahead, then left.
# Find the EXACT range — too many steps overshoots the finish!

for i in range(19):
    if has_path_right():
        turn_right()
        forward()
    elif has_path_ahead():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Longer Decision Path",
      hint: "Same right-hand strategy, bigger maze. Adjust the range to cover all the steps.",
      grid: [
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,1,0,0,0,1,0],
        [1,1,0,1,0,1,0,1,0],
        [1,1,0,0,0,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:3,
      starterCode: `# Right-hand rule in a wider maze.

for i in range(25):
    if has_path_right():
        turn_right()
        forward()
    elif has_path_ahead():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Left-Hand Rule",
      hint: "This time try turning LEFT first instead of right. Which direction leads you through?",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,1,0,0,1],
        [1,1,0,1,0,1,1],
        [1,1,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# Try the left-hand rule: if has_path_left: turn left, elif has_path_ahead: forward, else: turn right

for i in range(12):
    if has_path_left():
        turn_left()
        forward()
    elif has_path_ahead():
        forward()
    else:
        turn_right()
`,
    },
    {
      title: "Your Decision",
      hint: "Design your own if/elif/else logic to get through. Experiment — there's more than one solution!",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,0,1,0,0],
        [1,1,1,0,1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1,0,0,0,1],
        [1,0,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:10, exitY:5,
      starterCode: `# Write your own decision logic using if, elif, and else.
# Try right-hand rule, left-hand rule, or invent something new.

for i in range(50):
    if has_path_ahead():
        forward()
    elif has_path_right():
        turn_right()
    else:
        turn_left()
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
      hint: "Use `while not at_goal():` to keep moving forward — the loop stops itself when you arrive.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:1,
      starterCode: `# Keep moving forward until you reach the goal.

while not at_goal():
    forward()
`,
    },
    {
      title: "Long Corridor",
      hint: "The same while loop works no matter how long the hallway is — you never need to count steps.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:14, exitY:1,
      starterCode: `# The goal is very far away — let the while loop handle it.

while not at_goal():
    forward()
`,
    },
    {
      title: "Walk Until Blocked",
      hint: "Move forward while the path ahead is clear, then turn right and keep going down.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,1],
        [1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,0,1],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:5,
      starterCode: `# Walk right while the path is clear, then turn and go down.

while has_path_forward():
    forward()

turn_right()

while not at_goal():
    forward()
`,
    },
    {
      title: "The S-Curve",
      hint: "Four straight sections connected by turns — use `while has_path_forward():` for each stretch.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,0,1,1,1],
        [1,1,1,0,1,1,1],
        [1,1,1,0,0,0,1],
        [1,1,1,1,1,0,1],
        [1,1,1,1,1,0,1],
        [1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:5,
      starterCode: `# Right → Down → Right → Down. A while loop handles each section.

while has_path_forward():
    forward()

turn_right()

while has_path_forward():
    forward()

turn_left()

while has_path_forward():
    forward()

turn_right()

while not at_goal():
    forward()
`,
    },
    {
      title: "Follow the Left Wall",
      hint: "If there's space on your left, turn left and move. Otherwise go forward, or turn right.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,1,0,0,0,0,1],
        [1,0,1,0,1,1,0,1],
        [1,0,1,0,1,1,0,1],
        [1,0,0,0,1,1,0,1],
        [1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:5,
      starterCode: `# Left-hand rule: always try to turn left first.

while not at_goal():
    if has_path_left():
        turn_left()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_right()
`,
    },
    {
      title: "Right-Hand Rule",
      hint: "Always try to turn right first — hug the right wall all the way to the goal.",
      grid: [
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,1,0,0,0,0,1],
        [1,1,0,1,0,1,1,0,1],
        [1,1,0,0,0,1,1,0,1],
        [1,1,1,1,1,1,1,0,0],
        [1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:4,
      starterCode: `# Right-hand rule: always try to turn right first.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "The Winding Path",
      hint: "Use while not at_goal() with if/elif/else to handle every twist and turn.",
      grid: [
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,0,1],
        [1,1,1,0,1,0,1,0,1],
        [1,1,1,0,0,0,1,0,0],
        [1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:3,
      starterCode: `# Navigate the winding path using a single while loop.

while not at_goal():
    if has_path_forward():
        forward()
    elif has_path_right():
        turn_right()
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Right Traps",
      hint: "The path goes straight — but two dead ends branch off to the right. If your code checks right before forward, the robot detours into every trap.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,0,0,0,0,0,0,0],
        [1,1,1,0,1,1,1,0,1,1,1],
        [1,1,1,0,1,1,1,1,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:10, exitY:1,
      starterCode: `# Two fake exits branch right — check forward FIRST or you'll take every wrong turn.

while not at_goal():
    if has_path_forward():
        forward()
    elif has_path_right():
        turn_right()
        forward()
    elif has_path_left():
        turn_left()
        forward()
    else:
        turn_right()
        turn_right()
`,
    },
    {
      title: "The Open Maze",
      hint: "The exit is at the top-right. Try the left-hand rule — always check left first, then forward, then right.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,0,1,0,0],
        [1,1,1,0,1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1,0,0,0,1],
        [1,0,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:10, exitY:1,
      starterCode: `# Left-hand rule — always try left first.

while not at_goal():
    if has_path_left():
        turn_left()
        forward()
    elif has_path_forward():
        forward()
    elif has_path_right():
        turn_right()
        forward()
    else:
        turn_right()
        turn_right()
`,
    },
    {
      title: "The Open Maze II",
      hint: "Same maze — but the exit is now at the bottom-right. The left-hand rule won't get you there. Try right first.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,0,1,0,0],
        [1,1,1,0,1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1,0,0,0,1],
        [1,0,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:10, exitY:5,
      starterCode: `# Right-hand rule — always try right first.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    elif has_path_left():
        turn_left()
        forward()
    else:
        turn_right()
        turn_right()
`,
    },
  ],

  quiz: [
    {
      question: "A while loop runs its body…",
      options: [
        "A fixed number of times",
        "As long as its condition is True",
        "Only once",
        "Until the program ends",
      ],
      answer: 1,
      explanation: "The while loop checks its condition before every iteration and keeps running while it remains True.",
    },
    {
      question: "What happens if a while loop's condition is never False?",
      options: [
        "The loop runs forever (infinite loop)",
        "Python raises a SyntaxError",
        "The loop skips its body",
        "Python automatically breaks after 10 iterations",
      ],
      answer: 0,
      explanation: "An infinite loop runs without stopping — always make sure your condition can eventually become False.",
    },
    {
      question: "Which code correctly moves the robot forward until it reaches the goal?",
      options: [
        "while not at_goal():\n    forward()",
        "while at_goal():\n    forward()",
        "if not at_goal():\n    forward()",
        "for at_goal() in range(10):\n    forward()",
      ],
      answer: 0,
      explanation: "`while not at_goal()` keeps looping as long as the robot has NOT reached the goal.",
    },
    {
      question: "You want to walk forward while the path ahead is clear. Which condition should you use?",
      options: [
        "while has_path_forward():",
        "while not has_path_forward():",
        "if has_path_forward():",
        "for has_path_forward() in steps:",
      ],
      answer: 0,
      explanation: "`while has_path_forward()` means 'keep going as long as the path ahead is clear'.",
    },
    {
      question: "What is the main difference between a for loop and a while loop?",
      options: [
        "A for loop repeats a known number of times; a while loop repeats until a condition changes",
        "A while loop always runs faster than a for loop",
        "A for loop can use if statements; a while loop cannot",
        "There is no difference — they are interchangeable",
      ],
      answer: 0,
      explanation: "Use for when you know how many repetitions you need; use while when you loop until something changes.",
    },
    {
      question: "In the right-hand rule algorithm, what does the robot check FIRST at each step?",
      options: [
        "if has_path_right() — is there a clear path to the right?",
        "Move forward immediately",
        "Turn left first",
        "Check if it has reached the goal",
      ],
      answer: 0,
      explanation: "The right-hand rule always checks has_path_right() first — if the path is clear to the right, turn and move that way.",
    },
  ],
};

// ─── Level 5 — elif and else ──────────────────────────────────────────────────

const L5: Level = {
  id: 5,
  title: "elif and else",
  tagline: "Prioritized logic chains for smarter maze solving",
  color: "#059669",
  newCommands: [
    { cmd: "elif condition:", desc: "Checked only if every condition above was False — adds a priority branch." },
    { cmd: "else:",           desc: "Runs only when every condition above was False — the final fallback." },
  ],
  introNotes: `# Level 5 — elif and else

## Two Ways to Make Decisions
In Level 4 you used \`while\` loops with \`if\` statements. Sometimes you wrote code like this:

\`\`\`python
if has_path_right():
    turn_right()
if has_path_forward():
    forward()
\`\`\`

This looks fine — but there is a hidden problem. If **both** paths are clear, the robot turns right **and** moves forward in the same step. Two things happen when you only wanted one. The robot's behavior becomes hard to predict.

## The if / elif / else Chain
A better structure is a single **decision chain**:

\`\`\`python
if has_path_right():
    turn_right()
elif has_path_forward():
    forward()
else:
    turn_left()
\`\`\`

Python checks top to bottom and runs **exactly one branch** — whichever condition is True first. If none are True, the \`else\` block runs as the fallback. This is called **mutually exclusive** logic.

## Only One Branch Runs
That is the key rule:

| Structure | How many branches run? |
|---|---|
| Multiple \`if\` statements | All whose conditions are True |
| \`if / elif / else\` chain | Exactly one — the first match |

## Order Is Priority
Because only the first match runs, the **order** of your conditions controls what the robot prefers:

\`\`\`python
while not at_goal():
    if has_path_right():
        turn_right()
    elif has_path_forward():
        forward()
    else:
        turn_left()
\`\`\`

This robot always prefers right. Only if the right is blocked does it go forward. Only if forward is also blocked does it turn left. This is the **right-hand rule** — written cleanly.

## Why It Matters
Structured chains produce predictable, reliable behavior. Separate \`if\` statements can cause the robot to take two actions at once, skip a step, or behave differently depending on path combinations. Use \`if/elif/else\` whenever each step should result in **one and only one** action.`,

  challenges: [
    {
      title: "One or the Other",
      hint: "Use if/elif instead of two separate ifs — only one branch should run per step.",
      grid: [
        [1,1,1,1,1,1],
        [0,0,0,0,0,1],
        [1,1,1,1,0,1],
        [1,1,1,1,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:5, exitY:3,
      starterCode: `# Use if/elif so only ONE action happens per loop step.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
`,
    },
    {
      title: "Add the Else",
      hint: "When neither right nor forward is open, you need a fallback. Add else: turn_left().",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,1,0,0,1],
        [1,1,0,1,0,1,1],
        [1,1,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# The path requires a left turn — add else: turn_left() as the fallback.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Right Before Forward",
      hint: "At some points both right and forward are open. Checking right first gives the correct path.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,1,1,1,1],
        [1,1,0,0,0,1,1],
        [1,1,1,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:3,
      starterCode: `# When both right and forward are open, the order decides which way you go.
# Right first keeps you on track.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Two Junctions",
      hint: "Two decision points in this maze. The same if/elif/else chain handles both.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,1],
        [1,1,1,0,1,0,1,1],
        [1,1,1,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:3,
      starterCode: `# The same decision chain works at every junction.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Staircase Down",
      hint: "A longer path with many right turns. Your elif/else handles every step without changes.",
      grid: [
        [1,1,1,1,1,1,1],
        [0,0,0,0,0,1,1],
        [1,1,1,1,0,0,1],
        [1,1,1,1,1,0,1],
        [1,1,1,1,1,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:6, exitY:4,
      starterCode: `# A longer path — the same chain carries you all the way through.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Three-Way Junction",
      hint: "At some points all three options are checked. The order right → forward → left is critical here.",
      grid: [
        [1,1,1,1,1,1,1,1],
        [0,0,1,0,0,0,1,0],
        [1,0,1,0,1,0,1,0],
        [1,0,0,0,1,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:7, exitY:3,
      starterCode: `# Keep the same chain — right, forward, then left as fallback.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "The Winding Path",
      hint: "A winding maze — the chain handles every twist without you counting steps.",
      grid: [
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,0,1],
        [1,1,1,0,1,0,1,0,1],
        [1,1,1,0,0,0,1,0,0],
        [1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:3,
      starterCode: `# A winding path — one clean chain navigates it all.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Dead-End Handler",
      hint: "Some paths lead nowhere. The else branch turns you around automatically.",
      grid: [
        [1,1,1,1,1,1,1,1,1],
        [0,0,0,1,0,0,0,1,0],
        [1,1,0,1,0,1,0,1,0],
        [1,1,0,0,0,1,0,0,0],
        [1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:8, exitY:3,
      starterCode: `# Dead ends are handled by the else — no special code needed.

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
`,
    },
    {
      title: "Left-Hand Priority",
      hint: "Try switching the priority: check left first, then forward, then right. Does it still reach the goal?",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,0,1,0,0,0,1,0,0],
        [1,1,1,0,1,0,1,0,1,0,1],
        [1,0,0,0,0,0,1,0,0,0,1],
        [1,0,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0],
      ],
      startX:0, startY:1, startDir:1, exitX:10, exitY:5,
      starterCode: `# Switch to left-hand priority — same structure, different order.

while not at_goal():
    if has_path_left():
        turn_left()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_right()
`,
    },
    {
      title: "Your Best Logic",
      hint: "A complex maze. Choose your priority order — right, left, or forward first. Experiment to find what works.",
      grid: [
        [1,1,1,1,1,1,1,1,1,1,1,1,1],
        [0,0,1,0,0,0,1,0,0,0,1,0,0],
        [1,0,1,0,1,0,1,0,1,0,1,0,1],
        [1,0,0,0,1,0,0,0,1,0,0,0,1],
        [1,1,1,0,1,1,1,0,1,1,1,1,1],
        [1,0,0,0,0,0,1,0,0,0,0,0,1],
        [1,0,1,1,1,0,1,0,1,1,1,0,1],
        [1,0,0,0,1,0,0,0,1,0,0,0,0],
        [1,1,1,1,1,1,1,1,1,1,1,1,1],
      ],
      startX:0, startY:1, startDir:1, exitX:12, exitY:7,
      starterCode: `# Choose your priority order and experiment.
# Right-hand rule: right → forward → left
# Left-hand rule:  left → forward → right

while not at_goal():
    if has_path_right():
        turn_right()
        forward()
    elif has_path_forward():
        forward()
    else:
        turn_left()
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
