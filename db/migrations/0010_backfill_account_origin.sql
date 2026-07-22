-- Backfill account_origin (and teacher email verification) for accounts that
-- predate migration 0009.
--
-- Run AFTER 0009, in two passes:
--   1. Run the REPORT queries alone and review the counts.
--   2. Run the BACKFILL statements.
--
-- Assignment logic for pre-0009 accounts:
--   * Student with >= 1 enrollment (live or tombstoned) -> 'class_code'.
--     Rostering did not exist before 0009, so every historical enrollment came
--     from a join code = school-consent basis.
--   * Student with 0 enrollments -> 'independent' (they signed up through the
--     old open email form). These are GRANDFATHERED: they predate the age
--     gate, so age_verified_13_plus stays NULL — the report lists them for
--     manual review (contactable ones have an email on file).
--   * Teachers/admins -> account_origin stays NULL (provenance is a student
--     concept). Existing teachers get email_verified_at = created_at so the
--     new create-class gate doesn't lock out accounts that were already
--     operating classes; only NEW teacher signups must click the link.

-- ─── REPORT ──────────────────────────────────────────────────────────────────

-- Accounts with no role (should be zero — role has been NOT NULL throughout).
select id, email, username, created_at
  from profiles
 where role is null;

-- Role x origin overview before backfill.
select role, account_origin, count(*)
  from profiles
 group by role, account_origin
 order by role, account_origin;

-- Students that will become 'class_code'.
select count(*) as will_be_class_code
  from profiles p
 where p.role = 'student' and p.account_origin is null
   and exists (select 1 from enrollments e where e.student_id = p.id);

-- Students that will become 'independent' — REVIEW THIS LIST. They were never
-- age-checked (legacy signup); rows with an email can be contacted, rows
-- without one are odd (username-only implies a class code) and deserve a look.
select id, email, username, name, created_at,
       (email is null) as odd_username_only_without_class
  from profiles p
 where p.role = 'student' and p.account_origin is null
   and not exists (select 1 from enrollments e where e.student_id = p.id)
 order by created_at;

-- Teachers lacking an affirmation record (all pre-0009 teachers). Affirmations
-- are only collected going forward; this list is the evidence gap.
select p.id, p.email, p.name, p.created_at
  from profiles p
 where p.role in ('teacher', 'district_admin', 'admin')
   and not exists (select 1 from teacher_affirmations a where a.user_id = p.id)
 order by p.created_at;

-- ─── BACKFILL ────────────────────────────────────────────────────────────────

-- Students with any enrollment history -> class_code.
update profiles p
   set account_origin = 'class_code'
 where p.role = 'student' and p.account_origin is null
   and exists (select 1 from enrollments e where e.student_id = p.id);

-- Remaining students -> independent (grandfathered, no age evidence).
update profiles p
   set account_origin = 'independent'
 where p.role = 'student' and p.account_origin is null;

-- Existing teachers: grandfather email verification (already operating).
update profiles
   set email_verified_at = created_at
 where role in ('teacher', 'district_admin', 'admin')
   and email_verified_at is null;

-- Post-check: every student must now have an origin (expect zero rows).
select count(*) as students_missing_origin
  from profiles
 where role = 'student' and account_origin is null;
