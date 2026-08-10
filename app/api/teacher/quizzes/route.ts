import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isQuizLab, sanitizeQuestion } from '@/lib/quiz'
import { quizBuilderAllowed } from '@/lib/quiz.server'

// Teacher-owned quizzes. questions is a FROZEN snapshot taken at save time —
// later bank/library edits never change a saved quiz (migration 0020 notes).

const MAX_QUESTIONS = 50

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!roleAtLeast(session.user.role, 'teacher'))
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!(await quizBuilderAllowed(session.user.id)))
    return { err: NextResponse.json({ error: 'Quiz Builder requires a Pro or district plan' }, { status: 403 }) }
  return { userId: session.user.id }
}

// GET /api/teacher/quizzes — all of the teacher's quizzes (light rows +
// question count; the full snapshot comes along, it's what previews render).
export async function GET() {
  const g = await gate()
  if (g.err) return g.err

  const { data, error } = await adminDb()
    .from('quizzes')
    .select('*')
    .eq('teacher_id', g.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/teacher/quizzes — create with a validated frozen snapshot
export async function POST(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const { title, lab, unitIdxs, questions } = await req.json()
  if (!isQuizLab(lab)) return NextResponse.json({ error: 'Missing or invalid lab' }, { status: 400 })
  if (!Array.isArray(unitIdxs) || unitIdxs.length === 0 || unitIdxs.some((u) => typeof u !== 'number' || u < 0))
    return NextResponse.json({ error: 'unitIdxs must be a non-empty array of unit indexes' }, { status: 400 })
  if (!Array.isArray(questions) || questions.length === 0)
    return NextResponse.json({ error: 'A quiz needs at least one question' }, { status: 400 })
  if (questions.length > MAX_QUESTIONS)
    return NextResponse.json({ error: `A quiz can hold at most ${MAX_QUESTIONS} questions` }, { status: 400 })

  const snapshot = questions.map(sanitizeQuestion)
  if (snapshot.some((q) => q === null))
    return NextResponse.json({ error: 'One or more questions are invalid' }, { status: 400 })

  const { data, error } = await adminDb()
    .from('quizzes')
    .insert({
      teacher_id: g.userId,
      title: typeof title === 'string' && title.trim() ? title.trim() : 'Quiz',
      lab,
      unit_idxs: [...new Set(unitIdxs.map((u: number) => Math.round(u)))].sort((a, b) => a - b),
      questions: snapshot,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/teacher/quizzes — rename only (snapshots are immutable; to
// change questions, build a new quiz).
export async function PATCH(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const { id, title } = await req.json()
  if (!id || typeof title !== 'string' || !title.trim())
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const db = adminDb()
  const { data: row } = await db.from('quizzes').select('teacher_id').eq('id', id).is('deleted_at', null).single()
  if (!row || row.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('quizzes')
    .update({ title: title.trim(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/teacher/quizzes?id=X — soft delete (retire). Past assignments'
// grades stay readable until purge; new assignment of a retired quiz is
// blocked by the deleted_at filter on quiz lookup.
export async function DELETE(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: row } = await db.from('quizzes').select('teacher_id').eq('id', id).single()
  if (!row || row.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db
    .from('quizzes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
