import Link from "next/link";

const H2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 };
const P: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: 1.7 };
const UL: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: 2, paddingLeft: 20 };
const A: React.CSSProperties = { color: "#2563eb", fontWeight: 700, textDecoration: "none" };
const SECTION: React.CSSProperties = { marginBottom: 32 };

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat", backgroundSize: "auto", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 24,
        border: "3px solid #1f1f1f", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "48px 52px" }}>

        <Link href="/" style={{ fontSize: 13, ...A }}>
          ← Back to STEM Builder
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 900, color: "#111", margin: "24px 0 4px" }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 36 }}>Last updated: August 3, 2026</p>

        <section style={SECTION}>
          <h2 style={H2}>What is STEM Builder?</h2>
          <p style={P}>
            STEM Builder is an educational platform built for K–12 classroom use by STEM Builder LLC.
            It provides interactive STEM tools — design, engineering, coding, electronics, and more —
            for students, along with class and assignment management for teachers.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Our commitments</h2>
          <ul style={UL}>
            <li>No ads, ever, and we never sell or rent your data.</li>
            <li>We collect the minimum needed to run the service.</li>
            <li>Student data is deleted on request.</li>
            <li>Data is encrypted and stored in the United States.</li>
          </ul>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>What data we collect</h2>
          <ul style={UL}>
            <li><strong>Teacher account</strong> — name, email, and a hashed password. If you sign in
              with Google, we receive your name, email, Google account ID, and profile picture.</li>
            <li><strong>Student account</strong> — a name (or the name your teacher/school provides,
              which may be a first name and last initial). Students who join with a class code can use
              a username-only account — no email or contact information required. If a student signs in
              with Google, we receive their name, email, and Google account ID.</li>
            <li><strong>Submitted and saved work</strong> — designs, code, drawings, projects, and
              progress created in the tools.</li>
            <li><strong>Class enrollment</strong> — which classes you&apos;re in and the assignments
              your teacher has set.</li>
            <li><strong>Minimal technical data</strong> — sign-in events, session information, general
              device/browser type, and security logs, used to operate and protect the platform.</li>
            <li><strong>Age (independent accounts only)</strong> — if someone creates an account with
              no class or school, we ask their date of birth once to confirm they are 13 or older. We
              do not store the date of birth — only a record that the check passed. We do not collect
              age for students who join through a class or school.</li>
          </ul>
          <p style={{ ...P, marginTop: 12 }}>
            We do not collect Social Security numbers, precise location, biometric or health data,
            demographic information, or home addresses/phone numbers.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>How students join</h2>
          <p style={P}>Students use STEM Builder in one of three ways:</p>
          <ul style={UL}>
            <li>A class join code shared by their teacher;</li>
            <li>A school roster provisioned by their school or district; or</li>
            <li>An independent account, available only to learners age 13 and older.</li>
          </ul>
          <p style={{ ...P, marginTop: 12 }}>
            Children under 13 may use STEM Builder only through a teacher&apos;s class or a school
            roster, where the school authorizes their participation. Under-13 students cannot create
            an independent account.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>How we use your data</h2>
          <ul style={UL}>
            <li>To operate the platform and save student work and progress;</li>
            <li>To let teachers review student submissions and manage classes and assignments;</li>
            <li>To secure the service, respond to support requests, and meet legal obligations.</li>
          </ul>
          <p style={{ ...P, marginTop: 12 }}>
            We do not use data for advertising, and we do not use it for any purpose beyond operating
            this educational platform.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Student privacy (FERPA &amp; COPPA)</h2>
          <p style={P}>
            STEM Builder is designed for K–12 schools. Where used by a school, we act as a
            &quot;school official&quot; with a legitimate educational interest under FERPA, and we use
            student education records only to provide the service under the school&apos;s direction.
            For students under 13, we rely on the COPPA school-consent model: the school authorizes
            collection on parents&apos; behalf, and we use children&apos;s data only to provide the
            educational service — never for advertising or sale. Parents may review or request
            deletion of their child&apos;s information through the child&apos;s school or teacher, or
            by contacting us.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Service providers (subprocessors)</h2>
          <p style={P}>
            We use a small set of vetted providers, each bound by contract to protect data and use it
            only on our behalf:
          </p>
          <ul style={UL}>
            <li><strong>Vercel</strong> — application hosting (US)</li>
            <li><strong>Supabase</strong> — database and file storage (US)</li>
            <li><strong>Google</strong> — &quot;Sign in with Google&quot; and Google Classroom
              rostering (when used)</li>
            <li><strong>Resend</strong> — transactional email (e.g. password resets)</li>
          </ul>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Data storage &amp; security</h2>
          <ul style={UL}>
            <li>Passwords are hashed with bcrypt and never stored in plain text; sessions use
              encrypted cookies.</li>
            <li>Data is encrypted in transit (TLS) and at rest, and stored in the United States.</li>
            <li>Database-level access controls (row-level security) keep each teacher&apos;s,
              school&apos;s, and district&apos;s data separated, so users only ever see their own.</li>
            <li>We monitor and log access for security.</li>
          </ul>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Data deletion</h2>
          <p style={P}>
            You may request deletion of your account and all associated data at any time by emailing{" "}
            <a href="mailto:privacy@stembuilder.io" style={A}>privacy@stembuilder.io</a>; teachers and
            schools may request removal of their students&apos; data. When you delete data or a school
            agreement ends, the data is removed from active use immediately and permanently erased
            from our live systems within 30 days by an automated, logged process. Residual copies in
            routine encrypted backups expire on the provider&apos;s normal rotation (a short
            additional period, currently up to about a week), after which the data is gone entirely.
            We do not restore individual records from backups.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Data breach notification</h2>
          <p style={P}>
            If a data breach affects personal information, we will notify affected schools and, where
            applicable, teachers without unreasonable delay and consistent with applicable law.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>Changes to this policy</h2>
          <p style={P}>
            We may update this policy from time to time. We&apos;ll update the &quot;Last
            updated&quot; date and, where appropriate, notify schools or account holders.
          </p>
        </section>

        <section>
          <h2 style={H2}>Contact</h2>
          <p style={P}>
            Questions about this policy? Contact us:<br />
            STEM Builder LLC<br />
            2650-1 Sunrise Hwy #1081, East Islip, NY 11730<br />
            <a href="mailto:privacy@stembuilder.io" style={A}>privacy@stembuilder.io</a>
          </p>
        </section>

      </div>
    </div>
  );
}
