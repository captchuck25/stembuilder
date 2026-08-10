import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeQuizConfig, type QuizQuestion } from '@/lib/quiz'
import { quizBuilderAllowed } from '@/lib/quiz.server'

// GET /api/teacher/quiz-results?assignmentId=X
// Per-student results (best %, attempts, last taken) + per-question miss
// rates for one assignment. Miss rates use each student's LAST attempt —
// their most recent understanding. Teacher-only; full names are fine here
// (measurement-results precedent).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await quizBuilderAllowed(session.user.id)))
    return NextResponse.json({ error: 'Quiz Builder requires a Pro or district plan' }, { status: 403 })

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db
    .from('quiz_assignments')
    .select('teacher_id, config, quizzes(questions)')
    .eq('id', assignmentId)
    .single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cfg = normalizeQuizConfig(a.config)
  const questions = ((a.quizzes as { questions?: unknown } | null)?.questions ?? []) as QuizQuestion[]

  const { data: attempts } = await db
    .from('quiz_attempts')
    .select('student_id, score, total, answers, created_at')
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  interface Row {
    student_id: string
    bestPct: number
    attempts: number
    last_at: string
    lastAnswers: number[]
  }
  const byStudent = new Map<string, Row>()
  for (const at of attempts ?? []) {
    const pct = at.total > 0 ? Math.round((at.score / at.total) * 100) : 0
    const prev = byStudent.get(at.student_id)
    if (!prev) {
      byStudent.set(at.student_id, {
        student_id: at.student_id, bestPct: pct, attempts: 1,
        last_at: at.created_at, lastAnswers: (at.answers as number[]) ?? [],
      })
    } else {
      prev.attempts += 1
      prev.last_at = at.created_at
      prev.lastAnswers = (at.answers as number[]) ?? []
      prev.bestPct = Math.max(prev.bestPct, pct)
    }
  }

  const studentIds = [...byStudent.keys()]

  // Per-question breakdown from each student's last attempt.
  const questionStats = questions.map((q, i) => {
    let wrong = 0
    const wrongPicks = [0, 0, 0, 0]
    for (const row of byStudent.values()) {
      const pick = row.lastAnswers[i]
      if (pick !== q.answer) {
        wrong++
        if (pick === 0 || pick === 1 || pick === 2 || pick === 3) wrongPicks[pick]++
      }
    }
    const n = studentIds.length
    const topWrong = wrongPicks.indexOf(Math.max(...wrongPicks))
    return {
      idx: i,
      question: q.question,
      topic: q.topic,
      difficulty: q.difficulty,
      answerText: q.options[q.answer],
      missPct: n > 0 ? Math.round((wrong / n) * 100) : 0,
      wrongCount: wrong,
      // Most-picked wrong choice, when at least one student picked one.
      commonWrong: wrong > 0 && Math.max(...wrongPicks) > 0 ? q.options[topWrong] : null,
    }
  })

  let students: Array<Omit<Row, 'lastAnswers'> & { name: string; passed: boolean }> = []
  if (studentIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, name, username')
      .in('id', studentIds)
      .is('deleted_at', null)
    const profileMap = new Map((profiles ?? []).map((p: { id: string; name: string | null; username: string | null }) => [p.id, p]))
    students = studentIds
      .map((id) => {
        const { lastAnswers: _drop, ...row } = byStudent.get(id)!
        const p = profileMap.get(id)
        return { ...row, name: p?.name || p?.username || 'Student', passed: row.bestPct >= cfg.passThreshold }
      })
      .sort((x, y) => y.bestPct - x.bestPct || x.name.localeCompare(y.name))
  }

  const avgBestPct = students.length
    ? Math.round(students.reduce((s, r) => s + r.bestPct, 0) / students.length)
    : 0

  return NextResponse.json({
    summary: {
      studentCount: students.length,
      avgBestPct,
      passRate: students.length ? Math.round((students.filter((s) => s.passed).length / students.length) * 100) : 0,
      passThreshold: cfg.passThreshold,
    },
    students,
    questionStats: questionStats.sort((x, y) => y.missPct - x.missPct),
  })
}
