import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeQuizConfig, windowState, type QuizQuestion } from '@/lib/quiz'

// POST /api/quiz-attempts — submit one finished attempt.
// THE enforcement point for the take window and attempt limit (the UI hiding
// a closed quiz is cosmetic). Grading happens server-side against the frozen
// snapshot; the client only ever sends chosen option indexes.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentId, answers, durationS } = await req.json()
  if (!assignmentId || !Array.isArray(answers))
    return NextResponse.json({ error: 'Missing assignmentId or answers' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db
    .from('quiz_assignments')
    .select('*, quizzes(questions)')
    .eq('id', assignmentId)
    .single()
  if (!a || !a.quizzes) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Enrollment.
  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', a.class_id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .limit(1)
  if (!enrollment?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cfg = normalizeQuizConfig(a.config)

  // Window — server clock, not the client's.
  const state = windowState(a.opens_at, a.closes_at)
  if (state === 'upcoming') return NextResponse.json({ error: 'This quiz has not opened yet.' }, { status: 403 })
  if (state === 'closed') return NextResponse.json({ error: 'This quiz has closed.' }, { status: 403 })

  // Attempt limit.
  const { count } = await db
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
  if ((count ?? 0) >= cfg.attemptsAllowed)
    return NextResponse.json({ error: 'No attempts remaining.' }, { status: 403 })

  // Grade against the snapshot. Unanswered (-1) counts as wrong.
  const questions = (a.quizzes.questions ?? []) as QuizQuestion[]
  if (answers.length !== questions.length)
    return NextResponse.json({ error: 'Answer count mismatch' }, { status: 400 })
  const clean = answers.map((v: unknown) => (v === 0 || v === 1 || v === 2 || v === 3 ? v : -1))
  const score = questions.reduce((s, q, i) => s + (clean[i] === q.answer ? 1 : 0), 0)

  const { error } = await db.from('quiz_attempts').insert({
    assignment_id: assignmentId,
    student_id: session.user.id,
    answers: clean,
    score,
    total: questions.length,
    duration_s: typeof durationS === 'number' && durationS >= 0 ? Math.round(durationS) : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const pct = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0
  // Reveal immediately only when this assignment says so.
  const revealNow = cfg.revealMode === 'after_submit'
  return NextResponse.json({
    score,
    total: questions.length,
    pct,
    passed: pct >= cfg.passThreshold,
    review: revealNow ? { questions, lastAnswers: clean } : undefined,
    revealMode: cfg.revealMode,
  })
}
