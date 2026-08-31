import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// Teacher side of the Blueprint submission loop.
//
// GET  /api/teacher/blueprint-submissions?assignmentId=X → list w/ student names
// POST /api/teacher/blueprint-submissions
//   { submissionId, action: 'return' }                         → back to student
//   { submissionId, action: 'save',  teacherScores }           → draft scores
//   { submissionId, action: 'grade', teacherScores, gradeTotal } → final
async function requireTeacher() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!roleAtLeast(session.user.role, 'teacher')) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

export async function GET(req: NextRequest) {
  const who = await requireTeacher()
  if ('error' in who) return who.error

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db
    .from('blueprint_assignments')
    .select('id, teacher_id')
    .eq('id', assignmentId)
    .maybeSingle()
  if (!a || a.teacher_id !== who.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: subs } = await db
    .from('blueprint_submissions')
    .select('id, student_id, status, grade_total, submitted_at, updated_at')
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })

  const ids = (subs ?? []).map(s => s.student_id)
  const nameMap: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, name, email')
      .in('id', ids)
    for (const p of profiles ?? []) nameMap[p.id] = p.name || p.email || 'Unknown'
  }

  return NextResponse.json((subs ?? []).map(s => ({
    ...s,
    student_name: nameMap[s.student_id] ?? 'Unknown',
  })))
}

export async function POST(req: NextRequest) {
  const who = await requireTeacher()
  if ('error' in who) return who.error

  const body = await req.json().catch(() => null)
  const submissionId = body?.submissionId as string | undefined
  const action = body?.action as 'return' | 'save' | 'grade' | undefined
  if (!submissionId || !action) return NextResponse.json({ error: 'Missing submissionId or action' }, { status: 400 })

  const db = adminDb()
  const { data: sub } = await db
    .from('blueprint_submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: a } = await db
    .from('blueprint_assignments')
    .select('teacher_id')
    .eq('id', sub.assignment_id)
    .single()
  if (!a || a.teacher_id !== who.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (action === 'return') {
    patch.status = 'returned'
    if (body.teacherScores != null) patch.teacher_scores = body.teacherScores
  } else if (action === 'save') {
    if (body.teacherScores != null) patch.teacher_scores = body.teacherScores
  } else if (action === 'grade') {
    patch.status = 'graded'
    patch.teacher_scores = body.teacherScores ?? {}
    patch.grade_total = typeof body.gradeTotal === 'number' ? body.gradeTotal : null
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { error } = await db
    .from('blueprint_submissions')
    .update(patch)
    .eq('id', submissionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
