import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

async function inflateBase64Gzip(b64: string): Promise<unknown> {
  const bin = Buffer.from(b64, 'base64')
  const { gunzipSync } = await import('node:zlib')
  const json = gunzipSync(bin).toString('utf8')
  return JSON.parse(json)
}

// POST /api/stem-sketch-assignments/[id]/submissions
// Records one submission (append-only — every submit inserts a new row so
// teachers see attempt counts, not just the latest). doc_json is a frozen
// snapshot of the student's model; passed/metrics come from the in-tool
// Manifold fit check. The verdict is client-computed for now — server-side
// re-verification against the challenge's reference geometry is future work.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: assignmentId } = await params
  const body = await req.json()
  const { docJson: rawDocJson, docJsonGz, units, thumbnail, passed, metrics } = body

  if (typeof passed !== 'boolean')
    return NextResponse.json({ error: 'Missing passed' }, { status: 400 })

  let docJson: unknown = rawDocJson
  if (!docJson && typeof docJsonGz === 'string' && docJsonGz.length > 0) {
    try {
      docJson = await inflateBase64Gzip(docJsonGz)
    } catch (e) {
      return NextResponse.json({ error: 'Could not decompress docJsonGz: ' + (e as Error).message }, { status: 400 })
    }
  }
  if (!docJson) return NextResponse.json({ error: 'Missing docJson or docJsonGz' }, { status: 400 })

  const db = adminDb()
  const { data: assignment } = await db
    .from('stem_sketch_assignments')
    .select('id, class_id')
    .eq('id', assignmentId)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', assignment.class_id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!enrollment) return NextResponse.json({ error: 'Not enrolled in this class' }, { status: 403 })

  const { error } = await db.from('stem_sketch_submissions').insert({
    assignment_id: assignmentId,
    student_id: session.user.id,
    doc_json: docJson,
    units: units === 'mm' ? 'mm' : 'in',
    thumbnail: typeof thumbnail === 'string' ? thumbnail : null,
    passed,
    metrics: metrics && typeof metrics === 'object' ? metrics : null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
