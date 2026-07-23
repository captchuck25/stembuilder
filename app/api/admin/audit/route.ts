import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// GET /api/admin/audit?districtId=…&limit=…
// Admin audit trail. Tenant client + RLS: platform admins read everything,
// district admins read only rows stamped with their district — the districtId
// filter is a UI convenience, not the enforcement.
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const url = new URL(req.url)
  const districtId = url.searchParams.get('districtId')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500)

  let query = ctx.db.from('admin_audit_log')
    .select('id, actor_id, actor_role, action, target_type, target_id, district_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (districtId) query = query.eq('district_id', districtId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
