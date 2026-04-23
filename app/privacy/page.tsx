import Link from "next/link";

export default function PrivacyPolicy() {
  return (
    <div style={{ minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat", backgroundSize: "auto", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 24,
        border: "3px solid #1f1f1f", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "48px 52px" }}>

        <Link href="/" style={{ fontSize: 13, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
          ← Back to STEM Builder
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 900, color: "#111", margin: "24px 0 4px" }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 36 }}>Last updated: April 2026</p>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>What is STEM Builder?</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
            STEM Builder is an educational platform designed for classroom use. It provides interactive
            science and coding tools for students and assignment management for teachers.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>What data we collect</h2>
          <ul style={{ fontSize: 15, color: "#374151", lineHeight: 2, paddingLeft: 20 }}>
            <li><strong>Name and email address</strong> — provided when you create an account</li>
            <li><strong>Google account info</strong> — if you sign in with Google, we receive your name, email, and profile photo</li>
            <li><strong>Submitted work</strong> — code, drawings, and other work you save or submit through the platform</li>
            <li><strong>Class enrollment</strong> — which classes you are enrolled in and assignments your teacher has set</li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>How we use your data</h2>
          <ul style={{ fontSize: 15, color: "#374151", lineHeight: 2, paddingLeft: 20 }}>
            <li>To operate the platform and save your progress</li>
            <li>To allow teachers to review student submissions</li>
            <li>To manage class enrollment and assignments</li>
          </ul>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7, marginTop: 12 }}>
            We do <strong>not</strong> sell your data, share it with advertisers, or use it for any purpose
            outside of operating this educational platform.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>Student privacy (FERPA &amp; COPPA)</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
            STEM Builder is designed for use in K–12 schools. Student education records are protected
            under FERPA. Student data is never shared outside the platform without authorization.
            For students under 13, access is provided through school accounts under teacher supervision,
            consistent with COPPA school-official exception guidelines.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>Data storage</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
            All data is stored securely in Supabase (PostgreSQL). Passwords are hashed using bcrypt
            and never stored in plain text. Authentication sessions are stored in encrypted cookies.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>Data deletion</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
            You may request deletion of your account and all associated data at any time by contacting
            us at the email below. Teachers may also request removal of student data for their classes.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 }}>Contact</h2>
          <p style={{ fontSize: 15, color: "#374151", lineHeight: 1.7 }}>
            Questions about this policy? Email us at{" "}
            <a href="mailto:stembuildersupport@gmail.com"
              style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              stembuildersupport@gmail.com
            </a>
          </p>
        </section>

      </div>
    </div>
  );
}
