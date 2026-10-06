import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherCanAccessClass } from '@/lib/class-access.server'

// GET /api/teacher/stem-sketch-shares?classId=X
// Designs students have shared with this class (owner and co-teachers see the
// same inbox): { active: [...], archived: [...] }, newest first. Each row
// carries the design's current thumbnail plus reply state so a teacher can
// see what still needs attention.

type ShareRow = {
  id: string; design_id: string; student_id: string; note: string | null
  created_at: string; updated_at: string; archived_at?: string | null
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  if (!(await teacherCanAccessClass(db, session.user.id, classId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const empty = { active: [], archived: [] }
  const base = 'id, design_id, student_id, note, created_at, updated_at'
  let shares: ShareRow[] | null = null
  let error: { message: string } | null = null
  {
    const r = await db
      .from('stem_sketch_shares')
      .select(`${base}, archived_at`)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
    shares = r.data as ShareRow[] | null
    error = r.error
  }
  if (error && /archived_at/.test(error.message)) {
    // Migration 0035 not run yet — serve the list with nothing archived.
    const r = await db
      .from('stem_sketch_shares')
      .select(base)
      .eq('class_id', classId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
    shares = r.data as ShareRow[] | null
    error = r.error
  }
  if (error) {
    if (/stem_sketch_shares/.test(error.message)) return NextResponse.json(empty)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = (shares ?? []) as ShareRow[]
  if (!rows.length) return NextResponse.json(empty)

  const designIds = [...new Set(rows.map(s => s.design_id))]
  const studentIds = [...new Set(rows.map(s => s.student_id))]
  const shareIds = rows.map(s => s.id)
  const [{ data: designs }, { data: students }, { data: feedback }] = await Promise.all([
    db.from('stem_sketch_designs').select('id, name, units, thumbnail, updated_at, deleted_at').in('id', designIds),
    db.from('profiles').select('id, name, email').in('id', studentIds),
    db.from('stem_sketch_feedback').select('share_id, author_id, created_at').in('share_id', shareIds).is('deleted_at', null).order('created_at'),
  ])

  type DesignRow = { id: string | number; name: string; units: string; thumbnail: string | null; updated_at: string; deleted_at: string | null }
  type Fb = { share_id: string; author_id: string; created_at: string }
  const designById = new Map<string, DesignRow>((designs ?? []).map((d: DesignRow) => [String(d.id), d]))
  const studentById = new Map<string, { name: string | null; email: string | null }>(
    (students ?? []).map((p: { id: string; name: string | null; email: string | null }) => [p.id, p]))
  const fb = (feedback ?? []) as Fb[]

  // Names for whoever replied (co-teachers show by name; "You" is decided client-side via mine).
  const authorIds = [...new Set(fb.map(f => f.author_id))].filter(a => a !== session.user.id)
  const authorName = new Map<string, string>()
  if (authorIds.length) {
    const { data: authors } = await db.from('profiles').select('id, name, email').in('id', authorIds)
    for (const a of (authors ?? []) as { id: string; name: string | null; email: string | null }[])
      authorName.set(a.id, a.name || a.email || 'Teacher')
  }

  const shaped = rows.map(s => {
    const d = designById.get(String(s.design_id))
    const p = studentById.get(s.student_id)
    const thread = fb.filter(f => f.share_id === s.id)
    const last = thread[thread.length - 1]
    return {
      id: s.id,
      designId: String(s.design_id),
      designName: d?.name ?? 'Design',
      designDeleted: !d || !!d.deleted_at,
      units: d?.units ?? '',
      thumbnail: d?.thumbnail ?? null,
      designUpdatedAt: d?.updated_at ?? s.updated_at,
      studentId: s.student_id,
      studentName: p?.name || p?.email || 'Student',
      note: s.note,
      sharedAt: s.created_at,
      updatedAt: s.updated_at,
      feedbackCount: thread.length,
      lastFeedbackAt: last?.created_at ?? null,
      // Reply state for the inbox badge.
      repliedByMe: thread.some(f => f.author_id === session.user.id),
      lastReplyBy: last ? (last.author_id === session.user.id ? 'you' : authorName.get(last.author_id) ?? 'a co-teacher') : null,
      archivedAt: s.archived_at ?? null,
    }
  })
  return NextResponse.json({
    active: shaped.filter(s => !s.archivedAt),
    archived: shaped.filter(s => s.archivedAt),
  })
}
