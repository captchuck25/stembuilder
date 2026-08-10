-- 0020: Quiz Builder — teacher-authored quizzes over the lib/quiz-bank
-- curriculum banks (Electronics / Block Lab / Python), assigned to classes
-- with a time window, taken by students, results back to both sides.
--
-- Design notes (conventions follow 0015):
--  * teacher_id / student_id are TEXT referencing profiles(id) — profiles.id
--    is TEXT, not uuid. Never use uuid for profile FKs.
--  * class_id is TEXT with no FK on purpose (same as 0012/0015): assignments
--    are always reached through a live class the caller owns or is enrolled
--    in, so an orphaned row is inert.
--  * teacher_questions is the teacher's personal question library. Rows are
--    either authored from scratch or forked from a read-only curriculum bank
--    question (forked_from holds the bank id, e.g. 'elec-u0-b3'); the
--    curriculum bank itself lives in code (lib/quiz-bank/), never in the DB.
--    question jsonb: { question, options[4], answer, explanation,
--    blocksFigure?, topic, difficulty }.
--  * quizzes.questions is a FROZEN jsonb snapshot of the picked questions —
--    later edits to the bank or to teacher_questions never change an existing
--    quiz. unit_idxs int[] supports multi-unit quizzes (e.g. Units 1-3 review).
--  * quiz_assignments is class-scoped CONFIG (no personal data): no
--    deleted_at, hard-deleted with its class at purge time — same policy as
--    measurement_assignments. opens_at/closes_at are the take window,
--    ENFORCED SERVER-SIDE on attempt submit (null = no bound on that side).
--    config jsonb: { attemptsAllowed (default 1), timerSeconds (int|null),
--    passThreshold (int %), revealMode ('after_close'|'after_submit'|'never') }.
--  * quiz_attempts is append-only student work (answers jsonb = array of
--    chosen option indexes, per-question, in the quiz's question order):
--    soft-deleted via deleted_at + wired into the retention purge.
--  * teacher_questions / quizzes are teacher-owned data: soft-deleted when
--    the teacher account is soft-deleted, purged with it. A quiz soft-deleted
--    by its owner leaves its past assignments/attempts readable until purge
--    (grades outlive the quiz being retired) — the API filters on
--    quizzes.deleted_at for anything forward-looking.
--  * RLS enabled with no permissive policies: all access is via the service
--    role (hard-blocks the anon key). Tables with deleted_at also get the
--    restrictive exclude_soft_deleted policy from 0005 §2.
--  * Plan gating (pro / pro_trial / district) happens in the API layer via
--    lib/plan.ts includesQuizBuilder — nothing to enforce here.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0019 and
-- BEFORE deploying the quiz-builder app code (M2+ API routes need these
-- tables). Note: the migration folder has two 0016_* files; highest applied
-- prefix is 0019 and this is the next.

-- ─── 1. Tables ───────────────────────────────────────────────────────────────

create table if not exists teacher_questions (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null references profiles(id) on delete cascade,
  lab text not null check (lab in ('electronics-lab','block-lab','code-lab-python')),
  unit_idx int not null check (unit_idx >= 0),
  -- { question, options[4], answer (0-3), explanation, blocksFigure?, topic, difficulty (1-3) }
  question jsonb not null,
  forked_from text,   -- curriculum bank id this was forked from, null if authored from scratch
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_teacher_questions_owner on teacher_questions (teacher_id, lab, unit_idx);
create index if not exists idx_teacher_questions_deleted_at on teacher_questions (deleted_at) where deleted_at is not null;

create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null references profiles(id) on delete cascade,
  title text not null default 'Quiz',
  lab text not null check (lab in ('electronics-lab','block-lab','code-lab-python')),
  unit_idxs int[] not null default '{}',
  -- Frozen snapshot: [{ id?, question, options[4], answer, explanation, blocksFigure?, topic, difficulty }]
  questions jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_quizzes_owner on quizzes (teacher_id);
create index if not exists idx_quizzes_deleted_at on quizzes (deleted_at) where deleted_at is not null;

create table if not exists quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references quizzes(id) on delete cascade,
  class_id text not null,
  teacher_id text not null references profiles(id) on delete cascade,
  opens_at timestamptz,
  closes_at timestamptz,
  -- { attemptsAllowed, timerSeconds (int|null), passThreshold, revealMode }
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_quiz_assignments_class on quiz_assignments (class_id);
create index if not exists idx_quiz_assignments_quiz on quiz_assignments (quiz_id);

create table if not exists quiz_attempts (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references quiz_assignments(id) on delete cascade,
  student_id text not null references profiles(id) on delete cascade,
  answers jsonb not null,   -- chosen option index per question, quiz order
  score int not null check (score >= 0),
  total int not null check (total > 0),
  duration_s int,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_quiz_attempts_assign on quiz_attempts (assignment_id, student_id);
create index if not exists idx_quiz_attempts_deleted_at on quiz_attempts (deleted_at) where deleted_at is not null;

-- ─── 2. RLS ──────────────────────────────────────────────────────────────────

alter table quiz_assignments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['teacher_questions','quizzes','quiz_attempts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists exclude_soft_deleted on %I', t);
    execute format(
      'create policy exclude_soft_deleted on %I as restrictive for select using (deleted_at is null)', t);
  end loop;
end $$;

-- ─── 3. soft_delete_class: also tombstone this class's quiz attempts ─────────
-- 0015 body + the quiz_attempts update.

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
end $$;

-- ─── 4. soft_delete_user: also tombstone quiz work + teacher quiz content ────
-- 0015 body (which kept 0009's email_verification_tokens delete — do not
-- regress it) plus three quiz updates: attempts (student side), quizzes and
-- teacher_questions (teacher side). The teacher's quiz_assignments are
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

  -- Security tokens: no retention value, remove immediately.
  delete from password_reset_tokens      where user_id::text = p_user_id;
  delete from email_verification_tokens  where user_id::text = p_user_id;
end $$;

-- ─── 5. purge_soft_deleted: sweep the new tables ─────────────────────────────
-- 0015 body with four additions, children first: quiz_attempts (references
-- quiz_assignments), then quiz_assignments riding along with purged classes
-- in the class-scoped-config section, then quizzes and teacher_questions
-- (teacher-owned; deleting a quiz cascades any assignments that pointed at it,
-- whose attempts were already swept above or cascade with them).

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
-- preserves grants, but re-revoking is belt-and-braces — 0009/0015 precedent).
revoke all on function soft_delete_class(text)      from public, anon, authenticated;
revoke all on function soft_delete_user(text)       from public, anon, authenticated;
revoke all on function purge_soft_deleted(interval) from public, anon, authenticated;
