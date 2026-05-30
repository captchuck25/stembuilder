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

async function inflateBase64Gzip(b64: string): Promise<unknown> {
  const bin = Buffer.from(b64, 'base64')
  // Node's zlib is available everywhere we run; covers the route on both
  // the Node runtime locally and the Vercel function runtime.
  const { gunzipSync } = await import('node:zlib')
  const json = gunzipSync(bin).toString('utf8')
  return JSON.parse(json)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, docJson: rawDocJson, docJsonGz, units, thumbnail } = body
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  let docJson: unknown = rawDocJson
  if (!docJson && typeof docJsonGz === 'string' && docJsonGz.length > 0) {
    try {
      docJson = await inflateBase64Gzip(docJsonGz)
    } catch (e) {
      return NextResponse.json({ error: 'Could not decompress docJsonGz: ' + (e as Error).message }, { status: 400 })
    }
  }
  if (!docJson) return NextResponse.json({ error: 'Missing docJson or docJsonGz' }, { status: 400 })

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
