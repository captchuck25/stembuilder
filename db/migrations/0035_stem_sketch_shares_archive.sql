-- Teacher inbox for shared STEM Sketch designs: a share can be archived once
-- it's been handled, so the class page's "Shared with you" list stays short.
-- Archiving is per CLASS (owner and co-teachers share one inbox) and does not
-- change anything the student sees.
--
-- Run once in the Supabase SQL editor (project: stembuilder), after 0034.
-- Safe to deploy the app first: the list route falls back to "nothing
-- archived" while the column is missing.

alter table stem_sketch_shares
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;   -- profiles.id of the teacher who archived it

create index if not exists idx_stem_sketch_shares_class_inbox
  on stem_sketch_shares (class_id, archived_at) where deleted_at is null;
