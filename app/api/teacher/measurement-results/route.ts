import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/measurement-results?assignmentId=X
// Per-student results for one assignment: best score, attempt count, last
// attempt. Teacher-only (full names are fine here — bridge precedent).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db
    .from('measurement_assignments')
    .select('teacher_id')
    .eq('id', assignmentId)
    .single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: attempts } = await db
    .from('measurement_attempts')
    .select('student_id, correct, total, created_at')
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  interface Row { student_id: string; best_correct: number; total: number; attempts: number; last_at: string }
  const byStudent = new Map<string, Row>()
  for (const at of attempts ?? []) {
    const prev = byStudent.get(at.student_id)
    if (!prev) {
      byStudent.set(at.student_id, {
        student_id: at.student_id, best_correct: at.correct, total: at.total,
        attempts: 1, last_at: at.created_at,
      })
    } else {
      prev.attempts += 1
      prev.last_at = at.created_at
      if (at.correct > prev.best_correct) { prev.best_correct = at.correct; prev.total = at.total }
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
    .sort((x, y) => y.best_correct - x.best_correct || x.name.localeCompare(y.name))

  return NextResponse.json(result)
}
