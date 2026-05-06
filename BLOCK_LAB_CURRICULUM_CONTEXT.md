# Block Lab — Curriculum Context Brief

*For curriculum designers building a 6th-grade gaming/coding unit. Written from the actual codebase — no speculation.*

---

## 1. Block Catalog

Block Lab has **9 blocks total** in two categories. There is no platformer, physics, sprite, enemy, projectile, sound, or scene-control support — the engine is a top-down grid maze only.

### Motion (blue, #2563EB)

| Label | Inputs | Description |
|---|---|---|
| **Move Forward** | none | Move STEM Bot one cell in the direction it is currently facing |
| **Turn Left** | none | Rotate 90° counter-clockwise; bot stays in the same cell |
| **Turn Right** | none | Rotate 90° clockwise; bot stays in the same cell |

### Control — Loops (amber, #D97706)

| Label | Inputs | Description |
|---|---|---|
| **Repeat** | `times` (number, 1–20, default 3) | Run the body block(s) exactly N times |
| **While path ahead** | none | Repeat body as long as the cell directly ahead is open (max 400 iterations) |
| **While not at goal** | none | Repeat body until STEM Bot is standing on the goal cell (max 400 iterations) |

### Control — Conditionals (purple, #7C3AED)

| Label | Inputs | Description |
|---|---|---|
| **If path ahead** | none | Run body once if the cell directly ahead is open |
| **If path left** | none | Run body once if the cell to the left is open |
| **If path right** | none | Run body once if the cell to the right is open |

**Empty categories:** Input/keyboard, sprite/animation, physics/gravity, collision, enemies/AI, projectiles, score/lives/state, sound, scene/level control — none of these exist.

**Unlock schedule:** Motion blocks are available from Unit 1. Repeat unlocks in Unit 2. All While/If blocks unlock in Unit 3. Students cannot access future-unit blocks early.

**Missing:** There is no `else` branch, no `elif`, no `while_path_left`, no `while_path_right`, no variables, no functions/procedures.

---

## 2. Level & World Model

Levels are hard-coded grids in `units.ts`. There is no level editor — maze layouts are defined by developers.

- Grid encoding: `0` = open path, `1` = wall. Coordinate system: `grid[row][col]`, i.e., `grid[y][x]`.
- Cell size: 52px rendered on an HTML5 Canvas.
- Each challenge defines: `grid` (2D array), `startX/Y`, `startDir` (`right`/`left`/`up`/`down`), `exitX/Y`, and `collectibles: {x,y}[]`.
- The player (STEM Bot) is placed at `startX, startY` facing `startDir` at the start of every run.
- **Goal:** a pulsing circle drawn at `exitX, exitY`. STEM Bot wins by stepping onto it.
- **Collectibles:** floating animated circles scattered on open cells. Collected automatically on step-over; they grow the bot's visual scale slightly (`+0.06` per collect, capped at 1.42×).
- **Hazards:** none. Bumping a wall stops the bot mid-animation and flashes the hint red — it is not a "death" state.
- **No tilemaps, no scrolling, no multi-room levels.** Every maze fits entirely on one fixed canvas.

---

## 3. Sprite & Asset System

There are **no uploadable assets and no external image assets** for the bot or maze. Everything is drawn procedurally on Canvas:

- **STEM Bot**: rounded rectangle body, two eyes with blink, antenna, two wheels, directional arrow. Colors come from the active theme (`botPrimary`, `botAccent`).
- **2-frame walking animation**: bot alternates eye/wheel offset every 120ms while moving, every 260ms at rest.
- **Collect glow**: a gold ring renders around the bot when it steps on a collectible.
- **Particles**: 8 particles spawn on collect, fade with gravity over their lifetime.
- **Themes**: three visual themes tied to units — Desert (Unit 1), Forest (Unit 2), Space (Unit 3). Each theme sets wall color, path color, bot color, particle color. Students cannot change the theme.

There are no sprite sheets, no animation states (idle/walk/jump), no asset library, and no way for students or teachers to upload images.

---

## 4. Input & Runtime

**Input:** There is no keyboard input in Block Lab. Students build a script by clicking blocks in a palette, then click **Run ▶**. The bot executes the full script autonomously — students watch, they do not control the bot in real time.

**Execution model:**
- Script runs top-to-bottom, one block at a time, awaiting each animation before the next block starts.
- Move animation: 240ms. Turn animation: 110ms. Bump animation: 320ms.
- A `_running` flag allows mid-run cancellation via the **Stop ■** button.
- While loops have a hard 400-iteration guard to prevent browser freezes.
- There is no step-through debugger, no breakpoints, no variable inspector.

**No key rebinding, no game loop that students control, no frame-based update model.** The execution is purely sequential script-to-animation.

---

## 5. Progress, Saves, and Modes

**Save format:** Each challenge's script is saved as a JSON array of `ScriptNode` objects, keyed by `"${unitIndex}_${challengeIndex}"`.

**Persistence:** Saves go to browser `localStorage` immediately, then sync to the cloud database (`user_progress` table via `POST /api/progress`) when a user is signed in. On load, local and cloud data are merged additively — completions are never erased.

**Challenge completion:** Triggered the moment STEM Bot steps onto the goal. Progress is saved automatically; students do not click a "Submit" button for challenges.

**Unit completion:** Triggered by passing the end-of-unit quiz with ≥ 60%. Below 60%, the next unit stays locked. There is no retry button from the results screen — students must navigate back through the unit overview to re-enter the quiz flow.

**Modes:** There is no free-build sandbox mode. Every session is a guided challenge. Students cannot save multiple named projects — one script slot per challenge.

---

## 6. Teacher & Student Model

**Roles:** Users have a `role` field (`"teacher"` or `"student"`) stored in the `profiles` table.

**Classes:** Teachers create classes; students join via a code. Class data is in the `classes` and `class_members` tables.

**Teacher controls for Block Lab** (in the class detail page at `/teachers/classes/[id]`):
- **Assign units**: Toggle which of the 3 units are assigned to the class. Assigned units use teacher-controlled unlock instead of the default sequential lock.
- **Lock/Unlock units**: Lock individual units (students see 🔒 and cannot enter). "Lock All / Unlock All" button available.
- **Gradebook**: Table showing each student's challenge completion and quiz score per unit (color-coded: green = complete, yellow = partial, gray = none). Quiz score ≥ 70% = green badge.
- **CSV export**: Downloads gradebook as a `.csv` file.

Teachers **cannot** view or replay individual student scripts, author custom challenges, or set per-challenge locks (only per-unit locks are supported).

---

## 7. Existing Gaming Examples

There are **no sample games, demo projects, or test fixtures** in the repo. All maze data lives exclusively in `units.ts` (`app/tools/block-lab/units.ts`). There are no working platformer examples, no seed scripts, and no demo recordings.

---

## 8. Known Constraints & Gaps (route around these)

| Constraint | Detail |
|---|---|
| **No drag-and-drop** | Blocks are added by clicking palette buttons only |
| **Reorder is top-level only** | ↑/↓ arrows only work on root-level blocks; children inside a `Repeat` body cannot be reordered |
| **No else branch** | `If` blocks have a body but no `else` |
| **Insertion target is flat** | Clicking "+ in" on a nested container works, but "↑ Back to main" resets to root — not to the parent. Deep nesting is awkward |
| **No variables, functions, or procedures** | Cannot declare, read, or write any named value |
| **No `while_path_left/right`** | Only `while_path_ahead` and `while_not_at_goal` exist as while variants |
| **No platformer/physics/sound/enemies** | Engine is maze-only; none of these categories are implemented |
| **No custom maze authoring** | Grids are developer-defined; teachers and students cannot create levels |
| **No real-time input** | Students script in advance; there is no live keyboard control |
| **400-iteration while guard** | While loops stop after 400 outer iterations regardless of inner move count |
| **Quiz retry UX** | Below 60%, the next unit stays locked but there is no "Retry Quiz" button — students must navigate back manually |
| **maxBlocks not enforced** | A `maxBlocks: 30` prop exists but is never checked by any logic |

---

## 9. Naming & Vocabulary Glossary

| UI / Code Term | Meaning |
|---|---|
| **Unit** | A themed group of 10 challenges + 1 quiz (the equivalent of a "level" or "module") |
| **Challenge** | A single maze puzzle within a unit |
| **STEM Bot** | The player character (a robot drawn on canvas) |
| **Script** | The sequence of blocks a student assembles (not called "program" or "code" in the UI) |
| **Block** | One instruction tile in the palette or script |
| **Body / body block** | The indented interior of a container block (Repeat, While, If) |
| **Palette** | The top panel listing available blocks to click and add |
| **Goal** | The pulsing circle the bot must reach to complete a challenge (not called "exit" in student-facing UI, though the code uses `exitX/Y`) |
| **Collectible** | A floating circle on the maze path; collected automatically on step-over |
| **Run ▶ / Stop ■** | Execute / cancel the current script |
| **Reset ↺** | Return bot to start position without clearing the script |
| **Clear 🗑** | Delete all blocks from the script |
| **Theme** | The visual color scheme (Desert / Forest / Space), auto-set by unit |
| **Main script** | The root level of the script tree (vs. "inside" a container block) |

---

*Source files: `app/tools/block-lab/engine/blocks.ts`, `runtime.ts`, `themes.ts`, `animation.ts`, `mazeRenderer.ts`, `components/MazeBoard.tsx`, `units.ts`, `page.tsx`, `app/teachers/classes/[id]/page.tsx`*

---

## 10. Platform Recommendation for the Gaming Unit

**The existing Block Lab engine cannot support a platformer or game-design unit** — there is no physics, no real-time input, no sprite system, no sound, and no scene management. Extending the custom engine to cover these would mean building a full game framework from scratch.

**Recommendation: build the gaming unit on [Blockly](https://developers.google.com/blockly) (Google), not on the current custom engine.**

- **License**: Apache 2.0 — fully compatible with a monetized product. Used commercially by Code.org, MIT App Inventor, and many EdTech platforms.
- **Drag-and-drop**: Real drag-and-drop block editor out of the box (the current tool uses click-to-add only).
- **Extensibility**: Custom block types, custom code generators, full variable/function/logic support.
- **Code generation**: Blockly outputs JavaScript — it can drive a real game loop (e.g., via Phaser.js or a lightweight custom canvas runtime).
- **Not Scratch**: Scratch's brand and platform are not suitable for commercial use. Blockly is the correct choice for an embedded, monetizable product.

**Suggested architecture for the gaming unit:**
- Keep the existing 3-unit maze curriculum as-is (it works, students use it, don't break it).
- Add a new tool (`/tools/game-lab` or similar) built on Blockly + a JS game runtime.
- The gaming unit lives alongside Block Lab in the Code Lab hub, not replacing it.

The curriculum for the gaming unit should be written assuming Blockly's block vocabulary (loops, conditionals, variables, events, functions) — not the 9-block vocabulary of the current maze engine.
