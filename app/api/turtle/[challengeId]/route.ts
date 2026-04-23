import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ challengeId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { challengeId } = await params
  const db = adminDb()
  const { data } = await db
    .from('turtle_submissions')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('challenge_id', challengeId)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}
