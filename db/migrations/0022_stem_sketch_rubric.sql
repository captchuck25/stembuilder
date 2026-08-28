-- 0022: STEM Sketch level 3 (Brainstorm & Design) — teacher rubric grading
-- on submissions.
--
-- Design notes:
--  * Level 3 submissions are graded against a rubric defined IN CODE
--    (lib/stem-sketch/challenges.ts, like all challenge content). The DB
--    stores only the scores: rubric_scores jsonb keyed by rubric row id,
--    e.g. { "dimensions": { "score": 10, "auto": true },
--           "sun-bolt":   { "score": 8, "suggested": 10, "overridden": true },
--           "creativity": { "score": 8 } }.
--    Totals are computed at read time from the rows — never stored.
--  * graded_by is TEXT referencing profiles(id) loosely (no FK — grader
--    identity is informational; the submission already cascades with its
--    assignment/student).
--  * Levels 1-2 submissions simply never populate these columns.
--  * No RLS/purge changes: stem_sketch_submissions is already covered by
--    0021's policies and sweep.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0021 and
-- BEFORE deploying the level 3 app code.

alter table stem_sketch_submissions
  add column if not exists rubric_scores jsonb,
  add column if not exists graded_at timestamptz,
  add column if not exists graded_by text;
