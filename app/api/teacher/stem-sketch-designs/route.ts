import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/stem-sketch-designs?classId=X
// Returns stem sketch designs for all students enrolled in the class
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()

  const { data: cls } = await db
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('teacher_id', session.user.id)
    .single()
  if (!cls) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: enrollments } = await db
    .from('enrollments')
    .select('user_id, profiles(id, name, email)')
    .eq('class_id', classId)

  if (!enrollments?.length) return NextResponse.json([])

  const studentIds = enrollments.map((e: { user_id: string }) => e.user_id)

  const { data: designs } = await db
    .from('stem_sketch_designs')
    .select('id, user_id, name, units, thumbnail, updated_at')
    .in('user_id', studentIds)
    .order('updated_at', { ascending: false })

  type EnrollmentRow = { user_id: string; profiles: { name: string; email: string }[] | { name: string; email: string } | null }
  const profileMap: Record<string, { name: string; email: string }> = {}
  for (const e of enrollments as EnrollmentRow[]) {
    const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles
    profileMap[e.user_id] = p ?? { name: 'Unknown', email: '' }
  }

  type DesignRow = { id: string; user_id: string; name: string; units: string; thumbnail: string | null; updated_at: string }
  return NextResponse.json(
    (designs ?? [] as DesignRow[]).map((d: DesignRow) => ({
      ...d,
      student_name: profileMap[d.user_id]?.name ?? 'Unknown',
      student_email: profileMap[d.user_id]?.email ?? '',
    }))
  )
}
