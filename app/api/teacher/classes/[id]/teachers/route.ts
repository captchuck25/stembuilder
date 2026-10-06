import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { classRoleFor } from '@/lib/class-access.server'

// Co-teachers on a class (migration 0033: class_teachers).
//
// GET    /api/teacher/classes/[id]/teachers                → { owner, coTeachers, role }
// POST   /api/teacher/classes/[id]/teachers  { email }     → add (owner only)
// DELETE /api/teacher/classes/[id]/teachers?teacherId=X    → remove (owner, or a
//                                                            co-teacher removing themselves)

type Who = { id: string; name: string | null; email: string | null }

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()
  const role = await classRoleFor(db, session.user.id, classId)
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  const { data: rows, error } = await db
    .from('class_teachers')
    .select('teacher_id, created_at')
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('created_at')
  if (error && !/class_teachers/.test(error.message))
    return NextResponse.json({ error: error.message }, { status: 500 })

  const coIds = (rows ?? []).map((r: { teacher_id: string }) => r.teacher_id)
  const ids = [cls?.teacher_id, ...coIds].filter(Boolean) as string[]
  const { data: people } = await db.from('profiles').select('id, name, email').in('id', ids).is('deleted_at', null)
  const byId = new Map<string, Who>((people ?? []).map((p: Who) => [p.id, p]))
  const pick = (id: string): Who => byId.get(id) ?? { id, name: null, email: null }

  return NextResponse.json({
    role,
    owner: cls ? pick(cls.teacher_id) : null,
    coTeachers: coIds.map(pick),
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()
  const role = await classRoleFor(db, session.user.id, classId)
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role !== 'owner') return NextResponse.json({ error: 'Only the class owner can add co-teachers.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const email = String(body?.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Enter the co-teacher’s email address.' }, { status: 400 })

  const { data: person } = await db
    .from('profiles')
    .select('id, name, email, role')
    .ilike('email', email)
    .is('deleted_at', null)
    .maybeSingle()
  if (!person || !roleAtLeast(person.role, 'teacher'))
    return NextResponse.json(
      { error: 'No teacher account with that email yet. Ask them to create a StemBuilder teacher account first, then add them.' },
      { status: 404 },
    )
  if (person.id === session.user.id)
    return NextResponse.json({ error: 'You already own this class.' }, { status: 400 })

  const { data: existing } = await db
    .from('class_teachers')
    .select('id')
    .eq('class_id', classId)
    .eq('teacher_id', person.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: `${person.name || person.email} is already a co-teacher.` }, { status: 409 })

  const { error } = await db
    .from('class_teachers')
    .insert({ class_id: classId, teacher_id: person.id, added_by: session.user.id })
  if (error) {
    if (/class_teachers/.test(error.message))
      return NextResponse.json({ error: 'Co-teachers are not set up yet (migration 0033).' }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, teacher: { id: person.id, name: person.name, email: person.email } })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const teacherId = req.nextUrl.searchParams.get('teacherId')
  if (!teacherId) return NextResponse.json({ error: 'Missing teacherId' }, { status: 400 })

  const db = adminDb()
  const role = await classRoleFor(db, session.user.id, classId)
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (role !== 'owner' && teacherId !== session.user.id)
    return NextResponse.json({ error: 'Only the class owner can remove co-teachers.' }, { status: 403 })

  const { error } = await db
    .from('class_teachers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('class_id', classId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
