import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherSharesClassWithStudent } from '@/lib/teacher-access'

// GET /api/teacher/student-work/tower?studentId=X&assignmentId=Y
// Returns the student's saved tower design for an assignment (read-only for teacher viewing).
// Permission: the teacher must own at least one class that the student is enrolled in.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const studentId = req.nextUrl.searchParams.get('studentId')
  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!studentId || !assignmentId)
    return NextResponse.json({ error: 'Missing studentId or assignmentId' }, { status: 400 })

  const db = adminDb()

  if (!(await teacherSharesClassWithStudent(db, session.user.id, studentId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: profileRow } = await db
    .from('profiles')
    .select('id, name, email')
    .eq('id', studentId)
    .is('deleted_at', null)
    .single()
  const profile = profileRow ?? { id: studentId, name: '', email: '' }

  // Same lookup strategy as /api/tower/by-assignment, scoped to the target student.
  const { data: byKey } = await db
    .from('tower_designs')
    .select('*')
    .eq('user_id', studentId)
    .eq('name', `asgn_${assignmentId}`)
    .is('deleted_at', null)
    .maybeSingle()
  if (byKey) return NextResponse.json({ design: byKey, student: profile })

  const { data: byId } = await db
    .from('tower_designs')
    .select('*')
    .eq('user_id', studentId)
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (byId) return NextResponse.json({ design: byId, student: profile })

  return NextResponse.json({ design: null, student: profile })
}
