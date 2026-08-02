-- Membership follows the teacher (not the import path).
--
-- Before this migration only the roster importer stamped district_id /
-- school_id, so classes made with "+ New Class" and students who joined by
-- class code were invisible to the district console even when their teacher
-- belonged to a district. Now every creation path stamps org linkage:
--
--   teacher creates class      → class inherits the teacher's district/school
--                                (app: /api/teacher/classes POST)
--   student joins by code      → student inherits the class's district/school
--                                (RPC below for new accounts; app route for
--                                existing accounts — only when the student
--                                has no district yet, never cross-district)
--   roster importer            → already stamped
--
-- account_origin is untouched: a class-code joiner remains 'class_code'
-- (school-consent basis) regardless of district linkage.
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0015.

-- ─── 1. create_student_account: inherit the class's org linkage ──────────────
-- Same function as 0009 with district_id/school_id read from the class and
-- written onto the new profile.

create or replace function create_student_account(
  p_name          text,
  p_email         text,
  p_username      text,
  p_password_hash text,
  p_google_id     text,
  p_join_code     text,
  p_class_id      text,
  p_origin        text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id classes.id%type;
  v_district_id uuid;
  v_school_id uuid;
  v_student_id text;
begin
  if p_origin not in ('class_code', 'rostered') then
    raise exception 'bad_origin';
  end if;

  if p_origin = 'class_code' then
    select id, district_id, school_id into v_class_id, v_district_id, v_school_id from classes
      where upper(join_code) = upper(trim(p_join_code)) and deleted_at is null;
  else
    select id, district_id, school_id into v_class_id, v_district_id, v_school_id from classes
      where id::text = p_class_id and deleted_at is null;
  end if;

  if v_class_id is null then
    raise exception 'class_not_found';
  end if;

  insert into profiles (name, email, username, password_hash, google_id, role, account_origin, district_id, school_id)
    values (p_name, p_email, p_username, p_password_hash, p_google_id, 'student', p_origin, v_district_id, v_school_id)
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

-- ─── 2. Backfill: classes inherit their teacher's district ───────────────────

update classes c
   set district_id = p.district_id,
       school_id   = coalesce(c.school_id, p.school_id)
  from profiles p
 where p.id = c.teacher_id
   and p.district_id is not null
   and c.district_id is null;

-- ─── 3. Backfill: students inherit a district from their enrollments ─────────
-- Only students with NO district yet; first (oldest) district-linked live
-- enrollment wins. Never moves a student between districts.

update profiles s
   set district_id = sub.district_id,
       school_id   = coalesce(s.school_id, sub.school_id)
  from (
    select distinct on (e.student_id)
           e.student_id, c.district_id, c.school_id
      from enrollments e
      join classes c on c.id = e.class_id
     where e.deleted_at is null
       and c.deleted_at is null
       and c.district_id is not null
     order by e.student_id, e.enrolled_at asc
  ) sub
 where s.id = sub.student_id
   and s.role = 'student'
   and s.district_id is null
   and s.deleted_at is null;
