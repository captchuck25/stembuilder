import type { Metadata } from "next";
import Link from "next/link";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Trust & Privacy",
  description:
    "How STEM Builder protects students: FERPA & COPPA alignment, no ads, no data sales, username-only student accounts, US data storage, and district-ready data privacy agreements.",
  alternates: { canonical: "/for-teachers/trust" },
  openGraph: {
    title: "Trust & Privacy | STEM Builder for Teachers",
    description:
      "FERPA & COPPA alignment, no ads, no data sales, username-only student accounts, US data storage, and district-ready data privacy agreements.",
    url: "/for-teachers/trust",
  },
};

const COMMITMENTS = [
  {
    title: "FERPA & COPPA-aligned",
    body:
      "STEM Builder is designed for schools from the ground up. Student accounts are minimal by design, teachers and schools stay in control of class data, and our onboarding is built around child-privacy requirements — not retrofitted for them.",
  },
  {
    title: "No ads. No data sales. Ever.",
    body:
      "There is no advertising anywhere on STEM Builder, and we never sell student data or use it for marketing. Student information exists for one purpose: running your class.",
  },
  {
    title: "Students join with no email",
    body:
      "Students can join a class with just a username and a password. No student email address is ever required, and students are never asked for more personal information than the class needs.",
  },
  {
    title: "Data minimization by default",
    body:
      "We collect the minimum needed to run a classroom: a username, class membership, and the work students create. If we don't need it to make the tools work, we don't collect it.",
  },
  {
    title: "Deleted means deleted",
    body:
      "When work or accounts are deleted, they're removed on a scheduled purge — deleted data doesn't linger indefinitely in our systems.",
  },
  {
    title: "School data stays isolated",
    body:
      "Each school's and district's data is separated with database-enforced access rules — isolation is enforced at the data layer, not just in application code.",
  },
  {
    title: "Stored in the United States",
    body: "Student data is stored on infrastructure located in the United States.",
  },
];

const SUBPROCESSORS = [
  { name: "Vercel", purpose: "Application hosting and content delivery" },
  { name: "Supabase", purpose: "Database and authentication infrastructure" },
  { name: "Google", purpose: "Optional sign-in and Google Classroom roster sync" },
  { name: "Resend", purpose: "Transactional email (account and verification messages)" },
];

export default function TrustPage() {
  return (
    <>
      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <h1 className={styles.h1}>Trust &amp; Privacy</h1>
          <p className={styles.lede} style={{ maxWidth: 780 }}>
            Schools trust us with students — we treat that as the most important
            feature we ship. Here&apos;s exactly how STEM Builder handles student
            data, in plain language.
          </p>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 12 }}>
        <div className={styles.container}>
          <h2 className={styles.h2}>Our commitments</h2>
          <div className={styles.tileGrid} style={{ marginTop: 24 }}>
            {COMMITMENTS.map((c) => (
              <div key={c.title} className={styles.cardSoft}>
                <h3 className={styles.h3}>{c.title}</h3>
                <p className={styles.body}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.grayBg} ${styles.section}`}>
        <div className={styles.container}>
          <div className={styles.grid2}>
            <div className={styles.cardSoft}>
              <h2 className={styles.h3} style={{ fontSize: 22 }}>For districts: NDPA-ready</h2>
              <p className={styles.body}>
                We&apos;re prepared to sign a data privacy agreement with your
                district, including the National Data Privacy Agreement (NDPA).
                Request our DPA at{" "}
                <a href="mailto:privacy@stembuilder.io" className={styles.textLink}>
                  privacy@stembuilder.io
                </a>
                .
              </p>
            </div>
            <div className={styles.cardSoft}>
              <h2 className={styles.h3} style={{ fontSize: 22 }}>Questions?</h2>
              <p className={styles.body}>
                Privacy questions from teachers, parents, or district staff are
                always welcome:{" "}
                <a href="mailto:privacy@stembuilder.io" className={styles.textLink}>
                  privacy@stembuilder.io
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.h2}>Subprocessors</h2>
          <p className={styles.body} style={{ maxWidth: 720, marginBottom: 20 }}>
            These are the infrastructure providers that help us run STEM Builder.
            Each one processes data only to provide its service to us.
          </p>
          <div className={styles.demoTableWrap} style={{ maxWidth: 720 }}>
            <table className={styles.demoTable}>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Purpose</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s) => (
                  <tr key={s.name}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td>{s.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={`${styles.grayBg} ${styles.section}`}>
        <div className={styles.container}>
          <h2 className={styles.h2}>The documents</h2>
          <ul style={{ margin: "16px 0 0", paddingLeft: 22 }}>
            <li className={styles.body} style={{ marginBottom: 10 }}>
              <Link href="/privacy" className={styles.textLink}>Privacy Policy</Link>
            </li>
            <li className={styles.body}>
              <Link href="/terms" className={styles.textLink}>Terms of Service</Link>
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div className={styles.container}>
          <h2>Ready to see your students build?</h2>
          <p>It takes about a minute to start — and it&apos;s free for teachers.</p>
          <div className={styles.btnRow} style={{ justifyContent: "center" }}>
            <Link href="/teachers" className={styles.btnOnDark}>Start free</Link>
            <Link href="/for-teachers#tools" className={styles.btnOnDarkOutline}>Explore the tools</Link>
          </div>
        </div>
      </section>
    </>
  );
}
