import { NextRequest, NextResponse } from 'next/server'
import { listCourses, courseTitle, GoogleAuthError, GC_COOKIE, googleClassroomClientId } from '@/lib/roster/google'
import { requireDistrictTeacher, isTeacherGuardError } from '@/lib/roster/teacher-guard.server'

// GET /api/teacher/roster/google/courses — the connected account's ACTIVE
// courses, for the teacher's own import picker.
export async function GET(req: NextRequest) {
  const ctx = await requireDistrictTeacher()
  if (isTeacherGuardError(ctx)) return ctx

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
