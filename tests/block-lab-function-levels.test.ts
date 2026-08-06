import { describe, it, expect } from "vitest";
import { UNITS, type BlockChallenge } from "@/app/tools/block-lab/units";

// Machine verification of the Functions unit's motif-in-noise levels
// (redesigned 2026-08-06). Each level's INTENDED solution is simulated
// against the real runtime rules: it must reach the exit without a bump,
// collect every chip, and cost exactly `par` blocks. If a grid, chip, or
// par is ever edited, these tests catch an unsolvable/mispriced level
// before students do.
//
// Mini-simulator mirroring engine/runtime.ts semantics:
//   move bumps on walls (bump = run fails), collect is a no-op off-chip,
//   while_path_ahead checks the cell ahead before each iteration.

type Dir = "right" | "left" | "up" | "down";
type Tok =
  | { t: "M" } | { t: "TL" } | { t: "TR" } | { t: "C" }
  | { t: "call"; fn: number }
  | { t: "repeat"; n: number; body: Tok[] }
  | { t: "while"; body: Tok[] };

const M: Tok = { t: "M" };
const TL: Tok = { t: "TL" };
const TR: Tok = { t: "TR" };
const C: Tok = { t: "C" };
const call = (fn: number): Tok => ({ t: "call", fn });
const repeat = (n: number, body: Tok[]): Tok => ({ t: "repeat", n, body });
const wh = (body: Tok[]): Tok => ({ t: "while", body });

const LEFT: Record<Dir, Dir> = { right: "up", up: "left", left: "down", down: "right" };
const RIGHT: Record<Dir, Dir> = { right: "down", down: "left", left: "up", up: "right" };
const DELTA: Record<Dir, [number, number]> = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };

function simulate(ch: BlockChallenge, defs: Record<number, Tok[]>, main: Tok[]) {
  const grid = ch.grid;
  const isPath = (x: number, y: number) =>
    y >= 0 && y < grid.length && x >= 0 && x < grid[0].length && grid[y][x] === 0;
  let x = ch.startX, y = ch.startY, dir = ch.startDir as Dir;
  let bumped = false;
  const chips = new Set(ch.collectibles.map((c) => `${c.x},${c.y}`));

  function exec(toks: Tok[], depth = 0) {
    if (depth > 50) throw new Error("recursion runaway");
    for (const tok of toks) {
      if (bumped) return;
      switch (tok.t) {
        case "M": {
          const [dx, dy] = DELTA[dir];
          if (isPath(x + dx, y + dy)) { x += dx; y += dy; } else { bumped = true; }
          break;
        }
        case "TL": dir = LEFT[dir]; break;
        case "TR": dir = RIGHT[dir]; break;
        case "C": chips.delete(`${x},${y}`); break;
        case "call": exec(defs[tok.fn], depth + 1); break;
        case "repeat": for (let i = 0; i < tok.n && !bumped; i++) exec(tok.body, depth + 1); break;
        case "while": {
          let guard = 0;
          while (!bumped) {
            const [dx, dy] = DELTA[dir];
            if (!isPath(x + dx, y + dy)) break;
            exec(tok.body, depth + 1);
            if (++guard > 100) throw new Error("while runaway");
          }
          break;
        }
      }
    }
  }
  exec(main);
  return { bumped, atExit: x === ch.exitX && y === ch.exitY, chipsLeft: chips.size };
}

// Block counting per engine countBlocks: every block is 1; define adds its
// body; repeat/while add their bodies; a call is always exactly 1.
function countTok(toks: Tok[]): number {
  return toks.reduce((sum, tok) => {
    if (tok.t === "repeat" || tok.t === "while") return sum + 1 + countTok(tok.body);
    return sum + 1;
  }, 0);
}
function totalBlocks(defs: Record<number, Tok[]>, main: Tok[]): number {
  const defCost = Object.values(defs).reduce((s, body) => s + 1 + countTok(body), 0);
  return defCost + countTok(main);
}

const STAIR = [M, TR, M, TL, C];               // down-stair, chip on the landing
const CLIMB = [TL, M, TR, M, C];               // up-climb, starts with a turn
const HALLWAY = [wh([M, C]), TR];              // walks any hallway, then turns right

const FN_UNIT = UNITS.find((u) => u.challenges.some((c) => c.title === "Stairs in the Wild"))!;
const level = (title: string) => FN_UNIT.challenges.find((c) => c.title === title)!;

const INTENDED: { title: string; defs: Record<number, Tok[]>; main: Tok[] }[] = [
  {
    title: "Stairs in the Wild",
    defs: { 1: STAIR },
    main: [call(1), M, M, call(1), M, call(1), M, M, M],
  },
  {
    title: "Two Patterns, Scattered",
    defs: { 1: STAIR, 2: CLIMB },
    main: [call(1), M, M, call(2), M, call(1), M, M, call(2)],
  },
  {
    title: "Loop Meets Function",
    defs: { 1: STAIR },
    main: [repeat(4, [call(1)]), M, M, call(1), M, M, M],
  },
  {
    title: "A Function Calls a Function",
    defs: { 1: STAIR, 2: [call(1), M, M] },
    main: [call(2), TR, M, TL, call(1), M, call(2), M, M, call(2)],
  },
  {
    title: "Hallways in the Wild",
    defs: { 1: HALLWAY },
    main: [call(1), M, M, TL, call(1), M, TL, call(1), M],
  },
  {
    title: "Down and Around",
    defs: { 1: STAIR, 2: HALLWAY },
    main: [call(1), M, call(1), call(2), M, TL, call(2), M, M, TL, call(1)],
  },
  {
    // Three staircases (3, 2, 1 steps) all built from ONE step function +
    // Repeats of different sizes — the step is the atom, the loop is the length.
    title: "Graduation Day",
    defs: { 1: STAIR },
    main: [repeat(3, [call(1)]), M, M, repeat(2, [call(1)]), M, call(1), M],
  },
];

describe("Functions unit — intended solutions are valid and exactly at par", () => {
  for (const { title, defs, main } of INTENDED) {
    it(title, () => {
      const ch = level(title);
      const result = simulate(ch, defs, main);
      expect(result.bumped, "intended solution bumped a wall").toBe(false);
      expect(result.atExit, "intended solution did not reach the exit").toBe(true);
      expect(result.chipsLeft, "intended solution missed chips").toBe(0);
      const blocks = totalBlocks(defs, main);
      expect(blocks, "intended solution cost != par").toBe(ch.par);
      expect(blocks).toBeLessThanOrEqual(ch.maxBlocks);
    });
  }
});

describe("Functions unit — anti-cheat: Repeat-of-motif dies at the first irregular gap", () => {
  it("Stairs in the Wild: Repeat 3 [stair] bumps", () => {
    const ch = level("Stairs in the Wild");
    const result = simulate(ch, { 1: STAIR }, [repeat(3, [call(1)])]);
    expect(result.bumped).toBe(true);
  });
  it("Loop Meets Function: Repeat 5 [stair] bumps (walkway interrupts)", () => {
    const ch = level("Loop Meets Function");
    const result = simulate(ch, { 1: STAIR }, [repeat(5, [call(1)])]);
    expect(result.bumped).toBe(true);
  });
  it("Two Patterns: padded stair (stair+Move+Move) bumps on its second call", () => {
    const ch = level("Two Patterns, Scattered");
    const padded = [...STAIR, M, M];
    const result = simulate(ch, { 1: padded }, [call(1), call(1)]);
    expect(result.bumped).toBe(true);
  });
  it("Graduation Day: Repeat 4 overruns the first staircase and bumps", () => {
    const ch = level("Graduation Day");
    const result = simulate(ch, { 1: STAIR }, [repeat(4, [call(1)])]);
    expect(result.bumped).toBe(true);
  });
  it("Graduation Day: Repeat 3 on the 2-step staircase bumps — counts matter", () => {
    const ch = level("Graduation Day");
    const result = simulate(ch, { 1: STAIR }, [
      repeat(3, [call(1)]), M, M, repeat(3, [call(1)]),
    ]);
    expect(result.bumped).toBe(true);
  });
});
