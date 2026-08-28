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
import refS203 from "./challenges/s2-03-funky-towers.json";

export type SketchPrecision = "whole" | "half" | "quarter" | "eighth";

export type SketchStage = 1 | 2 | 3;

/** Level 3 rubric row. kind: 'auto' scores itself from the in-tool checks;
 *  'assisted' pre-suggests from a check but the teacher confirms;
 *  'teacher' is judged entirely by the teacher. Bands are the four score
 *  levels (highest first) with kid/teacher-facing descriptors. */
export interface RubricRow {
  id: string;
  label: string;
  description?: string;
  kind: "auto" | "assisted" | "teacher";
  /** Score values for the four bands, highest first (e.g. [10, 8, 6, 4]). */
  bandScores: number[];
  /** Descriptor per band, same order as bandScores. */
  bandLabels: string[];
  /** For auto/assisted rows: which in-tool check feeds it. */
  check?:
    | { type: "footprintArea"; bandsSqIn: number[] } // area < bandsSqIn[i] → bandScores[i]
    | { type: "wrenchOpening"; acrossFlatsIn: number };
}

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
  /** Stage 2 only: printable STL of the SOLUTION piece (teacher demo — snaps
   *  into the printed void block to complete the cube). Never shown to
   *  students; null until authored. */
  solutionStlPath?: string | null;
  /** Stage 3 only: long-form student brief (newline-separated paragraphs;
   *  lines starting with "- " render as bullets). */
  brief?: string;
  /** Stage 3 only: image shown with the brief (e.g. Neil the astronaut). */
  briefImagePath?: string | null;
  /** Stage 3 only: the grading rubric (see RubricRow). */
  rubric?: RubricRow[];
  /** Stage 3 only: teacher kit — real-hardware parts list / build notes. */
  kit?: string[];
  /** Stage 3 only: non-scored requirement gates surfaced in the student's
   *  check panel. Currently understood keys: singleBody, minThicknessIn
   *  (advisory). */
  requirements?: { singleBody?: boolean; minThicknessIn?: number };
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
    solutionStlPath: "/stem-sketch/challenges/s2-01-reverse-step-solution.stl",
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
    solutionStlPath: "/stem-sketch/challenges/s2-02-double-take-solution.stl",
  },
  {
    id: "s2-03-funky-towers",
    stage: 2,
    title: "Funky Towers",
    description:
      "Four towers of different heights on a base — the missing piece has four pockets that slide down over them to finish the 3-inch cube. The FIRST eighth-inch challenge (its worksheet prints with an eighth-inch dot grid automatically). The Fill the Void capstone.",
    studentInstructions:
      "1. Get the printed Funky Towers block from your teacher.\n" +
      "2. The side with the word FRONT is your front view — keep it facing you.\n" +
      "3. Measure it with your ruler — dimensions go to the nearest EIGHTH of an inch (⅛ = .125, ¼ = .25, ⅜ = .375, ½ = .5, ⅝ = .625, ¾ = .75, ⅞ = .875).\n" +
      "4. Picture the missing piece: block + your piece = a perfect 3-inch cube.\n" +
      "5. Draw the MISSING piece's views on paper, then build ONLY that piece here — not the block!\n" +
      "6. Click Check My Model — if your piece completes the cube, hit Submit!",
    precision: "eighth",
    refDocJson: refS203,
    stlPath: "/stem-sketch/challenges/s2-03-funky-towers-teacher-print.stl",
    imagePath: "/stem-sketch/challenges/s2-03-funky-towers.jpg",
    toleranceMm: 0.5,
    targetCubeIn: 3,
    solutionStlPath: "/stem-sketch/challenges/s2-03-funky-towers-solution.stl",
  },
];

// Level 3 — Brainstorm & Design Your Own. Design briefs: no reference
// geometry, no fit check — a requirements checklist in-tool + a teacher
// rubric on the platform. Spec: docs/STEM_SKETCH_LEVEL3_SPACE_TOOL_SPEC.md
const TASK_BANDS = {
  bandScores: [10, 8, 6, 4],
  bandLabels: [
    "Solution is accurate in measurements & concept",
    "Solution is present but measurements or concept is off",
    "Solution is present but will not work",
    "Solution not incorporated",
  ],
};

export const SKETCH_CHALLENGES_S3: SketchChallenge[] = [
  {
    id: "s3-01-space-tool",
    stage: 3,
    title: "Space Tool",
    description:
      "The classic: Neil the astronaut needs ONE pocket-sized tool that handles all 7 tasks on his maintenance rounds — three hex bolts, a screw, a ring, a release pin, and a plug. Single component, no moving parts. Students measure real hardware on the challenge board, research the rest, and design. Auto-checks: footprint size, single-part, wrench openings; you grade the rest with the rubric.",
    studentInstructions:
      "1. Read Neil's brief (📋 panel) — one tool, seven jobs, no moving parts.\n" +
      "2. Measure the hardware on the challenge board — the listed sizes need research!\n" +
      "3. Brainstorm on your worksheet first: sketch at least two ideas.\n" +
      "4. Build your tool here as ONE single part, at least ⅜\" thick (ends can narrow).\n" +
      "5. Click Check My Model to see the requirements checklist.\n" +
      "6. Submit when it's your best work — your teacher grades it with the rubric.",
    brief:
      "This is Neil. He is consistently having a hard time making repairs on the outside of his space station. His biggest issue: way too many tools — he is always losing them in space as he fumbles through his toolbox.\n" +
      "For his next mission he wants to carry a SINGLE TOOL when he leaves the shelter of the station. It must handle all 7 tasks on his normal maintenance rounds and fit in his pocket — no toolbox.\n" +
      "Your challenge: design Neil's tool.\n" +
      "- The tool must be a single component — no moving parts, no add-ons.\n" +
      "- The pin must be PULLED, not pried — and Neil keeps his thumb on it while pulling so it doesn't float away!\n" +
      "- The plug must be LIFTED, not pried — thumb on it while lifting!\n" +
      "- Everything should be at least 3/8\" thick so it isn't delicate (tool ends will obviously narrow).\n" +
      "- Neil wears astro skinny jeans — an ideal design slips in and out of his pocket and is comfortable in his hand.\n" +
      "- The measurements listed won't help without research — measure the items on the challenge board in class!",
    briefImagePath: null, // Neil composite image — pending from user
    kit: [
      "Challenge board (build from parts below — see reference photo)",
      "1/4\"-20 hex head bolt (Sun Bolt)",
      "3/8\"-16 hex head bolt (Saturn Bolt)",
      "1/2\"-13 hex head bolt (Jupiter Bolt)",
      "1/4\"-20 flat/Phillips machine screw (Orion's Screw)",
      "1\" ring / eye bolt (Ring of Neptune)",
      "1/4\" hair pin clip (Intergalactic Release Pin)",
      "3/4\" tapered plug (Space Continuum Plug)",
      "Mounting board + nuts to seat the hardware",
    ],
    rubric: [
      {
        id: "dimensions", label: "Overall Dimensions", kind: "auto",
        bandScores: [10, 8, 6, 4],
        bandLabels: ["Under 15 square inches", "Under 17 square inches", "Under 19 square inches", "Any size"],
        check: { type: "footprintArea", bandsSqIn: [15, 17, 19] },
      },
      {
        id: "creativity", label: "Creativity", kind: "teacher",
        description: "Design shows true individual design and innovation.",
        bandScores: [10, 8, 6, 4],
        bandLabels: ["Outstanding", "Strong", "Developing", "Minimal"],
      },
      {
        id: "functionality", label: "Functionality", kind: "teacher",
        description: "Components work well together and in the human hand; each fulfills its task without interfering with another. Has a comfy pocket fit!",
        bandScores: [10, 8, 6, 4],
        bandLabels: ["Outstanding", "Strong", "Developing", "Minimal"],
      },
      { id: "sun-bolt", label: "Sun Bolt (1/4\")", kind: "assisted",
        check: { type: "wrenchOpening", acrossFlatsIn: 0.4375 }, ...TASK_BANDS },
      { id: "saturn-bolt", label: "Saturn Bolt (3/8\")", kind: "assisted",
        check: { type: "wrenchOpening", acrossFlatsIn: 0.5625 }, ...TASK_BANDS },
      { id: "jupiter-bolt", label: "Jupiter Bolt (1/2\")", kind: "assisted",
        check: { type: "wrenchOpening", acrossFlatsIn: 0.75 }, ...TASK_BANDS },
      { id: "orions-screw", label: "Orion's Screw", kind: "teacher", ...TASK_BANDS },
      { id: "ring-of-neptune", label: "Ring of Neptune", kind: "teacher", ...TASK_BANDS },
      { id: "release-pin", label: "Intergalactic Release Pin", kind: "teacher", ...TASK_BANDS },
      { id: "continuum-plug", label: "Space Continuum Plug", kind: "teacher", ...TASK_BANDS },
    ],
    requirements: { singleBody: true, minThicknessIn: 0.375 },
    precision: "eighth",
    refDocJson: null,
    stlPath: null,
    imagePath: null, // filled once the user models a sample/hero image
    toleranceMm: 0.5,
  },
];

/** Every challenge across stages — single lookup space (ids are globally unique). */
const ALL_CHALLENGES: SketchChallenge[] = [...SKETCH_CHALLENGES, ...SKETCH_CHALLENGES_S2, ...SKETCH_CHALLENGES_S3];

export function challengesForStage(stage: SketchStage): SketchChallenge[] {
  return ALL_CHALLENGES.filter(c => c.stage === stage);
}

/** Distilled auto-check parameters for the iframe's stage 3 requirements
 *  checklist — derived from the rubric so the checks and the grading can
 *  never drift apart. */
export function challengeCheckParams(c: SketchChallenge): {
  footprintBandsSqIn?: number[];
  wrenchOpeningsIn?: { label: string; acrossFlatsIn: number }[];
} {
  const out: ReturnType<typeof challengeCheckParams> = {};
  for (const row of c.rubric ?? []) {
    if (row.check?.type === "footprintArea") out.footprintBandsSqIn = row.check.bandsSqIn;
    if (row.check?.type === "wrenchOpening") {
      (out.wrenchOpeningsIn ??= []).push({ label: row.label, acrossFlatsIn: row.check.acrossFlatsIn });
    }
  }
  return out;
}

export function getChallenge(id: string): SketchChallenge | undefined {
  return ALL_CHALLENGES.find(c => c.id === id);
}

/** True once the challenge's reference geometry has been authored (drives the
 *  "geometry pending" badge in the teacher picker; not an assignment gate). */
export function challengeReady(c: SketchChallenge): boolean {
  return c.refDocJson !== null;
}
