import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import styles from "./marketing.module.css";

// Public marketing shell for the "For Teachers" pages — no auth, no student data.
// Reuses the site header for brand consistency, adds a marketing subnav + footer.

export const metadata: Metadata = {
  metadataBase: new URL("https://stembuilder.io"),
  title: {
    default: "STEM Builder for Teachers",
    template: "%s | STEM Builder for Teachers",
  },
  description:
    "Hands-on STEM tools for K-12 classrooms — design, engineering, coding, and electronics that run in the browser and export to the real world. Free for teachers.",
  openGraph: {
    siteName: "STEM Builder",
    type: "website",
    images: ["/ui/sb-logo.png"],
  },
};

export default function ForTeachersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <div className={styles.subnav}>
        <nav aria-label="For teachers" className={styles.container}>
          <div className={styles.subnavInner}>
            <Link href="/for-teachers" className={styles.subnavLink}>Why STEM Builder</Link>
            <Link href="/for-teachers#tools" className={styles.subnavLink}>The tools</Link>
            <Link href="/for-teachers/getting-started" className={styles.subnavLink}>Getting started</Link>
            <Link href="/for-teachers/trust" className={styles.subnavLink}>Trust &amp; privacy</Link>
            <Link href="/teachers" className={styles.subnavCta}>Start free</Link>
          </div>
        </nav>
      </div>

      <main className={styles.page}>{children}</main>

      <footer className={styles.marketingFooter}>
        <div className={styles.container}>
          <div className={styles.footerLinks}>
            <Link href="/for-teachers">For Teachers</Link>
            <Link href="/for-teachers/getting-started">Getting Started</Link>
            <Link href="/for-teachers/trust">Trust &amp; Privacy</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/teachers">Teacher Sign-Up</Link>
            <Link href="/sign-in">Log In</Link>
          </div>
        </div>
      </footer>
      <div
        aria-hidden="true"
        style={{
          height: 40,
          width: "100%",
          backgroundImage: "url('/ui/footer-metal.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    </div>
  );
}
