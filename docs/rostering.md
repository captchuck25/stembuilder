# Rostering v1 — OneRoster-shaped importer, CSV adapter (Phase 1, Milestone 4)

## The model (decided 2026-08-02): teacher-driven, admin-observed

- **Teachers own their classes and rosters.** From their dashboard: import
  their own Google Classroom, upload their own CSV, or just create a class
  and share its join code. Every class always has a join code — even fully
  rostered ones — so late arrivals can always join.
- **District admins own the org and observe.** They add teachers (Teachers
  tab: attach-or-invite by email), and they SEE everything — teachers,
  classes (however created — see the read-only Classes tab), students,
  usage, audit log, license. They do not enroll per-class; the admin bulk
  CSV upload remains available for the rare district-office roster export.
- **Membership follows the teacher** (migration 0016): a district teacher's
  classes are district classes and their enrolled students become district
  students, regardless of creation path. Students are never moved between
  districts, and `account_origin` (consent basis) is untouched.
- **One student account, many enrollments**: email/username matching links
  imports and code-joins to the same account, so a student's work carries
  across teachers. Username-only (no-email) accounts remain fully supported.

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

## Google Classroom adapter (shipped)

Roster tab → **Google Classroom sync**: connect a Google account, pick
courses, preview (dry run), confirm. Courses/rosters map into the same
`RosterData` shape (`lib/roster/google.ts`) and run through the same importer;
Google's course/user ids are the sourcedIds, so re-syncs add new students
without duplicating. Requires a Google Cloud OAuth app — full setup, scopes,
and env vars (`GOOGLE_CLASSROOM_CLIENT_ID/SECRET`) in
`docs/google-classroom-setup.md`. Until configured, the section shows
"Not configured" and everything else works normally.

## Teacher self-serve import (shipped)

District teachers (profile.district_id set) get a working "Import your
classes" panel on the teacher dashboard: connect their OWN Google Classroom
or upload a CSV (teacher template has no teacher_email column — every class
lands under the uploading teacher, enforced server-side in
`app/api/teacher/roster/*` via `lib/roster/teacher-guard.server.ts`).
Freemium teachers see the district-plan teaser instead. This is the intended
Google path: the Classroom API only lists courses the connected account
teaches, so admins can't sync on teachers' behalf — admins roster at scale
via CSV (`teacher_email` column decides ownership).

## Next

- **Clever**: "Log in with Clever" SSO is an ACCESS feature (separate from
  rostering). Paid Secure Sync rostering is deliberately out of scope for
  Phase 1; the importer's OneRoster shape leaves room for it later.
- **SIS / OneRoster API adapter** (Infinite Campus, PowerSchool, …): many
  SIS platforms won't hand teachers/admins a usable CSV export, but they DO
  speak the OneRoster API. District IT enables the connection; we pull
  orgs/classes/enrollments into the same `RosterData` shape. Zero importer
  rework — this is why the core is OneRoster-shaped.
