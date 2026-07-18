import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/lib/db.server'
import { sha256 } from '@/lib/reset.server'

// POST /api/auth/reset-password  { token, password }
export async function POST(req: NextRequest) {
  const { token, password } = await req.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing reset token.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = adminDb()
  const { data: row } = await db
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired. Please request a new one.' },
      { status: 400 },
    )
  }

  const hash = await bcrypt.hash(password, 12)
  // deleted_at guard: soft_delete_user removes outstanding tokens, but never
  // let a stale token reset a soft-deleted account's password.
  const { error } = await db.from('profiles').update({ password_hash: hash }).eq('id', row.user_id).is('deleted_at', null)
  if (error) return NextResponse.json({ error: 'Could not reset password. Please try again.' }, { status: 500 })

  // Burn this token and any other outstanding ones for the user.
  await db
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', row.user_id)
    .is('used_at', null)

  return NextResponse.json({ ok: true })
}
