import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// Lists the current user's Blueprint Lab designs (no doc_json — keep the
// list payload small). Matches the shape of /api/stem-sketch/designs.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await adminDb()
    .from('blueprint_lab_designs')
    .select('id, name, units, thumbnail, updated_at, created_at')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

// Upsert by (user_id, name). Saving with the same name overwrites — saving
// with a new name creates a new entry. Mirrors the stem-sketch flow.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, docJson, units, thumbnail } = body
  if (!name || !docJson) return NextResponse.json({ error: 'Missing name or docJson' }, { status: 400 })

  const { data, error } = await adminDb()
    .from('blueprint_lab_designs')
    .upsert(
      {
        user_id: session.user.id,
        name: name.trim().slice(0, 80) || 'Untitled',
        doc_json: docJson,
        units: units ?? 'imperial',
        thumbnail: thumbnail ?? null,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      { onConflict: 'user_id,name' }
    )
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}
