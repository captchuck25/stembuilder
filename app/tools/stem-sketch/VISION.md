# Mini CAD — Vision

## North star
A browser-based CAD tool inside the **STEM Builder** platform that bridges the gap between Tinkercad (too toy-like for real parts) and Fusion / SolidWorks (too steep an onboarding cliff for one-off student work).

Mini CAD is for the student who needs a CAD output — an SVG for laser-cutting, a vinyl decal, an STL for 3D printing — for a class project, club build, or Science Olympiad part, where **the project is not about learning CAD**. The tool earns its keep when a student can go from "I need a part" to "I have an STL" in one short sitting, without a tutorial.

## Design principles
1. **Learnable in minutes, not days.** No required tutorial. Tools should reveal themselves through use; defaults should be sensible.
2. **Real CAD muscles, not toy versions.** Real dimensions. Real units. Sketch-then-extrude paradigm so the workflow transfers if the student later picks up Fusion. Parametric where it pays for itself.
3. **One-shot output is the success metric.** Every flow ends at "export SVG" or "export STL." Nothing else matters as much.
4. **Educational warmth.** Colors, copy, and motion should feel encouraging — closer to Tinkercad's pastel friendliness than Fusion's ribbon density. Errors are coaching, not scolding.
5. **Single file, no build step.** The prototype is one HTML file so it's easy to port into the STEM Builder repo via Claude Code in VS Code.

## v1 paradigm — two first-class modes: 2D and 3D
Mini CAD has **two equal-status modes** the student can switch between freely:

**2D mode** is a complete environment on its own. A student making a laser-cut puzzle, a Cricut decal, or any other vector output can enter Mini CAD, sketch with dimensions, export SVG, and never touch the 3D mode. 2D is *not* a stepping-stone to 3D — it's the final destination for many projects.

**3D mode** is the second pillar. The sketch becomes a workplane. From there a student can extrude their sketch to a solid, **or** import a primitive (cube, sphere, cylinder) Tinkercad-style, **or** pick a face on any body and drop into a face-sketch sub-mode where they can draw and cut as a negative. Export STL.

### Two entry points into the 2D environment
The 2D environment serves two students with the same UX:

1. **Pure-2D students** — open Mini CAD, work in 2D, export SVG, done. Never see 3D.
2. **3D students who need precision** — working in 3D toward an STL, they need a precisely dimensioned shape before they can extrude or cut. They enter 2D from within their 3D session, draw the shape with real dimensions and snaps, exit back to 3D, and extrude or cut with that sketch as the input.

This second flow is the bridge to Fusion/SolidWorks thinking: "I need a feature → I need a sketch → I draw the sketch precisely → I turn it into a feature." But Mini CAD makes the 2D side a real destination on its own, not a gated sub-mode you only reach via "create sketch."

### What carries between modes
- Switching 2D → 3D brings the current sketch with you as a workplane sketch ready to extrude.
- Switching 3D → 2D returns to the last sketch you were editing, or opens a fresh one if you were just navigating bodies.
- Mode is chosen by the student's project, not forced by the tool.

This is what bridges the gap: Tinkercad's primitive-and-cut simplicity is preserved (you can stay in 3D the whole time and just drop blocks), but a real sketch-with-dimensions workflow is there for students whose part is genuinely 2D, **and** for 3D students who need the precision a drag-to-size primitive can't give.

## 2D sketcher — what "kept simple" means here
This is the heart of the tool. The 2D sketcher must feel like **traditional CAD with the noise removed**:

- **Type-in dimensions.** Every entity has editable dimensions in mm. Click a length, type a number, the geometry updates. This is the single biggest thing that separates Mini CAD from Tinkercad.
- **Snapping that does the right thing without being asked.**
  - Horizontal / vertical snap when a line is near 0° or 90°.
  - Endpoint snap — new node clicks land exactly on existing endpoints.
  - Midpoint and center snaps where they help.
  - Light visual cues (a small marker, a faint guideline) — never modal, never blocking.
- **Zoom in / zoom out / pan** — scroll wheel zooms toward the cursor; space-drag or middle-drag pans. Standard CAD muscle memory.
- **Tools, deliberately few:** select, line, rectangle, circle. (Polygon, arc, fillet, mirror come after v1.)
- **Grid + origin** are visible and meaningful. The origin is (0,0). Everything has coordinates.

## 3D viewer — what "kept simple" means here
- **Navigation:** orbit (drag), pan (shift-drag or middle-drag), zoom (wheel). Same gestures across the app.
- **Extrude any closed sketch** to a height in mm.
- **Primitive import** — a small palette of starter shapes: cube, sphere, cylinder. Each is parametric (edit width/height/depth or radius after placing).
- **Sketch-on-face → cut as negative.** Pick a flat face of any body. The sketcher opens with that face as its workplane. Draw a shape. Hit "cut" and the geometry is subtracted. This is the killer move for the "block with holes" use case.
- **Simple lighting and materials** — soft shadows, neutral gray default, a hint of color so faces read.

## v1 scope — walking skeleton
Every major UI region is present. One end-to-end happy path works: sketch a rectangle or circle → extrude → export STL or SVG. Primitive import (cube/sphere/cylinder) is stubbed and at least cube works. Other tools (line, polygon, fillet, sketch-on-face, boolean cut, pattern) are stubbed in the toolbar so Claude Code can flesh them out later.

## Architecture (single HTML file)
- **2D sketch view:** inline SVG, custom drawing logic, mm units, light grid, origin marker.
- **3D view:** Three.js (CDN, r128) — `ExtrudeGeometry` from a `THREE.Shape` built from the sketch.
- **Export:** native SVG serialization for sketches; Three.js `STLExporter` for parts.
- **State:** a single in-memory document object — `{ sketch: { entities: [...] }, features: [{type:'extrude', height, ...}] }`. Easy to refactor into a real model when ported to STEM Builder.

## Decisions made (so far)
- Plain HTML/CSS/JS, single file, Three.js via CDN — no build step, easy to drop into VS Code.
- **Two first-class modes — 2D and 3D — freely switchable.** A student can finish a project entirely in 2D (export SVG) or work primarily in 3D (extrude, primitives, face-sketch cuts, export STL). 2D is not a sub-step of 3D.
- Walking skeleton scope, not deep on a single feature.
- Units: mm.
- Coordinate system: Y-up in 3D, standard screen coords in 2D sketch (translated to a workplane on entering 3D).
- Snapping is on by default (horizontal, vertical, endpoints). Type-in dimensions are first-class.
- Navigation gestures match across 2D and 3D where possible (wheel = zoom, middle / space-drag = pan; in 3D, drag = orbit).

## Open questions for charlie
- Which secondary 2D tools matter most after rectangle/circle? (line, polygon, fillet, mirror, pattern)
- Constraint system — do we need parametric constraints (parallel, perpendicular, equal) in v1, or is "type a number into the dimension box" enough?
- Should multiple sketches / multiple extrudes stack into a feature tree, or v1 stays single-sketch single-extrude?
- Branding — does this live under STEM Builder's existing visual language, or do we design Mini CAD a look first and reconcile later?
- Auth / saving — for the prototype this is all local; in STEM Builder, where do projects save?

## Next steps after walking skeleton
1. Polygon and line sketch tools.
2. Boolean operations (cut, union) — students often need a hole in their part.
3. Dimension constraints (real parametric edit, not just label).
4. Feature tree with reorderable history.
5. Mobile / tablet support — Science Olympiad teams often work on Chromebooks and iPads.
6. Onboarding micro-interactions (one-line tooltips, no modal tutorial).

## Hand-off notes for Claude Code in VS Code
- The HTML file is structured so the sketch engine, the 3D engine, and the export functions can be lifted into separate modules (`sketch.js`, `viewer.js`, `export.js`) cleanly.
- All state mutations go through a small `doc` object — that's the seam for adding undo/redo or persistence.
- Three.js is loaded from CDN for the prototype; in STEM Builder this should become an npm dep.
