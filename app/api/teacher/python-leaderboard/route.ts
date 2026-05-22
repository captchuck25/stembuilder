import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export interface PythonLeaderboardRow {
  rank: number
  student_id: string
  name: string
  email: string
  line_count: number
  challenge_title: string
}

export interface PythonLeaderboardResponse {
  overall: PythonLeaderboardRow[]
  byChallenge: { ci: number; title: string; rows: PythonLeaderboardRow[] }[]
}

// Python Code Lab synthesis-level leaderboard.
// Ranks students by fewest non-blank lines of code on Level 5 challenges 6-10
// (zero-indexed: level_idx=4, challenge_idx ∈ {5,6,7,8,9}).
//
// "Overall" picks each student's best (lowest-line) solution across the five
// challenges; per-challenge tabs rank students individually within each one.

const LEVEL_IDX = 4
const CHALLENGE_INDICES = [5, 6, 7, 8, 9] as const

// Maps challenge_idx → human title. Kept in sync with levels.ts L5 challenges
// 6-10 ("Aliens Return" lives at L5-5, not part of this leaderboard).
const CHALLENGE_TITLES: Record<number, string> = {
  5: 'Make Every Shot Count',     // L5-6
  6: 'Six Aliens, Two Shots',     // L5-7
  7: 'The Long Way Around',       // L5-8
  8: "Walk Around, Don't Shoot",  // L5-9
  9: 'Pick Up the Pieces',        // L5-10
}

function countNonBlankLines(code: string | null | undefined): number {
  if (!code) return 0
  let count = 0
  for (const line of code.split('\n')) {
    if (line.trim() !== '') count++
  }
  return count
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()

  // Restrict to students enrolled in this teacher's classes.
  const { data: classes } = await db
    .from('classes')
    .select('id')
    .eq('teacher_id', session.user.id)
  const classIds = (classes ?? []).map((c: { id: string }) => c.id)
  if (classIds.length === 0) return NextResponse.json({ overall: [], byChallenge: [] })

  const { data: enrollments } = await db
    .from('enrollments')
    .select('student_id')
    .in('class_id', classIds)
  const studentIds = [...new Set((enrollments ?? []).map((e: { student_id: string }) => e.student_id))]
  if (studentIds.length === 0) return NextResponse.json({ overall: [], byChallenge: [] })

  const { data: rows } = await db
    .from('user_progress')
    .select('user_id, challenge_idx, completed, saved_code')
    .eq('tool', 'code-lab-python')
    .eq('level_idx', LEVEL_IDX)
    .in('challenge_idx', CHALLENGE_INDICES as unknown as number[])
    .eq('completed', true)
    .in('user_id', studentIds)

  if (!rows?.length) return NextResponse.json({ overall: [], byChallenge: [] })

  const { data: profiles } = await db
    .from('profiles')
    .select('id, name, email')
    .in('id', studentIds)
  const profileMap: Record<string, { name: string; email: string }> = {}
  for (const p of profiles ?? []) profileMap[p.id] = { name: p.name, email: p.email }

  // For each (student, challenge), keep only the entry. user_progress is unique
  // on (user_id, tool, level_idx, challenge_idx), so each row is already unique.
  type Entry = { student_id: string; challenge_idx: number; line_count: number }
  const entries: Entry[] = rows
    .map((r: { user_id: string; challenge_idx: number; saved_code: string | null }) => ({
      student_id: r.user_id,
      challenge_idx: r.challenge_idx,
      line_count: countNonBlankLines(r.saved_code),
    }))
    // A completed row with no saved code can't be ranked — skip it.
    .filter((e: Entry) => e.line_count > 0)

  // Per-challenge: group entries by challenge_idx, rank by line_count ASC.
  const byChallengeMap = new Map<number, Entry[]>()
  for (const ci of CHALLENGE_INDICES) byChallengeMap.set(ci, [])
  for (const e of entries) byChallengeMap.get(e.challenge_idx)?.push(e)

  const byChallenge = CHALLENGE_INDICES
    .map(ci => {
      const sorted = [...(byChallengeMap.get(ci) ?? [])].sort((a, b) => a.line_count - b.line_count)
      const title = CHALLENGE_TITLES[ci] ?? `Challenge ${ci + 1}`
      const rows: PythonLeaderboardRow[] = sorted.map((e, i) => ({
        rank: i + 1,
        student_id: e.student_id,
        name: profileMap[e.student_id]?.name ?? 'Unknown',
        email: profileMap[e.student_id]?.email ?? '',
        line_count: e.line_count,
        challenge_title: title,
      }))
      return { ci, title, rows }
    })
    .filter(c => c.rows.length > 0)

  // Overall: each student's single best (lowest line_count) entry across all five challenges.
  const bestByStudent = new Map<string, Entry>()
  for (const e of entries) {
    const existing = bestByStudent.get(e.student_id)
    if (!existing || e.line_count < existing.line_count) bestByStudent.set(e.student_id, e)
  }

  const overall: PythonLeaderboardRow[] = [...bestByStudent.values()]
    .sort((a, b) => a.line_count - b.line_count)
    .map((e, i) => ({
      rank: i + 1,
      student_id: e.student_id,
      name: profileMap[e.student_id]?.name ?? 'Unknown',
      email: profileMap[e.student_id]?.email ?? '',
      line_count: e.line_count,
      challenge_title: CHALLENGE_TITLES[e.challenge_idx] ?? `Challenge ${e.challenge_idx + 1}`,
    }))

  return NextResponse.json({ overall, byChallenge })
}
