import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await adminDb()
    .from('stem_sketch_designs')
    .select('id, name, units, thumbnail, updated_at, created_at')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, docJson, units, thumbnail } = body
  if (!name || !docJson) return NextResponse.json({ error: 'Missing name or docJson' }, { status: 400 })

  const { error } = await adminDb()
    .from('stem_sketch_designs')
    .upsert(
      {
        user_id: session.user.id,
        name: name.trim().slice(0, 80) || 'Untitled',
        doc_json: docJson,
        units: units ?? 'mm',
        thumbnail: thumbnail ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,name' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
