// Electronics Lab circuit engine — pure TypeScript, no React.
// Parts live on an integer grid; terminals are grid points.

export interface Pt {
  x: number;
  y: number;
}

export type PartKind = 'battery' | 'bulb' | 'switch' | 'wire' | 'resistor' | 'material';

export interface Part {
  id: string;
  kind: PartKind;
  /** Terminal A. For batteries this is the − end. */
  a: Pt;
  /** Terminal B. For batteries this is the + end (voltage rises from a to b). */
  b: Pt;
  /** Placed by the challenge, not the student — cannot be erased. */
  fixed?: boolean;
  /** Battery only. Defaults to BATTERY_V. */
  voltage?: number;
  /** Resistor only. */
  resistance?: number;
  /** Switch only. */
  closed?: boolean;
  /** Material only — does it conduct? */
  conductive?: boolean;
  /** Bulb unscrewed / material lifted out of the clips. */
  removed?: boolean;
  label?: string;
}

export interface PartResult {
  /** Signed current a→b in amps. */
  current: number;
  /** Voltage drop V(a) − V(b). */
  voltage: number;
  /** Power dissipated, watts. */
  power: number;
  /** Bulbs only: 0 = dark, 1 = normal full brightness (may exceed 1 when overdriven). */
  brightness?: number;
}

export interface WireSegment {
  a: Pt;
  b: Pt;
  /** Signed current flowing a→b through this one-cell segment. */
  current: number;
}

export interface SolveResult {
  parts: Record<string, PartResult>;
  /** Per wire id: its unit segments with individual currents (for flow animation). */
  wireSegments: Record<string, WireSegment[]>;
  /** Node voltage per grid-point key "x,y" (0 for nodes not in any powered loop). */
  netVoltage: Record<string, number>;
  /** True if any battery is delivering dangerous current (a short circuit). */
  shorted: boolean;
  /** Largest absolute battery current in the circuit. */
  batteryCurrent: number;
}

// ── Electrical constants ──────────────────────────────────────────────────────
export const BATTERY_V = 3; // one battery pack (2 × AA)
export const BATTERY_R_INT = 0.3; // internal resistance — keeps shorts finite
export const BULB_R = 10;
export const WIRE_R = 0.001; // per one-cell segment
export const CONTACT_R = 0.001; // closed switch / conductive material
/** Power of one bulb on one battery — the brightness=1.0 reference. */
export const BULB_NOMINAL_P = Math.pow((BATTERY_V * BULB_R) / (BULB_R + BATTERY_R_INT), 2) / BULB_R;
/** A bulb dimmer than this fraction of nominal reads as "off". */
export const LIT_THRESHOLD = 0.05;
/** Battery current above this flags a short circuit. */
export const SHORT_CURRENT = 2;
/** Continuity tester "beeps" through anything under this resistance. */
export const CONTINUITY_MAX_R = 100;

export const ptKey = (p: Pt) => `${p.x},${p.y}`;

/** All integer grid points a wire covers, endpoints inclusive (axis-aligned). */
export function wirePoints(a: Pt, b: Pt): Pt[] {
  const pts: Pt[] = [];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  if (dx !== 0 && dy !== 0) return [a, b]; // diagonal (UI never makes these)
  let { x, y } = a;
  for (;;) {
    pts.push({ x, y });
    if (x === b.x && y === b.y) break;
    x += dx;
    y += dy;
  }
  return pts;
}
