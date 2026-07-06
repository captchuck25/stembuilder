// Minimal transactional email via Resend's REST API — no SDK dependency.
//
// If RESEND_API_KEY is unset (local dev / preview before setup), we log instead
// of sending and return false. Callers can surface the reset link directly on
// non-production environments so the flow stays testable until the key is added.
//
// To go live: create a Resend account, verify a sending domain, then set
//   RESEND_API_KEY=...           (server env var)
//   RESEND_FROM="StemBuilder <no-reply@yourdomain>"   (optional; defaults below)

interface MailArgs {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendMail({ to, subject, html, text }: MailArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'StemBuilder <onboarding@resend.dev>'

  if (!key) {
    console.log(`[email:dev-fallback] no RESEND_API_KEY set — would email "${to}": ${subject}`)
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html, ...(text ? { text } : {}) }),
    })
    if (!res.ok) {
      console.error('[email] Resend send failed', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[email] Resend send error', err)
    return false
  }
}
