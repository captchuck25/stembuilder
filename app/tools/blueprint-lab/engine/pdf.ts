// Vector-PDF export for the Sandbox sheet.
//
// Produces ONE PDF containing everything on the sheet, drawn at TRUE 1:1 SCALE
// (1 drawing inch = 1 PDF inch). It is an exchange file for CAD / vector tools,
// not a print layout — print sizing/title-blocks are handled separately. See
// [[project-blueprint-lab-sandbox]].
//
// Why a separate path from dxf.ts even though both walk the same primitives:
// DXF has no fills, so dxf.ts runs an OCCLUSION pass to fake the on-screen
// layered look by clipping hidden lines. PDF *has* fills, so here we simply
// paint primitives in document order (painter's algorithm) — reproducing the
// elevation's filled poché, glass, door slabs, hatches and line weights
// exactly as they read on screen. The block→sheet-world transform is shared
// with dxf.ts (transformPoint) so the two exports are geometrically identical.
//
// Coordinate flow: transformPoint() yields sheet-world inches, Y-UP. PDF space
// is Y-DOWN from the top-left, so we map (wx, wy) → (wx - minX + M, maxY - wy + M)
// where M is a small margin and the page is sized to the sheet bounds + 2·M.

import type { jsPDF } from 'jspdf';
import { SectionPrimitive, Vec2, SectionLineStyle, SectionPolyStyle, DrawingFillStyle, formatImperial } from './types';
import { SheetBlock, SheetLayout, planExportPrimitives } from './sheet';
import { transformPoint } from './dxf';
import { T } from './theme';

// Inches of PDF text height per unit of a primitive's `size` — matches dxf.ts's
// TEXT_IN_PER_SIZE so labels plot at the same height in both exports.
const TEXT_IN_PER_SIZE = 0.5;
// SVG/canvas stroke widths are authored in screen pixels (non-scaling-stroke).
// Convert to a plotted lineweight in inches: 1px → 0.01" keeps the relative
// hierarchy (thin 0.6 → 0.006", normal 1 → 0.01", thick 2 → 0.02").
const LW_IN_PER_PX = 0.01;
const PAGE_MARGIN_IN = 1;          // white border around the sheet bounds
const HATCH_LINE_IN = 0.4 * LW_IN_PER_PX * 2;  // faint hatch lineweight (~0.008")

// ── Style → stroke attributes (mirrors ElevationsView.strokeFor) ──────────────
function strokeFor(style: SectionLineStyle | SectionPolyStyle): { color: string; widthPx: number; dash?: number[] } {
  switch (style) {
    case 'thin':   return { color: T.ink,      widthPx: 0.6 };
    case 'thick':  return { color: T.ink,      widthPx: 2 };
    case 'dashed': return { color: T.inkMuted, widthPx: 0.6, dash: [2, 4] };
    case 'dotted': return { color: T.inkMuted, widthPx: 0.6, dash: [1, 2] };
    case 'hidden': return { color: T.inkMuted, widthPx: 0.6, dash: [4, 2] };
    case 'center': return { color: T.inkMuted, widthPx: 0.6, dash: [6, 3, 1, 3] };
    case 'ridge':  return { color: T.ink,      widthPx: 2 };
    case 'hip':    return { color: T.ink,      widthPx: 1.6 };
    case 'valley': return { color: T.inkMuted, widthPx: 1.6, dash: [6, 3] };
    default:       return { color: T.ink,      widthPx: 1 };   // normal/solid/sheathing/arrow
  }
}

// Closed-polyline fill colour (mirrors ElevationsView.fillColor). null = no fill.
function fillFor(fill: DrawingFillStyle | undefined): string | null {
  switch (fill) {
    case 'trim':  return '#ffffff';
    case 'glass': return '#d6dff3';
    case 'panel': return '#eae6db';
    case 'door':  return '#cdd2d9';
    default:      return null;
  }
}

function textColorFor(color?: 'ink' | 'inkSoft' | 'inkMuted'): string {
  return color === 'inkSoft' ? T.inkSoft : color === 'inkMuted' ? T.inkMuted : T.ink;
}

// PDF text (helvetica/WinAnsi) handles most glyphs; map the few unicode symbols
// we emit to safe equivalents so labels don't render as boxes.
function cleanText(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/[×✕✖]/g, 'x')
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .trim();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── Hatch patterns → families of parallel lines (pattern-local inches) ────────
// Each entry: horizontal-line spacing (h) and/or vertical-line spacing (v).
// 'stucco' is a stippled fill that doesn't translate to clean lines → backing
// only. 'blank' is a white mask → backing only.
const HATCH_LINES: Record<string, { h?: number; v?: number }> = {
  'lap-siding':    { h: 6 },
  'board-batten':  { v: 16 },
  'brick':         { h: 2.5, v: 8 },
  'stone':         { h: 8, v: 12 },
  'shake':         { h: 8, v: 5 },
  'roof-shingles': { h: 6, v: 12 },
  'stucco':        {},
  'blank':         {},
};

// ── Polygon clipping for hatch lines (no PDF clip API needed) ─────────────────
function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > p.y) !== (b.y > p.y)) && (p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
function segSegT(a: Vec2, b: Vec2, c: Vec2, d: Vec2): number | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return Math.max(0, Math.min(1, t));
}
// Sub-segments of a→b that fall INSIDE poly.
function clipToPoly(a: Vec2, b: Vec2, poly: Vec2[]): [Vec2, Vec2][] {
  const cuts = [0, 1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const t = segSegT(a, b, poly[j], poly[i]);
    if (t !== null) cuts.push(t);
  }
  cuts.sort((x, y) => x - y);
  const out: [Vec2, Vec2][] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const t0 = cuts[i], t1 = cuts[i + 1];
    if (t1 - t0 < 1e-6) continue;
    if (pointInPoly(lerp(a, b, (t0 + t1) / 2), poly)) out.push([lerp(a, b, t0), lerp(a, b, t1)]);
  }
  return out;
}

// Generate the clipped hatch lines for one filled region (pattern verts in
// sheet-world inches). Returns line segments in sheet-world inches.
function hatchSegments(verts: Vec2[], pattern: string, angle = 0): [Vec2, Vec2][] {
  const spec = HATCH_LINES[pattern];
  if (!spec || (!spec.h && !spec.v)) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of verts) { minX = Math.min(minX, v.x); minY = Math.min(minY, v.y); maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const diag = Math.hypot(maxX - minX, maxY - minY) / 2 + 1;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // A line in pattern-local frame, offset `d` along the local Y (for h lines) or
  // local X (for v lines), spanning ±diag, rotated by `angle` about the centroid.
  const local = (lx: number, ly: number): Vec2 => ({ x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos });
  const segs: [Vec2, Vec2][] = [];
  const add = (a: Vec2, b: Vec2) => { for (const s of clipToPoly(a, b, verts)) segs.push(s); };
  if (spec.h) for (let d = -diag; d <= diag; d += spec.h) add(local(-diag, d), local(diag, d));
  if (spec.v) for (let d = -diag; d <= diag; d += spec.v) add(local(d, -diag), local(d, diag));
  return segs;
}

// ── Drawing helpers (operate in PDF inches) ───────────────────────────────────
type ToPdf = (p: Vec2) => Vec2;

function applyStroke(doc: jsPDF, s: { color: string; widthPx: number; dash?: number[] }) {
  doc.setDrawColor(...hexToRgb(s.color));
  doc.setLineWidth(s.widthPx * LW_IN_PER_PX);
  doc.setLineDashPattern(s.dash ?? [], 0);
}

function strokePolyline(doc: jsPDF, pts: Vec2[], closed: boolean) {
  if (pts.length < 2) return;
  const deltas = pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y] as [number, number]);
  doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], 'S', closed);
}

function fillStrokePolygon(doc: jsPDF, pts: Vec2[], fillHex: string | null, stroke: { color: string; widthPx: number; dash?: number[] } | null) {
  if (pts.length < 2) return;
  const deltas = pts.slice(1).map((p, i) => [p.x - pts[i].x, p.y - pts[i].y] as [number, number]);
  let style: 'S' | 'F' | 'DF' | null = null;
  if (fillHex && stroke) style = 'DF';
  else if (fillHex) style = 'F';
  else if (stroke) style = 'S';
  if (!style) return;
  if (fillHex) doc.setFillColor(...hexToRgb(fillHex));
  if (stroke) applyStroke(doc, stroke);
  doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], style, true);
}

// ── One primitive → PDF ───────────────────────────────────────────────────────
function drawPrim(doc: jsPDF, p: SectionPrimitive, block: SheetBlock, toPdf: ToPdf) {
  const tp = (pt: Vec2) => toPdf(transformPoint(pt, block));
  switch (p.kind) {
    case 'line': {
      applyStroke(doc, strokeFor(p.style));
      const a = tp(p.a), b = tp(p.b);
      doc.line(a.x, a.y, b.x, b.y);
      return;
    }
    case 'polyline': {
      const pts = p.verts.map(tp);
      const fill = fillFor(p.fill);
      if (p.closed) {
        fillStrokePolygon(doc, pts, fill, p.noStroke ? null : strokeFor(p.style));
      } else {
        applyStroke(doc, strokeFor(p.style));
        strokePolyline(doc, pts, false);
      }
      return;
    }
    case 'hatch': {
      // White opaque backing (matches the on-screen wall shell / mask), then the
      // clipped pattern lines on top.
      const wpts = p.verts.map(v => transformPoint(v, block));
      fillStrokePolygon(doc, wpts.map(toPdf), '#ffffff', null);
      const segs = hatchSegments(wpts, p.pattern, p.angle ?? 0);
      if (segs.length) {
        applyStroke(doc, { color: '#565c75', widthPx: 0.4, dash: [] });
        doc.setLineWidth(HATCH_LINE_IN);
        for (const [a, b] of segs) { const pa = toPdf(a), pb = toPdf(b); doc.line(pa.x, pa.y, pb.x, pb.y); }
      }
      return;
    }
    case 'text': {
      drawText(doc, tp(p.at), p.content, (p.size ?? 11) * TEXT_IN_PER_SIZE, textAngleFor(block, p.angle), textColorFor(p.color), p.align, p.baseline);
      return;
    }
    case 'dimLinear':
      drawDimLinear(doc, transformPoint(p.a, block), transformPoint(p.b, block), p.offset, toPdf);
      return;
    case 'toLine': {
      applyStroke(doc, strokeFor('thin'));
      const a = tp({ x: p.leftXIn, y: p.yIn }), b = tp({ x: p.rightXIn, y: p.yIn });
      doc.line(a.x, a.y, b.x, b.y);
      drawText(doc, a, p.label, 9 * TEXT_IN_PER_SIZE, textAngleFor(block, 0), T.ink, 'left', 'bottom');
      return;
    }
    case 'dimChain': {
      applyStroke(doc, strokeFor('thin'));
      const a = tp({ x: p.xIn, y: p.y1In }), b = tp({ x: p.xIn, y: p.y2In });
      doc.line(a.x, a.y, b.x, b.y);
      return;
    }
    // pitchSymbol — skipped (matches dxf.ts v1).
  }
}

// jsPDF rotates text counter-clockwise for positive angle; screen/block rotation
// is clockwise (Y-down). 360 − blockRot matches dxf.ts's textRotationFor; the
// per-prim angle (radians, screen CW) subtracts likewise.
function textAngleFor(block: SheetBlock, primAngleRad = 0): number {
  return (360 - (block.rotationDeg || 0) - (primAngleRad * 180) / Math.PI) % 360;
}

function drawText(
  doc: jsPDF, at: Vec2, content: string, heightIn: number, angleDeg: number,
  color: string, align?: 'left' | 'center' | 'right', baseline?: 'top' | 'middle' | 'bottom',
) {
  const text = cleanText(content);
  if (!text) return;
  doc.setTextColor(...hexToRgb(color));
  doc.setFontSize(heightIn * 72);   // jsPDF font size is points (1/72")
  doc.text(text, at.x, at.y, {
    align: align ?? 'left',
    baseline: baseline === 'top' ? 'top' : baseline === 'middle' ? 'middle' : baseline === 'bottom' ? 'bottom' : 'alphabetic',
    angle: angleDeg,
  });
}

// Linear dimension — extension lines, dim line, 45° arch ticks, rotated label.
// Mirrors ElevationsView.DimLinearNode but computed directly in PDF (Y-down)
// space, which shares handedness with that node's flipped working space.
const DIM_TICK_HALF = 4;   // inches
const DIM_FONT_IN = 11 * TEXT_IN_PER_SIZE;
function drawDimLinear(doc: jsPDF, aW: Vec2, bW: Vec2, offset: number, toPdf: ToPdf) {
  const len = Math.hypot(bW.x - aW.x, bW.y - aW.y);
  if (len === 0) return;
  // World (Y-up) perpendicular, offset both ends, then map to PDF.
  const nx = -(bW.y - aW.y) / len, ny = (bW.x - aW.x) / len;
  const daW = { x: aW.x + nx * offset, y: aW.y + ny * offset };
  const dbW = { x: bW.x + nx * offset, y: bW.y + ny * offset };
  const a = toPdf(aW), b = toPdf(bW), da = toPdf(daW), db = toPdf(dbW);

  applyStroke(doc, { color: T.ink, widthPx: 0.8, dash: [] });
  doc.line(a.x, a.y, da.x, da.y);                 // extension lines
  doc.line(b.x, b.y, db.x, db.y);
  doc.setLineWidth(1.1 * LW_IN_PER_PX);
  doc.line(da.x, da.y, db.x, db.y);               // dim line
  const ang = Math.atan2(db.y - da.y, db.x - da.x);
  const tdx = Math.cos(ang + Math.PI / 4) * DIM_TICK_HALF;
  const tdy = Math.sin(ang + Math.PI / 4) * DIM_TICK_HALF;
  doc.setLineWidth(1.4 * LW_IN_PER_PX);
  doc.line(da.x - tdx, da.y - tdy, da.x + tdx, da.y + tdy);   // 45° ticks
  doc.line(db.x - tdx, db.y - tdy, db.x + tdx, db.y + tdy);

  let deg = (ang * 180) / Math.PI;
  if (deg > 90 || deg < -90) deg += 180;          // keep label upright
  const mid = { x: (da.x + db.x) / 2, y: (da.y + db.y) / 2 };
  // Nudge the label off the dim line (perp), like the node's dy=-3.
  const off = 3, ox = Math.sin((deg * Math.PI) / 180) * off, oy = -Math.cos((deg * Math.PI) / 180) * off;
  doc.setFont('helvetica', 'bold');
  drawText(doc, { x: mid.x + ox, y: mid.y + oy }, formatImperial(len), DIM_FONT_IN, (360 - deg) % 360, T.ink, 'center', 'bottom');
  doc.setFont('helvetica', 'normal');
}

// PDF pages cannot exceed 14400 pt = 200 inches in either dimension (the format
// limit jsPDF enforces). A real building sheet at true 1:1 easily exceeds that,
// so we stay at 1:1 whenever the sheet fits and otherwise scale DOWN uniformly
// to the largest factor that fits — geometry positions scale, but plotted
// lineweights / text / dim-ticks stay absolute (constant, legible) inches. The
// scale factor is printed on the sheet so the drawing can be rescaled by 1/k on
// CAD import and remain dimensionally exact.
const PDF_MAX_IN = 199;   // 1" under the hard 200" limit for safety

// ── Assemble the full PDF ─────────────────────────────────────────────────────
export async function buildSheetPdf(sheet: SheetLayout): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const b = sheet.bounds;
  const M = PAGE_MARGIN_IN;
  const spanX = b ? b.maxX - b.minX : 9;
  const spanY = b ? b.maxY - b.minY : 6.5;
  // Largest scale ≤ 1 that fits the bounds (+margins) on a valid page.
  const avail = PDF_MAX_IN - 2 * M;
  const k = Math.min(1, avail / Math.max(spanX, 1e-6), avail / Math.max(spanY, 1e-6));

  const W = spanX * k + 2 * M;
  const H = spanY * k + 2 * M;
  const doc = new jsPDF({ orientation: W >= H ? 'landscape' : 'portrait', unit: 'in', format: [W, H] });
  doc.setFont('helvetica', 'normal');
  doc.setLineCap('butt');
  doc.setLineJoin('miter');

  // Sheet-world (Y-up inches) → PDF page (Y-down inches), scaled by k.
  const toPdf: ToPdf = b
    ? (p: Vec2) => ({ x: (p.x - b.minX) * k + M, y: (b.maxY - p.y) * k + M })
    : (p: Vec2) => ({ x: p.x * k + M, y: H - p.y * k - M });

  for (const block of sheet.blocks) {
    const rawPrims = block.kind === 'plan-scene'
      ? (block.primitives ?? (block.level ? planExportPrimitives(block.level) : []))
      : (block.primitives ?? []);
    for (const p of rawPrims) drawPrim(doc, p, block, toPdf);
  }

  // Scale note (bottom-left of the page, in the margin). At k=1 it reads "1:1";
  // otherwise it states the exact factor to rescale by in CAD.
  const note = k >= 0.99999
    ? 'SCALE 1:1  (true size, 1 drawing inch = 1 PDF inch)'
    : `SCALE 1:${(1 / k).toFixed(4)}  (page exceeds PDF 200" limit at 1:1 — rescale by ${(1 / k).toFixed(4)}x on CAD import for true size)`;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...hexToRgb(T.inkSoft));
  doc.setFontSize(9);
  doc.text(note, M, H - M * 0.35, { align: 'left', baseline: 'bottom' });

  return doc.output('blob');
}
