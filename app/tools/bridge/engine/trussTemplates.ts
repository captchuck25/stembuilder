// Classic truss patterns used by the setup wizard's style gallery and the
// on-canvas design guide. All geometry is in FEET with x measured from the
// left support (0 → span) and y measured up from the deck, so every node
// lands on the 5 ft grid students snap to.

export type TrussStyle =
  | "warren"
  | "pratt"
  | "howe"
  | "ktruss"
  | "doubleWarren"
  | "bowstring";

export type TrussTemplate = {
  nodes: { x: number; y: number }[];
  members: [number, number][];
};

export const TRUSS_STYLE_INFO: Record<
  TrussStyle,
  { label: string; caption: string }
> = {
  warren: { label: "Warren", caption: "Zigzag triangles" },
  pratt: { label: "Pratt", caption: "Posts + diagonals leaning to the middle" },
  howe: { label: "Howe", caption: "Posts + diagonals leaning to the ends" },
  ktruss: { label: "K-Truss", caption: "Posts with K-shaped braces" },
  doubleWarren: {
    label: "Double Intersection",
    caption: "Two Warrens overlap into X's",
  },
  bowstring: { label: "Bowstring", caption: "Arched top over crossed braces" },
};

// Truss depth must scale with span — a 10 ft-deep truss at 100 ft is far too
// shallow to carry load, and a student following it would fail. Depths stay on
// the 5 ft grid: 5 ft (20 ft span), 10 ft (40/60), 15 ft (80/100). Warren
// switches to 20 ft panels on the long spans so its half-panel top nodes stay
// on the 5 ft grid without the diagonals going near-vertical; panel-point
// styles keep 10 ft panels (their layouts need an even count). The K-truss
// needs its vertical midpoints on the grid, so it uses 10 ft or 20 ft depths
// (h/2 = 5 or 10).
function panelLayout(
  style: TrussStyle,
  spanFt: number
): { count: number; length: number; height: number } {
  const height =
    style === "ktruss"
      ? spanFt <= 60
        ? 10
        : 20
      : spanFt <= 20
      ? 5
      : spanFt <= 60
      ? 10
      : 15;
  const length = style === "warren" && spanFt >= 80 ? 20 : 10;
  const count = Math.max(2, Math.round(spanFt / length));
  return { count, length, height };
}

// Bowstring arch height above interior panel point i of n: a TRUE parabolic
// arch (peak = span/4) rounded to the 1 ft grid. Charlie's 2026-09-02 video:
// the earlier 5 ft-rounded profile made a flat-topped trapezoid, not an arch
// — a real arch needs 1 ft resolution (students set Grid to 1 ft to trace it).
function bowstringHeight(i: number, n: number, spanFt: number): number {
  const peak = spanFt / 4;
  const x = (i * spanFt) / n;
  const raw = (4 * peak * x * (spanFt - x)) / (spanFt * spanFt);
  return Math.max(1, Math.round(raw));
}

export function generateTruss(style: TrussStyle, spanFt: number): TrussTemplate {
  const { count: n, length: L, height: h } = panelLayout(style, spanFt);
  const nodes: { x: number; y: number }[] = [];
  const members: [number, number][] = [];
  const addNode = (x: number, y: number) => nodes.push({ x, y }) - 1;

  if (style === "warren") {
    // Top chord sits at panel midpoints; diagonals zigzag through each panel.
    const bottom: number[] = [];
    for (let i = 0; i <= n; i++) bottom.push(addNode(i * L, 0));
    const top: number[] = [];
    for (let i = 0; i < n; i++) top.push(addNode((i + 0.5) * L, h));
    for (let i = 0; i < n; i++) {
      members.push([bottom[i], bottom[i + 1]]);
      members.push([bottom[i], top[i]]);
      members.push([top[i], bottom[i + 1]]);
      if (i < n - 1) members.push([top[i], top[i + 1]]);
    }
    return { nodes, members };
  }

  // Panel-point styles: bottom nodes at every panel, top nodes above the
  // interior panel points, inclined end posts.
  const bottom: number[] = [];
  for (let i = 0; i <= n; i++) bottom.push(addNode(i * L, 0));
  const top: number[] = [];
  for (let i = 1; i < n; i++) {
    const y = style === "bowstring" ? bowstringHeight(i, n, spanFt) : h;
    top.push(addNode(i * L, y));
  }
  const topAt = (i: number) => top[i - 1]; // top chord node above bottom[i]

  for (let i = 0; i < n; i++) members.push([bottom[i], bottom[i + 1]]);
  for (let i = 1; i < n - 1; i++) members.push([topAt(i), topAt(i + 1)]);
  members.push([bottom[0], topAt(1)]);
  members.push([bottom[n], topAt(n - 1)]);

  const mid = n / 2;

  if (style === "ktruss") {
    // Interior verticals split at mid-height where the K legs land; the two
    // verticals next to the end posts stay plain. Each interior panel feeds
    // its K into the vertical on its midspan side.
    const midNode: (number | null)[] = new Array(n + 1).fill(null);
    for (let j = 2; j <= n - 2; j++) midNode[j] = addNode(j * L, h / 2);
    for (let i = 1; i < n; i++) {
      const m = midNode[i];
      if (m !== null) {
        members.push([topAt(i), m]);
        members.push([m, bottom[i]]);
      } else {
        members.push([topAt(i), bottom[i]]);
      }
    }
    for (let i = 1; i < n - 1; i++) {
      const j = i + 1 <= mid ? i + 1 : i; // vertical receiving this panel's K
      const feed = i + 1 <= mid ? i : i + 1; // panel point the legs come from
      const m = midNode[j];
      if (m === null) continue;
      members.push([topAt(feed), m]);
      members.push([bottom[feed], m]);
    }
    return { nodes, members };
  }

  if (style === "doubleWarren") {
    // Two Warren systems offset by one panel: both diagonals in every
    // interior panel form X's (no joint at the crossing). End verticals are
    // required: without them the inclined end post runs parallel to the
    // first X-leg, leaving an unbraced parallelogram at each end (caught by
    // Charlie 2026-09-02).
    members.push([topAt(1), bottom[1]]);
    if (n - 1 > 1) members.push([topAt(n - 1), bottom[n - 1]]);
    for (let i = 1; i < n - 1; i++) {
      members.push([topAt(i), bottom[i + 1]]);
      members.push([bottom[i], topAt(i + 1)]);
    }
    return { nodes, members };
  }

  if (style === "bowstring") {
    // Verticals under the arch with crossed braces in each interior panel.
    for (let i = 1; i < n; i++) members.push([topAt(i), bottom[i]]);
    for (let i = 1; i < n - 1; i++) {
      members.push([topAt(i), bottom[i + 1]]);
      members.push([bottom[i], topAt(i + 1)]);
    }
    return { nodes, members };
  }

  // Pratt / Howe verticals + interior diagonals.
  for (let i = 1; i < n; i++) members.push([topAt(i), bottom[i]]);
  if (style === "howe") {
    // Diagonals slope up toward midspan.
    for (let i = 1; i < mid; i++) members.push([bottom[i], topAt(i + 1)]);
    for (let i = n - 1; i > mid; i--) members.push([bottom[i], topAt(i - 1)]);
  } else {
    // Pratt: diagonals slope down toward midspan.
    for (let i = 1; i < mid; i++) members.push([topAt(i), bottom[i + 1]]);
    for (let i = n - 1; i > mid; i--) members.push([topAt(i), bottom[i - 1]]);
  }
  return { nodes, members };
}
