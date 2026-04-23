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

  if (!enrollments?.length) return NextResponse.json([])

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id)
  const { data: classes } = await db.from('classes').select('*').in('id', classIds)

  const result = await Promise.all(
    (classes ?? []).map(async (cls: { id: string }) => {
      const { data: assignments } = await db
        .from('assignments')
        .select('*')
        .eq('class_id', cls.id)
        .order('level_id')
      return { class: cls, assignments: assignments ?? [] }
    })
  )

  return NextResponse.json(result)
}
