-- 0023: Blueprint Lab assignments — design briefs with teacher-adjustable
-- rubrics and shell (perimeter) settings, saved per class.
--
-- Design notes (conventions follow 0015/0020/0021):
--  * teacher_id is TEXT referencing profiles(id) — profiles.id is TEXT, not
--    uuid. Never use uuid for profile FKs.
--  * class_id is TEXT with no FK on purpose (same as 0012/0015/0020/0021).
--  * brief_id keys into the code-defined brief library
--    (app/tools/blueprint-lab/engine/rubric.ts BRIEFS) — the generic-standard
--    template the assignment started from. config holds the teacher's edited
--    copy of the whole Brief (rooms, totalSqFt, frontDoor/backDoor), so
--    grading always uses the frozen teacher version, not the code default.
--  * shell_mode: 'scratch' (blank canvas) | 'choice' (student picks one of
--    shell_ids) | 'fixed' (every student gets shell_ids[0]). shell_ids key
--    into the code-defined parametric shell library (engine/shells.ts).
--  * status: 'draft' (teacher editing, invisible to students) | 'assigned'.
--  * Class-scoped CONFIG (no personal data): no deleted_at, hard-deleted with
--    its class at purge time — same policy as stem_sketch_assignments.
--    Student submissions are a LATER migration (they'll get deleted_at +
--    retention wiring when the student flow ships).
--  * RLS enabled with no permissive policies: all access via service role.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0022 and
-- BEFORE deploying the blueprint assignment app code.

-- ─── 1. Table ────────────────────────────────────────────────────────────────

create table if not exists blueprint_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id text not null,
  teacher_id text not null references profiles(id) on delete cascade,
  title text not null default 'Blueprint Assignment',
  brief_id text not null,
  -- Frozen teacher-edited Brief: { totalSqFt, rooms[], frontDoor, backDoor, deliverables }
  config jsonb not null default '{}'::jsonb,
  shell_mode text not null default 'scratch' check (shell_mode in ('scratch', 'choice', 'fixed')),
  shell_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'assigned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_blueprint_assignments_class on blueprint_assignments (class_id);

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

alter table blueprint_assignments enable row level security;

-- ─── 3. purge_soft_deleted: blueprint_assignments rides along with its class ──
-- 0021 body + one delete in the class-scoped-config section. soft_delete_class
-- and soft_delete_user are unchanged (this table has no deleted_at and no
-- student rows yet).

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

  delete from blueprint_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('blueprint_assignments', v_count); v_total := v_total + v_count;

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

revoke all on function purge_soft_deleted(interval) from public, anon, authenticated;
