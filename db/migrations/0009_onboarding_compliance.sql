-- Onboarding compliance: account provenance, age-check evidence, teacher
-- affirmations, and teacher email verification.
--
-- Every student account must carry WHICH consent basis applies (COPPA):
--   'rostered'    — school/teacher provisioned the account  (school consent)
--   'class_code'  — student self-enrolled with a class code (school consent)
--   'independent' — no school authority; restricted to 13+  (age-gated)
-- Paths rostered/class_code never collect age. The independent path runs a
-- neutral age screen BEFORE account creation and stores only a verified-13+
-- boolean + timestamp — never the date of birth itself (data minimization).
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0008.

-- ─── 1. profiles: provenance + compliance evidence ───────────────────────────

alter table profiles add column if not exists account_origin text;
alter table profiles drop constraint if exists profiles_account_origin_check;
alter table profiles
  add constraint profiles_account_origin_check
  check (account_origin in ('rostered', 'class_code', 'independent'));
comment on column profiles.account_origin is
  'Consent basis for student accounts: rostered/class_code = school consent, independent = 13+ age-gated. NULL for teachers/admins.';

-- Independent path only: evidence the 13+ check passed, minus the DOB itself.
alter table profiles add column if not exists age_verified_13_plus boolean;
alter table profiles add column if not exists age_verified_at timestamptz;

-- Teachers must verify their email before creating classes (see /api/teacher/classes).
-- Google-created teacher accounts get this set immediately (Google verified the email).
alter table profiles add column if not exists email_verified_at timestamptz;

-- Role is now ALWAYS set explicitly at creation (signup flows, onboarding
-- completion, rostering RPC). No code path may rely on a default-to-student.
alter table profiles alter column role drop default;

-- ─── 2. Teacher affirmations (compliance evidence) ───────────────────────────
-- One row per affirmation event: the user affirmed they are an educator aged
-- 18+, authorized by their school to create classes and enroll students,
-- including any parental consent their school requires. terms_version pins
-- the exact wording that was affirmed.

create table if not exists teacher_affirmations (
  id            bigint generated always as identity primary key,
  user_id       text not null references profiles(id) on delete cascade,
  terms_version text not null,
  affirmed_at   timestamptz not null default now()
);
create index if not exists idx_teacher_affirmations_user on teacher_affirmations (user_id);
alter table teacher_affirmations enable row level security;  -- no policies: service-role only

-- ─── 3. Teacher email verification tokens ────────────────────────────────────
-- Same shape as password_reset_tokens: only the SHA-256 hash is stored.

create table if not exists email_verification_tokens (
  id         bigint generated always as identity primary key,
  user_id    text not null references profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_email_verification_tokens_user on email_verification_tokens (user_id);
alter table email_verification_tokens enable row level security;  -- no policies: service-role only

-- ─── 4. Atomic student creation (paths A and B) ──────────────────────────────
-- Profile + enrollment are created in ONE transaction, and the class is
-- re-validated inside that transaction, so an invalid/deleted class can never
-- leave an orphan account and a created account always has its enrollment.
--
--   class_code: p_join_code identifies the class (student self-enroll, path B)
--   rostered:   p_class_id identifies the class (teacher provisioning, path A —
--               the CALLER must verify the teacher owns that class)
--
-- Raised errors (mapped to friendly messages in the API layer):
--   class_not_found   — no live class for that code/id
--   identifier_taken  — username or email already claimed (unique violation)

create or replace function create_student_account(
  p_name          text,
  p_email         text,     -- null for username-only accounts
  p_username      text,     -- null for email/Google accounts
  p_password_hash text,     -- null for Google accounts
  p_google_id     text,     -- null for credentials accounts
  p_join_code     text,     -- path B
  p_class_id      text,     -- path A
  p_origin        text      -- 'class_code' | 'rostered'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id classes.id%type;
  v_student_id text;
begin
  if p_origin not in ('class_code', 'rostered') then
    raise exception 'bad_origin';
  end if;

  if p_origin = 'class_code' then
    select id into v_class_id from classes
      where upper(join_code) = upper(trim(p_join_code)) and deleted_at is null;
  else
    select id into v_class_id from classes
      where id::text = p_class_id and deleted_at is null;
  end if;

  if v_class_id is null then
    raise exception 'class_not_found';
  end if;

  insert into profiles (name, email, username, password_hash, google_id, role, account_origin)
    values (p_name, p_email, p_username, p_password_hash, p_google_id, 'student', p_origin)
    returning id into v_student_id;

  insert into enrollments (class_id, student_id)
    values (v_class_id, v_student_id);

  return v_student_id;
exception
  when unique_violation then
    raise exception 'identifier_taken';
end $$;

revoke all on function create_student_account(text, text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ─── 5. soft_delete_user: also sweep verification tokens ─────────────────────
-- Same rule as password_reset_tokens (0005): security tokens have no retention
-- value and are hard-deleted the moment the account is soft-deleted. This is
-- the 0005 function with that one extra DELETE; hard purge is covered by the
-- ON DELETE CASCADE on both token tables' FKs.

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
  delete from password_reset_tokens      where user_id::text = p_user_id;
  delete from email_verification_tokens  where user_id::text = p_user_id;
end $$;

revoke all on function soft_delete_user(text) from public, anon, authenticated;
