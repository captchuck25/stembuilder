// Bridge Builder — member library, structural data model, and pure helpers.
// Extracted verbatim from page.tsx (no behavior change).

export type MemberType =
  | "box_1"
  | "box_2"
  | "box_3"
  | "box_4"
  | "box_5"
  | "box_6"
  | "box_7"
  | "box_8"
  | "box_9"
  | "box_10"
  | "box_11"
  | "box_12"
  | "box_13"
  | "box_14"
  | "box_15"
  | "box_16"
  | "box_17"
  | "box_18"
  | "box_19"
  | "box_20"
  | "box_21"
  | "box_22"
  | "box_23"
  | "box_24"
  | "box_25"
  | "box_26"
  | "box_27"
  | "box_28"
  | "box_29"
  | "box_30"
  | "box_31"
  | "box_32"
  | "box_33"
  | "box_34"
  | "box_35";

export type MemberProps = {
  label: string;
  strokeW: number;
  maxTension: number;
  maxCompression: number;
  costPerFt: number;
};
export type MaterialGrade = "mild" | "high";

export type Node = { id: string; x: number; y: number };
export type Member = { id: string; a: string; b: string; type: MemberType; grade?: MaterialGrade };

export const COST_SCALE = 10;
export const BOX_COST_BASE = 1.0 * COST_SCALE;
export const BOX_COST_OUTER_RATE = 1.8 * COST_SCALE;
export const BOX_COST_WALL_RATE = 0.15 * COST_SCALE;
export function boxCostPerFt(outerIn: number, wallIn: number): number {
  return (
    BOX_COST_BASE +
    BOX_COST_OUTER_RATE * outerIn * outerIn +
    BOX_COST_WALL_RATE * wallIn
  );
}

export const MEMBER_LIBRARY: Record<MemberType, MemberProps> = {
  box_1: {
    label: 'Steel Box Tube 1"×1"×3/16"',
    strokeW: 2.4,
    maxTension: 5279,
    maxCompression: 5279,
    costPerFt: boxCostPerFt(1, 0.1875),
  },
  box_2: {
    label: 'Steel Box Tube 1.25"×1.25"×3/16"',
    strokeW: 2.6,
    maxTension: 6885,
    maxCompression: 6885,
    costPerFt: boxCostPerFt(1.25, 0.1875),
  },
  box_3: {
    label: 'Steel Box Tube 1.5"×1.5"×3/16"',
    strokeW: 2.8,
    maxTension: 8530,
    maxCompression: 8530,
    costPerFt: boxCostPerFt(1.5, 0.1875),
  },
  box_4: {
    label: 'Steel Box Tube 1.75"×1.75"×3/16"',
    strokeW: 3.0,
    maxTension: 10136,
    maxCompression: 10136,
    costPerFt: boxCostPerFt(1.75, 0.1875),
  },
  box_5: {
    label: 'Steel Box Tube 2"×2"×3/16"',
    strokeW: 3.3,
    maxTension: 11781,
    maxCompression: 11781,
    costPerFt: boxCostPerFt(2, 0.1875),
  },
  box_6: {
    label: 'Steel Box Tube 2.25"×2.25"×3/16"',
    strokeW: 3.5,
    maxTension: 13388,
    maxCompression: 13388,
    costPerFt: boxCostPerFt(2.25, 0.1875),
  },
  box_7: {
    label: 'Steel Box Tube 2.5"×2.5"×3/16"',
    strokeW: 3.7,
    maxTension: 15032,
    maxCompression: 15032,
    costPerFt: boxCostPerFt(2.5, 0.1875),
  },
  box_8: {
    label: 'Steel Box Tube 2.75"×2.75"×3/16"',
    strokeW: 3.9,
    maxTension: 16639,
    maxCompression: 16639,
    costPerFt: boxCostPerFt(2.75, 0.1875),
  },
  box_9: {
    label: 'Steel Box Tube 3"×3"×3/16"',
    strokeW: 4.1,
    maxTension: 18284,
    maxCompression: 18284,
    costPerFt: boxCostPerFt(3, 0.1875),
  },
  box_10: {
    label: 'Steel Box Tube 3.25"×3.25"×3/16"',
    strokeW: 4.3,
    maxTension: 19890,
    maxCompression: 19890,
    costPerFt: boxCostPerFt(3.25, 0.1875),
  },
  box_11: {
    label: 'Steel Box Tube 3.5"×3.5"×3/16"',
    strokeW: 4.5,
    maxTension: 21535,
    maxCompression: 21535,
    costPerFt: boxCostPerFt(3.5, 0.1875),
  },
  box_12: {
    label: 'Steel Box Tube 3.75"×3.75"×3/16"',
    strokeW: 4.8,
    maxTension: 23141,
    maxCompression: 23141,
    costPerFt: boxCostPerFt(3.75, 0.1875),
  },
  box_13: {
    label: 'Steel Box Tube 4"×4"×1/4"',
    strokeW: 5.0,
    maxTension: 34700,
    maxCompression: 34700,
    costPerFt: boxCostPerFt(4, 0.25),
  },
  box_14: {
    label: 'Steel Box Tube 4.5"×4.5"×1/4"',
    strokeW: 5.4,
    maxTension: 39199,
    maxCompression: 39199,
    costPerFt: boxCostPerFt(4.5, 0.25),
  },
  box_15: {
    label: 'Steel Box Tube 5"×5"×1/4"',
    strokeW: 5.8,
    maxTension: 43751,
    maxCompression: 43751,
    costPerFt: boxCostPerFt(5, 0.25),
  },
  box_16: {
    label: 'Steel Box Tube 5.5"×5.5"×1/4"',
    strokeW: 6.3,
    maxTension: 48302,
    maxCompression: 48302,
    costPerFt: boxCostPerFt(5.5, 0.25),
  },
  box_17: {
    label: 'Steel Box Tube 6"×6"×1/4"',
    strokeW: 6.7,
    maxTension: 52853,
    maxCompression: 52853,
    costPerFt: boxCostPerFt(6, 0.25),
  },
  box_18: {
    label: 'Steel Box Tube 6.5"×6.5"×1/4"',
    strokeW: 7.1,
    maxTension: 57406,
    maxCompression: 57406,
    costPerFt: boxCostPerFt(6.5, 0.25),
  },
  box_19: {
    label: 'Steel Box Tube 7"×7"×1/4"',
    strokeW: 7.5,
    maxTension: 132766,
    maxCompression: 132766,
    costPerFt: boxCostPerFt(7, 0.25),
  },
  box_20: {
    label: 'Steel Box Tube 7.5"×7.5"×1/4"',
    strokeW: 8.0,
    maxTension: 142520,
    maxCompression: 142520,
    costPerFt: boxCostPerFt(7.5, 0.25),
  },
  box_21: {
    label: 'Steel Box Tube 8"×8"×1/4"',
    strokeW: 8.4,
    maxTension: 152273,
    maxCompression: 152273,
    costPerFt: boxCostPerFt(8, 0.25),
  },
  box_22: {
    label: 'Steel Box Tube 8.5"×8.5"×1/4"',
    strokeW: 8.8,
    maxTension: 162027,
    maxCompression: 162027,
    costPerFt: boxCostPerFt(8.5, 0.25),
  },
  box_23: {
    label: 'Steel Box Tube 9"×9"×1/4"',
    strokeW: 9.2,
    maxTension: 171781,
    maxCompression: 171781,
    costPerFt: boxCostPerFt(9, 0.25),
  },
  box_25: {
    label: 'Steel Box Tube 9.5"×9.5"×1/4"',
    strokeW: 9.5,
    maxTension: 181534,
    maxCompression: 181534,
    costPerFt: boxCostPerFt(9.5, 0.25),
  },
  box_24: {
    label: 'Steel Box Tube 10"×10"×3/8"',
    strokeW: 9.8,
    maxTension: 229546,
    maxCompression: 229546,
    costPerFt: boxCostPerFt(10, 0.375),
  },
  box_26: {
    label: 'Steel Box Tube 10.5"×10.5"×3/8"',
    strokeW: 10.2,
    maxTension: 241250,
    maxCompression: 241250,
    costPerFt: boxCostPerFt(10.5, 0.375),
  },
  box_27: {
    label: 'Steel Box Tube 11"×11"×3/8"',
    strokeW: 10.6,
    maxTension: 252955,
    maxCompression: 252955,
    costPerFt: boxCostPerFt(11, 0.375),
  },
  box_28: {
    label: 'Steel Box Tube 11.5"×11.5"×3/8"',
    strokeW: 11.0,
    maxTension: 264659,
    maxCompression: 264659,
    costPerFt: boxCostPerFt(11.5, 0.375),
  },
  box_29: {
    label: 'Steel Box Tube 12"×12"×3/8"',
    strokeW: 11.5,
    maxTension: 276364,
    maxCompression: 276364,
    costPerFt: boxCostPerFt(12, 0.375),
  },
  box_30: {
    label: 'Steel Box Tube 13"×13"×3/8"',
    strokeW: 12.3,
    maxTension: 333081,
    maxCompression: 333081,
    costPerFt: boxCostPerFt(13, 0.375),
  },
  box_31: {
    label: 'Steel Box Tube 14"×14"×3/8"',
    strokeW: 13.1,
    maxTension: 359091,
    maxCompression: 359091,
    costPerFt: boxCostPerFt(14, 0.375),
  },
  box_32: {
    label: 'Steel Box Tube 15"×15"×3/8"',
    strokeW: 14.0,
    maxTension: 385101,
    maxCompression: 385101,
    costPerFt: boxCostPerFt(15, 0.375),
  },
  box_33: {
    label: 'Steel Box Tube 12.5"×12.5"×3/8"',
    strokeW: 11.9,
    maxTension: 288068,
    maxCompression: 288068,
    costPerFt: boxCostPerFt(12.5, 0.375),
  },
  box_34: {
    label: 'Steel Box Tube 13.5"×13.5"×3/8"',
    strokeW: 12.7,
    maxTension: 346086,
    maxCompression: 346086,
    costPerFt: boxCostPerFt(13.5, 0.375),
  },
  box_35: {
    label: 'Steel Box Tube 14.5"×14.5"×3/8"',
    strokeW: 13.5,
    maxTension: 372096,
    maxCompression: 372096,
    costPerFt: boxCostPerFt(14.5, 0.375),
  },
};

export type VehicleType =
  | "People Walking"
  | "Horse & Carriage"
  | "Small Car"
  | "Pickup Truck"
  | "Box Truck"
  | "Semi"
  | "Tank";
export const LB_PER_TON = 2000;
export const LOAD_TON_OPTIONS = [8, 15, 30] as const;

export const UNITS_PER_FOOT = 20; // 20 SVG units = 1 ft
export const CANVAS_CENTER_X = 500;
export const INITIAL_SPAN_FEET = 40;
export const COST_PER_JOINT = 5 * COST_SCALE;
export const DEFAULT_SNAP_TO_GRID = true;
export const DEFAULT_SNAP_STEP_FEET = 5 as const;
export type LoadLevel = "low" | "med" | "high";
export const MAX_MEMBER_FT = 12;
export const SUPPORT_X: Record<number, { left: number; right: number }> = {
  20: { left: 200, right: 950 },
  40: { left: 200, right: 950 },
  60: { left: 200, right: 950 },
  80: { left: 200, right: 950 },
  100: { left: 200, right: 950 },
};
export const VSPACE: Record<number, { above: number; below: number }> = {
  20: { above: 8, below: 5 },
  40: { above: 12, below: 8 },
  60: { above: 16, below: 10 },
  80: { above: 20, below: 12 },
  100: { above: 25, below: 15 },
};
export const ROADWAY_Y = 307;
export const SUPPORT_A_ID = "support-a";
export const SUPPORT_B_ID = "support-b";

export function thicknessToStrokeWidth(t: MemberType) {
  return MEMBER_LIBRARY[t].strokeW * 1.4;
}

export function isBoxType(type: MemberType) {
  return type.startsWith("box");
}

export function memberFamilyFromType(_t: MemberType): "box" {
  return "box";
}

export function normalizeMemberFamily(typeStr: string): "box" | "unknown" {
  const text = typeStr.toLowerCase().trim();
  if (text.includes("box") || text.includes("hss")) return "box";
  return "unknown";
}

export function normalizeSizeLabel(label: string): string {
  return label.replace(/[×]/g, "x").replace(/\s+/g, " ").trim();
}

export function parseBoxTube(label: string): { b: number; t: number } | null {
  const normalized = normalizeSizeLabel(label);
  const match = normalized.match(/box tube\s+([0-9.]+)"x([0-9.]+)"x([^"]+)"/i);
  if (!match) return null;
  const b = Number(match[1]);
  const tRaw = match[3].trim();
  if (!Number.isFinite(b) || b <= 0) return null;
  const t = parseFraction(tRaw);
  if (t === null || t <= 0) return null;
  return { b, t };
}

export function formatMemberSizeNoGauge(type: MemberType): string {
  const label = MEMBER_LIBRARY[type]?.label ?? "";
  const parsed = parseBoxTube(label);
  if (parsed) {
    return `${parsed.b}"x${parsed.b}"`;
  }
  return label.replace(/^Steel Box Tube\s+/, "");
}

export function parseFraction(value: string): number | null {
  if (value.includes("/")) {
    const [num, den] = value.split("/").map((v) => Number(v));
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function boxAreaIndex(b: number, t: number): number {
  return 4 * t * (b - t);
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const BASE_BOX_LABEL = 'Steel Box Tube 1"x1"x3/16"';
export const BASE_BOX_COST = MEMBER_LIBRARY.box_1.costPerFt;
export const BASE_BOX_AREA = (() => {
  const parsed = parseBoxTube(BASE_BOX_LABEL);
  return parsed ? boxAreaIndex(parsed.b, parsed.t) : 1;
})();

export function getBoxAreaRatio(label: string): number {
  const parsed = parseBoxTube(label);
  if (!parsed || BASE_BOX_AREA <= 0) return 1;
  return boxAreaIndex(parsed.b, parsed.t) / BASE_BOX_AREA;
}

export function getMemberStrengthIndex(member: Member): number {
  const label = MEMBER_LIBRARY[member.type]?.label ?? "";
  const family = normalizeMemberFamily(label);
  if (family === "box") {
    return getBoxAreaRatio(label);
  }
  return 1.0;
}

export function nearestLoadTon(loadInLb: number): (typeof LOAD_TON_OPTIONS)[number] {
  let best: (typeof LOAD_TON_OPTIONS)[number] = LOAD_TON_OPTIONS[0];
  let bestDiff = Math.abs(loadInLb - best * LB_PER_TON);
  for (const ton of LOAD_TON_OPTIONS) {
    const diff = Math.abs(loadInLb - ton * LB_PER_TON);
    if (diff < bestDiff) {
      best = ton;
      bestDiff = diff;
    }
  }
  return best;
}

export function normalizeLoadLb(loadInLb: number): number {
  return nearestLoadTon(loadInLb) * LB_PER_TON;
}

export function formatTons(loadInLb: number): string {
  const tons = loadInLb / LB_PER_TON;
  return `${Number.isInteger(tons) ? tons.toFixed(0) : tons.toFixed(2)} ton`;
}

export function getLoadLevel(load: number | string): LoadLevel {
  if (typeof load === "number") {
    if (load <= 2000) return "low";
    if (load <= 6000) return "med";
    return "high";
  }
  const text = load.toLowerCase();
  if (text.includes("people") || text.includes("walker")) return "low";
  if (text.includes("horse") || text.includes("buggy")) return "med";
  if (text.includes("car") || text.includes("cart")) return "med";
  if (text.includes("truck") || text.includes("semi")) return "high";
  return "med";
}

export function getMemberGrade(member: Member): MaterialGrade {
  return member.grade ?? "mild";
}
export function getMaterialStrengthMultiplier(grade: MaterialGrade): number {
  return grade === "high" ? 1.5 : 1.0;
}
export function getMaterialCostMultiplier(grade: MaterialGrade): number {
  return grade === "high" ? 1.3 : 1.0;
}

export function getStressStroke(force: number | null, utilization: number): string {
  if (force === null) return "#666";
  const t = Math.max(0, Math.min(1, utilization));
  if (force >= 0) {
    const intensity = Math.round(130 + t * 90);
    return `rgb(${intensity}, 52, 52)`;
  }
  const intensity = Math.round(130 + t * 90);
  return `rgb(52, 112, ${intensity})`;
}

// Warning color for members that are still holding: neutral gray until 90% of
// capacity, then a fast ramp to the sign hue (red = compression, blue =
// tension) between 90% and 100%. Members comfortably within capacity stay
// gray so color always means "pay attention". The ramp routes through a
// brighter mid-stop (straight gray-to-red lerp muddies into maroon), and at
// 100% it lands on getStressStroke(force, 1), so a member that tips into
// failure keeps the color it was trending toward.
const UTILIZATION_COLOR_START = 0.9;
export function getUtilizationStroke(force: number | null, utilization: number): string {
  if (force === null) return "#666";
  const t = Math.max(0, Math.min(1, utilization));
  if (t <= UTILIZATION_COLOR_START) return "#666";
  const k = (t - UTILIZATION_COLOR_START) / (1 - UTILIZATION_COLOR_START);
  const gray: [number, number, number] = [102, 102, 102];
  const mid: [number, number, number] = force >= 0 ? [214, 122, 100] : [116, 152, 214];
  const full: [number, number, number] = force >= 0 ? [220, 52, 52] : [52, 112, 220];
  const from = k < 0.5 ? gray : mid;
  const to = k < 0.5 ? mid : full;
  const kk = k < 0.5 ? k * 2 : (k - 0.5) * 2;
  const r = Math.round(from[0] + (to[0] - from[0]) * kk);
  const g = Math.round(from[1] + (to[1] - from[1]) * kk);
  const b = Math.round(from[2] + (to[2] - from[2]) * kk);
  return `rgb(${r}, ${g}, ${b})`;
}

// Dev-only sanity check: cost must increase monotonically with outer size and wall.
if (process.env.NODE_ENV !== "production") {
  const byOuter = new Map<number, Array<{ wall: number; cost: number; label: string }>>();
  const byWall = new Map<number, Array<{ outer: number; cost: number; label: string }>>();
  for (const entry of Object.values(MEMBER_LIBRARY)) {
    if (!entry.label.includes("Box Tube")) continue;
    const parsed = parseBoxTube(entry.label);
    if (!parsed) continue;
    const outer = parsed.b;
    const wall = parsed.t;
    if (!byOuter.has(outer)) byOuter.set(outer, []);
    if (!byWall.has(wall)) byWall.set(wall, []);
    byOuter.get(outer)?.push({ wall, cost: entry.costPerFt, label: entry.label });
    byWall.get(wall)?.push({ outer, cost: entry.costPerFt, label: entry.label });
  }
  for (const [outer, items] of byOuter) {
    const sorted = [...items].sort((a, b) => a.wall - b.wall);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].cost <= sorted[i - 1].cost) {
        console.warn(
          `Box cost monotonicity issue at outer ${outer}\":`,
          sorted[i - 1],
          sorted[i]
        );
      }
    }
  }
  for (const [wall, items] of byWall) {
    const sorted = [...items].sort((a, b) => a.outer - b.outer);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].cost <= sorted[i - 1].cost) {
        console.warn(
          `Box cost monotonicity issue at wall ${wall}\":`,
          sorted[i - 1],
          sorted[i]
        );
      }
    }
  }
}
