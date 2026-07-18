-- Give profiles.id a database-side default. Applied to prod 2026-07-18.
--
-- profiles.id is TEXT with no default — a Clerk leftover (Clerk generated
-- string IDs client-side). After Clerk's removal, every code path that
-- inserts a new profile (email register, student username register, new
-- Google sign-in) omitted id and failed with a not-null violation, so all
-- NEW account creation was broken. Existing rows kept their Clerk-era IDs.
--
-- UUIDs cast to text keep the column type unchanged (FKs elsewhere are text
-- to match — see db/migrations/0001).

alter table profiles
  alter column id set default (gen_random_uuid())::text;
