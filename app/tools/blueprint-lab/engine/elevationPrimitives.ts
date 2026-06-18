// Elevation drawing as a flat list of DrawingPrimitive — mirror of
// `engine/sectionPrimitives.ts` for exterior elevations.
//
// `buildElevationPrimitives(project, direction)` produces the same visual
// output as today's ElevationsView, but expressed as primitives instead of
// per-shape JSX. The same list is then consumed by:
//   • The elevation renderer (Phase A: still SVG; primitive-driven).
//   • Drafting mode — snapshotted into `project.elevationDrafting[dir]`
//     and edited with the section view's tools.
//   • Snap engine + hit testing (reuses the section-side helpers).
//
// All coords are world inches with Y-up (origin = top of first-floor
// subfloor at the building centerline — same as SectionStack).

import polygonClipping from 'polygon-clipping';
import {
  ElevationDirection, ElevationOpening, ElevationScene, buildElevation,
  subtractConvexPolyline,
} from './elevations';
import { DrawingPrimitive, HatchPattern, Project, Vec2 } from './types';

// Robust polygon DIFFERENCE (subject minus the clip polygons) → the visible
// region as ONE (or few) clean polygons. Used for setback gable-side hidden-line
// so the siding/trim fill is a single uniquely-shaped piece (no convex-piece
// seams / phantom lines). Falls back to the subject on any failure.
function polyDiff(subject: Vec2[], clips?: Vec2[][]): Vec2[][] {
  if (subject.length < 3) return [];
  const valid = (clips ?? []).filter(c => c.length >= 3);
  if (!valid.length) return [subject];
  const ring = (vs: Vec2[]): [number, number][] => {
    const r = vs.map(v => [v.x, v.y] as [number, number]);
    r.push([vs[0].x, vs[0].y]);
    return r;
  };
  try {
    const res = polygonClipping.difference([ring(subject)], ...valid.map(c => [ring(c)]));
    const out: Vec2[][] = [];
    for (const poly of res) {
      const r = poly[0];
      if (r && r.length >= 4) out.push(r.slice(0, -1).map(([x, y]) => ({ x, y })));
    }
    return out;
  } catch { return [subject]; }
}

// ── Geometric constants ──────────────────────────────────────────────────
// These match the constants in ElevationsView.tsx today. Eventually the
// view will read primitives only; the constants stay here so the builder
// remains the single source of truth.
export const EP_TRIM_WIDTH         = 5;   // casing + corner board thickness
export const EP_SILL_PROJECTION    = 4;   // sill overhang past casing each side
export const EP_SILL_HEIGHT        = 3;   // sill thickness (vertical)
export const EP_ADJACENT_MERGE_IN  = 10;  // 2 × trim width — group threshold
export const EP_MULLION_WIDTH      = 4;   // white mull strip between mulled windows

// ── Drafting-aware getter (mirror of getSectionPrimitives) ───────────────
export function getElevationPrimitives(
  project: Project,
  direction: ElevationDirection,
): DrawingPrimitive[] {
  const snapshot = project.elevationDrafting?.[direction];
  if (snapshot && snapshot.length > 0) return snapshot;
  return buildElevationPrimitives(project, direction);
}

export function isElevationDrafting(
  project: Project,
  direction: ElevationDirection,
): boolean {
  return (project.elevationDrafting?.[direction]?.length ?? 0) > 0;
}

// ── Builder ──────────────────────────────────────────────────────────────
// Produces the full procedural elevation as a flat primitive list. Order is
// back-to-front so the renderer can iterate left-to-right and get correct
// z-order without sorting:
//   1. Wall shell (filled polygon)
//   2. Siding hatch (clipped by shell — rendered with a clipPath downstream)
//   3. Corner boards (cover wall edges)
//   4. Roof profile (outline)
//   5. Gable trim (covers slopes + soffit returns)
//   6. Grade line + label
//   7. Floor reference lines + labels
//   8. Openings (one group at a time: casing/sill + sidelights + panes + variant)
export function buildElevationPrimitives(
  project: Project,
  direction: ElevationDirection,
): DrawingPrimitive[] {
  const scene = buildElevation(project, direction);
  if (!scene) return [];

  const out: DrawingPrimitive[] = [];
  let nextId = 0;
  const id = (prefix: string) => `el-${prefix}-${nextId++}`;

  // Wall shell + siding + corner boards + roof for ONE mass. Setback elevations
  // call this per floor tier (low→high) so the taller upper block's opaque
  // siding draws OVER and occludes the lower roof behind it. The shared grade /
  // floor lines / openings are pushed once afterward.
  // The wall shell is an OPAQUE white fill. The renderer paints every shell that
  // precedes the first hatch as background, and everything after a hatch as
  // opaque foreground. So for setback (multi-tier) we must push ALL tier wall
  // shells FIRST — otherwise a later tier's shell paints over its OWN siding
  // hatch and the wall reads blank. `pushWallShell` is the background pass;
  // `pushDressing` is everything else (hatches + trim + roof). For a single mass
  // the two run back-to-back, identical to the old combined order.
  // Gable-side hidden-line: subtract the nearer tiers' silhouettes from a CLOSED
  // polygon / OPEN polyline, yielding the visible pieces. No-op (single piece)
  // when the tier has no `subtractPolys` — so eave-side / single-mass output is
  // byte-identical.
  const subClosed = (poly: Vec2[], subs?: Vec2[][]): Vec2[][] => {
    if (poly.length < 3) return [];
    if (!subs?.length) return [poly];
    return polyDiff(poly, subs); // single clean piece(s) — no convex-piece seams
  };
  const subOpen = (pts: Vec2[], subs?: Vec2[][]): Vec2[][] => {
    if (pts.length < 2) return [];
    if (!subs?.length) return [pts];
    let runs = [pts];
    for (const s of subs) runs = runs.flatMap(r => subtractConvexPolyline(r, s));
    return runs;
  };

  // A white-filled TRIM polygon (wall shell, corner board, gable trim). Normally
  // emitted as a filled + stroked closed polygon. For a gable-FAR tier (one that
  // has nearer gables subtracted) we instead stroke ONLY its visible original
  // outline — clip the closed loop to OUTSIDE the nearer gables as an OPEN
  // polyline. That keeps real edges and drops both the hidden parts AND the
  // spurious internal cut edges the convex piece-wise subtraction would stroke;
  // the white fill is omitted (the page is already white, and the tier is behind).
  const emitTrim = (prefix: string, verts: Vec2[], subs?: Vec2[][], fillPieces = false) => {
    if (verts.length < 3) return;
    if (!subs?.length) {
      out.push({ id: id(prefix), kind: 'polyline', verts, closed: true, style: 'normal', fill: 'trim' });
      return;
    }
    // Fill the visible pieces white (so siding insets UNDER the rake/fascia/corner
    // board) WITHOUT stroking the internal cut edges, then stroke only the real
    // visible outline. Wall shells pass fillPieces=false (a white fill would cover
    // the siding); thin trim (rake/fascia/corner) passes true.
    if (fillPieces) for (const piece of subClosed(verts, subs)) {
      out.push({ id: id(prefix), kind: 'polyline', verts: piece, closed: true, style: 'normal', fill: 'trim', noStroke: true });
    }
    for (const run of subOpen([...verts, verts[0]], subs)) {
      out.push({ id: id(prefix), kind: 'polyline', verts: run, closed: false, style: 'normal' });
    }
  };

  const pushWallShell = (sc: ElevationScene) => {
    // Gable-far tier: no white fill — its outline is stroked in pushDressing.
    if (sc.subtractPolys?.length) return;
    if (sc.wallOutline.length >= 3) {
      out.push({ id: id('wall'), kind: 'polyline', verts: sc.wallOutline, closed: true, style: 'normal', fill: 'trim' });
    }
  };
  const pushDressing = (sc: ElevationScene, tiered = false) => {
    if (sc.wallOutline.length >= 3) {
      // Gable-far tier: stroke the visible wall outline (clipped, no spurious cuts).
      if (sc.subtractPolys?.length) emitTrim('wall', sc.wallOutline, sc.subtractPolys);
      // Siding base. For a GABLE-side tier whose wall came out flat-topped (the wing
      // built from the full floor-1 footprint), fill up to the roof PEAK so the
      // gable triangle is clad. Gated on subtractPolys (gable-side only) — NOT eave-
      // side tiers, whose roof band legitimately peaks above the wall.
      const wallTopY = Math.max(...sc.wallOutline.map(p => p.y));
      const peakY = sc.roofProfile.length ? Math.max(...sc.roofProfile.map(p => p.y)) : wallTopY;
      let sidingBase = sc.wallOutline;
      if (sc.subtractPolys?.length && peakY > wallTopY + 1) {
        const peak = sc.roofProfile.reduce((a, b) => (b.y > a.y ? b : a));
        const xs = sc.wallOutline.map(p => p.x);
        const xL = Math.min(...xs), xR = Math.max(...xs), gY = Math.min(...sc.wallOutline.map(p => p.y));
        const px = Math.max(xL, Math.min(xR, peak.x));
        sidingBase = [{ x: xL, y: gY }, { x: xL, y: wallTopY }, { x: px, y: peakY }, { x: xR, y: wallTopY }, { x: xR, y: gY }];
      }
      const sidingVerts: Vec2[] = sidingBase.map(p => ({
        x: p.x,
        y: p.y <= sc.gradeY + 0.001 ? sc.firstFloorY : p.y,
      }));
      // Corner board bands (null if suppressed / covered).
      const cornerL = sc.cornerLClipY ?? (sc.suppressCornerL ? null : [sc.gradeY, sc.topOfWallsY]);
      const cornerR = sc.cornerRClipY ?? (sc.suppressCornerR ? null : [sc.gradeY, sc.topOfWallsY]);
      const cornerLrect = cornerL && cornerL[1] > cornerL[0] ? [
        { x: sc.wallLeftX, y: cornerL[0] }, { x: sc.wallLeftX + EP_TRIM_WIDTH, y: cornerL[0] },
        { x: sc.wallLeftX + EP_TRIM_WIDTH, y: cornerL[1] }, { x: sc.wallLeftX, y: cornerL[1] },
      ] : null;
      const cornerRrect = cornerR && cornerR[1] > cornerR[0] ? [
        { x: sc.wallRightX - EP_TRIM_WIDTH, y: cornerR[0] }, { x: sc.wallRightX, y: cornerR[0] },
        { x: sc.wallRightX, y: cornerR[1] }, { x: sc.wallRightX - EP_TRIM_WIDTH, y: cornerR[1] },
      ] : null;
      // 2. SIDING — inset INSIDE all fascia/rake + end (corner) trim, down to the
      //    1st-floor line, so it never overlaps the trim. = wall area minus
      //    (gableTrim ∪ corner boards ∪ any occluding nearer tier). Setback tiers
      //    only — single-mass keeps its byte-identical full-wall siding (its trim
      //    is drawn foreground OVER the siding, which reads the same).
      const sidingClips: Vec2[][] = tiered
        ? [...sc.gableTrim, ...(cornerLrect ? [cornerLrect] : []), ...(cornerRrect ? [cornerRrect] : []), ...(sc.subtractPolys ?? [])]
        : (sc.subtractPolys ?? []);
      const sidingPieces = sidingClips.length ? polyDiff(sidingVerts, sidingClips) : [sidingVerts];
      for (const piece of sidingPieces) {
        out.push({ id: id('siding'), kind: 'hatch', verts: piece, pattern: sc.exteriorMaterial as HatchPattern });
      }
      // 3. Corner boards.
      if (cornerLrect) emitTrim('corner-L', cornerLrect, sc.subtractPolys, true);
      if (cornerRrect) emitTrim('corner-R', cornerRrect, sc.subtractPolys, true);
    }
    // 4. Roof profile outline.
    for (const run of subOpen(sc.roofProfile, sc.subtractPolys)) {
      out.push({ id: id('roof'), kind: 'polyline', verts: run, closed: false, style: 'normal' });
    }
    // 5. Gable trim (rake + soffit + fascia) — fill white (insets the siding) + outline.
    for (const poly of sc.gableTrim) emitTrim('gable-trim', poly, sc.subtractPolys, true);
    // 5b. Roof shingles (eave-side roof surface).
    if (sc.roofHatch && sc.roofHatch.length >= 3) {
      for (const piece of subClosed(sc.roofHatch, sc.subtractPolys)) {
        out.push({ id: id('roof-shingles'), kind: 'hatch', verts: piece, pattern: 'roof-shingles' });
      }
    }
    // 5c. Extra roof-edge outlines (cross-gable field edges).
    for (const poly of sc.roofOutlines ?? []) {
      if (poly.length < 2) continue;
      for (const run of subOpen([...poly, poly[0]], sc.subtractPolys)) {
        out.push({ id: id('roof-outline'), kind: 'polyline', verts: run, closed: !sc.subtractPolys?.length, style: 'normal' });
      }
    }
  };

  // Setback: draw each tier's shell back-to-front (low→high). Otherwise the
  // single mass. The two safe cases (single-story / identical two-story) have
  // no `tiers`, so this is the exact same output as before.
  if (scene.tiers && scene.tiers.length > 0) {
    // Wall shells first (background). Then dress tiers WITH a wall outline (their
    // siding + trim), and finally tiers whose wall merged away (only a roof/fascia
    // left — e.g. the flush wing) so that fascia draws in the FOREGROUND, over the
    // block's siding, not behind it.
    const withWall = scene.tiers.filter(t => t.wallOutline.length >= 3);
    const noWall = scene.tiers.filter(t => t.wallOutline.length < 3);
    for (const tier of withWall) pushWallShell(tier);
    for (const tier of withWall) pushDressing(tier, true);
    for (const tier of noWall) pushDressing(tier, true);
  } else {
    pushWallShell(scene);
    pushDressing(scene, false);
  }

  // ── 6. Grade line + label ──────────────────────────────────────────────
  // Drawn as a horizontal line at gradeY spanning a wide range so it reads
  // as "the ground". The renderer extends it past the building.
  out.push({
    id: id('grade-line'),
    kind: 'line',
    a: { x: scene.wallLeftX  - 240, y: scene.gradeY },
    b: { x: scene.wallRightX + 240, y: scene.gradeY },
    style: 'normal',
  });
  out.push({
    id: id('grade-label'),
    kind: 'text',
    at: { x: scene.wallLeftX - 200, y: scene.gradeY - 8 },
    content: 'GRADE',
    size: 10,
    align: 'left',
    baseline: 'top',
    color: 'inkSoft',
  });

  // ── 7. Floor reference dashed lines + labels ───────────────────────────
  pushFloorRef(out, id, '1st flr', scene.firstFloorY, scene);
  if (scene.secondFloorY !== undefined) {
    pushFloorRef(out, id, '2nd flr', scene.secondFloorY, scene);
  }

  // ── 8. Openings (grouped for adjacency) ────────────────────────────────
  for (const group of groupAdjacent(scene.openings)) {
    pushOpeningGroupPrimitives(out, id, group);
  }

  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function pushFloorRef(
  out: DrawingPrimitive[],
  id: (prefix: string) => string,
  label: string,
  y: number,
  scene: ElevationScene,
) {
  out.push({
    id: id('floor-line'),
    kind: 'line',
    a: { x: scene.wallLeftX  - 240, y },
    b: { x: scene.wallRightX + 240, y },
    style: 'dashed',
  });
  out.push({
    id: id('floor-label'),
    kind: 'text',
    at: { x: scene.wallLeftX - 200, y: y + 4 },
    content: label,
    size: 9,
    align: 'left',
    baseline: 'bottom',
    color: 'inkMuted',
  });
}

// Same adjacency logic as the view used for OpeningGroup: only WINDOWS
// merge; doors stay one-per-group.
function groupAdjacent(openings: ElevationOpening[]): ElevationOpening[][] {
  if (openings.length === 0) return [];
  const sorted = [...openings].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'door' ? -1 : 1;
    if (a.bottomY !== b.bottomY) return a.bottomY - b.bottomY;
    if (a.topY !== b.topY) return a.topY - b.topY;
    return a.x - b.x;
  });
  const groups: ElevationOpening[][] = [];
  for (const op of sorted) {
    const lastGroup = groups[groups.length - 1];
    const lastOp = lastGroup?.[lastGroup.length - 1];
    const canMerge = !!lastOp
      && op.kind === 'window'
      && lastOp.kind === 'window'
      && lastOp.bottomY === op.bottomY
      && lastOp.topY === op.topY
      && (op.x - (lastOp.x + lastOp.width)) <= EP_ADJACENT_MERGE_IN
      && (op.x - (lastOp.x + lastOp.width)) >= -0.5;
    if (canMerge && lastGroup) lastGroup.push(op);
    else groups.push([op]);
  }
  return groups;
}

function pushOpeningGroupPrimitives(
  out: DrawingPrimitive[],
  id: (prefix: string) => string,
  group: ElevationOpening[],
): void {
  const first = group[0];
  const last  = group[group.length - 1];
  const isWindow = first.kind === 'window';
  const top    = first.topY;
  const bottom = first.bottomY;
  const h      = top - bottom;

  const casingLeft   = first.x - EP_TRIM_WIDTH;
  const casingRight  = last.x + last.width + EP_TRIM_WIDTH;
  const casingTop    = top + EP_TRIM_WIDTH;
  const casingBottom = isWindow ? bottom - EP_TRIM_WIDTH : bottom;

  // Sidelight extension (single entry doors only).
  const isSingleDoor = !isWindow && group.length === 1;
  const hasLeftSidelight  = isSingleDoor && (first.sidePanels === 'left'  || first.sidePanels === 'both') && !!first.sidePanelWidth;
  const hasRightSidelight = isSingleDoor && (first.sidePanels === 'right' || first.sidePanels === 'both') && !!first.sidePanelWidth;
  const slWidth = first.sidePanelWidth ?? 0;
  const outerCasingLeft  = hasLeftSidelight  ? casingLeft  - (slWidth + EP_TRIM_WIDTH) : casingLeft;
  const outerCasingRight = hasRightSidelight ? casingRight + (slWidth + EP_TRIM_WIDTH) : casingRight;

  // Casing (+ integrated sill for windows) — single merged polygon.
  if (isWindow) {
    const sillVerts: Vec2[] = [
      { x: casingLeft,                          y: casingTop },
      { x: casingRight,                         y: casingTop },
      { x: casingRight,                         y: casingBottom },
      { x: casingRight + EP_SILL_PROJECTION,    y: casingBottom },
      { x: casingRight + EP_SILL_PROJECTION,    y: casingBottom - EP_SILL_HEIGHT },
      { x: casingLeft  - EP_SILL_PROJECTION,    y: casingBottom - EP_SILL_HEIGHT },
      { x: casingLeft  - EP_SILL_PROJECTION,    y: casingBottom },
      { x: casingLeft,                          y: casingBottom },
    ];
    out.push({
      id: id('win-trim'), kind: 'polyline', verts: sillVerts,
      closed: true, style: 'normal', fill: 'trim',
    });
    // Sill top edge — full sill width so the joint line reads as a single
    // continuous bead (the merged polygon naturally draws it only in the
    // projecting ends; this fills the gap under the casing).
    out.push({
      id: id('win-sill-line'), kind: 'line',
      a: { x: casingLeft  - EP_SILL_PROJECTION, y: casingBottom },
      b: { x: casingRight + EP_SILL_PROJECTION, y: casingBottom },
      style: 'normal',
    });
  } else {
    // Door casing rect — wraps door + (optional) sidelights.
    const doorCasing: Vec2[] = [
      { x: outerCasingLeft,  y: casingTop },
      { x: outerCasingRight, y: casingTop },
      { x: outerCasingRight, y: casingBottom },
      { x: outerCasingLeft,  y: casingBottom },
    ];
    out.push({
      id: id('door-trim'), kind: 'polyline', verts: doorCasing,
      closed: true, style: 'normal', fill: 'trim',
    });
  }

  // Sidelights (entry doors only).
  if (hasLeftSidelight) {
    out.push({
      id: id('sidelight-L'), kind: 'polyline',
      verts: rectVerts(casingLeft - slWidth, bottom, slWidth, h),
      closed: true, style: 'normal', fill: 'glass',
    });
  }
  if (hasRightSidelight) {
    out.push({
      id: id('sidelight-R'), kind: 'polyline',
      verts: rectVerts(casingRight, bottom, slWidth, h),
      closed: true, style: 'normal', fill: 'glass',
    });
  }

  // Per-pane glass + variant detail.
  for (const op of group) {
    out.push({
      id: id('pane'), kind: 'polyline',
      verts: rectVerts(op.x, bottom, op.width, h),
      closed: true, style: 'normal',
      fill: paneFill(op),
    });
    pushVariantDetail(out, id, op);
  }

  // Mullion strips between mulled windows. A merged window group shares one
  // outer casing, but each pair of adjacent units still meets at a mull — a
  // white vertical strip. Drawn AFTER the panes so it sits on top, spanning the
  // glass height and centered on the joint (widened to the real gap when the
  // units aren't quite touching).
  if (isWindow) {
    for (let i = 0; i < group.length - 1; i++) {
      const prev = group[i];
      const next = group[i + 1];
      const gap  = next.x - (prev.x + prev.width);
      const mid  = (prev.x + prev.width + next.x) / 2;
      const mw   = Math.max(gap, EP_MULLION_WIDTH);
      out.push({
        id: id('mull'), kind: 'polyline',
        verts: rectVerts(mid - mw / 2, bottom, mw, h),
        closed: true, style: 'normal', fill: 'trim',
      });
    }
  }
}

function rectVerts(x: number, y: number, w: number, h: number): Vec2[] {
  return [
    { x,         y },
    { x: x + w,  y },
    { x: x + w,  y: y + h },
    { x,         y: y + h },
  ];
}

function paneFill(op: ElevationOpening): 'glass' | 'panel' | 'door' {
  if (op.kind === 'window') return 'glass';
  if (op.doorType === 'sliding') return 'glass';
  // Solid-slab doors render as a painted light-grey door (not wood tan).
  return 'door';
}

function pushVariantDetail(
  out: DrawingPrimitive[],
  id: (prefix: string) => string,
  op: ElevationOpening,
): void {
  const left  = op.x;
  const right = op.x + op.width;
  const top   = op.topY;
  const bot   = op.bottomY;
  const cx    = (left + right) / 2;
  const cy    = (top + bot) / 2;
  const w     = op.width;

  if (op.kind === 'window') {
    switch (op.windowType) {
      case 'double-hung':
        out.push({ id: id('mull-H'), kind: 'line',
          a: { x: left, y: cy }, b: { x: right, y: cy }, style: 'thin' });
        return;
      case 'casement':
        if (w > 36) {
          out.push({ id: id('mull-V'), kind: 'line',
            a: { x: cx, y: top }, b: { x: cx, y: bot }, style: 'thin' });
        }
        return;
      case 'sliding':
        out.push({ id: id('mull-V'), kind: 'line',
          a: { x: cx, y: top }, b: { x: cx, y: bot }, style: 'thin' });
        return;
      case 'awning':
        out.push({ id: id('hinge'), kind: 'line',
          a: { x: left, y: top - 3 }, b: { x: right, y: top - 3 }, style: 'thin' });
        return;
      case 'bay': {
        const a = left + w / 3;
        const b = left + (2 * w) / 3;
        out.push({ id: id('mull-V'), kind: 'line',
          a: { x: a, y: top }, b: { x: a, y: bot }, style: 'thin' });
        out.push({ id: id('mull-V'), kind: 'line',
          a: { x: b, y: top }, b: { x: b, y: bot }, style: 'thin' });
        return;
      }
      case 'fixed':
      default:
        return;
    }
  }

  // Door variant detail.
  switch (op.doorType) {
    case 'room':
    case 'entry': {
      // 6-panel layout: 2 columns × 3 rows of inset panels.
      const cols = 2, rows = 3, pad = 3;
      const cellW = w / cols;
      const cellH = (top - bot) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = left + c * cellW + pad;
          const py = bot  + r * cellH + pad;
          const pw = cellW - pad * 2;
          const ph = cellH - pad * 2;
          if (pw > 0 && ph > 0) {
            out.push({
              id: id('panel'), kind: 'polyline',
              verts: rectVerts(px, py, pw, ph),
              closed: true, style: 'thin',
            });
          }
        }
      }
      return;
    }
    case 'sliding': {
      const inset = 3;
      const midX = (left + right) / 2;
      const handleY = bot + (top - bot) * 0.45;
      out.push({
        id: id('pane-L'), kind: 'polyline',
        verts: rectVerts(left + inset, bot + inset, midX - left - inset * 2, (top - bot) - inset * 2),
        closed: true, style: 'thin',
      });
      out.push({
        id: id('pane-R'), kind: 'polyline',
        verts: rectVerts(midX + inset, bot + inset, right - midX - inset * 2, (top - bot) - inset * 2),
        closed: true, style: 'thin',
      });
      out.push({
        id: id('handle'), kind: 'line',
        a: { x: midX - 6, y: handleY }, b: { x: midX + 6, y: handleY }, style: 'normal',
      });
      return;
    }
    case 'bifold': {
      const panels = w > 48 ? 4 : 2;
      for (let i = 1; i < panels; i++) {
        const x = left + (w / panels) * i;
        out.push({ id: id('fold'), kind: 'line',
          a: { x, y: top }, b: { x, y: bot }, style: 'thin' });
      }
      return;
    }
    case 'barn':
    case 'pocket':
    default:
      // Solid slab — no internal detail. Future: optional handle dot.
      return;
  }
}

// Re-export so direct consumers can pull ElevationOpening from this module.
export type { ElevationOpening };
