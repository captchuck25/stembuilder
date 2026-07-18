import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { createResetToken } from '@/lib/reset.server'
import { sendMail } from '@/lib/email'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

function resetEmailHtml(url: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
    <h2 style="margin:0 0 12px">Reset your StemBuilder password</h2>
    <p style="font-size:14px;line-height:1.6;color:#444">
      We received a request to reset your password. Click the button below to choose a new one.
      This link expires in 1 hour.
    </p>
    <p style="margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#1f1f1f;color:#fff;text-decoration:none;
        font-weight:700;padding:12px 24px;border-radius:10px">Reset password</a>
    </p>
    <p style="font-size:12px;color:#888;line-height:1.6">
      If you didn't request this, you can safely ignore this email — your password won't change.
      If the button doesn't work, paste this link into your browser:<br>
      <span style="word-break:break-all">${url}</span>
    </p>
  </div>`
}

// POST /api/auth/request-reset  { email }
// Always responds { ok: true } regardless of whether the account exists — we
// never reveal whether an email is registered. Only email accounts that have a
// password can reset; Google-only and username-only accounts have no password
// to reset (students who can't reach email are reset by their teacher instead).
export async function POST(req: NextRequest) {
  let email: unknown
  try {
    ({ email } = await req.json())
  } catch {
    return NextResponse.json({ ok: true })
  }
  if (!email || typeof email !== 'string') return NextResponse.json({ ok: true })

  const identifier = email.toLowerCase().trim()
  const db = adminDb()
  const { data: profile } = await db
    .from('profiles')
    .select('id, email, password_hash')
    .eq('email', identifier)
    .is('deleted_at', null) // soft-deleted accounts cannot request a reset
    .maybeSingle()

  if (profile?.email && profile.password_hash) {
    const { raw, hash } = createResetToken()
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString()
    await db.from('password_reset_tokens').insert({
      user_id: profile.id,
      token_hash: hash,
      expires_at: expiresAt,
    })

    const resetUrl = `${new URL(req.url).origin}/reset-password?token=${raw}`
    const sent = await sendMail({
      to: profile.email,
      subject: 'Reset your StemBuilder password',
      html: resetEmailHtml(resetUrl),
      text: `Reset your StemBuilder password:\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    })

    // No real email configured yet (dev/preview): surface the link so the flow
    // is testable. Never do this in production.
    if (!sent && process.env.VERCEL_ENV !== 'production') {
      return NextResponse.json({ ok: true, devResetUrl: resetUrl })
    }
  }

  return NextResponse.json({ ok: true })
}
