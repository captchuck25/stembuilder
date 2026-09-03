// Printable architectural portfolio — multi-page vector PDF.
//
// Legal 8.5×14 LANDSCAPE, one drawing per page (elevations two-up) inside a
// classic double-line border + bottom title strip (student / school / project /
// date / sheet number, e.g. "A-1 FLOOR PLAN"). Geometry plots at a STANDARD
// architectural scale — the largest of 1/2"…1/32" = 1'-0" that fits the page
// frame — noted in each view's caption, so the printed sheet measures true
// with an architect's scale ruler. See docs/BLUEPRINT_LAB_ASSIGNMENTS_PLAN.md
// ("Printable architectural portfolio").
//
// Content comes from the same generators as the Sandbox sheet (gatherRaw) and
// draws through the shared vector renderer (renderBlocksToPdf) with print
// floors on lineweights/text so small plot scales stay legible. Furniture —
// which the CAD exchange export deliberately omits — is added here as simple
// drafting rectangles, because a furnished plan is the point of the keepsake.

import type { jsPDF } from 'jspdf';
import { FurnitureItem, Level, Project, SectionPrimitive, Vec2 } from './types';
import { RawBlocks, SheetBlock, SheetBounds, gatherRaw } from './sheet';
import { ToPdf, renderBlocksToPdf } from './pdf';
import { SHELLS, ShellVariant, allowedShellVariants, parseShellIds, shellOutline, shellStats } from './shells';
import { T } from './theme';

export interface PortfolioFields {
  student: string;
  school: string;
  project: string;
  date: string;
}
export interface PortfolioInclude {
  elevations: boolean;
  sections: boolean;
  roof: boolean;
}

// Page geometry (inches, legal landscape).
const PAGE_W = 14;
const PAGE_H = 8.5;
const BORDER_OUT = 0.28;   // thick outer border inset
const BORDER_IN = 0.36;    // thin inner border inset
const TITLE_H = 0.82;      // title-block strip height (inside the inner border)
const FRAME_PAD = 0.16;    // padding between inner border and drawing frame
const CAPTION_H = 0.34;    // caption line reserved under each drawing

// Print floors passed to the shared renderer (see pdf.ts).
const PRINT_MIN_LW = 0.005;   // in/px → normal-weight lines ≥ 0.005"
const PRINT_MIN_TEXT = 0.075; // size-11 labels ≥ 0.075" (~5.4 pt)

// Standard architectural scales, largest first. k = plot inches per world inch.
const ARCH_SCALES: { k: number; label: string }[] = [
  { k: 1 / 24,  label: '1/2" = 1\'-0"'  },
  { k: 1 / 32,  label: '3/8" = 1\'-0"'  },
  { k: 1 / 48,  label: '1/4" = 1\'-0"'  },
  { k: 1 / 64,  label: '3/16" = 1\'-0"' },
  { k: 1 / 96,  label: '1/8" = 1\'-0"'  },
  { k: 1 / 128, label: '3/32" = 1\'-0"' },
  { k: 1 / 192, label: '1/16" = 1\'-0"' },
  { k: 1 / 384, label: '1/32" = 1\'-0"' },
];
function pickScale(fitK: number): { k: number; label: string } {
  for (const s of ARCH_SCALES) if (s.k <= fitK + 1e-9) return s;
  return { k: fitK, label: `1:${Math.round(1 / Math.max(fitK, 1e-9))}` };
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// ── Furniture → drafting rectangles ───────────────────────────────────────────
function furniturePrims(level: Level): SectionPrimitive[] {
  const out: SectionPrimitive[] = [];
  let n = 0;
  const rect = (f: FurnitureItem): Vec2[] => {
    const c = Math.cos(f.rotation), s = Math.sin(f.rotation);
    const hw = f.width / 2, hd = f.depth / 2;
    const pt = (sx: number, sy: number): Vec2 => ({
      x: f.position.x + sx * hw * c - sy * hd * s,
      y: f.position.y + sx * hw * s + sy * hd * c,
    });
    return [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)];
  };
  for (const f of level.furniture) {
    out.push({ id: `pf-furn-${n++}`, kind: 'polyline', verts: rect(f), closed: true, style: 'thin' });
  }
  return out;
}

// ── Blocks placed at the sheet origin (offset 0, no rotation) ─────────────────
// transformPoint then reduces to identity (elevation) or a pure Y-flip (plan),
// and the page mapping in drawView does the fit/center.
function blockAtOrigin(space: 'plan' | 'elevation', prims: SectionPrimitive[], lb: SheetBounds): SheetBlock {
  const sheetBounds: SheetBounds = space === 'plan'
    ? { minX: lb.minX, maxX: lb.maxX, minY: -lb.maxY, maxY: -lb.minY }
    : { ...lb };
  return {
    id: 'portfolio-view', title: '', space, kind: 'primitives', primitives: prims,
    offset: { x: 0, y: 0 }, rotationDeg: 0, center: { x: 0, y: 0 },
    localBounds: lb, sheetBounds,
  };
}

interface Frame { x: number; y: number; w: number; h: number; }

// Fit factor for a block inside a frame.
function fitK(block: SheetBlock, frame: Frame): number {
  const sb = block.sheetBounds;
  const spanX = Math.max(sb.maxX - sb.minX, 1e-6);
  const spanY = Math.max(sb.maxY - sb.minY, 1e-6);
  return Math.min(frame.w / spanX, frame.h / spanY);
}

// Sheet-world → page mapping that centers a block in its frame at scale k.
function toPdfFor(block: SheetBlock, frame: Frame, k: number): ToPdf {
  const sb = block.sheetBounds;
  const spanX = sb.maxX - sb.minX;
  const spanY = sb.maxY - sb.minY;
  const ox = frame.x + (frame.w - spanX * k) / 2;
  const oy = frame.y + (frame.h - spanY * k) / 2;
  return p => ({ x: ox + (p.x - sb.minX) * k, y: oy + (sb.maxY - p.y) * k });
}

// Caption — bold title + scale note, centered under the frame, underlined.
function drawCaption(doc: jsPDF, frame: Frame, caption: string) {
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...rgb(T.ink));
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h + 0.21;
  doc.text(caption, cx, cy, { align: 'center', baseline: 'middle' });
  const tw = doc.getTextWidth(caption);
  doc.setDrawColor(...rgb(T.ink));
  doc.setLineWidth(0.014);
  doc.line(cx - tw / 2, cy + 0.09, cx + tw / 2, cy + 0.09);
  doc.setFont('helvetica', 'normal');
}

// Draw one view centered in its frame at scale k, with a caption underneath.
function drawView(doc: jsPDF, block: SheetBlock, frame: Frame, k: number, caption: string) {
  renderBlocksToPdf(doc, [block], toPdfFor(block, frame, k), {
    scale: k, minLwInPerPx: PRINT_MIN_LW, minTextIn: PRINT_MIN_TEXT,
  });
  drawCaption(doc, frame, caption);
}

// ── Page chrome: borders + title strip. Returns the drawing content frame. ────
function pageChrome(doc: jsPDF, fields: PortfolioFields, sheetNo: string, sheetTitle: string, scaleNote = 'AS NOTED'): Frame {
  const ink = rgb(T.ink);
  doc.setLineDashPattern([], 0);
  // Double border — thick outside, thin inside (classic drafting sheet).
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.03);
  doc.rect(BORDER_OUT, BORDER_OUT, PAGE_W - 2 * BORDER_OUT, PAGE_H - 2 * BORDER_OUT, 'S');
  doc.setLineWidth(0.011);
  doc.rect(BORDER_IN, BORDER_IN, PAGE_W - 2 * BORDER_IN, PAGE_H - 2 * BORDER_IN, 'S');

  // Title strip along the bottom, inside the inner border.
  const stripY = PAGE_H - BORDER_IN - TITLE_H;
  const stripW = PAGE_W - 2 * BORDER_IN;
  doc.setLineWidth(0.02);
  doc.line(BORDER_IN, stripY, PAGE_W - BORDER_IN, stripY);

  // Cells: PROJECT/DESIGNED BY (flex) · SCHOOL (3.1") · DATE+SCALE (2.5") · SHEET (1.7").
  const wSheet = 1.7, wDate = 2.5, wSchool = 3.1;
  const xSchool = BORDER_IN + (stripW - wSheet - wDate - wSchool);
  const xDate = xSchool + wSchool;
  const xSheet = xDate + wDate;
  doc.setLineWidth(0.011);
  for (const x of [xSchool, xDate, xSheet]) doc.line(x, stripY, x, PAGE_H - BORDER_IN);

  const label = (text: string, x: number, y: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.6);
    doc.setTextColor(...rgb(T.inkSoft));
    doc.text(text.toUpperCase(), x, y, { align: 'left', baseline: 'top' });
  };
  // Empty field → a write-in rule instead of text, so the same chrome serves
  // the paper starter sheets (students hand-write name/date after photocopying).
  const value = (text: string, x: number, y: number, size = 9.5, bold = false, blankW = 1.6) => {
    if (!text) {
      doc.setDrawColor(...rgb(T.inkSoft));
      doc.setLineWidth(0.008);
      doc.line(x, y + 0.14, x + blankW, y + 0.14);
      return;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...ink);
    doc.text(text, x, y, { align: 'left', baseline: 'top' });
  };

  const padX = 0.12, row1 = stripY + 0.09, row2 = stripY + 0.42;
  label('Project', BORDER_IN + padX, row1);
  value(fields.project || 'Untitled project', BORDER_IN + padX, row1 + 0.1, 10.5, true);
  label('Designed by', BORDER_IN + padX, row2);
  value(fields.student, BORDER_IN + padX, row2 + 0.1, 9.5, false, 2.4);

  label('School', xSchool + padX, row1);
  value(fields.school, xSchool + padX, row1 + 0.1, 9.5, false, 2);
  label('Drawn with', xSchool + padX, row2);
  value('stembuilder.io', xSchool + padX, row2 + 0.1, 9.5, true);

  label('Date', xDate + padX, row1);
  value(fields.date, xDate + padX, row1 + 0.1, 9.5, false, 1.4);
  label('Scale', xDate + padX, row2);
  value(scaleNote, xDate + padX, row2 + 0.1);

  // Sheet cell — big number, title beneath.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...ink);
  doc.text(sheetNo, xSheet + wSheet / 2, stripY + 0.13, { align: 'center', baseline: 'top' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...rgb(T.inkSoft));
  doc.text(sheetTitle.toUpperCase(), xSheet + wSheet / 2, stripY + 0.55, { align: 'center', baseline: 'top', maxWidth: wSheet - 0.1 });

  return {
    x: BORDER_IN + FRAME_PAD,
    y: BORDER_IN + FRAME_PAD,
    w: PAGE_W - 2 * (BORDER_IN + FRAME_PAD),
    h: stripY - BORDER_IN - 2 * FRAME_PAD,
  };
}

// ── Cover page ────────────────────────────────────────────────────────────────
function drawCover(doc: jsPDF, fields: PortfolioFields, index: { no: string; title: string }[]) {
  const frame = pageChrome(doc, fields, 'A-0', 'Cover');
  const ink = rgb(T.ink);
  const cx = frame.x + frame.w / 2;
  let y = frame.y + frame.h * 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...rgb(T.inkSoft));
  doc.setCharSpace(0.06);
  doc.text('ARCHITECTURAL PORTFOLIO', cx, y, { align: 'center', baseline: 'middle' });
  doc.setCharSpace(0);

  y += 0.55;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  doc.setTextColor(...ink);
  doc.text(fields.project || 'Untitled project', cx, y, { align: 'center', baseline: 'middle', maxWidth: frame.w * 0.85 });

  y += 0.5;
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.02);
  doc.line(cx - 1.6, y, cx + 1.6, y);

  y += 0.42;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`Designed by ${fields.student || '—'}`, cx, y, { align: 'center', baseline: 'middle' });
  y += 0.32;
  doc.setFontSize(10.5);
  doc.setTextColor(...rgb(T.inkSoft));
  doc.text([fields.school, fields.date].filter(Boolean).join('  ·  ') || ' ', cx, y, { align: 'center', baseline: 'middle' });

  // Drawing index.
  y += 0.72;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.setCharSpace(0.04);
  doc.text('DRAWING INDEX', cx, y, { align: 'center', baseline: 'middle' });
  doc.setCharSpace(0);
  y += 0.3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const row of index) {
    doc.setFont('helvetica', 'bold');
    doc.text(row.no, cx - 1.5, y, { align: 'left', baseline: 'middle' });
    doc.setFont('helvetica', 'normal');
    doc.text(row.title, cx - 0.85, y, { align: 'left', baseline: 'middle' });
    y += 0.27;
  }
}

// ── Which pages a project can produce (shared with the export UI) ─────────────
export interface PortfolioPage {
  no: string;
  title: string;
  kind: 'floor' | 'elevations' | 'section' | 'roof';
}
export function portfolioPages(raw: RawBlocks, include: PortfolioInclude): PortfolioPage[] {
  const pages: PortfolioPage[] = [];
  let n = 1;
  for (const fp of raw.floorPlans) {
    const title = raw.floorPlans.length > 1 ? `Floor plan — ${fp.level.name}` : 'Floor plan';
    pages.push({ no: `A-${n++}`, title, kind: 'floor' });
  }
  if (include.elevations && raw.elevations.length) {
    for (let i = 0; i < raw.elevations.length; i += 2) {
      const pair = raw.elevations.slice(i, i + 2);
      pages.push({ no: `A-${n++}`, title: pair.map(e => e.dir[0].toUpperCase() + e.dir.slice(1)).join(' & ') + ' elevations', kind: 'elevations' });
    }
  }
  if (include.sections) {
    for (const sec of raw.sections) {
      // sec.title is "SECTION A-A'" — keep the cut letters uppercase.
      pages.push({ no: `A-${n++}`, title: `Section ${sec.title.replace(/^SECTION\s*/i, '')}`, kind: 'section' });
    }
  }
  if (include.roof && raw.roof) {
    pages.push({ no: `A-${n++}`, title: 'Roof plan', kind: 'roof' });
  }
  return pages;
}

// ── Assemble the portfolio ────────────────────────────────────────────────────
export async function buildPortfolioPdf(
  project: Project, fields: PortfolioFields, include: PortfolioInclude,
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const raw = gatherRaw(project);
  const pages = portfolioPages(raw, include);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'legal' });
  doc.setLineCap('butt');
  doc.setLineJoin('miter');

  drawCover(doc, fields, pages);

  // Walk the same order portfolioPages produced, drawing each sheet.
  let floorI = 0, elevI = 0, sectI = 0;
  for (const page of pages) {
    doc.addPage('legal', 'landscape');
    const frame = pageChrome(doc, fields, page.no, page.title);

    if (page.kind === 'floor') {
      const fp = raw.floorPlans[floorI++];
      const prims = [...furniturePrims(fp.level), ...fp.planPrims];
      const block = blockAtOrigin('plan', prims, fp.lb);
      const inner: Frame = { ...frame, h: frame.h - CAPTION_H };
      const s = pickScale(fitK(block, inner));
      drawView(doc, block, inner, s.k, `${page.title.toUpperCase()}  ·  SCALE ${s.label}`);
    } else if (page.kind === 'elevations') {
      const pair = raw.elevations.slice(elevI, elevI + 2);
      elevI += 2;
      // Two-up, stacked — both plotted at the SAME scale (the tighter fit).
      const halfH = (frame.h - 2 * CAPTION_H) / 2;
      const frames: Frame[] = [
        { x: frame.x, y: frame.y, w: frame.w, h: halfH },
        { x: frame.x, y: frame.y + halfH + CAPTION_H + 0.1, w: frame.w, h: halfH },
      ];
      const blocks = pair.map(e => blockAtOrigin('elevation', e.prims, e.lb));
      const s = pickScale(Math.min(...blocks.map((b, i) => fitK(b, frames[i]))));
      blocks.forEach((b, i) => drawView(doc, b, frames[i], s.k, `${pair[i].title}  ·  SCALE ${s.label}`));
    } else if (page.kind === 'section') {
      const sec = raw.sections[sectI++];
      const block = blockAtOrigin('elevation', sec.prims, sec.lb);
      const inner: Frame = { ...frame, h: frame.h - CAPTION_H };
      const s = pickScale(fitK(block, inner));
      drawView(doc, block, inner, s.k, `${sec.title}  ·  SCALE ${s.label}`);
    } else if (page.kind === 'roof' && raw.roof) {
      const block = blockAtOrigin('plan', raw.roof.prims, raw.roof.lb);
      const inner: Frame = { ...frame, h: frame.h - CAPTION_H };
      const s = pickScale(fitK(block, inner));
      drawView(doc, block, inner, s.k, `ROOF PLAN  ·  SCALE ${s.label}`);
    }
  }

  return doc.output('blob');
}

// ═══ Paper starter sheets ═════════════════════════════════════════════════════
// Photocopiable design worksheets: the assignment's shell outlines printed to
// scale on light 1-square-= N-feet graph paper, so students sketch their rooms
// on paper FIRST and then rebuild the plan in Blueprint Lab (paper→computer,
// same as STEM Sketch's isometric-paper stage). One page per shell variant —
// the SAME variants (shellVariants) the in-app picker offers, so the paper
// matches what students will click — plus a plain graph-paper page (which is
// the whole printout for from-scratch assignments). Name/date print as
// write-in blanks in the title strip.

export interface StarterSheetArgs {
  assignmentTitle: string;
  totalSqFt: { min: number; max: number } | null;
  shellMode: 'scratch' | 'choice' | 'fixed';
  shellIds: string[];
}

// One square is ALWAYS one foot (2026-09-02 feedback: a seventh grader must be
// able to single-count boxes — "a 15-foot room is 15 boxes" beats bigger
// squares every time, even if the grid runs a little fine at 1/8" scale).
const GRID_FT = 1;

// Light photocopy-safe grid across the frame, anchored so `anchor` (page
// coords) is a grid intersection; a slightly darker line every 5 squares.
function drawGrid(doc: jsPDF, frame: Frame, stepIn: number, anchor: Vec2) {
  const first = (a: number, lo: number) => a - Math.ceil((a - lo - 1e-9) / stepIn) * stepIn;
  const lines: { pos: number; major: boolean; vert: boolean }[] = [];
  for (let x = first(anchor.x, frame.x); x <= frame.x + frame.w + 1e-9; x += stepIn) {
    lines.push({ pos: x, major: Math.round((x - anchor.x) / stepIn) % 5 === 0, vert: true });
  }
  for (let y = first(anchor.y, frame.y); y <= frame.y + frame.h + 1e-9; y += stepIn) {
    lines.push({ pos: y, major: Math.round((y - anchor.y) / stepIn) % 5 === 0, vert: false });
  }
  doc.setLineDashPattern([], 0);
  for (const major of [false, true]) {
    doc.setDrawColor(...(major ? [168, 173, 190] as [number, number, number] : [205, 208, 219] as [number, number, number]));
    doc.setLineWidth(major ? 0.009 : 0.006);
    for (const l of lines) {
      if (l.major !== major) continue;
      if (l.vert) doc.line(l.pos, frame.y, l.pos, frame.y + frame.h);
      else doc.line(frame.x, l.pos, frame.x + frame.w, l.pos);
    }
  }
}

export async function buildStarterSheetsPdf(args: StarterSheetArgs): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const range = args.totalSqFt ?? { min: 1000, max: 1000 };
  const fields: PortfolioFields = { student: '', school: '', project: args.assignmentTitle, date: '' };

  // The concrete variants students will see in the in-app picker — respecting
  // the teacher's narrowed selection ('ranch#2' entries), with version letters
  // keyed to the ORIGINAL variant index so paper matches the app.
  const variants: { v: ShellVariant; title: string }[] = args.shellMode === 'scratch' ? [] :
    parseShellIds(args.shellIds).flatMap(choice => {
      const def = SHELLS.find(s => s.id === choice.shellId);
      if (!def) return [];
      return allowedShellVariants(choice, range.min, range.max).map(({ v, idx }) => ({
        v, title: `${def.label} — Version ${String.fromCharCode(65 + idx)}`,
      }));
    });

  const doc = new jsPDF({ orientation: 'landscape', unit: 'in', format: 'legal' });
  doc.setLineCap('butt');
  doc.setLineJoin('miter');

  let n = 1;
  let firstPage = true;
  const nextPage = () => {
    if (!firstPage) doc.addPage('legal', 'landscape');
    firstPage = false;
  };

  for (const { v, title } of variants) {
    const pts = shellOutline(v);
    const stats = shellStats(v);
    if (pts.length === 0 || !stats) continue;

    // Shell bbox (plan coords, Y-down) padded for the overall dims that sit
    // left of and below the outline.
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const lb: SheetBounds = {
      minX: Math.min(...xs) - 52, maxX: Math.max(...xs) + 16,
      minY: Math.min(...ys) - 16, maxY: Math.max(...ys) + 52,
    };
    const prims: SectionPrimitive[] = [
      { id: 'ss-outline', kind: 'polyline', verts: pts, closed: true, style: 'thick' },
      // Overall dims: width below (sheet-normal points up into the building →
      // negative offset drops it below), depth to the left (same reasoning).
      { id: 'ss-dim-w', kind: 'dimLinear', a: { x: Math.min(...xs), y: Math.max(...ys) }, b: { x: Math.max(...xs), y: Math.max(...ys) }, offset: -28 },
      { id: 'ss-dim-d', kind: 'dimLinear', a: { x: Math.min(...xs), y: Math.min(...ys) }, b: { x: Math.min(...xs), y: Math.max(...ys) }, offset: -28 },
    ];
    const block = blockAtOrigin('plan', prims, lb);

    nextPage();
    const s = pickScale(fitK(block, { x: 0, y: 0, w: PAGE_W - 2 * (BORDER_IN + FRAME_PAD), h: PAGE_H - BORDER_IN - TITLE_H - BORDER_IN - 2 * FRAME_PAD - CAPTION_H }));
    const frame = pageChrome(doc, fields, `S-${n++}`, title, s.label);
    const inner: Frame = { ...frame, h: frame.h - CAPTION_H };
    const toPdf = toPdfFor(block, inner, s.k);
    // Anchor the grid on the shell's top-left corner — shell dims snap to
    // whole feet, so every edge lands on a grid line.
    const anchor = toPdf({ x: Math.min(...xs), y: -Math.min(...ys) });
    drawGrid(doc, inner, GRID_FT * 12 * s.k, anchor);
    renderBlocksToPdf(doc, [block], toPdf, {
      scale: s.k, minLwInPerPx: PRINT_MIN_LW, minTextIn: PRINT_MIN_TEXT,
    });
    drawCaption(doc, inner, `${title.toUpperCase()}  ·  ${stats.sqFt.toLocaleString()} SF  ·  1 SQUARE = 1'-0"  ·  SCALE ${s.label}`);
  }

  // Plain graph-paper page — scaled to the brief so a full design fits.
  {
    const big = range.max >= 1400;
    const s = ARCH_SCALES.find(x => x.k === (big ? 1 / 96 : 1 / 64))!;
    nextPage();
    const frame = pageChrome(doc, fields, `S-${n}`, 'Graph paper', s.label);
    const inner: Frame = { ...frame, h: frame.h - CAPTION_H };
    drawGrid(doc, inner, GRID_FT * 12 * s.k, { x: inner.x + inner.w / 2, y: inner.y + inner.h / 2 });
    drawCaption(doc, inner, `GRAPH PAPER  ·  1 SQUARE = 1'-0"  ·  SCALE ${s.label}`);
  }

  return doc.output('blob');
}
