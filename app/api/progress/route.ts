import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tool = req.nextUrl.searchParams.get('tool')
  if (!tool) return NextResponse.json({ error: 'Missing tool' }, { status: 400 })

  const db = adminDb()
  // Prefix query (e.g. 'meas' matches 'meas-ruler', 'meas-cylinder')
  // Exact query for fully-qualified tool ids (e.g. 'code-lab-python')
  const q = db
    .from('user_progress')
    .select('tool, level_idx, challenge_idx, completed, quiz_score, saved_code, updated_at')
    .eq('user_id', session.user.id)
  const { data } = await (tool.includes('-')
    ? q.eq('tool', tool)
    : q.ilike('tool', `${tool}-%`))

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { tool, level_idx, challenge_idx, completed, saved_code, quiz_score } = body

  const db = adminDb()

  // Preserve fields when the caller didn't send them. Previously this endpoint
  // always upserted a full row, so any call that only set "completed" (e.g.
  // re-marking a level done after the quiz had already been taken) would write
  // quiz_score=null and silently erase the student's score. The level-marker
  // sync fires on every challenge completion, so the loss happened anytime a
  // student revisited a finished challenge after the quiz.
  // Now: only overwrite a column if the request explicitly provided it.
  const hasSavedCode = saved_code !== undefined && saved_code !== null
  const hasQuizScore = quiz_score !== undefined && quiz_score !== null

  const conflictKey = 'user_id,tool,level_idx,challenge_idx'

  if (!hasSavedCode || !hasQuizScore) {
    // Need to read the existing row first so we don't clobber the values we
    // weren't asked to change. Skipped when the caller sent both fields.
    const { data: existing } = await db
      .from('user_progress')
      .select('saved_code, quiz_score')
      .eq('user_id', session.user.id)
      .eq('tool', tool)
      .eq('level_idx', level_idx)
      .eq('challenge_idx', challenge_idx)
      .maybeSingle()
    const row = {
      user_id: session.user.id,
      tool,
      level_idx,
      challenge_idx,
      completed,
      saved_code: hasSavedCode ? saved_code : (existing?.saved_code ?? null),
      quiz_score: hasQuizScore ? quiz_score : (existing?.quiz_score ?? null),
      updated_at: new Date().toISOString(),
    }
    const { error } = await db.from('user_progress').upsert(row, { onConflict: conflictKey })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await db.from('user_progress').upsert(
    {
      user_id: session.user.id,
      tool,
      level_idx,
      challenge_idx,
      completed,
      saved_code,
      quiz_score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: conflictKey }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
