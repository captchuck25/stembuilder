import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { sendVerificationEmail } from '@/lib/verify-email.server'

const MAX_TOKENS_PER_HOUR = 3

// POST /api/auth/resend-verification
// Re-sends the teacher verification link for the signed-in account.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, role, email_verified_at')
    .eq('id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!profile?.email || profile.role !== 'teacher') {
    return NextResponse.json({ error: 'Not applicable for this account.' }, { status: 400 })
  }
  if (profile.email_verified_at) return NextResponse.json({ ok: true, alreadyVerified: true })

  // Same flood cap as password reset: at most 3 emails per hour per account.
  const { count } = await db
    .from('email_verification_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
  if ((count ?? 0) >= MAX_TOKENS_PER_HOUR) {
    return NextResponse.json({ error: 'Too many requests — check your inbox, or try again in an hour.' }, { status: 429 })
  }

  const { devVerifyUrl } = await sendVerificationEmail(
    db, profile.id, profile.email, new URL(req.url).origin,
  )
  return NextResponse.json(devVerifyUrl ? { ok: true, devVerifyUrl } : { ok: true })
}
