export interface BlockChallenge {
  title:        string;
  hint:         string;
  spriteStart:  { x: number; y: number };
  collectibles: { x: number; y: number }[];
  walls:        { x: number; y: number }[];
}

export interface QuizQuestion {
  question:    string;
  options:     [string, string, string, string];
  answer:      0 | 1 | 2 | 3;
  explanation: string;
}

export interface BlockModule {
  id:          number;
  title:       string;
  tagline:     string;
  color:       string;
  introNotes:  string;
  newBlockIds: string[];
  challenges:  BlockChallenge[];
  quiz:        QuizQuestion[];
}

export const MODULES: BlockModule[] = [
  {
    id: 1,
    title: "Events & Movement",
    tagline: "Drive the rover, collect rock samples",
    color: "#2563eb",
    introNotes: `Module 1 — Events & Movement

You're in mission control for a Mars rover! Your job is to program the rover to drive across the surface and collect rock samples. 🪨

YOUR SCRIPT
Every script starts with the "when 🏁 clicked" block — it's already in your script and can't be removed. When you press Run ▶, the rover executes your script one block at a time.

THE STAGE
The stage is a 10×10 grid of terrain. The top-left corner is (0, 0).
  • X increases going RIGHT (east)
  • Y increases going UP (north)
  So (9, 9) is the top-right corner and (9, 0) is the bottom-right corner.

BOULDERS
Some terrain cells contain boulders 🪨 the rover cannot drive through. You'll need to plan a route around them — or use the teleport block to jump over them entirely!

NEW BLOCKS
🔵  move right [steps] — drive east that many cells
🔵  move left [steps]  — drive west
🔵  move up [steps]    — drive north (Y decreases)
🔵  move down [steps]  — drive south (Y increases)
🔵  go to x: [x] y: [y] — teleport directly to any position (bypasses boulders!)

HOW TO CODE
1. Click a block on the left to add it to your script
2. Click the number inside a block to change it
3. Click Run ▶ to watch the rover move
4. Collect all the rock samples ⚡ to complete the challenge`,
    newBlockIds: [
      "when_flag_clicked",
      "move_right",
      "move_left",
      "move_up",
      "move_down",
      "go_to_xy",
    ],

    // All coordinates use math convention: (0,0) = bottom-left, Y increases upward.
    challenges: [
      // ── C0: Single sample, drive east ──────────────────────────────────────
      {
        title: "First Contact",
        hint: "Drive east to collect the rock sample. How many cells away is it?",
        spriteStart:  { x: 0, y: 4 },
        collectibles: [{ x: 4, y: 4 }],
        walls: [],
      },
      // ── C1: Two samples in the same row ────────────────────────────────────
      {
        title: "Twin Signals",
        hint: "Both samples are in the same row. One 'move right' block can collect them both as you pass through!",
        spriteStart:  { x: 0, y: 4 },
        collectibles: [{ x: 3, y: 4 }, { x: 7, y: 4 }],
        walls: [],
      },
      // ── C2: Single sample, drive north ─────────────────────────────────────
      {
        title: "Northern Outpost",
        hint: "The sample is above you. Moving up increases Y — how many steps do you need to reach it?",
        spriteStart:  { x: 5, y: 0 },
        collectibles: [{ x: 5, y: 6 }],
        walls: [],
      },
      // ── C3: Two samples, two directions ────────────────────────────────────
      {
        title: "East Then Up",
        hint: "You'll need two blocks — one to drive east, one to drive north.",
        spriteStart:  { x: 0, y: 1 },
        collectibles: [{ x: 5, y: 1 }, { x: 5, y: 7 }],
        walls: [],
      },
      // ── C4: Three samples — start at (0,0), go right then up ───────────────
      {
        title: "Three-Point Survey",
        hint: "Start at (0,0) — the bottom-left corner. Plan a route that collects all three samples.",
        spriteStart:  { x: 0, y: 0 },
        collectibles: [{ x: 5, y: 0 }, { x: 5, y: 5 }, { x: 9, y: 5 }],
        walls: [],
      },
      // ── C5: First wall! Single sample, vertical boulder barrier ────────────
      {
        title: "Boulder Barrier",
        hint: "Boulders block the direct path east. Navigate above or below them to reach the sample.",
        spriteStart:  { x: 0, y: 4 },
        collectibles: [{ x: 8, y: 4 }],
        walls: [
          { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 },
          { x: 4, y: 5 }, { x: 4, y: 6 },
        ],
      },
      // ── C6: Same wall, two samples — one above, one below ──────────────────
      {
        title: "Split Recovery",
        hint: "One wall, two samples — one above it, one below. Find a path that collects both!",
        spriteStart:  { x: 0, y: 4 },
        collectibles: [{ x: 7, y: 7 }, { x: 7, y: 1 }],
        walls: [
          { x: 4, y: 2 }, { x: 4, y: 3 }, { x: 4, y: 4 },
          { x: 4, y: 5 }, { x: 4, y: 6 },
        ],
      },
      // ── C7: go_to_xy discovery — dense walls, no labels yet ────────────────
      {
        title: "Shortcut Science",
        hint: "These boulders make driving very difficult. Is there a block that doesn't need a clear path at all?",
        spriteStart:  { x: 0, y: 9 },
        collectibles: [{ x: 3, y: 1 }, { x: 8, y: 6 }],
        walls: [
          { x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 },
          { x: 1, y: 6 }, { x: 1, y: 5 }, { x: 1, y: 4 },
          { x: 5, y: 6 }, { x: 5, y: 5 }, { x: 5, y: 4 },
          { x: 2, y: 4 }, { x: 3, y: 4 }, { x: 4, y: 4 },
          { x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }, { x: 9, y: 5 },
          { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 },
        ],
      },
      // ── C8: Sealed sample — grid labels appear, use go_to_xy ───────────────
      {
        title: "Sealed Sample",
        hint: "The sample is completely surrounded by boulders — the rover can't drive in! The grid labels just appeared. Read the coordinates and try the 'go to x: y:' block.",
        spriteStart:  { x: 0, y: 5 },
        collectibles: [{ x: 8, y: 5 }],
        walls: [
          { x: 7, y: 6 }, { x: 8, y: 6 }, { x: 9, y: 6 },
          { x: 7, y: 5 },                  { x: 9, y: 5 },
          { x: 7, y: 4 }, { x: 8, y: 4 }, { x: 9, y: 4 },
        ],
      },
      // ── C9: Final challenge — grid labels on, mix of all strategies ─────────
      {
        title: "Final Survey",
        hint: "Three samples scattered across the terrain. Use whatever combination of blocks works best!",
        spriteStart:  { x: 0, y: 0 },
        collectibles: [{ x: 2, y: 6 }, { x: 7, y: 3 }, { x: 9, y: 8 }],
        walls: [
          { x: 1, y: 5 }, { x: 2, y: 5 }, { x: 3, y: 5 },
          { x: 1, y: 4 }, { x: 1, y: 3 },
          { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 5, y: 4 },
          { x: 8, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 6 },
        ],
      },
    ],

    quiz: [
      {
        question: "What is always the FIRST block in every script?",
        options: ["move right", "move up", "when 🏁 clicked", "go to x: y:"],
        answer: 2,
        explanation: "Every script must start with an event block. 'When 🏁 clicked' fires when you press Run.",
      },
      {
        question: "Your rover is at (1, 5). After 'move right 3 steps', where is it?",
        options: ["(1, 8)", "(4, 5)", "(1, 2)", "(3, 5)"],
        answer: 1,
        explanation: "Moving right adds to X. 1 + 3 = 4. Y stays the same. New position: (4, 5).",
      },
      {
        question: "On the stage grid, moving UP makes Y…",
        options: ["Increase", "Stay the same", "Decrease", "Reset to zero"],
        answer: 0,
        explanation: "Y=0 is at the bottom, just like in math class. Moving up increases Y.",
      },
      {
        question: "What happens when the rover tries to drive into a boulder?",
        options: [
          "It teleports over the boulder",
          "The script stops completely",
          "It stays in place for that step",
          "It destroys the boulder",
        ],
        answer: 2,
        explanation: "Boulders block movement. The rover just stays where it is — but the script keeps running!",
      },
      {
        question: "Which block can send the rover to ANY position in just ONE block, even through boulders?",
        options: ["move right", "move down", "move up", "go to x: y:"],
        answer: 3,
        explanation: "'Go to x: y:' teleports the rover directly — it ignores boulders entirely!",
      },
      {
        question: "Your rover is at (3, 7). After 'move up 4 steps', what is the new Y?",
        options: ["11", "3", "4", "7"],
        answer: 1,
        explanation: "Moving up subtracts from Y. 7 − 4 = 3. The rover is now at (3, 3).",
      },
    ],
  },

  {
    id: 2,
    title: "Sprites & Interaction",
    tagline: "Multiple rovers, speech, and key events",
    color: "#16a34a",
    introNotes: `Module 2 — Sprites & Interaction\n\nComing soon! You'll add a second rover, make them communicate, and trigger events with key presses.`,
    newBlockIds: ["when_key_pressed", "say", "show", "hide"],
    challenges: [],
    quiz: [],
  },

  {
    id: 3,
    title: "Loops & Animation",
    tagline: "Repeat actions automatically",
    color: "#dc2626",
    introNotes: `Module 3 — Loops & Animation\n\nComing soon! You'll use repeat and forever loops to patrol routes and create smooth animation.`,
    newBlockIds: ["repeat", "forever", "wait"],
    challenges: [],
    quiz: [],
  },

  {
    id: 4,
    title: "Conditionals & Logic",
    tagline: "Make decisions with if blocks",
    color: "#7c3aed",
    introNotes: `Module 4 — Conditionals & Logic\n\nComing soon! The rover will react to what it senses using if blocks.`,
    newBlockIds: ["if_touching_target", "if_key", "broadcast"],
    challenges: [],
    quiz: [],
  },

  {
    id: 5,
    title: "Variables & Final Mission",
    tagline: "Track sample counts and build a full mission",
    color: "#059669",
    introNotes: `Module 5 — Variables & Final Mission\n\nComing soon! You'll use variables to track scores and build your own complete rover mission.`,
    newBlockIds: ["set_variable", "change_variable", "show_variable"],
    challenges: [],
    quiz: [],
  },
];
