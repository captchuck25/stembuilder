-- 0023: STEM Sketch tutorials — per-user completion tracking.
--
-- Design notes (conventions follow 0021/0022):
--  * Tutorial CONTENT (steps, checks) lives in the tool
--    (public/stem-sketch/index.html section 9) with platform metadata in
--    lib/stem-sketch/tutorials.ts — never in the DB. tutorial_id is a string
--    key into that code library, same philosophy as challenge_id (0021).
--  * Tutorials are FREE for all users; this table only records completion so
--    progress survives devices and teachers can track it. One row per
--    (user, tutorial), first completion wins — re-doing a tutorial is
--    allowed in the tool but never rewrites completed_at.
--  * user_id is TEXT referencing profiles(id) — profiles.id is TEXT, not
--    uuid. Never use uuid for profile FKs.
--  * No deleted_at: rows are tiny derived progress, hard-deleted with the
--    profile via the FK cascade (soft_delete_user tombstones the profile;
--    the purge job's profile delete cascades here). Nothing to add to the
--    retention sweep.
--  * RLS enabled with no permissive policies: all access is via the service
--    role (hard-blocks the anon key), same hardening as 0021.
--  * Teacher assignment of tutorials (which tutorials a class must do) is
--    NOT this table — that lands with the teacher dashboard slice and will
--    follow the stem_sketch_assignments pattern.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0022 and
-- BEFORE deploying the tutorials app code (its API route needs this table).

create table if not exists stem_sketch_tutorial_progress (
  user_id text not null references profiles(id) on delete cascade,
  tutorial_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, tutorial_id)
);

create index if not exists idx_ss_tutorial_progress_tutorial
  on stem_sketch_tutorial_progress (tutorial_id);

alter table stem_sketch_tutorial_progress enable row level security;
