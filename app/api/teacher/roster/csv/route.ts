import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { writeAudit } from '@/lib/audit.server'
import { csvToRoster, CSV_TEMPLATE_TEACHER } from '@/lib/roster/csv'
import { applyRoster } from '@/lib/roster/import.server'
import { requireDistrictTeacher, isTeacherGuardError } from '@/lib/roster/teacher-guard.server'

// POST /api/teacher/roster/csv  { csv, dryRun? }
// Teacher self-serve CSV import (district-plan feature). No teacher_email
// column needed — EVERY class in the file belongs to the uploading teacher,
// enforced server-side regardless of what the file says. Same importer, same
// idempotency, same dry-run-first flow as the admin console.
export async function POST(req: NextRequest) {
  const ctx = await requireDistrictTeacher()
  if (isTeacherGuardError(ctx)) return ctx

  const body = await req.json().catch(() => null)
  const csv = typeof body?.csv === 'string' ? body.csv : ''
  const dryRun = body?.dryRun !== false
  if (!csv.trim()) return NextResponse.json({ error: 'No CSV content received' }, { status: 400 })
  if (csv.length > 2_000_000) return NextResponse.json({ error: 'File too large (2 MB max)' }, { status: 413 })

  const data = csvToRoster(csv, { defaultTeacherEmail: ctx.email })
  // Own classes only — a teacher_email column naming someone else is refused,
  // not silently reassigned.
  for (const c of data.classes) {
    if (c.teacherEmail !== ctx.email) {
      data.parseErrors.push({ message: `Class "${c.title}" names a different teacher (${c.teacherEmail}) — teachers can only import their own classes. Ask your district admin to roster for others.` })
    }
  }
  data.classes = data.classes.filter(c => c.teacherEmail === ctx.email)
  const validClassIds = new Set(data.classes.map(c => c.sourcedId))
  data.enrollments = data.enrollments.filter(e => validClassIds.has(e.classSourcedId))

  const summary = await applyRoster({
    db: adminDb(),
    districtId: ctx.districtId,
    defaultSchoolId: ctx.schoolId,
    data,
    dryRun,
  })
  for (const e of data.parseErrors) {
    summary.counts.errors++
    summary.results.push({ kind: 'student', key: `row:${e.row ?? '?'}`, label: e.row ? `Row ${e.row}` : 'File', action: 'error', message: e.message, row: e.row })
  }

  await adminDb().from('roster_imports').insert({
    district_id: ctx.districtId,
    school_id: ctx.schoolId,
    actor_id: ctx.userId,
    provider: 'csv',
    dry_run: dryRun,
    counts: summary.counts,
    report: summary.results,
  })
  if (!dryRun) {
    await writeAudit({
      actorId: ctx.userId, actorRole: ctx.role, action: 'roster.import',
      targetType: 'district', targetId: ctx.districtId, districtId: ctx.districtId,
      metadata: { provider: 'csv', selfServe: true, ...summary.counts },
    })
  }

  return NextResponse.json(summary)
}

// GET → the teacher CSV template.
export async function GET() {
  const ctx = await requireDistrictTeacher()
  if (isTeacherGuardError(ctx)) return ctx
  return new NextResponse(CSV_TEMPLATE_TEACHER, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="stembuilder-class-roster-template.csv"',
    },
  })
}
