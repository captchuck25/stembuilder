import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isMeasTool, MAX_SPRINT_POINTS } from '@/app/tools/measurement-lab/constants'

// POST /api/measurement-runs
// Upserts the caller's best 60-second-sprint score for one instrument.
// Monotonic: a lower score never overwrites a higher one (same guard as
// /api/progress/highscore). Client-reported, same trust level as arcade_runs.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tool, points } = await req.json()
  if (!isMeasTool(tool) || !Number.isInteger(points) || points <= 0 || points > MAX_SPRINT_POINTS)
    return NextResponse.json({ error: 'Invalid run' }, { status: 400 })

  const db = adminDb()
  // Read without the deleted_at filter: a tombstoned row still owns the
  // (student_id, tool) unique slot, so a new run must resurrect it.
  const { data: existing } = await db
    .from('measurement_runs')
    .select('id, best_points, deleted_at')
    .eq('student_id', session.user.id)
    .eq('tool', tool)
    .maybeSingle()

  if (!existing) {
    const { error } = await db.from('measurement_runs').insert({
      student_id: session.user.id, tool, best_points: points,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ best: points, improved: true })
  }

  const isBetter = points > existing.best_points
  if (!isBetter && !existing.deleted_at)
    return NextResponse.json({ best: existing.best_points, improved: false })

  // New best, or resurrecting a tombstoned row (fresh play after a restore
  // window makes the old best live again only if we overwrite it — for a
  // tombstoned row we always take the new score).
  const newBest = existing.deleted_at ? points : Math.max(points, existing.best_points)
  const { error } = await db
    .from('measurement_runs')
    .update({ best_points: newBest, best_at: new Date().toISOString(), deleted_at: null })
    .eq('id', existing.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ best: newBest, improved: true })
}
