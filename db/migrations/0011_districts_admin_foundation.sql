-- Districts / multi-tenant admin foundation (Phase 1, Milestone 1).
--
-- Introduces the org hierarchy (districts → schools), licensing/trials, the
-- admin audit log, district-admin invites, and — the security backbone —
-- tenant-scoped RLS policies.
--
-- How RLS enforcement works here (per-request signed JWT):
--   All existing app access uses the SERVICE ROLE key, which bypasses RLS.
--   Admin-console reads/writes instead go through a second Supabase client
--   (lib/tenant-db.server.ts) that presents a short-lived JWT we sign
--   server-side with the project's JWT secret. That JWT carries:
--     role        = 'authenticated'        (PostgREST maps to the PG role)
--     app_role    = 'admin' | 'district_admin'
--     district_id = the admin's district scope (null for platform admins)
--   The policies below read those claims, so a district_admin PHYSICALLY
--   cannot select another district's rows, regardless of app-code bugs.
--   Role/scope come from the NextAuth session (DB-backed), never the client.
--
-- Roles: 'admin' remains the stored top-tier value (granted in 0003; the UI
-- labels it "Super Admin"). 'district_admin' is already in the role check
-- constraint (0003); its scope is profiles.district_id.
--
-- Run this once in the Supabase SQL editor (project: stembuilder), after 0010.

-- ─── 1. Claim helper functions ───────────────────────────────────────────────

create or replace function public.app_role()
returns text language sql stable as
$$ select coalesce(auth.jwt() ->> 'app_role', '') $$;

create or replace function public.app_district_id()
returns uuid language sql stable as
$$ select nullif(auth.jwt() ->> 'district_id', '')::uuid $$;

-- ─── 2. Org hierarchy: districts and schools ─────────────────────────────────

create table if not exists districts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  state      text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_districts_deleted_at on districts (deleted_at) where deleted_at is not null;

create table if not exists schools (
  id          uuid primary key default gen_random_uuid(),
  district_id uuid not null references districts(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_schools_district on schools (district_id);
create index if not exists idx_schools_deleted_at on schools (deleted_at) where deleted_at is not null;

-- ─── 3. Licenses (trial / paid) ──────────────────────────────────────────────
-- Attached to a district; school_id reserved for per-school licensing later.
-- seats NULL = unlimited (trials). status is stored, refreshed by the app
-- (license_effective_status() gives the time-derived truth for display/gating).

create table if not exists licenses (
  id          uuid primary key default gen_random_uuid(),
  district_id uuid not null references districts(id) on delete cascade,
  school_id   uuid references schools(id) on delete cascade,
  type        text not null check (type in ('trial', 'paid')),
  seats       int,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  status      text not null default 'active' check (status in ('active', 'expiring', 'expired')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_licenses_district on licenses (district_id);

-- Time-derived status: 'expiring' inside the final 14 days, 'expired' past
-- ends_at, else 'active'. NULL ends_at never expires.
create or replace function license_effective_status(p_ends_at timestamptz)
returns text language sql immutable as
$$ select case
     when p_ends_at is null then 'active'
     when p_ends_at < now() then 'expired'
     when p_ends_at < now() + interval '14 days' then 'expiring'
     else 'active'
   end $$;

-- ─── 4. Org links on existing tables (NULLABLE — solo/freemium unaffected) ───

alter table profiles add column if not exists district_id uuid references districts(id);
alter table profiles add column if not exists school_id   uuid references schools(id);
create index if not exists idx_profiles_district on profiles (district_id) where district_id is not null;
create index if not exists idx_profiles_school   on profiles (school_id)   where school_id is not null;

alter table classes add column if not exists district_id uuid references districts(id);
alter table classes add column if not exists school_id   uuid references schools(id);
create index if not exists idx_classes_district on classes (district_id) where district_id is not null;
create index if not exists idx_classes_school   on classes (school_id)   where school_id is not null;

comment on column profiles.district_id is
  'Org scope. For district_admin this IS their admin scope; for teachers/students it is the tenant they belong to. NULL = solo/freemium account.';

-- ─── 5. Admin audit log ──────────────────────────────────────────────────────
-- Who did what to whom, when. Identifiers only — no unnecessary PII.
-- Written exclusively via the service role (lib/audit.server.ts); read via the
-- tenant client so district admins see only their district's log.

create table if not exists admin_audit_log (
  id          bigint generated always as identity primary key,
  actor_id    text not null,          -- profiles.id of the admin who acted
  actor_role  text not null,
  action      text not null,          -- e.g. 'district.create', 'admin.grant', 'user.delete'
  target_type text,                   -- 'district' | 'school' | 'profile' | 'class' | 'license' | ...
  target_id   text,
  district_id uuid,                   -- tenant the action touched (null = platform-level)
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audit_district on admin_audit_log (district_id, created_at desc);
create index if not exists idx_audit_created  on admin_audit_log (created_at desc);

-- ─── 6. District-admin invites ───────────────────────────────────────────────
-- Granting district_admin is invite-by-email + verification: accepting the
-- emailed token proves control of the address before the role is applied.
-- Token handling matches password_reset_tokens: only the SHA-256 hash stored.

create table if not exists district_admin_invites (
  id          bigint generated always as identity primary key,
  email       text not null,
  district_id uuid not null references districts(id) on delete cascade,
  invited_by  text not null,          -- profiles.id of the granting super admin
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_district_admin_invites_email on district_admin_invites (email);

-- ─── 7. RLS: tenant scoping (the security backbone) ──────────────────────────
-- New tables: RLS on. Policies below are PERMISSIVE grants to `authenticated`
-- (only our minted admin JWTs — Supabase Auth is not used, the anon key is
-- unused). Service-role access is unaffected.

alter table districts              enable row level security;
alter table schools                enable row level security;
alter table licenses               enable row level security;
alter table admin_audit_log        enable row level security;
alter table district_admin_invites enable row level security;  -- no policies: service-role only

-- Explicit grants (don't rely on default privileges): anon gets NOTHING on
-- the new tables; authenticated gets exactly what the policies then row-gate.
revoke all on districts, schools, licenses, admin_audit_log, district_admin_invites from anon;
revoke all on district_admin_invites from authenticated;
grant select on districts, schools, licenses, admin_audit_log to authenticated;
grant insert, update, delete on districts, schools, licenses to authenticated;

-- Districts: platform admin manages all; district_admin can read own only.
drop policy if exists districts_platform_admin on districts;
create policy districts_platform_admin on districts for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
drop policy if exists districts_own_read on districts;
create policy districts_own_read on districts for select to authenticated
  using (app_role() = 'district_admin' and id = app_district_id());

-- Schools: platform admin all; district_admin manages schools in own district.
drop policy if exists schools_platform_admin on schools;
create policy schools_platform_admin on schools for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
drop policy if exists schools_own_district on schools;
create policy schools_own_district on schools for all to authenticated
  using (app_role() = 'district_admin' and district_id = app_district_id())
  with check (app_role() = 'district_admin' and district_id = app_district_id());

-- Licenses: platform admin manages; district_admin can only READ their own
-- (a district can never edit its own seats/term).
drop policy if exists licenses_platform_admin on licenses;
create policy licenses_platform_admin on licenses for all to authenticated
  using (app_role() = 'admin') with check (app_role() = 'admin');
drop policy if exists licenses_own_read on licenses;
create policy licenses_own_read on licenses for select to authenticated
  using (app_role() = 'district_admin' and district_id = app_district_id());

-- Audit log: platform admin reads all; district_admin reads own district's.
-- No insert/update/delete policies — writes are service-role only.
drop policy if exists audit_platform_read on admin_audit_log;
create policy audit_platform_read on admin_audit_log for select to authenticated
  using (app_role() = 'admin');
drop policy if exists audit_own_district_read on admin_audit_log;
create policy audit_own_district_read on admin_audit_log for select to authenticated
  using (app_role() = 'district_admin' and district_id = app_district_id());

-- Existing tables (RLS already enabled in 0005 with a restrictive
-- exclude_soft_deleted policy and no permissive ones = deny-all).
-- Add tenant-scoped read access for the admin consoles. The restrictive
-- soft-delete policy still applies on top of everything granted here.

-- Profiles: read within scope.
drop policy if exists profiles_admin_tenant_read on profiles;
create policy profiles_admin_tenant_read on profiles for select to authenticated
  using (app_role() = 'admin'
     or (app_role() = 'district_admin' and district_id = app_district_id()));

-- Profiles: org-assignment updates within scope. Column-level grants below
-- make this update surface name/org columns ONLY — password_hash, role,
-- email, google_id are not updatable through the tenant client at all, so
-- there is no privilege-escalation or account-takeover path here.
drop policy if exists profiles_admin_tenant_update on profiles;
create policy profiles_admin_tenant_update on profiles for update to authenticated
  using (app_role() = 'admin'
     or (app_role() = 'district_admin' and district_id = app_district_id()))
  with check (app_role() = 'admin'
     or (app_role() = 'district_admin' and district_id = app_district_id()));

revoke insert, update, delete on profiles from authenticated;
grant update (name, district_id, school_id) on profiles to authenticated;

-- Classes: read within scope (mutations stay on teacher/service-role paths).
drop policy if exists classes_admin_tenant_read on classes;
create policy classes_admin_tenant_read on classes for select to authenticated
  using (app_role() = 'admin'
     or (app_role() = 'district_admin' and district_id = app_district_id()));
revoke insert, update, delete on classes from authenticated;

-- Enrollments: readable when their class is in scope.
drop policy if exists enrollments_admin_tenant_read on enrollments;
create policy enrollments_admin_tenant_read on enrollments for select to authenticated
  using (app_role() = 'admin'
     or (app_role() = 'district_admin' and exists (
           select 1 from classes c
            where c.id = enrollments.class_id
              and c.district_id = app_district_id())));
revoke insert, update, delete on enrollments from authenticated;

-- Usage data (tool activity counts in the consoles): read when the owning
-- profile is in scope.
drop policy if exists user_progress_admin_tenant_read on user_progress;
create policy user_progress_admin_tenant_read on user_progress for select to authenticated
  using (app_role() = 'admin'
     or (app_role() = 'district_admin' and exists (
           select 1 from profiles p
            where p.id = user_progress.user_id
              and p.district_id = app_district_id())));
revoke insert, update, delete on user_progress from authenticated;

-- Remaining student-work tables stay deny-all for authenticated (export flows
-- run through the service role after an explicit scope check + audit entry).

-- ─── 8. Bootstrap / escalation audit ─────────────────────────────────────────
-- The FIRST super admin was granted in 0003 (charlesagravina@gmail.com).
-- There is no self-service path to admin or district_admin: signup flows and
-- profile-update APIs never write `role`, and the tenant client cannot update
-- `role` at all (column grants above). Run this to verify exactly who holds
-- elevated roles — it should list only accounts you expect:

-- select id, email, name, role, district_id, created_at
--   from profiles
--  where role in ('admin', 'district_admin')
--    and deleted_at is null;
