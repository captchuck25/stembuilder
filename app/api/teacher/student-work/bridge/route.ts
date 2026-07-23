import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherSharesClassWithStudent } from '@/lib/teacher-access'

// GET /api/teacher/student-work/bridge?studentId=X&assignmentId=Y
// Returns the student's saved bridge design for an assignment (read-only for teacher viewing).
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

  // Match the lookup strategy used by /api/bridge/by-assignment, but scoped to the target student.
  const profile = await fetchStudentProfile(db, studentId)

  // Strategy 1: deterministic save key
  const saveName = `asgn_${assignmentId}`
  const { data: byKey } = await db
    .from('bridge_designs')
    .select('*')
    .eq('user_id', studentId)
    .eq('name', saveName)
    .is('deleted_at', null)
    .maybeSingle()
  if (byKey) return NextResponse.json({ design: byKey, student: profile })

  // Strategy 2: assignment_id column (only matches if the column exists in this schema)
  const { data: byId } = await db
    .from('bridge_designs')
    .select('*')
    .eq('user_id', studentId)
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (byId) return NextResponse.json({ design: byId, student: profile })

  // Strategy 3: legacy — name matches assignment title and dimensions match
  const { data: assignment } = await db
    .from('bridge_assignments')
    .select('title, span_feet, load_lb')
    .eq('id', assignmentId)
    .single()
  if (assignment) {
    const legacyName = assignment.title || 'Bridge Assignment'
    const { data: byLegacy } = await db
      .from('bridge_designs')
      .select('*')
      .eq('user_id', studentId)
      .eq('name', legacyName)
      .eq('span_feet', assignment.span_feet)
      .eq('load_lb', assignment.load_lb)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (byLegacy) return NextResponse.json({ design: byLegacy, student: profile })
  }

  return NextResponse.json({ design: null, student: profile })
}

async function fetchStudentProfile(db: ReturnType<typeof adminDb>, studentId: string) {
  const { data } = await db
    .from('profiles')
    .select('id, name, email')
    .eq('id', studentId)
    .is('deleted_at', null)
    .single()
  return data ?? { id: studentId, name: '', email: '' }
}
