import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { isAnyAdmin } from '@/lib/roles'
import { softDeleteUser } from '@/lib/retention'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// DELETE /api/admin/users/[id]
// SOFT-deletes a user (30-day retention window): soft_delete_user() sets
// deleted_at on the profile and cascades — for teachers, to every class they
// own (plus those classes' enrollments and submissions); for students, to
// their enrollments and per-tool work rows. The daily purge job hard-deletes
// everything 30 days later.
//
// Platform admins may delete any non-admin account. District admins may
// delete teachers/students of THEIR OWN district only — the cascade RPC runs
// on the service role, so the district scope is verified explicitly here
// (the tenant read below can't even see foreign-district rows) and the
// action is audited.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const { id } = await params
  if (id === ctx.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account here' }, { status: 400 })
  }

  // Authoritative target lookup (service role), then explicit scope checks.
  const { data: user } = await adminDb().from('profiles')
    .select('id, role, district_id')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (isAnyAdmin(user.role)) {
    return NextResponse.json({ error: 'Cannot delete an admin account' }, { status: 400 })
  }
  if (ctx.role === 'district_admin' && user.district_id !== ctx.districtId) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 }) // no cross-tenant existence leak
  }

  try {
    await softDeleteUser(id)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  await ctx.audit({
    action: 'user.delete', targetType: 'profile', targetId: id,
    districtId: user.district_id, metadata: { role: user.role },
  })
  return NextResponse.json({ ok: true })
}
