import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { listCourses, courseTitle, GoogleAuthError, GC_COOKIE, googleClassroomClientId } from '@/lib/roster/google'

// GET /api/admin/roster/google/courses?districtId=…
// Lists the connected Google account's ACTIVE Classroom courses so the admin
// can pick which ones to import. 401 with code 'reconnect' when the one-hour
// token is gone — the UI turns that into the Connect button again.
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const districtId = new URL(req.url).searchParams.get('districtId') ?? ''
  if (ctx.role === 'district_admin' && ctx.districtId !== districtId) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }

  if (!googleClassroomClientId()) {
    return NextResponse.json({ error: 'Google Classroom is not configured', code: 'unconfigured' }, { status: 503 })
  }
  const token = req.cookies.get(GC_COOKIE)?.value
  if (!token) return NextResponse.json({ error: 'Not connected', code: 'reconnect' }, { status: 401 })

  try {
    const courses = await listCourses(token)
    return NextResponse.json(courses.map(c => ({ id: c.id, title: courseTitle(c) })))
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      return NextResponse.json({ error: e.message, code: 'reconnect' }, { status: 401 })
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
