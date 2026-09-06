import { describe, it, expect } from "vitest";
import { UNITS, type BlockChallenge } from "@/app/tools/block-lab/units";

// Machine verification of the Functions unit (library edition, 2026-09-05).
// Every function a student defines is saved to their library when they beat
// a level and costs 0 blocks on later levels. Each level's INTENDED solution
// is simulated against the real runtime rules (bump = fail, collect is a
// no-op off-chip, while checks the cell ahead) and must: reach the exit,
// collect every chip, and cost exactly `par` — counting only the main
// program plus definitions NEW on that level.

type Dir = "right" | "left" | "up" | "down";
type Tok =
  | { t: "M" } | { t: "TL" } | { t: "TR" } | { t: "C" }
  | { t: "call"; fn: string }
  | { t: "repeat"; n: number; body: Tok[] }
  | { t: "while"; body: Tok[] };

const M: Tok = { t: "M" };
const TL: Tok = { t: "TL" };
const TR: Tok = { t: "TR" };
const C: Tok = { t: "C" };
const call = (fn: string): Tok => ({ t: "call", fn });
const repeat = (n: number, body: Tok[]): Tok => ({ t: "repeat", n, body });
const wh = (body: Tok[]): Tok => ({ t: "while", body });

const LEFT: Record<Dir, Dir> = { right: "up", up: "left", left: "down", down: "right" };
const RIGHT: Record<Dir, Dir> = { right: "down", down: "left", left: "up", up: "right" };
const DELTA: Record<Dir, [number, number]> = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] };

// The library a student has built by the end of the unit
const LIBRARY: Record<string, Tok[]> = {
  step: [M, TR, M, TL, C],
  hallway: [wh([M, C]), TR],
  bigstep: [call("step"), repeat(3, [M])],
};

function simulate(ch: BlockChallenge, main: Tok[]) {
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
        case "call": exec(LIBRARY[tok.fn], depth + 1); break;
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

// Block counting per engine countBlocks: every block is 1; a definition adds
// its body; repeat/while add their bodies; a call is exactly 1.
function countTok(toks: Tok[]): number {
  return toks.reduce((sum, tok) => {
    if (tok.t === "repeat" || tok.t === "while") return sum + 1 + countTok(tok.body);
    return sum + 1;
  }, 0);
}
const defCost = (name: string) => 1 + countTok(LIBRARY[name]);

const FN_UNIT = UNITS.find((u) => u.challenges.some((c) => c.title === "Any Hallway"))!;
const level = (title: string) => FN_UNIT.challenges.find((c) => c.title === title)!;

const INTENDED: { title: string; newDefs: string[]; main: Tok[] }[] = [
  {
    title: "One Function, Two Places",
    newDefs: ["step"],
    main: [call("step"), M, M, call("step"), M],
  },
  {
    title: "Step Down",
    newDefs: [],
    main: [M, repeat(5, [call("step")]), M, M, call("step"), M],
  },
  {
    title: "Any Hallway",
    newDefs: ["hallway"],
    main: [call("hallway"), call("hallway"), call("hallway"), call("hallway"), call("hallway")],
  },
  {
    title: "Mix and Match",
    newDefs: [],
    main: [M, call("step"), M, M, call("step"), call("hallway"), call("hallway"), M, M, call("step"), repeat(3, [M]), call("step"), M],
  },
  {
    title: "Build on What You Have",
    newDefs: ["bigstep"],
    main: [M, call("bigstep"), call("bigstep"), call("bigstep"), TR, repeat(4, [M]), TR, call("bigstep"), call("step"), M],
  },
  {
    title: "Graduation Day",
    newDefs: [],
    main: [M, call("bigstep"), call("step"), call("hallway"), call("hallway"), M, call("step"), M, M, call("bigstep"), M],
  },
];

describe("Functions unit — intended solutions win with every chip, exactly at par", () => {
  for (const { title, newDefs, main } of INTENDED) {
    it(title, () => {
      const ch = level(title);
      const result = simulate(ch, main);
      expect(result.bumped, "intended solution bumped a wall").toBe(false);
      expect(result.atExit, "intended solution did not reach the exit").toBe(true);
      expect(result.chipsLeft, "intended solution missed chips").toBe(0);
      const blocks = countTok(main) + newDefs.reduce((s, n) => s + defCost(n), 0);
      expect(blocks, "main + new definitions != par").toBe(ch.par);
      expect(blocks).toBeLessThanOrEqual(ch.maxBlocks!);
    });
  }
});

describe("Functions unit — writing every motif out by hand blows the limit", () => {
  const inlineOf = (toks: Tok[]): Tok[] => toks.flatMap((t) =>
    t.t === "call" ? inlineOf(LIBRARY[t.fn]) : t.t === "repeat" ? Array.from({ length: t.n }, () => inlineOf(t.body)).flat() : [t]);
  for (const { title, main } of INTENDED) {
    it(`${title}: all-inline costs more than the limit`, () => {
      const ch = level(title);
      expect(countTok(inlineOf(main))).toBeGreaterThan(ch.maxBlocks!);
    });
  }
});

describe("Functions unit — the unit has exactly six challenges", () => {
  it("six", () => { expect(FN_UNIT.challenges.length).toBe(6); });
});
