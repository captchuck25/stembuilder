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
const DIP = [TR, M, TL, M, C, M, TL, M, TR];     // mandatory notch below the road

const FN_UNIT = UNITS.find((u) => u.challenges.some((c) => c.title === "Dips in the Road"))!;
const level = (title: string) => FN_UNIT.challenges.find((c) => c.title === title)!;

const INTENDED: { title: string; defs: Record<number, Tok[]>; main: Tok[] }[] = [
  {
    title: "Dips in the Road",
    defs: { 1: [TR, M, TL, M, C, M, TL, M, TR] },
    main: [M, M, call(1), repeat(4, [M]), call(1), repeat(3, [M]), TR, repeat(4, [M]), TR, repeat(3, [M]), call(1), repeat(5, [M]), call(1), M, M],
  },
  {
    title: "Dips and Bumps",
    defs: { 1: [TR, M, TL, M, C, M, TL, M, TR], 2: [TL, M, TR, M, C, M, TR, M, TL] },
    main: [M, M, call(1), repeat(3, [M]), call(2), repeat(4, [M]), TR, repeat(4, [M]), TR, repeat(3, [M]), call(1), repeat(3, [M]), call(2), M, M],
  },
  {
    title: "Loop Meets Function",
    defs: { 1: [TR, M, TL, M, C, M, TL, M, TR] },
    main: [M, M, repeat(4, [call(1), M]), TR, repeat(4, [M]), TR, repeat(5, [M]), call(1), repeat(3, [M])],
  },
  {
    title: "A Function Calls a Function",
    defs: { 1: [TR, M, TL, M, C, M, TL, M, TR], 2: [call(1), repeat(3, [M])] },
    main: [M, M, call(2), call(2), TR, repeat(4, [M]), TR, call(2), call(2), call(1), M],
  },
  {
    title: "Hallways in the Wild",
    defs: { 3: [wh([M, C]), TR] },
    main: [call(3), M, TL, M, TR, call(3), call(3), M, TL, M, TR, call(3), call(3)],
  },
  {
    title: "Down and Around",
    defs: { 1: [TR, M, TL, M, C, M, TL, M, TR], 3: [wh([M, C]), TR] },
    main: [M, M, call(1), M, M, call(1), call(3), call(3), M, M, call(1), repeat(3, [M]), call(1), M, M],
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
      expect(blocks).toBeLessThanOrEqual(ch.maxBlocks!);
    });
  }
});

describe("Functions unit — the rival strategies cost more than the block limit", () => {
  it("Dips in the Road: loops without a function cost 52 > limit 33", () => {
    const ch = level("Dips in the Road");
    expect(countTok([M, M, TR, M, TL, M, C, M, TL, M, TR, repeat(4, [M]), TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TR, repeat(4, [M]), TR, repeat(3, [M]), TR, M, TL, M, C, M, TL, M, TR, repeat(5, [M]), TR, M, TL, M, C, M, TL, M, TR, M, M])).toBeGreaterThan(ch.maxBlocks!);
  });
  it("Dips and Bumps: loops without a function cost 52 > limit 43", () => {
    const ch = level("Dips and Bumps");
    expect(countTok([M, M, TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TL, M, TR, M, C, M, TR, M, TL, repeat(4, [M]), TR, repeat(4, [M]), TR, repeat(3, [M]), TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TL, M, TR, M, C, M, TR, M, TL, M, M])).toBeGreaterThan(ch.maxBlocks!);
  });
  it("Loop Meets Function: loops without a function cost 30 > limit 27", () => {
    const ch = level("Loop Meets Function");
    expect(countTok([M, M, repeat(4, [TR, M, TL, M, C, M, TL, M, TR, M]), TR, repeat(4, [M]), TR, repeat(5, [M]), TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M])])).toBeGreaterThan(ch.maxBlocks!);
  });
  it("A Function Calls a Function: loops without a function cost 60 > limit 29", () => {
    const ch = level("A Function Calls a Function");
    expect(countTok([M, M, TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TR, repeat(4, [M]), TR, TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TR, M, TL, M, C, M, TL, M, TR, M])).toBeGreaterThan(ch.maxBlocks!);
  });
  it("Hallways in the Wild: loops without a function cost 28 > limit 21", () => {
    const ch = level("Hallways in the Wild");
    expect(countTok([wh([M, C]), TR, M, TL, M, TR, wh([M, C]), TR, wh([M, C]), TR, M, TL, M, TR, wh([M, C]), TR, wh([M, C]), TR])).toBeGreaterThan(ch.maxBlocks!);
  });
  it("Down and Around: loops without a function cost 54 > limit 34", () => {
    const ch = level("Down and Around");
    expect(countTok([M, M, TR, M, TL, M, C, M, TL, M, TR, M, M, TR, M, TL, M, C, M, TL, M, TR, wh([M, C]), TR, wh([M, C]), TR, M, M, TR, M, TL, M, C, M, TL, M, TR, repeat(3, [M]), TR, M, TL, M, C, M, TL, M, TR, M, M])).toBeGreaterThan(ch.maxBlocks!);
  });
  it("Dips in the Road: Repeat 4 [dip] bumps (the straights between dips differ)", () => {
    const ch = level("Dips in the Road");
    const result = simulate(ch, { 1: DIP }, [M, M, repeat(4, [call(1)])]);
    expect(result.bumped).toBe(true);
  });
  it("Loop Meets Function: Repeat 5 [dip, Move] bumps (the fifth dip has nowhere to go)", () => {
    const ch = level("Loop Meets Function");
    const result = simulate(ch, { 1: DIP }, [M, M, repeat(5, [call(1), M])]);
    expect(result.bumped).toBe(true);
  });
  it("Graduation Day: Repeat 4 overruns the first staircase and bumps", () => {
    const ch = level("Graduation Day");
    const result = simulate(ch, { 1: STAIR }, [repeat(4, [call(1)])]);
    expect(result.bumped).toBe(true);
  });
});
