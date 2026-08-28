import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// Teacher CRUD for Blueprint Lab assignments (briefs + edited rubric + shell
// settings). Requires migration 0023 (blueprint_assignments).
//
// GET    /api/teacher/blueprint-assignments?classId=X          → list
// POST   /api/teacher/blueprint-assignments  {id?, classId, …} → create/update
// DELETE /api/teacher/blueprint-assignments?id=X               → hard delete
//   (class-scoped config with no deleted_at — same policy as
//    stem_sketch_assignments)

async function requireTeacher() {
  const session = await auth()
  if (!session?.user?.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!roleAtLeast(session.user.role, 'teacher')) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { userId: session.user.id }
}

async function ownsClass(db: ReturnType<typeof adminDb>, teacherId: string, classId: string) {
  const { data } = await db
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .single()
  return !!data
}

export async function GET(req: NextRequest) {
  const who = await requireTeacher()
  if ('error' in who) return who.error

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  if (!(await ownsClass(db, who.userId, classId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await db
    .from('blueprint_assignments')
    .select('id, title, brief_id, config, shell_mode, shell_ids, status, created_at, updated_at')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const who = await requireTeacher()
  if ('error' in who) return who.error

  const body = await req.json().catch(() => null)
  if (!body?.classId || !body?.briefId)
    return NextResponse.json({ error: 'Missing classId or briefId' }, { status: 400 })

  const db = adminDb()
  if (!(await ownsClass(db, who.userId, String(body.classId))))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const shellMode = ['scratch', 'choice', 'fixed'].includes(body.shellMode) ? body.shellMode : 'scratch'
  const row = {
    class_id: String(body.classId),
    teacher_id: who.userId,
    title: String(body.title ?? 'Blueprint Assignment').trim().slice(0, 120) || 'Blueprint Assignment',
    brief_id: String(body.briefId),
    config: body.config ?? {},
    shell_mode: shellMode,
    shell_ids: Array.isArray(body.shellIds) ? body.shellIds.map(String) : [],
    status: body.status === 'assigned' ? 'assigned' : 'draft',
    updated_at: new Date().toISOString(),
  }

  if (body.id) {
    const { data, error } = await db
      .from('blueprint_assignments')
      .update(row)
      .eq('id', String(body.id))
      .eq('teacher_id', who.userId)
      .select('id')
      .single()
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, id: data.id })
  }

  const { data, error } = await db
    .from('blueprint_assignments')
    .insert(row)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}

export async function DELETE(req: NextRequest) {
  const who = await requireTeacher()
  if ('error' in who) return who.error

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await adminDb()
    .from('blueprint_assignments')
    .delete()
    .eq('id', id)
    .eq('teacher_id', who.userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
