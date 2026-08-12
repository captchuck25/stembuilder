# StemBuilder — Data Retention & Deletion Procedure

**Effective:** July 2026 · **Applies to:** all student and teacher personal data on stembuilder.io

## What this covers

All personal data StemBuilder stores: teacher and student accounts, classes and
class rosters, and student work and progress across every tool (Bridge Builder,
Code Lab, Measurement Lab, STEM Sketch, Blueprint Lab, and related activities).

StemBuilder is built for minimal data collection by design: students who join
with a class code can use a username-only account that stores **no email
address and no contact information at all**.

## Who can request deletion

| Request | Who may make it |
|---|---|
| Delete a student from a class, or a student account | The student's teacher or school, or a StemBuilder administrator |
| Delete a class (roster and its submissions) | The teacher who owns the class, or a StemBuilder administrator |
| Delete a teacher account (and everything it owns) | The account owner, or a StemBuilder administrator |

Teachers and schools act on behalf of their students, consistent with COPPA's
school-consent model. Deletion requests can be made directly in the product or
by contacting us.

## The three stages of deletion

**Stage 1 — Immediate removal from the platform (Day 0).**
The moment a deletion is made, the data disappears from StemBuilder: it no
longer appears anywhere in the product, deleted accounts can no longer sign
in, and deleted class codes stop working. This is enforced in every database
query and backed by database-level row security.

**Stage 2 — 30-day recovery window (Days 0–30).**
For 30 days the data is retained in a quarantined, inaccessible state. This
exists solely to protect schools from accidental or malicious deletions — a
mistaken deletion can be fully reversed on request during this window. The
data is not used, shared, or visible to anyone during this period.

**Stage 3 — Permanent, automated erasure (Day 30).**
An automated process runs every day and permanently erases all data whose
30-day window has elapsed. This is not a manual step that someone must
remember — it is scheduled, redundant (two independent schedulers), and safe
to re-run.

## How we can prove it

Every purge run writes a timestamped audit record — which tables were purged
and how many records — to a dedicated audit log. On request, we can produce
this log to demonstrate that the deletion schedule executes as described.
The deletion mechanism itself is code, not policy: it is documented,
versioned, and reviewable.

## Backups

Any database backups maintained by our infrastructure provider (Supabase)
exist for disaster recovery only and are retained for a maximum of seven
days before expiring automatically. We never restore individual records from
backups. This means deleted data is permanently erased from live systems at
the end of the 30-day window, and any residual backup copy expires no more
than seven days later — so deleted data is unrecoverable everywhere no later
than 37 days after the deletion request.

## Timeline at a glance

| When | State of the data |
|---|---|
| Day 0 (deletion) | Invisible and inaccessible everywhere in the product; sign-in disabled |
| Days 0–30 | Held in quarantine; recoverable only by request |
| Day 30 | Permanently erased from live systems by the automated daily purge; erasure logged |
| ≤ Day 37 | Any residual backup copies have expired; data is unrecoverable everywhere |

## Questions

Contact: charlesagravina@gmail.com
