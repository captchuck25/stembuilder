// Single source of truth for the "For Teachers" marketing pages.
// One entry here generates a directory card, a quick-view modal, and a
// detail page at /for-teachers/tools/[slug] — adding a 7th tool is one entry.
//
// Client-safe: no server-only imports.

export interface MarketingTool {
  slug: string;
  name: string;
  subtitle?: string; // e.g. "Home Designer"
  flagship: boolean;
  /** Card one-liner — FINAL marketing copy, use verbatim. */
  tagline: string;
  /** Route of the real tool, for "Try it" CTAs. */
  toolHref: string;
  /** Existing button art used as the card/detail media. */
  image: string;
  gradeBand: string;
  subjects: string[];
  /** Expanded description paragraphs for the detail page. */
  description: string[];
  /** "How a class uses it" bullets. */
  classroomUse: string[];
  /**
   * Example-gallery items. `label` doubles as the alt text; while `src` is
   * absent the slot renders as a labeled placeholder.
   */
  gallery: { label: string; src?: string }[];
  /** Label (and alt-text contract) for the short demo video. */
  demoVideo: string;
  /** Path under /public for the demo video; placeholder shown while absent. */
  demoVideoSrc?: string;
  /** SEO meta description for the detail page. */
  seoDescription: string;
  /**
   * Full body text of the "Lesson plans & projects" callout on the detail
   * page — what Pro/District plans include for this tool.
   * Omit to hide the callout on that tool's page.
   */
  lessonPlanPitch?: string;
}

export const FLAGSHIP_CALLOUT =
  "The work doesn't stay trapped on a screen: export to 3D printers, laser " +
  "cutters, and CNC machines, and bring students' designs into their hands.";

/** Softened until per-tool mappings are written — do not claim alignment yet. */
export const STANDARDS_FRAMEWORKS = ["NGSS", "Common Core", "ISTE"] as const;

export const TOOLS: MarketingTool[] = [
  {
    slug: "stem-sketch",
    name: "STEM Sketch",
    flagship: true,
    tagline:
      "Design real, fabrication-ready parts for 3D printing, laser cutting, and CNC — the perfect on-ramp to CAD production. From screen straight to your makerspace.",
    toolHref: "/tools/stem-sketch",
    image: "/ui/stem-sketch.png",
    gradeBand: "Grades 4–12",
    subjects: ["Engineering", "Design", "Makerspace"],
    description: [
      "STEM Sketch is a browser-based 3D design studio built for classrooms. Students create real objects in an intuitive format that builds directly on how they first learn to draw — the same orthographic thinking they practice on paper carries straight into the software. Their work exports as fabrication-ready files: STL for 3D printers, SVG for laser cutters, and paths for CNC. There's nothing to install, and a first-time user is modeling within minutes.",
      "Under the hood it's genuinely capable — precise dimensions, boolean cuts, even threaded bolts and nuts — so the ceiling stays high for your strongest builders while the floor stays low for beginners.",
    ],
    classroomUse: [
      "Start with a one-period project: a name keychain or luggage tag, designed and sent to the 3D printer the same day.",
      "Level up to functional parts — hooks, brackets, boxes with fitted lids — that students measure, model, and print.",
      "Run a design brief: give a constraint (must hold a phone at an angle, must fit in a 100 mm cube) and let students iterate.",
      "Every design saves to the student's account, and you can see the class's work from your dashboard.",
    ],
    gallery: [
      { label: "Screenshot — modeling a part in STEM Sketch" },
      { label: "Photo — 3D-printed student designs" },
      { label: "Screenshot — SVG export ready for the laser cutter" },
    ],
    demoVideo: "Demo video — from blank canvas to printable part (2 min)",
    seoDescription:
      "STEM Sketch is a browser-based 3D design tool for schools. Students design fabrication-ready parts for 3D printing, laser cutting, and CNC — the perfect on-ramp to CAD production.",
    lessonPlanPitch:
      "Teacher Pro and District plans include ready-to-teach lesson plans and projects — bringing 3D-printed and CNC-style projects to entire classrooms, not just one student at a time.",
  },
  {
    slug: "blueprint-lab",
    name: "Blueprint Lab",
    subtitle: "Home Designer",
    flagship: true,
    tagline:
      "Floor plan design to full architectural drawing sets — walls, sections, rooflines, elevations, even a 3D walkthrough — real architectural design from day one.",
    toolHref: "/tools/blueprint-lab",
    image: "/ui/blueprint_lab.png",
    gradeBand: "Grades 5–12",
    subjects: ["Engineering", "Math", "Design"],
    description: [
      "Blueprint Lab is a to-scale home design studio in the browser. Students draw real floor plans — placing interior walls, doors, windows, closets, even furnishings. From there, they're guided through the rest of the process with ease: sections, elevations, rooflines, and a 3D walkthrough, generated from their plan, resulting in a full set of architectural drawings. It teaches genuine architectural thinking: scale, dimensioning, and spatial reasoning.",
      "Drawing is immediate — true architectural thinking and experience from the start. Precision comes built in: every dimension is measurement-exact.",
    ],
    classroomUse: [
      "The classic: a Design-a-Tiny-Home challenge with a square-footage budget — area, perimeter, and proportional reasoning disguised as fun.",
      "Math tie-ins: compute room areas, cost out flooring by the square foot, convert between scales.",
      "Open-ended creativity: design your dream bedroom, then your dream house.",
      "Advanced students go further — multiple floors, roofs, and elevation drawings.",
    ],
    gallery: [
      { label: "Screenshot — a student floor plan with dimensions" },
      { label: "Screenshot — the same home in the 3D view" },
      { label: "Screenshot — elevation drawings generated from the plan" },
    ],
    demoVideo: "Demo video — drawing a small home to scale (2 min)",
    seoDescription:
      "Blueprint Lab takes students from floor plan design to full architectural drawing sets in the browser — walls, sections, rooflines, elevations, and a 3D walkthrough — real architectural design from day one.",
    lessonPlanPitch:
      "Teacher Pro and District plans include ready-to-teach lesson plans and projects — bringing to-scale architectural design projects to entire classrooms, not just one student at a time.",
  },
  {
    slug: "bridge-builder",
    name: "Bridge Builder",
    flagship: false,
    tagline:
      "Design a bridge, then stress-test it under load and watch it hold — or crumble. Engineering, physics, and problem-solving in one.",
    toolHref: "/tools/bridge",
    image: "/ui/bridge-button.png",
    gradeBand: "Grades 4–10",
    subjects: ["Physics", "Engineering"],
    description: [
      "Students design a truss bridge, then put it under load and watch the physics play out — members stretch and compress, color-shift under stress, and fail if the design can't take it. It turns engineering iteration into a game: design, test, learn, redesign.",
      "Built-in challenges, class leaderboards, and a teacher gradebook make it easy to run as a competition — designs are ranked on efficiency, rewarding the bridge that holds its load at the lowest cost.",
    ],
    classroomUse: [
      "Run the Bridge Challenge: everyone gets the same span and load, and the class leaderboard tracks whose design does it most efficiently — and at the lowest cost.",
      "Teach forces by watching them: tension and compression are color-coded live under load.",
      "Pair with a physical build — design and test digitally first, giving students confidence in their design before investing the time to construct it from classroom materials.",
    ],
    gallery: [
      {
        label: "The design canvas — span, load, materials, and a budget to beat",
        src: "/marketing/bridge-builder/gallery-1.png",
      },
      {
        label: "A truss under stress test — every member color-coded by load",
        src: "/marketing/bridge-builder/gallery-2.png",
      },
      {
        label: "Teacher view — bridge assignments with results, designs, and costs",
        src: "/marketing/bridge-builder/gallery-3.png",
      },
    ],
    demoVideo: "Demo video — designing and stress-testing a bridge (90 sec)",
    demoVideoSrc: "/marketing/bridge-builder/demo.mp4",
    seoDescription:
      "Bridge Builder lets students design a bridge and stress-test it under load in the browser — live physics, class leaderboards, and engineering iteration in one tool.",
  },
  {
    slug: "code-lab",
    name: "Code Lab",
    flagship: false,
    tagline:
      "Learn to code by doing — guide characters through mazes and design games with blocks, then graduate to real Python: coding logic and drawing with the turtle tool. Everything runs right in the browser.",
    toolHref: "/tools/code-lab",
    image: "/ui/codelab.png",
    gradeBand: "Grades 3–8",
    subjects: ["Computer Science"],
    description: [
      "Code Lab is a progression, not a single app. Students start with block coding — guiding a character through maze puzzles where every level teaches a real concept: sequences, loops, conditions, functions — then put those skills to work designing their own games in blocks. From there, students graduate to typing real Python: working through the same coding logic, then turning code into art with the turtle tool.",
      "Everything runs in the browser with nothing to install, and teacher controls let you unlock levels as your class progresses — so nobody races ahead and nobody gets lost.",
    ],
    classroomUse: [
      "A ready-made block-coding unit: students work through leveled maze challenges at their own pace while you watch progress from the dashboard.",
      "The game designer: students put their block skills to work building playable games of their own design — then share them to the class arcade, where classmates can try them out.",
      "The transition unit: the same maze puzzles, now solved in typed Python.",
      "Turtle graphics assignments — set a Python drawing challenge and review every student's art in one place.",
    ],
    gallery: [
      {
        label: "Block coding — a nested-loops maze challenge, solved",
        src: "/marketing/code-lab/gallery-1.png",
      },
      {
        label: "The game designer — building a playable level in Free Build",
        src: "/marketing/code-lab/gallery-2.png",
      },
      {
        label: "Teacher view — assigning levels and tracking every student's progress",
        src: "/marketing/code-lab/gallery-3.png",
      },
    ],
    demoVideo: "Demo video — solving a maze in typed Python (60 sec)",
    demoVideoSrc: "/marketing/code-lab/demo.mp4",
    seoDescription:
      "Code Lab teaches students to code in the browser — maze puzzles and game design with blocks, then a graduation path to real Python logic and turtle graphics, with teacher progress tracking.",
    lessonPlanPitch:
      "Teacher Pro and District plans include answer keys and ready-to-use video tutorials to share with your class.",
  },
  {
    slug: "electronics-lab",
    name: "Electronics Lab",
    flagship: false,
    tagline:
      "Snap together batteries, bulbs, and switches in a live circuit simulator — bulbs really glow, shorts really trip — and work up from first circuits to breadboards and Ohm's Law.",
    toolHref: "/tools/electronics-lab",
    image: "/ui/electronics-lab.png",
    gradeBand: "Grades 3–8",
    subjects: ["Physical Science", "Electronics"],
    description: [
      "Electronics Lab is a live circuit simulator with real physics under the hood. Students snap batteries, bulbs, switches, and wires together and see honest results instantly — bulbs glow brighter or dimmer based on actual circuit math, short circuits trigger warnings, and meters read true values. Components look like the real parts first; a schematic view builds symbol literacy as students advance.",
      "Guided units walk the class from \"what is a circuit?\" through series and parallel circuits, switches, troubleshooting, Ohm's Law, and breadboards — each with challenges and quick quizzes, plus optional try-it-for-real extensions using simple classroom materials.",
    ],
    classroomUse: [
      "Start with the first units: light a bulb, then discover why series circuits dim and parallel circuits don't.",
      "No parts kits required — every student experiments safely, and nothing burns out for real.",
      "Extend into the physical world: units include hands-on companion builds, like a cardboard-and-brad switch or a real breadboard circuit.",
    ],
    gallery: [
      { label: "Screenshot — a parallel circuit glowing in the simulator" },
      { label: "Screenshot — the schematic view of the same circuit" },
      { label: "Screenshot — a unit challenge with its quiz" },
    ],
    demoVideo: "Demo video — building a first circuit (90 sec)",
    seoDescription:
      "Electronics Lab is a live circuit simulator for classrooms — students build circuits with batteries, bulbs, and switches, and progress from first circuits to breadboards and Ohm's Law.",
  },
  {
    slug: "measurement-lab",
    name: "Measurement Lab",
    flagship: false,
    tagline:
      "Practice measurement, scale, and precision with instant feedback — plus timed sprints and class leaderboards to keep students pushing for accuracy.",
    toolHref: "/tools/measurement-lab",
    image: "/ui/measurement-button.png",
    gradeBand: "Grades 3–6",
    subjects: ["Math", "Science"],
    description: [
      "Measurement Lab gives focused practice on a skill students quietly struggle with: measuring accurately. Students measure on screen with instant feedback — down to the fraction — and build real fluency with rulers, scale, and precision.",
      "Timed sprints and class leaderboards turn accuracy into a competition, and teacher assignments plus a results view make it easy to see who's fluent and who needs another round.",
    ],
    classroomUse: [
      "Warm-up sprints: five minutes of timed measuring at the start of class, with the leaderboard on the projector.",
      "Assign practice by skill level and watch results roll into your dashboard.",
      "Pair with real rulers — the on-screen practice transfers directly to physical measuring.",
    ],
    gallery: [
      {
        label: "Graduated Cylinder — reading the meniscus for volume",
        src: "/marketing/measurement-lab/gallery-1.png",
      },
      {
        label: "Triple Beam Balance — reading all three beams for total mass",
        src: "/marketing/measurement-lab/gallery-2.png",
      },
      {
        label: "Dial Caliper — measuring to the thousandth of an inch",
        src: "/marketing/measurement-lab/gallery-3.png",
      },
    ],
    demoVideo: "Demo video — the Ruler Game with instant feedback (50 sec)",
    demoVideoSrc: "/marketing/measurement-lab/demo.mp4",
    seoDescription:
      "Measurement Lab builds measuring fluency with instant feedback, timed sprints, and class leaderboards — hands-on practice with rulers, scale, and precision.",
  },
];

export function getTool(slug: string): MarketingTool | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolDisplayName(t: MarketingTool): string {
  return t.subtitle ? `${t.name} (${t.subtitle})` : t.name;
}
