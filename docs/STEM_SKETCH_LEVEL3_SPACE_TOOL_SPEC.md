# Level 3 — "Space Tool Design Challenge" — working spec

First Brainstorm & Design Your Own challenge. Classroom-proven (user has run
it for years on Tinkercad); this migrates it onto STEM Sketch assignments
with digital go/no-go gauges + teacher rubric. Companion spec for challenge
#2 (Fishing Pole — multi-part + joint) comes after this ships.

Open items for the user are marked **[CONFIRM]**.

---

## 1. The challenge (student-facing brief)

> **Meet Neil.** Neil is consistently having a hard time making repairs on
> the outside of his space station. His biggest issue: way too many tools —
> he's always losing them in space as he fumbles through his toolbox. For
> his next mission he wants to carry a **single tool** when he leaves the
> shelter of the station. It must handle all **7 tasks** on his maintenance
> rounds and fit in his pocket — no toolbox.
>
> **Your challenge: design Neil's tool in STEM Sketch.**
>
> Design considerations:
> - The tool must be a **single component** — no moving parts, no add-ons.
> - The **pin must be pulled**, not pried — and Neil keeps his thumb on it
>   while pulling so it doesn't float away!
> - The **plug must be lifted**, not pried — thumb on it while lifting!
> - Everything should be at least **3/8" thick** so it isn't delicate
>   (tool ends will obviously narrow).
> - Neil wears astro skinny jeans — an ideal design slips in and out of his
>   pocket and is comfortable in his hand.
> - The measurements listed won't help without research — **measure the
>   items on the challenge board in class.**

(Adapted near-verbatim from the user's existing courseware; only
Tinkercad → STEM Sketch. **[CONFIRM]** final wording + the Neil image file
to ship with the brief — the astronaut/wrench/asteroid composite.)

## 2. The challenge board (teacher kit — real hardware, not prints)

Unlike levels 1–2 (printed blocks), the physical rig is real hardware
mounted on a board. The pro kit ships a **parts list + build reference
photo** (user's purple board):

| Task name (rubric) | Hardware | Gauge-relevant dimension |
|---|---|---|
| Sun Bolt | 1/4"-20 hex head bolt | across-flats **7/16"** |
| Saturn Bolt | 3/8"-16 hex head bolt | across-flats **9/16"** |
| Jupiter Bolt | 1/2"-13 hex head bolt | across-flats **3/4"** |
| Orion's Screw | 1/4"-20 flat/Phillips machine screw | slot ≈ 0.05" wide |
| Ring of Neptune | 1" ring (eye bolt) | 1" inner diameter |
| Intergalactic Release Pin | 1/4" hair pin clip | pull, thumb-secured |
| Space Continuum Plug | 3/4" tapered plug | lift, thumb-secured |

Planet-name → hardware mapping CONFIRMED by user 2026-08-28
(Sun = 1/4", Saturn = 3/8", Jupiter = 1/2" — sized like the planets).

Note: hex across-flats dims match STEM Sketch's fastener library specs —
the same data that generates bolts in-tool generates the wrench gauges, so
the digital check and the real board agree by construction.

## 3. Rubric (the template for ALL level 3 challenges)

Row model: `{ id, label, description, kind: auto | assisted | teacher,
bands: [10, 8, 6, 4] with band descriptors, check? }`. Total 10 rows ×
10 pts = **100 points**. CONFIRMED 2026-08-28: students see the TOTAL
only ("86/100 — graded") on their dashboard card; row-by-row stays
teacher-side. No pass/fail — the score is the outcome.

| Row | Kind | How it's scored |
|---|---|---|
| Overall Dimensions | **auto** | footprint area (bbox L×W of the tool, in²): <15 → 10, <17 → 8, <19 → 6, else 4. Exact user bands. |
| Creativity | teacher | bands per user rubric ("true individual design and innovation") |
| Functionality | teacher | "components work together and in the hand… comfy pocket fit" |
| Sun Bolt (1/4") | **assisted** | wrench-opening gauge found at 7/16" AF → suggest 10; found but sloppy/tight → suggest 8; not found → suggest 4. Teacher confirms/overrides. |
| Saturn Bolt (3/8") | **assisted** | same, 9/16" AF |
| Jupiter Bolt (1/2") | **assisted** | same, 3/4" AF |
| Orion's Screw | teacher (v1) | blade detection is fuzzy — teacher judges; candidate for assisted in v2 |
| Ring of Neptune | teacher | hook/catch concept — teacher judges |
| Intergalactic Release Pin | teacher | pull + thumb-hold concept |
| Space Continuum Plug | teacher | lift + thumb-hold concept |

Plus **non-scored requirement gates** shown in the student's check panel
(and to the teacher):

- **Single component**: exactly 1 visible solid body, 0 joints — data
  check, definitive. Contrast: the Fishing Pole challenge will REQUIRE
  joints; the rubric engine supports both via per-challenge requirements.
- **Min thickness 3/8"** — ADVISORY only (the brief allows tool ends to
  narrow, so a hard erosion test would false-fail). Shown as an informative
  note, judged by the teacher inside Functionality.

## 4. The auto checks — how they work (iframe, at Check time)

1. **Footprint area**: world bbox of the single body; area = the two
   largest bbox dims multiplied (tool lying flat), in in². Banded per rubric.
2. **Single component**: `doc.bodies` visible positives === 1 && no joints.
3. **Wrench openings** (the interesting one): project the tool onto its
   flat plane and rasterize the footprint (~0.01" resolution 2D grid).
   Find interior holes and boundary notches; measure each opening's width
   via 2D distance transform. A gauge "passes" when some opening's width w
   satisfies AF + 0.005" ≤ w ≤ AF + 1/16" (fits the bolt head, not sloppy).
   Report per-gauge: found/at-width/not-found + measured widths. All three
   hex sizes checked from the same raster.
4. Results ride in `metrics.rubricAuto` on the submission (same jsonb
   pipeline as levels 1–2) so the teacher's scoring panel pre-fills.

No reference geometry exists for level 3 — `refDocJson: null` stays, and
the check panel shows a REQUIREMENTS CHECKLIST instead of a fit verdict.
The green ghost machinery is unused here.

## 5. Data model / platform changes

- **Challenge shape**: `stage: 3` joins the union; new optional fields:
  `brief` (long-form student brief, markdown-ish), `briefImagePath`,
  `rubric: RubricRow[]`, `kit` (teacher parts list / downloads). No
  refDocJson, no targetCubeIn, no solution STL — kit is a hardware list.
- **Migration 0022**: `stem_sketch_submissions` gains
  `rubric_scores jsonb` (per-row {score, auto, overridden}), `graded_at
  timestamptz`, `graded_by text`. Total computed at read time.
- **Teacher scoring UI** (new, in StemSketchTab results roster): "Grade"
  button per submission → panel with the rubric rows, auto rows pre-scored,
  assisted rows pre-suggested, teacher rows blank; save → PATCH route
  (`/api/teacher/stem-sketch-results` grows a POST/PATCH for scores).
  Student dashboard card shows the TOTAL once graded (per-row stays
  teacher-side — confirmed 2026-08-28).
- **Level 3 box** in the create flow flips from "coming soon" to active,
  listing stage 3 challenges.
- **Student check panel** (iframe): for stage 3, "Check My Model" runs the
  requirement checks and shows the checklist (✓ single part, footprint
  band + area, per-wrench gauge results, thickness advisory). Submit
  allowed regardless of results (design work is always submittable — the
  rubric is the judgment, not a gate).
- **Worksheet**: CONFIRMED for v1 — a level 3 BRAINSTORM sheet: Neil brief
  summary + task checklist + open dot-grid sketch space (same print
  pipeline, new layout branch by stage).

## 6. Build order

1. Migration 0022 + rubric types in the challenge library + Space Tool
   entry (brief text, rubric rows, kit list).
2. Teacher: level 3 box live, challenge card w/ brief preview + kit
   downloads; results roster Grade panel (auto pre-fill wiring).
3. Iframe: stage 3 check panel — requirements checklist (single body,
   footprint, wrench raster gauges), metrics.rubricAuto in submission.
4. Student dashboard: graded-score display.
5. Fishing Pole challenge rides the finished rails (adds: multi-part
   requirement, joint-required check, fish STL kit, dowel-fit gauge).

## 7. Open questions (need user)

1. Neil brief image — supply the composite image file for the brief page
   (drop in Downloads or marketing shots folder).
2. Final brief wording sign-off (§1) — near-verbatim adaptation approved
   in discussion; flag any line to change.

(Planet mapping, total-only score display, and brainstorm worksheet all
CONFIRMED 2026-08-28.)
