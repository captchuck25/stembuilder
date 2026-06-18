// Roof engine — perimeter tracing, eave offsetting, auto ridge derivation,
// and helpers for the Roof Plan view. The 2D plan's exterior walls are
// the source of truth for the building footprint; the eave line is that
// footprint offset outward by the roof overhang (from `project.roof.overhang`).
//
// V1 traces the TRUE outer perimeter (not just a bounding box) so L/T-shaped
// plans get their actual roof outline. Cross-gables ("reverses") are
// user-drawn ridge segments stored on `project.roof.segments`.

import { Level, Vec2, Wall } from './types';

// Endpoint clustering tolerance. Walls that share corners typically have
// endpoint coords within ~0.5" of each other (drawing snap + numeric drift).
const EP_TOL = 0.5;

interface VertexNode { x: number; y: number; edges: number[]; }
interface EdgeRef    { v0: number; v1: number; wall: Wall; }

function clusterEndpoints(walls: Wall[]): { vertices: VertexNode[]; edges: EdgeRef[] } {
  const vertices: VertexNode[] = [];
  function getVertex(p: Vec2): number {
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (Math.abs(v.x - p.x) < EP_TOL && Math.abs(v.y - p.y) < EP_TOL) return i;
    }
    vertices.push({ x: p.x, y: p.y, edges: [] });
    return vertices.length - 1;
  }
  const edges: EdgeRef[] = [];
  for (const w of walls) {
    const v0 = getVertex(w.start);
    const v1 = getVertex(w.end);
    if (v0 === v1) continue;
    const ei = edges.length;
    edges.push({ v0, v1, wall: w });
    vertices[v0].edges.push(ei);
    vertices[v1].edges.push(ei);
  }
  return { vertices, edges };
}

// Rebuild every vertex's edge-adjacency list from an edge array.
function reindexAdjacency(vertices: VertexNode[], edges: EdgeRef[]): void {
  for (const v of vertices) v.edges = [];
  for (let ei = 0; ei < edges.length; ei++) {
    vertices[edges[ei].v0].edges.push(ei);
    vertices[edges[ei].v1].edges.push(ei);
  }
}

// Plane-graph noding: split any edge at a vertex that lies on its INTERIOR
// (a T-junction). Wall editing can leave a corner sitting in the middle of a
// collinear neighbour — e.g. a step corner landing mid-span of a stub left by
// a wall split. Without a node there the perimeter walk can never route the
// two faces together and the loop won't close. We add the node so it can.
// The split fragments inherit the original wall id, so wall identity survives.
function splitEdgesAtOnEdgeVertices(vertices: VertexNode[], edges: EdgeRef[]): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (const e of edges) {
    const a = vertices[e.v0], b = vertices[e.v1];
    const abx = b.x - a.x, aby = b.y - a.y;
    const L2 = abx * abx + aby * aby;
    if (L2 < 1e-9) { out.push(e); continue; }

    const hits: { vi: number; t: number }[] = [];
    for (let vi = 0; vi < vertices.length; vi++) {
      if (vi === e.v0 || vi === e.v1) continue;
      const v = vertices[vi];
      const t = ((v.x - a.x) * abx + (v.y - a.y) * aby) / L2;
      if (t <= 1e-4 || t >= 1 - 1e-4) continue;            // beyond / at an endpoint
      const px = a.x + t * abx, py = a.y + t * aby;        // foot of perpendicular
      if (Math.hypot(v.x - px, v.y - py) > EP_TOL) continue; // not on the edge
      hits.push({ vi, t });
    }
    if (hits.length === 0) { out.push(e); continue; }

    hits.sort((p, q) => p.t - q.t);
    let prev = e.v0;
    for (const h of hits) { out.push({ v0: prev, v1: h.vi, wall: e.wall }); prev = h.vi; }
    out.push({ v0: prev, v1: e.v1, wall: e.wall });
  }
  reindexAdjacency(vertices, out);
  return out;
}

// Collapse consecutive collinear vertices of a closed perimeter into a single
// edge. Tracing across split / collinear fragments (or a wall split at a
// T-junction we added above) leaves intermediate points on an otherwise
// straight run; downstream consumers want one edge per physical wall face.
// The merged edge keeps the LONGEST contributing fragment's wall id so a
// per-wall overhang override still lands on the dominant wall.
function mergeCollinearPerimeter(verts: Vec2[], wallIds: string[]): TracedPerimeter {
  let V = verts.slice();
  let W = wallIds.slice();
  let changed = true;
  while (changed && V.length > 3) {
    changed = false;
    for (let i = 0; i < V.length; i++) {
      const n = V.length;
      const a = V[(i - 1 + n) % n], b = V[i], c = V[(i + 1) % n];
      const lab = Math.hypot(b.x - a.x, b.y - a.y);
      const lbc = Math.hypot(c.x - b.x, c.y - b.y);
      const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      // cross / |a→c| ≈ perpendicular distance of b from the a–c line.
      const lac = Math.hypot(c.x - a.x, c.y - a.y);
      if (lac < 1e-6 || cross / lac > EP_TOL) continue;     // a real corner — keep b
      // b is collinear: drop it, merge the two edges into a→c.
      const wPrev = W[(i - 1 + n) % n];
      const wCur = W[i];
      W[(i - 1 + n) % n] = lab >= lbc ? wPrev : wCur;
      V.splice(i, 1);
      W.splice(i, 1);
      changed = true;
      break;
    }
  }
  return { verts: V, edgeWallIds: W };
}

// Returned by `traceOuterPerimeter`. Vertex positions plus the wall that
// owns each edge — edge i runs from `verts[i]` to `verts[(i+1) % n]`. The
// wall identity lets `buildRoofFootprint` apply per-wall overhang overrides
// when constructing the eave.
export interface TracedPerimeter {
  verts: Vec2[];
  edgeWallIds: string[];
}

// Trace the outer perimeter using the "leftmost edge" (planar-graph next-edge
// CW from back direction) rule. From the leftmost-topmost vertex with a
// fake incoming direction of "from above" so the first step heads downward
// or rightward (= CW around the building footprint in canvas Y-down).
function traceOuterPerimeter(vertices: VertexNode[], edges: EdgeRef[]): TracedPerimeter | null {
  if (vertices.length < 3 || edges.length < 3) return null;

  // 1. Leftmost-topmost vertex.
  let startV = 0;
  for (let i = 1; i < vertices.length; i++) {
    const v = vertices[i], s = vertices[startV];
    if (v.x < s.x - EP_TOL ||
        (Math.abs(v.x - s.x) < EP_TOL && v.y < s.y - EP_TOL)) {
      startV = i;
    }
  }
  if (vertices[startV].edges.length === 0) return null;

  // 2. Pick next edge at a vertex given the incoming alpha. Excludes the
  //    edge we came from (prevEdgeIdx, -1 for the very first step).
  function pickNext(fromV: number, alphaIn: number, prevEdgeIdx: number): number {
    const alphaBack = alphaIn + Math.PI;
    let best = -1;
    let bestRel = Infinity;
    for (const ei of vertices[fromV].edges) {
      if (ei === prevEdgeIdx) continue;
      const e = edges[ei];
      const otherV = e.v0 === fromV ? e.v1 : e.v0;
      const dx = vertices[otherV].x - vertices[fromV].x;
      const dy = vertices[otherV].y - vertices[fromV].y;
      const alphaOut = Math.atan2(dy, dx);
      // Signed CCW angle (in atan2 / canvas-Y-down) from back to outgoing.
      // Smallest positive = first edge encountered rotating CCW (= CW in
      // screen) from the back direction → traces the outer face.
      let rel = alphaOut - alphaBack;
      while (rel <= 1e-6) rel += 2 * Math.PI;
      while (rel > 2 * Math.PI) rel -= 2 * Math.PI;
      if (rel < bestRel) { bestRel = rel; best = ei; }
    }
    return best;
  }

  // Fake "incoming from above" at startV → alphaIn = π/2 (south-pointing).
  // alphaBack = -π/2 (north). First step picks the smallest positive CCW
  // angle from north → due east first if available, else southeast, etc.
  const firstEdge = pickNext(startV, Math.PI / 2, -1);
  if (firstEdge < 0) return null;

  const polyIdx: number[] = [startV];
  const edgeWallIds: string[] = [];
  let currentV = startV;
  let currentEdge = firstEdge;

  let safety = edges.length * 4 + 10;
  while (safety-- > 0) {
    const e = edges[currentEdge];
    const nextV = e.v0 === currentV ? e.v1 : e.v0;
    // Record the wall for this edge (the step we just took from currentV).
    edgeWallIds.push(e.wall.id);
    if (nextV === startV) {
      // Closed loop. edgeWallIds.length === polyIdx.length (one wall per edge).
      return {
        verts: polyIdx.map(i => ({ x: vertices[i].x, y: vertices[i].y })),
        edgeWallIds,
      };
    }
    polyIdx.push(nextV);

    const dx = vertices[nextV].x - vertices[currentV].x;
    const dy = vertices[nextV].y - vertices[currentV].y;
    const alphaIn = Math.atan2(dy, dx);

    const nextEdge = pickNext(nextV, alphaIn, currentEdge);
    if (nextEdge < 0) return null;
    currentV = nextV;
    currentEdge = nextEdge;
  }
  return null;
}

// Full footprint trace for a set of walls: cluster shared corners → node any
// T-junctions → walk the outer perimeter → collapse collinear runs. Returns
// the cleaned perimeter plus the set of EVERY wall that lies on the loop
// (collected before the collinear merge so fragments aren't lost) — that set
// is the building's true exterior, derived from geometry rather than the
// manual wall-type tag.
function traceFootprint(walls: Wall[]): { perimeter: TracedPerimeter; loopWallIds: Set<string> } | null {
  if (walls.length < 3) return null;
  const { vertices, edges } = clusterEndpoints(walls);
  const nodedEdges = splitEdgesAtOnEdgeVertices(vertices, edges);
  const traced = traceOuterPerimeter(vertices, nodedEdges);
  if (!traced || traced.verts.length < 3) return null;
  const loopWallIds = new Set(traced.edgeWallIds);
  const perimeter = mergeCollinearPerimeter(traced.verts, traced.edgeWallIds);
  if (perimeter.verts.length < 3) return null;
  return { perimeter, loopWallIds };
}

// The set of wall ids that lie on the traced building perimeter — i.e. the
// walls that are exterior, derived purely from geometry. Prefer tracing the
// structural walls only (partitions are non-structural and never define the
// footprint); fall back to tracing ALL walls when the structural loop can't
// close (fragmented edits). Returns an empty set if no perimeter can be traced.
export function deriveExteriorWallIds(level: { walls: Wall[] }): Set<string> {
  const structural = level.walls.filter(w => w.type !== 'partition');
  const fromStructural = structural.length >= 3 ? traceFootprint(structural) : null;
  if (fromStructural) return fromStructural.loopWallIds;
  const fromAll = traceFootprint(level.walls);
  return fromAll ? fromAll.loopWallIds : new Set<string>();
}

// Offset a closed polygon outward by `distance`. Each output vertex is the
// intersection of the two adjacent edges' parallel-offset lines, so corners
// stay mitered. Auto-detects winding so it works for both CW and CCW polys.
export function offsetPolygonOutward(poly: Vec2[], distance: number): Vec2[] {
  if (poly.length < 3) return poly.slice();
  if (distance === 0) return poly.map(p => ({ x: p.x, y: p.y }));
  const n = poly.length;

  // Signed area in canvas-Y-down. Positive = CW visually.
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    signedArea += (b.x - a.x) * (b.y + a.y);
  }
  const cwInCanvas = signedArea > 0;

  function edgeOutwardNormal(a: Vec2, b: Vec2): Vec2 {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) return { x: 0, y: 0 };
    const ux = dx / L, uy = dy / L;
    return cwInCanvas
      ? { x: -uy, y:  ux }   // CW: outward is left of forward (canvas)
      : { x:  uy, y: -ux };  // CCW: outward is right of forward (canvas)
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const n1 = edgeOutwardNormal(prev, curr);
    const n2 = edgeOutwardNormal(curr, next);

    const p1 = { x: curr.x + n1.x * distance, y: curr.y + n1.y * distance };
    const p2 = { x: curr.x + n2.x * distance, y: curr.y + n2.y * distance };
    const d1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const d2 = { x: next.x - curr.x, y: next.y - curr.y };

    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-6) {
      // Parallel edges (rare — shared by 2 collinear walls). Use the
      // midpoint of the two offset points; no miter needed.
      out.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    } else {
      const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
      out.push({ x: p1.x + t * d1.x, y: p1.y + t * d1.y });
    }
  }
  return out;
}

// Offset a closed polygon outward by a DIFFERENT distance per edge. Each
// output vertex is the miter intersection of the two adjacent offset lines,
// so the corners stay correct even when neighbouring edges push out by
// different amounts. `distances[i]` is the offset for edge i (poly[i]→poly[i+1]).
export function offsetPolygonOutwardPerEdge(poly: Vec2[], distances: number[]): Vec2[] {
  if (poly.length < 3) return poly.slice();
  if (distances.length !== poly.length) {
    // Bail to uniform offset using the first distance — degenerate input.
    return offsetPolygonOutward(poly, distances[0] ?? 0);
  }
  const n = poly.length;

  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    signedArea += (b.x - a.x) * (b.y + a.y);
  }
  const cwInCanvas = signedArea > 0;

  function edgeOutwardNormal(a: Vec2, b: Vec2): Vec2 {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-9) return { x: 0, y: 0 };
    const ux = dx / L, uy = dy / L;
    return cwInCanvas
      ? { x: -uy, y:  ux }
      : { x:  uy, y: -ux };
  }

  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const curr = poly[i];
    const next = poly[(i + 1) % n];
    const dPrev = distances[(i - 1 + n) % n];   // offset of edge prev→curr
    const dNext = distances[i];                  // offset of edge curr→next
    const n1 = edgeOutwardNormal(prev, curr);
    const n2 = edgeOutwardNormal(curr, next);

    const p1 = { x: curr.x + n1.x * dPrev, y: curr.y + n1.y * dPrev };
    const p2 = { x: curr.x + n2.x * dNext, y: curr.y + n2.y * dNext };
    const d1 = { x: curr.x - prev.x, y: curr.y - prev.y };
    const d2 = { x: next.x - curr.x, y: next.y - curr.y };

    const denom = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(denom) < 1e-6) {
      out.push({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 });
    } else {
      const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
      out.push({ x: p1.x + t * d1.x, y: p1.y + t * d1.y });
    }
  }
  return out;
}

export interface RoofFootprint {
  // Wall centerline polygon (closed; first vertex NOT repeated at end).
  centerline: Vec2[];
  // Wall outer face — centerline offset by half the dominant wall thickness.
  // This is the "drip edge of the wall" before adding any overhang.
  wallOuter: Vec2[];
  // Eave line — wallOuter offset by `edgeOverhangs[i]` (per-edge). This is the
  // actual roof outline as seen from above; per-edge so the user can push
  // one wall's soffit out farther than the rest.
  eave: Vec2[];
  // Wall id for each edge of the centerline/wallOuter/eave polygons. Edge i
  // runs from poly[i] to poly[(i+1) % n]. All three polygons share the
  // SAME edge→wall mapping (they're parallel offsets of one another).
  edgeWallIds: string[];
  // Per-edge overhang actually used to build the eave (length n). Defaults
  // to `defaultOverhang` unless a per-wall override is present.
  edgeOverhangs: number[];
  // Average wall thickness used for wallOuter offset (inches).
  wallThickness: number;
  // Default eave overhang (inches) — applied to edges with no override.
  defaultOverhang: number;
}

// Build the full roof footprint geometry for a level + roof settings.
// Returns null if the level has no buildable exterior loop. `overhangByWallId`
// is an optional per-wall overhang override (in inches); edges without an
// entry use `defaultOverhang`.
export function buildRoofFootprint(
  level: Level,
  defaultOverhang: number,
  overhangByWallId?: Readonly<Record<string, number>>,
): RoofFootprint | null {
  // Trace from the structural walls first (partitions never define the
  // footprint). If that loop can't close (a wall edit left fragmented/
  // overlapping stubs that don't meet at the corners), fall back to tracing
  // ALL walls — the perimeter walk hugs the outer face and ignores interior
  // chords/spurs, so exterior is derived purely from geometry.
  const structural = level.walls.filter(w => w.type !== 'partition');
  const result = (structural.length >= 3 ? traceFootprint(structural) : null)
    ?? traceFootprint(level.walls);
  if (!result) return null;

  const centerline = result.perimeter.verts;
  const edgeWallIds = result.perimeter.edgeWallIds;
  // Average thickness over the walls actually ON the perimeter, not every
  // wall on the floor (interior partitions would skew the wall-outer offset).
  const byId = new Map(level.walls.map(w => [w.id, w]));
  const loopWalls = [...result.loopWallIds].map(id => byId.get(id)).filter((w): w is Wall => !!w);
  const avgThickness = loopWalls.length
    ? loopWalls.reduce((s, w) => s + w.thickness, 0) / loopWalls.length
    : 4.5;
  const wallOuter = offsetPolygonOutward(centerline, avgThickness / 2);

  const safeDefault = Math.max(0, defaultOverhang);
  const edgeOverhangs = edgeWallIds.map(id => {
    const override = overhangByWallId?.[id];
    return override != null && Number.isFinite(override) ? Math.max(0, override) : safeDefault;
  });
  const eave = offsetPolygonOutwardPerEdge(wallOuter, edgeOverhangs);

  return {
    centerline,
    wallOuter,
    eave,
    edgeWallIds,
    edgeOverhangs,
    wallThickness: avgThickness,
    defaultOverhang: safeDefault,
  };
}

// Bounding box of an arbitrary point set — used to size the canvas viewBox.
export function bboxOf(points: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (points.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}
