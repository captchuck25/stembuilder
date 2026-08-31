// Rubric auto-check engine — evaluates a Level against a design Brief and
// returns pass/fail checks for the live Requirements panel (guide mode) and,
// later, server-side grading at submission (assessment mode). See
// docs/BLUEPRINT_LAB_ASSIGNMENTS_PLAN.md.
//
// Room membership is geometric: a room's polygon is its user-drawn boundary,
// falling back to autoDetectRoomBoundary from the label position. Openings
// (doors/windows) belong to a room when they sit ON its perimeter; furniture
// belongs when its center is INSIDE the polygon.

import {
  Door, FurnitureItem, FurnitureKind, Level, RoomLabel, Vec2, Window,
} from './types';
import { autoDetectRoomBoundary, polygonAreaSqFt } from './geometry';
import { buildRoofFootprint } from './roof';

// ─── Brief model ──────────────────────────────────────────────────────────────

// A furniture requirement is a list of ANY-OF groups: every group must be
// satisfied by at least one item in the room. E.g. a bedroom needs
// [any bed] AND [a dresser]:  [['bed-twin','bed-full','bed-queen','bed-king'], ['dresser']]
export type FurnitureGroup = FurnitureKind[];

export interface RoomRequirement {
  roomType: string;            // canonical ROOM_TYPES name (uppercase)
  count: number;               // minimum number of rooms with this label
  // Orientation-agnostic minimum usable dimensions, inches (12×10 == 10×12).
  minDims?: { a: number; b: number };
  minWindows?: number;
  minDoors?: number;
  furniture?: FurnitureGroup[];
  attachedCloset?: boolean;    // room must connect to a CLOSET/WALK-IN via a door
  // Guidance shown under the room's section in the Requirements panel and the
  // teacher's rubric editor (e.g. the garage's draw-outside-the-shell note).
  note?: string;
}

export interface Brief {
  id: string;
  title: string;
  description: string;
  totalSqFt?: { min: number; max: number };
  rooms: RoomRequirement[];
  frontDoor: boolean;          // ≥1 exterior door (entry / exterior slider)
  backDoor: boolean;           // ≥2 exterior doors
  deliverables: Array<'floor-plan' | 'roof-plan' | 'elevations'>;
}

export interface RubricCheck {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  detail: string;              // one-line explanation of the current state
  group: string;               // panel section header, e.g. "MASTER BEDROOM"
  // Guidance for the whole group (carried on its first check), e.g. the
  // garage's draw-outside-the-shell note.
  note?: string;
}

// ─── Built-in briefs (generic standards — teacher-editable in a later phase) ──

const ANY_BED: FurnitureGroup = ['bed-twin', 'bed-full', 'bed-queen', 'bed-king'];
const BATH_FIXTURES: FurnitureGroup[] = [['toilet'], ['sink-vanity', 'sink-pedestal'], ['bathtub', 'shower-stall']];
const KITCHEN_FIXTURES: FurnitureGroup[] = [['sink-kitchen'], ['stove-range'], ['fridge']];
const LIVING_FURNISHINGS: FurnitureGroup[] = [['sofa-3', 'loveseat', 'armchair']];
const DINING_FURNISHINGS: FurnitureGroup[] = [['dining-table-4', 'dining-table-6', 'dining-table-8']];
const LAUNDRY_FIXTURES: FurnitureGroup[] = [['washer'], ['dryer']];

// Default furnishing requirements per room type — used to prefill briefs and
// as the toggle-on value in the teacher rubric editor. Any room type listed
// here can carry a furnishings requirement.
export const DEFAULT_FURNISHINGS: Partial<Record<string, FurnitureGroup[]>> = {
  'BEDROOM': [ANY_BED, ['dresser']],
  'MASTER BEDROOM': [ANY_BED, ['dresser']],
  'GUEST BEDROOM': [ANY_BED],
  'NURSERY': [['crib']],
  'BATHROOM': BATH_FIXTURES,
  'MASTER BATH': BATH_FIXTURES,
  'HALF BATH': [['toilet'], ['sink-vanity', 'sink-pedestal']],
  'POWDER ROOM': [['toilet'], ['sink-vanity', 'sink-pedestal']],
  'KITCHEN': KITCHEN_FIXTURES,
  'LIVING ROOM': LIVING_FURNISHINGS,
  'FAMILY ROOM': LIVING_FURNISHINGS,
  'GREAT ROOM': LIVING_FURNISHINGS,
  'DINING ROOM': DINING_FURNISHINGS,
  'BREAKFAST NOOK': DINING_FURNISHINGS,
  'OFFICE': [['desk'], ['office-chair']],
  'STUDY': [['desk']],
  'LAUNDRY': LAUNDRY_FIXTURES,
};

export const BRIEFS: Brief[] = [
  {
    id: 'studio',
    title: 'Studio apartment',
    description: 'A ~500 sqft studio unit: one main living space, kitchenette, full bath and a closet.',
    totalSqFt: { min: 400, max: 650 },
    rooms: [
      { roomType: 'LIVING ROOM', count: 1, minDims: { a: 132, b: 120 }, minWindows: 1, furniture: LIVING_FURNISHINGS },
      { roomType: 'KITCHEN', count: 1, minDims: { a: 96, b: 96 }, furniture: KITCHEN_FIXTURES },
      { roomType: 'BATHROOM', count: 1, minDims: { a: 60, b: 96 }, minDoors: 1, furniture: BATH_FIXTURES },
      { roomType: 'CLOSET', count: 1, minDims: { a: 36, b: 36 }, minDoors: 1 },
    ],
    frontDoor: true,
    backDoor: false,
    deliverables: ['floor-plan'],
  },
  {
    id: 'condo-2br',
    title: 'Two-bedroom condo',
    description: 'A ~1,000 sqft two-bedroom condo unit with laundry.',
    totalSqFt: { min: 850, max: 1200 },
    rooms: [
      {
        roomType: 'BEDROOM', count: 2, minDims: { a: 120, b: 120 },
        minWindows: 1, minDoors: 1, furniture: [ANY_BED, ['dresser']], attachedCloset: true,
      },
      { roomType: 'BATHROOM', count: 1, minDims: { a: 60, b: 96 }, minDoors: 1, furniture: BATH_FIXTURES },
      { roomType: 'KITCHEN', count: 1, minDims: { a: 96, b: 120 }, furniture: KITCHEN_FIXTURES },
      { roomType: 'LIVING ROOM', count: 1, minDims: { a: 144, b: 132 }, minWindows: 1, furniture: LIVING_FURNISHINGS },
      { roomType: 'LAUNDRY', count: 1, minDims: { a: 36, b: 60 }, minDoors: 1, furniture: LAUNDRY_FIXTURES },
    ],
    frontDoor: true,
    backDoor: false,
    deliverables: ['floor-plan'],
  },
  {
    id: 'home-2000',
    title: 'Single-story home (2,000–2,500 sqft)',
    description: 'A full single-story house: three bedrooms, two baths, living, dining, kitchen and laundry — with roof plan and elevations.',
    totalSqFt: { min: 2000, max: 2500 },
    rooms: [
      {
        roomType: 'MASTER BEDROOM', count: 1, minDims: { a: 144, b: 144 },
        minWindows: 1, minDoors: 1, furniture: [ANY_BED, ['dresser']], attachedCloset: true,
      },
      {
        roomType: 'BEDROOM', count: 2, minDims: { a: 120, b: 120 },
        minWindows: 1, minDoors: 1, furniture: [ANY_BED], attachedCloset: true,
      },
      { roomType: 'BATHROOM', count: 2, minDims: { a: 60, b: 96 }, minDoors: 1, furniture: BATH_FIXTURES },
      { roomType: 'KITCHEN', count: 1, minDims: { a: 120, b: 144 }, furniture: KITCHEN_FIXTURES },
      { roomType: 'LIVING ROOM', count: 1, minDims: { a: 168, b: 144 }, minWindows: 1, furniture: LIVING_FURNISHINGS },
      { roomType: 'DINING ROOM', count: 1, minDims: { a: 120, b: 144 }, minWindows: 1, furniture: DINING_FURNISHINGS },
      { roomType: 'LAUNDRY', count: 1, minDims: { a: 60, b: 72 }, minDoors: 1, furniture: LAUNDRY_FIXTURES },
      // Drawn onto the plan like any room; its area does NOT count toward the
      // SF target (see NON_LIVING_TYPES). 20×20 fits two cars; teachers can
      // shrink to 12×20 for one car or delete the row to make it optional.
      {
        roomType: 'GARAGE', count: 1, minDims: { a: 240, b: 240 }, minDoors: 2,
        note: 'Draw the garage OUTSIDE the shell — the SF target is for the interior. 1-car ≈ 12\' × 20\', 2-car ≈ 20\' × 20\'. Needs its garage door PLUS an interior door into the house. Garage area is not counted in total SF.',
      },
    ],
    frontDoor: true,
    backDoor: true,
    deliverables: ['floor-plan', 'roof-plan', 'elevations'],
  },
];

// ─── Small local geometry helpers ─────────────────────────────────────────────

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distPointToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPerimeter(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distPointToSeg(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return best;
}

// Largest axis-aligned rectangle that fits inside the polygon, as {w, h} in
// inches. Exact for the common case (axis-aligned rectangle boundary);
// otherwise a 6-inch grid scan with the max-rectangle-in-matrix algorithm —
// this is what stops an L-shaped "12×12" room from passing on its bbox.
function usableDims(poly: Vec2[]): { w: number; h: number } {
  const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const isAxisRect = poly.length === 4 && poly.every((p, i) => {
    const q = poly[(i + 1) % 4];
    return Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01;
  });
  if (isAxisRect) return { w: maxX - minX, h: maxY - minY };

  const STEP = 6;
  const cols = Math.max(1, Math.floor((maxX - minX) / STEP));
  const rows = Math.max(1, Math.floor((maxY - minY) / STEP));
  if (cols * rows > 40000) return { w: maxX - minX, h: maxY - minY }; // degenerate huge poly — fall back to bbox
  // heights[c] = consecutive inside-cells ending at current row, per column.
  const heights = new Array<number>(cols).fill(0);
  let bestW = 0, bestH = 0, bestArea = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = minX + (c + 0.5) * STEP;
      const cy = minY + (r + 0.5) * STEP;
      heights[c] = pointInPolygon({ x: cx, y: cy }, poly) ? heights[c] + 1 : 0;
    }
    // Max rectangle in histogram (O(cols²) is fine at this scale).
    for (let c = 0; c < cols; c++) {
      let minH = Infinity;
      for (let k = c; k < cols; k++) {
        minH = Math.min(minH, heights[k]);
        if (minH === 0) break;
        const area = (k - c + 1) * minH;
        if (area > bestArea) { bestArea = area; bestW = (k - c + 1) * STEP; bestH = minH * STEP; }
      }
    }
  }
  return { w: bestW, h: bestH };
}

const fmtFt = (inches: number) => `${Math.floor(inches / 12)}'${Math.round(inches % 12) ? `-${Math.round(inches % 12)}"` : ''}`;

// ─── Room resolution ──────────────────────────────────────────────────────────

interface ResolvedRoom {
  label: RoomLabel;
  poly: Vec2[] | null;
  sqFt: number | null;
  // Open-plan flag: the auto-detected boundary swallowed ANOTHER room's label
  // (kitchen flowing into living room, etc.). The student must draw this
  // room's boundary manually before its checks can give honest feedback —
  // otherwise areas double-count. Never set on user-drawn boundaries.
  needsBoundary: boolean;
}

function resolveRooms(level: Level): ResolvedRoom[] {
  const resolved = level.roomLabels.map(label => {
    const poly = label.boundary ?? autoDetectRoomBoundary(label.position, level.walls);
    return {
      label,
      poly,
      sqFt: label.squareFeet ?? (poly ? polygonAreaSqFt(poly) : null),
      needsBoundary: false,
    };
  });
  for (const r of resolved) {
    if (r.label.boundary || !r.poly) continue;
    r.needsBoundary = resolved.some(other =>
      other !== r && pointInPolygon(other.label.position, r.poly!));
  }
  return resolved;
}

// World point of an opening (door/window) on its wall's centerline.
function openingPoint(level: Level, o: Door | Window): { p: Vec2; tol: number } | null {
  const w = level.walls.find(x => x.id === o.wallId);
  if (!w) return null;
  const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
  if (len < 1e-6) return null;
  const t = o.positionAlong / len;
  return {
    p: { x: w.start.x + (w.end.x - w.start.x) * t, y: w.start.y + (w.end.y - w.start.y) * t },
    // The opening sits on the wall centerline; the room polygon runs along the
    // wall FACE, so allow half thickness + slack.
    tol: w.thickness / 2 + 4,
  };
}

function openingsOnRoom(level: Level, room: ResolvedRoom, openings: Array<Door | Window>): number {
  if (!room.poly) return 0;
  let n = 0;
  for (const o of openings) {
    const op = openingPoint(level, o);
    if (op && distToPerimeter(op.p, room.poly) <= op.tol) n++;
  }
  return n;
}

function furnitureInRoom(room: ResolvedRoom, furniture: FurnitureItem[]): FurnitureItem[] {
  if (!room.poly) return [];
  return furniture.filter(f => pointInPolygon(f.position, room.poly!));
}

// Exterior doors: entry doors and exterior-style sliding patio doors.
function exteriorDoors(level: Level): Door[] {
  return level.doors.filter(d =>
    d.doorType === 'entry' || (d.doorType === 'sliding' && d.slideStyle === 'exterior'));
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

const CLOSET_TYPES = new Set(['CLOSET', 'WALK-IN CLOSET']);
// Unfinished / outdoor spaces excluded from the total-SF (living area) sum.
const NON_LIVING_TYPES = new Set(['GARAGE', 'DECK', 'PATIO', 'PORCH', 'BALCONY']);
const BEDROOM_TYPES = new Set(['BEDROOM', 'MASTER BEDROOM', 'GUEST BEDROOM', 'NURSERY']);
const BATH_TYPES = new Set(['BATHROOM', 'MASTER BATH', 'HALF BATH', 'POWDER ROOM']);
// Rooms that are themselves circulation — an added hallway/foyer doesn't
// need a door of its own.
const CIRCULATION_TYPES = new Set(['HALLWAY', 'FOYER', 'ENTRY', 'STAIRS', 'LANDING']);
const FURNITURE_NAMES: Partial<Record<FurnitureKind, string>> = {
  'bed-twin': 'bed', 'bed-full': 'bed', 'bed-queen': 'bed', 'bed-king': 'bed',
  'sink-vanity': 'sink', 'sink-pedestal': 'sink', 'sink-kitchen': 'sink',
  'stove-range': 'stove', 'shower-stall': 'shower', 'bathtub': 'tub',
  'sofa-3': 'sofa', 'loveseat': 'sofa', 'armchair': 'armchair',
  'dining-table-4': 'dining table', 'dining-table-6': 'dining table', 'dining-table-8': 'dining table',
  'office-chair': 'chair',
};
const groupName = (g: FurnitureGroup) =>
  [...new Set(g.map(k => FURNITURE_NAMES[k] ?? k))].join(' or ');

export function evaluateBrief(level: Level, brief: Brief): RubricCheck[] {
  const checks: RubricCheck[] = [];
  const rooms = resolveRooms(level);
  const roomsOf = (type: string) =>
    rooms.filter(r => r.label.name.toUpperCase().trim() === type);

  // ── Overall section ──
  if (brief.totalSqFt) {
    const { min, max } = brief.totalSqFt;
    const openPlan = rooms.filter(r => r.needsBoundary);
    const tracedFp = buildRoofFootprint(level, 0);
    // With no traceable footprint the total falls back to summing rooms —
    // which double-counts open-plan spaces until boundaries are drawn.
    if (!tracedFp && openPlan.length > 0) {
      checks.push({
        id: 'total-sf', group: 'OVERALL',
        label: `Total area ${min.toLocaleString()}–${max.toLocaleString()} SF`,
        status: 'fail',
        detail: `Draw boundaries for open spaces first: ${openPlan.map(r => r.label.name).join(', ')}`,
      });
    } else {
      // Total area comes from the BUILDING FOOTPRINT (the enclosed structure)
      // when one can be traced — a student who picked a 2,182 SF shell simply
      // HAS 2,182 SF; labeling rooms shouldn't move the number, and summing
      // rooms would punish wall thickness and unlabeled circulation space.
      // Garage/outdoor rooms attached to the structure are subtracted (GLA
      // convention). Falls back to summing labeled rooms with no footprint.
      const fp = tracedFp;
      let total: number;
      let detail: string;
      if (fp) {
        let area = 0;
        const poly = fp.centerline;
        for (let i = 0; i < poly.length; i++) {
          const p = poly[i], q = poly[(i + 1) % poly.length];
          area += p.x * q.y - q.x * p.y;
        }
        let sf = Math.abs(area / 2) / 144;
        // Subtract attached non-living rooms (garage bump traced into the
        // footprint). Detached ones (patio floating off-structure) aren't in
        // the footprint, so only subtract rooms whose center sits inside it.
        let excluded = 0;
        for (const r of rooms) {
          if (!NON_LIVING_TYPES.has(r.label.name.toUpperCase().trim())) continue;
          if (r.poly && pointInPolygon(r.label.position, poly)) {
            sf -= r.sqFt ?? 0;
            excluded++;
          }
        }
        total = sf;
        detail = `Building footprint ${Math.round(sf).toLocaleString()} SF`
          + (excluded > 0 ? ' (garage/outdoor spaces not counted)' : '');
      } else {
        const living = rooms.filter(r => !NON_LIVING_TYPES.has(r.label.name.toUpperCase().trim()));
        const excluded = rooms.length - living.length;
        total = living.reduce((s, r) => s + (r.sqFt ?? 0), 0);
        detail = `Labeled rooms total ${Math.round(total).toLocaleString()} SF`
          + (excluded > 0 ? ' (garage/outdoor spaces not counted)' : '');
      }
      checks.push({
        id: 'total-sf', group: 'OVERALL',
        label: `Total area ${min.toLocaleString()}–${max.toLocaleString()} SF`,
        status: total >= min && total <= max ? 'pass' : 'fail',
        detail,
      });
    }
  }
  const ext = exteriorDoors(level);
  if (brief.frontDoor) {
    checks.push({
      id: 'front-door', group: 'OVERALL', label: 'Front door',
      status: ext.length >= 1 ? 'pass' : 'fail',
      detail: ext.length >= 1
        ? `${ext.length} exterior door${ext.length > 1 ? 's' : ''} placed`
        : 'Place an Entry door (or exterior sliding door)',
    });
  }
  if (brief.backDoor) {
    checks.push({
      id: 'back-door', group: 'OVERALL', label: 'Back door',
      status: ext.length >= 2 ? 'pass' : 'fail',
      detail: ext.length >= 2 ? 'Second exterior door placed' : 'Needs a second exterior door',
    });
  }

  // ── Door-access accounting ──────────────────────────────────────────────
  // A door "gets you into" a room only if its other side isn't a closet —
  // and for bedrooms, isn't an ensuite bathroom either. Otherwise a master
  // bedroom with a closet door + bath door but no way IN reads as ✓.
  const doorRooms = new Map<string, ResolvedRoom[]>();
  for (const d of level.doors) {
    const op = openingPoint(level, d);
    if (!op) continue;
    doorRooms.set(d.id, rooms.filter(r =>
      r.poly && !r.needsBoundary && distToPerimeter(op.p, r.poly) <= op.tol));
  }
  const accessDoorCount = (r: ResolvedRoom): number => {
    const rType = r.label.name.toUpperCase().trim();
    let n = 0;
    for (const d of level.doors) {
      const rs = doorRooms.get(d.id) ?? [];
      if (!rs.includes(r)) continue;
      const others = rs.filter(x => x !== r).map(x => x.label.name.toUpperCase().trim());
      if (others.some(t => CLOSET_TYPES.has(t))) continue;
      if (BEDROOM_TYPES.has(rType) && others.some(t => BATH_TYPES.has(t))) continue;
      n++;
    }
    return n;
  };

  // ── Per-room-type sections ──
  const closets = rooms.filter(r => CLOSET_TYPES.has(r.label.name.toUpperCase().trim()));
  for (const req of brief.rooms) {
    const group = req.count > 1 ? `${req.roomType} ×${req.count}` : req.roomType;
    const matched = roomsOf(req.roomType);

    checks.push({
      id: `${req.roomType}-count`, group,
      label: req.count > 1 ? `${req.count} rooms labeled` : 'Room labeled',
      status: matched.length >= req.count ? 'pass' : 'fail',
      detail: `${matched.length} of ${req.count} labeled (with square footage)`,
      note: req.note,
    });
    if (matched.length === 0) continue; // sub-checks are meaningless with no rooms

    // Sub-checks can't fully pass while rooms are still missing — with 1 of 2
    // bedrooms drawn, "at least 10×10 ✓" would be a lie about the room that
    // doesn't exist yet. They stay red with a "waiting on N more" note.
    const missing = Math.max(0, req.count - matched.length);
    const subStatus = (okSoFar: boolean): 'pass' | 'fail' =>
      missing === 0 && okSoFar ? 'pass' : 'fail';
    const subDetail = (okSoFar: boolean, passDetail: string, failDetail: string): string =>
      okSoFar && missing > 0
        ? `OK so far — waiting on ${missing} more room${missing > 1 ? 's' : ''}`
        : okSoFar ? passDetail : failDetail;

    const unresolved = matched.filter(r => !r.poly);
    if (unresolved.length > 0) {
      checks.push({
        id: `${req.roomType}-boundary`, group,
        label: 'Room boundary detected',
        status: 'fail',
        detail: 'Could not find this room’s walls — enclose it or draw its boundary',
      });
      continue;
    }
    const openPlan = matched.filter(r => r.needsBoundary);
    if (openPlan.length > 0) {
      checks.push({
        id: `${req.roomType}-open-boundary`, group,
        label: 'Boundary drawn',
        status: 'fail',
        detail: 'Open space — draw this room’s boundary so it can be checked',
      });
      continue;
    }

    if (req.minDims) {
      const need = [Math.min(req.minDims.a, req.minDims.b), Math.max(req.minDims.a, req.minDims.b)];
      let worstShortfall = 0;
      const bad = matched.filter(r => {
        const { w, h } = usableDims(r.poly!);
        const shortfall = Math.max(need[0] - Math.min(w, h), need[1] - Math.max(w, h));
        if (shortfall <= 0.5) return false;
        worstShortfall = Math.max(worstShortfall, shortfall);
        return true;
      });
      // A near-miss is almost always outer-drawn walls: rooms measure INSIDE
      // face-to-face, so a room drawn 20'×20' outside is ~19'3" clear. Teach
      // it instead of leaving a mystery fail.
      const nearMiss = bad.length > 0 && worstShortfall <= 12;
      checks.push({
        id: `${req.roomType}-dims`, group,
        label: `At least ${fmtFt(req.minDims.a)} × ${fmtFt(req.minDims.b)}`,
        status: subStatus(bad.length === 0),
        detail: subDetail(bad.length === 0,
          'All meet the minimum',
          `${bad.length} of ${matched.length} too small`
            + (nearMiss ? ' — rooms measure inside the walls, so draw a little bigger to allow for wall thickness' : '')),
      });
    }

    if (req.minWindows) {
      const bad = matched.filter(r => openingsOnRoom(level, r, level.windows) < req.minWindows!);
      checks.push({
        id: `${req.roomType}-windows`, group,
        label: req.minWindows > 1 ? `${req.minWindows}+ windows` : 'Has a window',
        status: subStatus(bad.length === 0),
        detail: subDetail(bad.length === 0,
          'Every room has one', `${bad.length} of ${matched.length} missing windows`),
      });
    }

    if (req.roomType === 'GARAGE') {
      // Garages get SPECIFIC door checks instead of a generic count: the
      // overhead garage door, and a regular door connecting into the house.
      const garageDoors = level.doors.filter(d => d.doorType === 'garage');
      const houseDoors = level.doors.filter(d => d.doorType !== 'garage');
      const badG = matched.filter(r => openingsOnRoom(level, r, garageDoors) < 1);
      checks.push({
        id: 'GARAGE-garage-door', group,
        label: 'Has a garage door',
        status: subStatus(badG.length === 0),
        detail: subDetail(badG.length === 0,
          'Overhead door placed', 'Place a Garage door (door tool → Garage door)'),
      });
      const badH = matched.filter(r => openingsOnRoom(level, r, houseDoors) < 1);
      checks.push({
        id: 'GARAGE-house-door', group,
        label: 'Door into the house',
        status: subStatus(badH.length === 0),
        detail: subDetail(badH.length === 0,
          'Access door placed', 'Add a regular door connecting the garage to the house'),
      });
    } else if (req.minDoors) {
      const bad = matched.filter(r => accessDoorCount(r) < req.minDoors!);
      const isBedroom = BEDROOM_TYPES.has(req.roomType);
      checks.push({
        id: `${req.roomType}-doors`, group,
        label: req.minDoors > 1 ? `${req.minDoors}+ doors` : 'Has a door',
        status: subStatus(bad.length === 0),
        detail: subDetail(bad.length === 0,
          'Every room has one',
          `${bad.length} of ${matched.length} missing doors`
            + (isBedroom ? ' — closet/bathroom doors don’t count as the way in' : '')),
      });
    }

    if (req.furniture) {
      for (const g of req.furniture) {
        const bad = matched.filter(r =>
          !furnitureInRoom(r, level.furniture).some(f => g.includes(f.kind)));
        checks.push({
          id: `${req.roomType}-furn-${g[0]}`, group,
          label: `Has ${groupName(g)}`,
          status: subStatus(bad.length === 0),
          detail: subDetail(bad.length === 0,
            'Placed in every room', `Missing in ${bad.length} of ${matched.length}`),
        });
      }
    }

    if (req.attachedCloset) {
      // A closet is attached when some door sits on BOTH the room's and the
      // closet's perimeter (i.e. it connects them through a shared wall).
      const bad = matched.filter(room => {
        if (!room.poly) return true;
        return !closets.some(cl => {
          if (!cl.poly) return false;
          return level.doors.some(d => {
            const op = openingPoint(level, d);
            return op != null &&
              distToPerimeter(op.p, room.poly!) <= op.tol &&
              distToPerimeter(op.p, cl.poly!) <= op.tol;
          });
        });
      });
      checks.push({
        id: `${req.roomType}-closet`, group,
        label: 'Attached closet',
        status: subStatus(bad.length === 0),
        detail: subDetail(bad.length === 0, 'Closet connected by a door',
          `${bad.length} of ${matched.length} without a closet (label it CLOSET, connect with a door)`),
      });
    }
  }

  // ── Rooms added beyond the brief ─────────────────────────────────────────
  // A half bath, mudroom or hallway the student adds still carries the
  // standard rules for its type: default furnishings (half bath → toilet +
  // sink), and hallways must be at least 3' wide. Types with no applicable
  // rules (closets, storage, …) don't clutter the panel.
  const coveredTypes = new Set(brief.rooms.map(r => r.roomType));
  const extrasByType = new Map<string, ResolvedRoom[]>();
  for (const r of rooms) {
    const t = r.label.name.toUpperCase().trim();
    if (coveredTypes.has(t) || CLOSET_TYPES.has(t)) continue;
    if (!extrasByType.has(t)) extrasByType.set(t, []);
    extrasByType.get(t)!.push(r);
  }
  for (const [t, rs] of extrasByType) {
    const group = `${t}${rs.length > 1 ? ` ×${rs.length}` : ''} — added`;
    const usable = rs.filter(r => r.poly && !r.needsBoundary);
    if (t === 'HALLWAY') {
      const bad = usable.filter(r => {
        const { w, h } = usableDims(r.poly!);
        return Math.min(w, h) < 36 - 0.5;
      });
      checks.push({
        id: 'HALLWAY-width', group,
        label: 'At least 3\' wide',
        status: bad.length === 0 && usable.length === rs.length ? 'pass' : 'fail',
        detail: bad.length === 0
          ? 'Hallways are wide enough'
          : `${bad.length} of ${rs.length} narrower than 3'`,
      });
    }
    // Any added functional room needs a way in (circulation rooms exempt).
    if (!CIRCULATION_TYPES.has(t) && !NON_LIVING_TYPES.has(t)) {
      const bad = usable.filter(r => accessDoorCount(r) < 1);
      checks.push({
        id: `${t}-extra-door`, group,
        label: 'Has a door',
        status: bad.length === 0 && usable.length === rs.length ? 'pass' : 'fail',
        detail: bad.length === 0 ? 'Every room has one' : `${bad.length} of ${rs.length} missing doors`,
      });
    }
    const furn = DEFAULT_FURNISHINGS[t];
    if (furn) {
      for (const g of furn) {
        const bad = usable.filter(r =>
          !furnitureInRoom(r, level.furniture).some(f => g.includes(f.kind)));
        checks.push({
          id: `${t}-extra-furn-${g[0]}`, group,
          label: `Has ${groupName(g)}`,
          status: bad.length === 0 && usable.length === rs.length ? 'pass' : 'fail',
          detail: bad.length === 0 ? 'Placed in every room' : `Missing in ${bad.length} of ${rs.length}`,
        });
      }
    }
  }

  return checks;
}
