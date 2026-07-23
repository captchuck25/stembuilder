import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// PATCH /api/admin/users/[id]/org  { districtId?: string|null, schoolId?: string|null }
// Assign a user to a district/school.
//   Platform admin: may attach/detach anyone to any district.
//   District admin: may only move users ALREADY IN their district between
//   schools (the RLS update policy makes foreign/unaffiliated rows invisible,
//   and the WITH CHECK refuses moving anyone out of the district). Getting a
//   user INTO a district happens via rostering or a platform admin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body || (!('districtId' in body) && !('schoolId' in body))) {
    return NextResponse.json({ error: 'districtId and/or schoolId required' }, { status: 400 })
  }

  const update: { district_id?: string | null; school_id?: string | null } = {}
  if ('districtId' in body) {
    if (ctx.role !== 'admin') {
      return NextResponse.json({ error: 'Only a platform admin can change district membership' }, { status: 403 })
    }
    update.district_id = body.districtId ?? null
    if (body.districtId === null) update.school_id = null
  }
  if ('schoolId' in body) update.school_id = body.schoolId ?? null

  // A school must belong to the district the user will be in.
  if (update.school_id) {
    const { data: school } = await ctx.db.from('schools').select('id, district_id')
      .eq('id', update.school_id).is('deleted_at', null).maybeSingle()
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })
    if ('district_id' in update) {
      if (school.district_id !== update.district_id) {
        return NextResponse.json({ error: 'School is not in that district' }, { status: 400 })
      }
    } else {
      const { data: target } = await ctx.db.from('profiles').select('district_id')
        .eq('id', id).is('deleted_at', null).maybeSingle()
      if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      if (school.district_id !== target.district_id) {
        return NextResponse.json({ error: 'School is not in that user’s district' }, { status: 400 })
      }
    }
  }

  const { data, error } = await ctx.db.from('profiles').update(update)
    .eq('id', id).is('deleted_at', null)
    .select('id, district_id, school_id').maybeSingle()
  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  if (!data) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await ctx.audit({
    action: 'user.org_assign', targetType: 'profile', targetId: id,
    districtId: data.district_id, metadata: update,
  })
  return NextResponse.json(data)
}
