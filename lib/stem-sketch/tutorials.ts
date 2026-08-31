// STEM Sketch tutorials — platform-side METADATA ONLY.
//
// The tutorial CONTENT (step text, completion predicates, hints) lives inside
// the tool itself: public/stem-sketch/index.html, section 9 "Tutorial mode".
// The iframe owns content because completion checks are live predicates over
// the tool's in-memory doc — they can't be serialized out of the platform.
// This file is the mirror the platform needs for dashboards: stable ids,
// titles, ordering, and which tutorials are actually built (`ready`).
//
// KEEP IN SYNC with the TUTORIALS array in index.html — ids are the join key
// for progress rows (stem_sketch_tutorial_progress.tutorial_id, migration
// 0024), teacher assignment tracking, and ?tutorial= deep links. Never rename
// or reorder an id once shipped; add new ones instead.
//
// Tutorials are FREE for every user (no plan gate on taking them). Teachers
// on Pro additionally get assign/track surfaces built on the same ids.

export type SketchTutorial = {
  id: string;
  unit: number;
  title: string;
  blurb: string;
  /** Number of checked steps inside the tool (0 until authored). */
  stepCount: number;
  /** False = listed as "coming soon"; not assignable, not startable. */
  ready: boolean;
};

export const TUTORIAL_UNIT_META: Record<number, { title: string; icon: string }> = {
  1: { title: "Getting Around", icon: "🧭" },
  2: { title: "Sketching", icon: "✏️" },
  3: { title: "Sketch to Solid", icon: "🧱" },
  4: { title: "Building Real Parts", icon: "🔧" },
  5: { title: "Hardware", icon: "🔩" },
  6: { title: "Assemblies & Sharing", icon: "🖨️" },
};

export const SKETCH_TUTORIALS: SketchTutorial[] = [
  // ── Unit 1 — Getting Around ────────────────────────────────────────────────
  {
    id: "first-shape",
    unit: 1,
    title: "First Shape",
    blurb: "Drop a cube onto the workplane, then resize it to exactly 2 × 2 × 2.",
    stepCount: 2,
    ready: true,
  },
  {
    id: "look-around",
    unit: 1,
    title: "Look Around",
    blurb: "Use the Top, Front, Right, and Home views to see your part from every side.",
    stepCount: 4,
    ready: true,
  },
  {
    id: "snowman",
    unit: 1,
    title: "Build a Snowman",
    blurb: "Stack shapes, move them into place, and copy & paste — your first real build.",
    stepCount: 3,
    ready: true,
  },
  // ── Unit 2 — Sketching ─────────────────────────────────────────────────────
  { id: "first-sketch", unit: 2, title: "First Sketch", blurb: "Draw a rectangle and a circle on the workplane.", stepCount: 0, ready: false },
  { id: "exact-sizes", unit: 2, title: "Exact Sizes", blurb: "Dimension a shape, then drive it to an exact size.", stepCount: 0, ready: false },
  { id: "sketch-toolbox", unit: 2, title: "Sketch Toolbox", blurb: "Arcs, fillets, mirror, and array.", stepCount: 0, ready: false },
  // ── Unit 3 — Sketch to Solid ───────────────────────────────────────────────
  { id: "extrude", unit: 3, title: "Extrude", blurb: "Turn a sketch into a solid at an exact height.", stepCount: 0, ready: false },
  { id: "cut-a-hole", unit: 3, title: "Cut a Hole", blurb: "Sketch on a face and cut all the way through.", stepCount: 0, ready: false },
  { id: "revolve", unit: 3, title: "Revolve", blurb: "Spin a profile into a vase or a wheel.", stepCount: 0, ready: false },
  // ── Unit 4 — Building Real Parts ───────────────────────────────────────────
  { id: "add-and-subtract", unit: 4, title: "Add and Subtract", blurb: "Use negative shapes to hollow and notch a body.", stepCount: 0, ready: false },
  { id: "group-it", unit: 4, title: "Group It", blurb: "Combine bodies into one part — and take them apart again.", stepCount: 0, ready: false },
  { id: "smooth-the-edges", unit: 4, title: "Smooth the Edges", blurb: "Round off corners with fillets before you extrude.", stepCount: 0, ready: false },
  { id: "mirror-a-body", unit: 4, title: "Mirror a Body", blurb: "Build one half, mirror the other.", stepCount: 0, ready: false },
  // ── Unit 5 — Hardware ──────────────────────────────────────────────────────
  { id: "bolt-holes", unit: 5, title: "Bolt Holes", blurb: "Put correctly-sized holes in a plate with the Bolt Holes tool.", stepCount: 0, ready: false },
  { id: "insert-a-bolt", unit: 5, title: "Insert a Bolt", blurb: "Pull a real fastener from the library and size it to your part.", stepCount: 0, ready: false },
  { id: "bolt-and-nut", unit: 5, title: "Bolt + Nut", blurb: "Join two plates with a bolt-and-nut pair.", stepCount: 0, ready: false },
  { id: "threads", unit: 5, title: "Threads", blurb: "Thread marks vs. printable threads — and when to use each.", stepCount: 0, ready: false },
  // ── Unit 6 — Assemblies & Sharing ──────────────────────────────────────────
  { id: "first-joint", unit: 6, title: "First Joint", blurb: "Pin two parts together and make them swing.", stepCount: 0, ready: false },
  { id: "save-your-work", unit: 6, title: "Save Your Work", blurb: "Save to your account and load it back.", stepCount: 0, ready: false },
  { id: "export-for-printing", unit: 6, title: "Export for Printing", blurb: "Export an STL your slicer can print.", stepCount: 0, ready: false },
];

const _byId = new Map(SKETCH_TUTORIALS.map(t => [t.id, t]));

export function getTutorial(id: string): SketchTutorial | undefined {
  return _byId.get(id);
}

/** Valid tutorial_id values for progress writes (ready ones only). */
export function isTrackableTutorialId(id: string): boolean {
  return !!_byId.get(id)?.ready;
}

export function tutorialsForUnit(unit: number): SketchTutorial[] {
  return SKETCH_TUTORIALS.filter(t => t.unit === unit);
}
