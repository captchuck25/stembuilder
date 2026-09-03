// Assignment style checker: verifies a student's design against one of four
// basic structural briefs (Charlie's spec, 2026-09-02). Works purely on the
// joint/member graph in canvas coordinates; all thresholds are in feet.

import { type Node, type Member, ROADWAY_Y, SUPPORT_X } from "./members";

export type StyleRequirement =
  | "none"
  | "triangles"
  | "xbrace"
  | "substructure"
  | "arch";

export const STYLE_REQUIREMENT_INFO: Record<
  Exclude<StyleRequirement, "none">,
  { teacherLabel: string; studentLabel: string }
> = {
  triangles: {
    teacherLabel: "Superstructure only — must use triangles",
    studentLabel: "Build above the deck only, using triangles",
  },
  xbrace: {
    teacherLabel: "Superstructure only — must include X's",
    studentLabel: "Build above the deck only, and include X bracing",
  },
  substructure: {
    teacherLabel: "Must have superstructure AND substructure",
    studentLabel: "Build both above and below the deck",
  },
  arch: {
    teacherLabel: "Must include an arch across the superstructure",
    studentLabel: "Build an arch that curves across your bridge",
  },
};

export type StyleCheckResult = {
  ok: boolean;
  /** Kid-friendly explanations of what is missing (empty when ok). */
  reasons: string[];
  /** Encouragement shown even on success (e.g. the joined-X tip). */
  tips: string[];
};

const DECK_TOL_FT = 0.75;

type Ctx = {
  nodes: Node[];
  members: Member[];
  byId: Map<string, Node>;
  adj: Map<string, string[]>;
  pxPerFt: number;
  spanPx: number;
  leftPx: number;
};

function buildCtx(nodes: Node[], members: Member[], spanFt: number): Ctx {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const m of members) {
    if (!byId.has(m.a) || !byId.has(m.b)) continue;
    if (!adj.has(m.a)) adj.set(m.a, []);
    if (!adj.has(m.b)) adj.set(m.b, []);
    adj.get(m.a)!.push(m.b);
    adj.get(m.b)!.push(m.a);
  }
  const { left, right } = SUPPORT_X[spanFt as 20 | 40 | 60 | 80 | 100];
  return {
    nodes,
    members,
    byId,
    adj,
    pxPerFt: (right - left) / spanFt,
    spanPx: right - left,
    leftPx: left,
  };
}

/** Height above the deck in feet (positive = above). */
function yFt(ctx: Ctx, n: Node): number {
  return (ROADWAY_Y - n.y) / ctx.pxPerFt;
}

function connectedNodeIds(ctx: Ctx): Set<string> {
  return new Set(ctx.adj.keys());
}

function hasSubstructure(ctx: Ctx): boolean {
  let below = 0;
  for (const id of connectedNodeIds(ctx)) {
    const n = ctx.byId.get(id);
    if (n && yFt(ctx, n) < -DECK_TOL_FT) below++;
  }
  const belowMembers = ctx.members.filter((m) => {
    const a = ctx.byId.get(m.a);
    const b = ctx.byId.get(m.b);
    return (
      (a && yFt(ctx, a) < -DECK_TOL_FT) || (b && yFt(ctx, b) < -DECK_TOL_FT)
    );
  }).length;
  return below >= 2 && belowMembers >= 3;
}

function hasSuperstructure(ctx: Ctx): boolean {
  const aboveMembers = ctx.members.filter((m) => {
    const a = ctx.byId.get(m.a);
    const b = ctx.byId.get(m.b);
    return (a && yFt(ctx, a) > DECK_TOL_FT) || (b && yFt(ctx, b) > DECK_TOL_FT);
  }).length;
  return aboveMembers >= 3;
}

/** Count distinct triangles (3-cycles) with at least one joint above deck. */
function countSuperTriangles(ctx: Ctx): number {
  const seen = new Set<string>();
  const edge = new Set(
    ctx.members.map((m) => (m.a < m.b ? `${m.a}|${m.b}` : `${m.b}|${m.a}`))
  );
  for (const [a, neigh] of ctx.adj) {
    for (let i = 0; i < neigh.length; i++) {
      for (let j = i + 1; j < neigh.length; j++) {
        const b = neigh[i];
        const c = neigh[j];
        const key = b < c ? `${b}|${c}` : `${c}|${b}`;
        if (!edge.has(key)) continue;
        const na = ctx.byId.get(a)!;
        const nb = ctx.byId.get(b)!;
        const nc = ctx.byId.get(c)!;
        // Skip degenerate slivers (area < 1 sq ft).
        const areaPx2 =
          Math.abs(
            (nb.x - na.x) * (nc.y - na.y) - (nc.x - na.x) * (nb.y - na.y)
          ) / 2;
        if (areaPx2 < ctx.pxPerFt * ctx.pxPerFt) continue;
        if (
          yFt(ctx, na) <= DECK_TOL_FT &&
          yFt(ctx, nb) <= DECK_TOL_FT &&
          yFt(ctx, nc) <= DECK_TOL_FT
        )
          continue;
        seen.add([a, b, c].sort().join("|"));
      }
    }
  }
  return seen.size;
}

/** True X's: member pairs crossing with no joint at the intersection. */
function countTrueCrossings(ctx: Ctx): number {
  let count = 0;
  const ms = ctx.members;
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const m1 = ms[i];
      const m2 = ms[j];
      if (m1.a === m2.a || m1.a === m2.b || m1.b === m2.a || m1.b === m2.b)
        continue;
      const p1 = ctx.byId.get(m1.a)!;
      const p2 = ctx.byId.get(m1.b)!;
      const p3 = ctx.byId.get(m2.a)!;
      const p4 = ctx.byId.get(m2.b)!;
      const d1x = p2.x - p1.x;
      const d1y = p2.y - p1.y;
      const d2x = p4.x - p3.x;
      const d2y = p4.y - p3.y;
      const denom = d1x * d2y - d1y * d2x;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
      const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
      // Strictly interior on both segments (5% margin keeps near-endpoint
      // grazes from counting).
      if (t > 0.05 && t < 0.95 && u > 0.05 && u < 0.95) count++;
    }
  }
  return count;
}

const isDiagonal = (dx: number, dy: number): boolean => {
  const deg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
  return deg > 15 && deg < 75;
};

/**
 * Joined X's: a joint where two pairs of collinear-opposite DIAGONAL members
 * pass straight through (the student put a joint at the crossing — four
 * triangles, and per Charlie the stronger form: it shortens the member length).
 * Requiring diagonals keeps a chord-plus-vertical "+" from counting.
 */
function countJoinedXs(ctx: Ctx): number {
  let count = 0;
  for (const [id, neigh] of ctx.adj) {
    if (neigh.length < 4) continue;
    const center = ctx.byId.get(id)!;
    const dirs = neigh.map((nid) => {
      const n = ctx.byId.get(nid)!;
      return { dx: n.x - center.x, dy: n.y - center.y };
    });
    const lines: number[] = []; // line angles (0..180) of through-lines
    for (let i = 0; i < dirs.length; i++) {
      for (let j = i + 1; j < dirs.length; j++) {
        const a = dirs[i];
        const b = dirs[j];
        const cross = a.dx * b.dy - a.dy * b.dx;
        const dot = a.dx * b.dx + a.dy * b.dy;
        const angle = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
        if (angle > 168 && isDiagonal(a.dx, a.dy) && isDiagonal(b.dx, b.dy)) {
          lines.push(((Math.atan2(a.dy, a.dx) * 180) / Math.PI + 180) % 180);
        }
      }
    }
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        let diff = Math.abs(lines[i] - lines[j]);
        if (diff > 90) diff = 180 - diff;
        if (diff > 20) {
          count++;
          i = lines.length; // one joined-X per joint is enough
          break;
        }
      }
    }
  }
  return count;
}

/**
 * Arch detection (Charlie's 2026-09-02 drawings): starting from the crown,
 * walk the graph outward along the upper envelope. A real arch descends
 * monotonically on both sides, covers most of the span, curves (several
 * distinct slopes per side, no flat top at the crown), and springs either at
 * deck level or from an elevated point braced downward.
 */
function findArch(ctx: Ctx): { ok: boolean; reason: string | null } {
  const candidates = ctx.nodes.filter(
    (n) => ctx.adj.has(n.id) && yFt(ctx, n) > DECK_TOL_FT
  );
  if (candidates.length === 0)
    return { ok: false, reason: "There are no joints above the deck yet." };
  // Crown = topmost joint; ties (flat top chords) break toward midspan so
  // the walk sees the flat run instead of starting at its end.
  const centerX = ctx.leftPx + ctx.spanPx / 2;
  const crown = candidates.reduce((a, b) => {
    const dy = yFt(ctx, b) - yFt(ctx, a);
    if (dy > 0.25) return b;
    if (dy < -0.25) return a;
    return Math.abs(b.x - centerX) < Math.abs(a.x - centerX) ? b : a;
  });
  const spanFtTotal = ctx.spanPx / ctx.pxPerFt;
  if (yFt(ctx, crown) < spanFtTotal / 8) {
    return {
      ok: false,
      reason: `An arch this long should rise higher — aim for a peak of at least ${Math.round(spanFtTotal / 8)} ft.`,
    };
  }

  const walk = (dir: 1 | -1): Node[] => {
    const path: Node[] = [crown];
    let current = crown;
    const visited = new Set([crown.id]);
    for (;;) {
      const nexts = (ctx.adj.get(current.id) ?? [])
        .map((id) => ctx.byId.get(id)!)
        .filter(
          (n) =>
            !visited.has(n.id) &&
            (n.x - current.x) * dir > 0.5 * ctx.pxPerFt &&
            yFt(ctx, n) <= yFt(ctx, current) + DECK_TOL_FT
        );
      if (nexts.length === 0) break;
      const next = nexts.reduce((a, b) => (yFt(ctx, b) > yFt(ctx, a) ? b : a));
      path.push(next);
      visited.add(next.id);
      current = next;
    }
    return path;
  };

  const leftPath = walk(-1);
  const rightPath = walk(1);
  const leftEnd = leftPath[leftPath.length - 1];
  const rightEnd = rightPath[rightPath.length - 1];
  const coverage = (rightEnd.x - leftEnd.x) / ctx.spanPx;
  if (coverage < 0.7) {
    return {
      ok: false,
      reason:
        "The arch needs to reach across most of the bridge — extend it closer to both supports.",
    };
  }
  const totalSegments = leftPath.length - 1 + (rightPath.length - 1);
  if (totalSegments < 6) {
    return {
      ok: false,
      reason:
        "An arch needs several short pieces to curve — try more, smaller members (set Grid to 1 ft).",
    };
  }

  const sideOk = (path: Node[]): string | null => {
    if (path.length < 3)
      return "Each side of the arch needs at least two members.";
    const slopes: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const run = Math.abs(path[i + 1].x - path[i].x) / ctx.pxPerFt;
      const drop = (yFt(ctx, path[i]) - yFt(ctx, path[i + 1]));
      slopes.push(run > 0 ? drop / run : 99);
    }
    // A long level run at the crown = flat-topped shape, not an arch. A short
    // level segment (a rounded crown traced on a fine grid) is fine.
    let flatRunFt = 0;
    for (let i = 0; i < slopes.length && Math.abs(slopes[i]) < 0.05; i++) {
      flatRunFt += Math.abs(path[i + 1].x - path[i].x) / ctx.pxPerFt;
    }
    if (flatRunFt > 7)
      return "The top of an arch should keep curving — a flat top makes it a trapezoid, not an arch.";
    const distinct: number[] = [];
    for (const s of slopes) {
      if (!distinct.some((d) => Math.abs(d - s) < 0.08)) distinct.push(s);
    }
    if (distinct.length < 2)
      return "Straight lines make a tent, not an arch — the slope should get steeper toward the supports.";
    return null;
  };
  const leftReason = sideOk(leftPath);
  if (leftReason) return { ok: false, reason: leftReason };
  const rightReason = sideOk(rightPath);
  if (rightReason) return { ok: false, reason: rightReason };

  // Springing: at deck level, or elevated but braced downward.
  for (const end of [leftEnd, rightEnd]) {
    const h = yFt(ctx, end);
    if (h <= DECK_TOL_FT) continue;
    const braced = (ctx.adj.get(end.id) ?? []).some((id) => {
      const n = ctx.byId.get(id)!;
      return yFt(ctx, n) < h - 0.5;
    });
    if (!braced) {
      return {
        ok: false,
        reason:
          "The ends of the arch need support — connect them down toward the deck or supports.",
      };
    }
  }
  return { ok: true, reason: null };
}

export function checkStyleRequirement(
  requirement: StyleRequirement,
  nodes: Node[],
  members: Member[],
  spanFt: number
): StyleCheckResult {
  if (requirement === "none") return { ok: true, reasons: [], tips: [] };
  const ctx = buildCtx(nodes, members, spanFt);
  const reasons: string[] = [];
  const tips: string[] = [];

  if (requirement === "triangles" || requirement === "xbrace") {
    if (hasSubstructure(ctx) || ctx.nodes.some((n) => ctx.adj.has(n.id) && yFt(ctx, n) < -DECK_TOL_FT)) {
      reasons.push(
        "This assignment is superstructure only — remove everything below the deck."
      );
    }
  }

  if (requirement === "triangles") {
    const tri = countSuperTriangles(ctx);
    if (tri < 3) {
      reasons.push(
        tri === 0
          ? "We didn't find any triangles above the deck — connect your members into closed triangles."
          : "Almost there — your design needs more triangles above the deck."
      );
    }
  } else if (requirement === "xbrace") {
    const crossings = countTrueCrossings(ctx);
    const joined = countJoinedXs(ctx);
    if (crossings + joined < 2) {
      reasons.push(
        crossings + joined === 0
          ? "We didn't find any X's — cross two diagonal members to make an X."
          : "Add at least one more X to your design."
      );
    }
    if (crossings > 0) {
      tips.push(
        "Pro tip: add a joint where your X's cross — it shortens the member length and makes the X even stronger."
      );
    }
  } else if (requirement === "substructure") {
    if (!hasSuperstructure(ctx)) {
      reasons.push("Your bridge needs structure above the deck too.");
    }
    if (!hasSubstructure(ctx)) {
      reasons.push(
        "Your bridge needs a substructure — build supporting members below the deck."
      );
    }
  } else if (requirement === "arch") {
    const arch = findArch(ctx);
    if (!arch.ok && arch.reason) reasons.push(arch.reason);
  }

  return { ok: reasons.length === 0, reasons, tips };
}
