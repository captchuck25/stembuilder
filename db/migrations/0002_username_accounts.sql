-- Username-only student accounts.
-- Students who join a class with a code can create an account with just a
-- username + password (no email at all) — the strongest COPPA/FERPA posture,
-- since we collect no email/PII for minors.
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0001.

-- 1. Add the username column (globally unique, case-insensitive).
alter table profiles add column if not exists username text;

create unique index if not exists idx_profiles_username_lower
  on profiles (lower(username))
  where username is not null;

-- 2. Email is no longer mandatory — username students have none.
--    (Postgres allows many NULLs under a unique index, so any existing unique
--     constraint on email keeps working for the accounts that do have one.)
alter table profiles alter column email drop not null;
