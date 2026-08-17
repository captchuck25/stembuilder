import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { stemSketchAssignmentsAllowed } from '@/lib/stem-sketch.server'
import { getChallenge } from '@/lib/stem-sketch/challenges'

// GET /api/teacher/stem-sketch-assignments?classId=X
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await stemSketchAssignmentsAllowed(session.user.id)))
    return NextResponse.json({ error: 'STEM Sketch assignments require a Pro plan' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: assignments } = await db
    .from('stem_sketch_assignments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  // Attach how many distinct students have submitted to each assignment
  const result = await Promise.all((assignments ?? []).map(async (a: { id: string }) => {
    const { data: subs } = await db
      .from('stem_sketch_submissions')
      .select('student_id')
      .eq('assignment_id', a.id)
      .is('deleted_at', null)
    const submitStudentCount = new Set((subs ?? []).map((r: { student_id: string }) => r.student_id)).size
    return { ...a, submitStudentCount }
  }))

  return NextResponse.json(result)
}

// POST /api/teacher/stem-sketch-assignments
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await stemSketchAssignmentsAllowed(session.user.id)))
    return NextResponse.json({ error: 'STEM Sketch assignments require a Pro plan' }, { status: 403 })

  const { classId, title, challengeId } = await req.json()
  const challenge = typeof challengeId === 'string' ? getChallenge(challengeId) : undefined
  if (!classId || !challenge)
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('stem_sketch_assignments')
    .insert({
      class_id: classId,
      teacher_id: session.user.id,
      title: (typeof title === 'string' && title.trim()) || challenge.title,
      challenge_id: challenge.id,
      config: {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, submitStudentCount: 0 })
}

// DELETE /api/teacher/stem-sketch-assignments?id=X
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db.from('stem_sketch_assignments').select('teacher_id').eq('id', id).single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('stem_sketch_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
