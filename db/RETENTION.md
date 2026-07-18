# Data retention & deletion (30-day window)

Our Privacy Policy promises that deleted student/teacher data is permanently
removed within 30 days. This is enforced in code, in two stages:

## Stage 1 — soft delete (instant invisibility)

Every deletion action in the app (admin deletes a user/class, teacher deletes
a class or removes a student, student deletes a saved design, or a request via
`POST /api/deletion-request`) sets `deleted_at = now()` instead of removing
rows, cascading to dependent rows:

- **account** → profile + (teachers) every class they own, + enrollments,
  progress, and all saved work (bridge/turtle/stem-sketch/blueprint), and the
  account's password-reset tokens are hard-deleted immediately.
- **class** → the class, its enrollments, and its assignments' submissions.
  Class config (assignments/lesson locks) is left in place — it is unreachable
  once the class is hidden, and keeping it makes a restore complete.

Cascades run atomically in SQL functions (`soft_delete_user`,
`soft_delete_class`, `soft_delete_enrollment` — see
`db/migrations/0005_soft_delete_retention.sql`).

Soft-deleted rows are excluded from **every** app query
(`.is('deleted_at', null)`), soft-deleted accounts cannot sign in (password or
Google) or reset passwords, and each table carries a **restrictive** RLS
policy (`deleted_at is null`) so soft-deleted rows can never be selected even
if permissive policies are added later. During the 30-day grace period a row
is recoverable by clearing the tombstone in the Supabase SQL editor:

```sql
-- restore an account (repeat the pattern for its cascaded tables, matching deleted_at)
update profiles set deleted_at = null where id = '<id>';
```

## Stage 2 — hard purge (permanent removal after 30 days)

`purge_soft_deleted()` permanently deletes every row with
`deleted_at < now() - interval '30 days'`, sweeps all dependents of purged
profiles/classes (FK-safe order, so re-running is always safe/idempotent), and
appends per-table counts to `retention_purge_log`.

It is scheduled twice — both paths call the same function and double-running
purges nothing extra:

1. **Supabase pg_cron** (primary): `db/migrations/0006_pg_cron_purge.sql`
   schedules `purge-soft-deleted` daily at 03:17 UTC. Run history:
   `select * from cron.job_run_details order by start_time desc;`
2. **Vercel cron** (fallback / belt-and-suspenders): `vercel.json` hits
   `GET /api/cron/purge` daily at 03:45 UTC, guarded by the `CRON_SECRET`
   env var (Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically).
   Set `CRON_SECRET` in the Vercel project env — the route refuses to run
   without it.

Audit what was purged and when:

```sql
select ran_at, total, purged from retention_purge_log order by ran_at desc;
```

## Verified data inventory (audited 2026-07-18)

Live-schema audit of every table, confirming nothing personal sits outside
the soft-delete set:

- `assignments`, `lesson_locks`, `turtle_assignments`: **class-level config
  only** (class_id, tool, level/challenge indexes) — no student or teacher
  identifiers. Locks are per class, not per student.
- `bridge_assignments` carries a `teacher_id`, but it is always the owner of
  the class, and the purge deletes a purged teacher's bridge_assignments
  (via the defensive class sweep) *before* their profile — no teacher
  identifier outlives the teacher.
- No other table in the schema has user/student/email-bearing columns.

## Who can request deletion (`POST /api/deletion-request`)

| Target  | Allowed requester                                             |
|---------|---------------------------------------------------------------|
| class   | admin, or the teacher who owns it                              |
| student | admin, or a teacher sharing a class with that student          |
| account | admin, or the account owner (teacher self-delete)              |

Admin accounts can never be targets; teachers can never delete other
teachers; students route deletion requests through their teacher/school
(COPPA). Requests for already-deleted targets 404 (no oracle).

## Session invalidation for deleted accounts

Soft-deleted accounts cannot sign in (password or Google) or reset a
password. Sessions that were *already open* at deletion time are killed by
the JWT revalidation in `auth.ts` (checks `deleted_at` +
`password_changed_at` every ≤5 min) — shipped with the password-reset
hardening; requires migration `0007_password_changed_at.sql`. Until that is
deployed, a pre-existing session could keep using the app for up to its
30-day token life — invisible to everyone else, and everything they touch is
still swept by the day-30 purge regardless.

## The procurement / NDPA answer

When a district asks "how do you guarantee deletion?":
deletion triggers a 30-day recoverable soft-delete window enforced in every
query and by restrictive RLS; an automated nightly purge permanently erases
expired data; every purge is recorded with per-table counts in
`retention_purge_log` (auditable with plain SQL); and database backups
expire separately on a fixed ~7-day rotation. Mechanism documented here,
audit trail queryable on demand.

## Backups age out separately

The purge removes data from the **live database only**. Copies also exist in
Supabase's automated backups, and those are not touched by our job — they age
out on Supabase's own rotation (daily backups are retained for 7 days on Pro;
with PITR, the WAL/backup window is whatever the project is configured for).
Practical consequence: after a hard purge, deleted data can persist in
Supabase backups for up to the backup-retention window (~7 more days) before
it is gone everywhere. Backups are only restorable by project admins as a
whole-database restore; we never restore individual user data from them. So
the worst-case end-to-end lifetime of deleted data is
**30 days (grace) + the backup-retention window**, which is what the Privacy
Policy's "within 30 days of deletion, removed from active systems; backup
copies expire on a fixed rotation" language reflects.

## Setup checklist (new environment)

1. Run `db/migrations/0005_soft_delete_retention.sql` in the Supabase SQL editor.
2. Run `db/migrations/0006_pg_cron_purge.sql` (enable the `pg_cron` extension
   in Database → Extensions first if needed).
3. Set `CRON_SECRET` in Vercel env vars (any long random string).
4. Verify: soft-delete a test class, confirm it vanishes from the app, then
   `select purge_soft_deleted(interval '0 days');` in SQL editor and confirm
   `retention_purge_log` shows the rows going away. (Passing `'0 days'` purges
   immediately — only do this with test data.)
