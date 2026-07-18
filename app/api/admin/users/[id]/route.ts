import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isAdmin } from '@/lib/roles'
import { softDeleteUser } from '@/lib/retention'

// DELETE /api/admin/users/[id]
// SOFT-deletes a user (30-day retention window): soft_delete_user() sets
// deleted_at on the profile and cascades — for teachers, to every class they
// own (plus those classes' enrollments and submissions); for students, to
// their enrollments and per-tool work rows. The daily purge job hard-deletes
// everything 30 days later.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === session!.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account here' }, { status: 400 })
  }

  const db = adminDb()
  const { data: user } = await db.from('profiles').select('id, role').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (isAdmin(user.role)) {
    return NextResponse.json({ error: 'Cannot delete an admin account' }, { status: 400 })
  }

  try {
    await softDeleteUser(id)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
