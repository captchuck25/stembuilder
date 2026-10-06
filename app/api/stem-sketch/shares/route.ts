import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// A student's STEM Sketch shares (migration 0034).
//
// GET  /api/stem-sketch/shares
//   → [{ id, designId, classId, className, note, createdAt, updatedAt,
//        feedback: [{ id, body, authorName, createdAt, isNew }], unread }]
// POST /api/stem-sketch/shares  { designId, classId, note? }
//   → { ok, id, className }  (re-sharing the same design with the same class
//                             just refreshes the note — one live row per pair)

type FeedbackRow = { id: number; share_id: string; author_id: string; body: string; created_at: string }

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data: shares, error } = await db
    .from('stem_sketch_shares')
    .select('id, design_id, class_id, note, created_at, updated_at, student_seen_at')
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) {
    // Table not created yet (0034) — the My Work page just shows no shares.
    if (/stem_sketch_shares/.test(error.message)) return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!shares?.length) return NextResponse.json([])

  const shareIds = shares.map(s => s.id)
  const classIds = [...new Set(shares.map(s => s.class_id))]
  const [{ data: classes }, { data: feedback }] = await Promise.all([
    db.from('classes').select('id, name').in('id', classIds),
    db.from('stem_sketch_feedback').select('id, share_id, author_id, body, created_at')
      .in('share_id', shareIds).is('deleted_at', null).order('created_at'),
  ])
  const className = new Map<string, string>((classes ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))

  const fb = (feedback ?? []) as FeedbackRow[]
  const authorIds = [...new Set(fb.map(f => f.author_id))]
  const authorName = new Map<string, string>()
  if (authorIds.length) {
    const { data: authors } = await db.from('profiles').select('id, name, email').in('id', authorIds)
    for (const a of (authors ?? []) as { id: string; name: string | null; email: string | null }[])
      authorName.set(a.id, a.name || a.email || 'Teacher')
  }

  return NextResponse.json(shares.map(s => {
    const seen = s.student_seen_at ? new Date(s.student_seen_at).getTime() : 0
    const thread = fb.filter(f => f.share_id === s.id).map(f => ({
      id: f.id,
      body: f.body,
      authorName: authorName.get(f.author_id) ?? 'Teacher',
      createdAt: f.created_at,
      isNew: new Date(f.created_at).getTime() > seen,
    }))
    return {
      id: s.id,
      designId: s.design_id,
      classId: s.class_id,
      className: className.get(s.class_id) ?? 'Class',
      note: s.note,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      feedback: thread,
      unread: thread.filter(f => f.isNew).length,
    }
  }))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const designId = body?.designId != null ? String(body.designId) : ''
  const classId = body?.classId != null ? String(body.classId) : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : null
  if (!designId || !classId) return NextResponse.json({ error: 'Missing designId or classId' }, { status: 400 })

  const db = adminDb()
  const [{ data: design }, { data: enrollment }, { data: cls }] = await Promise.all([
    db.from('stem_sketch_designs').select('id').eq('id', designId).eq('user_id', session.user.id).is('deleted_at', null).maybeSingle(),
    db.from('enrollments').select('id').eq('class_id', classId).eq('student_id', session.user.id).is('deleted_at', null).maybeSingle(),
    db.from('classes').select('id, name').eq('id', classId).is('deleted_at', null).maybeSingle(),
  ])
  if (!design) return NextResponse.json({ error: 'Design not found — save it first.' }, { status: 404 })
  if (!cls || !enrollment) return NextResponse.json({ error: 'You can only share with a class you’re in.' }, { status: 403 })

  const now = new Date().toISOString()
  const { data: existing, error: lookupErr } = await db
    .from('stem_sketch_shares')
    .select('id')
    .eq('design_id', designId)
    .eq('class_id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (lookupErr && /stem_sketch_shares/.test(lookupErr.message))
    return NextResponse.json({ error: 'Sharing is not set up yet (migration 0034).' }, { status: 503 })

  if (existing) {
    const { error } = await db.from('stem_sketch_shares').update({ note, updated_at: now }).eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: existing.id, className: cls.name, resent: true })
  }

  const { data: row, error } = await db
    .from('stem_sketch_shares')
    .insert({ design_id: designId, student_id: session.user.id, class_id: classId, note, created_at: now, updated_at: now })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: row.id, className: cls.name })
}
