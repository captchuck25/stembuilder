"use client";

import { useRef } from "react";
import styles from "../marketing.module.css";

// Interactive demo of the teacher dashboard for cold visitors.
// Standalone lookalike with static sample data ONLY — no backend calls, and
// deliberately not sharing code with the real dashboard (that refactor is a
// later phase; this page must not touch app/auth code).

const ASSIGNMENTS = [
  { name: "Bridge Challenge", tool: "Bridge Builder", due: "Due Friday", status: "18/22 submitted" },
  { name: "Design a Tiny Home", tool: "Blueprint Lab", due: "Due next Wednesday", status: "9/22 submitted" },
  { name: "Measurement Sprint", tool: "Measurement Lab", due: "Closed", status: "22/22 complete" },
];

type Progress = "complete" | "in-progress" | "not-started";

const ROSTER: { student: string; progress: [Progress, Progress, Progress] }[] = [
  { student: "ava.r", progress: ["complete", "in-progress", "complete"] },
  { student: "leo.m", progress: ["complete", "complete", "complete"] },
  { student: "quinn.b", progress: ["in-progress", "not-started", "complete"] },
  { student: "sofia.t", progress: ["complete", "in-progress", "complete"] },
  { student: "marcus.j", progress: ["complete", "not-started", "complete"] },
  { student: "nina.p", progress: ["in-progress", "in-progress", "complete"] },
  { student: "jayden.w", progress: ["complete", "complete", "complete"] },
  { student: "elena.k", progress: ["not-started", "in-progress", "complete"] },
];

const THUMBS = [
  { label: "Bridge — ava.r", sub: "Held 340 lb", bg: "linear-gradient(135deg,#0f766e,#134e4a)", icon: "🌉" },
  { label: "Tiny Home — leo.m", sub: "486 sq ft", bg: "linear-gradient(135deg,#1d4ed8,#1e3a8a)", icon: "🏠" },
  { label: "Turtle Art — nina.p", sub: "Code Lab", bg: "linear-gradient(135deg,#7c3aed,#4c1d95)", icon: "🐢" },
];

function StatusChip({ p }: { p: Progress }) {
  const map = {
    "complete": { cls: styles.statusComplete, label: "Complete" },
    "in-progress": { cls: styles.statusInProgress, label: "In progress" },
    "not-started": { cls: styles.statusNotStarted, label: "Not started" },
  } as const;
  const { cls, label } = map[p];
  return <span className={`${styles.statusChip} ${cls}`}>{label}</span>;
}

/**
 * Renders its children as the trigger ("See an example dashboard →");
 * clicking opens a modal demo dashboard. Native <dialog> gives us Esc-to-close
 * and keyboard containment for free.
 */
export default function DemoDashboardLink({ className }: { className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className={className ?? styles.textLink}
        style={{ background: "none", border: "none", padding: 0, font: "inherit", cursor: "pointer" }}
        onClick={() => ref.current?.showModal()}
      >
        See an example dashboard →
      </button>

      <dialog
        ref={ref}
        className={`${styles.dialog} ${styles.dialogWide}`}
        aria-label="Example teacher dashboard (sample data)"
        onClick={(e) => {
          // Click on the backdrop (outside the inner panel) closes the dialog.
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <button type="button" className={styles.dialogClose} aria-label="Close dialog"
          onClick={() => ref.current?.close()}>
          ✕
        </button>
        <div className={styles.dialogInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
            <h2 className={styles.h3} style={{ fontSize: 22, margin: 0 }}>Ms. Rivera&apos;s Dashboard</h2>
            <span className={styles.sampleBadge}>Sample data — demo</span>
          </div>
          <p className={styles.body} style={{ marginBottom: 20 }}>
            Period 3 STEM &nbsp;·&nbsp; 22 students &nbsp;·&nbsp; class code <strong>MAPLE-312</strong>
          </p>

          <h3 className={styles.h3}>Assignments</h3>
          <div className={styles.demoTableWrap} style={{ marginBottom: 24 }}>
            <table className={styles.demoTable}>
              <thead>
                <tr>
                  <th scope="col">Assignment</th>
                  <th scope="col">Tool</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {ASSIGNMENTS.map((a) => (
                  <tr key={a.name}>
                    <td style={{ fontWeight: 700 }}>{a.name}</td>
                    <td>{a.tool}</td>
                    <td>{a.due}</td>
                    <td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className={styles.h3}>Student progress</h3>
          <div className={styles.demoTableWrap} style={{ marginBottom: 8 }}>
            <table className={styles.demoTable}>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  {ASSIGNMENTS.map((a) => (
                    <th scope="col" key={a.name}>{a.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROSTER.map((r) => (
                  <tr key={r.student}>
                    <td style={{ fontWeight: 700 }}>{r.student}</td>
                    {r.progress.map((p, i) => (
                      <td key={i}><StatusChip p={p} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.body} style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
            + 14 more students
          </p>

          <h3 className={styles.h3}>Recent student work</h3>
          <div className={styles.thumbRow}>
            {THUMBS.map((t) => (
              <div key={t.label} className={styles.thumb} style={{ background: t.bg }}
                role="img" aria-label={`Sample work thumbnail: ${t.label}`}>
                <span style={{ fontSize: 22 }} aria-hidden="true">{t.icon}</span>
                <span>{t.label}</span>
                <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.8)" }}>{t.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
