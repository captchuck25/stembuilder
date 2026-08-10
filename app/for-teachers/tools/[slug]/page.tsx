import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  TOOLS,
  getTool,
  toolDisplayName,
  FLAGSHIP_CALLOUT,
} from "@/lib/marketing/tools";
import { MediaSlot } from "../../components/ui";
import styles from "../../marketing.module.css";

// One detail page per tool, generated from the shared tool list —
// adding a 7th tool to lib/marketing/tools.ts creates this page automatically.

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  return {
    title: `${toolDisplayName(tool)} — for your classroom`,
    description: tool.seoDescription,
    alternates: { canonical: `/for-teachers/tools/${tool.slug}` },
    openGraph: {
      title: `${toolDisplayName(tool)} | STEM Builder for Teachers`,
      description: tool.seoDescription,
      url: `/for-teachers/tools/${tool.slug}`,
      images: [tool.image],
    },
  };
}

export default async function ToolDetailPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();

  return (
    <>
      {/* Intro */}
      <section className={styles.sectionTight}>
        <div className={styles.container}>
          <p style={{ margin: "0 0 18px" }}>
            <Link href="/for-teachers#tools" className={styles.textLink}>
              ← All tools
            </Link>
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1 className={styles.h1} style={{ marginBottom: 0 }}>{toolDisplayName(tool)}</h1>
            {tool.flagship && <span className={styles.flagshipBadge}>★ Flagship</span>}
          </div>
          <p className={styles.lede} style={{ marginTop: 14, maxWidth: 820 }}>{tool.tagline}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className={styles.chip}>{tool.gradeBand}</span>
            {tool.subjects.map((s) => (
              <span key={s} className={styles.chip}>{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Description + art */}
      <section className={`${styles.grayBg} ${styles.section}`}>
        <div className={styles.container}>
          <div className={styles.grid2} style={{ alignItems: "start" }}>
            <div>
              {tool.description.map((p) => (
                <p key={p.slice(0, 32)} className={styles.body} style={{ fontSize: 17, marginBottom: 16 }}>
                  {p}
                </p>
              ))}
              {tool.flagship && (
                <div className={styles.flagshipCallout} style={{ marginTop: 20 }}>
                  <p>{FLAGSHIP_CALLOUT}</p>
                </div>
              )}
            </div>
            <div className={styles.cardSoft}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={tool.image}
                alt={`${toolDisplayName(tool)} artwork`}
                className={styles.toolCardImg}
                style={{ marginBottom: 16 }}
              />
              <MediaSlot label={tool.demoVideo} kind="video" />
            </div>
          </div>
        </div>
      </section>

      {/* How a class uses it */}
      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.h2}>How a class uses it</h2>
          <ul style={{ margin: "20px 0 0", paddingLeft: 22, maxWidth: 820 }}>
            {tool.classroomUse.map((u) => (
              <li key={u} className={styles.body} style={{ fontSize: 16, marginBottom: 12 }}>
                {u}
              </li>
            ))}
          </ul>
          {tool.lessonPlanPitch && (
            <div className={styles.cardSoft} style={{ marginTop: 24, maxWidth: 820 }}>
              <span className={styles.kicker}>Lesson plans &amp; projects</span>
              <p className={styles.body} style={{ margin: "10px 0 0", fontSize: 16 }}>
                {tool.lessonPlanPitch}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Example gallery */}
      <section className={`${styles.grayBg} ${styles.section}`}>
        <div className={styles.container}>
          <h2 className={styles.h2}>See it in action</h2>
          <div className={styles.grid3} style={{ marginTop: 24 }}>
            {tool.gallery.map((label) => (
              <MediaSlot key={label} label={label} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={styles.ctaBand}>
        <div className={styles.container}>
          <h2>Put {tool.name} in front of your class</h2>
          <p>It takes about a minute to start — and it&apos;s free for teachers.</p>
          <div className={styles.btnRow} style={{ justifyContent: "center" }}>
            <Link href="/teachers" className={styles.btnOnDark}>Start free</Link>
          </div>
        </div>
      </section>
    </>
  );
}
