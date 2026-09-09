// Classic lattice-tower patterns used by the setup wizard's style gallery and
// the on-canvas design guide. All geometry is in FEET with x measured from
// the left edge of the footprint (0 → footprint) and y measured up from the
// ground (0 → height), so every node lands on the 2.5 ft grid students snap
// to.
//
// Every template is verified (tests/tower-templates.test.ts) to pass the
// design inspection with the default 2"×2" tube — in particular no member
// may exceed the shared ~12 ft recommended length. That rule shapes the
// patterns: a full-width rung across a 15 or 20 ft footprint is too long, so
// wide towers get a center post that splits the rungs (X-braced) or a third,
// center leg with a footing (zigzag).

export type TowerStyle = "zigzag" | "xbrace" | "tapered" | "taperedX";

export type TowerTemplate = {
  nodes: { x: number; y: number }[];
  members: [number, number][];
};

export const TOWER_STYLE_INFO: Record<
  TowerStyle,
  { label: string; caption: string; snapFeet: 2.5 | 5 }
> = {
  zigzag: {
    label: "Zigzag",
    caption: "Straight legs, diagonals that zig and zag",
    snapFeet: 2.5,
  },
  xbrace: {
    label: "X-Braced",
    caption: "Straight legs, an X in every panel",
    snapFeet: 2.5,
  },
  tapered: {
    label: "Tapered",
    caption: "Legs step inward as the tower rises",
    snapFeet: 2.5,
  },
  taperedX: {
    label: "Tapered X",
    caption: "Tapered legs with X bracing",
    snapFeet: 2.5,
  },
};

const MAX_DIAGONAL_FT = 11.5; // stays under the 2"×2" tube's ~12 ft limit
const TAPER_INSET_PER_SIDE = 2.5;
const MIN_TOP_WIDTH = 5;

function isCrossed(style: TowerStyle) {
  return style === "xbrace" || style === "taperedX";
}
function isTapered(style: TowerStyle) {
  return style === "tapered" || style === "taperedX";
}

// Wide footprints split the rungs at a center post/leg so no rung half is
// longer than 10 ft.
export function usesCenter(footprintFt: number): boolean {
  return footprintFt >= 15;
}

// Panel height: 10 ft panels keep tall towers from becoming a wall of
// members, but only where the resulting diagonals stay under the length
// cap; otherwise 5 ft.
export function panelHeightFt(style: TowerStyle, heightFt: number, footprintFt: number): number {
  if (heightFt <= 30) return 5;
  const cellWidth = usesCenter(footprintFt) ? footprintFt / 2 : footprintFt;
  // X halves run leg → centerline over half a panel (W/2, h/2); zigzag
  // diagonals run the full cell over a whole panel (cell, h).
  const longest = isCrossed(style)
    ? Math.hypot(footprintFt / 2, 5)
    : Math.hypot(cellWidth, 10);
  return longest <= MAX_DIAGONAL_FT ? 10 : 5;
}

export function generateTower(
  style: TowerStyle,
  heightFt: number,
  footprintFt: number
): TowerTemplate {
  const h = panelHeightFt(style, heightFt, footprintFt);
  const n = Math.max(1, Math.round(heightFt / h));
  const tapered = isTapered(style);
  const crossed = isCrossed(style);
  const center = usesCenter(footprintFt);
  const midX = footprintFt / 2;

  const nodes: { x: number; y: number }[] = [];
  const members: [number, number][] = [];
  const addNode = (x: number, y: number) => nodes.push({ x, y }) - 1;
  const link = (a: number, b: number) => {
    members.push([a, b]);
  };

  // Width at each level (tapered styles step in 2.5 ft per side per panel
  // until 5 ft wide, then run straight).
  const widths: number[] = [];
  let w = footprintFt;
  for (let i = 0; i <= n; i += 1) {
    widths.push(w);
    if (tapered) w = Math.max(MIN_TOP_WIDTH, w - 2 * TAPER_INSET_PER_SIDE);
  }

  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i <= n; i += 1) {
    const inset = (footprintFt - widths[i]) / 2;
    left.push(addNode(inset, i * h));
    right.push(addNode(footprintFt - inset, i * h));
  }
  for (let i = 0; i < n; i += 1) {
    link(left[i], left[i + 1]);
    link(right[i], right[i + 1]);
  }

  // Rungs at every level above the ground (footings need no tie). With a
  // center, each rung is two halves meeting at the centerline.
  const mid: (number | null)[] = new Array(n + 1).fill(null);
  if (center) {
    // Zigzag towers carry a third leg down to its own footing; X-braced
    // towers hang a post between the X centers instead.
    const startLevel = crossed ? 1 : 0;
    for (let i = startLevel; i <= n; i += 1) mid[i] = addNode(midX, i * h);
    for (let i = 1; i <= n; i += 1) {
      link(left[i], mid[i] as number);
      link(mid[i] as number, right[i]);
    }
    if (!crossed) {
      for (let i = 0; i < n; i += 1) link(mid[i] as number, mid[i + 1] as number);
    }
  } else {
    for (let i = 1; i <= n; i += 1) link(left[i], right[i]);
  }

  for (let i = 0; i < n; i += 1) {
    if (crossed) {
      // X with a joint at the crossing so the design passes inspection
      // as-is; the post ties that joint to the rung midpoints above/below.
      const c = addNode(midX, i * h + h / 2);
      link(left[i], c);
      link(c, right[i + 1]);
      link(right[i], c);
      link(c, left[i + 1]);
      if (center) {
        if (mid[i] !== null) link(mid[i] as number, c);
        link(c, mid[i + 1] as number);
      }
    } else if (center) {
      // Two cells either side of the center leg, diagonals mirrored so the
      // panel reads as a V, flipping to a Λ on alternate panels.
      const m0 = mid[i] as number;
      const m1 = mid[i + 1] as number;
      if (i % 2 === 0) {
        link(left[i], m1);
        link(right[i], m1);
      } else {
        link(m0, left[i + 1]);
        link(m0, right[i + 1]);
      }
    } else {
      // One diagonal per panel, alternating direction.
      if (i % 2 === 0) link(left[i], right[i + 1]);
      else link(right[i], left[i + 1]);
    }
  }

  return { nodes, members };
}
