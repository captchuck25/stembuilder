-- 0021: STEM Sketch assignments — stage 1 "replicate the block" challenges
-- assigned to classes, student submissions with fit-check verdicts.
--
-- Design notes (conventions follow 0015/0020):
--  * teacher_id / student_id are TEXT referencing profiles(id) — profiles.id
--    is TEXT, not uuid. Never use uuid for profile FKs.
--  * class_id is TEXT with no FK on purpose (same as 0012/0015/0020):
--    assignments are always reached through a live class the caller owns or
--    is enrolled in, so an orphaned row is inert.
--  * challenge_id keys into the code-defined challenge library
--    (lib/stem-sketch/challenges.ts) — challenge content (reference geometry,
--    printable STLs, tolerances) lives in the repo, never in the DB, so the
--    curriculum can be revised without a migration. Same philosophy as the
--    quiz curriculum banks (0020).
--  * stem_sketch_assignments is class-scoped CONFIG (no personal data): no
--    deleted_at, hard-deleted with its class at purge time — same policy as
--    measurement_assignments / quiz_assignments.
--  * stem_sketch_submissions is append-only student work, one row per submit:
--    doc_json is a FROZEN snapshot of the student's model at submission time
--    (independent of their stem_sketch_designs saves, so later edits never
--    change a graded submission). passed/metrics come from the in-tool
--    Manifold fit check (client-computed for now; server re-verification is
--    future work). Soft-deleted via deleted_at + wired into retention purge.
--  * RLS enabled with no permissive policies: all access is via the service
--    role (hard-blocks the anon key). The submissions table also gets the
--    restrictive exclude_soft_deleted policy from 0005 §2.
--  * Plan gating (pro / pro_trial / district — same policy as Quiz Builder)
--    happens in the API layer via lib/plan.ts includesStemSketchAssignments —
--    nothing to enforce here.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0020 and
-- BEFORE deploying the stem-sketch assignments app code (its API routes need
-- these tables).

-- ─── 1. Tables ───────────────────────────────────────────────────────────────

create table if not exists stem_sketch_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id text not null,
  teacher_id text not null references profiles(id) on delete cascade,
  title text not null default 'STEM Sketch Assignment',
  challenge_id text not null,
  -- Reserved for per-assignment overrides: { toleranceMm?, stage? }
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_stem_sketch_assignments_class on stem_sketch_assignments (class_id);

create table if not exists stem_sketch_submissions (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references stem_sketch_assignments(id) on delete cascade,
  student_id text not null references profiles(id) on delete cascade,
  doc_json jsonb not null,   -- frozen model snapshot at submit time
  units text not null default 'in',
  thumbnail text,
  passed boolean not null,
  -- Fit-check numbers from the tool, e.g. { refVolumeMm3, studentVolumeMm3,
  -- missingVolumeMm3, extraVolumeMm3, toleranceMm }
  metrics jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_stem_sketch_submissions_assign on stem_sketch_submissions (assignment_id, student_id);
create index if not exists idx_stem_sketch_submissions_deleted_at on stem_sketch_submissions (deleted_at) where deleted_at is not null;

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

alter table stem_sketch_assignments enable row level security;
alter table stem_sketch_submissions enable row level security;

drop policy if exists exclude_soft_deleted on stem_sketch_submissions;
create policy exclude_soft_deleted on stem_sketch_submissions
  as restrictive for select using (deleted_at is null);

-- ─── 3. soft_delete_class: also tombstone this class's sketch submissions ────
-- 0020 body + the stem_sketch_submissions update.

create or replace function soft_delete_class(p_class_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update classes set deleted_at = v_now
    where id::text = p_class_id and deleted_at is null;

  update enrollments set deleted_at = v_now
    where class_id::text = p_class_id and deleted_at is null;

  -- Class-scoped student work: bridge submissions hang off the class's
  -- assignments. (bridge_designs / user_progress are the student's own
  -- account-scoped work and survive a class deletion.)
  update bridge_submissions set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from bridge_assignments where class_id::text = p_class_id);

  update measurement_attempts set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from measurement_assignments where class_id::text = p_class_id);

  update quiz_attempts set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from quiz_assignments where class_id::text = p_class_id);

  update stem_sketch_submissions set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from stem_sketch_assignments where class_id::text = p_class_id);
end $$;

-- ─── 4. soft_delete_user: also tombstone sketch submissions ──────────────────
-- 0020 body (which kept 0009's email_verification_tokens delete and 0020's
-- quiz updates — do not regress either) plus the stem_sketch_submissions
-- update (student side). The teacher's stem_sketch_assignments are
-- class-scoped config and ride to the grave with their classes at purge time.

create or replace function soft_delete_user(p_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  r record;
begin
  update profiles set deleted_at = v_now
    where id::text = p_user_id and deleted_at is null;

  -- Teachers: cascade every class they own (which cascades enrollments and
  -- that class's submissions).
  for r in select id from classes where teacher_id::text = p_user_id and deleted_at is null loop
    perform soft_delete_class(r.id::text);
  end loop;

  -- Account-scoped rows (students and teachers alike).
  update enrollments          set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update user_progress        set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update bridge_designs       set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update bridge_submissions   set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update turtle_submissions   set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update stem_sketch_designs  set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update blueprint_lab_designs set deleted_at = v_now where user_id::text   = p_user_id and deleted_at is null;
  update measurement_attempts set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update measurement_runs     set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update quiz_attempts        set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update quizzes              set deleted_at = v_now where teacher_id::text = p_user_id and deleted_at is null;
  update teacher_questions    set deleted_at = v_now where teacher_id::text = p_user_id and deleted_at is null;
  update stem_sketch_submissions set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;

  -- Security tokens: no retention value, remove immediately.
  delete from password_reset_tokens      where user_id::text = p_user_id;
  delete from email_verification_tokens  where user_id::text = p_user_id;
end $$;

-- ─── 5. purge_soft_deleted: sweep the new tables ─────────────────────────────
-- 0020 body with two additions, children first: stem_sketch_submissions
-- (references stem_sketch_assignments) in the student-work section, then
-- stem_sketch_assignments riding along with purged classes in the
-- class-scoped-config section.

create or replace function purge_soft_deleted(p_retention interval default interval '30 days')
returns table (tbl text, purged bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - p_retention;
  v_count  bigint;
  v_log    jsonb := '{}'::jsonb;
  v_total  bigint := 0;
begin
  drop table if exists pg_temp._purge_users;
  drop table if exists pg_temp._purge_classes;

  create temp table _purge_users on commit drop as
    select id from profiles where deleted_at < v_cutoff;

  -- Classes due directly, plus (defensively) classes owned by a purged teacher.
  create temp table _purge_classes on commit drop as
    select id from classes
     where deleted_at < v_cutoff
        or teacher_id in (select id from _purge_users);

  -- Student work ─ children first (bridge_submissions reference bridge_assignments).
  delete from bridge_submissions
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from bridge_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('bridge_submissions', v_count); v_total := v_total + v_count;

  delete from measurement_attempts
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from measurement_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('measurement_attempts', v_count); v_total := v_total + v_count;

  delete from measurement_runs
   where deleted_at < v_cutoff or student_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('measurement_runs', v_count); v_total := v_total + v_count;

  delete from quiz_attempts
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from quiz_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('quiz_attempts', v_count); v_total := v_total + v_count;

  delete from stem_sketch_submissions
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from stem_sketch_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('stem_sketch_submissions', v_count); v_total := v_total + v_count;

  -- If bridge_designs has grown an assignment_id column (see
  -- /api/bridge/by-assignment strategy 2), detach it before the assignments go.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bridge_designs'
                and column_name = 'assignment_id') then
    execute 'update bridge_designs set assignment_id = null
              where assignment_id in (select id from bridge_assignments
                                       where class_id in (select id from _purge_classes))';
  end if;

  delete from bridge_designs
   where deleted_at < v_cutoff or user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('bridge_designs', v_count); v_total := v_total + v_count;

  delete from turtle_submissions
   where deleted_at < v_cutoff or user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('turtle_submissions', v_count); v_total := v_total + v_count;

  delete from stem_sketch_designs
   where deleted_at < v_cutoff or user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('stem_sketch_designs', v_count); v_total := v_total + v_count;

  delete from blueprint_lab_designs
   where deleted_at < v_cutoff or user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('blueprint_lab_designs', v_count); v_total := v_total + v_count;

  delete from user_progress
   where deleted_at < v_cutoff or user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('user_progress', v_count); v_total := v_total + v_count;

  delete from enrollments
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('enrollments', v_count); v_total := v_total + v_count;

  -- Class-scoped config rides along with its class.
  delete from bridge_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('bridge_assignments', v_count); v_total := v_total + v_count;

  delete from measurement_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('measurement_assignments', v_count); v_total := v_total + v_count;

  delete from quiz_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('quiz_assignments', v_count); v_total := v_total + v_count;

  delete from stem_sketch_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('stem_sketch_assignments', v_count); v_total := v_total + v_count;

  delete from turtle_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('turtle_assignments', v_count); v_total := v_total + v_count;

  delete from assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('assignments', v_count); v_total := v_total + v_count;

  delete from lesson_locks where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('lesson_locks', v_count); v_total := v_total + v_count;

  -- Teacher-owned quiz content (cascades any surviving quiz_assignments).
  delete from quizzes
   where deleted_at < v_cutoff or teacher_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('quizzes', v_count); v_total := v_total + v_count;

  delete from teacher_questions
   where deleted_at < v_cutoff or teacher_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('teacher_questions', v_count); v_total := v_total + v_count;

  delete from classes where id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('classes', v_count); v_total := v_total + v_count;

  delete from password_reset_tokens where user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('password_reset_tokens', v_count); v_total := v_total + v_count;

  delete from profiles where id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('profiles', v_count); v_total := v_total + v_count;

  insert into retention_purge_log (purged, total) values (v_log, v_total);
  raise notice 'purge_soft_deleted: % rows purged (%)', v_total, v_log;

  return query select key, value::bigint from jsonb_each_text(v_log);
end $$;

-- Lock the functions down: service role / postgres only (create-or-replace
-- preserves grants, but re-revoking is belt-and-braces — 0009/0015/0020
-- precedent).
revoke all on function soft_delete_class(text)      from public, anon, authenticated;
revoke all on function soft_delete_user(text)       from public, anon, authenticated;
revoke all on function purge_soft_deleted(interval) from public, anon, authenticated;
