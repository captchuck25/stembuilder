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
import refS201 from "./challenges/s2-01-reverse-step.json";
import refS202 from "./challenges/s2-02-double-take.json";

export type SketchPrecision = "whole" | "half" | "quarter" | "eighth";

export type SketchStage = 1 | 2;

/** The three assignment types teachers see (level 3 is a coming-soon card). */
export const STAGE_META = {
  1: {
    name: "Recreate",
    icon: "✏️",
    blurb: "Measure a printed block, draw its views, and model it exactly.",
  },
  2: {
    name: "Fill the Void",
    icon: "🧩",
    blurb: "Measure a printed block with a missing piece — design the piece that completes the cube.",
  },
  3: {
    name: "Brainstorm & Design Your Own",
    icon: "💡",
    blurb: "Open-ended design briefs with real-world constraints.",
  },
} as const;

export interface SketchChallenge {
  id: string;
  stage: SketchStage;
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
  /** Stage 2 only: edge length (inches) of the target cube the printed void
   *  block + the student's piece must complete. The in-tool check builds the
   *  student's true reference as cube − block (the complement). */
  targetCubeIn?: number;
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
      "2. The side with the word FRONT is your front view — keep it facing you.\n" +
      "3. Measure it with your ruler — every dimension is a whole inch.\n" +
      "4. Draw its front, top, and side views on paper first.\n" +
      "5. Build it here exactly as you measured it.\n" +
      "6. Click Check My Model — if it matches, hit Submit!",
    precision: "whole",
    refDocJson: refS101,
    // Teacher print carries an engraved FRONT label; refDocJson stays the
    // CLEAN geometry — the engraving must never reach the fit check.
    stlPath: "/stem-sketch/challenges/s1-01-step-block-teacher-print.stl",
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
      "2. The side with the word FRONT is your front view — keep it facing you.\n" +
      "3. Measure it with your ruler — every dimension is a whole inch.\n" +
      "4. Draw its front, top, AND right-side views on paper — one view isn't enough for this block!\n" +
      "5. Build it here exactly as you measured it.\n" +
      "6. Click Check My Model — if it matches, hit Submit!",
    precision: "whole",
    refDocJson: refS102,
    // Teacher print carries an engraved FRONT label; refDocJson stays clean.
    stlPath: "/stem-sketch/challenges/s1-02-double-steps-teacher-print.stl",
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
      "2. The side with the word FRONT is your front view — keep it facing you.\n" +
      "3. Measure it with your ruler — dimensions go to the nearest quarter inch (¼ = .25, ½ = .5, ¾ = .75).\n" +
      "4. Draw its front, right-side, AND top views on paper — this block needs all three!\n" +
      "5. Build it here exactly as you measured it.\n" +
      "6. Click Check My Model — if it matches, hit Submit!",
    precision: "quarter",
    refDocJson: refS103,
    // Teacher print carries an engraved FRONT label; refDocJson stays clean.
    stlPath: "/stem-sketch/challenges/s1-03-triple-view-teacher-print.stl",
    imagePath: "/stem-sketch/challenges/s1-03-triple-view.jpg",
    toleranceMm: 0.5,
  },
];

export const SKETCH_CHALLENGES_S2: SketchChallenge[] = [
  {
    id: "s2-01-reverse-step",
    stage: 2,
    title: "Reverse Step",
    description:
      "A staircase that fills most of a 3-inch cube — students measure it, then design the MISSING piece (the upside-down staircase) that completes the cube. Quarter-inch dimensions. The first Fill the Void challenge.",
    studentInstructions:
      "1. Get the printed Reverse Step block from your teacher.\n" +
      "2. The side with the word FRONT is your front view — keep it facing you.\n" +
      "3. Measure it with your ruler — dimensions go to the nearest quarter inch (¼ = .25, ½ = .5, ¾ = .75).\n" +
      "4. Picture the missing piece: block + your piece = a perfect 3-inch cube.\n" +
      "5. Draw the MISSING piece's views on paper, then build ONLY that piece here — not the block!\n" +
      "6. Click Check My Model — if your piece completes the cube, hit Submit!",
    precision: "quarter",
    refDocJson: refS201,
    stlPath: "/stem-sketch/challenges/s2-01-reverse-step-teacher-print.stl",
    imagePath: "/stem-sketch/challenges/s2-01-reverse-step.jpg",
    toleranceMm: 0.5,
    targetCubeIn: 3,
  },
  {
    id: "s2-02-double-take",
    stage: 2,
    title: "Double Take",
    description:
      "A thick base with a tall tower in one corner — the missing piece is the L-shaped lid that sits on the base and wraps around the tower to finish the 3-inch cube. Quarter-inch dimensions; worth a second look before you draw.",
    studentInstructions:
      "1. Get the printed Double Take block from your teacher.\n" +
      "2. The side with the word FRONT is your front view — keep it facing you.\n" +
      "3. Measure it with your ruler — dimensions go to the nearest quarter inch (¼ = .25, ½ = .5, ¾ = .75).\n" +
      "4. Picture the missing piece: block + your piece = a perfect 3-inch cube.\n" +
      "5. Draw the MISSING piece's views on paper, then build ONLY that piece here — not the block!\n" +
      "6. Click Check My Model — if your piece completes the cube, hit Submit!",
    precision: "quarter",
    refDocJson: refS202,
    stlPath: "/stem-sketch/challenges/s2-02-double-take-teacher-print.stl",
    imagePath: "/stem-sketch/challenges/s2-02-double-take.jpg",
    toleranceMm: 0.5,
    targetCubeIn: 3,
  },
];

/** Every challenge across stages — single lookup space (ids are globally unique). */
const ALL_CHALLENGES: SketchChallenge[] = [...SKETCH_CHALLENGES, ...SKETCH_CHALLENGES_S2];

export function challengesForStage(stage: SketchStage): SketchChallenge[] {
  return ALL_CHALLENGES.filter(c => c.stage === stage);
}

export function getChallenge(id: string): SketchChallenge | undefined {
  return ALL_CHALLENGES.find(c => c.id === id);
}

/** True once the challenge's reference geometry has been authored (drives the
 *  "geometry pending" badge in the teacher picker; not an assignment gate). */
export function challengeReady(c: SketchChallenge): boolean {
  return c.refDocJson !== null;
}
