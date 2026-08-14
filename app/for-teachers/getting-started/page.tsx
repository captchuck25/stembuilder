import type { Metadata } from "next";
import Link from "next/link";
import { MediaSlot, ComingSoon } from "../components/ui";
import DemoDashboardLink from "../components/DemoDashboard";
import styles from "../marketing.module.css";

export const metadata: Metadata = {
  title: "Getting Started",
  description:
    "Set up STEM Builder for your classroom in about a minute: create a free teacher account, create a class, share the class code or sync Google Classroom, assign a tool, and watch progress.",
  alternates: { canonical: "/for-teachers/getting-started" },
  openGraph: {
    title: "Getting Started | STEM Builder for Teachers",
    description:
      "Create a free teacher account, create a class, share the code or sync Google Classroom, assign a tool, and watch progress — all in about a minute.",
    url: "/for-teachers/getting-started",
  },
};

const WALKTHROUGH = [
  {
    title: "Create your free teacher account",
    body:
      "Sign up with your school email and a password, or use your Google account. Teacher accounts are free — no credit card, no trial clock.",
    media: "Screenshot — the teacher sign-up page",
  },
  {
    title: "Create a class",
    body:
      "Name your class (\"Period 3 STEM\") and it's live. You'll get a class code right away — that code is all your students need.",
    media: "Screenshot — creating a class and getting the class code",
  },
  {
    title: "Students join with the code — or sync Google Classroom",
    body:
      "Students go to the join page, enter the class code, and pick a username — no student email required. Using Google Classroom? Connect it and import your roster in a couple of clicks instead.",
    media: "Screenshot — a student joining with the class code",
  },
  {
    title: "Assign a tool",
    body:
      "Open your class, pick a tool, and set a challenge — a bridge to beat, a home to design, levels to complete. Or let students explore freely; every tool works without an assignment, too.",
    media: "Screenshot — assigning a challenge to the class",
  },
  {
    title: "Watch them build",
    body:
      "Your dashboard shows every student's work and progress in one place — who's started, who's stuck, who's already on version three.",
    media: "Screenshot — the teacher dashboard with class progress",
    demoLink: true,
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <h1 className={styles.h1}>Getting started</h1>
          <p className={styles.lede} style={{ maxWidth: 780 }}>
            From zero to a full class building — in about a minute of setup. Here&apos;s
            the whole process, start to finish.
          </p>
          <div className={styles.cardSoft} style={{ maxWidth: 780 }}>
            <MediaSlot label="Overview video — STEM Builder for teachers in 90 seconds" kind="video" />
          </div>
        </div>
      </section>

      <section className={styles.section} style={{ paddingTop: 24 }}>
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <ol className={styles.numberedList}>
            {WALKTHROUGH.map((step, i) => (
              <li key={step.title} className={styles.cardSoft}>
                <div className={styles.stepNum} aria-hidden="true">{i + 1}</div>
                <h2 className={styles.h3} style={{ fontSize: 22 }}>{step.title}</h2>
                <p className={styles.body} style={{ marginBottom: 16 }}>{step.body}</p>
                {step.demoLink && (
                  <p style={{ margin: "0 0 16px" }}>
                    <DemoDashboardLink />
                  </p>
                )}
                <MediaSlot label={step.media} />
              </li>
            ))}
          </ol>

          <p style={{ marginTop: 28 }}>
            <ComingSoon>🎓 In-app tutorials for students — coming soon</ComingSoon>
          </p>
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div className={styles.container}>
          <h2>Ready to see your students build?</h2>
          <p>It takes about a minute to get started — free, no credit card required.</p>
          <div className={styles.btnRow} style={{ justifyContent: "center" }}>
            <Link href="/teachers" className={styles.btnOnDark}>Start free</Link>
            <Link href="/for-teachers#tools" className={styles.btnOnDarkOutline}>Explore the tools</Link>
          </div>
        </div>
      </section>
    </>
  );
}
