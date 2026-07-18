This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Transactional email

App-sent email (currently just password-reset links) goes through the
provider-agnostic `sendEmail()` in [lib/email.ts](lib/email.ts). Swapping
providers is env-var-only — no call sites change.

### Env vars (Vercel → Project → Settings → Environment Variables)

| Variable | Value | Notes |
| --- | --- | --- |
| `EMAIL_PROVIDER` | `resend` (default) or `postmark` | Which driver `sendEmail()` uses. |
| `EMAIL_FROM` | `StemBuilder <no-reply@stembuilder.io>` | Optional — this is already the default. |
| `RESEND_API_KEY` | from resend.com dashboard | Required when provider is `resend`. |
| `POSTMARK_SERVER_TOKEN` | from postmarkapp.com dashboard | Required when provider is `postmark`. |

With no API key set (local dev / previews), emails are logged instead of sent
and the request-reset endpoint returns the reset link directly in the response
on non-production environments so the flow stays testable.

Amazon SES can be added as a third driver in `lib/email.ts`; use
`@aws-sdk/client-sesv2` for it (SES's REST API requires AWS SigV4 signing —
don't hand-roll it with fetch).

### DNS records for sending from `no-reply@stembuilder.io`

Add these at the DNS host for `stembuilder.io`. Exact values (DKIM public keys,
selectors, region hosts) are generated per-account — copy them from the
provider dashboard when you verify the domain; the shapes below are what to
expect.

**Resend** (Domains → Add Domain → `stembuilder.io`):

| Type | Name | Value |
| --- | --- | --- |
| MX | `send.stembuilder.io` | `feedback-smtp.<region>.amazonses.com` (priority 10) — bounce handling |
| TXT (SPF) | `send.stembuilder.io` | `v=spf1 include:amazonses.com ~all` |
| TXT (DKIM) | `resend._domainkey.stembuilder.io` | `p=<public key from dashboard>` |

**Postmark** (Sender Signatures → Add Domain): a TXT DKIM record at
`<selector>._domainkey.stembuilder.io` plus a CNAME `pm-bounces.stembuilder.io`
→ `pm.mtasv.net` (return-path, which also covers SPF alignment).

**Amazon SES**: three `<token>._domainkey` CNAMEs for DKIM, plus a custom
MAIL FROM subdomain (MX + SPF TXT) if you want full alignment.

**DMARC** (one record regardless of provider):

| Type | Name | Value |
| --- | --- | --- |
| TXT | `_dmarc.stembuilder.io` | `v=DMARC1; p=none; rua=mailto:charlesagravina@gmail.com` |

Start with `p=none` (report-only); once reports look clean for a couple of
weeks, tighten to `p=quarantine`.

## Password reset

Self-service flow: `/forgot-password` → `POST /api/auth/request-reset` emails a
one-hour, single-use link → `/reset-password?token=…` → `POST
/api/auth/reset-password`. Only a SHA-256 hash of the token is stored
(`password_reset_tokens`, migration 0001); responses never reveal whether an
email is registered; the endpoint is rate-limited (3 emails per account per
hour, plus a per-IP throttle). A successful reset burns all outstanding tokens
for the user and invalidates their existing sessions within ~5 minutes
(migration 0007 + the revalidation check in [auth.ts](auth.ts)). Students
without email are reset by their teacher (temp password) instead.

## Data retention & deletion

Deletions are soft (30-day recoverable window), then permanently purged by a
daily job. Note that Supabase's automated database backups age out separately,
on Supabase's own rotation, so purged data can persist in backups for up to
the backup-retention window after the purge. Full details, setup checklist,
and audit queries: [db/RETENTION.md](db/RETENTION.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
