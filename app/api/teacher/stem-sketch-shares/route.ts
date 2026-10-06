import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherCanAccessClass } from '@/lib/class-access.server'

// GET /api/teacher/stem-sketch-shares?classId=X
// Designs students have shared with this class (owner and co-teachers see the
// same list), newest first, with the design's current thumbnail and a
// feedback count.

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  if (!(await teacherCanAccessClass(db, session.user.id, classId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: shares, error } = await db
    .from('stem_sketch_shares')
    .select('id, design_id, student_id, note, created_at, updated_at')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
  if (error) {
    if (/stem_sketch_shares/.test(error.message)) return NextResponse.json([])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!shares?.length) return NextResponse.json([])

  const designIds = [...new Set(shares.map(s => s.design_id))]
  const studentIds = [...new Set(shares.map(s => s.student_id))]
  const shareIds = shares.map(s => s.id)
  const [{ data: designs }, { data: students }, { data: feedback }] = await Promise.all([
    db.from('stem_sketch_designs').select('id, name, units, thumbnail, updated_at, deleted_at').in('id', designIds),
    db.from('profiles').select('id, name, email').in('id', studentIds),
    db.from('stem_sketch_feedback').select('share_id, created_at').in('share_id', shareIds).is('deleted_at', null),
  ])

  type DesignRow = { id: string | number; name: string; units: string; thumbnail: string | null; updated_at: string; deleted_at: string | null }
  const designById = new Map<string, DesignRow>((designs ?? []).map((d: DesignRow) => [String(d.id), d]))
  const studentById = new Map<string, { name: string | null; email: string | null }>(
    (students ?? []).map((p: { id: string; name: string | null; email: string | null }) => [p.id, p]))
  const fbCount = new Map<string, number>()
  const fbLast = new Map<string, string>()
  for (const f of (feedback ?? []) as { share_id: string; created_at: string }[]) {
    fbCount.set(f.share_id, (fbCount.get(f.share_id) ?? 0) + 1)
    if (!fbLast.has(f.share_id) || f.created_at > fbLast.get(f.share_id)!) fbLast.set(f.share_id, f.created_at)
  }

  return NextResponse.json(shares.map(s => {
    const d = designById.get(String(s.design_id))
    const p = studentById.get(s.student_id)
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
      feedbackCount: fbCount.get(s.id) ?? 0,
      lastFeedbackAt: fbLast.get(s.id) ?? null,
    }
  }))
}
