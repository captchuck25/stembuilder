import type { Metadata } from "next";
import Link from "next/link";
import {
  PRICING_HERO,
  PLANS,
  ENROLLMENT_TIERS,
  PD_ADDON,
  PRICING_FOOTER_ITEMS,
  PRICING_SUPPORT_LINE,
  SUPPORT_EMAIL,
} from "@/lib/marketing/pricing";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "STEM Builder is free for teachers — run a class of up to 50 students at no cost. Teacher Pro is $60/year, and flat school & district plans start at $300/year with a free trial.",
  alternates: { canonical: "/for-teachers/pricing" },
  openGraph: {
    title: "Pricing | STEM Builder for Teachers",
    description:
      "Free for teachers to start. Teacher Pro $60/year. Flat school & district plans from $300/year with a free trial.",
    url: "/for-teachers/pricing",
  },
};

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className={styles.sectionTight}>
        <div className={styles.container} style={{ textAlign: "center" }}>
          <h1 className={styles.h1}>{PRICING_HERO.h1}</h1>
          <p className={styles.lede} style={{ maxWidth: 720, margin: "0 auto 8px" }}>
            {PRICING_HERO.sub}
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className={styles.section} style={{ paddingTop: 24 }} aria-label="Plans">
        <div className={styles.container}>
          <div className={styles.grid3} style={{ alignItems: "stretch" }}>
            {PLANS.map((plan) => (
              <div key={plan.id} className={styles.card}
                style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h2 className={styles.h3} style={{ fontSize: 22, margin: 0 }}>
                  {plan.name} — {plan.price}
                </h2>
                <p className={styles.body} style={{ fontWeight: 600 }}>{plan.blurb}</p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {plan.features.map((f) => (
                    <li key={f} className={styles.body} style={{ marginBottom: 8 }}>{f}</li>
                  ))}
                </ul>
                <div className={styles.btnRow} style={{ marginTop: "auto", paddingTop: 8 }}>
                  {plan.ctas.map((cta) => (
                    <a key={cta.label} href={cta.href}
                      className={cta.primary ? styles.btnPrimary : styles.btnSecondary}>
                      {cta.label}
                    </a>
                  ))}
                </div>
                {plan.footnote && (
                  <p className={styles.body} style={{ fontSize: 14, color: "#6b7280" }}>
                    {plan.footnote}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Enrollment tiers */}
      <section className={`${styles.grayBg} ${styles.section}`} aria-labelledby="by-enrollment">
        <div className={styles.container} style={{ maxWidth: 760 }}>
          <h2 id="by-enrollment" className={styles.h2}>Pricing by enrollment</h2>
          <p className={styles.body} style={{ marginBottom: 20 }}>
            School &amp; District plans are flat by total enrollment — every teacher and
            student included.
          </p>
          <div className={styles.demoTableWrap}>
            <table className={styles.demoTable} style={{ background: "#fff", borderRadius: 12 }}>
              <thead>
                <tr>
                  <th scope="col">Enrollment</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                {ENROLLMENT_TIERS.map((t) => (
                  <tr key={t.range}>
                    <td>{t.range}</td>
                    <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PD add-on */}
      <section className={styles.section} aria-labelledby="pd-addon">
        <div className={styles.container} style={{ maxWidth: 760 }}>
          <div className={styles.cardSoft}>
            <h2 id="pd-addon" className={styles.h3} style={{ fontSize: 22 }}>{PD_ADDON.name}</h2>
            <p className={styles.body} style={{ margin: "10px 0 18px" }}>{PD_ADDON.body}</p>
            <a href={PD_ADDON.cta.href} className={styles.btnPrimary}>{PD_ADDON.cta.label}</a>
          </div>
        </div>
      </section>

      {/* Footer strip + support line */}
      <section className={styles.trustStrip} aria-label="Pricing promises">
        <div className={styles.container}>
          <div className={styles.trustStripInner}>
            {PRICING_FOOTER_ITEMS.map((item, i) => (
              <span key={item} className={styles.trustItem}>
                {item}
                {i < PRICING_FOOTER_ITEMS.length - 1 && (
                  <span className={styles.trustDot} aria-hidden="true">·</span>
                )}
              </span>
            ))}
          </div>
          <p style={{ textAlign: "center", margin: "14px 0 0", color: "#d1d5db", fontSize: 15 }}>
            {PRICING_SUPPORT_LINE}{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={styles.trustLink}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </section>

      {/* Closing CTA */}
      <section className={styles.ctaBand} aria-labelledby="pricing-cta">
        <div className={styles.container}>
          <h2 id="pricing-cta">Ready to see your students build?</h2>
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
