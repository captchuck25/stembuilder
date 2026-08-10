import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeQuizConfig, windowState, type QuizQuestion } from '@/lib/quiz'

// GET /api/quiz-assignments/[id] — everything the student taking/review page
// needs, with the answer key held back until the assignment's reveal rules
// allow it:
//   * canTake (window open + attempts remaining) → `questions` WITHOUT
//     answer/explanation, for taking.
//   * reveal allowed (after_submit + attempted, or after_close + closed +
//     attempted) → `review` with the full questions and the student's last
//     answers. revealMode 'never' → scores only, ever.
// Access: enrolled student of the assignment's class (teachers use their own
// tab; the M4 results route serves them).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const db = adminDb()
  const { data: a } = await db
    .from('quiz_assignments')
    .select('*, quizzes(title, lab, questions, deleted_at)')
    .eq('id', id)
    .single()
  if (!a || !a.quizzes) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', a.class_id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .limit(1)
  if (!enrollment?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cfg = normalizeQuizConfig(a.config)
  const state = windowState(a.opens_at, a.closes_at)
  const questions = (a.quizzes.questions ?? []) as QuizQuestion[]

  const { data: attempts } = await db
    .from('quiz_attempts')
    .select('id, score, total, answers, created_at')
    .eq('assignment_id', id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const myAttempts = attempts ?? []
  const canTake = state === 'open' && myAttempts.length < cfg.attemptsAllowed
  const revealAllowed =
    myAttempts.length > 0 &&
    (cfg.revealMode === 'after_submit' || (cfg.revealMode === 'after_close' && state === 'closed'))

  return NextResponse.json({
    assignment: { id: a.id, opens_at: a.opens_at, closes_at: a.closes_at, config: cfg, state },
    quiz: { title: a.quizzes.title, lab: a.quizzes.lab, questionCount: questions.length },
    attempts: myAttempts.map((at) => ({ score: at.score, total: at.total, created_at: at.created_at })),
    canTake,
    // Taking payload: no answer keys leave the server while taking is possible.
    questions: canTake
      ? questions.map((q) => ({
          question: q.question,
          options: q.options,
          topic: q.topic,
          difficulty: q.difficulty,
          ...(q.blocksFigure ? { blocksFigure: q.blocksFigure } : {}),
        }))
      : undefined,
    review: revealAllowed
      ? { questions, lastAnswers: (myAttempts[myAttempts.length - 1]?.answers as number[]) ?? [] }
      : undefined,
  })
}
