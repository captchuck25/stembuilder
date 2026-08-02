import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { adminDb } from '@/lib/db.server'
import { sendEmail } from '@/lib/email'
import { isAnyAdmin } from '@/lib/roles'

// POST /api/admin/districts/[id]/teachers  { email, schoolId? }
//
// "Add teacher" for a district (both admin tiers — adding their own teachers
// is exactly a district admin's job). Two outcomes:
//   attached — a teacher account with that email exists (solo, or already in
//              this district) → linked to the district (+ school), audited
//   invited  — no account yet → invite email + a pending teacher_invites row;
//              the attachment happens automatically at signup
//              (lib/teacher-invites.server.ts)
// Never adopts across districts, never touches student/admin accounts.
// Runs on the service role (solo accounts are outside a district admin's RLS
// scope by design), so the district scope is enforced explicitly here.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id: districtId } = await params

  if (ctx.role === 'district_admin' && ctx.districtId !== districtId) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }

  const db = adminDb()
  const { data: district } = await db.from('districts').select('id, name')
    .eq('id', districtId).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : ''
  const schoolId = typeof body?.schoolId === 'string' && body.schoolId ? body.schoolId : null
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  if (schoolId) {
    const { data: school } = await db.from('schools').select('id')
      .eq('id', schoolId).eq('district_id', districtId).is('deleted_at', null).maybeSingle()
    if (!school) return NextResponse.json({ error: 'School not found in this district' }, { status: 404 })
  }

  const { data: existing } = await db.from('profiles')
    .select('id, role, district_id')
    .eq('email', email).is('deleted_at', null).maybeSingle()

  if (existing) {
    if (existing.role === 'student') {
      return NextResponse.json({ error: 'That email belongs to a student account.' }, { status: 400 })
    }
    // This district's own admin already outranks teacher (and can own rostered
    // classes) — just confirm, optionally updating their school. Foreign
    // admins stay off-limits.
    if (isAnyAdmin(existing.role) && !(existing.role === 'district_admin' && existing.district_id === districtId)) {
      return NextResponse.json({ error: 'That email belongs to an admin account.' }, { status: 400 })
    }
    if (existing.district_id && existing.district_id !== districtId) {
      return NextResponse.json({ error: 'That teacher already belongs to another district.' }, { status: 400 })
    }

    const alreadyHere = existing.district_id === districtId
    const { error } = await db.from('profiles')
      .update({ district_id: districtId, ...(schoolId ? { school_id: schoolId } : {}) })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await ctx.audit({
      action: 'teacher.attach', targetType: 'profile', targetId: existing.id,
      districtId, metadata: { schoolId, alreadyInDistrict: alreadyHere },
    })
    return NextResponse.json({ status: 'attached', alreadyInDistrict: alreadyHere })
  }

  // No account yet — leave a pending invite and email them a signup nudge.
  await db.from('teacher_invites').delete()
    .eq('email', email).eq('district_id', districtId).is('claimed_at', null)
  const { error } = await db.from('teacher_invites').insert({
    email, district_id: districtId, school_id: schoolId, invited_by: ctx.userId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const origin = new URL(req.url).origin
  const url = `${origin}/sign-up?role=teacher`
  const sent = await sendEmail({
    to: email,
    subject: `${district.name} invited you to StemBuilder`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>You're invited to StemBuilder</h2>
        <p><strong>${district.name}</strong> uses StemBuilder for hands-on STEM
        classes and has added you as a teacher. Create your teacher account with
        this email address (<strong>${email}</strong>) and you'll be connected to
        your district automatically.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#1f1f1f;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold">
            Create your teacher account
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">Signing in with Google works too —
        just use this same email address.</p>
      </div>`,
    text: `${district.name} added you as a teacher on StemBuilder. Create your teacher account using ${email}: ${url}`,
  })

  await ctx.audit({ action: 'teacher.invite', targetType: 'invite', targetId: email, districtId, metadata: { schoolId } })
  return NextResponse.json({ status: 'invited', sent })
}
