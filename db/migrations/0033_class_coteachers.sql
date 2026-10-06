-- Co-teachers: a second (third…) teacher attached to a class with the same
-- day-to-day view as the owner — students, assignments, submissions, grades,
-- shared STEM Sketch designs. The owner stays classes.teacher_id (unchanged);
-- co-teachers live here. Owner-only actions: deleting the class and managing
-- co-teachers.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0032.
-- Safe to deploy the app before running this: the access helper treats a
-- missing table as "no co-teachers".

create table if not exists class_teachers (
  id          bigint generated always as identity primary key,
  class_id    text not null,
  teacher_id  text not null references profiles(id) on delete cascade,
  added_by    text not null,              -- profiles.id of the owner who added them
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz                 -- removed from the class (kept for audit)
);

-- One live row per teacher per class.
create unique index if not exists idx_class_teachers_live
  on class_teachers (class_id, teacher_id) where deleted_at is null;
create index if not exists idx_class_teachers_teacher
  on class_teachers (teacher_id) where deleted_at is null;

alter table class_teachers enable row level security;  -- no policies: service-role only
revoke all on class_teachers from anon, authenticated;
