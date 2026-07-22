import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/lib/db.server'
import { sendVerificationEmail } from '@/lib/verify-email.server'
import { TEACHER_AFFIRMATION_VERSION } from '@/lib/compliance'

// POST /api/auth/register-teacher  { email, name, password, affirmed: true }
//
// Teacher accounts require an explicit affirmation (educator, 18+, authorized
// by their school — see lib/compliance.ts for the exact affirmed text). The
// affirmation row is compliance evidence: user id + timestamp + terms version.
// The account starts email-UNVERIFIED; class creation and rostering are gated
// on email_verified_at (see /api/teacher/classes), proven via the emailed link.
export async function POST(req: NextRequest) {
  const { email, name, password, affirmed } = await req.json()

  if (affirmed !== true) {
    return NextResponse.json(
      { error: 'Please confirm the educator affirmation to create a teacher account.' },
      { status: 400 },
    )
  }
  if (!email || !name?.trim() || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = adminDb()
  const normalizedEmail = String(email).toLowerCase().trim()
  // Deliberately NOT filtered by deleted_at — soft-deleted emails stay reserved
  // through the 30-day retention window.
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 12)
  const { data: created, error } = await db
    .from('profiles')
    .insert({ email: normalizedEmail, name: String(name).trim(), password_hash: hash, role: 'teacher' })
    .select('id')
    .single()
  if (error || !created) {
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }

  // The affirmation is the consent evidence for this account — if it can't be
  // recorded, the teacher account must not exist either.
  const { error: affirmError } = await db.from('teacher_affirmations').insert({
    user_id: created.id,
    terms_version: TEACHER_AFFIRMATION_VERSION,
  })
  if (affirmError) {
    await db.from('profiles').delete().eq('id', created.id)
    return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }

  const { devVerifyUrl } = await sendVerificationEmail(
    db, created.id, normalizedEmail, new URL(req.url).origin,
  )

  return NextResponse.json(devVerifyUrl ? { ok: true, devVerifyUrl } : { ok: true })
}
