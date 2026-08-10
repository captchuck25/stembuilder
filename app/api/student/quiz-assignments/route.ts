import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeQuizConfig, windowState } from '@/lib/quiz'

// GET /api/student/quiz-assignments
// Quiz assignments for every class the student is enrolled in, with the
// caller's own attempts merged in (best %, attempt count, passed) and the
// window state. Never includes questions or answer keys — the taking page
// fetches those from /api/quiz-assignments/[id] under its own rules.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json([])

  const db = adminDb()
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id)
    .is('deleted_at', null)

  if (!enrollments?.length) return NextResponse.json([])

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id)

  const [{ data: assignments }, { data: attempts }] = await Promise.all([
    db.from('quiz_assignments')
      .select('*, classes(name), quizzes(title, lab, questions, deleted_at)')
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    db.from('quiz_attempts')
      .select('assignment_id, score, total')
      .eq('student_id', session.user.id)
      .is('deleted_at', null),
  ])

  const mine = new Map<string, { bestPct: number; attemptCount: number }>()
  for (const at of attempts ?? []) {
    const pct = at.total > 0 ? Math.round((at.score / at.total) * 100) : 0
    const prev = mine.get(at.assignment_id)
    if (!prev) mine.set(at.assignment_id, { bestPct: pct, attemptCount: 1 })
    else {
      prev.attemptCount += 1
      prev.bestPct = Math.max(prev.bestPct, pct)
    }
  }

  const result = (assignments ?? []).map((a: Record<string, unknown>) => {
    const cfg = normalizeQuizConfig(a.config)
    const quiz = a.quizzes as { title: string; lab: string; questions: unknown[]; deleted_at: string | null } | null
    const m = mine.get(a.id as string)
    return {
      id: a.id,
      class_id: a.class_id,
      class_name: (a.classes as { name: string } | null)?.name ?? '',
      title: quiz?.title ?? 'Quiz',
      lab: quiz?.lab ?? null,
      questionCount: Array.isArray(quiz?.questions) ? quiz.questions.length : 0,
      opens_at: a.opens_at,
      closes_at: a.closes_at,
      state: windowState(a.opens_at as string | null, a.closes_at as string | null),
      config: cfg,
      bestPct: m?.bestPct ?? null,
      attemptCount: m?.attemptCount ?? 0,
      passed: (m?.bestPct ?? -1) >= cfg.passThreshold,
    }
  })

  return NextResponse.json(result)
}
