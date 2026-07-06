-- Teacher lead-gen details, collected at onboarding when a user picks "Teacher".
-- Used for sales follow-up / district outreach. All nullable — existing teachers
-- simply have blanks until they next pass through onboarding.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0003.

alter table profiles add column if not exists district      text;  -- school or district name
alter table profiles add column if not exists state         text;  -- US state
alter table profiles add column if not exists grade_levels  text;  -- e.g. "6, 7, 8"
alter table profiles add column if not exists content_area  text;  -- e.g. "Science, STEM"
