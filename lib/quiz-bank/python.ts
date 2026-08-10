// Python (Code Lab) question bank (M0).
// Same two-source pattern as electronics.ts/block.ts: the in-lab end-of-level
// quizzes are absorbed from LEVELS at module load (positional ids
// py-u<unitIdx>-c<n> — don't reorder the quiz arrays in levels.ts), and
// bank-only questions are authored below. Python levels have 6 curriculum
// questions each, so 14 bank-only questions bring every level to 20.
// Code samples are embedded in the question text with \n, exactly like the
// in-lab quizzes — no blocksFigure here.

import { LEVELS } from '@/app/tools/code-lab/python/levels';
import { BankQuestion, CurriculumMeta } from './types';

const CURRICULUM_META: Record<number, CurriculumMeta[]> = {
  0: [
    { topic: 'Syntax & errors', difficulty: 2 },
    { topic: 'Syntax & errors', difficulty: 2 },
    { topic: 'Calling commands', difficulty: 2 },
    { topic: 'Syntax & errors', difficulty: 1 },
    { topic: 'Order of execution', difficulty: 1 },
    { topic: 'Calling commands', difficulty: 1 },
  ],
  1: [
    { topic: 'range basics', difficulty: 1 },
    { topic: 'Indentation', difficulty: 2 },
    { topic: 'range basics', difficulty: 2 },
    { topic: 'Loop counting', difficulty: 2 },
    { topic: 'range basics', difficulty: 2 },
    { topic: 'Why loops', difficulty: 1 },
  ],
  2: [
    { topic: 'If basics', difficulty: 1 },
    { topic: 'Sensors', difficulty: 1 },
    { topic: 'elif & else', difficulty: 2 },
    { topic: 'If + loops', difficulty: 2 },
    { topic: 'elif & else', difficulty: 1 },
    { topic: 'If basics', difficulty: 2 },
  ],
  3: [
    { topic: 'While basics', difficulty: 1 },
    { topic: 'Infinite loops', difficulty: 2 },
    { topic: 'Goal sensing', difficulty: 2 },
    { topic: 'While basics', difficulty: 2 },
    { topic: 'While vs for', difficulty: 2 },
    { topic: 'Right-hand rule', difficulty: 2 },
  ],
  4: [
    { topic: 'elif chains', difficulty: 3 },
    { topic: 'elif chains', difficulty: 2 },
    { topic: 'Branch order', difficulty: 2 },
    { topic: 'elif chains', difficulty: 2 },
    { topic: 'elif chains', difficulty: 3 },
    { topic: 'Branch order', difficulty: 3 },
  ],
};

const absorbed: BankQuestion[] = LEVELS.flatMap((level, unitIdx) =>
  level.quiz.map((q, n) => {
    const meta = CURRICULUM_META[unitIdx]?.[n] ?? { topic: level.title, difficulty: 2 as const };
    return {
      id: `py-u${unitIdx}-c${n}`,
      lab: 'code-lab-python' as const,
      unitIdx,
      topic: meta.topic,
      difficulty: meta.difficulty,
      question: q.question,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
    };
  })
);

// ── Level 1 (unitIdx 0) — Commands: bank-only questions ──────────────────────
const LEVEL1_BANK: BankQuestion[] = [
  {
    id: 'py-u0-b0',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Calling commands',
    difficulty: 1,
    question: 'What tells Python to actually RUN a command like forward?',
    options: [
      'The parentheses: forward()',
      'A period at the end of the line',
      'Writing the command in capital letters',
      'Pressing the spacebar twice',
    ],
    answer: 0,
    explanation:
      'The parentheses are the "go" signal. forward names the command; forward() calls it.',
  },
  {
    id: 'py-u0-b1',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Calling commands',
    difficulty: 1,
    question: 'Which of these is NOT one of the robot’s Level 1 commands?',
    options: ['fly()', 'forward()', 'turn_left()', 'turn_right()'],
    answer: 0,
    explanation:
      'The robot knows forward(), turn_left(), and turn_right(). No flying — walls have to be walked around.',
  },
  {
    id: 'py-u0-b2',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Turning vs moving',
    difficulty: 1,
    question: 'Does calling turn_right() move the robot to a new cell?',
    options: [
      'No — it only changes the direction the robot faces',
      'Yes — it moves one cell to the right',
      'Yes — it moves diagonally',
      'Only if there is no wall',
    ],
    answer: 0,
    explanation:
      'Turning changes the facing, not the position. You still need forward() after the turn to actually move.',
  },
  {
    id: 'py-u0-b3',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Order of execution',
    difficulty: 2,
    question: 'What does the robot do SECOND?\n\nforward()\nturn_right()\nforward()',
    options: ['turn_right()', 'forward()', 'Nothing — it runs all three at once', 'It depends on the maze'],
    answer: 0,
    explanation:
      'Python runs lines top to bottom, one at a time: first forward(), second turn_right(), third forward().',
  },
  {
    id: 'py-u0-b4',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Calling commands',
    difficulty: 1,
    question: 'How far does ONE call to forward() move the robot?',
    options: ['Exactly one cell', 'As far as it can go', 'Two cells', 'Half a cell'],
    answer: 0,
    explanation:
      'forward() always moves exactly one cell in the direction the robot is facing. Five cells means five calls — or, soon, a loop.',
  },
  {
    id: 'py-u0-b5',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Syntax & errors',
    difficulty: 2,
    question: 'Your run stops with an error message. What is the smartest first move?',
    options: [
      'Read the message — it tells you exactly what went wrong',
      'Delete all your code and start over',
      'Run the same code again without changes',
      'Add more forward() calls',
    ],
    answer: 0,
    explanation:
      'Error messages are information, not punishment. They name the problem and the line — read them and fix that spot.',
  },
  {
    id: 'py-u0-b6',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Syntax & errors',
    difficulty: 2,
    question: 'Your friend types Turn_Right() and gets an error. Why?',
    options: [
      'Python is case-sensitive — the command is turn_right(), all lowercase',
      'Underscores are not allowed in Python',
      'The command needs a number inside the parentheses',
      'Turning is not allowed on this maze',
    ],
    answer: 0,
    explanation:
      'Turn_Right and turn_right are different names to Python. Only the exact lowercase spelling matches the real command.',
  },
  {
    id: 'py-u0-b7',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Order of execution',
    difficulty: 3,
    question: 'Two programs use the SAME commands but in a different order. Will the robot end up in the same place?',
    options: [
      'Not usually — order changes the path the robot takes',
      'Always — same commands, same ending',
      'Only in straight corridors',
      'Only if there are fewer than 5 commands',
    ],
    answer: 0,
    explanation:
      'forward() then turn_right() puts the robot somewhere different than turn_right() then forward(). A program is its commands AND their order.',
  },
  {
    id: 'py-u0-b8',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Calling commands',
    difficulty: 1,
    question: 'What is a command?',
    options: [
      'An instruction Python executes immediately, then moves to the next line',
      'A comment that explains your code',
      'A kind of error message',
      'A picture of the maze',
    ],
    answer: 0,
    explanation:
      'A command is an instruction. Python runs it right away, then moves down to the next line of your program.',
  },
  {
    id: 'py-u0-b9',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Turning vs moving',
    difficulty: 2,
    question: 'The robot needs to step into the cell on its RIGHT. Which code does it?',
    options: [
      'turn_right()\nforward()',
      'forward()\nturn_right()',
      'turn_right() by itself',
      'forward() by itself',
    ],
    answer: 0,
    explanation:
      'Face the cell first, then step: turn_right() rotates the robot, forward() moves it into that cell. The other order steps ahead first, then turns too late.',
  },
  {
    id: 'py-u0-b10',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Syntax & errors',
    difficulty: 2,
    question: 'Python stops your run with a NameError. What does that mean?',
    options: [
      'Python does not recognize a name you typed — check your spelling',
      'Your program is too long',
      'The robot hit a wall',
      'You used too many parentheses',
    ],
    answer: 0,
    explanation:
      'A NameError means Python met a name it does not know — usually a typo like forwad(). Fix the spelling and run again.',
  },
  {
    id: 'py-u0-b11',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Turning vs moving',
    difficulty: 3,
    question: 'The robot calls turn_left() twice in a row. What is true afterward?',
    options: [
      'It faces the opposite direction and has not moved',
      'It has moved two cells to the left',
      'It faces the same direction as before',
      'It has moved one cell backward',
    ],
    answer: 0,
    explanation:
      'Each turn_left() is 90°, so two make a half-spin — the robot faces backward but is still standing in the same cell.',
  },
  {
    id: 'py-u0-b12',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Order of execution',
    difficulty: 1,
    question: 'When does Python run a command in your program?',
    options: [
      'The moment it reaches that line, before moving to the next line',
      'After reading the whole program first',
      'All commands run at the same time',
      'Only when you click on the line',
    ],
    answer: 0,
    explanation:
      'Python executes each line immediately as it reaches it, top to bottom — one command finishes before the next begins.',
  },
  {
    id: 'py-u0-b13',
    lab: 'code-lab-python',
    unitIdx: 0,
    topic: 'Calling commands',
    difficulty: 3,
    question: 'The Gauntlet maze took about 20 lines, and many were identical forward() calls. What is that a clue about?',
    options: [
      'Repeating the same line many times is a job for a loop',
      'The maze is broken',
      'You should write even more lines next time',
      'The robot is too slow',
    ],
    answer: 0,
    explanation:
      'When you catch yourself copying the same line over and over, a loop can do the repeating for you — that is exactly what Level 2 teaches.',
  },
];

// ── Level 2 (unitIdx 1) — For Loops: bank-only questions ─────────────────────
const LEVEL2_BANK: BankQuestion[] = [
  {
    id: 'py-u1-b0',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'range basics',
    difficulty: 1,
    question: 'What numbers does range(8) produce?',
    options: ['0 through 7 — eight values', '1 through 8', '0 through 8 — nine values', 'Just the number 8'],
    answer: 0,
    explanation: 'range(8) makes 0, 1, 2, 3, 4, 5, 6, 7. It starts at 0 and stops BEFORE 8 — eight values in all.',
  },
  {
    id: 'py-u1-b1',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Indentation',
    difficulty: 1,
    question: 'How does Python know which lines are INSIDE a for loop?',
    options: [
      'They are indented (4 spaces) under the for line',
      'They are written in capital letters',
      'They end with an exclamation mark',
      'They come before the for line',
    ],
    answer: 0,
    explanation:
      'Indentation is Python’s grouping rule: everything indented under the for line is the loop body and runs on every pass.',
  },
  {
    id: 'py-u1-b2',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Loop counting',
    difficulty: 2,
    question: 'How many times does turn_right() run?\n\nfor i in range(3):\n    forward()\n    turn_right()',
    options: ['3', '1', '6', '0'],
    answer: 0,
    explanation:
      'turn_right() is indented — inside the body — so it runs once per pass. Three passes, three turns.',
  },
  {
    id: 'py-u1-b3',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Indentation',
    difficulty: 2,
    question: 'How many times does turn_right() run?\n\nfor i in range(3):\n    forward()\nturn_right()',
    options: ['1', '3', '4', '0'],
    answer: 0,
    explanation:
      'turn_right() is NOT indented, so it sits outside the loop. The loop takes 3 steps, then the turn happens once. Indentation decides everything.',
  },
  {
    id: 'py-u1-b4',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Why loops',
    difficulty: 1,
    question: 'A corridor is 100 cells long. What is the best way to cross it?',
    options: [
      'for i in range(100):\n    forward()',
      'Write forward() one hundred times',
      'forward(100)',
      'You cannot cross a corridor that long',
    ],
    answer: 0,
    explanation:
      'Two lines instead of one hundred. And if the corridor changes length, you change one number.',
  },
  {
    id: 'py-u1-b5',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'range basics',
    difficulty: 2,
    question: 'In `for i in range(6):`, what is the LAST value i holds?',
    options: ['5', '6', '0', '7'],
    answer: 0,
    explanation:
      'range(6) produces 0, 1, 2, 3, 4, 5 — it always stops one before the number you give it. Six values, last one 5.',
  },
  {
    id: 'py-u1-b6',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Indentation',
    difficulty: 2,
    question: 'You want turn_left() to run only ONCE, after the loop finishes all its passes. Where does it go?',
    options: [
      'Below the loop, NOT indented',
      'Inside the loop, indented',
      'Above the for line',
      'Anywhere — placement does not matter',
    ],
    answer: 0,
    explanation:
      'Unindented lines after the loop run once, after every pass is done. Indent it and it would run on every single pass instead.',
  },
  {
    id: 'py-u1-b7',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Aliens & fire()',
    difficulty: 1,
    question: 'What does fire() do?',
    options: [
      'Shoots plasma forward — it destroys the first alien it hits',
      'Makes the robot run faster',
      'Burns down the nearest wall',
      'Restarts the maze',
    ],
    answer: 0,
    explanation:
      'The plasma shot travels along the corridor ahead until it hits an alien (destroyed!) or a wall.',
  },
  {
    id: 'py-u1-b8',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Aliens & fire()',
    difficulty: 2,
    question: 'You call fire() but there is no alien ahead. What happens?',
    options: [
      'The shot sails out harmlessly — but it still counts as one move',
      'The run ends with an error',
      'The shot bounces back at the robot',
      'A wall is destroyed',
    ],
    answer: 0,
    explanation:
      'A missed shot does no harm — it just flies to the wall. It does still count as a move, so don’t fire for fun.',
  },
  {
    id: 'py-u1-b9',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Loop counting',
    difficulty: 2,
    question: 'How many cells does the robot move in total?\n\nfor i in range(2):\n    forward()\n    forward()',
    options: ['4', '2', '6', '8'],
    answer: 0,
    explanation: 'The body takes 2 steps and runs 2 times: 2 × 2 = 4 cells.',
  },
  {
    id: 'py-u1-b10',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Why loops',
    difficulty: 2,
    question: 'What question tells you a for loop is the right tool?',
    options: [
      '"Am I doing the same thing multiple times in a row?"',
      '"Is the maze bigger than 10 cells?"',
      '"Does my code have any turns in it?"',
      '"Is there an alien in the maze?"',
    ],
    answer: 0,
    explanation:
      'Repetition is the cue. If the same command (or group of commands) repeats back-to-back, a loop can do the repeating.',
  },
  {
    id: 'py-u1-b11',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'range basics',
    difficulty: 1,
    question: 'Which two-line program does the same job as eight forward() lines?',
    options: [
      'for i in range(8):\n    forward()',
      'for i in range(7):\n    forward()',
      'forward(8)',
      'repeat 8: forward()',
    ],
    answer: 0,
    explanation:
      'range(8) runs the body eight times — exactly the same walk, in two lines instead of eight.',
  },
  {
    id: 'py-u1-b12',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Loop counting',
    difficulty: 3,
    question: 'How many times does forward() run in total?\n\nfor i in range(2):\n    forward()\n    turn_right()\nforward()',
    options: ['3', '2', '4', '5'],
    answer: 0,
    explanation:
      'The indented forward() runs twice (once per pass). The unindented forward() at the bottom runs once, after the loop. 2 + 1 = 3.',
  },
  {
    id: 'py-u1-b13',
    lab: 'code-lab-python',
    unitIdx: 1,
    topic: 'Aliens & fire()',
    difficulty: 3,
    question: 'An alien is blocking the corridor ahead. Which order of commands gets past it safely?',
    options: [
      'fire() first, then forward() onto the cleared cell',
      'forward() first, then fire()',
      'turn_left() twice, then forward()',
      'Just forward() — aliens move aside',
    ],
    answer: 0,
    explanation:
      'Walking into an alien ends the run! Clear it with fire() first, then walk forward onto the now-safe cell.',
  },
];

// ── Level 3 (unitIdx 2) — If Statements: bank-only questions ─────────────────
const LEVEL3_BANK: BankQuestion[] = [
  {
    id: 'py-u2-b0',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'Sensors',
    difficulty: 1,
    question: 'What kind of value does has_path_left() give back?',
    options: ['True or False', 'A number of cells', 'A direction word like "left"', 'A picture of the maze'],
    answer: 0,
    explanation:
      'Sensor commands return True or False — exactly what an if statement needs as its condition.',
  },
  {
    id: 'py-u2-b1',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'Sensors',
    difficulty: 1,
    question: 'Which sensor checks whether the path to the RIGHT is clear?',
    options: ['has_path_right()', 'has_path_ahead()', 'turn_right()', 'alien_in_sight()'],
    answer: 0,
    explanation:
      'has_path_right() returns True when the cell to the right is open. turn_right() is an action, not a sensor.',
  },
  {
    id: 'py-u2-b2',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'If basics',
    difficulty: 2,
    question: 'An if statement’s condition is False. What happens to the indented block under it?',
    options: [
      'It is skipped completely',
      'It runs anyway',
      'It runs twice next time',
      'Python raises an error',
    ],
    answer: 0,
    explanation:
      'False condition, skipped block. The program simply continues below the if statement.',
  },
  {
    id: 'py-u2-b3',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'elif & else',
    difficulty: 2,
    question: 'What does elif mean?',
    options: [
      '"Else if" — check this condition only when the ones above were False',
      '"End loop if" — stops the loop',
      '"Else always" — runs no matter what',
      'It is a misspelling of else',
    ],
    answer: 0,
    explanation:
      'elif chains another condition onto an if. Python only checks it when everything above it came up False.',
  },
  {
    id: 'py-u2-b4',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'If + loops',
    difficulty: 2,
    question: 'Why put an if statement INSIDE a for loop?',
    options: [
      'So the robot makes a fresh decision on every pass of the loop',
      'To make the loop run faster',
      'Because if statements only work inside loops',
      'To stop the loop early',
    ],
    answer: 0,
    explanation:
      'The loop repeats, and the if decides each time: move or turn? That combination is smarter than any fixed script.',
  },
  {
    id: 'py-u2-b5',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'Sensors',
    difficulty: 2,
    question: 'How far can alien_in_sight() see?',
    options: [
      'Only the ONE cell directly in front of the robot',
      'The whole corridor ahead',
      'The entire maze',
      'Three cells in every direction',
    ],
    answer: 0,
    explanation:
      'The sensor is short-range: an alien two cells away returns False until you walk closer. (fire()’s plasma travels farther than the sensor sees!)',
  },
  {
    id: 'py-u2-b6',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'not / and / or',
    difficulty: 2,
    question: 'When is `not has_path_ahead()` True?',
    options: [
      'When the path ahead is BLOCKED',
      'When the path ahead is clear',
      'Never — not is not allowed on sensors',
      'Only inside a while loop',
    ],
    answer: 0,
    explanation:
      'not flips the value: path clear → sensor True → not makes it False. Path blocked → sensor False → not makes it True.',
  },
  {
    id: 'py-u2-b7',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'not / and / or',
    difficulty: 2,
    question: 'When is `has_path_ahead() and has_path_right()` True?',
    options: [
      'Only when BOTH paths are clear',
      'When either path is clear',
      'When both paths are blocked',
      'Always',
    ],
    answer: 0,
    explanation: '`and` needs both sides True. One blocked path makes the whole condition False.',
  },
  {
    id: 'py-u2-b8',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'not / and / or',
    difficulty: 2,
    question: 'When is `has_path_ahead() or has_path_right()` True?',
    options: [
      'When EITHER path is clear (or both)',
      'Only when both paths are clear',
      'Only when both paths are blocked',
      'Never',
    ],
    answer: 0,
    explanation: '`or` is satisfied by either side. It is only False when both paths are blocked.',
  },
  {
    id: 'py-u2-b9',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'If basics',
    difficulty: 2,
    question: 'No alien is in sight. What does the robot do?\n\nif alien_in_sight():\n    fire()\nelse:\n    forward()',
    options: ['Moves forward one cell', 'Fires anyway', 'Does nothing', 'Turns right'],
    answer: 0,
    explanation:
      'The if condition is False, so the else branch runs: forward(). Exactly one of the two branches always runs.',
  },
  {
    id: 'py-u2-b10',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'elif & else',
    difficulty: 1,
    question: 'In an if / else statement, can BOTH blocks run on the same check?',
    options: [
      'Never — exactly one of the two runs',
      'Yes, when the condition is True',
      'Yes, they always both run',
      'Only inside a loop',
    ],
    answer: 0,
    explanation:
      'if/else is a fork in the road: condition True → if block; condition False → else block. One or the other, never both.',
  },
  {
    id: 'py-u2-b11',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'If + loops',
    difficulty: 3,
    question: 'How many DECISIONS does the robot make?\n\nfor i in range(8):\n    if has_path_ahead():\n        forward()\n    else:\n        turn_right()',
    options: [
      '8 — one fresh check on every pass of the loop',
      '1 — the if is only checked once',
      '0 — loops cannot contain ifs',
      '16 — two per pass',
    ],
    answer: 0,
    explanation:
      'Every pass re-asks the question: path ahead? The robot decides 8 times — that is what makes sensor code adapt to the maze.',
  },
  {
    id: 'py-u2-b12',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'If basics',
    difficulty: 1,
    question: 'What character must end the line `if has_path_right()`?',
    options: ['A colon :', 'A period .', 'A semicolon ;', 'Nothing — it is fine as is'],
    answer: 0,
    explanation:
      'if, elif, else, for, and while lines all end with a colon — it announces the indented block that follows.',
  },
  {
    id: 'py-u2-b13',
    lab: 'code-lab-python',
    unitIdx: 2,
    topic: 'elif & else',
    difficulty: 3,
    question: 'BOTH the path ahead and the path right are clear. What runs?\n\nif has_path_ahead():\n    forward()\nelif has_path_right():\n    turn_right()',
    options: [
      'Only forward() — the first True branch wins and the elif is skipped',
      'Only turn_right()',
      'Both forward() and turn_right()',
      'Neither — Python cannot decide',
    ],
    answer: 0,
    explanation:
      'Python checks top to bottom and stops at the first True condition. The elif never even gets looked at. Order sets priority!',
  },
];

// ── Level 4 (unitIdx 3) — While Loops: bank-only questions ───────────────────
const LEVEL4_BANK: BankQuestion[] = [
  {
    id: 'py-u3-b0',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While basics',
    difficulty: 1,
    question: 'WHEN does a while loop check its condition?',
    options: [
      'Before every iteration',
      'Only once, at the very start',
      'After the loop has finished',
      'Whenever the robot hits a wall',
    ],
    answer: 0,
    explanation:
      'Every lap begins with the check. The moment the condition comes up False, the loop ends — even mid-maze.',
  },
  {
    id: 'py-u3-b1',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'Goal sensing',
    difficulty: 1,
    question: 'When does at_goal() return True?',
    options: [
      'When the robot is standing on the goal tile',
      'When the goal is visible ahead',
      'When the maze is finished loading',
      'After 10 moves',
    ],
    answer: 0,
    explanation:
      'at_goal() checks the robot’s own square. Standing on the goal → True; anywhere else → False.',
  },
  {
    id: 'py-u3-b2',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While basics',
    difficulty: 2,
    question: 'What does `not` do to a True or False value?',
    options: [
      'Flips it: True becomes False, False becomes True',
      'Makes it always True',
      'Makes it always False',
      'Deletes the value',
    ],
    answer: 0,
    explanation:
      'not is the flipper. That is why `while not at_goal()` means "keep going while we have NOT arrived."',
  },
  {
    id: 'py-u3-b3',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While vs for',
    difficulty: 2,
    question: 'You know the robot needs EXACTLY 5 steps. Which loop fits best?',
    options: [
      'A for loop — the count is known',
      'A while loop — counts are never allowed',
      'Neither — write 5 lines',
      'Both loops are wrong here',
    ],
    answer: 0,
    explanation:
      'Known count → for. Unknown distance → while. Matching the loop to the situation is the whole lesson.',
  },
  {
    id: 'py-u3-b4',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'Infinite loops',
    difficulty: 3,
    question: 'What is wrong with this code?\n\nwhile True:\n    forward()',
    options: [
      'The condition can never become False — an infinite loop',
      'while cannot use the word True',
      'forward() is spelled wrong',
      'Nothing — this is the best way to walk',
    ],
    answer: 0,
    explanation:
      'True is always True, so the loop never ends on its own (the maze runner cuts it off at 2000 steps to protect you). Something in the loop must be able to end the condition.',
  },
  {
    id: 'py-u3-b5',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While basics',
    difficulty: 2,
    question: 'When does this loop stop?\n\nwhile has_path_forward():\n    forward()',
    options: [
      'The moment a wall blocks the path ahead',
      'After exactly 10 steps',
      'When the robot reaches the goal',
      'It never stops',
    ],
    answer: 0,
    explanation:
      'Each lap re-checks the path. Clear → step. Wall → condition False → loop over. Walk-until-blocked, no counting.',
  },
  {
    id: 'py-u3-b6',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'Aliens & plasma',
    difficulty: 3,
    question: 'How do alien_in_sight() and fire() differ in RANGE?',
    options: [
      'The sensor sees only one cell ahead; the plasma travels the whole corridor',
      'They both reach exactly one cell',
      'The sensor sees the whole maze; the plasma reaches one cell',
      'Neither has any range limit',
    ],
    answer: 0,
    explanation:
      'alien_in_sight() is short-range — one cell. fire() is long-range — the shot flies until it hits an alien or a wall. You can shoot what you cannot yet see.',
  },
  {
    id: 'py-u3-b7',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While + if',
    difficulty: 2,
    question: 'Why put if statements INSIDE a while loop?',
    options: [
      'So the robot makes decisions on every step until the goal',
      'To make the while loop count faster',
      'Because ifs do not work outside loops',
      'To use up extra lines',
    ],
    answer: 0,
    explanation:
      'The while keeps the robot going; the ifs decide each step: fire? move? turn? That combo is a complete auto-pilot.',
  },
  {
    id: 'py-u3-b8',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While + if',
    difficulty: 3,
    question: 'A wall is ahead and NO alien is in sight. Which branch runs?\n\nwhile not at_goal():\n    if alien_in_sight():\n        fire()\n    elif has_path_forward():\n        forward()\n    else:\n        turn_right()',
    options: [
      'turn_right() — both other conditions are False',
      'fire() — firing is always first',
      'forward() — the robot pushes through',
      'None — the loop ends',
    ],
    answer: 0,
    explanation:
      'No alien → skip fire. Wall ahead → has_path_forward() False → skip forward. The else catches it: turn_right(). The chain always has an answer.',
  },
  {
    id: 'py-u3-b9',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While vs for',
    difficulty: 2,
    question: 'Your while-loop program solved a corridor. The next maze has a corridor TWICE as long. What must you change?',
    options: [
      'Nothing — the same loop runs until the condition changes',
      'Double every number in the code',
      'Add a second while loop',
      'Switch to twenty forward() lines',
    ],
    answer: 0,
    explanation:
      'That is the magic of while: it adapts. The loop simply runs more laps on a longer corridor — same code, any length.',
  },
  {
    id: 'py-u3-b10',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'Infinite loops',
    difficulty: 3,
    question: 'This loop never reaches the goal. Why?\n\nwhile not at_goal():\n    turn_right()',
    options: [
      'The robot only spins in place — nothing in the body moves it toward the goal',
      'not cannot be used with at_goal()',
      'turn_right() is not allowed in while loops',
      'The goal moves away each lap',
    ],
    answer: 0,
    explanation:
      'The condition stays True forever because the body never makes progress. An infinite loop is not always `while True` — any loop that cannot change its condition is stuck.',
  },
  {
    id: 'py-u3-b11',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'Goal sensing',
    difficulty: 1,
    question: 'Which loop walks the robot forward UNTIL it reaches the goal?',
    options: [
      'while not at_goal():\n    forward()',
      'while at_goal():\n    forward()',
      'for i in range(at_goal()):\n    forward()',
      'if not at_goal():\n    forward()',
    ],
    answer: 0,
    explanation:
      '"While we have NOT arrived, keep stepping." The moment at_goal() turns True, `not at_goal()` is False and the loop ends.',
  },
  {
    id: 'py-u3-b12',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'Aliens & plasma',
    difficulty: 3,
    question: 'An alien sits 4 cells down the corridor — too far for alien_in_sight() to see. Can you still destroy it?',
    options: [
      'Yes — fire() is long range; the plasma flies down the corridor and hits it',
      'No — you can only destroy what the sensor sees',
      'No — aliens that far away are invincible',
      'Yes, but only by walking into it',
    ],
    answer: 0,
    explanation:
      'The plasma travels until it hits an alien or a wall. If you have planned the layout, you can clear the path before walking it.',
  },
  {
    id: 'py-u3-b13',
    lab: 'code-lab-python',
    unitIdx: 3,
    topic: 'While basics',
    difficulty: 1,
    question: 'The instant a while loop’s condition becomes False, what happens?',
    options: [
      'The loop stops and the program continues below it',
      'The loop runs one final lap',
      'Python raises an error',
      'The robot walks back to the start',
    ],
    answer: 0,
    explanation:
      'No drama: the check fails, the loop is done, and Python moves on to the next line after the loop.',
  },
];

// ── Level 5 (unitIdx 4) — Strategy & Plasma: bank-only questions ─────────────
const LEVEL5_BANK: BankQuestion[] = [
  {
    id: 'py-u4-b0',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'and / or',
    difficulty: 2,
    question: 'When is `has_path_right() and has_path_left()` True?',
    options: [
      'Only when BOTH sides are clear',
      'When either side is clear',
      'When both sides are blocked',
      'It is never True',
    ],
    answer: 0,
    explanation:
      '`and` demands both. It is the clean way to say "right AND left both open" without nesting one if inside another.',
  },
  {
    id: 'py-u4-b1',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'and / or',
    difficulty: 2,
    question: 'When is `alien_in_sight() or not has_path_forward()` True?',
    options: [
      'When there is an alien ahead OR the path is blocked (or both)',
      'Only when both things are true at once',
      'Only when the path is clear',
      'Never',
    ],
    answer: 0,
    explanation:
      '`or` fires on either condition. Both of these situations mean "do NOT just walk forward" — so they share one branch.',
  },
  {
    id: 'py-u4-b2',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'and / or',
    difficulty: 3,
    question: 'Why is `if X and Y:` usually better than nesting `if X:` with `if Y:` inside it?',
    options: [
      'The flat version stays in the elif/else chain, so every branch keeps its fallback',
      'Nested ifs are against Python’s rules',
      'and makes the robot move faster',
      'It is not better — they always behave identically',
    ],
    answer: 0,
    explanation:
      'A nested inner if has no else path back to the chain — when it fails, nothing runs. The flat `and` keeps the whole decision inside one chain where elif/else can catch every case.',
  },
  {
    id: 'py-u4-b3',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Plasma & hazards',
    difficulty: 1,
    question: 'How much plasma does each fire() call use?',
    options: [
      'One — whether it hits or misses',
      'One, but only if it hits an alien',
      'None — plasma is unlimited',
      'All of it',
    ],
    answer: 0,
    explanation:
      'Every shot costs 1 plasma, hit or miss. On a limited supply, wasted shots can strand you.',
  },
  {
    id: 'py-u4-b4',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Plasma & hazards',
    difficulty: 2,
    question: 'Your plasma count is 0 and you call fire(). What happens?',
    options: [
      'The call fizzles silently — no shot leaves the robot',
      'Python raises an error and stops',
      'The robot borrows plasma from the next level',
      'The shot works one last time',
    ],
    answer: 0,
    explanation:
      'Empty means empty: fire() does nothing. If an alien still blocks your path, walking into it ends the run.',
  },
  {
    id: 'py-u4-b5',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Plasma & hazards',
    difficulty: 3,
    question:
      'You have 2 plasma. The short path has 4 aliens; the longer path has 1 alien. What should you do?',
    options: [
      'Take the longer path — count aliens against your supply BEFORE writing code',
      'Take the short path and fire faster',
      'Fire all your plasma immediately',
      'Wait for the aliens to leave',
    ],
    answer: 0,
    explanation:
      'Route choice is the real puzzle: 4 aliens need 4 plasma you do not have. The winding path with 1 alien fits your supply.',
  },
  {
    id: 'py-u4-b6',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Plasma & hazards',
    difficulty: 2,
    question: 'How are black holes different from aliens?',
    options: [
      'Black holes do not block movement — the robot walks right in if your code sends it there',
      'Black holes can be destroyed with fire()',
      'Black holes move around the maze',
      'They are the same thing with different pictures',
    ],
    answer: 0,
    explanation:
      'There is no wall and no sensor to save you — the only defense is reading the maze and planning turns that avoid every dark cell.',
  },
  {
    id: 'py-u4-b7',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Plasma & hazards',
    difficulty: 2,
    question: 'What does a glowing blue plasma pickup do?',
    options: [
      'Walking onto it adds 1 plasma to your supply — one time only',
      'It teleports the robot to the goal',
      'It destroys all aliens in the maze',
      'It refills plasma every time you pass it',
    ],
    answer: 0,
    explanation:
      'Pickups are one-time: step on it, ⚡ +1, gone. Use them when the maze has more aliens than starting plasma.',
  },
  {
    id: 'py-u4-b8',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Branch order',
    difficulty: 3,
    question: 'Why must `alien_in_sight()` be checked BEFORE `has_path_forward()` in your chain?',
    options: [
      'The path reads as open right up until the robot collides with the alien — so forward-first walks into it',
      'Sensors must always be alphabetical',
      'fire() only works in the first branch',
      'It does not matter which comes first',
    ],
    answer: 0,
    explanation:
      'An alien does not read as a wall. If forward wins the race, the robot strolls into the alien and the run ends. Order = intent.',
  },
  {
    id: 'py-u4-b9',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Choosing tools',
    difficulty: 2,
    question:
      'You must clear exactly 3 aliens in a row, then walk an unknown distance to the goal. Which combination fits?',
    options: [
      'A for loop for the 3 aliens, then a while loop to the goal',
      'One giant for loop for everything',
      'Two while loops, no matter what',
      'No loops — write every line out',
    ],
    answer: 0,
    explanation:
      'Known count → for. Unknown distance → while. Real solutions mix tools — match each one to its moment.',
  },
  {
    id: 'py-u4-b10',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Nested loops',
    difficulty: 3,
    question: 'In a nested loop, what does the OUTER loop do?',
    options: [
      'Repeats the whole pattern — the inner loop runs completely on each outer pass',
      'Runs once after the inner loop finishes',
      'Counts backwards',
      'Only handles turning',
    ],
    answer: 0,
    explanation:
      'Read it inside-out: the inner loop is one chunk of the pattern; the outer loop stamps that whole chunk again and again.',
  },
  {
    id: 'py-u4-b11',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Nested loops',
    difficulty: 3,
    question: 'How many times does forward() run?\n\nfor segment in range(2):\n    for i in range(3):\n        forward()\n    turn_right()',
    options: ['6', '5', '3', '2'],
    answer: 0,
    explanation:
      'Inner loop: 3 forwards per segment. Outer loop: 2 segments. 2 × 3 = 6 forwards (and 2 turns — the turn sits outside the inner loop).',
  },
  {
    id: 'py-u4-b12',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Choosing tools',
    difficulty: 2,
    question: 'Is there always ONE right structure for a Level 5 maze?',
    options: [
      'No — real solutions mix commands, for, while, and if; match the tool to the situation',
      'Yes — always use a single while loop',
      'Yes — always use nested for loops',
      'No structure works; Level 5 is unsolvable',
    ],
    answer: 0,
    explanation:
      'There is almost never just one right answer. Position with commands, clear counted aliens with for, auto-pilot with while — combine freely.',
  },
  {
    id: 'py-u4-b13',
    lab: 'code-lab-python',
    unitIdx: 4,
    topic: 'Choosing tools',
    difficulty: 1,
    question: 'Level 5 asks you to combine tools from every earlier level. Which list is right?',
    options: [
      'Commands, for loops, if/elif/else, while loops, and fire()',
      'Only forward() and turn_right()',
      'Only while loops',
      'Nothing from earlier levels is used',
    ],
    answer: 0,
    explanation:
      'Level 1 commands, Level 2 for loops, Level 3 decisions, Level 4 while loops, plus plasma strategy — the capstone uses it all.',
  },
];

export const PYTHON_BANK: BankQuestion[] = [
  ...absorbed,
  ...LEVEL1_BANK,
  ...LEVEL2_BANK,
  ...LEVEL3_BANK,
  ...LEVEL4_BANK,
  ...LEVEL5_BANK,
];
