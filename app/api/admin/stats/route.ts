import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

const ADMIN_ID = 'user_3CPUWnRGbb5UjjJRoKQx2nVQGyu'

export async function GET() {
  const session = await auth()
  if (session?.user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()

  const [
    { count: totalUsers },
    { count: totalTeachers },
    { count: totalStudents },
    { count: totalClasses },
    { count: totalEnrollments },
    { count: totalProgress },
    { count: totalBridges },
    { count: totalTurtle },
    { data: recentUsers },
    { data: toolBreakdown },
  ] = await Promise.all([
    db.from('profiles').select('*', { count: 'exact', head: true }),
    db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
    db.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    db.from('classes').select('*', { count: 'exact', head: true }),
    db.from('enrollments').select('*', { count: 'exact', head: true }),
    db.from('user_progress').select('*', { count: 'exact', head: true }).eq('completed', true),
    db.from('bridge_designs').select('*', { count: 'exact', head: true }),
    db.from('turtle_submissions').select('*', { count: 'exact', head: true }).not('submitted_at', 'is', null),
    db.from('profiles').select('name, email, role, created_at').order('created_at', { ascending: false }).limit(10),
    db.from('user_progress').select('tool').eq('completed', true),
  ])

  // Count completions per tool
  const toolCounts: Record<string, number> = {}
  for (const row of toolBreakdown ?? []) {
    toolCounts[row.tool] = (toolCounts[row.tool] ?? 0) + 1
  }

  return NextResponse.json({
    users: { total: totalUsers ?? 0, teachers: totalTeachers ?? 0, students: totalStudents ?? 0 },
    classes: { total: totalClasses ?? 0, enrollments: totalEnrollments ?? 0 },
    activity: { completedChallenges: totalProgress ?? 0, bridgeDesigns: totalBridges ?? 0, turtleSubmissions: totalTurtle ?? 0 },
    toolCounts,
    recentUsers: recentUsers ?? [],
  })
}
