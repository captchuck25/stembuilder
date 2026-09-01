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

// Draw one view centered in its frame at scale k, with a caption underneath.
function drawView(doc: jsPDF, block: SheetBlock, frame: Frame, k: number, caption: string) {
  const sb = block.sheetBounds;
  const spanX = sb.maxX - sb.minX;
  const spanY = sb.maxY - sb.minY;
  const ox = frame.x + (frame.w - spanX * k) / 2;
  const oy = frame.y + (frame.h - spanY * k) / 2;
  const toPdf: ToPdf = p => ({ x: ox + (p.x - sb.minX) * k, y: oy + (sb.maxY - p.y) * k });
  renderBlocksToPdf(doc, [block], toPdf, {
    scale: k, minLwInPerPx: PRINT_MIN_LW, minTextIn: PRINT_MIN_TEXT,
  });
  // Caption — bold title + scale note, centered under the frame, underlined.
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

// ── Page chrome: borders + title strip. Returns the drawing content frame. ────
function pageChrome(doc: jsPDF, fields: PortfolioFields, sheetNo: string, sheetTitle: string): Frame {
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
  const value = (text: string, x: number, y: number, size = 9.5, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...ink);
    doc.text(text, x, y, { align: 'left', baseline: 'top' });
  };

  const padX = 0.12, row1 = stripY + 0.09, row2 = stripY + 0.42;
  label('Project', BORDER_IN + padX, row1);
  value(fields.project || 'Untitled project', BORDER_IN + padX, row1 + 0.1, 10.5, true);
  label('Designed by', BORDER_IN + padX, row2);
  value(fields.student || '—', BORDER_IN + padX, row2 + 0.1);

  label('School', xSchool + padX, row1);
  value(fields.school || '—', xSchool + padX, row1 + 0.1);
  label('Drawn with', xSchool + padX, row2);
  value('StemBuilder — Blueprint Lab', xSchool + padX, row2 + 0.1, 8);

  label('Date', xDate + padX, row1);
  value(fields.date || '—', xDate + padX, row1 + 0.1);
  label('Scale', xDate + padX, row2);
  value('AS NOTED', xDate + padX, row2 + 0.1);

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
