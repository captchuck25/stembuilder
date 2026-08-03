"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { TOOLS, toolDisplayName, type MarketingTool } from "@/lib/marketing/tools";
import styles from "../marketing.module.css";

// The tool directory: 6 cards, each fully clickable through to its detail page
// (/for-teachers/tools/[slug]) with a "Quick view" button that opens a modal
// rendering the SAME data source — one place to edit each tool.

function QuickViewContent({ tool }: { tool: MarketingTool }) {
  return (
    <div className={styles.dialogInner}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 className={styles.h3} style={{ fontSize: 24, margin: 0 }}>{toolDisplayName(tool)}</h2>
        {tool.flagship && <span className={styles.flagshipBadge}>★ Flagship</span>}
      </div>
      <p className={styles.body} style={{ fontWeight: 600, marginBottom: 16 }}>{tool.tagline}</p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tool.image} alt={`${tool.name} artwork`} className={styles.toolCardImg}
        style={{ marginBottom: 16 }} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span className={styles.chip}>{tool.gradeBand}</span>
        {tool.subjects.map((s) => (
          <span key={s} className={styles.chip}>{s}</span>
        ))}
      </div>

      <p className={styles.body} style={{ marginBottom: 16 }}>{tool.description[0]}</p>

      <h3 className={styles.h3}>In the classroom</h3>
      <ul style={{ margin: "0 0 20px", paddingLeft: 20 }}>
        {tool.classroomUse.slice(0, 2).map((u) => (
          <li key={u} className={styles.body} style={{ marginBottom: 6 }}>{u}</li>
        ))}
      </ul>

      <div className={styles.btnRow}>
        <Link href="/teachers" className={styles.btnPrimary}>Start free</Link>
        <Link href={tool.toolHref} className={styles.btnSecondary}>Try it</Link>
        <Link href={`/for-teachers/tools/${tool.slug}`} className={styles.textLink}>
          Full details →
        </Link>
      </div>
    </div>
  );
}

export default function ToolsDirectory() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<MarketingTool | null>(null);

  function openQuickView(tool: MarketingTool) {
    setActive(tool);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <div className={styles.toolGrid}>
        {TOOLS.map((tool) => (
          <article key={tool.slug} className={styles.toolCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tool.image} alt="" aria-hidden="true" className={styles.toolCardImg} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h3 className={styles.h3} style={{ margin: 0, fontSize: 20 }}>
                <Link
                  href={`/for-teachers/tools/${tool.slug}`}
                  className={styles.toolCardLink}
                >
                  {toolDisplayName(tool)}
                </Link>
              </h3>
              {tool.flagship && <span className={styles.flagshipBadge}>★ Flagship</span>}
            </div>
            <p className={styles.body} style={{ fontSize: 15 }}>{tool.tagline}</p>
            <div className={styles.toolCardFooter}>
              <span className={styles.textLink} aria-hidden="true" style={{ fontSize: 14 }}>
                Learn more →
              </span>
              <button
                type="button"
                className={styles.quickViewBtn}
                onClick={() => openQuickView(tool)}
                aria-label={`Quick view: ${toolDisplayName(tool)}`}
              >
                Quick view
              </button>
            </div>
          </article>
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label={active ? `Quick view: ${toolDisplayName(active)}` : "Tool quick view"}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        onClose={() => setActive(null)}
      >
        <button type="button" className={styles.dialogClose} aria-label="Close dialog"
          onClick={() => dialogRef.current?.close()}>
          ✕
        </button>
        {active && <QuickViewContent tool={active} />}
      </dialog>
    </>
  );
}
