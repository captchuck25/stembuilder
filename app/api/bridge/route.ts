import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data } = await db
    .from('bridge_designs')
    .select('*')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, spanFeet, loadLb, designerName, nodes, members, passed, cost } = body

  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const db = adminDb()
  const { error } = await db
    .from('bridge_designs')
    .upsert(
      {
        user_id: session.user.id,
        name,
        span_feet: spanFeet,
        load_lb: loadLb,
        designer_name: designerName,
        nodes,
        members,
        passed,
        cost,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,name' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
