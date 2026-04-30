import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/bridge-overall-leaderboard
// Returns individual standings across all of a teacher's classes.
// Each student appears once, ranked by their single best (lowest-cost) passing submission.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()

  const { data: classes } = await db
    .from('classes')
    .select('id')
    .eq('teacher_id', session.user.id)

  const classIds = (classes ?? []).map((c: { id: string }) => c.id)
  if (classIds.length === 0) return NextResponse.json([])

  const { data: assignments } = await db
    .from('bridge_assignments')
    .select('id, title')
    .in('class_id', classIds)

  const assignmentIds = (assignments ?? []).map((a: { id: string }) => a.id)
  if (assignmentIds.length === 0) return NextResponse.json([])

  const titleById: Record<string, string> = {}
  for (const a of assignments ?? []) titleById[a.id] = a.title || 'Bridge Challenge'

  const { data: submissions } = await db
    .from('bridge_submissions')
    .select('student_id, assignment_id, cost')
    .in('assignment_id', assignmentIds)
    .eq('passed', true)
    .order('cost', { ascending: true })

  // One entry per student — their best (lowest cost) passing submission
  const bestByStudent = new Map<string, { cost: number; assignment_id: string }>()
  for (const s of submissions ?? []) {
    const existing = bestByStudent.get(s.student_id)
    if (!existing || s.cost < existing.cost) {
      bestByStudent.set(s.student_id, { cost: s.cost, assignment_id: s.assignment_id })
    }
  }

  if (bestByStudent.size === 0) return NextResponse.json([])

  const studentIds = [...bestByStudent.keys()]
  const { data: profiles } = await db
    .from('profiles')
    .select('id, name, email')
    .in('id', studentIds)

  const profileMap: Record<string, { name: string; email: string }> = {}
  for (const p of profiles ?? []) profileMap[p.id] = { name: p.name, email: p.email }

  const ranked = [...bestByStudent.entries()]
    .sort((a, b) => a[1].cost - b[1].cost)
    .map(([student_id, best], i) => ({
      rank: i + 1,
      student_id,
      name: profileMap[student_id]?.name ?? 'Unknown',
      email: profileMap[student_id]?.email ?? '',
      cost: best.cost,
      assignment_title: titleById[best.assignment_id] ?? 'Bridge Challenge',
    }))

  return NextResponse.json(ranked)
}
