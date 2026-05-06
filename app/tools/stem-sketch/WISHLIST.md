# Mini CAD — Wishlist

Status legend: [DONE] shipped · [WIP] in progress this session · [TODO] not started · [STUB] visible in UI as "coming soon"

## Toolbar / chrome
- [DONE] Smaller icons, grouped layout, room to grow as tools are added

## 2D tools
- [DONE] Select, Rectangle, Circle, Line (polyline)
- [DONE] Snap: horizontal, vertical, endpoint, origin, grid
- [DONE] Type-in length (Line tool)
- [DONE] Type-in length **and angle** (Line tool)
- [DONE] Type-in dimensions for Rectangle and Circle — click without dragging in 2D and a dialog opens for exact W×H or R
- [DONE] Fillet tool — round all polyline corners with a typed radius (rect auto-converts to polyline)
- [DONE] Mirror — across X axis or Y axis (through origin)
- [DONE] Eraser tool (E)
- [DONE] Construction line tool (G; dashed orange, not extruded, not exported; per-entity toggle in props)
- [DONE] Copy / Paste (Ctrl+C / Ctrl+V)
- [TODO] After paste, type a distance to offset along X or Y *(currently fixed 5 mm offset; edit precise value in props panel)*
- [DONE] Array along a line (count + spacing X/Y)
- [DONE] Arc tool (3-point; stored as smooth polyline)
- [DONE] **Group / Ungroup** — Shift-click to multi-select, Ctrl+G groups, Ctrl+Shift+G ungroups. Selecting any group member selects all and they move together.
- [DONE] **Trim line tool (basic)** — click any polyline segment to remove it. Open polylines split into two pieces around the clicked segment; closed polylines open up. Doesn't yet auto-detect intersections between separate entities (that's a v2).

## 3D tools
- [DONE] Cube primitive (parametric)
- [DONE] Extrude
- [DONE] More primitives in a pulldown — sphere, cylinder, cone, torus, pyramid (Tinkercad-style menu)
- [DONE] Move a body along X / Y / Z by typing a value (in property panel)
- [DONE] **Click-and-drag move with transform gizmo** — selecting a body shows red/green/blue arrows; drag any arrow to move along that axis.
- [DONE] **Click-to-select bodies in 3D viewport** (raycast).
- [DONE] Click on any primitive and edit its dimensions by typing
- [DONE] **Positive / negative bodies** — every body has an Operation field (Positive / Negative). Negatives render translucent red.
- [DONE] **Combine (boolean)** — Combine button merges all positives into one solid and subtracts negatives. Uses three-csg-ts bundled locally as `csg.bundle.js`.
- [DONE] Mirror a body across a plane (XY / YZ / XZ)
- [DONE] **Sketch on a face** — click "Sketch on Face", click any body face in 3D → a new sketch is created aligned to that face's plane. Switch back to 3D, extrude that sketch as Positive (add) or Negative (cut), then click Combine to actually subtract. The full original VISION.md workflow.
- [DONE] Create a sketch on a reference plane (Top / Front / Right via "+ Sketch" button in topbar)
- [STUB] Fillet a 3D edge with typed radius (option for 45° chamfer too)
- [DONE] Revolve / Lathe — draw a polyline profile, click ⟳ in the 3D toolbar, profile spins around the sketch's Y axis into a 3D body. Works best on Front or Right reference planes so the body stands up.
- [STUB] Boolean cut between bodies — needs a CSG library (three-bvh-csg). Pairs naturally with sketch-on-face.

## General controls
- [DONE] Units toggle — mm ↔ inches
- [DONE] **Grid controls** — spacing dropdown (1/16, 1/8, 1/4, 1/2 in or 1, 2, 5, 10, 25 mm), snap-to-grid toggle. Lives in left sidebar.
- [STUB] Label a dimension (annotate; persists in SVG export)
- [STUB] Scale — 2D and 3D scale controls

## Notes / decisions
- All dimensions stored internally in **mm**; unit toggle is a display layer.
- Construction lines are stored as a flag on existing entities (`construction: true`), not as a new entity type — keeps the model simple.
- Copy/paste uses an in-memory clipboard; doesn't touch the system clipboard.
- For 2D fillet, the operation is on a **polyline corner**. To fillet a rectangle corner, the rectangle is converted to a polyline first.
- Sketch-on-face requires `doc.sketches[]` (array) instead of `doc.sketch`. Major refactor; planned for next session.
- Boolean cut is the natural follow-up to sketch-on-face. Both deferred together.

## Open questions for charlie
1. For Mirror, do you want a *line of symmetry you draw* (most flexible) or just X/Y axis through origin (simplest)? I'm shipping the X/Y-through-origin version first.
2. For Array, is "count + spacing along a direction vector" enough, or do you also need radial array (around a center)?
3. Construction lines — should they be **infinite** reference lines (extend to infinity in both directions) or **bounded segments** that just look dashed? I'm shipping bounded segments to start; can extend later.
4. For Revolve, do you want full 360° revolves only, or also partial sweeps (e.g., 180°)? Partial is harder.
5. Units — when you toggle to inches, should fractional inches show as decimals (1.5") or fractions (1 1/2")? I'm starting with decimals.
