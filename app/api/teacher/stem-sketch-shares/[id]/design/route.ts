import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherCanAccessClass } from '@/lib/class-access.server'

// POST /api/teacher/stem-sketch-shares/[id]/design  { docJson | docJsonGz, units, thumbnail }
// A teacher on the class saves their edits of a shared design BACK TO THE
// STUDENT as a separate design — "<name> (<teacher>'s version)" — beside the
// untouched original, so the student can compare or pick either. Re-saving
// overwrites that same version row (one per teacher per design), never a pile
// of files. The student gets one feedback note when the version first appears.

async function inflateBase64Gzip(b64: string): Promise<unknown> {
  const { gunzipSync } = await import('node:zlib')
  return JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  let docJson: unknown = body.docJson
  if (!docJson && typeof body.docJsonGz === 'string' && body.docJsonGz.length > 0) {
    try {
      docJson = await inflateBase64Gzip(body.docJsonGz)
    } catch (e) {
      return NextResponse.json({ error: 'Could not decompress docJsonGz: ' + (e as Error).message }, { status: 400 })
    }
  }
  if (!docJson) return NextResponse.json({ error: 'Missing docJson or docJsonGz' }, { status: 400 })

  const db = adminDb()
  const { data: share } = await db
    .from('stem_sketch_shares')
    .select('id, design_id, student_id, class_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await teacherCanAccessClass(db, session.user.id, share.class_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: original } = await db
    .from('stem_sketch_designs')
    .select('name')
    .eq('id', share.design_id)
    .eq('user_id', share.student_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!original) return NextResponse.json({ error: 'The student has deleted this design.' }, { status: 410 })

  const teacher = (session.user.name || session.user.email || 'Teacher').trim()
  const suffix = ` (${teacher}'s version)`
  const versionName = original.name.slice(0, Math.max(10, 80 - suffix.length)) + suffix

  const { data: existing } = await db
    .from('stem_sketch_designs')
    .select('id')
    .eq('user_id', share.student_id)
    .eq('name', versionName)
    .is('deleted_at', null)
    .maybeSingle()

  const now = new Date().toISOString()
  const { data: row, error } = await db
    .from('stem_sketch_designs')
    .upsert(
      {
        user_id: share.student_id,
        name: versionName,
        doc_json: docJson,
        units: body.units ?? 'mm',
        thumbnail: body.thumbnail ?? null,
        updated_at: now,
        deleted_at: null,
      },
      { onConflict: 'user_id,name' },
    )
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!existing) {
    // First time only — later re-saves just refresh the version quietly.
    await db.from('stem_sketch_feedback').insert({
      share_id: share.id,
      author_id: session.user.id,
      body: `✏️ ${teacher} saved an edited version of this design as “${versionName}”. It’s in your My Work next to your original — open either one.`,
    })
  }
  await db.from('stem_sketch_shares').update({ updated_at: now }).eq('id', share.id)

  return NextResponse.json({ ok: true, versionId: row?.id != null ? String(row.id) : null, versionName, created: !existing })
}
