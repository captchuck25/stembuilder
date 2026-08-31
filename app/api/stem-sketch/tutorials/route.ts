import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isTrackableTutorialId } from '@/lib/stem-sketch/tutorials'

// STEM Sketch tutorial progress — free for every signed-in user (no plan
// gate: tutorials are the on-ramp, not a Pro feature). Content lives in code
// (lib/stem-sketch/tutorials.ts + the tool); this route only records and
// returns completion.

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data, error } = await db
    .from('stem_sketch_tutorial_progress')
    .select('tutorial_id, completed_at')
    .eq('user_id', session.user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    completed: (data ?? []).map(r => ({ tutorialId: r.tutorial_id, completedAt: r.completed_at })),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let tutorialId: unknown
  try {
    ;({ tutorialId } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }
  if (typeof tutorialId !== 'string' || !isTrackableTutorialId(tutorialId)) {
    return NextResponse.json({ error: 'Unknown tutorial' }, { status: 400 })
  }

  const db = adminDb()
  // First completion wins: re-doing a tutorial must not move completed_at
  // (teachers read it as "when the student first finished").
  const { error } = await db
    .from('stem_sketch_tutorial_progress')
    .upsert(
      { user_id: session.user.id, tutorial_id: tutorialId },
      { onConflict: 'user_id,tutorial_id', ignoreDuplicates: true },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
