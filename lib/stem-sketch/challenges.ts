// STEM Sketch assignment challenge library — code-defined curriculum content
// (same philosophy as the quiz banks: content lives in the repo, never the DB,
// so it can be revised without a migration; stem_sketch_assignments rows store
// only a challenge_id string).
//
// Stage 1 — "Make what you see": the teacher prints the challenge STL, the
// student measures the physical block (whole inches down to eighths, by
// difficulty), draws it on paper, models it in STEM Sketch, and the tool
// verifies the model against refDocJson (symmetric difference ≈ 0 within
// toleranceMm). Stage 2 (complete-the-cube) and stage 3 (design briefs) will
// extend this shape.
//
// refDocJson is carried opaquely by the platform — only the STEM Sketch iframe
// interprets it (it's a saved doc_json). Entries ship with refDocJson: null
// until their reference geometry is authored in STEM Sketch and committed
// here; the teacher UI badges those "geometry pending" (assigning still works
// so the pipeline is exercisable — the in-tool fit check simply can't run
// until the geometry lands, which happens before the feature is announced).
// Printable STLs live under public/stem-sketch/challenges/.

import refS101 from "./challenges/s1-01-starter-brick.json";
import refS102 from "./challenges/s1-02-double-steps.json";
import refS103 from "./challenges/s1-03-triple-view.json";

export type SketchPrecision = "whole" | "half" | "quarter" | "eighth";

export interface SketchChallenge {
  id: string;
  stage: 1;
  title: string;
  /** Teacher-facing summary shown in the challenge picker. */
  description: string;
  /** Student-facing steps shown in the tool's assignment panel (see bridge doc). */
  studentInstructions: string;
  /** Smallest inch fraction a student must measure to. */
  precision: SketchPrecision;
  /** STEM Sketch doc_json of the reference solid; null = geometry not yet authored. */
  refDocJson: object | null;
  /** Public path of the printable STL for the physical block; null until authored. */
  stlPath: string | null;
  /** Public path of a rendered image of the block (shown in the teacher picker
   *  so the on-screen name matches the object being passed around the room). */
  imagePath: string | null;
  /** Pass tolerance for the fit check. 0.5 mm ≈ 1/50", far below the 1/8" (3.175 mm) design increment. */
  toleranceMm: number;
}

export const PRECISION_LABEL: Record<SketchPrecision, string> = {
  whole: "Whole inches",
  half: "½-inch",
  quarter: "¼-inch",
  eighth: "⅛-inch",
};

export const SKETCH_CHALLENGES: SketchChallenge[] = [
  {
    // id keeps the original slug — stem_sketch_assignments rows reference it.
    id: "s1-01-starter-brick",
    stage: 1,
    title: "Step Block",
    description:
      "A 3-inch cube with a staircase cut into it — every dimension is a whole inch. Measure the printed block, draw its three views on paper, then model it exactly.",
    studentInstructions:
      "1. Get the printed Step Block from your teacher.\n" +
      "2. Measure it with your ruler — every dimension is a whole inch.\n" +
      "3. Draw its front, top, and side views on paper first.\n" +
      "4. Build it here exactly as you measured it.\n" +
      "5. Click Check My Model — if it matches, hit Submit!",
    precision: "whole",
    refDocJson: refS101,
    stlPath: "/stem-sketch/challenges/s1-01-starter-brick.stl",
    imagePath: "/stem-sketch/challenges/s1-01-step-block.jpg",
    toleranceMm: 0.5,
  },
  {
    id: "s1-02-double-steps",
    stage: 1,
    title: "Double Steps",
    description:
      "Three stacked steps that shrink in BOTH directions — a front view alone can't describe it, so students need the right-side view too. Every dimension is still a whole inch: the step up from the Step Block is seeing in two views, not smaller fractions.",
    studentInstructions:
      "1. Get the printed Double Steps block from your teacher.\n" +
      "2. Measure it with your ruler — every dimension is a whole inch.\n" +
      "3. Draw its front, top, AND right-side views on paper — one view isn't enough for this block!\n" +
      "4. Build it here exactly as you measured it.\n" +
      "5. Click Check My Model — if it matches, hit Submit!",
    precision: "whole",
    refDocJson: refS102,
    stlPath: "/stem-sketch/challenges/s1-02-double-steps.stl",
    imagePath: "/stem-sketch/challenges/s1-02-double-steps.jpg",
    toleranceMm: 0.5,
  },
  {
    id: "s1-03-triple-view",
    stage: 1,
    title: "Triple View Block",
    description:
      "A base with two towers of different heights and a hollow pocket in the middle — front, right-side, AND top views are all required to capture it, and dimensions go to the nearest quarter inch. The capstone of the measuring ladder.",
    studentInstructions:
      "1. Get the printed Triple View Block from your teacher.\n" +
      "2. Measure it with your ruler — dimensions go to the nearest quarter inch (¼ = .25, ½ = .5, ¾ = .75).\n" +
      "3. Draw its front, right-side, AND top views on paper — this block needs all three!\n" +
      "4. Build it here exactly as you measured it.\n" +
      "5. Click Check My Model — if it matches, hit Submit!",
    precision: "quarter",
    refDocJson: refS103,
    stlPath: "/stem-sketch/challenges/s1-03-triple-view.stl",
    imagePath: "/stem-sketch/challenges/s1-03-triple-view.jpg",
    toleranceMm: 0.5,
  },
];

export function getChallenge(id: string): SketchChallenge | undefined {
  return SKETCH_CHALLENGES.find(c => c.id === id);
}

/** True once the challenge's reference geometry has been authored (drives the
 *  "geometry pending" badge in the teacher picker; not an assignment gate). */
export function challengeReady(c: SketchChallenge): boolean {
  return c.refDocJson !== null;
}
