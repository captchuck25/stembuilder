import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | STEM Builder",
  description:
    "Terms of Service for STEM Builder — the interactive STEM learning tools at stembuilder.io, provided by STEM Builder LLC.",
};

const H2: React.CSSProperties = { fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 10 };
const P: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: 1.7 };
const UL: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: 2, paddingLeft: 20 };
const A: React.CSSProperties = { color: "#2563eb", fontWeight: 700, textDecoration: "none" };
const SECTION: React.CSSProperties = { marginBottom: 32 };

export default function TermsOfService() {
  return (
    <div style={{ minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat", backgroundSize: "auto", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", borderRadius: 24,
        border: "3px solid #1f1f1f", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: "48px 52px" }}>

        <Link href="/" style={{ fontSize: 13, ...A }}>
          ← Back to STEM Builder
        </Link>

        <h1 style={{ fontSize: 32, fontWeight: 900, color: "#111", margin: "24px 0 4px" }}>Terms of Service</h1>
        <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 36 }}>Last updated: August 3, 2026</p>

        <section style={SECTION}>
          <h2 style={H2}>1. Agreement to these Terms</h2>
          <p style={P}>
            These Terms of Service govern your use of STEM Builder, the interactive STEM learning
            tools at stembuilder.io (the &quot;Service&quot;), provided by STEM Builder LLC
            (&quot;STEM Builder,&quot; &quot;we,&quot; &quot;us&quot;). By creating an account or
            using the Service, you agree to these Terms and to our{" "}
            <Link href="/privacy" style={A}>Privacy Policy</Link>. If you don&apos;t agree,
            don&apos;t use the Service. If you accept on behalf of a school or district, you confirm
            you have authority to bind that organization. Where a school or district has signed a
            separate agreement or data privacy agreement (DPA) with us, that agreement controls over
            any conflicting term here.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>2. Who may use the Service</h2>
          <ul style={UL}>
            <li>Teachers and educators may create accounts to use the Service with their students.</li>
            <li>Students in a school or class context — including students under 13 — may use the
              Service by joining a teacher-created class (with a class code) or through a
              school-provisioned roster, under their teacher&apos;s or school&apos;s direction.</li>
            <li>Independent learners age 13 and over may create their own account. By doing so, you
              confirm you are at least 13.</li>
            <li>Schools and districts may adopt the Service at an institutional level.</li>
          </ul>
          <p style={{ ...P, marginTop: 12 }}>
            Children under 13 may use the Service only through a teacher&apos;s class or a school
            roster — they may not create an independent account.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>3. Your account</h2>
          <p style={P}>
            You&apos;re responsible for the accuracy of your information and for keeping your login
            secure, and for activity under your account. Tell us promptly at{" "}
            <a href="mailto:support@stembuilder.io" style={A}>support@stembuilder.io</a> about any
            unauthorized use. Passwords are stored only as secured hashes — we can reset them but
            not retrieve them.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>4. Teacher and school responsibilities</h2>
          <p style={P}>
            If you create classes or enroll students, you represent that: you&apos;re authorized to
            use the Service with your students under your school&apos;s policies; for students under
            13 you have any required parental consent or are relying on your school&apos;s authority
            to consent under COPPA&apos;s school-consent provisions; you&apos;ll provide parents
            notice where your school requires it; and you&apos;ll use student data only for
            legitimate educational purposes. You — not STEM Builder — are responsible for obtaining
            these authorizations and consents, because you and your school hold the direct
            relationship with your students and their families.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>5. Acceptable use</h2>
          <p style={P}>
            Don&apos;t: use the Service unlawfully; access accounts, data, or systems you&apos;re
            not authorized to; disrupt or attempt to breach the Service&apos;s security; upload
            content that is unlawful, harmful, harassing, infringing, or inappropriate for a K–12
            setting; reverse engineer, scrape, or copy the Service except as allowed by law; use it
            to build a competing product; or misrepresent your identity or authority. We may suspend
            or terminate access for violations.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>6. Free and paid plans</h2>
          <p style={P}>
            The Service is free for individual teachers, with paid plans for schools and districts.
            Plan features are described on the Service or in a separate order. We may change
            features or pricing prospectively; for paid plans, the applicable order or agreement
            governs, and we won&apos;t make material adverse changes to a paid plan during its paid
            term except as that agreement allows.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>7. Ownership — our content and your work</h2>
          <p style={P}>
            The Service, including its software, design, and content we provide, is owned by STEM
            Builder and protected by intellectual-property laws; we grant you a limited, revocable
            right to use it for its intended educational purpose. Students and teachers keep
            ownership of the original work they create (projects, designs, code). You grant us a
            limited license to host, store, and display that work solely to provide the Service (for
            example, saving a student&apos;s project and showing it to their teacher). We don&apos;t
            claim ownership of your work, and we don&apos;t use it for advertising or sell it.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>8. Third-party services</h2>
          <p style={P}>
            The Service integrates with third-party services (for example, &quot;Sign in with
            Google,&quot; and, where enabled, learning-management or rostering integrations). Your
            use of those is subject to their own terms and privacy policies, and we&apos;re not
            responsible for them.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>9. Disclaimers</h2>
          <p style={P}>
            The Service is provided &quot;as is&quot; and &quot;as available.&quot; To the fullest
            extent permitted by law, we disclaim all warranties, express or implied, including
            merchantability, fitness for a particular purpose, and non-infringement. We don&apos;t
            warrant that the Service will be uninterrupted, error-free, or completely secure, and we
            don&apos;t guarantee particular learning outcomes.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>10. Limitation of liability</h2>
          <p style={P}>
            To the fullest extent permitted by law, STEM Builder and its owners won&apos;t be liable
            for any indirect, incidental, special, consequential, or punitive damages, or for lost
            profits, data, or goodwill. Our total liability for any claim relating to the Service
            won&apos;t exceed the greater of the amount you paid us in the twelve (12) months before
            the claim, or US $100. Some jurisdictions don&apos;t allow certain limitations, so some
            may not apply to you.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>11. Indemnification</h2>
          <p style={P}>
            To the extent permitted by law, you agree to indemnify STEM Builder and its owners from
            claims and expenses arising from your misuse of the Service, your violation of these
            Terms, or — for teachers and schools — your failure to obtain the authorizations or
            consents in Section 4. (This is typically limited or inapplicable for public-school and
            government customers; a school agreement or DPA may modify it.)
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>12. Termination</h2>
          <p style={P}>
            You may stop using the Service and delete your account at any time. We may suspend or
            terminate access if you violate these Terms or to protect the Service or its users. On
            termination, we handle student data as described in the{" "}
            <Link href="/privacy" style={A}>Privacy Policy</Link> and any applicable agreement
            (including deletion or return of student data).
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>13. Changes to these Terms</h2>
          <p style={P}>
            We may update these Terms from time to time. We&apos;ll update the &quot;Last
            updated&quot; date and, where appropriate, notify account holders. Continued use after
            changes take effect means you accept them.
          </p>
        </section>

        <section style={SECTION}>
          <h2 style={H2}>14. Governing law</h2>
          <p style={P}>
            These Terms are governed by the laws of the State of New York, without regard to
            conflict-of-laws principles. The state and federal courts in Suffolk County, New York
            have jurisdiction, except where applicable law (including for public-school or
            government entities) requires otherwise.
          </p>
        </section>

        <section>
          <h2 style={H2}>15. Contact</h2>
          <p style={P}>
            STEM Builder LLC<br />
            2650-1 Sunrise Hwy #1081, East Islip, NY 11730<br />
            <a href="mailto:info@stembuilder.io" style={A}>info@stembuilder.io</a>
          </p>
        </section>

      </div>
    </div>
  );
}
