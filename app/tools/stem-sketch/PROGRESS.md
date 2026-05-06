# Mini CAD — Progress log

## Session 2 — wishlist sweep

### Shipped this session

**Toolbar redesign**
Smaller buttons (icon-only, 30px), grouped with separators between Sketch / Modify / 3D groups. Brand and mode toggle slimmed. Primitives now live in a dropdown so we can add many shapes without overflowing the bar.

**Units toggle**
mm ↔ inches, top-right of the toolbar. All dimension labels, property-panel inputs, the live length pill, the cursor coords readout, and the Extrude dialog respect the active unit. Internal storage stays in mm; toggle is a display layer.

**2D — new tools**
- **Eraser (E):** click any shape to delete it.
- **Construction line (G):** same workflow as Line, but produces dashed orange reference lines that **don't** export to SVG and **don't** participate in extrude. Also toggleable per-entity in the properties panel.
- **Mirror:** select a shape, click Mirror, choose X-axis or Y-axis. Mirrors through the origin. Works on rect, circle, polyline.
- **Copy / Paste (Ctrl+C / Ctrl+V):** works in both 2D and 3D. Paste offsets by 5 mm so the copy is visible.
- **Arc (A):** 3-point arc (start → on-arc → end). Stored as a smooth polyline so all polyline tools (move, mirror, fillet, extrude) work on it.
- **Fillet (Modify toolbar):** select a polyline (or rectangle — auto-converted), enter a radius, all corners get rounded. Each corner becomes a 16-segment arc.
- **Array along a line:** select a shape, choose count + spacing X/Y, get evenly-spaced copies.

**Line tool — angle field**
The length pill is now a length **and** angle pill. Type both and Enter to drop a vertex at exactly `L` mm at exactly `A°`. Leave angle blank to use cursor direction (with snap). The angle field auto-updates with the cursor angle when not focused.

**3D — new primitives**
Primitive dropdown menu with **cube, sphere, cylinder, cone, torus, pyramid**. All parametric, all dimensionable in the properties panel.

**3D — body position controls**
Every body now has X / Y / Z position fields in the properties panel. Type a number, the body moves. Works for primitives and extrudes.

**3D — dimension editing for all primitives**
Click any 3D body, edit its parametric dimensions (radius, height, etc.) in real time. Same input pattern across all primitives.

**Construction line styling in 3D**
Construction lines also render in the 3D ground-plane overlay, but in dashed orange so you can see them in 3D without confusing them with model edges.

---

### Stubbed (visible in toolbar, click for "coming soon" hint)

These have UI surface so when you click them you see what's planned:

- **Sketch on Face (3D)** — the most important next-session feature. Needs an architectural change to support multiple sketches each with their own plane (currently there's one sketch on the XY ground plane only). I have a plan in WISHLIST.md.
- **Mirror across plane (3D)**
- **Fillet 3D edge**
- **Revolve / Lathe** — sketch a profile in 2D, revolve around an axis to make 3D body. Three.js has `LatheGeometry`; medium difficulty.
- **Boolean cut** — pairs naturally with sketch-on-face. Will need a CSG library (`three-bvh-csg`).
- **Dimension labels (annotation)**
- **Scale tool**

---

### Not shipped, with reasoning

**Type-in dimensions while drawing rectangles / circles.**
The Line tool gets typed length+angle, but rectangles and circles don't yet have a typed-while-dragging mode. For now you draw them roughly and dimension them precisely in the properties panel (Width / Height / Radius fields update the geometry instantly). I think this is actually fine for most workflows but happy to add the in-canvas overlay if you want.

**Move-paste-by-typed-distance.**
You wanted: paste a copy, then type a specific distance along X or Y to offset it. Right now paste does a fixed 5 mm offset; you then edit the X/Y in the properties panel. To do the typed-distance flow properly I think I want to copy how Fusion handles it (a "move" tool with a dedicated overlay), so I held off until we agree on the UX.

**Sketch on a face.**
This is the headline 3D feature from VISION.md. I deliberately did not patch a half-version because the architecture requires real refactoring (`doc.sketches[]` instead of `doc.sketch`, plus a face-pick raycaster, a plane local frame, and a sketcher that respects that frame). Want to do this right next session — should be a 1-session focus on its own.

---

### Decisions I made on your behalf

You said high autonomy, so I judgment-called these. Push back on any.

- **Mirror axes go through the origin.** Mirror across an arbitrary line (one you draw) is more flexible but more clicks; this is the simpler v1.
- **Construction lines use the **G** key shortcut and orange dashed styling.** They're stored as a `construction: true` flag on existing entities (line/rect/circle/polyline) — no new entity type.
- **Arc is stored as a 48-segment polyline.** Means all polyline operations (mirror, fillet, extrude) work on arcs without special-casing. Trade-off: arcs aren't truly continuous, but at 48 segments the visual difference is invisible at any practical zoom.
- **Fillet auto-converts a selected rectangle to a polyline** so you don't have to think about it.
- **Pyramid is a 4-sided cone.** Three.js doesn't have a `PyramidGeometry`; this is the standard trick.
- **Inches use decimals (0.5 in, not 1/2 in).** Fractions can come later if you want.
- **STL export is always in mm internally** regardless of units toggle. STL files don't carry units — most slicers assume mm. If you set the unit toggle to inches and export STL, the file is still correct mm geometry.
- **Construction lines are stripped from the SVG export.** They're for design, not output.

---

### Open questions for charlie (answers shape next session)

1. **Sketch on a face — UX:** when you pick a face, should the camera **fly** to look straight at it (Fusion-style "look at sketch") or **stay put** and the sketch is drawn in 3D space on that face? Flying is friendlier; staying lets you see context.
2. **Mirror across a custom line vs. only X/Y axes?** I shipped X/Y. Do you also want "draw two points to define a mirror line"?
3. **Array — also radial?** I shipped along a line (count + dx/dy). Tinkercad/Fusion also have radial array (count + center). Want both?
4. **Sketch-on-plane — only XY/YZ/XZ, or also custom?** Custom plane = you click 3 points to define it. XY/YZ/XZ alone covers ~90% of student use.
5. **Boolean cut precedence.** Once we have sketch-on-face + cut, should I commit to `three-bvh-csg` (no install — just bundle the file), or stay with the lighter `csg.js` (older but smaller)?

---

### Recommended next session

Pick **one** of these for a focused next pass:
- **Sketch on a face** (highest VISION.md priority; ~1 full session including the architectural refactor).
- **Boolean cut + extrude-as-negative** (depends on having sketch-on-face working first; if not, pick a single body and cut a separate sketch out of it).
- **Mobile / tablet support** — Science Olympiad teams often work on Chromebooks/iPads. Would mean adding pinch-zoom, two-finger pan, hold-tap context menus.
- **Polish pass** — there are rough edges (some inputs don't fully sync after units toggle, some tools don't update tree icons, etc.). A 1-hour cleanup would tighten things up.

My recommendation: **Sketch on a face**, with cut-as-negative as the immediate follow-up. That's the through-line on the original VISION.md and the move that makes Mini CAD feel like a real bridge tool instead of a toy.

---

### Files in this session

- `mini-cad.html` — the prototype (~2200 lines, single file)
- `three.min.js` — bundled locally so it loads under `file://`
- `VISION.md` — north star and direction
- `WISHLIST.md` — every feature with status flags
- `PROGRESS.md` — this file

---

## Session 3 — 3D move + boolean + grid + group

### Shipped this session

**3D — click to select + transform gizmo**
Click any body in the 3D viewport — it gets selected (raycast). Three colored arrows (red X / green Y / blue Z) appear at the body's center. Drag any arrow to move the body along that axis. Empty-area drag still orbits, shift-drag still pans, wheel still zooms. The gizmo follows the body as it moves and updates after every dimension edit.

**3D — positive / negative bodies**
Every body has an **Operation** field in the properties panel: *Positive (solid)* or *Negative (cut-out)*. Negatives render translucent red so you can see what they'll subtract.

**3D — Combine (real boolean ops)**
New ⊕ button in the 3D toolbar. It unions all positive bodies into one solid, then subtracts each negative body from the result. The original bodies are replaced by a single combined body that you can keep editing or export to STL. Implemented with `three-csg-ts` bundled locally as `csg.bundle.js` (~20 KB, no network dependency).

This is the workflow that lets a student drop a cube, drop a cylinder marked "Negative", click Combine, and walk away with a cube that has a hole through it. Cracks open the door to real subtractive modeling.

**Grid controls**
New "Grid" panel in the left sidebar with two controls:
- **Spacing** dropdown — `1 mm / 2 mm / 5 mm / 10 mm / 25 mm` when units = mm, `1/16 / 1/8 / 1/4 / 1/2 / 1 in` when units = inches. Switching units auto-picks a sensible default.
- **Snap to grid** checkbox — turn snap on/off without changing the spacing.

The grid lines are drawn at the chosen spacing (with major lines every 5th gridline) and snap follows the spacing. At very fine spacing combined with low zoom, the grid auto-coarsens so it doesn't fill with hairlines.

**2D — Group / Ungroup**
Shift-click in 2D to add shapes to a multi-selection (all highlighted blue). Click **Group** (G button) or press **Ctrl+G** — all selected shapes get tied into a group. After that, clicking any group member auto-selects all members so they move together. **Ungroup** (Ug button) or **Ctrl+Shift+G** dissolves the group.

This is also the foundation for future multi-select operations like "mirror everything I selected" — those will follow naturally.

**2D — Trim line (stubbed)**
Scissors icon (✂) in the 2D toolbar. Click for a "coming next session" hint with the planned approach (split lines at intersections, click to keep/discard). Real geometric trim is a bigger lift than the rest of this batch.

---

### Decisions I made on your behalf

- **Combine is destructive.** It replaces the source bodies with the single combined result. If you want to preserve the originals you'd Copy them first (Ctrl+C, Ctrl+V). Non-destructive history is a big architectural step that makes more sense to add alongside undo/redo.
- **Negative-only assemblies don't combine.** If every body is negative there's nothing positive to subtract from, so I show a hint instead of producing an empty result.
- **CSG bundle is a manual concat of `three-csg-ts`.** I wrote a small Python script to flatten the ES module imports into a single IIFE. Working but slightly fragile — if we ever upgrade three-csg-ts, the bundle script needs to be re-run. Long term we'd switch to a proper bundler when porting to STEM Builder.
- **Gizmo arrows are fixed pixel size in world units (~18 mm).** They get visually smaller as you zoom out. A "screen-space constant" gizmo (always the same size on screen) would be nicer; deferred for a polish pass.
- **Multi-select uses Shift, not Ctrl.** Ctrl is reserved for system shortcuts (Ctrl+C / Ctrl+G); Shift-click is the standard CAD/DCC convention for "add to selection."
- **Group IDs are random strings, not sequential numbers.** Avoids collisions with entity IDs. They're invisible to the user.

---

### Open questions for charlie

1. **Should Combine be preview-able?** Today you only see the result after clicking Combine. A "live preview" that recomputes as you toggle bodies between positive/negative would be nicer but pricier. Worth it?
2. **For the trim tool, what's the priority interaction?** (a) click two intersecting segments to split both, (b) click a single segment and remove the overlapping portion, (c) draw a "trim line" and any segment crossing it gets cut. AutoCAD does (b). I think (b) is best for students.
3. **Combine + edit history.** After Combine, you have one body — should the originals be recoverable (undo)? Or do you treat Combine as a permanent commit?
4. **Mobile support priority.** Asked last session. Still relevant for Chromebook/iPad use.

---

### Recommended next session

Highest-leverage single focus: **Sketch on a face**. With Combine working, a student can already do "drop primitives, mark negatives, combine" — but the heart of the original VISION.md is sketching directly on a face and using that sketch to cut. That's the move that turns Mini CAD from "Tinkercad with subtraction" into "real CAD with training wheels."

Architecture for sketch-on-face:
1. Replace `doc.sketch` with `doc.sketches: []` (each with id, plane, entities).
2. Add a "pick face" mode that raycasts a body and returns a face index.
3. Compute a local frame (origin + u + v + n) for the picked face.
4. Open the 2D sketcher with that frame as the active workplane.
5. New entities are stored in the sketch's local coordinates.
6. Extrude/cut from a face-aligned sketch projects entities back into world coords using the frame.

That's a focused day's work. After that, every other 3D feature gets cheaper to add.

---

### Files

- `mini-cad.html` — single-file prototype (~2400 lines)
- `three.min.js` — bundled Three.js r128
- `csg.bundle.js` — bundled three-csg-ts (new this session)
- `VISION.md` — direction
- `WISHLIST.md` — every feature with status
- `PROGRESS.md` — session logs (this file)

---

## Session 4 — Sketch on Face (the big one) + multi-sketch architecture

### Shipped this session

**Multi-sketch architecture.** Replaced the single `doc.sketch` with `doc.sketches[]` — each with its own *plane* (origin + u + v + n vectors), entities, and name. The active sketch is what 2D mode edits. Backward-compat getter keeps `doc.sketch` working everywhere. The project tree in the left sidebar lists every sketch in the project; click any one to switch to it.

**Sketch on Face.** New "+ Sketch" button in the topbar opens a dialog to start a sketch on Top/Front/Right reference planes. The ⊞ button in the 3D toolbar starts a face-pick mode — your cursor becomes a crosshair and the next body face you click becomes the new sketch's plane. Mini CAD computes a sensible (u, v) basis (sketch up = projected world-up; sketch right = up × normal), creates the sketch, and drops you into 2D editing. Esc cancels face-pick.

**Plane-aware extrude.** Extrude now respects the active sketch's plane. A sketch on the +X face of a cube will extrude *outward from that face*, not upward from the ground. This is what makes "drop a cube, sketch on a face, extrude that as a Negative, Combine" produce a clean cut.

**Plane-aware 3D overlay.** All sketches render at once in the 3D viewport, each on its own plane. The active sketch is bright blue; inactive ones are faded blue. Construction lines stay dashed orange. So you can see your face sketches sitting on the body even when you're orbiting around.

**Extrude → Negative.** The Extrude dialog now offers Positive (add) or Negative (cut). Pair with Combine for the full subtractive workflow: drop body, sketch on face, extrude as Negative, click Combine — hole.

**Mirror 3D body.** Select a body, click ↔ in the 3D toolbar, choose YZ / XZ / XY plane. Creates a mirrored copy. Works for primitives and extrudes (extrude bodies also mirror their plane so the geometry mirrors correctly).

### The headline workflow now works

1. Drop a cube. (Primitives dropdown.)
2. Click ⊞ Sketch on Face.
3. Click the top face of the cube.
4. You're now in 2D, sketching on that face. Draw a circle.
5. Click 3D, click ⇪ Extrude. Set height to (cube height), choose Negative, OK.
6. Click ⊕ Combine.
7. You have a cube with a hole drilled through it. Export STL.

That's the original VISION.md killer move, working end to end.

### Decisions I made on your behalf

- **Sketch planes don't follow their host body.** If you sketch on a cube face, then move the cube with the gizmo, the sketch stays where it was placed. In real CAD the sketch is parented to the body; replicating that is a bigger refactor (sketch transforms relative to body's local frame). For v1 we accept this limitation — students typically sketch *after* placing the body.
- **Reference planes are anchored at the world origin.** A "Top" sketch is at y=0, "Front" at z=0, "Right" at x=0. That keeps things predictable; later we can offer offset planes.
- **No camera fly-to-face animation.** When you pick a face, you switch straight to 2D mode. The 3D camera stays where it was. Smooth fly-to-face is polish; the workflow is functional without it.
- **Plane (u, v) chosen via projected world-up.** Means sketch +Y always points "up-ish" on any face, regardless of orientation. Predictable and matches Fusion behavior.
- **Existing single-sketch projects keep working.** The migration creates one default ground-plane sketch named "Sketch 1", so any project workflow you knew before still does the same thing.

### Open questions for charlie

1. **Sketch-on-Face camera fly-to.** Worth adding? The first time you pick a face it'd be a nice "Mini CAD just oriented you to the right view" moment.
2. **Sketches following bodies.** If you move a cube after sketching on its face, the sketch stays at the old location. Do you want sketches to *attach* to their host body (and move with it), or keep this simpler "world-anchored" model?
3. **Negative extrudes — what depth?** Today you specify a height; extrude goes that distance into the body from the face's plane. For the common "hole all the way through" case, an "Extrude Through All" option would be friendly. Add it?
4. **Sketch list — naming.** Sketches default to "Face Sketch 2", "Face Sketch 3", etc. Want me to wire up rename in the property panel?

### Recommended next session

The big-picture VISION.md move is now real. Two natural next things:

- **Polish pass on Sketch-on-Face.** Camera fly-to, body-anchored sketches, "Extrude Through All", rename sketches.
- **Move on to the next wishlist items.** Trim line tool, dimension labels, scale, fillet 3D edge, revolve, mobile/tablet support.

I think the polish pass is more important — Sketch-on-Face is the differentiating feature and it should feel inevitable, not "it works." But happy to follow whatever direction you point at next.

### Files

Same as before: `mini-cad.html`, `three.min.js`, `csg.bundle.js`, `VISION.md`, `WISHLIST.md`, `PROGRESS.md`.

---

## Session 4.1 — Sketch context polish

Two small but high-leverage fixes after first user feedback on Sketch on Face:

**Body silhouette visible while sketching.** When you're in 2D editing a sketch, every 3D body's bounding box is now projected onto the sketch plane and drawn as a faded dashed outline. Edges that lie on the sketch plane itself (e.g., the four edges of the cube face you clicked) are highlighted in solid blue instead. So you always see what you're sketching on, where the body's edges are, and how big your sketch is relative to the body.

**Closed sketches show as filled shaded faces in 3D.** Rectangles, circles, and closed polylines now render as a translucent blue patch on their plane in the 3D viewport, on top of the existing outline. Active sketch fills are stronger (~22% opacity); inactive sketches are more subtle (~10%). Construction lines stay outlines-only. Sketches sit slightly off the plane to avoid z-fighting with body faces.

The two together make the sketch-on-face workflow feel right: in 2D you can place your hole exactly relative to the cube's edges; in 3D you can confirm visually that the patch is where you wanted it before extruding.

---

## Session 5 — Wishlist polish

Three items chipped from the original wishlist:

**Type-in rectangles and circles.** In 2D, the click-and-drag flow for Rectangle and Circle still works as before. New: clicking *without* dragging opens a small dialog to type exact W × H or radius — the rectangle anchors at the click point, the circle centers there. Lets students place a 25 mm × 40 mm rectangle precisely without fiddling with the mouse.

**Revolve / Lathe.** New ⟳ action in the 3D toolbar. Draw a polyline profile in 2D (works best on a Front or Right reference plane so the body stands up in 3D), click ⟳, choose smoothness, profile spins around the sketch's Y axis using `THREE.LatheGeometry`. The result is a real 3D body — chess pawn, vase, bottle, etc. Original VISION.md feature now real.

**Trim line tool.** ✂ in the 2D toolbar is no longer a stub. Click any polyline segment to remove just that segment: open polylines split into two pieces around the clicked one; closed polylines open at the click point. Doesn't yet do automatic intersection detection across separate entities (that's the harder full-trim that v2 can take on), but the click-to-remove behavior solves the most common case where students want to clean up a polyline they over-drew.

### Files

Same as before: `mini-cad.html`, `three.min.js`, `csg.bundle.js`, `VISION.md`, `WISHLIST.md`, `PROGRESS.md`.

### Still on the wishlist

- Paste-then-type-distance offset
- 3D Fillet edge (needs custom geometry; hardest remaining)
- Dimension annotation that persists in SVG export
- Scale tool (note: 3D resize handles partly cover this; 2D scale handles still TODO)
