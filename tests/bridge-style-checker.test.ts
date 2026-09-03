import { describe, expect, it } from "vitest";
import {
  ROADWAY_Y,
  SUPPORT_X,
  type Member,
  type Node,
} from "../app/tools/bridge/engine/members";
import {
  generateTruss,
  type TrussTemplate,
} from "../app/tools/bridge/engine/trussTemplates";
import { checkStyleRequirement } from "../app/tools/bridge/engine/styleChecker";

type Span = 20 | 40 | 60 | 80 | 100;

/** Convert a template (feet, y-up from deck) into canvas nodes/members. */
function toCanvas(
  tpl: TrussTemplate,
  spanFt: Span,
  idPrefix = "n"
): { nodes: Node[]; members: Member[] } {
  const { left, right } = SUPPORT_X[spanFt];
  const pxPerFt = (right - left) / spanFt;
  const nodes: Node[] = tpl.nodes.map((n, i) => ({
    id: `${idPrefix}${i}`,
    x: left + n.x * pxPerFt,
    y: ROADWAY_Y - n.y * pxPerFt,
  }));
  const members: Member[] = tpl.members.map(([a, b], i) => ({
    id: `${idPrefix}m${i}`,
    a: `${idPrefix}${a}`,
    b: `${idPrefix}${b}`,
    type: "box_1",
  }));
  return { nodes, members };
}

function ftNode(id: string, xFt: number, yFt: number, spanFt: Span): Node {
  const { left, right } = SUPPORT_X[spanFt];
  const pxPerFt = (right - left) / spanFt;
  return { id, x: left + xFt * pxPerFt, y: ROADWAY_Y - yFt * pxPerFt };
}

const member = (id: string, a: string, b: string): Member => ({
  id,
  a,
  b,
  type: "box_1",
});

describe("triangles brief", () => {
  it("passes a Warren truss (superstructure only, plenty of triangles)", () => {
    const { nodes, members } = toCanvas(generateTruss("warren", 40), 40);
    const res = checkStyleRequirement("triangles", nodes, members, 40);
    expect(res.ok).toBe(true);
  });

  it("fails when the design has a substructure", () => {
    const { nodes, members } = toCanvas(generateTruss("warren", 40), 40);
    nodes.push(ftNode("s1", 15, -5, 40), ftNode("s2", 25, -5, 40));
    members.push(
      member("sm1", "n1", "s1"),
      member("sm2", "s1", "s2"),
      member("sm3", "s2", "n3")
    );
    const res = checkStyleRequirement("triangles", nodes, members, 40);
    expect(res.ok).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/superstructure only/i);
  });

  it("fails an empty deck with a helpful reason", () => {
    const { nodes, members } = toCanvas(
      { nodes: [{ x: 0, y: 0 }, { x: 40, y: 0 }], members: [[0, 1]] },
      40
    );
    const res = checkStyleRequirement("triangles", nodes, members, 40);
    expect(res.ok).toBe(false);
  });
});

describe("x-brace brief", () => {
  it("passes a Double Intersection truss (true crossings) and tips the center joint", () => {
    const { nodes, members } = toCanvas(generateTruss("doubleWarren", 40), 40);
    const res = checkStyleRequirement("xbrace", nodes, members, 40);
    expect(res.ok).toBe(true);
    expect(res.tips.join(" ")).toMatch(/joint/i);
  });

  it("passes joined X's (joint at the crossing) — Charlie: they're stronger", () => {
    // Two 10ft square panels above deck, each braced by four half-diagonals
    // meeting at a center joint.
    const nodes: Node[] = [
      ftNode("b0", 0, 0, 40),
      ftNode("b1", 10, 0, 40),
      ftNode("b2", 20, 0, 40),
      ftNode("t0", 0, 10, 40),
      ftNode("t1", 10, 10, 40),
      ftNode("t2", 20, 10, 40),
      ftNode("c0", 5, 5, 40),
      ftNode("c1", 15, 5, 40),
    ];
    const members: Member[] = [
      member("m1", "b0", "b1"), member("m2", "b1", "b2"),
      member("m3", "t0", "t1"), member("m4", "t1", "t2"),
      member("m5", "b0", "t0"), member("m6", "b1", "t1"), member("m7", "b2", "t2"),
      // joined X in panel 1
      member("x1", "b0", "c0"), member("x2", "c0", "t1"),
      member("x3", "t0", "c0"), member("x4", "c0", "b1"),
      // joined X in panel 2
      member("x5", "b1", "c1"), member("x6", "c1", "t2"),
      member("x7", "t1", "c1"), member("x8", "c1", "b2"),
    ];
    const res = checkStyleRequirement("xbrace", nodes, members, 40);
    expect(res.ok).toBe(true);
  });

  it("fails a plain Pratt (no X's anywhere)", () => {
    const { nodes, members } = toCanvas(generateTruss("pratt", 40), 40);
    const res = checkStyleRequirement("xbrace", nodes, members, 40);
    expect(res.ok).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/x/i);
  });
});

describe("substructure brief", () => {
  it("passes super + substructure", () => {
    const { nodes, members } = toCanvas(generateTruss("warren", 40), 40);
    nodes.push(ftNode("s1", 15, -5, 40), ftNode("s2", 25, -5, 40));
    members.push(
      member("sm1", "n1", "s1"),
      member("sm2", "s1", "s2"),
      member("sm3", "s2", "n3")
    );
    const res = checkStyleRequirement("substructure", nodes, members, 40);
    expect(res.ok).toBe(true);
  });

  it("fails a superstructure-only design", () => {
    const { nodes, members } = toCanvas(generateTruss("warren", 40), 40);
    const res = checkStyleRequirement("substructure", nodes, members, 40);
    expect(res.ok).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/below the deck/i);
  });
});

describe("arch brief", () => {
  it("passes the bowstring template (true parabolic arch)", () => {
    const { nodes, members } = toCanvas(generateTruss("bowstring", 100), 100);
    const res = checkStyleRequirement("arch", nodes, members, 100);
    expect(res.ok).toBe(true);
  });

  it("passes an elevated-springing arch that is braced downward", () => {
    // Bowstring web without the inclined end posts: the arch path now starts
    // ~9 ft up, held by the hangers below it (Charlie's second drawing).
    const tpl = generateTruss("bowstring", 100);
    const canvas = toCanvas(tpl, 100);
    const endPostIds = new Set<string>();
    // End posts connect node 0 (left support) / node 10 (right support in the
    // bottom chord) to the first/last top nodes; remove members touching the
    // supports that go above deck.
    for (const m of canvas.members) {
      const a = canvas.nodes.find((n) => n.id === m.a)!;
      const b = canvas.nodes.find((n) => n.id === m.b)!;
      const aAbove = a.y < ROADWAY_Y - 1;
      const bAbove = b.y < ROADWAY_Y - 1;
      const touchesSupportDeck =
        (!aAbove && (Math.abs(a.x - SUPPORT_X[100].left) < 2 || Math.abs(a.x - SUPPORT_X[100].right) < 2)) ||
        (!bAbove && (Math.abs(b.x - SUPPORT_X[100].left) < 2 || Math.abs(b.x - SUPPORT_X[100].right) < 2));
      if (touchesSupportDeck && (aAbove || bAbove)) endPostIds.add(m.id);
    }
    const members = canvas.members.filter((m) => !endPostIds.has(m.id));
    const res = checkStyleRequirement("arch", canvas.nodes, members, 100);
    expect(res.ok).toBe(true);
  });

  it("rejects a two-line tent", () => {
    const tpl: TrussTemplate = {
      nodes: [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 },
        { x: 40, y: 0 }, { x: 50, y: 0 }, { x: 60, y: 0 }, { x: 70, y: 0 },
        { x: 80, y: 0 }, { x: 90, y: 0 }, { x: 100, y: 0 },
        // straight-line "tent" sides with joints along them
        { x: 10, y: 5 }, { x: 20, y: 10 }, { x: 30, y: 15 }, { x: 40, y: 20 },
        { x: 50, y: 25 },
        { x: 60, y: 20 }, { x: 70, y: 15 }, { x: 80, y: 10 }, { x: 90, y: 5 },
      ],
      members: [
        [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [9, 10], [8, 9],
        [0, 11], [11, 12], [12, 13], [13, 14], [14, 15],
        [15, 16], [16, 17], [17, 18], [18, 19], [19, 10],
        [11, 1], [12, 2], [13, 3], [14, 4], [16, 6], [17, 7], [18, 8], [19, 9],
      ],
    };
    const { nodes, members } = toCanvas(tpl, 100);
    const res = checkStyleRequirement("arch", nodes, members, 100);
    expect(res.ok).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/tent/i);
  });

  it("rejects a flat-topped trapezoid (a Pratt is not an arch)", () => {
    const { nodes, members } = toCanvas(generateTruss("pratt", 100), 100);
    const res = checkStyleRequirement("arch", nodes, members, 100);
    expect(res.ok).toBe(false);
    expect(res.reasons.join(" ")).toMatch(/flat|trapezoid|higher/i);
  });
});
