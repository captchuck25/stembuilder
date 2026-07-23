import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { adminDb } from '@/lib/db.server'
import { createResetToken } from '@/lib/reset.server'
import { sendEmail } from '@/lib/email'
import { isAdmin } from '@/lib/roles'

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

// POST /api/admin/districts/[id]/admins  { email }
// Platform admin only: grant district_admin by emailed invite. The role is
// applied only when the recipient accepts the token (proving control of the
// address) — never directly, so there is no way to silently elevate an
// existing account. Re-inviting the same email replaces the pending invite.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const db = adminDb()
  const { data: district } = await db.from('districts').select('id, name')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  // An existing account may be invited (it becomes district_admin on accept) —
  // unless it already holds a platform-admin or other-district admin role.
  const { data: existing } = await db.from('profiles').select('id, role, district_id')
    .eq('email', email).is('deleted_at', null).maybeSingle()
  if (existing && isAdmin(existing.role)) {
    return NextResponse.json({ error: 'That account is a platform admin already' }, { status: 400 })
  }
  if (existing?.role === 'district_admin' && existing.district_id && existing.district_id !== id) {
    return NextResponse.json({ error: 'That account already administers another district' }, { status: 400 })
  }

  const { raw, hash } = createResetToken()
  await db.from('district_admin_invites').delete().eq('email', email).eq('district_id', id).is('used_at', null)
  const { error } = await db.from('district_admin_invites').insert({
    email,
    district_id: id,
    invited_by: ctx.userId,
    token_hash: hash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const origin = new URL(req.url).origin
  const url = `${origin}/admin/invite?token=${encodeURIComponent(raw)}`
  const sent = await sendEmail({
    to: email,
    subject: `You've been invited to administer ${district.name} on StemBuilder`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>District admin invitation</h2>
        <p>You've been invited to be a district administrator for
        <strong>${district.name}</strong> on StemBuilder — managing schools,
        teachers, and student rosters for your district.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#1f1f1f;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold">
            Accept invitation
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">This link expires in 7 days.
        If you weren't expecting this, you can ignore this email.</p>
      </div>`,
    text: `Accept your StemBuilder district admin invitation for ${district.name}: ${url} (expires in 7 days)`,
  })

  await ctx.audit({ action: 'admin.invite', targetType: 'invite', targetId: email, districtId: id })

  // Mirror the reset-flow behavior: surface the link on non-production
  // environments where no email provider is configured.
  if (!sent && process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ ok: true, sent: false, devInviteUrl: url })
  }
  return NextResponse.json({ ok: true, sent })
}

// DELETE /api/admin/districts/[id]/admins  { userId? , inviteId? }
// Platform admin only: revoke a district admin (demotes to teacher) or cancel
// a pending invite.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const db = adminDb()

  if (body?.inviteId) {
    const { error } = await db.from('district_admin_invites').delete()
      .eq('id', body.inviteId).eq('district_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await ctx.audit({ action: 'admin.invite_revoke', targetType: 'invite', targetId: String(body.inviteId), districtId: id })
    return NextResponse.json({ ok: true })
  }

  if (typeof body?.userId === 'string') {
    const { data: target } = await db.from('profiles').select('id, role, district_id')
      .eq('id', body.userId).is('deleted_at', null).maybeSingle()
    if (!target || target.role !== 'district_admin' || target.district_id !== id) {
      return NextResponse.json({ error: 'Not a district admin of this district' }, { status: 404 })
    }
    const { error } = await db.from('profiles').update({ role: 'teacher' }).eq('id', target.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await ctx.audit({ action: 'admin.revoke', targetType: 'profile', targetId: target.id, districtId: id })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'userId or inviteId required' }, { status: 400 })
}
