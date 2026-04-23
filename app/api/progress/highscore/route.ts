import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { tool, levelIdx, challengeIdx, score } = await req.json()
  const db = adminDb()

  const { data: existing } = await db
    .from('user_progress')
    .select('quiz_score')
    .eq('user_id', session.user.id)
    .eq('tool', tool)
    .eq('level_idx', levelIdx)
    .eq('challenge_idx', challengeIdx)
    .maybeSingle()

  if ((existing?.quiz_score ?? 0) >= score) return NextResponse.json({ ok: true, skipped: true })

  await db.from('user_progress').upsert(
    {
      user_id: session.user.id,
      tool,
      level_idx: levelIdx,
      challenge_idx: challengeIdx,
      completed: true,
      quiz_score: score,
      saved_code: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,tool,level_idx,challenge_idx' }
  )

  return NextResponse.json({ ok: true })
}
