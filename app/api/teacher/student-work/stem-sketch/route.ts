import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherSharesClassWithStudent } from '@/lib/teacher-access'

// GET /api/teacher/student-work/stem-sketch?designId=X
// Returns a student's saved STEM Sketch design (read-only for teacher demo view).
// Permission: the teacher must own at least one class that the design's owner is enrolled in.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const designId = req.nextUrl.searchParams.get('designId')
  if (!designId) return NextResponse.json({ error: 'Missing designId' }, { status: 400 })

  const db = adminDb()

  const { data: design } = await db
    .from('stem_sketch_designs')
    .select('id, user_id, name, units, doc_json, thumbnail, updated_at')
    .eq('id', designId)
    .maybeSingle()

  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await teacherSharesClassWithStudent(db, session.user.id, design.user_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: profile } = await db
    .from('profiles')
    .select('id, name, email')
    .eq('id', design.user_id)
    .single()

  return NextResponse.json({
    design: {
      id: design.id,
      name: design.name,
      units: design.units,
      doc_json: design.doc_json,
      thumbnail: design.thumbnail,
      updated_at: design.updated_at,
    },
    student: profile ?? { id: design.user_id, name: '', email: '' },
  })
}
