-- Rostering v1 (Phase 1, Milestone 4): OneRoster-shaped importer support.
--
-- The importer (lib/roster/) consumes a provider-agnostic, OneRoster-shaped
-- payload (classes, users, enrollments with stable sourcedIds). CSV upload is
-- the first adapter; Google Classroom is next; Clever/ClassLink Secure Sync
-- (both OneRoster-based) can be added later without reworking the core.
--
-- Idempotency anchor: every rostered class/student remembers WHICH provider
-- and WHICH external id (OneRoster sourcedId) it came from, so re-uploads and
-- re-syncs match existing rows instead of duplicating them.
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0012.

-- ─── 1. Roster link columns ──────────────────────────────────────────────────

alter table classes  add column if not exists roster_provider    text;
alter table classes  add column if not exists roster_external_id text;
alter table profiles add column if not exists roster_provider    text;
alter table profiles add column if not exists roster_external_id text;

-- One internal row per (provider, external id). Partial: solo/manual rows
-- (NULLs) are unaffected.
create unique index if not exists idx_classes_roster_link
  on classes (roster_provider, roster_external_id)
  where roster_provider is not null and roster_external_id is not null;
create unique index if not exists idx_profiles_roster_link
  on profiles (roster_provider, roster_external_id)
  where roster_provider is not null and roster_external_id is not null;

comment on column profiles.roster_external_id is
  'Stable external id (OneRoster sourcedId / CSV natural key) this account was rostered from. Pairs with roster_provider.';

-- ─── 2. Import history ───────────────────────────────────────────────────────
-- One row per import run (including dry runs), with the full row-level report
-- the admin saw. Written by the service role only; read tenant-scoped.

create table if not exists roster_imports (
  id          bigint generated always as identity primary key,
  district_id uuid not null references districts(id) on delete cascade,
  school_id   uuid references schools(id) on delete set null,
  actor_id    text not null,
  provider    text not null,               -- 'csv' | 'google_classroom' | ...
  dry_run     boolean not null default false,
  counts      jsonb not null default '{}'::jsonb,  -- { classesCreated, studentsCreated, ... }
  report      jsonb not null default '[]'::jsonb,  -- row-level results
  created_at  timestamptz not null default now()
);
create index if not exists idx_roster_imports_district on roster_imports (district_id, created_at desc);

alter table roster_imports enable row level security;
revoke all on roster_imports from anon;
revoke insert, update, delete on roster_imports from authenticated;
grant select on roster_imports to authenticated;

drop policy if exists roster_imports_platform_read on roster_imports;
create policy roster_imports_platform_read on roster_imports for select to authenticated
  using (app_role() = 'admin');
drop policy if exists roster_imports_own_district_read on roster_imports;
create policy roster_imports_own_district_read on roster_imports for select to authenticated
  using (app_role() = 'district_admin' and district_id = app_district_id());
