import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherCanAccessClass } from '@/lib/class-access.server'

// One shared design, for the teacher viewer.
//   GET  /api/teacher/stem-sketch-shares/[id]          → share + student + feedback thread
//   POST /api/teacher/stem-sketch-shares/[id]  { body } → leave feedback

async function loadShare(teacherId: string, id: string) {
  const db = adminDb()
  const { data: share } = await db
    .from('stem_sketch_shares')
    .select('id, design_id, student_id, class_id, note, created_at, updated_at')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!share) return { db, share: null, allowed: false }
  const allowed = await teacherCanAccessClass(db, teacherId, share.class_id)
  return { db, share, allowed }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { db, share, allowed } = await loadShare(session.user.id, id)
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: student }, { data: cls }, { data: feedback }] = await Promise.all([
    db.from('profiles').select('id, name, email').eq('id', share.student_id).maybeSingle(),
    db.from('classes').select('id, name').eq('id', share.class_id).maybeSingle(),
    db.from('stem_sketch_feedback').select('id, author_id, body, created_at')
      .eq('share_id', share.id).is('deleted_at', null).order('created_at'),
  ])
  type Fb = { id: number; author_id: string; body: string; created_at: string }
  const fb = (feedback ?? []) as Fb[]
  const authorIds = [...new Set(fb.map(f => f.author_id))]
  const authorName = new Map<string, string>()
  if (authorIds.length) {
    const { data: authors } = await db.from('profiles').select('id, name, email').in('id', authorIds)
    for (const a of (authors ?? []) as { id: string; name: string | null; email: string | null }[])
      authorName.set(a.id, a.name || a.email || 'Teacher')
  }

  return NextResponse.json({
    id: share.id,
    designId: String(share.design_id),
    classId: share.class_id,
    className: cls?.name ?? 'Class',
    student: { id: share.student_id, name: student?.name ?? '', email: student?.email ?? '' },
    note: share.note,
    sharedAt: share.created_at,
    feedback: fb.map(f => ({
      id: f.id,
      body: f.body,
      authorId: f.author_id,
      authorName: authorName.get(f.author_id) ?? 'Teacher',
      mine: f.author_id === session.user.id,
      createdAt: f.created_at,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const payload = await req.json().catch(() => null)
  const body = typeof payload?.body === 'string' ? payload.body.trim().slice(0, 4000) : ''
  if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })

  const { db, share, allowed } = await loadShare(session.user.id, id)
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: row, error } = await db
    .from('stem_sketch_feedback')
    .insert({ share_id: share.id, author_id: session.user.id, body })
    .select('id, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await db.from('stem_sketch_shares').update({ updated_at: new Date().toISOString() }).eq('id', share.id)

  return NextResponse.json({
    ok: true,
    feedback: { id: row.id, body, authorId: session.user.id, authorName: session.user.name ?? 'You', mine: true, createdAt: row.created_at },
  })
}
