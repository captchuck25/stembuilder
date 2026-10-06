import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherCanAccessClass } from '@/lib/class-access.server'

// GET /api/tower-assignments/[id]
// Returns the assignment config so the tower page can lock height/footprint/load/maxCost
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()

  const { data, error } = await db
    .from('tower_assignments')
    .select('id, title, height_feet, footprint_feet, load_lb, max_cost, class_id')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow access if the caller is either an enrolled student or the owning
  // teacher (teacher demo-view / try-it-yourself flows).
  const [{ data: enrollment }, isOwningTeacher] = await Promise.all([
    db.from('enrollments').select('id')
      .eq('class_id', data.class_id).eq('student_id', session.user.id).is('deleted_at', null).maybeSingle(),
    teacherCanAccessClass(db, session.user.id, data.class_id),
  ])

  const isEnrolledStudent = !!enrollment
  if (!isEnrolledStudent && !isOwningTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(data)
}
