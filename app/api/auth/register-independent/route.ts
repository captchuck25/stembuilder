import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/lib/db.server'
import { verifyAgePassToken, isGateBlocked, GATE_COOKIE } from '@/lib/age-gate.server'

// POST /api/auth/register-independent  { email, name, password, ageToken }
//
// Path C: individual signup with no class and no school. COPPA-restricted to
// 13+, so this endpoint refuses to create anything without a valid pass token
// from /api/auth/age-check. We persist only the fact the check passed and
// when (age_verified_13_plus + age_verified_at) — never the birth date.
export async function POST(req: NextRequest) {
  const { email, name, password, ageToken } = await req.json()

  if (isGateBlocked(req.cookies.get(GATE_COOKIE)?.value) || !verifyAgePassToken(ageToken)) {
    return NextResponse.json(
      { error: 'To use StemBuilder, ask your teacher for a class code to join.', code: 'age_gate' },
      { status: 403 },
    )
  }

  if (!email || !name?.trim() || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = adminDb()
  // Deliberately NOT filtered by deleted_at: a soft-deleted account keeps its
  // email reserved during the 30-day retention window (the unique index would
  // reject the insert anyway — this just gives a clean error).
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('email', String(email).toLowerCase().trim())
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 12)
  const { error } = await db.from('profiles').insert({
    email: String(email).toLowerCase().trim(),
    name: String(name).trim(),
    password_hash: hash,
    role: 'student',
    account_origin: 'independent',
    age_verified_13_plus: true,
    age_verified_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
