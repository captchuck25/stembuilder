import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name')
  if (!name) return NextResponse.json({ exists: false })

  const db = adminDb()
  const { data } = await db
    .from('bridge_designs')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('name', name)
    .maybeSingle()

  return NextResponse.json({ exists: data != null })
}
