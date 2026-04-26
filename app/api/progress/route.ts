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
  const { error } = await db.from('user_progress').upsert(
    {
      user_id: session.user.id,
      tool,
      level_idx,
      challenge_idx,
      completed,
      saved_code: saved_code ?? null,
      quiz_score: quiz_score ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,tool,level_idx,challenge_idx' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
