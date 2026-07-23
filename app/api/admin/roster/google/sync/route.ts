import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { adminDb } from '@/lib/db.server'
import { applyRoster } from '@/lib/roster/import.server'
import {
  listCourses, listStudents, getUserEmail, mapGoogleToRoster,
  GoogleAuthError, GC_COOKIE, type GoogleCourseRoster,
} from '@/lib/roster/google'

// POST /api/admin/roster/google/sync
// { districtId, courseIds: string[], dryRun?: boolean }
//
// Pulls the selected courses + rosters from Google Classroom, maps them into
// the shared OneRoster shape, and runs the SAME importer as the CSV path —
// idempotent re-sync for free (Google ids are the sourcedIds: new students
// are added, existing ones matched, nothing clobbered).
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const body = await req.json().catch(() => null)
  const districtId = typeof body?.districtId === 'string' ? body.districtId : ''
  const courseIds: string[] = Array.isArray(body?.courseIds) ? body.courseIds.map(String) : []
  const dryRun = body?.dryRun !== false
  if (!districtId || courseIds.length === 0) {
    return NextResponse.json({ error: 'districtId and courseIds are required' }, { status: 400 })
  }
  if (ctx.role === 'district_admin' && ctx.districtId !== districtId) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }
  const { data: district } = await adminDb().from('districts').select('id')
    .eq('id', districtId).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  const token = req.cookies.get(GC_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Not connected', code: 'reconnect' }, { status: 401 })

  try {
    const wanted = new Set(courseIds)
    const courses = (await listCourses(token)).filter(c => wanted.has(c.id))
    if (courses.length === 0) return NextResponse.json({ error: 'No matching courses found' }, { status: 404 })

    const ownerEmailCache = new Map<string, string | null>()
    const rosters: GoogleCourseRoster[] = []
    for (const course of courses) {
      if (!ownerEmailCache.has(course.ownerId)) {
        ownerEmailCache.set(course.ownerId, await getUserEmail(token, course.ownerId))
      }
      rosters.push({
        course,
        ownerEmail: ownerEmailCache.get(course.ownerId) ?? null,
        students: await listStudents(token, course.id),
      })
    }

    const data = mapGoogleToRoster(rosters)
    const summary = await applyRoster({ db: adminDb(), districtId, data, dryRun })

    for (const e of data.parseErrors) {
      summary.counts.errors++
      summary.results.push({ kind: 'student', key: 'google', label: 'Google Classroom', action: 'error', message: e.message })
    }

    await adminDb().from('roster_imports').insert({
      district_id: districtId,
      actor_id: ctx.userId,
      provider: 'google_classroom',
      dry_run: dryRun,
      counts: summary.counts,
      report: summary.results,
    })
    if (!dryRun) {
      await ctx.audit({
        action: 'roster.import', targetType: 'district', targetId: districtId, districtId,
        metadata: { provider: 'google_classroom', courses: courses.length, ...summary.counts },
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
