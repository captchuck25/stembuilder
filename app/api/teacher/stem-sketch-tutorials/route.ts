import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { stemSketchAssignmentsAllowed } from '@/lib/stem-sketch.server'
import { isTrackableTutorialId } from '@/lib/stem-sketch/tutorials'

// Teacher surface for STEM Sketch tutorial assignments: one assigned SET per
// class (stem_sketch_tutorial_assignments, 0025) plus a per-student
// completion roster read from stem_sketch_tutorial_progress (0024).
// Tutorials are free for students to take; assign/track is Pro-gated like
// the rest of the teacher STEM Sketch surface.

async function guard(classId: string | null) {
  const session = await auth()
  if (!session?.user?.id) return { err: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!roleAtLeast(session.user.role, 'teacher')) return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!(await stemSketchAssignmentsAllowed(session.user.id)))
    return { err: NextResponse.json({ error: 'STEM Sketch assignments require a Pro plan' }, { status: 403 }) }
  if (!classId) return { err: NextResponse.json({ error: 'Missing classId' }, { status: 400 }) }

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return { err: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db, userId: session.user.id }
}

// GET /api/teacher/stem-sketch-tutorials?classId=X
// → { tutorialIds, roster: [{ studentId, name, completed: string[] }] }
export async function GET(req: NextRequest) {
  const classId = req.nextUrl.searchParams.get('classId')
  const g = await guard(classId)
  if ('err' in g) return g.err
  const { db } = g

  const [{ data: row }, { data: enrollments }] = await Promise.all([
    db.from('stem_sketch_tutorial_assignments').select('tutorial_ids').eq('class_id', classId!).maybeSingle(),
    db.from('enrollments').select('student_id').eq('class_id', classId!).is('deleted_at', null),
  ])

  const studentIds = (enrollments ?? []).map((e: { student_id: string }) => e.student_id)
  let roster: { studentId: string; name: string; completed: string[] }[] = []
  if (studentIds.length) {
    const [{ data: profiles }, { data: progress }] = await Promise.all([
      db.from('profiles').select('id, name, username').in('id', studentIds).is('deleted_at', null),
      db.from('stem_sketch_tutorial_progress').select('user_id, tutorial_id').in('user_id', studentIds),
    ])
    const doneBy = new Map<string, string[]>()
    for (const p of progress ?? []) {
      const list = doneBy.get(p.user_id) ?? []
      list.push(p.tutorial_id)
      doneBy.set(p.user_id, list)
    }
    roster = (profiles ?? [])
      .map((p: { id: string; name: string | null; username: string | null }) => ({
        studentId: p.id,
        name: p.name || p.username || 'Student',
        completed: doneBy.get(p.id) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  return NextResponse.json({
    tutorialIds: Array.isArray(row?.tutorial_ids) ? row.tutorial_ids : [],
    roster,
  })
}

// PUT /api/teacher/stem-sketch-tutorials  { classId, tutorialIds }
export async function PUT(req: NextRequest) {
  let body: { classId?: string; tutorialIds?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }
  const g = await guard(body.classId ?? null)
  if ('err' in g) return g.err
  const { db, userId } = g

  if (!Array.isArray(body.tutorialIds) || !body.tutorialIds.every(id => typeof id === 'string' && isTrackableTutorialId(id)))
    return NextResponse.json({ error: 'Invalid tutorialIds' }, { status: 400 })
  const tutorialIds = [...new Set(body.tutorialIds as string[])]

  const { error } = await db
    .from('stem_sketch_tutorial_assignments')
    .upsert(
      { class_id: body.classId, teacher_id: userId, tutorial_ids: tutorialIds, updated_at: new Date().toISOString() },
      { onConflict: 'class_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tutorialIds })
}
