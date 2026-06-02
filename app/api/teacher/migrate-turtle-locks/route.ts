import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { CHALLENGES as TURTLE_CHALLENGES } from '@/app/tools/code-lab/turtle/challenges'

// One-time migration: fix classes that were auto-seeded with the wrong turtle lock
// indexing (level_idx in 0..(challengeCount-1) — only counted challenges, missed
// tutorials and used a range that maps to the wrong items in the new full-array
// indexing the teacher UI relies on).
//
// We're conservative: only auto-fix classes where the teacher hasn't touched turtle
// at all. Specifically, the lock set must EXACTLY match the buggy auto-seed pattern
// AND there must be no turtle_assignments rows for the class. Otherwise we leave
// the class alone — the teacher can clean it up via the 3-state UI without us
// stomping on their intent.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const challengeCount = TURTLE_CHALLENGES.filter(c => c.category === 'challenge').length
  const fullCount = TURTLE_CHALLENGES.length

  // Find every class this teacher owns
  const { data: classes } = await db
    .from('classes')
    .select('id')
    .eq('teacher_id', session.user.id)

  const classIds = (classes ?? []).map((c: { id: string }) => c.id)
  if (classIds.length === 0) return NextResponse.json({ migrated: 0, skipped: 0 })

  // Pull all the data we need in three bulk queries
  const [{ data: allLocks }, { data: allTurtleAssignments }] = await Promise.all([
    db.from('lesson_locks')
      .select('id, class_id, level_idx, challenge_idx')
      .eq('tool', 'turtle')
      .in('class_id', classIds),
    db.from('turtle_assignments')
      .select('class_id')
      .in('class_id', classIds),
  ])

  type LockRow = { id: string; class_id: string; level_idx: number; challenge_idx: number }
  const locksByClass = new Map<string, LockRow[]>()
  for (const l of (allLocks ?? []) as LockRow[]) {
    if (!locksByClass.has(l.class_id)) locksByClass.set(l.class_id, [])
    locksByClass.get(l.class_id)!.push(l)
  }
  const classesWithTurtleAssignments = new Set(
    (allTurtleAssignments ?? []).map((r: { class_id: string }) => r.class_id),
  )

  // The exact buggy-auto-seed signature for a class:
  //   exactly `challengeCount` lesson_locks rows for tool='turtle'
  //   level_idx values are exactly the set {0, 1, ..., challengeCount-1}
  //   challenge_idx === -1 on every row
  //   no turtle_assignments rows for this class
  function looksLikeBuggyAutoSeed(rows: LockRow[]): boolean {
    if (rows.length !== challengeCount) return false
    const idxSet = new Set<number>()
    for (const r of rows) {
      if (r.challenge_idx !== -1) return false
      idxSet.add(r.level_idx)
    }
    if (idxSet.size !== challengeCount) return false
    for (let i = 0; i < challengeCount; i++) {
      if (!idxSet.has(i)) return false
    }
    return true
  }

  let migrated = 0
  let skipped = 0
  const fixedClassIds: string[] = []

  for (const classId of classIds) {
    const rows = locksByClass.get(classId) ?? []
    if (classesWithTurtleAssignments.has(classId)) { skipped++; continue }
    if (!looksLikeBuggyAutoSeed(rows)) { skipped++; continue }

    // Wipe the buggy locks and re-seed at the correct full-array positions.
    // Done in two steps because mixing delete+insert in one Supabase call isn't
    // available, and we don't have transactions exposed through the SDK.
    const lockIds = rows.map(r => r.id)
    if (lockIds.length > 0) {
      const { error: delErr } = await db.from('lesson_locks').delete().in('id', lockIds)
      if (delErr) { skipped++; continue }
    }
    const newRows = Array.from({ length: fullCount }, (_, i) => ({
      class_id: classId,
      tool: 'turtle' as const,
      level_idx: i,
      challenge_idx: -1,
    }))
    const { error: insErr } = await db.from('lesson_locks').insert(newRows)
    if (insErr) {
      // Best-effort: log and continue. The class is now without locks, but the
      // teacher can re-lock via "Lock All" in the dashboard.
      console.error('migrate-turtle-locks: re-seed failed for class', classId, insErr)
      skipped++
      continue
    }
    migrated++
    fixedClassIds.push(classId)
  }

  return NextResponse.json({ migrated, skipped, fixedClassIds })
}
