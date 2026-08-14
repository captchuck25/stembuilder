import type { Metadata } from "next";
import Link from "next/link";
import ToolsDirectory from "./components/ToolsDirectory";
import DemoDashboardLink from "./components/DemoDashboard";
import PromoVideo from "./components/PromoVideo";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: "STEM Builder for Teachers — Students building on day one",
  description:
    "Interactive STEM tools for K-12 classrooms: design, engineering, coding, and electronics that run in any browser and export to the real world. Free for teachers to get started.",
  alternates: { canonical: "/for-teachers" },
  openGraph: {
    title: "STEM Builder for Teachers — Students building on day one",
    description:
      "Interactive STEM tools for K-12 classrooms: design, engineering, coding, and electronics that run in any browser and export to the real world. Free for teachers to get started.",
    url: "/for-teachers",
  },
};

const STEPS = [
  {
    title: "Create your class",
    body: "Sign up free and set up a class in under a minute.",
  },
  {
    title: "Students join instantly",
    body: "Share a class code, or sync your Google Classroom. No student emails required.",
  },
  {
    title: "Assign, and watch them build",
    body: "Pick a tool, set a challenge, and see every student's work and progress in one place.",
    demoLink: true,
  },
];

const PILLARS = [
  {
    title: "Get straight to it",
    body: "Across every tool, the learning curve is short by design. Students are creating in the first few minutes — not days from now.",
  },
  {
    title: "The computer gets out of the way",
    body: "Built to enhance hands-on education, not revolve around it. The screen is a means to making — not the destination.",
  },
  {
    title: "Six tools and growing",
    body: "A widening set of STEM apps — design, engineering, coding, electronics, and more — under one login, one class, one dashboard.",
  },
];

const LOVE_TILES = [
  {
    title: "Zero prep, zero setup",
    body: "Runs in any browser. Nothing to install, no materials to buy, no accounts to track down.",
  },
  {
    title: "Short learning curve",
    body: "Students spend their time creating, not fighting the software. Powerful tools, without the weeks of training.",
  },
  {
    title: "Real-world output",
    body: "Designs don't stay trapped on a screen: print them, cut them, build them.",
  },
  {
    title: "See real progress",
    body: "Every student's creations and progress, together on your dashboard.",
    demoLink: true,
  },
  {
    title: "Fits your curriculum",
    body: "Designed around NGSS, Common Core, and ISTE practices — activities slot into what you already teach, not the other way around.",
  },
];

const TRUST_ITEMS = [
  "FERPA & COPPA-aligned",
  "No ads, ever",
  "We never sell student data",
  "Students can join with no email",
  "Free to get started",
];

export default function ForTeachersPage() {
  return (
    <>
      {/* HERO */}
      <section className={`${styles.patternBg} ${styles.section}`}>
        <div className={styles.container}>
          <div className={styles.heroCard}>
            <h1 className={styles.h1}>Students building on day one.</h1>
            <p className={styles.lede} style={{ marginBottom: 0 }}>
              A growing suite of hands-on STEM tools — design, engineering, coding,
              electronics, and more — built to shorten the software learning curve,
              so students spend their time creating, not learning to navigate the
              software.
            </p>
            <PromoVideo
              src="/marketing/stembuilder-promo.mp4"
              label="STEM Builder in 30 seconds"
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className={styles.section} aria-labelledby="how-it-works">
        <div className={styles.container}>
          <span className={styles.kicker}>How it works</span>
          <h2 id="how-it-works" className={styles.h2}>Up and running in three steps</h2>
          <div className={styles.grid3} style={{ marginTop: 28 }}>
            {STEPS.map((step, i) => (
              <div key={step.title} className={styles.cardSoft}>
                <div className={styles.stepNum} aria-hidden="true">{i + 1}</div>
                <h3 className={styles.h3}>{step.title}</h3>
                <p className={styles.body}>{step.body}</p>
                {step.demoLink && (
                  <p style={{ marginTop: 12, marginBottom: 0 }}>
                    <DemoDashboardLink />
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE STEM BUILDER DIFFERENCE */}
      <section className={`${styles.grayBg} ${styles.section}`} aria-labelledby="difference">
        <div className={styles.container}>
          <span className={styles.kicker}>The STEM Builder difference</span>
          <h2 id="difference" className={styles.h2}>Software that gets out of the way.</h2>
          <p className={styles.lede} style={{ maxWidth: 780 }}>
            Every STEM Builder tool is built to be picked up in minutes — so students
            and teachers spend their time on the STEM concept, not on learning the
            software. That&apos;s the whole idea: shorten the digital learning curve
            so technology enhances hands-on learning instead of consuming it.
          </p>
          <div className={styles.grid3}>
            {PILLARS.map((p) => (
              <div key={p.title} className={styles.cardSoft}>
                <h3 className={styles.h3}>{p.title}</h3>
                <p className={styles.body}>{p.body}</p>
              </div>
            ))}
          </div>
          <div className={styles.flagshipCallout}>
            <p>
              Our most powerful tools, <strong>STEM Sketch</strong> and{" "}
              <strong>Blueprint Lab</strong>, do what traditional CAD takes weeks to
              teach — real 3D and architectural design without the steep ramp. And
              the work doesn&apos;t stay trapped on a screen: export to 3D printers,
              laser cutters, and CNC machines, and bring students&apos; designs into
              their hands.
            </p>
          </div>
        </div>
      </section>

      {/* WHY TEACHERS LOVE IT */}
      <section className={styles.section} aria-labelledby="why-teachers">
        <div className={styles.container}>
          <span className={styles.kicker}>Why teachers love it</span>
          <h2 id="why-teachers" className={styles.h2}>Built for real classrooms</h2>
          <div className={styles.tileGrid} style={{ marginTop: 28 }}>
            {LOVE_TILES.map((tile) => (
              <div key={tile.title} className={styles.cardSoft}>
                <h3 className={styles.h3}>{tile.title}</h3>
                <p className={styles.body}>{tile.body}</p>
                {tile.demoLink && (
                  <p style={{ marginTop: 12, marginBottom: 0 }}>
                    <DemoDashboardLink />
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EXPLORE THE TOOLS */}
      <section
        id="tools"
        className={`${styles.patternBg} ${styles.section} ${styles.anchorTarget}`}
        aria-labelledby="explore-tools"
      >
        <div className={styles.container}>
          <div className={styles.card} style={{ marginBottom: 28, textAlign: "center" }}>
            <span className={styles.kicker}>Explore the tools</span>
            <h2 id="explore-tools" className={styles.h2} style={{ marginBottom: 0 }}>
              Six tools. One classroom.
            </h2>
          </div>
          <ToolsDirectory />
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className={styles.trustStrip} aria-label="Trust and privacy">
        <div className={styles.container}>
          <div className={styles.trustStripInner}>
            {TRUST_ITEMS.map((item, i) => (
              <span key={item} className={styles.trustItem}>
                {item}
                {i < TRUST_ITEMS.length - 1 && (
                  <span className={styles.trustDot} aria-hidden="true">·</span>
                )}
              </span>
            ))}
          </div>
          <p style={{ textAlign: "center", margin: "14px 0 0" }}>
            <Link href="/for-teachers/trust" className={styles.trustLink}>
              Read our privacy commitment →
            </Link>
          </p>
        </div>
      </section>

      {/* WHAT IS STEM BUILDER? (SEO anchor) */}
      <section className={styles.section} aria-labelledby="what-is">
        <div className={styles.container} style={{ maxWidth: 860 }}>
          <h2 id="what-is" className={styles.h2}>What is STEM Builder?</h2>
          <p className={styles.body} style={{ fontSize: 17 }}>
            STEM Builder is a collection of interactive STEM tools that let K-12
            students design, build, and code right in the browser — floor plans,
            bridges, circuits, real Python — then take their work into the real
            world as 3D prints, laser-cut parts, and CNC files. Every tool is built
            to flatten the learning curve, so class time goes to making, not to
            mastering complicated software. Teachers create a class in minutes,
            students join with a code, and everyone&apos;s work saves automatically.
            It&apos;s free for teachers to get started, with no ads and student
            privacy designed in from day one.
          </p>
        </div>
      </section>

      {/* CLOSING CTA BAND */}
      <section className={styles.ctaBand} aria-labelledby="closing-cta">
        <div className={styles.container}>
          <h2 id="closing-cta">Ready to see your students build?</h2>
          <p>It takes about a minute to get started — free, no credit card required.</p>
          <div className={styles.btnRow} style={{ justifyContent: "center" }}>
            <Link href="/teachers" className={styles.btnOnDark}>Start free</Link>
            <a href="#tools" className={styles.btnOnDarkOutline}>Explore the tools</a>
          </div>
          <p style={{ margin: "18px 0 0" }}>
            <Link href="/for-teachers/pricing" className={styles.trustLink}>
              See pricing — free for teachers to start →
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
