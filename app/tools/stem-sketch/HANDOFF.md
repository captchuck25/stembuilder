# STEM Sketch — Handoff to Claude Code

This is a single-file 2D/3D CAD app built for ~6th grade students. The
target use is sketch-and-print: kids draw, extrude, group, and export STL
files for 3D printing. Think Tinkercad-meets-Fusion-360 but small and
self-contained.

## Files in this folder (everything you need)

- `stem-sketch.html` — main app, split into the HTML page + two external
  scripts. **This is the file to keep editing.** ~250 KB, ~9,500 lines of
  HTML/CSS/JS.
- `stem-sketch-standalone.html` — same file with `three.min.js` and
  `csg.bundle.js` inlined. ~860 KB. Use for sharing with end users; don't
  edit this directly — regenerate from `stem-sketch.html` after changes
  (see the Python snippet at the bottom of this doc).
- `three.min.js` — Three.js r128, bundled locally so the app works without
  internet.
- `csg.bundle.js` — three-csg-ts boolean library (union / subtract /
  intersect for 3D meshes).
- `three-0.128.0.tgz`, `three-csg-ts-3.2.0.tgz` — the original npm tarballs
  the bundled scripts came from. Keep around in case the bundles ever
  need to be re-derived.
- `VISION.md` — design intent: who the user is, what success looks like,
  what to NOT add. Read first.
- `PROGRESS.md` — chronological build log across the chat sessions that
  produced the current code. Useful for understanding why things are the
  way they are.
- `WISHLIST.md` — feature list with status. Source of truth for "what's
  next."
- `mini-cad.html` — historical name of the same app. Identical content to
  `stem-sketch.html` at the time of handoff. Delete once you're sure
  nothing else depends on it.

## Architecture in 90 seconds

The whole app lives in one HTML file with three top-level sections:

1. **HTML/CSS** at the top — toolbar, panels, modals, status bar.
2. **Three.js + CSG library** loaded via `<script src=...>`.
3. **One ~9,000-line inline `<script>`** containing:
   - The `doc` global — the document model (sketches, bodies, selection).
   - `class SketchEngine` — the 2D SVG sketch view, tools, snap, etc.
   - `class Viewer3D` — the Three.js 3D viewport, gizmos, picker, etc.
   - Free functions for primitive bodies, fasteners, group/CSG, undo/redo,
     export, etc.
   - The `init()` function at the bottom that wires events.

Everything is functional — no framework, no bundler, no build step. Open
the HTML in a browser, hit refresh, see changes.

## Key entry points (search the file for these)

- `class SketchEngine` — start of the 2D sketch system.
- `class Viewer3D` — start of the 3D viewport.
- `function buildBodyMesh(body)` — turns a body record into a Three.Mesh.
- `function projectBodiesOntoPlane(plane)` — orthographic projection used
  by the 2D ortho view when a sketch is active.
- `function buildPlanarGraph` / `findPlanarFaces` /
  `computeSketchRegions` — the v2 region detection engine that lets users
  pick sub-areas of a sketch to extrude.
- `function groupSelected` — boolean union/subtract via CSG.
- `function buildFastenerGeometry` / `buildThreadedShaftGeo` — the
  fastener system (hex/Phillips/cap/machine-screw heads + real helical
  threads).
- `function exportSTL` / `function exportSVG` — file export.

## State model

Bodies (3D primitives, extrudes, groups, fasteners) live in `doc.bodies`.
Each has a `type` field that determines how `buildBodyMesh` renders it.
Sketches live in `doc.sketches`. Each sketch has `entities` (rect /
circle / polyline / dimension / arc) and an associated `plane` (origin +
u, v, n basis vectors).

Selection is `doc.selection = { kind: 'body' | 'sketch' | 'region', id }`.
Multi-selection arrays mirror this for shift-click semantics.

Undo/redo uses snapshot-and-restore: `pushUndo()` deep-copies the doc
before any state-mutating action; `undo()` swaps to the previous snapshot.
Geometry inside group bodies is serialized via vertex arrays.

## What's tricky / sharp edges

- **Three-csg-ts cuts non-manifold meshes badly.** When adding new body
  types whose meshes are subtracted (groups, fastener threads), make sure
  the geometry is closed and watertight or CSG silently produces a
  near-empty result. The threaded shaft is hand-built with explicit
  triangle winding for this reason.
- **Mesh.scale isn't always honored by CSG.** Spheres, cylinders, etc.
  bake their per-axis scale directly into geometry (`geo.scale(w, h, d)`
  rather than `mesh.scale.set`) for the same reason.
- **Sketch overlay z-fighting.** The 2D sketch lines render in 3D as
  Three.js Lines on the sketch plane. They use `depthTest: true` plus a
  small Z offset; if you change one, recheck the other.
- **Region picking sorts by area.** When multiple regions overlap (e.g.
  a square inside a sphere boundary), the picker grabs the smallest one.
  Be careful when adding new boundary types.

## What I'd do first in Claude Code

1. **Run it.** Open `stem-sketch.html` in a browser. Verify it loads.
2. **Get it under git.** `git init`, commit the initial state.
3. **Read VISION.md and WISHLIST.md.** Pick up the design philosophy and
   the next priorities before changing anything.
4. **Set up a simple eval harness.** Even a smoke-test page that adds a
   primitive, extrudes it, exports STL, and checks the file is non-empty
   would prevent a lot of regressions.
5. **Decide the modularization plan.** The single-file thing has been
   useful for fast iteration but is now too big for productive editing.
   Suggested split:
   - `engine/sketch.js` — SketchEngine class and 2D rendering.
   - `engine/viewer.js` — Viewer3D class.
   - `engine/csg.js` — group/combine/subtract logic.
   - `engine/fasteners.js` — FASTENER_SPECS + thread/head builders.
   - `engine/export.js` — STL / SVG.
   - `ui/toolbar.js` — dropdowns, modals, button wiring.
   - `index.html` — small shell that loads the modules.
   Build into a single distributable HTML for end users (Vite or esbuild
   makes this easy).
6. **Wire up STEM Sketch platform integration.** The `getProjectName()`
   helper reads from a top-bar input — that's the hook for "save to your
   account." Add an `onSave` callback or a `window.postMessage` outbound
   so the host platform can persist the document JSON. The doc model is
   already JSON-friendly.

## Re-creating the standalone bundle

After editing `stem-sketch.html`, regenerate the standalone single-file
build with:

```bash
python3 - <<'PY'
html = open('stem-sketch.html').read()
three = open('three.min.js').read()
csg   = open('csg.bundle.js').read()
html = html.replace('<script src="three.min.js"></script>',
                    '<script>\n' + three + '\n</script>')
html = html.replace('<script src="csg.bundle.js"></script>',
                    '<script>\n' + csg + '\n</script>')
open('stem-sketch-standalone.html', 'w').write(html)
PY
```

## Quick mental map of features that exist

- 2D: rect, circle, polyline, arc, construction line, eraser, mirror,
  trim, fillet, array, offset, group, dimension labels, copy/paste.
- 2D shape dropdown: hexagon, pentagon, octagon, star, heart, teardrop.
- 3D primitives: cube, sphere, cylinder, cone, torus, pyramid, plus the
  six 2D-shape extrudes above (with independent W/H/D control).
- Sketch on Face — flat faces use the actual face plane; curved bodies
  open a 6-face bbox picker.
- Region picker — planar arrangement v2; pick sub-regions of a sketch.
- Drag-to-extrude with arrow gizmo; Add/Cut toggle; Done/Cancel buttons.
- Group as boolean (union + subtract); Ungroup restores children.
- Threaded fasteners — hex bolt, Phillips, socket cap, machine screw.
  Real helical threads with three Fit choices for printable holes
  (Tight / Normal / Loose).
- Export: STL or SVG, named by the project filename input.
- Snap, undo/redo, dim labels, alignment tools, mirror across plane,
  rotation, copy/paste, arrow-key nudge, Ctrl-drag orbit.

Good luck. — Carry on.
