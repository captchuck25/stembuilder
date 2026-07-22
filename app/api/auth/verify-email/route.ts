import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { sha256 } from '@/lib/reset.server'

// GET /api/auth/verify-email?token=...
// Landing endpoint for the emailed verification link. Marks the teacher's
// email verified (which unlocks class creation) and burns the token.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const fail = NextResponse.redirect(new URL('/sign-in?verify=invalid', req.url))
  if (!token) return fail

  const db = adminDb()
  const { data: row } = await db
    .from('email_verification_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()

  if (!row || row.used_at || new Date(row.expires_at) < new Date()) return fail

  const { error } = await db
    .from('profiles')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('id', row.user_id)
    .is('deleted_at', null)
    .is('email_verified_at', null)
  if (error) return fail

  await db
    .from('email_verification_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)

  return NextResponse.redirect(new URL('/teachers/dashboard?verified=1', req.url))
}
