// DXF export for the Sandbox sheet.
//
// Produces ONE AutoCAD-DXF file containing everything on the sheet: every
// block's geometry transformed into a single sheet-world coordinate space
// (inches, Y-up — which is also DXF's convention), on per-category layers, plus
// the shared height-datum lines. DXF (Autodesk's open text interchange format)
// opens natively in AutoCAD and every other CAD tool, with no license or
// dependency — our content (lines / polylines / text on layers) is exactly its
// entity model. See [[project-blueprint-lab-sandbox]].
//
// Coordinate flow per block mirrors the on-screen renderer:
//   • elevation space: (x, y) → (x + offset.x, y + offset.y)
//   • plan space:      (x, y) → (x + offset.x, -y + offset.y)   (Y-flip)
//   • then a rigid rotation of `rotationDeg` about the block's sheet-world
//     `center` (Projected mode). The world rotation that matches the screen
//     rotation is the transform derived in SandboxView (screen Y-down ↔ world
//     Y-up flips the sign).

import { SectionPrimitive, Vec2 } from './types';
import { SheetBlock, SheetLayout, planExportPrimitives } from './sheet';

// Inches of DXF text height per unit of a primitive's `size` (which is authored
// in "paper px at 1×"). 0.5 → an 11-size label ≈ 5.5" tall, a sensible
// architectural label height that the user can restyle in CAD.
const TEXT_IN_PER_SIZE = 0.5;

// ── Occlusion (painter's algorithm for a fill-less line drawing) ──────────────
// On screen an elevation is layered FILLED shapes + WHITE-BACKED hatches, so
// later opaque shapes hide the construction lines beneath them. DXF has no fill,
// so those hidden lines reappear as "awkward overlaps" and hatch outlines show
// as stray boxes. This pass reproduces the visible result: drop hatch outlines,
// and clip every line/edge to the parts NOT covered by a LATER opaque mask
// (a hatch's white backing, or a closed polyline with a fill colour).
const OCC_EPS = 0.25;   // inches; a point this close to a mask edge counts as visible (so coincident outlines survive)

const lerpV = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > p.y) !== (b.y > p.y)) && (p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}
function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function minDistToPoly(p: Vec2, poly: Vec2[]): number {
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, distPointSeg(p, poly[j], poly[i]));
  return m;
}
// Param t along a→b where it crosses segment c→d, or null.
function segSegT(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return Math.max(0, Math.min(1, t));
}
// Sub-ranges of a→b that are NOT hidden inside any mask polygon.
function visibleRanges(a: Vec2, b: Vec2, masks: Vec2[][]): [number, number][] {
  const cuts = [0, 1];
  for (const poly of masks) for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const t = segSegT(a, b, poly[j], poly[i]);
    if (t !== null) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const uniq: number[] = [];
  for (const t of cuts) if (!uniq.length || t - uniq[uniq.length - 1] > 1e-6) uniq.push(t);
  const out: [number, number][] = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    const t0 = uniq[i], t1 = uniq[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const mid = lerpV(a, b, (t0 + t1) / 2);
    const covered = masks.some(poly => pointInPoly(mid, poly) && minDistToPoly(mid, poly) > OCC_EPS);
    if (covered) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - t0) < 1e-6) last[1] = t1;
    else out.push([t0, t1]);
  }
  return out;
}

// Reproduce the visible linework of a block's primitive list as a fill-less
// line drawing: hatch outlines dropped; every line / polyline-edge clipped to
// the parts outside any LATER opaque mask. No-op for blocks without masks
// (sections, the floor plan), so they pass through untouched.
export function occludePrimitives(prims: SectionPrimitive[]): SectionPrimitive[] {
  const masks: { poly: Vec2[]; i: number }[] = [];
  prims.forEach((p, i) => {
    // Only OPAQUE WHITE masks hide what's behind them: hatch backings and
    // `'trim'`-filled shells (wall body, casing, corner boards, gable trim).
    // Colour fills ('glass' / 'door' / 'panel') are see-through CONTENT, not
    // masks — treating glass as a mask was clipping the window's own pane edges
    // and muntins (windows exported missing their inner frame).
    if (p.kind === 'hatch') masks.push({ poly: p.verts, i });
    else if (p.kind === 'polyline' && p.closed && p.fill === 'trim') masks.push({ poly: p.verts, i });
  });
  if (!masks.length) return prims;
  const out: SectionPrimitive[] = [];
  prims.forEach((p, i) => {
    if (p.kind === 'hatch') return;   // fill region, not linework
    const later = masks.filter(m => m.i > i).map(m => m.poly);
    if (!later.length) { out.push(p); return; }
    if (p.kind === 'line') {
      for (const [t0, t1] of visibleRanges(p.a, p.b, later))
        out.push({ ...p, id: `${p.id}~${out.length}`, a: lerpV(p.a, p.b, t0), b: lerpV(p.a, p.b, t1) });
      return;
    }
    if (p.kind === 'polyline') {
      const v = p.verts, m = p.closed ? v.length : v.length - 1;
      const lineStyle = p.style === 'sheathing' ? 'sheathing' : 'normal';
      for (let k = 0; k < m; k++) {
        const a = v[k], b = v[(k + 1) % v.length];
        for (const [t0, t1] of visibleRanges(a, b, later))
          out.push({ id: `${p.id}~e${k}_${out.length}`, kind: 'line', a: lerpV(a, b, t0), b: lerpV(a, b, t1), style: lineStyle });
      }
      return;
    }
    out.push(p);   // text / dims — annotations, not occluded
  });
  return out;
}

// ── Per-block coordinate transform ────────────────────────────────────────────
// Exported so the PDF exporter (pdf.ts) shares the exact same block→sheet-world
// mapping — keeping the two export formats geometrically identical.
export function transformPoint(pt: Vec2, block: SheetBlock): Vec2 {
  let x = pt.x + block.offset.x;
  let y = block.space === 'plan' ? -pt.y + block.offset.y : pt.y + block.offset.y;
  const deg = block.rotationDeg || 0;
  if (deg) {
    const t = (deg * Math.PI) / 180;
    const c = Math.cos(t), s = Math.sin(t);
    const u = x - block.center.x, v = y - block.center.y;
    // World transform matching the screen ctx.rotate(deg) (Y-down) under the
    // Y-up sheet: x' = cx + u·cos + v·sin ; y' = cy − u·sin + v·cos.
    x = block.center.x + u * c + v * s;
    y = block.center.y - u * s + v * c;
  }
  return { x, y };
}

// ── DXF group-code emitters ───────────────────────────────────────────────────
function g(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

function dxfLine(a: Vec2, b: Vec2, layer: string): string {
  return g(0, 'LINE') + g(8, layer)
    + g(10, a.x.toFixed(4)) + g(20, a.y.toFixed(4)) + g(30, '0')
    + g(11, b.x.toFixed(4)) + g(21, b.y.toFixed(4)) + g(31, '0');
}

// Classic R12 POLYLINE (+ VERTEX/SEQEND). LWPOLYLINE doesn't exist in R12, and
// R12 is the format we target for maximum AutoCAD compatibility. The `66 1`
// flag declares that vertices follow; the header point (10/20/30) is a required
// placeholder; group 70 bit 1 = closed.
function dxfPolyline(verts: Vec2[], closed: boolean, layer: string): string {
  if (verts.length < 2) return '';
  let out = g(0, 'POLYLINE') + g(8, layer) + g(66, 1) + g(70, closed ? 1 : 0)
    + g(10, '0') + g(20, '0') + g(30, '0');
  for (const v of verts) {
    out += g(0, 'VERTEX') + g(8, layer)
      + g(10, v.x.toFixed(4)) + g(20, v.y.toFixed(4)) + g(30, '0');
  }
  out += g(0, 'SEQEND') + g(8, layer);
  return out;
}

// DXF group-1 strings must be plain ASCII — the file is written UTF-8, and
// AutoCAD reads it in its code page, so a non-ASCII glyph like '×' turns into
// mojibake ("Ã—") or a missing-glyph box. Map the few symbols we emit to ASCII
// equivalents (× → x, primes/quotes → ' ", dashes → -, ° → deg) and drop
// anything else outside printable ASCII.
function toAscii(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/[×✕✖]/g, 'x')
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/°/g, ' deg')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

// Vertical justification (DXF group 73): 0 baseline, 1 bottom, 2 middle, 3 top.
function valignFor(baseline?: 'top' | 'middle' | 'bottom'): number {
  return baseline === 'top' ? 3 : baseline === 'middle' ? 2 : baseline === 'bottom' ? 1 : 0;
}

function dxfText(at: Vec2, content: string, heightIn: number, rotationDeg: number, layer: string, align?: 'left' | 'center' | 'right', valign = 0): string {
  const text = toAscii(content);
  if (!text) return '';
  const halign = align === 'center' ? 1 : align === 'right' ? 2 : 0;
  let out = g(0, 'TEXT') + g(8, layer)
    + g(10, at.x.toFixed(4)) + g(20, at.y.toFixed(4)) + g(30, '0')
    + g(40, heightIn.toFixed(4)) + g(1, text) + g(50, rotationDeg.toFixed(2));
  // When the text isn't plain left-BASELINE, DXF reads the justification from
  // 72/73 and places the text at the SECOND alignment point (11/21) — without
  // this, every label falls back to baseline-left and sits mis-positioned.
  if (halign || valign) {
    out += g(72, halign) + g(73, valign)
      + g(11, at.x.toFixed(4)) + g(21, at.y.toFixed(4)) + g(31, '0');
  }
  return out;
}

// Text rotation (DXF, CCW degrees) that matches the block's screen rotation.
function textRotationFor(block: SheetBlock): number {
  return (360 - (block.rotationDeg || 0)) % 360;
}

// ── One primitive → DXF entities ──────────────────────────────────────────────
function primToDxf(p: SectionPrimitive, block: SheetBlock, layer: string): string {
  const tp = (pt: Vec2) => transformPoint(pt, block);
  switch (p.kind) {
    case 'line':
      return dxfLine(tp(p.a), tp(p.b), layer);
    case 'dimLinear':
      return dxfLine(tp(p.a), tp(p.b), layer);     // v1: the measured segment
    case 'polyline':
      return dxfPolyline(p.verts.map(tp), p.closed, layer);
    case 'hatch':
      return dxfPolyline(p.verts.map(tp), true, layer);   // outline only (no fill)
    case 'dimChain':
      return dxfLine(tp({ x: p.xIn, y: p.y1In }), tp({ x: p.xIn, y: p.y2In }), layer);
    case 'toLine':
      return dxfLine(tp({ x: p.leftXIn, y: p.yIn }), tp({ x: p.rightXIn, y: p.yIn }), layer)
        + dxfText(tp({ x: p.leftXIn, y: p.yIn }), p.label, 9 * TEXT_IN_PER_SIZE, textRotationFor(block), layer, 'left');
    case 'text':
      return dxfText(tp(p.at), p.content, (p.size ?? 11) * TEXT_IN_PER_SIZE, textRotationFor(block), layer, p.align, valignFor(p.baseline));
    case 'pitchSymbol':
      return '';   // skipped in v1
    default:
      return '';
  }
}

// Layer name for a block (and a stable colour per layer).
function layerOf(block: SheetBlock): string {
  if (block.id.startsWith('elevation-')) return 'ELEVATIONS';
  if (block.id.startsWith('section-')) return 'SECTIONS';
  if (block.id === 'roof-plan' || block.id.startsWith('roof-')) return 'ROOF_PLAN';
  if (block.id === 'floor-plan' || block.id.startsWith('plan-')) return 'FLOOR_PLAN';
  return 'SHEET';
}

const LAYER_COLORS: Record<string, number> = {
  FLOOR_PLAN: 7, ROOF_PLAN: 5, ELEVATIONS: 3, SECTIONS: 4, DATUMS: 1, SHEET: 8,
};

// ── Assemble the full DXF ─────────────────────────────────────────────────────
export function buildSheetDxf(sheet: SheetLayout): string {
  const entities: string[] = [];
  const usedLayers = new Set<string>();

  for (const block of sheet.blocks) {
    const layer = layerOf(block);
    usedLayers.add(layer);
    // Plan-scene blocks carry their export primitives (walls + lines + labels
    // + section cut lines); fall back to deriving them from the level.
    const rawPrims = block.kind === 'plan-scene'
      ? (block.primitives ?? (block.level ? planExportPrimitives(block.level) : []))
      : (block.primitives ?? []);
    // Strip fills/hatches down to visible linework so the no-fill DXF doesn't
    // show construction lines that the on-screen fills/hatches masked.
    const prims = occludePrimitives(rawPrims);
    for (const p of prims) {
      const e = primToDxf(p, block, layer);
      if (e) entities.push(e);
    }
  }

  // (The blue height-datum reference lines were removed — the elevations carry
  // their own T/O PLATE / GRADE / floor markers, so they're not exported.)

  // TABLES — declare every used layer (AutoCAD wants them defined).
  let tables = g(0, 'SECTION') + g(2, 'TABLES') + g(0, 'TABLE') + g(2, 'LAYER') + g(70, usedLayers.size);
  for (const name of usedLayers) {
    tables += g(0, 'LAYER') + g(2, name) + g(70, 0) + g(62, LAYER_COLORS[name] ?? 7) + g(6, 'CONTINUOUS');
  }
  tables += g(0, 'ENDTAB') + g(0, 'ENDSEC');

  const ents = g(0, 'SECTION') + g(2, 'ENTITIES') + entities.join('') + g(0, 'ENDSEC');

  // HEADER: target AutoCAD R12 (AC1009). A minimal R12 file is COMPLETE and
  // valid — unlike R2000+, it needs no OBJECTS/CLASSES sections or full table
  // set — so AutoCAD opens it cleanly instead of auditing and dropping content.
  // $EXTMIN/$EXTMAX (from the sheet bbox, = our DXF coords) give a sane initial
  // view so the drawing is framed on open / Zoom-Extents.
  const b = sheet.bounds;
  const ext = b
    ? g(9, '$EXTMIN') + g(10, b.minX.toFixed(4)) + g(20, b.minY.toFixed(4)) + g(30, '0')
      + g(9, '$EXTMAX') + g(10, b.maxX.toFixed(4)) + g(20, b.maxY.toFixed(4)) + g(30, '0')
    : '';
  // Geometry is authored 1:1 in INCHES (a 20' wall = 240 units). $INSUNITS = 1
  // tags the drawing as inches so it imports at true scale (no unit scaling),
  // and $MEASUREMENT = 0 keeps it imperial.
  const header = g(0, 'SECTION') + g(2, 'HEADER')
    + g(9, '$ACADVER') + g(1, 'AC1009')
    + g(9, '$INSBASE') + g(10, '0') + g(20, '0') + g(30, '0')
    + g(9, '$INSUNITS') + g(70, 1)
    + g(9, '$MEASUREMENT') + g(70, 0)
    + ext
    + g(0, 'ENDSEC');

  return header + tables + ents + g(0, 'EOF');
}
