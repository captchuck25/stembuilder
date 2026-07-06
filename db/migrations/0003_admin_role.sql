-- Admin as a first-class role.
-- Replaces the old hardcoded-ID admin gate with a real profiles.role value.
-- 'district_admin' is included in the allowed set now so the future district
-- tier needs no further schema change — see lib/roles.ts.
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0002.

-- 1. Allow the new role values. If a CHECK constraint currently limits role to
--    teacher/student, replace it. (If your constraint has a non-default name and
--    the grant in step 2 fails with a check violation, drop that constraint by
--    name first, then re-run.)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles
  add constraint profiles_role_check
  check (role in ('student', 'teacher', 'district_admin', 'admin'));

-- 2. Grant yourself platform admin. Edit the email if needed, then run once.
update profiles set role = 'admin' where email = 'charlesagravina@gmail.com';
