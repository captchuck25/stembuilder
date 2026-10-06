-- STEM Sketch: a student shares a saved design with a CLASS (so the owner and
-- every co-teacher of that class see it), and teachers leave feedback on it.
-- The design itself is not copied: the share points at the student's live
-- design row, so the teacher always opens the current version read-only.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0033.

create table if not exists stem_sketch_shares (
  id               uuid primary key default gen_random_uuid(),
  design_id        text not null,            -- stem_sketch_designs.id (as text; no FK so the id type never matters)
  student_id       text not null references profiles(id) on delete cascade,
  class_id         text not null,
  note             text,                     -- what the student wants looked at
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  student_seen_at  timestamptz,              -- feedback newer than this is "new" for the student
  deleted_at       timestamptz               -- unshared
);

create unique index if not exists idx_stem_sketch_shares_live
  on stem_sketch_shares (design_id, class_id) where deleted_at is null;
create index if not exists idx_stem_sketch_shares_class
  on stem_sketch_shares (class_id) where deleted_at is null;
create index if not exists idx_stem_sketch_shares_student
  on stem_sketch_shares (student_id) where deleted_at is null;

create table if not exists stem_sketch_feedback (
  id          bigint generated always as identity primary key,
  share_id    uuid not null references stem_sketch_shares(id) on delete cascade,
  author_id   text not null references profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists idx_stem_sketch_feedback_share
  on stem_sketch_feedback (share_id) where deleted_at is null;

alter table stem_sketch_shares   enable row level security;  -- no policies: service-role only
alter table stem_sketch_feedback enable row level security;
revoke all on stem_sketch_shares   from anon, authenticated;
revoke all on stem_sketch_feedback from anon, authenticated;
