import crypto from 'crypto'

// Age gate for the INDEPENDENT signup path only (no school authority, so
// COPPA restricts it to 13+). Design constraints, in order:
//
//   * The date of birth is checked in memory and NEVER stored or logged.
//     What we persist on the profile is age_verified_13_plus + a timestamp.
//   * A passed check yields a short-lived signed token; the register endpoint
//     requires it, so the client cannot skip the screen or fabricate a result.
//   * A failed check sets a signed httpOnly cookie; while it's present the
//     age-check endpoint refuses to evaluate again, so re-submitting a
//     different date in the same browser doesn't work. The cookie name and
//     value are deliberately neutral so the mechanism isn't advertised.

const PASS_TOKEN_TTL_MS = 30 * 60 * 1000       // finish signup within 30 min of the check
export const GATE_COOKIE = 'sb_onb'            // neutral name: "onboarding state"
export const GATE_COOKIE_MAX_AGE = 24 * 60 * 60 // seconds

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET is not set')
  return s
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url')
}

function sign(data: object): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url')
  return `${payload}.${hmac(payload)}`
}

function verify(token: string): Record<string, unknown> | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = hmac(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return null
  }
}

// Whole years elapsed since dob, calendar-accurate (birthday not yet reached
// this year counts the previous year).
export function ageInYears(dob: Date, now = new Date()): number {
  let age = now.getFullYear() - dob.getFullYear()
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
  if (beforeBirthday) age--
  return age
}

// 'YYYY-MM-DD' -> Date, or null when malformed / not a real calendar date /
// outside a sane range (future dates, or ages over 120).
export function parseBirthDate(value: unknown, now = new Date()): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  if (date > now || y < now.getFullYear() - 120) return null
  return date
}

// ── Pass token: proof the 13+ check ran server-side and passed ──────────────

export function issueAgePassToken(): string {
  return sign({ t: 'age-pass', exp: Date.now() + PASS_TOKEN_TTL_MS })
}

export function verifyAgePassToken(token: unknown): boolean {
  if (typeof token !== 'string') return false
  const data = verify(token)
  return data?.t === 'age-pass' && typeof data.exp === 'number' && data.exp > Date.now()
}

// ── Block cookie: a failed check is sticky for this browser ─────────────────

export function issueGateBlockValue(): string {
  return sign({ t: 'age-block' })
}

export function isGateBlocked(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false
  return verify(cookieValue)?.t === 'age-block'
}
