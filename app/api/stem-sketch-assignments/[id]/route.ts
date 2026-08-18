import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { getChallenge } from '@/lib/stem-sketch/challenges'

// GET /api/stem-sketch-assignments/[id]
// Returns the assignment plus its resolved challenge (reference geometry,
// tolerance) so the STEM Sketch shell needs a single fetch to enter
// assignment mode.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()

  const { data, error } = await db
    .from('stem_sketch_assignments')
    .select('id, title, challenge_id, config, class_id')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow access if the caller is either an enrolled student or the teacher
  // who owns the class (so a teacher can try their own assignment).
  const [{ data: enrollment }, { data: classRow }] = await Promise.all([
    db.from('enrollments').select('id')
      .eq('class_id', data.class_id).eq('student_id', session.user.id).is('deleted_at', null).maybeSingle(),
    db.from('classes').select('teacher_id').eq('id', data.class_id).is('deleted_at', null).maybeSingle(),
  ])

  const isEnrolledStudent = !!enrollment
  const isOwningTeacher = classRow?.teacher_id === session.user.id
  if (!isEnrolledStudent && !isOwningTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const challenge = getChallenge(data.challenge_id)
  if (!challenge)
    return NextResponse.json({ error: 'Challenge no longer exists' }, { status: 404 })

  return NextResponse.json({
    id: data.id,
    title: data.title,
    class_id: data.class_id,
    config: data.config ?? {},
    challenge: {
      id: challenge.id,
      stage: challenge.stage,
      title: challenge.title,
      precision: challenge.precision,
      studentInstructions: challenge.studentInstructions,
      refDocJson: challenge.refDocJson,
      toleranceMm: challenge.toleranceMm,
      targetCubeIn: challenge.targetCubeIn ?? null,
    },
  })
}
