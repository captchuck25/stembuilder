import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/lib/db.server'
import { sha256 } from '@/lib/reset.server'
import { writeAudit } from '@/lib/audit.server'
import { isAdmin } from '@/lib/roles'

// District-admin invite acceptance. Public endpoint — authorization is the
// single-use emailed token itself (only its SHA-256 hash is stored). The
// district_admin role is applied HERE and nowhere else reachable by users:
// invites can only be created by a platform admin, so this is not a
// self-service escalation path.

async function loadInvite(token: string) {
  const db = adminDb()
  const { data: invite } = await db
    .from('district_admin_invites')
    .select('id, email, district_id, invited_by, expires_at, used_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()
  if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) return null
  const { data: district } = await db.from('districts').select('id, name')
    .eq('id', invite.district_id).is('deleted_at', null).maybeSingle()
  if (!district) return null
  return { invite, district, db }
}

// GET /api/admin/invite/accept?token=…  — peek for the accept page: is the
// token valid, which district, and does an account already exist for the email
// (decides whether the page asks for name + password).
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const loaded = token ? await loadInvite(token) : null
  if (!loaded) return NextResponse.json({ error: 'Invite is invalid or has expired' }, { status: 404 })

  const { data: existing } = await loaded.db.from('profiles').select('id')
    .eq('email', loaded.invite.email).is('deleted_at', null).maybeSingle()
  return NextResponse.json({
    email: loaded.invite.email,
    districtName: loaded.district.name,
    accountExists: !!existing,
  })
}

// POST /api/admin/invite/accept  { token, name?, password? }
// Existing account: elevates it to district_admin for the invite's district.
// No account: creates one (name + password required).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const loaded = token ? await loadInvite(token) : null
  if (!loaded) return NextResponse.json({ error: 'Invite is invalid or has expired' }, { status: 404 })
  const { invite, district, db } = loaded

  const { data: existing } = await db.from('profiles').select('id, role, district_id')
    .eq('email', invite.email).is('deleted_at', null).maybeSingle()

  let userId: string
  if (existing) {
    // Never downgrade a platform admin, never reassign another district's admin.
    if (isAdmin(existing.role)) {
      return NextResponse.json({ error: 'This account is a platform admin already' }, { status: 400 })
    }
    if (existing.role === 'district_admin' && existing.district_id && existing.district_id !== invite.district_id) {
      return NextResponse.json({ error: 'This account already administers another district' }, { status: 400 })
    }
    const { error } = await db.from('profiles').update({
      role: 'district_admin',
      district_id: invite.district_id,
      email_verified_at: new Date().toISOString(), // token proved address control
    }).eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    userId = existing.id
  } else {
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const { data: created, error } = await db.from('profiles').insert({
      name,
      email: invite.email,
      password_hash: await bcrypt.hash(password, 12),
      role: 'district_admin',
      district_id: invite.district_id,
      email_verified_at: new Date().toISOString(),
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    userId = created.id
  }

  await db.from('district_admin_invites')
    .update({ used_at: new Date().toISOString() }).eq('id', invite.id)

  await writeAudit({
    actorId: userId,
    actorRole: 'district_admin',
    action: 'admin.grant_accepted',
    targetType: 'profile',
    targetId: userId,
    districtId: invite.district_id,
    metadata: { invitedBy: invite.invited_by },
  })

  return NextResponse.json({ ok: true, districtName: district.name })
}
