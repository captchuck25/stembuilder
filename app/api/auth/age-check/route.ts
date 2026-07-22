import { NextRequest, NextResponse } from 'next/server'
import {
  ageInYears, parseBirthDate, issueAgePassToken,
  issueGateBlockValue, isGateBlocked, GATE_COOKIE, GATE_COOKIE_MAX_AGE,
} from '@/lib/age-gate.server'

// POST /api/auth/age-check  { birthDate: 'YYYY-MM-DD' }
//
// Eligibility gate for the INDEPENDENT signup path only (13+; no school
// authority to consent). Rostered and class-code students never hit this —
// their consent basis is the school and no age is ever collected.
//
// The birth date is evaluated in memory and never stored or logged. A pass
// returns a short-lived signed token that /api/auth/register-independent
// requires; a fail sets a signed httpOnly cookie that makes the gate refuse
// further attempts from this browser, so retrying with a different date
// doesn't work.
export async function POST(req: NextRequest) {
  if (isGateBlocked(req.cookies.get(GATE_COOKIE)?.value)) {
    // Already failed once this browser — do not evaluate the new date at all.
    return NextResponse.json({ ok: false, blocked: true }, { status: 403 })
  }

  let birthDate: unknown
  try {
    ({ birthDate } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const dob = parseBirthDate(birthDate)
  if (!dob) return NextResponse.json({ error: 'Please enter a valid date.' }, { status: 400 })

  if (ageInYears(dob) >= 13) {
    return NextResponse.json({ ok: true, token: issueAgePassToken() })
  }

  const res = NextResponse.json({ ok: false, blocked: true }, { status: 403 })
  res.cookies.set(GATE_COOKIE, issueGateBlockValue(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: GATE_COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}
