import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isQuizLab, sanitizeQuestion } from '@/lib/quiz'
import { quizBuilderAllowed } from '@/lib/quiz.server'

// Teacher's personal question library (teacher_questions). The curriculum
// bank lives in code (lib/quiz-bank) and is read client-side — only the
// teacher's own questions round-trip through this route.

async function gate() {
  const session = await auth()
  if (!session?.user?.id) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!roleAtLeast(session.user.role, 'teacher'))
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!(await quizBuilderAllowed(session.user.id)))
    return { err: NextResponse.json({ error: 'Quiz Builder requires a Pro or district plan' }, { status: 403 }) }
  return { userId: session.user.id }
}

// GET /api/teacher/quiz-questions?lab=X — own questions for a lab
export async function GET(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const lab = req.nextUrl.searchParams.get('lab')
  if (!isQuizLab(lab)) return NextResponse.json({ error: 'Missing or invalid lab' }, { status: 400 })

  const { data, error } = await adminDb()
    .from('teacher_questions')
    .select('*')
    .eq('teacher_id', g.userId)
    .eq('lab', lab)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/teacher/quiz-questions — create (authored or forked from the bank)
export async function POST(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const { lab, unitIdx, question, forkedFrom } = await req.json()
  const clean = sanitizeQuestion(question)
  if (!isQuizLab(lab) || typeof unitIdx !== 'number' || unitIdx < 0 || !clean)
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const { data, error } = await adminDb()
    .from('teacher_questions')
    .insert({
      teacher_id: g.userId,
      lab,
      unit_idx: Math.round(unitIdx),
      question: clean,
      forked_from: typeof forkedFrom === 'string' && forkedFrom ? forkedFrom : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// PATCH /api/teacher/quiz-questions — edit an owned question in place.
// (Existing quiz snapshots are frozen and unaffected by design.)
export async function PATCH(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const { id, question } = await req.json()
  const clean = sanitizeQuestion(question)
  if (!id || !clean) return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const db = adminDb()
  const { data: row } = await db.from('teacher_questions').select('teacher_id').eq('id', id).is('deleted_at', null).single()
  if (!row || row.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('teacher_questions')
    .update({ question: clean, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/teacher/quiz-questions?id=X — soft delete (30-day retention)
export async function DELETE(req: NextRequest) {
  const g = await gate()
  if (g.err) return g.err

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: row } = await db.from('teacher_questions').select('teacher_id').eq('id', id).single()
  if (!row || row.teacher_id !== g.userId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db
    .from('teacher_questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
