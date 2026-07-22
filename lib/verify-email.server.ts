import { SupabaseClient } from '@supabase/supabase-js'
import { createResetToken } from './reset.server'
import { sendEmail } from './email'

// Teacher email verification. Same token hygiene as password reset: the raw
// token travels only in the emailed link; the DB stores its SHA-256 hash.
// Teachers cannot create classes (or roster students) until verified —
// Google-created teacher accounts skip this because Google already verified
// the address (email_verified_at is set at profile creation).

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export async function sendVerificationEmail(
  db: SupabaseClient,
  userId: string,
  email: string,
  origin: string,
): Promise<{ sent: boolean; devVerifyUrl?: string }> {
  const { raw, hash } = createResetToken()
  const { error } = await db.from('email_verification_tokens').insert({
    user_id: userId,
    token_hash: hash,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  })
  if (error) return { sent: false }

  const url = `${origin}/api/auth/verify-email?token=${encodeURIComponent(raw)}`
  const sent = await sendEmail({
    to: email,
    subject: 'Verify your StemBuilder teacher account',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2>Verify your email</h2>
        <p>Welcome to StemBuilder! Confirm this address to finish setting up your
        teacher account — you'll be able to create classes as soon as it's verified.</p>
        <p style="margin:24px 0">
          <a href="${url}" style="background:#1f1f1f;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold">
            Verify email
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">This link expires in 24 hours.
        If you didn't create a StemBuilder account, you can ignore this email.</p>
      </div>`,
    text: `Verify your StemBuilder teacher account: ${url} (link expires in 24 hours)`,
  })

  // Mirror the password-reset behavior: on non-production environments where
  // no email provider is configured, hand the link back so the flow is testable.
  if (!sent && process.env.VERCEL_ENV !== 'production') {
    return { sent: false, devVerifyUrl: url }
  }
  return { sent }
}
