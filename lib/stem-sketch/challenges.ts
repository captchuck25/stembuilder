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

export type SketchPrecision = "whole" | "half" | "quarter" | "eighth";

export interface SketchChallenge {
  id: string;
  stage: 1;
  title: string;
  /** Teacher-facing summary shown in the challenge picker. */
  description: string;
  /** Smallest inch fraction a student must measure to. */
  precision: SketchPrecision;
  /** STEM Sketch doc_json of the reference solid; null = geometry not yet authored. */
  refDocJson: object | null;
  /** Public path of the printable STL for the physical block; null until authored. */
  stlPath: string | null;
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
    id: "s1-01-starter-brick",
    stage: 1,
    title: "Starter Brick",
    description:
      "A 3-inch cube with a staircase cut into it — every dimension is a whole inch. Measure the printed block, draw its three views on paper, then model it exactly.",
    precision: "whole",
    refDocJson: refS101,
    stlPath: "/stem-sketch/challenges/s1-01-starter-brick.stl",
    toleranceMm: 0.5,
  },
  {
    id: "s1-02-step-block",
    stage: 1,
    title: "Step Block",
    description:
      "A block with one rectangular step, dimensioned to the nearest half inch. Two extrudes — or one sketch with an L profile. (Reference geometry coming soon.)",
    precision: "half",
    refDocJson: null,
    stlPath: null,
    toleranceMm: 0.5,
  },
  {
    id: "s1-03-notched-block",
    stage: 1,
    title: "Notched Block",
    description:
      "A block with a notch cut from one edge, dimensioned to the nearest quarter inch. First challenge that needs a cut. (Reference geometry coming soon.)",
    precision: "quarter",
    refDocJson: null,
    stlPath: null,
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
