import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { verifyAgePassToken, isGateBlocked, GATE_COOKIE } from '@/lib/age-gate.server'
import { TEACHER_AFFIRMATION_VERSION } from '@/lib/compliance'

// POST /api/onboarding/complete
//
// Creates the profile for a first-time Google user AFTER they choose a role
// and path — Google sign-in itself no longer creates anything (see auth.ts),
// so abandoning onboarding leaves no orphaned rows. Every path enforces its
// own compliance rule server-side, exactly like the credentials endpoints:
//
//   { role: 'teacher', affirmed: true, district?, state?, gradeLevels?, contentArea? }
//       -> requires the educator affirmation; email pre-verified (Google).
//   { role: 'student', path: 'class_code', code }
//       -> school consent; class validated + profile & enrollment atomic (RPC).
//   { role: 'student', path: 'independent', ageToken }
//       -> requires a 13+ pass token from /api/auth/age-check.
//
// For an ALREADY-onboarded student the class_code variant just enrolls them
// (used by /join/complete, where a returning Google student re-joins a class).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const db = adminDb()

  // ── Already has a profile ──────────────────────────────────────────────────
  if (!session.user.needsOnboarding) {
    if (body.role === 'student' && body.path === 'class_code' && session.user.role === 'student' && body.code) {
      const { data: cls } = await db
        .from('classes')
        .select('id')
        .eq('join_code', String(body.code).trim().toUpperCase())
        .is('deleted_at', null)
        .maybeSingle()
      if (!cls) {
        return NextResponse.json(
          { error: "That code didn't match a class. Ask your teacher for your class code." },
          { status: 404 },
        )
      }
      // Re-joining resurrects a tombstoned enrollment; already-enrolled is fine.
      // account_origin is NOT touched: provenance records how the account was
      // created, and later class links live in enrollments.
      const { error } = await db
        .from('enrollments')
        .upsert({ class_id: cls.id, student_id: session.user.id, deleted_at: null }, { onConflict: 'class_id,student_id' })
      if (error) return NextResponse.json({ error: 'Could not join the class.' }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'This account is already set up.' }, { status: 409 })
  }

  // ── First Google login: create the profile per the chosen path ─────────────
  const email = session.user.email
  const googleSub = session.user.googleSub
  if (!email || !googleSub) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Race/stale-token guard: if a profile already exists for this identity the
  // client's session is just out of date — have it refresh, create nothing.
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .or(`google_id.eq.${googleSub},email.eq.${email}`)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: 'This account is already set up.' }, { status: 409 })

  const name = session.user.name || email.split('@')[0]

  if (body.role === 'teacher') {
    if (body.affirmed !== true) {
      return NextResponse.json(
        { error: 'Please confirm the educator affirmation to create a teacher account.' },
        { status: 400 },
      )
    }
    const profile: Record<string, unknown> = {
      email,
      name,
      google_id: googleSub,
      role: 'teacher',
      email_verified_at: new Date().toISOString(), // Google already verified this address
    }
    if (typeof body.district === 'string' && body.district.trim()) profile.district = body.district.trim()
    if (typeof body.state === 'string' && body.state.trim()) profile.state = body.state.trim()
    if (typeof body.gradeLevels === 'string') profile.grade_levels = body.gradeLevels.trim()
    if (typeof body.contentArea === 'string') profile.content_area = body.contentArea.trim()

    const { data: created, error } = await db.from('profiles').insert(profile).select('id').single()
    if (error || !created) return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 })

    // The affirmation is the consent evidence — no evidence, no teacher account.
    const { error: affirmError } = await db.from('teacher_affirmations').insert({
      user_id: created.id,
      terms_version: TEACHER_AFFIRMATION_VERSION,
    })
    if (affirmError) {
      await db.from('profiles').delete().eq('id', created.id)
      return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.role === 'student' && body.path === 'class_code') {
    if (!body.code?.trim()) return NextResponse.json({ error: 'Class code is required.' }, { status: 400 })
    const { error } = await db.rpc('create_student_account', {
      p_name: name,
      p_email: email,
      p_username: null,
      p_password_hash: null,
      p_google_id: googleSub,
      p_join_code: String(body.code),
      p_class_id: null,
      p_origin: 'class_code',
    })
    if (error) {
      if (error.message.includes('class_not_found')) {
        return NextResponse.json(
          { error: "That code didn't match a class. Ask your teacher for your class code." },
          { status: 404 },
        )
      }
      return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body.role === 'student' && body.path === 'independent') {
    if (isGateBlocked(req.cookies.get(GATE_COOKIE)?.value) || !verifyAgePassToken(body.ageToken)) {
      return NextResponse.json(
        { error: 'To use StemBuilder, ask your teacher for a class code to join.', code: 'age_gate' },
        { status: 403 },
      )
    }
    const { error } = await db.from('profiles').insert({
      email,
      name,
      google_id: googleSub,
      role: 'student',
      account_origin: 'independent',
      age_verified_13_plus: true,
      age_verified_at: new Date().toISOString(),
      email_verified_at: new Date().toISOString(),
    })
    if (error) return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Choose a role to continue.' }, { status: 400 })
}
