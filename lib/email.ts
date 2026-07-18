// Provider-agnostic transactional email. Call sites use sendEmail() and never
// know which provider is behind it — swap providers by changing env vars only:
//
//   EMAIL_PROVIDER  resend | postmark          (default: resend)
//   EMAIL_FROM      "StemBuilder <no-reply@stembuilder.io>"  (default)
//   RESEND_API_KEY          when EMAIL_PROVIDER=resend
//   POSTMARK_SERVER_TOKEN   when EMAIL_PROVIDER=postmark
//
// Both providers are called over plain REST (no SDK dependency). Amazon SES can
// be added as a third case below — its REST API needs AWS SigV4 request signing,
// so use @aws-sdk/client-sesv2 for that driver rather than hand-rolling fetch.
//
// If the active provider's key is unset (local dev / preview before setup), we
// log instead of sending and return false. Callers can surface the reset link
// directly on non-production environments so the flow stays testable.
//
// DNS (SPF / DKIM / DMARC) records required to send from stembuilder.io are
// documented in README.md § "Transactional email".

interface EmailArgs {
  to: string
  subject: string
  html: string
  text?: string
}

const DEFAULT_FROM = 'StemBuilder <no-reply@stembuilder.io>'

export async function sendEmail({ to, subject, html, text }: EmailArgs): Promise<boolean> {
  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase()
  const from = process.env.EMAIL_FROM || process.env.RESEND_FROM || DEFAULT_FROM

  switch (provider) {
    case 'resend':
      return sendViaResend({ from, to, subject, html, text })
    case 'postmark':
      return sendViaPostmark({ from, to, subject, html, text })
    default:
      console.error(`[email] unknown EMAIL_PROVIDER "${provider}" — email to "${to}" not sent`)
      return false
  }
}

type DriverArgs = EmailArgs & { from: string }

async function sendViaResend({ from, to, subject, html, text }: DriverArgs): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) return devFallback('RESEND_API_KEY', to, subject)

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

async function sendViaPostmark({ from, to, subject, html, text }: DriverArgs): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN
  if (!token) return devFallback('POSTMARK_SERVER_TOKEN', to, subject)

  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': token,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        HtmlBody: html,
        ...(text ? { TextBody: text } : {}),
        MessageStream: 'outbound',
      }),
    })
    if (!res.ok) {
      console.error('[email] Postmark send failed', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('[email] Postmark send error', err)
    return false
  }
}

function devFallback(missingVar: string, to: string, subject: string): false {
  console.log(`[email:dev-fallback] no ${missingVar} set — would email "${to}": ${subject}`)
  return false
}
