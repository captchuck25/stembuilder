-- Track when a profile's password last changed so existing JWT sessions can be
-- invalidated after a password reset (self-service or teacher-issued).
--
-- NextAuth uses stateless JWT sessions, so there is no server-side session row
-- to delete. Instead auth.ts periodically re-checks this column: any session
-- token issued BEFORE password_changed_at is rejected (bounded by the re-check
-- interval, ~5 minutes).
--
-- Run this once in the Supabase SQL editor (project: stembuilder).

alter table profiles
  add column if not exists password_changed_at timestamptz;

-- Left null for existing rows on purpose: null means "never changed since this
-- column existed", which invalidates nothing retroactively.
