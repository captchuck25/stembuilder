import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { stemSketchAssignmentsAllowed } from '@/lib/stem-sketch.server'

// GET /api/teacher/stem-sketch-results?assignmentId=X
// Per-student results for one assignment: passed (any passing submission),
// attempt count, latest submission (id + date, for the 👁 viewer link).
// Teacher-only (full names are fine here — bridge/measurement precedent).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await stemSketchAssignmentsAllowed(session.user.id)))
    return NextResponse.json({ error: 'STEM Sketch assignments require a Pro plan' }, { status: 403 })

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db
    .from('stem_sketch_assignments')
    .select('teacher_id')
    .eq('id', assignmentId)
    .single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: subs } = await db
    .from('stem_sketch_submissions')
    .select('id, student_id, passed, created_at')
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  interface Row {
    student_id: string; passed: boolean; attempts: number;
    last_submission_id: number; last_at: string
  }
  const byStudent = new Map<string, Row>()
  for (const s of subs ?? []) {
    const prev = byStudent.get(s.student_id)
    if (!prev) {
      byStudent.set(s.student_id, {
        student_id: s.student_id, passed: s.passed, attempts: 1,
        last_submission_id: s.id, last_at: s.created_at,
      })
    } else {
      prev.attempts += 1
      prev.passed = prev.passed || s.passed
      prev.last_submission_id = s.id
      prev.last_at = s.created_at
    }
  }

  const studentIds = [...byStudent.keys()]
  if (!studentIds.length) return NextResponse.json([])

  const { data: profiles } = await db
    .from('profiles')
    .select('id, name, username')
    .in('id', studentIds)
    .is('deleted_at', null)
  const profileMap = new Map((profiles ?? []).map((p: { id: string; name: string | null; username: string | null }) => [p.id, p]))

  const result = studentIds
    .map(id => {
      const row = byStudent.get(id)!
      const p = profileMap.get(id)
      return { ...row, name: p?.name || p?.username || 'Student' }
    })
    .sort((x, y) => Number(y.passed) - Number(x.passed) || x.name.localeCompare(y.name))

  return NextResponse.json(result)
}
