import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isAdmin } from '@/lib/roles'

// DELETE /api/admin/users/[id]
// Cascade-deletes a user. For teachers, also tears down all classes they own
// (and the enrollments/assignments/lesson_locks under those classes). For
// students, also tears down their enrollments and per-tool work rows.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === session!.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account here' }, { status: 400 })
  }

  const db = adminDb()
  const { data: user } = await db.from('profiles').select('id, role').eq('id', id).maybeSingle()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (isAdmin(user.role)) {
    return NextResponse.json({ error: 'Cannot delete an admin account' }, { status: 400 })
  }

  if (user.role === 'teacher') {
    const { data: classes } = await db.from('classes').select('id').eq('teacher_id', id)
    const classIds = (classes ?? []).map((c: { id: string }) => c.id)
    if (classIds.length) {
      await Promise.all([
        db.from('enrollments').delete().in('class_id', classIds),
        db.from('assignments').delete().in('class_id', classIds),
        db.from('lesson_locks').delete().in('class_id', classIds),
      ])
      await db.from('classes').delete().in('id', classIds)
    }
  } else {
    await Promise.all([
      db.from('enrollments').delete().eq('student_id', id),
      db.from('user_progress').delete().eq('user_id', id),
      db.from('bridge_designs').delete().eq('user_id', id),
      db.from('turtle_submissions').delete().eq('user_id', id),
    ])
  }

  const { error } = await db.from('profiles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
