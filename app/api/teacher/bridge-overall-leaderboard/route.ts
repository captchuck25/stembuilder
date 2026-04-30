import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export interface LeaderboardRow {
  rank: number
  student_id: string
  name: string
  email: string
  cost: number
  assignment_title: string
}

export interface LeaderboardResponse {
  overall: LeaderboardRow[]
  byAssignment: { title: string; rows: LeaderboardRow[] }[]
}

// GET /api/teacher/bridge-overall-leaderboard
// Returns overall standings (best submission per student) plus per-assignment standings.
// Assignments with the same title are merged into one leaderboard tab.
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
  if (classIds.length === 0) return NextResponse.json({ overall: [], byAssignment: [] })

  const { data: assignments } = await db
    .from('bridge_assignments')
    .select('id, title')
    .in('class_id', classIds)

  const assignmentIds = (assignments ?? []).map((a: { id: string }) => a.id)
  if (assignmentIds.length === 0) return NextResponse.json({ overall: [], byAssignment: [] })

  const titleById: Record<string, string> = {}
  for (const a of assignments ?? []) titleById[a.id] = a.title || 'Bridge Challenge'

  const { data: submissions } = await db
    .from('bridge_submissions')
    .select('student_id, assignment_id, cost')
    .in('assignment_id', assignmentIds)
    .eq('passed', true)
    .order('cost', { ascending: true })

  if (!submissions?.length) return NextResponse.json({ overall: [], byAssignment: [] })

  // Collect all unique student IDs
  const allStudentIds = [...new Set(submissions.map((s: { student_id: string }) => s.student_id))]
  const { data: profiles } = await db
    .from('profiles')
    .select('id, name, email')
    .in('id', allStudentIds)

  const profileMap: Record<string, { name: string; email: string }> = {}
  for (const p of profiles ?? []) profileMap[p.id] = { name: p.name, email: p.email }

  // Overall: best (lowest cost) submission per student across all assignments
  const bestByStudent = new Map<string, { cost: number; assignment_id: string }>()
  for (const s of submissions) {
    const existing = bestByStudent.get(s.student_id)
    if (!existing || s.cost < existing.cost) {
      bestByStudent.set(s.student_id, { cost: s.cost, assignment_id: s.assignment_id })
    }
  }

  const overall: LeaderboardRow[] = [...bestByStudent.entries()]
    .sort((a, b) => a[1].cost - b[1].cost)
    .map(([student_id, best], i) => ({
      rank: i + 1,
      student_id,
      name: profileMap[student_id]?.name ?? 'Unknown',
      email: profileMap[student_id]?.email ?? '',
      cost: best.cost,
      assignment_title: titleById[best.assignment_id] ?? 'Bridge Challenge',
    }))

  // Per assignment: group by title, one entry per student per title group (their best for that title)
  const byTitle = new Map<string, Map<string, number>>()
  for (const s of submissions) {
    const title = titleById[s.assignment_id] ?? 'Bridge Challenge'
    if (!byTitle.has(title)) byTitle.set(title, new Map())
    const studentMap = byTitle.get(title)!
    const existing = studentMap.get(s.student_id)
    if (existing === undefined || s.cost < existing) studentMap.set(s.student_id, s.cost)
  }

  const byAssignment = [...byTitle.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([title, studentMap]) => ({
      title,
      rows: [...studentMap.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([student_id, cost], i) => ({
          rank: i + 1,
          student_id,
          name: profileMap[student_id]?.name ?? 'Unknown',
          email: profileMap[student_id]?.email ?? '',
          cost,
          assignment_title: title,
        })),
    }))

  return NextResponse.json({ overall, byAssignment })
}
