# Blueprint Lab — Teacher Assignments, Rubrics & Community Vision

Captured 2026-08-28 from Charlie's spoken vision. Structured for phased implementation;
nothing here is built yet. Each phase is independently shippable and builds on the last.

The through-line: **the curriculum is the hook, the checkers are the moat** (see
pro-tier feature notes). This is the Blueprint Lab version of the assignment ladder
already live for STEM Sketch (platform + iframe assignment mode + teacher preview).

---

## The four pillars

1. **Design briefs** — teacher assigns a project from their dashboard (studio apartment,
   2-BR condo, 2,000 sqft single-family home, …).
2. **Starter shells** — per brief, the teacher chooses: design from scratch, OR pick from
   ~6 pre-designed perimeter shapes (L, ranch, rectangle, T, …). Students struggle to
   draw a sane building envelope on their own ("tetris-piece homes") — shells remove
   that failure mode without removing the real work (rooms, roof, windows, elevations
   all still theirs, so every student leaves with a portfolio piece).
3. **Hybrid rubric** — part auto-checked by the engine, part teacher-scored. Teacher
   adjusts the auto thresholds (room counts, min dimensions, window/door requirements).
4. **Community capstone (HOA)** — auto-generated neighborhood with roads and plots, one
   plot per student. HOA-style siting rules (setbacks from road/fence line). Students do
   a plot plan (place house + driveway) then design their house. Submissions roll up
   into a clickable community map where students can view each other's homes.

---

## Phase 1 — Design briefs + starter shells

**Teacher side (dashboard):**
- New Blueprint Lab assignment type alongside the existing STEM Sketch assignments.
- Pick a brief from a built-in library — three tiers forming a difficulty ladder, each
  with generic dimensions and a different deliverable scope:

  | Tier | Size | Shells | Deliverables |
  |---|---|---|---|
  | Studio apartment | ~500 sqft | a few simple shapes | floor plan only — it's a unit in a building, so **no roof plan, no elevations** |
  | Two-bedroom condo | ~900–1,100 sqft | a few shapes | floor plan only — same reasoning, no roof/elevations |
  | Single-story home | 2,000–2,500 sqft | widest variety (~6: L, ranch, T, U, …) | full pipeline: floor plan → **roof plan → then elevations** (elevations always follow the roof) |

  (Library grows over time; briefs carry a default rubric — Phase 2.)
- Per assignment, choose shell mode:
  - **From scratch** — blank canvas.
  - **Choose-a-shell** — student picks one of ~6 perimeter shapes sized for the brief
    (L, ranch/rectangle, T, U, courtyard, split). Shell = exterior walls only, **always
    locked** (decided 2026-08-28): editable shells defeat the purpose — with 30
    fourteen-year-olds who struggle with scale, the shell is the guardrail. Needs a
    locked-wall engine concept (students can attach doors/windows/interior walls to
    shell walls but not move/delete/resize them).
- Class/section targeting, open/close windows — mirror the existing assignment platform
  conventions (frozen snapshots, server-enforced windows, same as Quiz Builder).

**Student side (iframe assignment mode, like STEM Sketch stage 1):**
- Assignment opens Blueprint Lab with the brief pinned (requirements visible in a panel).
- Shell mode: shell pre-loaded as exterior walls on floor 1.
- Submit flow saves the project snapshot to the assignment.

**Data/infra notes:**
- Shells are just `Level.walls` presets — store as JSON seed projects in the repo
  (same pattern as STEM Sketch challenge geometry).
- Assignment tables/API: mirror the STEM Sketch assignment schema rather than invent new.

## Phase 2 — Hybrid rubric engine

Rubric = ordered list of criteria. Two kinds:

**Auto-checked criteria** (engine-verifiable against the project data model — all of
these are computable from existing structures: `RoomLabel` (canonical `ROOM_TYPES`
names + auto square footage + boundary polygons), doors/windows attached to walls,
`autoDetectRoomBoundary`):

| Check | What the engine verifies | Teacher-adjustable knobs |
|---|---|---|
| Rooms labeled | Every enclosed room has a `RoomLabel`; labels come from the canonical type list (no name drift) | required room list |
| Square footage | Each labeled room reports SF (auto-computed — check is "present + sane", not student arithmetic); optional total-SF target for the brief | total SF ± tolerance |
| Room count | N bedrooms, N bathrooms, kitchen present, etc. | counts per room type |
| Min room dimensions | Room's usable rectangle meets minimums (e.g. master ≥ 12×12, bedroom ≥ 10×10, bath ≥ 5×8) | per-room-type W×D minimums |
| Bedroom egress | Every bedroom has ≥1 window and ≥1 door — real IRC egress tie-in, great teaching hook | per-room-type window/door minimums |
| Door reachability | Every room reachable from the entry (no door-less rooms) | on/off |
| Entry doors | Front door present; back door required or not (doors on exterior walls are detectable — exterior is geometry-derived) | front only / front + back |
| Furnishings (optional) | Room contains required furniture kinds — bedroom: bed + dresser; bathroom: toilet + sink (+ tub/shower); kitchen: sink + stove + fridge. Furniture items carry kind + position, so "which room is it in" is point-in-boundary — fully checkable | per-room-type required-furniture list, on/off per assignment |
| Closet adjacency (optional) | Bedroom has an attached closet — a CLOSET/WALK-IN room sharing a door with the bedroom. Checkable via room adjacency (door connects the two boundaries) | on/off |
| Brief-specific extras | e.g. condo must have laundry; 2,000 sqft home needs garage | included in brief defaults |

All knobs ship with **generic standard defaults** (pre-filled minimum dimensions,
furnishing lists, egress rules) so a teacher can assign without configuring anything —
editing the rubric is optional, not required.

- Auto-checks run live in the student's requirements panel (guide mode: red/green
  checklist as they work — this is the "design checker" from the pro-tier notes) and
  again server-side at submission (assessment mode, snapshot-frozen).
- Min-dimension nuance: use the largest inscribed axis-aligned rectangle of the room
  boundary, not the bbox (an L-shaped "12×12" bedroom shouldn't pass on bbox).
- Open-plan rule (decided 2026-08-28): rooms in open spaces (kitchen flowing into
  living room) MUST have a student-drawn boundary before their checks run — the engine
  detects when an auto-boundary swallows another room's label and fails that room with
  "draw this room's boundary" instead of double-counting area. Drawing boundaries for
  open spaces is part of the student's job, prerequisite to feedback.

**Status: rubric engine core + Requirements panel BUILT (2026-08-28)** —
`engine/rubric.ts` (Brief model, 3 built-in briefs, evaluateBrief with all checks
above), `components/RequirementsPanel.tsx` (live red/green checklist overlay, brief
picker, per-room groups), toolbar toggle in the client. Verified by smoke test.
Teacher-editable rubrics, locked shells, and platform wiring are the next steps.

**Teacher-scored criteria:**
- Free-form rows the teacher writes (creativity, flow, presentation of elevations, …),
  each with a point value; scored in a review UI that shows the submitted plan
  (2D + 3D + elevations) beside the rubric.
- Default rubrics ship with each brief; teacher edits both halves before assigning.
- Final grade = auto points + teacher points; teacher can override auto results.

## Phase 3 — Submission, review & the keepsake

- Student submits; snapshot frozen (reuse retention/soft-delete + snapshot patterns).
- Teacher review queue per assignment: auto-check results precomputed, teacher fills
  their half, returns grade + comments.
- Deliverables scale with the brief tier (see Phase 1 table): apartment/condo briefs
  end at the floor plan; the house brief runs the full pipeline — floor plan, roof
  design, elevations, 3D — "a nice piece for the students to leave with." Shell mode
  doesn't shrink the work: the roof plan and elevations are entirely the student's
  even when the perimeter was given.
  Consider a one-click export of the Sandbox CAD sheet (already planned: paperspace
  compositing + DXF) as the final artifact students keep.

## Phase 4 — Community / HOA capstone

**Generation:**
- Teacher enters student count (one class or across all classes) → we auto-generate a
  community: road network + N plots. Plots vary slightly (dimensions/orientation/corner
  vs interior) — "a smidge different, not by a lot" — so work isn't identical but is
  gradeable on the same rubric.
- Teacher sets community requirements with guided defaults (like real HOA/zoning):
  front setback from road, side/rear setbacks from fence lines, driveway must meet
  road, max footprint or coverage %, etc.

**Student flow:**
1. **Plot plan** — place the house footprint + driveway on their assigned plot,
   respecting setbacks (setback compliance is auto-checkable geometry — same engine as
   Phase 2 checks).
2. **House design** — full Blueprint Lab flow (brief + rubric from Phases 1–2 still
   apply).

**The payoff — community map:**
- Once submitted, plots render into a shared viewable neighborhood map; students click
  a neighbor's plot to view (read-only) their house design.
- Visibility scoped to the class/teacher (COPPA posture: no public URLs, no
  cross-school visibility, view-only).

## Suggested build order

1. **Rubric engine core (Phase 2 auto-checks) FIRST, standalone** — a "Requirements"
   panel in Blueprint Lab that checks a hardcoded brief. Zero platform work, immediately
   demo-able, and it de-risks the hardest geometry (room detection, inscribed-rect
   minimums, egress). Also directly reusable as the pro-tier "design checker" even
   before assignments exist.
2. Briefs + shells as data (Phase 1 content) — seed projects + brief JSON.
3. Assignment platform wiring (Phase 1 plumbing + Phase 3) — clone the STEM Sketch
   assignment flow.
4. Teacher rubric editor + review UI (Phase 2 teacher half + Phase 3 grading).
5. Community generation + plot plan + map (Phase 4).

## Decided (2026-08-28)

- **Shells are always locked.** No teacher toggle. Engine needs a locked/protected wall
  flag (`WallStatus` may help): openings attachable, geometry immutable.
- **Rubric checks confirmed:** windows + doors per room, optional furnishing
  requirements (bedroom bed/dresser, bathroom + kitchen fixtures), optional closet
  attached to bedroom, front/back door, generic minimum dimensions — all shipped with
  editable generic-standard defaults.
- **Single-story only.** All briefs and shells are one floor — keeps roof + elevations
  tractable for students and sidesteps multi-floor complexity entirely. Revisit only
  if a future advanced brief demands it.

## Rubric builder design (2026-08-31, from Charlie's West Hollow rubric)

Source: Charlie's real classroom rubric (7 categories × 4 quality tiers at
14/12/9/6 pts, /98 total, "Yard +5" bonus, "Inaccurate rubric −5" penalty).

- **Tiered categories, not point-per-check.** Each category = 4 tier
  descriptors + points. AUTO categories (Requirements, Room sizes & shape,
  Windows, Doors, Furnishings, Closets) get an engine-SUGGESTED tier derived
  from check results (all-pass-with-margin → tier 1; all pass → tier 2; one
  fail → tier 3; two+ fails → tier 4) shown WITH evidence; teacher can bump
  any tier. TEACHER categories (Design/flow, room pairings/adjacency) are
  manual tier picks + comment. Software fills the majority; teacher reviews.
- **Deliverable-gated sections**: categories grouped under Floor Plan / Roof
  Plan / Cross Section / Elevations headings, toggled by the assignment's
  deliverables. Excluded deliverables ALSO hide those tabs in the student's
  assignment view (they auto-generate garbage without student work).
- **Bonus/penalty rows** (label + points + auto|teacher).
- **Optional student self-assessment at submission** (from the "−5 inaccurate"
  tradition): student picks own tiers first; review shows student vs engine
  vs teacher columns.
- **Default template = the digitized West Hollow rubric**, edited from there
  (same philosophy as brief generic standards).
- **DECIDED (2026-08-31):**
  - NO live score in the Requirements checklist — checkmarks only.
  - Students can OPEN the rubric on demand ("View rubric" in assignment
    mode): auto categories show current engine tier + evidence; teacher
    categories show descriptors with a "Teacher graded" badge, no tier.
  - Teachers grade IN-PLATFORM: assignment row → submissions list → student
    project in the read-only viewer with the rubric docked beside it, auto
    tiers pre-placed with evidence; teacher adjusts/fills the rest +
    comments; total auto-sums. Grade computed from the FROZEN submission
    snapshot, never the live design.
- **Submission lifecycle (DECIDED 2026-08-31):**
  - Working → Submit (frozen snapshot = what gets graded) → Submitted.
  - While Submitted, the assignment design opens READ-ONLY for the student
    with two actions: "View submitted version" (always available — the
    keepsake/show-at-home view, and the future portfolio export source) and
    "Make a copy" (lands in My Work with the assignment link STRIPPED —
    free-play continuation, never affects grading).
  - Teacher "Return for edits" → back to Working; student edits + resubmits;
    new snapshot supersedes. Teacher tiers/comments entered pre-return are
    kept as draft on the superseded snapshot and carried forward as
    reference (returning is never destructive; auto tiers recompute).
  - Pre-submission rubric viewing (live auto-tier standing) is fine.
- Still open: fixed 4-tier format vs variable (lean: fixed 4); student
  self-assessment step in v1?; confirm hiding excluded-deliverable tabs.

## Queued ideas (2026-08-31, approved in spirit — not yet scheduled)

- **Import existing plan into an assignment** — "Import from My Work" inside
  assignment mode: load a saved design, stamp `assignmentId`, checklist grades
  it immediately. Shell wrinkle: cleanest v1 = allow only on scratch-mode
  assignments (fixed/choice shells won't match an imported perimeter). Also
  lets teachers pull a free-play exemplar into an assignment.
- **Printable architectural portfolio** — multi-page PDF, legal 8.5×14
  landscape, classic title-block border per page (student last name, school,
  project, date, sheet number "A-1 FLOOR PLAN"). Pages: cover, floor plan,
  elevations two-up (using student's Front/Back/Left/Right labels), cross
  section, roof plan. Reuse the Sandbox paper-space compositing; fields typed
  in a dialog pre-export. PDF (not print CSS) so it prints anywhere and the
  file itself is the keepsake. Priority over import if both greenlit.

## Open questions
- **Where does grading live?** Assume existing teacher dashboard + same gradebook
  conventions as Quiz Builder / Measurement Lab assignments.
- **Plot variation generator** — parametric (jitter widths/depths/orientation on a
  template) vs. hand-authored pool. Suggest parametric with a seeded RNG per class so
  regeneration is stable.
- **Community map tech** — 2D SVG plat map is enough for v1 (click plot → open
  read-only project viewer); a 3D fly-over neighborhood is a wow-factor later step.
