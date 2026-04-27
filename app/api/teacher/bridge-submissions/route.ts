import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/bridge-submissions?assignmentId=X
// Returns all passing submissions ranked by cost (lowest = 1st)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()

  const { data: assignment } = await db
    .from('bridge_assignments')
    .select('id, teacher_id')
    .eq('id', assignmentId)
    .single()

  if (!assignment || assignment.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: submissions } = await db
    .from('bridge_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .eq('passed', true)
    .order('cost', { ascending: true })

  const studentIds = (submissions ?? []).map((s: { student_id: string }) => s.student_id)

  const profileMap: Record<string, { name: string; email: string }> = {}
  if (studentIds.length > 0) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, name, email')
      .in('id', studentIds)
    for (const p of profiles ?? []) {
      profileMap[p.id] = { name: p.name, email: p.email }
    }
  }

  const result = (submissions ?? []).map((s: { student_id: string; cost: number; submitted_at: string }, i: number) => ({
    rank: i + 1,
    student_id: s.student_id,
    name: profileMap[s.student_id]?.name ?? 'Unknown',
    email: profileMap[s.student_id]?.email ?? '',
    cost: s.cost,
    submitted_at: s.submitted_at,
  }))

  return NextResponse.json(result)
}
