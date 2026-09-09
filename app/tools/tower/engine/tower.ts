// Tower Builder — layout constants and geometry helpers.
//
// The tower stands on a ground line and is crushed from above by a press
// plate. Everything here lives in the same fixed 1150×650 canvas space the
// Bridge Builder uses, so the shared editor/render code needs no changes.
//
// Vertical scale is fixed in pixels: whatever height the student picks, the
// target-height line sits at TOP_Y and the ground at GROUND_Y, so the tower
// always fills the canvas. Pixels-per-foot therefore depends on the height.

import { type Node } from "@/app/tools/bridge/engine/members";

export const CANVAS_WIDTH = 1150;
export const CANVAS_HEIGHT = 650;
export const GROUND_Y = 560;
export const TOP_Y = 80;
export const DESIGN_PX_HEIGHT = GROUND_Y - TOP_Y; // 480
export const CENTER_X = 575;

export const HEIGHT_OPTIONS = [20, 30, 40, 50, 60] as const;
export type HeightFeet = (typeof HEIGHT_OPTIONS)[number];
// 25 ft was dropped: no grid-friendly bracing pattern keeps every member
// under the shared ~12 ft length rule at that width with the default tube.
export const FOOTPRINT_OPTIONS = [10, 15, 20] as const;
export type FootprintFeet = (typeof FOOTPRINT_OPTIONS)[number];
export const INITIAL_HEIGHT_FEET: HeightFeet = 30;
export const INITIAL_FOOTPRINT_FEET: FootprintFeet = 15;

export function getPxPerFt(heightFt: number): number {
  return DESIGN_PX_HEIGHT / heightFt;
}

/** Left/right canvas x of the allowed design box (the footprint), centered. */
export function getFootprintBounds(
  heightFt: number,
  footprintFt: number
): { left: number; right: number } {
  const half = (footprintFt * getPxPerFt(heightFt)) / 2;
  return { left: CENTER_X - half, right: CENTER_X + half };
}

// Fixed site cost charged before any steel is placed: foundation scales with
// the footprint, crane/erection with the height. Same spirit as the bridge's
// per-foot site cost so budgets feel familiar across the two tools.
export const SITE_COST_PER_FOOTPRINT_FOOT = 2000;
export const SITE_COST_PER_HEIGHT_FOOT = 500;
export function getTowerSiteCost(heightFt: number, footprintFt: number): number {
  return (
    footprintFt * SITE_COST_PER_FOOTPRINT_FOOT +
    heightFt * SITE_COST_PER_HEIGHT_FOOT
  );
}

export const LINE_TOL = 0.5;
export function isGroundNode(n: Pick<Node, "y">): boolean {
  return Math.abs(n.y - GROUND_Y) < LINE_TOL;
}
export function isTopNode(n: Pick<Node, "y">): boolean {
  return Math.abs(n.y - TOP_Y) < LINE_TOL;
}

function nearestOption<T extends readonly number[]>(options: T, value: unknown): T[number] {
  const v = Number(value);
  let best: T[number] = options[0];
  if (!Number.isFinite(v)) return best;
  let bestDiff = Math.abs(v - best);
  for (const opt of options) {
    const d = Math.abs(v - opt);
    if (d < bestDiff) {
      best = opt;
      bestDiff = d;
    }
  }
  return best;
}
export function normalizeHeightFeet(value: unknown): HeightFeet {
  return nearestOption(HEIGHT_OPTIONS, value) as HeightFeet;
}
export function normalizeFootprintFeet(value: unknown): FootprintFeet {
  return nearestOption(FOOTPRINT_OPTIONS, value) as FootprintFeet;
}
