// Parametric shell (perimeter) library for Blueprint Lab assignments.
// A shell is a closed loop of exterior walls sized to a brief's target square
// footage. Teachers pick which shells students may use (or fix one for the
// whole class); students design the interior. See
// docs/BLUEPRINT_LAB_ASSIGNMENTS_PLAN.md — shells are meant to be locked
// (enforcement is a follow-up; for now they're seeded as ordinary walls).
//
// All dimensions in inches. Shapes are drawn around the origin so the fit-on-
// mount viewport centers them.

import { DEFAULT_WALL_HEIGHT, DEFAULT_WALL_THICKNESS, Vec2, Wall, makeId } from './types';

export interface ShellDef {
  id: string;
  label: string;
  // Rough proportions at 1,000 sqft — actual size scales to the brief target.
  describe: string;
  // Below this target area the shape stops making sense (wings become
  // hallway-width). Used to filter the shape choices offered per brief.
  minSqFt: number;
  // Asymmetric shapes offer a mirrored (left/right) variant, like real
  // communities flip the same floor plan across the street.
  mirrorable?: boolean;
  // Returns the perimeter polygon (clockwise, closed implicitly) for a target
  // interior area in square feet. `ratioScale` stretches the base width:depth
  // proportion (1 = standard; ~1.4 = a longer, shallower version) so one
  // shape yields visibly different footprints.
  outline: (targetSqFt: number, ratioScale?: number) => Vec2[];
}

// Options that pin down one concrete shell from a shape family.
export interface ShellVariant {
  shellId: string;
  sqFt: number;
  mirror?: boolean;
  ratioScale?: number;
}

// Solve a rectangle of `ratio` (w:d) whose area is targetSqFt, snapped to
// EVEN whole feet — shapes are centered on the origin at ±w/2, so even-foot
// overall dims put EVERY vertex on a whole foot. That keeps all edges landing
// on the paper starter sheet's 1-square-=-1-foot grid, so students count whole
// boxes instead of half-boxing (2026-09-02 feedback).
function rectFor(targetSqFt: number, ratio: number): { w: number; d: number } {
  const areaIn2 = targetSqFt * 144;
  const d = Math.sqrt(areaIn2 / ratio);
  const w = d * ratio;
  const snap = (v: number) => Math.round(v / 24) * 24;
  return { w: snap(w), d: snap(d) };
}

const half = (v: number) => Math.round(v / 24) * 12;   // half, snapped to whole feet
const halfEven = (v: number) => Math.round(v / 48) * 24; // half, snapped to EVEN feet (for ±x/2 symmetric spans)

export const SHELLS: ShellDef[] = [
  {
    id: 'ranch',
    minSqFt: 300,
    label: 'Ranch (rectangle)',
    describe: 'Simple full-width rectangle — the classic single-story ranch.',
    outline: (sf, rs = 1) => {
      const { w, d } = rectFor(sf, 2.0 * rs);
      return [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 },
      ];
    },
  },
  {
    id: 'square',
    minSqFt: 300,
    label: 'Square',
    describe: 'Compact near-square footprint — shortest exterior walls for the area.',
    outline: (sf, rs = 1) => {
      const { w, d } = rectFor(sf, 1.15 * rs);
      return [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 },
      ];
    },
  },
  {
    id: 'l-shape',
    minSqFt: 650,
    label: 'L-shape',
    mirrorable: true,
    describe: 'Two wings meeting at a corner — makes a natural front porch nook.',
    outline: (sf, rs = 1) => {
      // Big rect (w × d) minus a notch (w/2 × d/2) at one corner = 3/4 area.
      const { w, d } = rectFor(sf / 0.75, 1.6 * rs);
      const nw = half(w), nd = half(d);
      return [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 - nd }, { x: w / 2 - nw, y: d / 2 - nd },
        { x: w / 2 - nw, y: d / 2 }, { x: -w / 2, y: d / 2 },
      ];
    },
  },
  {
    id: 't-shape',
    minSqFt: 1000,
    label: 'T-shape',
    describe: 'Center wing off a long bar — good for separating bedrooms from living space.',
    outline: (sf, rs = 1) => {
      // Bar (w × bd) + stem (sw × sd) centered below. Bar 2/3 of area.
      const { w, d: bd } = rectFor(sf * (2 / 3), 2.6 * rs);
      const sw = halfEven(w);   // stem spans ±sw/2 → must be even feet
      const sd = Math.round(((sf / 3) * 144) / sw / 12) * 12;
      return [
        { x: -w / 2, y: -bd / 2 }, { x: w / 2, y: -bd / 2 },
        { x: w / 2, y: bd / 2 }, { x: sw / 2, y: bd / 2 },
        { x: sw / 2, y: bd / 2 + sd }, { x: -sw / 2, y: bd / 2 + sd },
        { x: -sw / 2, y: bd / 2 }, { x: -w / 2, y: bd / 2 },
      ];
    },
  },
  {
    id: 'u-shape',
    minSqFt: 1200,
    label: 'U-shape (courtyard)',
    describe: 'Two wings around a recessed entry courtyard.',
    outline: (sf, rs = 1) => {
      // Full rect minus a centered notch on the front: notch w/3 × d/2.
      // Area = w·d − (w/3)(d/2) = (5/6)·w·d.
      const { w, d } = rectFor(sf / (5 / 6), 1.5 * rs);
      const nw = Math.round(w / 3 / 24) * 24, nd = half(d);   // notch spans ±nw/2 → even feet
      return [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 }, { x: nw / 2, y: d / 2 },
        { x: nw / 2, y: d / 2 - nd }, { x: -nw / 2, y: d / 2 - nd },
        { x: -nw / 2, y: d / 2 }, { x: -w / 2, y: d / 2 },
      ];
    },
  },
  {
    id: 'wide-l',
    minSqFt: 1000,
    label: 'Wide L (split wings)',
    mirrorable: true,
    describe: 'Long shallow bar with a deep garage-side wing.',
    outline: (sf, rs = 1) => {
      // Keeps nw (58% of w); the removed notch is (w−nw) × nd = 0.42·0.4 ≈ 16.8%.
      const { w, d } = rectFor(sf / 0.832, 2.2 * rs);
      const nw = Math.round(w * 0.58 / 12) * 12, nd = Math.round(d * 0.4 / 12) * 12;
      return [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 }, { x: -w / 2 + (w - nw), y: d / 2 },
        { x: -w / 2 + (w - nw), y: d / 2 - nd }, { x: -w / 2, y: d / 2 - nd },
      ];
    },
  },
];

export const shellById = (id: string) => SHELLS.find(s => s.id === id) ?? null;

// Final perimeter polygon for a concrete variant (ratio stretch + mirror).
export function shellOutline(v: ShellVariant): Vec2[] {
  const def = shellById(v.shellId);
  if (!def) return [];
  const pts = def.outline(v.sqFt, v.ratioScale ?? 1);
  return v.mirror ? pts.map(p => ({ x: -p.x, y: p.y })) : pts;
}

// Actual built stats for a shell variant: overall bounding width × depth
// (inches) and true enclosed square footage. Shown to teachers when picking
// shapes and to students in the shell chooser, so nobody has to measure the
// plan to learn what they're getting.
export function shellStats(v: ShellVariant): { widthIn: number; depthIn: number; sqFt: number } | null {
  const pts = shellOutline(v);
  if (pts.length === 0) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    area += p.x * q.y - q.x * p.y;
  }
  return {
    widthIn: Math.max(...xs) - Math.min(...xs),
    depthIn: Math.max(...ys) - Math.min(...ys),
    sqFt: Math.round(Math.abs(area / 2) / 144),
  };
}

export const formatShellStats = (s: { widthIn: number; depthIn: number; sqFt: number }) =>
  `${Math.round(s.widthIn / 12)}' × ${Math.round(s.depthIn / 12)}' · ${s.sqFt.toLocaleString()} SF`;

// The concrete options a student sees after clicking a shape: two sizes
// inside the brief's range × (mirrored | proportion) variants — like a real
// community offering the same plan flipped or stretched.
export function shellVariants(shellId: string, sqFtMin: number, sqFtMax: number): ShellVariant[] {
  const def = shellById(shellId);
  if (!def) return [];
  const round25 = (v: number) => Math.round(v / 25) * 25;
  const span = Math.max(0, sqFtMax - sqFtMin);
  const sfA = round25(sqFtMin + span * 0.25);
  const sfB = round25(sqFtMin + span * 0.75);
  if (def.mirrorable) {
    return [
      { shellId, sqFt: sfA },
      { shellId, sqFt: sfA, mirror: true },
      { shellId, sqFt: sfB, ratioScale: 1.35 },
      { shellId, sqFt: sfB, ratioScale: 1.35, mirror: true },
    ];
  }
  return [
    { shellId, sqFt: sfA },
    { shellId, sqFt: sfA, ratioScale: 1.4 },
    { shellId, sqFt: sfB },
    { shellId, sqFt: sfB, ratioScale: 1.4 },
  ];
}

// ── Assignment shell selections ───────────────────────────────────────────────
// An assignment's shell_ids entries name either a whole shape family ('ranch'
// = every variant the picker generates) or one concrete variant ('ranch#2' =
// index 2 of shellVariants(...)). Teachers narrow the offered/printed set this
// way with no schema change; old rows (plain ids) keep meaning "all versions".

export interface ShellChoice {
  shellId: string;
  indices: number[] | null;   // null = every variant
}

export function parseShellIds(ids: string[]): ShellChoice[] {
  const map = new Map<string, number[] | null>();
  for (const raw of ids) {
    const m = /^(.+)#(\d+)$/.exec(raw);
    const id = m ? m[1] : raw;
    const idx = m ? Number(m[2]) : null;
    if (!map.has(id)) map.set(id, idx == null ? null : [idx]);
    else {
      const cur = map.get(id);
      if (idx == null) map.set(id, null);          // plain id wins → all variants
      else if (cur) { if (!cur.includes(idx)) cur.push(idx); }
      // cur === null → already "all"; a #idx entry can't narrow it back down.
    }
  }
  return [...map].map(([shellId, indices]) => ({
    shellId,
    indices: indices ? [...indices].sort((a, b) => a - b) : null,
  }));
}

// The concrete variants a selection allows, with each variant's ORIGINAL index
// (version letters must match the in-app picker: A = index 0, etc.).
export function allowedShellVariants(choice: ShellChoice, sqFtMin: number, sqFtMax: number): { v: ShellVariant; idx: number }[] {
  const all = shellVariants(choice.shellId, sqFtMin, sqFtMax).map((v, idx) => ({ v, idx }));
  return choice.indices ? all.filter(x => choice.indices!.includes(x.idx)) : all;
}

// Build the exterior wall loop for a shell variant. Same thickness/height as
// every other wall in the program — mismatched shells make ugly junction
// indents where interior walls meet them.
export function buildShellWalls(v: ShellVariant, levelId: string): Wall[] {
  const pts = shellOutline(v);
  return pts.map((p, i) => ({
    id: makeId('wall'),
    levelId,
    start: { ...p },
    end: { ...pts[(i + 1) % pts.length] },
    thickness: DEFAULT_WALL_THICKNESS,
    height: DEFAULT_WALL_HEIGHT,
    type: 'wall' as const,
    status: 'proposed' as const,
    locked: true,
  }));
}
