import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data } = await db
    .from('turtle_submissions')
    .select('*')
    .eq('user_id', session.user.id)

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { challengeId, code, imageData, submit } = body

  const db = adminDb()
  const record: Record<string, unknown> = {
    user_id: session.user.id,
    challenge_id: challengeId,
    code,
    image_data: imageData,
    updated_at: new Date().toISOString(),
  }
  if (submit) record.submitted_at = new Date().toISOString()

  const { error } = await db
    .from('turtle_submissions')
    .upsert(record, { onConflict: 'user_id,challenge_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
