// Parametric shell (perimeter) library for Blueprint Lab assignments.
// A shell is a closed loop of exterior walls sized to a brief's target square
// footage. Teachers pick which shells students may use (or fix one for the
// whole class); students design the interior. See
// docs/BLUEPRINT_LAB_ASSIGNMENTS_PLAN.md — shells are meant to be locked
// (enforcement is a follow-up; for now they're seeded as ordinary walls).
//
// All dimensions in inches. Shapes are drawn around the origin so the fit-on-
// mount viewport centers them.

import { Vec2, Wall, makeId } from './types';

export interface ShellDef {
  id: string;
  label: string;
  // Rough proportions at 1,000 sqft — actual size scales to the brief target.
  describe: string;
  // Below this target area the shape stops making sense (wings become
  // hallway-width). Used to filter the shape choices offered per brief.
  minSqFt: number;
  // Returns the perimeter polygon (clockwise, closed implicitly) for a target
  // interior area in square feet.
  outline: (targetSqFt: number) => Vec2[];
}

// Solve a rectangle of `ratio` (w:d) whose area is targetSqFt, snapped to 6".
function rectFor(targetSqFt: number, ratio: number): { w: number; d: number } {
  const areaIn2 = targetSqFt * 144;
  const d = Math.sqrt(areaIn2 / ratio);
  const w = d * ratio;
  const snap = (v: number) => Math.round(v / 6) * 6;
  return { w: snap(w), d: snap(d) };
}

const half = (v: number) => Math.round(v / 12) * 6; // half, snapped to 6"

export const SHELLS: ShellDef[] = [
  {
    id: 'ranch',
    minSqFt: 300,
    label: 'Ranch (rectangle)',
    describe: 'Simple full-width rectangle — the classic single-story ranch.',
    outline: (sf) => {
      const { w, d } = rectFor(sf, 2.0);
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
    outline: (sf) => {
      const { w, d } = rectFor(sf, 1.15);
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
    describe: 'Two wings meeting at a corner — makes a natural front porch nook.',
    outline: (sf) => {
      // Big rect (w × d) minus a notch (w/2 × d/2) at one corner = 3/4 area.
      const { w, d } = rectFor(sf / 0.75, 1.6);
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
    outline: (sf) => {
      // Bar (w × bd) + stem (sw × sd) centered below. Bar 2/3 of area.
      const { w, d: bd } = rectFor(sf * (2 / 3), 2.6);
      const sw = half(w);
      const sd = Math.round(((sf / 3) * 144) / sw / 6) * 6;
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
    outline: (sf) => {
      // Full rect minus a centered notch on the front: notch w/3 × d/2.
      // Area = w·d − (w/3)(d/2) = (5/6)·w·d.
      const { w, d } = rectFor(sf / (5 / 6), 1.5);
      const nw = Math.round(w / 3 / 6) * 6, nd = half(d);
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
    describe: 'Long shallow bar with a deep garage-side wing.',
    outline: (sf) => {
      // Keeps nw (58% of w); the removed notch is (w−nw) × nd = 0.42·0.4 ≈ 16.8%.
      const { w, d } = rectFor(sf / 0.832, 2.2);
      const nw = Math.round(w * 0.58 / 6) * 6, nd = Math.round(d * 0.4 / 6) * 6;
      return [
        { x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 }, { x: -w / 2 + (w - nw), y: d / 2 },
        { x: -w / 2 + (w - nw), y: d / 2 - nd }, { x: -w / 2, y: d / 2 - nd },
      ];
    },
  },
];

export const shellById = (id: string) => SHELLS.find(s => s.id === id) ?? null;

// Actual built stats for a shell at a target area: overall bounding width ×
// depth (inches) and true enclosed square footage. Shown to teachers when
// picking shapes and to students in the shell chooser, so nobody has to
// measure the plan to learn what they're getting.
export function shellStats(shellId: string, targetSqFt: number): { widthIn: number; depthIn: number; sqFt: number } | null {
  const def = shellById(shellId);
  if (!def) return null;
  const pts = def.outline(targetSqFt);
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

// Build the exterior wall loop for a shell at a target square footage.
// 6" exterior walls, 9' plate height — generic single-story defaults.
export function buildShellWalls(shellId: string, targetSqFt: number, levelId: string): Wall[] {
  const def = shellById(shellId);
  if (!def) return [];
  const pts = def.outline(targetSqFt);
  return pts.map((p, i) => ({
    id: makeId('wall'),
    levelId,
    start: { ...p },
    end: { ...pts[(i + 1) % pts.length] },
    thickness: 6,
    height: 108,
    type: 'wall' as const,
    status: 'proposed' as const,
    locked: true,
  }));
}
