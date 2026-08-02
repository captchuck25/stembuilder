import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// POST   /api/admin/users/[id]/schools  { schoolId }  — add a school membership
// DELETE /api/admin/users/[id]/schools  { schoolId }  — remove one
//
// Teacher ↔ school assignment (many-to-many; a teacher can serve several
// buildings). Runs on the tenant client: RLS confines both admin tiers to
// schools and teachers of their own district. profiles.school_id stays in
// sync as the PRIMARY school (first membership) — it's what new classes stamp.

async function syncPrimarySchool(ctx: Awaited<ReturnType<typeof requireAdmin>>, userId: string) {
  if (ctx instanceof NextResponse) return
  const { data: memberships } = await ctx.db.from('school_memberships')
    .select('school_id').eq('user_id', userId).order('created_at').limit(1)
  await ctx.db.from('profiles')
    .update({ school_id: memberships?.[0]?.school_id ?? null })
    .eq('id', userId)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id: userId } = await params

  const body = await req.json().catch(() => null)
  const schoolId = typeof body?.schoolId === 'string' ? body.schoolId : ''
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 })

  const { data: school, error } = await ctx.db.from('schools').select('id, district_id')
    .eq('id', schoolId).is('deleted_at', null).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const { error: insErr } = await ctx.db.from('school_memberships')
    .insert({ user_id: userId, school_id: schoolId })
  if (insErr && !insErr.message.includes('duplicate')) {
    const status = /row-level security/i.test(insErr.message) ? 403 : 500
    return NextResponse.json({ error: insErr.message }, { status })
  }

  await syncPrimarySchool(ctx, userId)
  await ctx.audit({
    action: 'teacher.school_add', targetType: 'profile', targetId: userId,
    districtId: school.district_id, metadata: { schoolId },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id: userId } = await params

  const body = await req.json().catch(() => null)
  const schoolId = typeof body?.schoolId === 'string' ? body.schoolId : ''
  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 })

  const { data: school } = await ctx.db.from('schools').select('id, district_id')
    .eq('id', schoolId).maybeSingle()

  const { error } = await ctx.db.from('school_memberships')
    .delete().eq('user_id', userId).eq('school_id', schoolId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await syncPrimarySchool(ctx, userId)
  await ctx.audit({
    action: 'teacher.school_remove', targetType: 'profile', targetId: userId,
    districtId: school?.district_id ?? ctx.districtId, metadata: { schoolId },
  })
  return NextResponse.json({ ok: true })
}
