-- 0015: Measurement Lab — teacher assignments, attempt history, sprint leaderboards.
--
-- Design notes:
--  * teacher_id / student_id are TEXT referencing profiles(id) — profiles.id is
--    TEXT, not uuid (see 0002 notes). Never use uuid for profile FKs.
--  * class_id is TEXT with no FK on purpose (same as arcade_games/0012): it
--    stores classes.id as text so this migration doesn't couple to that table's
--    key type. Assignments are always reached through a live class the caller
--    owns or is enrolled in, so an orphaned row is inert.
--  * measurement_assignments is class-scoped CONFIG (no personal data): no
--    deleted_at, hard-deleted with its class at purge time — same policy as
--    bridge_assignments / turtle_assignments (see 0005 header).
--  * measurement_attempts is append-only student work (one row per finished
--    assignment attempt, `missed` captures wrong answers for future analytics):
--    soft-deleted via deleted_at + wired into the retention purge.
--  * measurement_runs holds each student's best 60-second-sprint score per
--    instrument (arcade_runs shape: unique(student_id, tool), monotonic upsert
--    in the API). Account-scoped like bridge_designs — survives class deletion,
--    tombstoned when the account is deleted. Class leaderboards are computed at
--    read time by joining live enrollments, so one row serves all of a
--    student's classes.
--  * classes.leaderboard_enabled: per-class teacher toggle; when false the
--    leaderboard API returns nothing to students (teacher still sees data).
--  * RLS enabled with no permissive policies: all access is via the service
--    role, so this hard-blocks the anon key (same hardening as other tables).
--    The two personal-data tables also get the restrictive
--    exclude_soft_deleted policy from 0005 §2.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0014 and
-- BEFORE deploying the measurement-lab app code (its API routes need these
-- tables).

-- ─── 1. Tables ───────────────────────────────────────────────────────────────

create table if not exists measurement_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id text not null,
  teacher_id text not null references profiles(id) on delete cascade,
  title text not null default 'Measurement Assignment',
  tool text not null check (tool in ('ruler','dial-caliper','graduated-cylinder','triple-beam')),
  -- { mode, precision, questionCount (5-20), timerSeconds (int|null), passThreshold (int) }
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_measurement_assignments_class on measurement_assignments (class_id);

create table if not exists measurement_attempts (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references measurement_assignments(id) on delete cascade,
  student_id text not null references profiles(id) on delete cascade,
  correct int not null check (correct >= 0),
  total int not null check (total > 0),
  duration_s int,
  missed jsonb,   -- [{ q: <question idx>, target: <asked>, answer: <given> }]
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_measurement_attempts_assign on measurement_attempts (assignment_id, student_id);
create index if not exists idx_measurement_attempts_deleted_at on measurement_attempts (deleted_at) where deleted_at is not null;

create table if not exists measurement_runs (
  id bigint generated always as identity primary key,
  student_id text not null references profiles(id) on delete cascade,
  tool text not null check (tool in ('ruler','dial-caliper','graduated-cylinder','triple-beam')),
  best_points int not null check (best_points > 0),
  best_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (student_id, tool)
);

create index if not exists idx_measurement_runs_tool on measurement_runs (tool, best_points desc);
create index if not exists idx_measurement_runs_deleted_at on measurement_runs (deleted_at) where deleted_at is not null;

alter table classes add column if not exists leaderboard_enabled boolean not null default true;

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

alter table measurement_assignments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['measurement_attempts','measurement_runs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists exclude_soft_deleted on %I', t);
    execute format(
      'create policy exclude_soft_deleted on %I as restrictive for select using (deleted_at is null)', t);
  end loop;
end $$;

-- ─── 3. soft_delete_class: also tombstone this class's measurement attempts ──
-- 0005 body + the measurement_attempts update. (measurement_runs are
-- account-scoped and survive class deletion, like bridge_designs.)

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
end $$;

-- ─── 4. soft_delete_user: also tombstone measurement attempts + runs ─────────
-- Based on the 0009 body (which added the email_verification_tokens delete —
-- do not regress it), plus the two measurement updates.

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

  -- Security tokens: no retention value, remove immediately.
  delete from password_reset_tokens      where user_id::text = p_user_id;
  delete from email_verification_tokens  where user_id::text = p_user_id;
end $$;

-- ─── 5. purge_soft_deleted: sweep the new tables ─────────────────────────────
-- 0005 body (never redefined since) with three additions, children first:
-- measurement_attempts (references measurement_assignments), measurement_runs,
-- and measurement_assignments riding along with purged classes in the
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

  delete from turtle_assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('turtle_assignments', v_count); v_total := v_total + v_count;

  delete from assignments where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('assignments', v_count); v_total := v_total + v_count;

  delete from lesson_locks where class_id in (select id from _purge_classes);
  get diagnostics v_count = row_count;
  v_log := v_log || jsonb_build_object('lesson_locks', v_count); v_total := v_total + v_count;

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
-- preserves grants, but re-revoking is belt-and-braces — 0009 precedent).
revoke all on function soft_delete_class(text)      from public, anon, authenticated;
revoke all on function soft_delete_user(text)       from public, anon, authenticated;
revoke all on function purge_soft_deleted(interval) from public, anon, authenticated;
