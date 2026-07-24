-- District teacher invites: closes the "how does a teacher get INTO a
-- district" gap. An admin adds a teacher by email on the district's Teachers
-- tab: an existing teacher account is attached immediately; an unknown email
-- gets a row here + an invite email, and the attachment happens automatically
-- the moment a teacher account with that exact email is created (credentials
-- or Google signup — see lib/teacher-invites.server.ts).
--
-- No token: the invite grants nothing beyond district membership as a plain
-- teacher, and it only applies to the account that proves control of the
-- email (teachers must verify email before creating classes; Google emails
-- arrive pre-verified).
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0013.

create table if not exists teacher_invites (
  id          bigint generated always as identity primary key,
  email       text not null,
  district_id uuid not null references districts(id) on delete cascade,
  school_id   uuid references schools(id) on delete set null,
  invited_by  text not null,           -- profiles.id of the admin who invited
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  claimed_by  text                     -- profiles.id of the account that claimed it
);

-- One live (unclaimed) invite per email+district.
create unique index if not exists idx_teacher_invites_pending
  on teacher_invites (email, district_id) where claimed_at is null;
create index if not exists idx_teacher_invites_email on teacher_invites (email);

alter table teacher_invites enable row level security;  -- no policies: service-role only
revoke all on teacher_invites from anon, authenticated;
