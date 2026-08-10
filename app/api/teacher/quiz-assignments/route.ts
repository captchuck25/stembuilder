import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeQuizConfig } from '@/lib/quiz'
import { quizBuilderAllowed } from '@/lib/quiz.server'

// Class-scoped quiz assignments (window + config). The take window is
// enforced on the student attempt route — this is teacher CRUD only.

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!roleAtLeast(session.user.role, 'teacher'))
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!(await quizBuilderAllowed(session.user.id)))
    return { err: NextResponse.json({ error: 'Quiz Builder requires a Pro or district plan' }, { status: 403 }) }
  return { userId: session.user.id }
}

// GET /api/teacher/quiz-assignments?classId=X — assignments + quiz title +
// how many distinct students have attempted each.
export async function GET(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: assignments, error } = await db
    .from('quiz_assignments')
    .select('*, quizzes(title, lab, unit_idxs, questions, deleted_at)')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = await Promise.all((assignments ?? []).map(async (a: { id: string; quizzes?: { questions?: unknown[] } | null }) => {
    const { data: attempts } = await db
      .from('quiz_attempts')
      .select('student_id')
      .eq('assignment_id', a.id)
      .is('deleted_at', null)
    const attemptStudentCount = new Set((attempts ?? []).map((r: { student_id: string }) => r.student_id)).size
    const quiz = a.quizzes ?? null
    return {
      ...a,
      quizzes: undefined,
      quiz: quiz ? { ...quiz, questionCount: Array.isArray(quiz.questions) ? quiz.questions.length : 0, questions: undefined } : null,
      attemptStudentCount,
    }
  }))

  return NextResponse.json(result)
}

// POST /api/teacher/quiz-assignments — assign an owned quiz to an owned class
export async function POST(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const { quizId, classId, opensAt, closesAt, config } = await req.json()
  if (!quizId || !classId) return NextResponse.json({ error: 'Missing quizId or classId' }, { status: 400 })

  const opens = typeof opensAt === 'string' && opensAt ? new Date(opensAt) : null
  const closes = typeof closesAt === 'string' && closesAt ? new Date(closesAt) : null
  if ((opens && isNaN(opens.getTime())) || (closes && isNaN(closes.getTime())))
    return NextResponse.json({ error: 'Invalid window timestamps' }, { status: 400 })
  if (opens && closes && closes.getTime() <= opens.getTime())
    return NextResponse.json({ error: 'closesAt must be after opensAt' }, { status: 400 })

  const db = adminDb()
  const [{ data: cls }, { data: quiz }] = await Promise.all([
    db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single(),
    db.from('quizzes').select('teacher_id').eq('id', quizId).is('deleted_at', null).single(),
  ])
  if (!cls || cls.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!quiz || quiz.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })

  const { data, error } = await db
    .from('quiz_assignments')
    .insert({
      quiz_id: quizId,
      class_id: classId,
      teacher_id: g.userId,
      opens_at: opens ? opens.toISOString() : null,
      closes_at: closes ? closes.toISOString() : null,
      config: normalizeQuizConfig(config),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, attemptStudentCount: 0 })
}

// DELETE /api/teacher/quiz-assignments?id=X — hard delete. NOTE: cascades the
// class's attempts for this assignment (same policy as measurement) — the UI
// warns when attempts exist.
export async function DELETE(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db.from('quiz_assignments').select('teacher_id').eq('id', id).single()
  if (!a || a.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('quiz_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
