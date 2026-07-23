# Multi-tenant admin foundation — districts, roles, RLS (Phase 1, Milestones 1–3)

This ships the org hierarchy and security backbone for running full district
trials: districts & schools as real entities, an enforced Super Admin
(platform) role, a delegated District Admin role scoped to one district,
licensing/trials, tenant isolation at the Postgres RLS layer, both admin
consoles, and an admin audit log.

**Not in this drop (next milestones):** rostering (CSV + Google Classroom via
the OneRoster-shaped importer), Clever SSO, MFA for admins.

## Deploy checklist

1. **Run the migration**: paste `db/migrations/0011_districts_admin_foundation.sql`
   into the Supabase SQL editor (project: stembuilder) and run it once.
   It is idempotent (safe to re-run).
2. **Add one env var** — locally in `.env.local` and in Vercel (all envs):
   - `SUPABASE_JWT_SECRET` — Supabase dashboard → Project Settings → API →
     **JWT Settings → JWT Secret**. This lets the server mint the short-lived
     tenant JWTs that RLS policies verify. Without it, admin console requests
     fail fast with a clear error; nothing else on the site is affected.
3. **Verify the admin roster** (bootstrap audit — should list only you):
   ```sql
   select id, email, name, role, district_id, created_at
     from profiles
    where role in ('admin', 'district_admin')
      and deleted_at is null;
   ```
   The first super admin was granted in migration 0003
   (`charlesagravina@gmail.com`, stored role `admin`, displayed "Super Admin").
   There is deliberately **no** self-service path to either admin role — no
   signup flow or profile API writes `role`, and the tenant client cannot
   update the `role` column at all (column-level grant).
4. **Run the RLS proof** (after 1 & 2):
   ```
   npm test
   ```
   `tests/rls-tenant-isolation.test.ts` creates two throwaway districts and
   proves, against the live database, that a district admin cannot read or
   write the other district's schools, teachers, students, license, or
   classes; cannot escalate roles; and that the bare anon key sees nothing.
   It cleans up after itself and skips when env vars are missing.

## How enforcement works (per-request signed JWT)

Regular app traffic still uses the service-role key (bypasses RLS, filters in
code) — unchanged. Admin-console traffic goes through a second path:

```
request → requireAdmin()  (lib/admin-guard.server.ts)
            ├─ re-reads the caller's profile row (role + district_id from the
            │  DB on EVERY request — never from client input)
            ├─ refuses non-admins (401/403), unverified emails, scopeless
            │  district admins
            └─ mints a 2-minute JWT (lib/tenant-db.server.ts) with claims
               app_role + district_id, signed with SUPABASE_JWT_SECRET
                  → Supabase client whose queries run as `authenticated`
                  → RLS policies (migration 0011) row-filter by those claims
```

So a `district_admin` is boxed in twice: the guard scopes what routes will do,
and Postgres itself refuses cross-district rows even if a query forgets a
filter. Deletion/export still use the service role (they touch many tables),
but only after an explicit scope check, and both are audit-logged.

Sessions refresh role/scope from the DB every 5 minutes (auth.ts), so
granting or revoking an admin takes effect within minutes, without re-login.

## What's where

| Piece | Location |
|---|---|
| Schema + RLS policies | `db/migrations/0011_districts_admin_foundation.sql` |
| Role ladder (`admin` = Super Admin, `district_admin`) | `lib/roles.ts` |
| Shared server guard (all `/api/admin/*`) | `lib/admin-guard.server.ts` |
| Tenant JWT + client | `lib/tenant-db.server.ts` |
| Audit writer | `lib/audit.server.ts` |
| License/trial status helpers | `lib/license.server.ts` |
| Districts APIs (CRUD, license, admins, users) | `app/api/admin/districts/…` |
| Schools APIs | `app/api/admin/schools/…` |
| Invite acceptance (public, token-gated) | `app/api/admin/invite/accept` |
| Org assignment / delete / export per user | `app/api/admin/users/[id]/…` |
| Global search, audit read | `app/api/admin/search`, `app/api/admin/audit` |
| Super-admin console | `/admin` (stats) + `/admin/districts` (drill-down) |
| District-admin console | same pages, auto-scoped + redirected to their district |
| Invite accept page | `/admin/invite?token=…` |
| Tests | `tests/` (`npm test`) |

## Console flows

- **Provision a district trial**: `/admin/districts` → *Add district* → on the
  district page, *Start trial / license* (type/seats/end date) → *Invite
  district admin* (email). The invite link (7-day expiry, single-use, hash-at-
  rest like password resets) elevates an existing account or creates a new one
  — accepting proves control of the email, which also satisfies the
  verified-email requirement for admin access.
- **District admin experience**: signing in and visiting `/admin` lands on
  their district page. They manage schools, view teachers/students (with
  `account_origin` shown per student), delete users (30-day soft delete —
  reuses the existing retention system), export a user's data (JSON), and see
  their district's audit log. They never see other districts — RLS-proven.
- **Trial gating**: expiring (≤14 days) and expired states are flagged in both
  consoles. Hard end-of-trial behavior (block/convert/data return) is a
  deliberate hook in `lib/license.server.ts` (`effectiveStatus === 'expired'`)
  for a later milestone.

## Audit log

Every admin mutation writes to `admin_audit_log` (who, what, target, district,
when — ids only, no PII payloads): district/school create-update-delete,
license changes, invites/grants/revocations, org assignment, user deletion,
and data export (viewing a student's full data is itself a logged action).
District admins can read only their own district's log; the platform admin
reads all of it. Writes are service-role-only (the tenant client has no insert
grant), so an admin cannot forge or delete audit rows.
