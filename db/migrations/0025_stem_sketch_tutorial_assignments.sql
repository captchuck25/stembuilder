-- 0025: STEM Sketch tutorial assignments — which tutorials a class must do.
--
-- Design notes (conventions follow 0021/0024):
--  * ONE row per class holding the assigned SET (tutorial_ids jsonb array of
--    string keys into lib/stem-sketch/tutorials.ts). Teachers manage it as
--    checkboxes, not as separate assignment objects — tutorials are a
--    checklist, not graded artifacts. Upsert on class_id.
--  * Completion tracking is NOT here — stem_sketch_tutorial_progress (0024)
--    already records per-user completion; the teacher roster is a read-time
--    join of enrollment × progress × this set. A student who finished a
--    tutorial before it was assigned shows complete immediately (feature).
--  * class_id TEXT with no FK (same as 0021); teacher_id TEXT references
--    profiles(id) — profiles.id is TEXT, never uuid.
--  * Class-scoped CONFIG (no personal data): no deleted_at, hard-deleted
--    with its class at purge time — same policy as stem_sketch_assignments.
--    Nothing to add to the retention sweep.
--  * RLS enabled with no permissive policies (service-role only).
--  * Plan gating (Pro) happens in the API layer via
--    stemSketchAssignmentsAllowed — tutorials are free to TAKE for
--    everyone; assigning/tracking is the teacher Pro surface.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0024 and
-- BEFORE deploying the tutorial-assignment app code.

create table if not exists stem_sketch_tutorial_assignments (
  class_id text primary key,
  teacher_id text not null references profiles(id) on delete cascade,
  tutorial_ids jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table stem_sketch_tutorial_assignments enable row level security;
