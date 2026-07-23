import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isAdmin, roleAtLeast } from '@/lib/roles'
import { teacherSharesClassWithStudent } from '@/lib/teacher-access'
import { softDeleteUser, softDeleteClass } from '@/lib/retention'

// POST /api/deletion-request  { type: 'student' | 'class' | 'account', id }
//
// Reusable deletion-request handler for the 30-day retention window: a
// teacher, school (via its teacher account), or admin soft-deletes a student,
// a class, or an account. Data disappears from the app immediately and is
// hard-purged 30 days later (see db/migrations/0005 + 0006).
//
// Authorization:
//  - admin:   any student/class/account except admin accounts and themself
//  - teacher: a class they own, a student enrolled in one of their classes,
//             or their own account ('account' with their own id)
//  - student: not allowed — COPPA deletion requests route through the
//             teacher/school or an admin
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: callerId, role } = session.user
  if (!roleAtLeast(role, 'teacher')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { type, id } = await req.json().catch(() => ({}))
  if (!id || !['student', 'class', 'account'].includes(type)) {
    return NextResponse.json({ error: "Expected { type: 'student' | 'class' | 'account', id }" }, { status: 400 })
  }

  const db = adminDb()

  if (type === 'class') {
    const { data: cls } = await db
      .from('classes').select('id, teacher_id').eq('id', id).is('deleted_at', null).maybeSingle()
    if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    if (!isAdmin(role) && cls.teacher_id !== callerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await softDeleteClass(id)
    return NextResponse.json({ ok: true, softDeleted: 'class', id })
  }

  // 'student' and 'account' both soft-delete a profile; they differ only in
  // who may request it.
  const { data: target } = await db
    .from('profiles').select('id, role').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (isAdmin(target.role)) {
    return NextResponse.json({ error: 'Cannot delete an admin account' }, { status: 400 })
  }

  if (isAdmin(role)) {
    if (id === callerId) {
      return NextResponse.json({ error: 'You cannot delete your own account here' }, { status: 400 })
    }
  } else if (type === 'account' && id === callerId) {
    // Teacher deleting their own account — allowed (cascades their classes).
  } else if (target.role === 'student' && (await teacherSharesClassWithStudent(db, callerId, id))) {
    // Teacher deleting a student in one of their classes — allowed.
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await softDeleteUser(id)
  return NextResponse.json({ ok: true, softDeleted: type, id })
}
