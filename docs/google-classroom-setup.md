# Google Classroom sync — setup

The Roster tab's "Connect Google Classroom" flow needs a Google Cloud OAuth
app. Until the env vars below are set, the section shows "Not configured" and
everything else (CSV rostering, the rest of the console) works normally.

## 1. Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign
   in with the account that owns the existing StemBuilder sign-in OAuth app
   (you can reuse that same project).
2. **Enable the API**: menu → *APIs & Services* → *Library* → search
   **Google Classroom API** → *Enable*.

## 2. OAuth consent screen (scopes)

*APIs & Services* → *OAuth consent screen*:

1. If the project already has a consent screen (from Google sign-in), you're
   editing it; otherwise create one: **External**, app name "StemBuilder",
   your support email, domain `stembuilder.io`.
2. Under **Scopes**, add:
   - `classroom.courses.readonly` — list the teacher's courses
   - `classroom.rosters.readonly` — read class rosters
   - `classroom.profile.emails` — read student/teacher email addresses
     (without this, Google hides emails and rostered accounts can't be
     matched for Google sign-in)
3. These are **sensitive scopes**: while the app is unverified, only accounts
   listed under **Test users** can connect (add your own + pilot teachers —
   up to 100). For general availability, submit the app for **verification**
   (Google reviews the scope justification; typically 3–5 business days,
   sometimes longer for education scopes). Do this before onboarding real
   districts at scale.

## 3. OAuth client + redirect URIs

*APIs & Services* → *Credentials* → *Create credentials* → *OAuth client ID*:

- Type: **Web application**, name e.g. "StemBuilder Classroom sync"
- **Authorized redirect URIs** (exact paths — add every environment you use):
  - `https://stembuilder.io/api/admin/roster/google/callback`
  - `https://<your-vercel-preview-domain>/api/admin/roster/google/callback` (optional, per preview)
  - `http://localhost:3000/api/admin/roster/google/callback`

Copy the **Client ID** and **Client secret**.

## 4. Env vars

Add to `.env.local` and Vercel (all environments):

```
GOOGLE_CLASSROOM_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLASSROOM_CLIENT_SECRET=...
```

If unset, the code falls back to `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` (the
sign-in app) — that works if you added the redirect URIs and scopes to that
same client, but a dedicated client keeps sign-in and rostering independent.

## How the flow works

1. Admin clicks **Connect Google Classroom** on a district's Roster tab.
2. Google consent screen (account picker) → back to the district page. The
   one-hour access token lives in an httpOnly cookie scoped to the roster API
   paths; no refresh token is stored — syncing is an attended action, and
   reconnecting later is two clicks.
3. The admin picks courses → **Preview sync** (dry run, nothing written) →
   confirm. Courses/rosters are mapped into the same OneRoster shape as the
   CSV adapter and applied by the same importer: students created as
   `account_origin='rostered'`, linked to the district, enrolled; Google's
   course/user ids are the stable sourcedIds, so re-syncs match existing
   accounts and only add what's new.
4. Students with a visible email can sign in with **Google** on StemBuilder
   directly (email match). New accounts also get a temporary password,
   returned once in the credentials download.

Caveat: the connected account sees only courses it teaches (or co-teaches).
For whole-district sync without teacher involvement, the path is a Workspace
domain-wide-delegation service account or OneRoster/Clever Secure Sync —
both deliberately out of Phase 1.
