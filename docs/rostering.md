# Rostering v1 — OneRoster-shaped importer, CSV adapter (Phase 1, Milestone 4)

Bulk-creates classes and student accounts for a district. Built around the
OneRoster data shape (classes, users, enrollments with stable `sourcedId`s)
behind a provider-agnostic interface, so Google Classroom — and later paid
Clever/ClassLink Secure Sync, both OneRoster-based — plug in as adapters
without touching the core.

**Access vs rostering:** this pipeline only answers "who is in which class."
How a student signs in (username/password today, Google, Clever SSO later) is
separate — a rostered account picks up Google sign-in automatically when the
emails match.

## Deploy checklist

1. Run `db/migrations/0013_rostering.sql` in the Supabase SQL editor
   (idempotent, safe to re-run). No new env vars.

## Using it (both consoles)

District page → **Roster upload** tab:

1. **Download the template** — columns:
   `class_name, teacher_email, first_name, last_name` + optional
   `email, username, school`. One row per student-per-class; a student in two
   classes appears on two rows. Header names are forgiving
   ("First Name", `first`, `given_name` all work), order-free.
2. **Choose the CSV** — the console immediately runs a **dry run**: full
   validation and a preview of exactly what will be created vs matched, plus
   row-numbered errors (bad emails, missing teacher accounts, conflicting
   class ownership). Nothing is written yet.
3. **Confirm import** — classes are created under their teachers (with the
   same default lesson locks as teacher-created classes), students are created
   with `account_origin='rostered'` (school-consent basis — no age gate) and
   enrolled atomically, linked to the district/school.
4. **Download the credentials CSV** — one-time list of new students'
   usernames/emails + temporary passwords for distribution. Never stored.

Teachers referenced in the CSV must already have accounts in the district
(add them via the Teachers tab / normal signup first).

## Idempotency

Re-uploading the same or an extended sheet never duplicates:

- classes/students remember their source (`roster_provider`,
  `roster_external_id` — the OneRoster sourcedId) — unique-indexed
- CSV sourcedIds are synthesized from natural keys (class: school+name;
  student: email → username → class+name), so they are stable across uploads
- unmatched-by-source students fall back to email/username matching, which
  also heals partially applied earlier runs and adopts existing solo accounts
  into the district (never across districts, never non-student accounts)
- enrollments upsert on (class, student) and resurrect soft-deleted ones

Every run (dry or real) is recorded in `roster_imports` (tenant-scoped RLS);
real imports also write an `admin_audit_log` entry (`roster.import`).

## Where things live

| Piece | Location |
|---|---|
| OneRoster-shaped types + provider contract | `lib/roster/types.ts` |
| CSV adapter (parser, header aliases, sourcedIds) | `lib/roster/csv.ts` |
| Importer core (idempotent apply, dry-run) | `lib/roster/import.server.ts` |
| Upload API (dry-run + import + template download) | `app/api/admin/districts/[id]/roster/csv` |
| Console UI | district page → Roster upload tab |
| Schema | `db/migrations/0013_rostering.sql` |
| Tests | `tests/roster-csv.test.ts` |

## Next adapters

- **Google Classroom**: OAuth connect (scopes `classroom.courses.readonly`,
  `classroom.rosters.readonly`) → map courses/rosters into the same
  `RosterData` shape → same importer. Needs a Google Cloud project with a
  verified consent screen (env vars + setup README ship with that milestone).
- **Clever**: "Log in with Clever" SSO is an ACCESS feature (separate from
  rostering). Paid Secure Sync rostering is deliberately out of scope for
  Phase 1; the importer's OneRoster shape leaves room for it later.
