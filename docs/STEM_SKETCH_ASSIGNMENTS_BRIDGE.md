# STEM Sketch Assignments — iframe bridge contract

Frozen contract between the Next.js shell (`app/tools/stem-sketch/StemSketchClient.tsx`,
**shipped**) and the STEM Sketch iframe (`public/stem-sketch/index.html`, **to be
implemented** — the iframe currently ignores the new message types, which is a
harmless no-op). Platform docs: plan `stem-sketch-assignments` memory; schema
`db/migrations/0021_stem_sketch_assignments.sql`; challenge library
`lib/stem-sketch/challenges.ts`.

All messages ride the existing `STEMSKETCH_*` postMessage protocol (same
`window.postMessage(msg, "*")` transport as `STEMSKETCH_USER` / `STEMSKETCH_SAVE`).

## Launch flow

Student (or teacher pressing "Try It") opens `/tools/stem-sketch?assignment=<id>`.
The shell fetches `GET /api/stem-sketch-assignments/<id>` (assignment + resolved
challenge in one payload), shows a cyan assignment banner, suppresses its
auto-load-most-recent-design fallback, and pushes the context into the iframe.

## Messages: shell → iframe

### `STEMSKETCH_ASSIGNMENT`
Sent on iframe `load` and whenever the assignment fetch resolves (and again in
reply to `STEMSKETCH_REQUEST_ASSIGNMENT`). Entering assignment mode is the
iframe's cue to start a fresh canvas (no localStorage draft restore into it).

Also sent for TEACHER PREVIEW (`/tools/stem-sketch?challenge=<id>` — the
"Try it first" link in the picker): identical payload with `preview: true`
and an empty `id`. The iframe should behave exactly like an assignment
(instructions panel, locked window, fit check) but hide/disable Submit —
the shell refuses preview submissions anyway.

```jsonc
{
  "type": "STEMSKETCH_ASSIGNMENT",
  "assignment": {
    "id": "…uuid…",                  // "" when preview
    "title": "Starter Brick — Period 3",
    "preview": false,
    "challenge": {
      "id": "s1-01-starter-brick",
      "stage": 1,                    // 1 = replicate, 2 = complete-the-cube (future)
      "title": "Starter Brick",
      "precision": "whole",          // whole | half | quarter | eighth (inch fractions)
      "studentInstructions": "1. Get the printed block…\n2. Measure it…", // newline-separated steps
      "refDocJson": { /* STEM Sketch doc of the reference solid, or null */ },
      "toleranceMm": 0.5
    }
  }
}
```

### `STEMSKETCH_SUBMIT_OK` / `STEMSKETCH_SUBMIT_ERR`
Reply to `STEMSKETCH_SUBMIT`:
```jsonc
{ "type": "STEMSKETCH_SUBMIT_OK", "passed": true }
{ "type": "STEMSKETCH_SUBMIT_ERR", "message": "…human-readable reason…" }
```

## Messages: iframe → shell

### `STEMSKETCH_REQUEST_ASSIGNMENT`
Ask the shell to (re)send `STEMSKETCH_ASSIGNMENT` (mirror of
`STEMSKETCH_REQUEST_USER`). Safe to send even when no assignment is open —
the shell simply doesn't reply.

### `STEMSKETCH_SUBMIT`
Sent after the student runs the in-tool fit check and confirms submission.
Append-only server-side (`POST /api/stem-sketch-assignments/<id>/submissions`):
every submit inserts a row, so teachers see attempt counts. Failing checks MAY
be submitted (`passed: false`) — they show as attempts on the teacher roster.

```jsonc
{
  "type": "STEMSKETCH_SUBMIT",
  "docJson": { /* full doc snapshot */ },   // OR docJsonGz (gzip+base64, same as STEMSKETCH_SAVE)
  "units": "in",                            // 'in' | 'mm'
  "thumbnail": "data:image/png;base64,…",   // optional, shown on teacher roster
  "passed": true,                           // fit-check verdict (required boolean)
  "metrics": {                              // optional; stored verbatim in jsonb
    "refVolumeMm3": 123456,
    "studentVolumeMm3": 123401,
    "missingVolumeMm3": 55,                 // ref minus student
    "extraVolumeMm3": 0,                    // student minus ref
    "toleranceMm": 0.5
  }
}
```

## Iframe-side obligations (the next slice, in public/stem-sketch/index.html)

1. **Assignment mode state**: on `STEMSKETCH_ASSIGNMENT`, enter assignment mode —
   fresh canvas, assignment title shown, normal modeling tools available.
   1. **Locked, assignment-specific window** (user requirement 2026-08-17):
      the project IS the assignment. Hide/disable **+ New**, **Open** (folder),
      the cloud design list, and the project-name field (name is fixed to the
      assignment title — not editable). No loading old drawings into an
      assignment session and no renaming it.
   2. **Instructions panel**: a collapsible dropdown (open by default on
      entry) showing `challenge.studentInstructions` — the "get the printed
      block from your teacher, measure it, rebuild it, submit" steps — plus
      the assignment title. Reopenable from the banner/toolbar at any time.
2. **Reference stays hidden during design**: `refDocJson` must NOT be rendered,
   listed, or measurable while the student designs. The physical printed block
   is the only source of dimensional truth.
3. **Locked check mode**: a "Check my model" action enters a modal state where
   ALL design/measurement tools are disabled — the student can only see the
   result and return to design. No dimension readouts of the reference, ever.
   Inside check mode ONLY, the reference IS shown as a translucent green ghost
   superimposed on the student's model (mapped via the inverse best-fit
   transform) — scene-only, non-raycastable, removed when check mode closes,
   so it can be looked at but never measured or manipulated.
4. **Fit check (stage 1, replicate)**: via Manifold — align student body to the
   reference (snap best of the 24 axis orientations at matching bounding-box
   centers), then `missing = ref − student` and `extra = student − ref`; pass
   when both volumes are below the tolerance envelope (toleranceMm as a linear
   tolerance on the reference's surface — implementation may approximate via
   volume threshold: vol < surfaceArea × toleranceMm).
5. **Submission**: on pass (or on explicit "submit anyway"), emit
   `STEMSKETCH_SUBMIT` with the frozen doc + verdict; show OK/ERR from the reply.
6. Verdicts are client-computed in this slice; the server stores them verbatim.
   Server-side re-verification against `refDocJson` is planned future work —
   don't design anything that depends on the verdict being unverifiable.

## Stage 2 — Fill the Void (complete the cube)

Same message contract, same fit pipeline, one twist: `refDocJson` is the
printed VOID BLOCK (what the teacher prints and hands out), and the payload
carries `targetCubeIn` (edge length of the target cube, inches). The iframe
builds the student's true reference as the COMPLEMENT — a `targetCubeIn`
cube anchored on the block's bounding box, MINUS the block solid — and then
runs the identical stage 1 machinery (24-orientation snap, symmetric
difference, tolerance band, green ghost) against that complement. The
student models ONLY the missing piece; block + piece = the full cube.

## Tolerance rationale

Challenge dimensions are quantized to eighths of an inch (1/8" = 3.175 mm).
A student model is either exactly right or off by ≥ 1/8" in some dimension, so
±0.5 mm cleanly separates correct from one-increment-wrong with huge margin on
both sides. Never tighten below float-noise levels or loosen past ~1.5 mm.
