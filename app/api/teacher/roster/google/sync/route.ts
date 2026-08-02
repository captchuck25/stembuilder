import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { writeAudit } from '@/lib/audit.server'
import { applyRoster } from '@/lib/roster/import.server'
import {
  listCourses, listStudents, mapGoogleToRoster,
  GoogleAuthError, GC_COOKIE, type GoogleCourseRoster,
} from '@/lib/roster/google'
import { requireDistrictTeacher, isTeacherGuardError } from '@/lib/roster/teacher-guard.server'

// POST /api/teacher/roster/google/sync  { courseIds: string[], dryRun? }
// Teacher self-serve Google Classroom sync. The courses come from the
// teacher's OWN Google connection and the classes always land under the
// teacher's OWN StemBuilder account (their district/school context) — no
// owner-email lookup, no cross-teacher import. Same shared importer.
export async function POST(req: NextRequest) {
  const ctx = await requireDistrictTeacher()
  if (isTeacherGuardError(ctx)) return ctx

  const body = await req.json().catch(() => null)
  const courseIds: string[] = Array.isArray(body?.courseIds) ? body.courseIds.map(String) : []
  const dryRun = body?.dryRun !== false
  if (courseIds.length === 0) {
    return NextResponse.json({ error: 'courseIds are required' }, { status: 400 })
  }

  const token = req.cookies.get(GC_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Not connected', code: 'reconnect' }, { status: 401 })

  try {
    const wanted = new Set(courseIds)
    const courses = (await listCourses(token)).filter(c => wanted.has(c.id))
    if (courses.length === 0) return NextResponse.json({ error: 'No matching courses found' }, { status: 404 })

    const rosters: GoogleCourseRoster[] = []
    for (const course of courses) {
      rosters.push({
        course,
        ownerEmail: ctx.email, // always the importing teacher
        students: await listStudents(token, course.id),
      })
    }

    const data = mapGoogleToRoster(rosters)
    const summary = await applyRoster({
      db: adminDb(),
      districtId: ctx.districtId,
      defaultSchoolId: ctx.schoolId,
      data,
      dryRun,
    })
    for (const e of data.parseErrors) {
      summary.counts.errors++
      summary.results.push({ kind: 'student', key: 'google', label: 'Google Classroom', action: 'error', message: e.message })
    }

    await adminDb().from('roster_imports').insert({
      district_id: ctx.districtId,
      school_id: ctx.schoolId,
      actor_id: ctx.userId,
      provider: 'google_classroom',
      dry_run: dryRun,
      counts: summary.counts,
      report: summary.results,
    })
    if (!dryRun) {
      await writeAudit({
        actorId: ctx.userId, actorRole: ctx.role, action: 'roster.import',
        targetType: 'district', targetId: ctx.districtId, districtId: ctx.districtId,
        metadata: { provider: 'google_classroom', selfServe: true, courses: courses.length, ...summary.counts },
      })
    }

    return NextResponse.json(summary)
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json({ error: e.message, code: 'reconnect' }, { status: 401 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
