-- 30-day data-retention / deletion window (Privacy Policy enforcement).
--
-- Deletions in the app become SOFT deletes: rows get `deleted_at = now()` and
-- are excluded from every app query. A scheduled job (0006, or the
-- /api/cron/purge Vercel cron) hard-deletes anything soft-deleted more than
-- 30 days ago. During the grace period a row can be restored by setting
-- `deleted_at = null` (and re-running is safe — everything here is idempotent).
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0004.
--
-- Tables that hold student/teacher personal data get `deleted_at`:
--   profiles, classes, enrollments, user_progress,
--   bridge_designs, bridge_submissions, turtle_submissions,
--   stem_sketch_designs, blueprint_lab_designs
--
-- Class-scoped CONFIG tables (assignments, lesson_locks, turtle_assignments,
-- bridge_assignments) hold no personal data and do NOT get a column: once a
-- class is soft-deleted they are unreachable (every code path reaches them
-- through a visible class or enrollment), and they are hard-deleted together
-- with their class at purge time. This keeps a deleted class fully restorable
-- (its assignments/locks are still in place) without touching ~20 more queries.
--
-- password_reset_tokens are security tokens, not retained data: they are
-- hard-deleted immediately when an account is soft-deleted.

-- ─── 1. deleted_at columns ───────────────────────────────────────────────────

alter table profiles             add column if not exists deleted_at timestamptz;
alter table classes              add column if not exists deleted_at timestamptz;
alter table enrollments          add column if not exists deleted_at timestamptz;
alter table user_progress        add column if not exists deleted_at timestamptz;
alter table bridge_designs       add column if not exists deleted_at timestamptz;
alter table bridge_submissions   add column if not exists deleted_at timestamptz;
alter table turtle_submissions   add column if not exists deleted_at timestamptz;
alter table stem_sketch_designs  add column if not exists deleted_at timestamptz;
alter table blueprint_lab_designs add column if not exists deleted_at timestamptz;

-- Partial indexes: the purge job scans only tombstoned rows.
create index if not exists idx_profiles_deleted_at             on profiles (deleted_at)             where deleted_at is not null;
create index if not exists idx_classes_deleted_at              on classes (deleted_at)              where deleted_at is not null;
create index if not exists idx_enrollments_deleted_at          on enrollments (deleted_at)          where deleted_at is not null;
create index if not exists idx_user_progress_deleted_at        on user_progress (deleted_at)        where deleted_at is not null;
create index if not exists idx_bridge_designs_deleted_at       on bridge_designs (deleted_at)       where deleted_at is not null;
create index if not exists idx_bridge_submissions_deleted_at   on bridge_submissions (deleted_at)   where deleted_at is not null;
create index if not exists idx_turtle_submissions_deleted_at   on turtle_submissions (deleted_at)   where deleted_at is not null;
create index if not exists idx_stem_sketch_designs_deleted_at  on stem_sketch_designs (deleted_at)  where deleted_at is not null;
create index if not exists idx_blueprint_lab_designs_deleted_at on blueprint_lab_designs (deleted_at) where deleted_at is not null;

-- The class-join flow now upserts on (class_id, student_id) so that
-- re-joining a class resurrects a tombstoned enrollment instead of erroring.
-- That upsert requires a unique constraint — dedupe first (keep the earliest
-- row per pair), then guarantee the index exists.
delete from enrollments e
 using enrollments e2
 where e.class_id = e2.class_id
   and e.student_id = e2.student_id
   and e.id > e2.id;

create unique index if not exists idx_enrollments_class_student
  on enrollments (class_id, student_id);

-- ─── 2. RLS: soft-deleted rows can never be exposed ──────────────────────────
-- All app access is service-role (bypasses RLS) and filters explicitly.
-- RLS stays enabled with NO permissive policies (deny-all for anon), and we
-- add a RESTRICTIVE policy per table so that even if someone adds a permissive
-- policy later, soft-deleted rows still cannot be selected.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','classes','enrollments','user_progress',
    'bridge_designs','bridge_submissions','turtle_submissions',
    'stem_sketch_designs','blueprint_lab_designs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists exclude_soft_deleted on %I', t);
    execute format(
      'create policy exclude_soft_deleted on %I as restrictive for select using (deleted_at is null)', t);
  end loop;
end $$;

-- ─── 3. Purge audit log ──────────────────────────────────────────────────────

create table if not exists retention_purge_log (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  purged  jsonb not null,   -- { "<table>": <rows hard-deleted>, ... }
  total   bigint not null
);
alter table retention_purge_log enable row level security;

-- ─── 4. Soft-delete cascade functions ────────────────────────────────────────
-- Id params are text and compared with `id::text` so the functions work
-- whether a table's pk is uuid or text (profiles.id is text; see 0002 notes).

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
end $$;

create or replace function soft_delete_enrollment(p_class_id text, p_student_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update enrollments set deleted_at = now()
    where class_id::text = p_class_id
      and student_id::text = p_student_id
      and deleted_at is null;
end $$;

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

  -- Security tokens: no retention value, remove immediately.
  delete from password_reset_tokens where user_id::text = p_user_id;
end $$;

-- ─── 5. Hard purge: permanently remove rows tombstoned > 30 days ago ─────────
-- Idempotent (re-running deletes nothing new) and defensive: when a profile
-- or class comes due, ALL of its dependent rows are swept in the same run
-- regardless of their own deleted_at, so no FK stragglers can survive.

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

-- Lock the functions down: service role / postgres only.
revoke all on function soft_delete_class(text)            from public, anon, authenticated;
revoke all on function soft_delete_enrollment(text, text) from public, anon, authenticated;
revoke all on function soft_delete_user(text)             from public, anon, authenticated;
revoke all on function purge_soft_deleted(interval)       from public, anon, authenticated;
