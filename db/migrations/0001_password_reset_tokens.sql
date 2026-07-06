-- Password reset tokens for self-service ("Forgot password?") flow.
-- Applies to email/password accounts only; Google-only accounts have no
-- password to reset and never get a row here.
--
-- Run this once in the Supabase SQL editor (project: stembuilder).
-- We store only a SHA-256 hash of the token, never the raw token, so a
-- leaked table cannot be used to reset anyone's password.

-- NOTE: user_id is TEXT (not uuid) because profiles.id is text — a holdover
-- from the Clerk migration (Clerk IDs were strings). The FK type must match.
create table if not exists password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references profiles(id) on delete cascade,
  token_hash  text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_prt_token_hash on password_reset_tokens (token_hash);
create index if not exists idx_prt_user       on password_reset_tokens (user_id);
