import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const db = adminDb()
  const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single()
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await req.json()
  const db = adminDb()
  const { error } = await db.from('profiles').upsert({ ...profile, id: session.user.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
