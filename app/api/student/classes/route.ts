import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id)
    .is('deleted_at', null)

  if (!enrollments?.length) return NextResponse.json([])

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id)
  const { data: classes } = await db.from('classes').select('*').in('id', classIds).is('deleted_at', null)

  const result = await Promise.all(
    (classes ?? []).map(async (cls: { id: string }) => {
      const [{ data: assignments }, { data: turtleAssignments }] = await Promise.all([
        db.from('assignments').select('*').eq('class_id', cls.id).order('level_id'),
        db.from('turtle_assignments').select('challenge_id').eq('class_id', cls.id),
      ])
      const turtleAssignedIds = (turtleAssignments ?? []).map((r: { challenge_id: string }) => r.challenge_id)
      return { class: cls, assignments: assignments ?? [], turtleAssignedIds }
    })
  )

  return NextResponse.json(result)
}
