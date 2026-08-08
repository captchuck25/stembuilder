# Electronics Lab — Curriculum Scaffold & Build Plan

Status: **COMPLETE — all 7 units built** (M1–M6 done; remaining milestone M7 = teacher-integration polish is optional, core gating already works)
Route: `app/tools/electronics-lab/`  ·  Progress tool id: `'electronics-lab'`
Template: mirrors **Block Lab** (unit → intro → challenges → quiz → unlock next) — see `app/tools/block-lab/units.ts` for the content model this clones.

## Design philosophy

- **In and out.** A unit is 15–25 minutes: a 1–2 minute illustrated intro, 3–5 small build challenges, a **7-question quiz** (standard length for every unit). No sprawling sandbox sessions required (a free-build sandbox exists but is optional).
- **Every unit ends with a freebuild capstone** (locked 2026-08-03, per teacher feedback). After the guided builds and before the quiz, the last challenge is `mode: 'freebuild'`: an empty board plus a **parts bin** (palette with limited quantities, Block-Lab-toolbox style) — the student places components themselves and wires a circuit meeting a spec ("build a series circuit with at least 2 bulbs"). Judged by `evaluateFreeBuild` against the spec (`lit` / `series` / `redundant` / `master-switch`) over whatever they placed — any correct design passes, no fixed layout. Does not affect the quiz; flat 3 stars. Future units must ship one (U5: wire a testable circuit & find a fault; U6: hit a target current; U7: schematic → breadboard is already the capstone).
- **Terminology is a first-class citizen** (locked 2026-08-03, per teacher feedback: interactive alone felt too game-like). Every unit has a `vocab` list (**Words to Know** card on the intro, flagged "these will be on the quiz!"); the same terms are bolded and defined in the intro notes; and **2–3 of the 7 quiz questions test terminology directly**. Unit 1: circuit, current, open/closed circuit, conductor, insulator, load, short circuit. Unit 2: series circuit, component, voltage, volt, schematic, symbol. Future units must define their vocab the same way (U3: parallel, branch; U4: switch, open/closed; U5: continuity, multimeter, fault; U6: resistance, ohm, ampere, Ohm's Law; U7: breadboard, terminal strip, power rail, LED, polarity).
- **Enhance, don't replace.** Every unit ends with an optional **"Try it for real"** card — a real-world activity using cheap classroom materials (battery pack, bulbs, alligator clips, foil, paper clips, Snap Circuits if available). The screen teaches the concept safely and repeatably; the payoff is at the table.
- **Tiered by age.** Sequential unlock like Block Lab, but the curriculum has natural stopping points so a teacher can assign just a slice:
  - **Tier A (~3rd–5th):** Units 1–4 (circuits, series, parallel, switches)
  - **Tier B (~5th–7th):** + Unit 5 (continuity & troubleshooting)
  - **Tier C (middle school+):** + Units 6–7 (Ohm's Law, breadboard)
  - Teacher assignment/lock gating reuses the existing `/api/student/assignments?tool=electronics-lab` + `/api/student/locks` idiom.
- **Symbols grow with the student.** Components render **pictorially** first (a real-looking battery pack, bulb, switch). From Unit 2 on, a "Schematic view" toggle shows the same circuit with standard symbols, so schematic literacy builds passively. By Unit 6, challenges are given *as* schematics.
- **Quiz rules** (per site feedback): every question has one clearly correct answer; no compass directions — say "left side of the screen"; recheck answer keys any time sim mechanics change.

---

## Curriculum

### Unit 1 — Circuits Alive (what is a circuit?)
**Teach:** Electricity flows in a **closed loop**: source → path → load → back. Conductors vs. insulators. If the loop is broken anywhere, everything stops.
**Interactive:** Drag wires between a battery pack and a bulb to light it.
- C1: Connect one wire to close the loop — bulb lights.
- C2: A gap in the circuit; drag different test materials into the gap (paper clip, eraser, foil, plastic straw, penny) — bulb lights only for conductors. Sort materials into conductor/insulator bins.
- C3: "Short circuit!" — wire the battery straight back to itself with no bulb; the sim shows the danger warning (hot wire glow) and explains why loads matter.
**Quiz:** 4 questions (closed loop, conductor identification, what breaks a circuit, why shorts are bad).
**Try it for real:** Battery + bulb + foil strips; test 5 classroom objects for conductivity.

### Unit 2 — One Path: Series Circuits
**Teach:** Series = components in a single line; one path for current. More bulbs in series → each is dimmer. Break anywhere → *everything* goes off (the old-style holiday-lights problem).
**Interactive:** (Schematic toggle unlocks here.)
- C1: Build a 1-battery, 2-bulb series circuit.
- C2: Add a third bulb; observe brightness drop (sim renders real relative brightness from the solver).
- C3: Unscrew one bulb (click it) — predict first, then confirm all bulbs go out.
- C4: Add a second battery in series — brighter bulbs; batteries add.
**Quiz:** 5 questions (one-path definition, brightness prediction, break behavior, battery stacking, identify the series circuit from two pictures).
**Try it for real:** 2 bulbs + battery pack in series with alligator clips; unscrew one bulb.

### Unit 3 — Many Paths: Parallel Circuits
**Teach:** Parallel = branches; each branch gets full battery voltage. Bulbs stay bright; one branch breaking doesn't kill the others. This is how buildings are wired.
**Interactive:** Split-screen compare is the star here.
- C1: Build a 2-bulb parallel circuit.
- C2: **Side-by-side:** the sim shows your Unit-2 series circuit next to your parallel one — same batteries, same bulbs. Compare brightness live.
- C3: Break one parallel branch — predict, then confirm the other bulb stays lit.
- C4: Challenge: "Wire three bulbs so that removing any one leaves the other two lit."
**Quiz:** 5 questions (branch behavior, brightness comparison, which is house wiring, break prediction, identify parallel from a schematic).
**Try it for real:** Rebuild C4 physically; the "remove any bulb" test is the check.

### Unit 4 — Take Control: Switches
**Teach:** A switch is a deliberate break. Placement matters: a switch in the main line controls everything; a switch inside one parallel branch controls only that branch.
**Interactive:** Goal-based placement puzzles.
- C1: Add a switch to a series circuit; toggle it.
- C2: Two parallel bulbs, one switch: "Make the switch control BOTH bulbs." (main line)
- C3: Same circuit: "Make the switch control ONLY the left bulb." (in-branch)
- C4: Two switches, two bulbs: "Each switch controls its own bulb" — a real room-lighting layout.
**Quiz:** 5 questions, mostly "where would you put the switch to…" with circuit pictures.
**Try it for real:** Make a switch from a brad, paper clip, and cardboard; add it to the Unit 2 circuit.

### Unit 5 — Circuit Detective: Continuity & Troubleshooting
**Teach:** Continuity = an unbroken path. A continuity tester (multimeter beep mode) finds breaks without guessing. Systematic halving beats random poking.
**Interactive:** The lab's most game-like unit — fault-finding missions.
- C1: Learn the probe: touch two points; a "BEEP!" flash + green highlight if connected (visual only — no audio).
- C2: A dead flashlight circuit with **one hidden break** (fault is invisible; wires look fine). Probe to find it, then click to repair.
- C3: A string of 8 lights with one bad bulb — par score rewards binary-search probing (find it in ≤3 probes for 3 stars).
- C4: Two faults at once in a switch circuit.
**Quiz:** 5 questions (what continuity means, reading beep/no-beep results, "which probe pair proves the break is in section X" style reasoning — with sections labeled by color, not direction).
**Try it for real:** If the class has multimeters: beep-mode scavenger hunt (test wires, pencil lead, a dead vs. good fuse). If not: use the Unit 1 bulb tester as a continuity tester.

### Unit 6 — Ohm's Law & Meters
**Teach:** Voltage pushes, resistance resists, current is the result: **I = V / R**. Read a voltmeter (across) and ammeter (in line). Resistors introduced as real components.
**Interactive:**
- C1: A live circuit with V and R sliders; meters update in real time. "Get the current to exactly 0.5 A."
- C2: Voltmeter placement puzzle: measure across the resistor vs. across the battery.
- C3: Solve-for-missing-value challenges: sim shows two meter readings, student computes the third, then checks by measuring.
- C4: Why did Unit 2's bulbs dim? Revisit the series circuit *with meters* — series resistance adds, so current drops. (Closes the loop on earlier intuition.)
**Quiz:** 6 questions (triangle relationships, two computation problems with friendly numbers, meter placement, series-resistance reasoning).
**Try it for real:** Multimeter + resistor + battery: predict current with Ohm's Law, then measure.

### Unit 7 — Breadboard Bootcamp
**Teach:** How a breadboard is wired inside (row strips, power rails), why it exists (build fast, no soldering), and how to translate a schematic onto it. LEDs need a series resistor and have polarity.
**Interactive:** A virtual breadboard that is *the same circuit engine* with a different skin.
- C1: **X-ray view** — toggle to see the internal strips; probe holes with the Unit 5 continuity tester to prove which holes connect.
- C2: Wire battery → resistor → LED on the breadboard; wrong-way LED stays dark (teaches polarity), missing resistor triggers the burnout warning.
- C3: Add the Unit 4 switch on the breadboard.
- C4: Capstone: given only a schematic, build it on the breadboard (2 bulbs parallel + switch + resistor).
**Quiz:** 5 questions (which holes are connected, LED polarity, why the resistor, schematic-to-breadboard matching).
**Try it for real:** The exact C2 circuit on a physical breadboard — the virtual layout transfers 1:1.

### Sandbox (optional, always unlocked)
Free build with every unlocked component. No goals, no saving required. Kept deliberately simple — the units are the product.

---

## Build plan

### The engine (the one real piece of new tech)
No circuit-sim dependency exists in the repo and none is worth adding — a small DC resistive solver covers the entire curriculum:

- **Model:** circuit = graph of nodes + two-terminal components (battery = ideal V source, wire = ~0 Ω, bulb/resistor = R, switch = open/closed, LED = simple threshold model in Unit 7 only).
- **Solver:** Modified Nodal Analysis (MNA) over resistive networks — a well-known ~200-line linear solve. Outputs node voltages + branch currents.
- **Derived UI truth:** bulb brightness ∝ power dissipated; short-circuit detection = current above threshold through a source; continuity = graph connectivity between probe points ignoring sources. One engine serves Units 1–7; the breadboard is just a different node-mapping (holes → strip nets).
- Pure TypeScript in `engine/`, no React, fully **vitest-tested** (series/parallel brightness ratios, switch states, fault graphs, breadboard net mapping). Measurement-exact: all displayed meter values come from the solver, never hand-tuned.

### Rendering & files
- **SVG** build surface (not canvas): crisp pictorial components, easy per-part click/drag hit-testing, cheap schematic-view toggle (swap symbol sets over the same graph). Grid-snapped terminals.
- Light theme, white `CARD` over `bg-tools-pattern.png` (site rule: never dark text on the pattern).

```
app/tools/electronics-lab/
  page.tsx          # orchestrator — Phase state machine cloned from Block Lab
                    # (overview | intro | challenge | quiz | complete)
  units.ts          # ElectronicsUnit[] — mirrors BlockUnit shape:
                    # { id, title, tagline, color, story, introNotes,
                    #   challenges: [{ id, prompt, given, goal, par }], quiz: QuizQ[] }
  constants.ts      # server-safe (no "use client") — assignment config, tier defs
  engine/           # graph model + MNA solver + continuity + breadboard nets (+ tests)
  components/       # CircuitBoard.tsx (SVG surface), Palette, Probe, Meters,
                    # Breadboard.tsx, QuizView (copied from Block Lab pattern)
```

### Persistence & platform (all existing — no migrations)
- Progress: generic `user_progress` via `POST /api/progress` with `tool: 'electronics-lab'`; Block Lab's exact local-first + cloud-merge pattern, including the `challenge_idx = -1` quiz-score convention. **Watch the StrictMode restore-on-mount pitfall** (no once-guard + cancelled-cleanup combo).
- Stars: 1–3 per challenge via `par` (probe count, component count, or first-try prediction), best-kept with `Math.max`.
- Gating: sequential unlock + teacher locks/assignments through the existing student/teacher routes.
- Hub: add tile to `app/(hub)/page.tsx` (needs a `/ui/*.png` button) and the tools index array.

### Milestones (each independently shippable)
| # | Deliverable | Notes |
|---|---|---|
| M1 | Engine + SVG board | Solver, drag-wire building, brightness rendering, vitest suite. No content yet. |
| M2 | **Units 1–2 + phase machine + progress sync** | First shippable slice — Tier A starts here. Quiz UI, stars, localStorage+cloud. |
| M3 | Units 3–4 | Split-screen compare, switch puzzles. Completes Tier A. |
| M4 | Unit 5 + probe mode | Fault library, par-scored probing. Completes Tier B. |
| M5 | Unit 6 + meters | Slider circuits, meter placement, friendly-number problem generator. |
| M6 | Unit 7 breadboard | Net mapping, x-ray view, LED model, capstone. Completes Tier C. |
| M7 | Teacher integration + hub tile + polish | Assignments/locks wiring, visual polish, "Try it for real" cards, sandbox. |

### Decisions (locked 2026-08-03)
1. **No sound.** Classroom setting — the continuity "beep" is visual only: green highlight + a "BEEP!" flash label on the probe. No audio anywhere in the lab.
2. **No leaderboards.** This lab is conceptual, not a speed drill. Stars + quiz scores are the only scoring.
3. **No PDF export.** "Try it for real" cards stay on-screen only.
