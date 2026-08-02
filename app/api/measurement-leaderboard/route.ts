import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { MEAS_TOOL_IDS } from '@/app/tools/measurement-lab/constants'
import { formatLeaderboardName } from '@/app/tools/measurement-lab/name-format'

// GET /api/measurement-leaderboard?classId=X&scope=class|combined
// Top-10 sprint leaderboards, per instrument plus an "overall" (sum of each
// student's bests). scope=class ranks the class roster; scope=combined ranks
// the union of the class teacher's classes that have leaderboards enabled.
// Access: the owning teacher or an enrolled student of the anchor class.
// Names are formatted server-side ("First L." / username) — full names and
// emails never leave this endpoint.

const DISABLED = { leaderboardEnabled: false, boards: {}, overall: [] }

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const classId = req.nextUrl.searchParams.get('classId')
  const scope = req.nextUrl.searchParams.get('scope') === 'combined' ? 'combined' : 'class'
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db
    .from('classes')
    .select('id, teacher_id, leaderboard_enabled')
    .eq('id', classId)
    .is('deleted_at', null)
    .single()
  if (!cls) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwningTeacher = cls.teacher_id === session.user.id
  if (!isOwningTeacher) {
    const { data: enrollment } = await db
      .from('enrollments')
      .select('id')
      .eq('class_id', classId)
      .eq('student_id', session.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Column may not exist until migration 0015 has run — treat missing as enabled.
  const anchorEnabled = cls.leaderboard_enabled !== false
  // Students of an opted-out class see no boards at all; the teacher still
  // sees the class data (so they can judge whether to re-enable).
  if (!anchorEnabled && !isOwningTeacher) return NextResponse.json(DISABLED)

  // Build the roster.
  let rosterClassIds: string[]
  if (scope === 'combined') {
    const { data: teacherClasses } = await db
      .from('classes')
      .select('id, leaderboard_enabled')
      .eq('teacher_id', cls.teacher_id)
      .is('deleted_at', null)
    // Combined boards only surface classes that opted in; the anchor class is
    // included for the owning teacher even when disabled (teacher-only view).
    rosterClassIds = (teacherClasses ?? [])
      .filter((c: { id: string; leaderboard_enabled: boolean | null }) =>
        c.leaderboard_enabled !== false || (isOwningTeacher && c.id === classId))
      .map((c: { id: string }) => c.id)
  } else {
    rosterClassIds = [classId]
  }

  const { data: enrollments } = await db
    .from('enrollments')
    .select('student_id')
    .in('class_id', rosterClassIds)
    .is('deleted_at', null)
  const roster = [...new Set((enrollments ?? []).map((e: { student_id: string }) => e.student_id))]

  if (!roster.length) {
    return NextResponse.json({ leaderboardEnabled: anchorEnabled, boards: {}, overall: [] })
  }

  const [{ data: runs }, { data: profiles }] = await Promise.all([
    db.from('measurement_runs')
      .select('student_id, tool, best_points')
      .in('student_id', roster)
      .is('deleted_at', null),
    db.from('profiles')
      .select('id, name, username')
      .in('id', roster)
      .is('deleted_at', null),
  ])

  const nameMap = new Map(
    (profiles ?? []).map((p: { id: string; name: string | null; username: string | null }) =>
      [p.id, formatLeaderboardName(p.name, p.username)])
  )
  const liveRuns = (runs ?? []).filter((r: { student_id: string }) => nameMap.has(r.student_id))

  const boards: Record<string, { name: string; points: number }[]> = {}
  for (const tool of MEAS_TOOL_IDS) {
    boards[tool] = liveRuns
      .filter((r: { tool: string }) => r.tool === tool)
      .sort((a: { best_points: number }, b: { best_points: number }) => b.best_points - a.best_points)
      .slice(0, 10)
      .map((r: { student_id: string; best_points: number }) => ({
        name: nameMap.get(r.student_id)!,
        points: r.best_points,
      }))
  }

  const totals = new Map<string, number>()
  for (const r of liveRuns) {
    totals.set(r.student_id, (totals.get(r.student_id) ?? 0) + r.best_points)
  }
  const overall = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([studentId, points]) => ({ name: nameMap.get(studentId)!, points }))

  return NextResponse.json({ leaderboardEnabled: anchorEnabled, boards, overall })
}
