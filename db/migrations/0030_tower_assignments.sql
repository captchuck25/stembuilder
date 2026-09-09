-- 0030: Tower Builder — teacher assignments + student submissions (the
-- bridge_assignments / bridge_submissions loop, for towers).
--
-- Design notes (conventions follow 0015 / 0026 / 0029):
--  * teacher_id / student_id are TEXT referencing profiles(id) (profiles.id is
--    TEXT — never uuid). class_id is TEXT with no FK, same as bridge_assignments.
--  * tower_assignments is class-scoped CONFIG (no personal data): no
--    deleted_at, hard-deleted with its class at purge time (0005 policy).
--  * tower_submissions is student work: one ACTIVE row per (assignment,
--    student), upserted on resubmit; soft-deleted via deleted_at and wired
--    into soft_delete_class / soft_delete_user / purge_soft_deleted below.
--  * Students' in-progress designs live in tower_designs (0029) under the
--    name 'asgn_<assignment id>' — no FK, exactly like bridge_designs.
--  * RLS enabled with no permissive policies (service-role only); the
--    personal-data table also gets the restrictive exclude_soft_deleted
--    policy from 0005 §2.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0029 and
-- BEFORE deploying the tower assignment app code (its API routes need these
-- tables).

-- ─── 1. Tables ───────────────────────────────────────────────────────────────

create table if not exists tower_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id text not null,
  teacher_id text not null references profiles(id) on delete cascade,
  title text not null default 'Tower Assignment',
  height_feet int not null,
  footprint_feet int not null,
  load_lb int not null,
  max_cost numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tower_assignments_class on tower_assignments (class_id);

create table if not exists tower_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references tower_assignments(id) on delete cascade,
  student_id text not null references profiles(id) on delete cascade,
  cost numeric not null,
  passed boolean not null default false,
  submitted_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (assignment_id, student_id)
);

create index if not exists idx_tower_submissions_assign on tower_submissions (assignment_id, student_id);
create index if not exists idx_tower_submissions_deleted_at on tower_submissions (deleted_at) where deleted_at is not null;

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

alter table tower_assignments enable row level security;
alter table tower_submissions enable row level security;

drop policy if exists exclude_soft_deleted on tower_submissions;
create policy exclude_soft_deleted on tower_submissions
  as restrictive for select using (deleted_at is null);

-- ─── 3. soft_delete_class: tombstone this class's tower submissions ──────────
-- 0026 body + tower_submissions update.

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

  update bridge_submissions set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from bridge_assignments where class_id::text = p_class_id);

  update tower_submissions set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from tower_assignments where class_id::text = p_class_id);

  update measurement_attempts set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from measurement_assignments where class_id::text = p_class_id);

  update quiz_attempts set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from quiz_assignments where class_id::text = p_class_id);

  update stem_sketch_submissions set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from stem_sketch_assignments where class_id::text = p_class_id);

  update blueprint_submissions set deleted_at = v_now
    where deleted_at is null
      and assignment_id in (select id from blueprint_assignments where class_id::text = p_class_id);
end $$;

-- ─── 4. soft_delete_user: tombstone the student's tower submissions ──────────
-- 0029 body + tower_submissions update.

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

  for r in select id from classes where teacher_id::text = p_user_id and deleted_at is null loop
    perform soft_delete_class(r.id::text);
  end loop;

  update enrollments          set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update user_progress        set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update bridge_designs       set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update tower_designs        set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update bridge_submissions   set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update tower_submissions    set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update turtle_submissions   set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update stem_sketch_designs  set deleted_at = v_now where user_id::text    = p_user_id and deleted_at is null;
  update blueprint_lab_designs set deleted_at = v_now where user_id::text   = p_user_id and deleted_at is null;
  update measurement_attempts set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update measurement_runs     set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update quiz_attempts        set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update quizzes              set deleted_at = v_now where teacher_id::text = p_user_id and deleted_at is null;
  update teacher_questions    set deleted_at = v_now where teacher_id::text = p_user_id and deleted_at is null;
  update stem_sketch_submissions set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;
  update blueprint_submissions   set deleted_at = v_now where student_id::text = p_user_id and deleted_at is null;

  delete from password_reset_tokens      where user_id::text = p_user_id;
  delete from email_verification_tokens  where user_id::text = p_user_id;
end $$;

-- ─── 5. purge_soft_deleted: sweep tower_submissions + tower_assignments ──────
-- 0029 body + tower_submissions delete (children before tower_assignments)
-- + tower_assignments delete with the other class config tables.

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

  create temp table _purge_classes on commit drop as
    select id from classes
     where deleted_at < v_cutoff
        or teacher_id in (select id from _purge_users);

  delete from bridge_submissions
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from bridge_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('bridge_submissions', v_count); v_total := v_total + v_count;

  delete from tower_submissions
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from tower_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('tower_submissions', v_count); v_total := v_total + v_count;

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

  delete from blueprint_submissions
   where deleted_at < v_cutoff
      or student_id in (select id from _purge_users)
      or assignment_id in (select id from blueprint_assignments
                            where class_id in (select id from _purge_classes));
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('blueprint_submissions', v_count); v_total := v_total + v_count;

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

  update tower_designs set assignment_id = null
   where assignment_id in (select id from tower_assignments
                            where class_id in (select id from _purge_classes));

  delete from tower_designs
   where deleted_at < v_cutoff or user_id in (select id from _purge_users);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('tower_designs', v_count); v_total := v_total + v_count;

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

  delete from bridge_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('bridge_assignments', v_count); v_total := v_total + v_count;

  delete from tower_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('tower_assignments', v_count); v_total := v_total + v_count;

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

revoke all on function soft_delete_class(text)      from public, anon, authenticated;
revoke all on function soft_delete_user(text)       from public, anon, authenticated;
revoke all on function purge_soft_deleted(interval) from public, anon, authenticated;
