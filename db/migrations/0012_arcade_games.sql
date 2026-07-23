-- 0011: Class Arcade — published student games + per-player best-time runs.
--
-- Design notes:
--  * owner_id / player_id are TEXT referencing profiles(id) — profiles.id is
--    TEXT, not uuid (see 0002 notes). Never use uuid for profile FKs.
--  * class_id is TEXT with no FK on purpose: it stores classes.id as text so
--    this migration doesn't couple to that table's key type. Games are always
--    looked up through live enrollments/classes, so an orphaned row is inert.
--  * One published game ("arcade cabinet") per student per class — publishing
--    again REPLACES the game and clears its leaderboard (old times would be
--    unfair on a changed level).
--  * Takedown (teacher/owner) is a HARD delete: the published row is only a
--    snapshot; the student's editable draft lives in user_progress and is
--    covered by the existing retention system.
--  * RLS enabled with no policies: all access is via the service role, so
--    this simply hard-blocks the anon key (same hardening as other tables).

create table if not exists arcade_games (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references profiles(id) on delete cascade,
  class_id text not null,
  title text not null default 'My Arcade Game',
  data jsonb not null,
  bot jsonb,
  plays integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, class_id)
);

create index if not exists idx_arcade_games_class on arcade_games (class_id);

create table if not exists arcade_runs (
  id bigint generated always as identity primary key,
  game_id uuid not null references arcade_games(id) on delete cascade,
  player_id text not null references profiles(id) on delete cascade,
  best_ms integer not null check (best_ms > 0),
  updated_at timestamptz not null default now(),
  unique (game_id, player_id)
);

create index if not exists idx_arcade_runs_game on arcade_runs (game_id, best_ms);

alter table arcade_games enable row level security;
alter table arcade_runs enable row level security;
