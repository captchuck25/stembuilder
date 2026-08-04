"use client";

import { useEffect, useRef, useState } from "react";
import type { PlanUsage } from "@/lib/plan";
import TrialSignupForm from "../TrialSignupForm";

// Teacher plan usage meter + upgrade prompts for the dashboard.
// All state comes from GET /api/teacher/plan (server-derived); the only
// mutation is the one-time free-trial start. Upgrade/overage purchases are
// mailto stubs until Stripe lands (see TODO in /api/teacher/plan/trial).

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const BTN: React.CSSProperties = {
  display: "inline-block",
  borderRadius: 999,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  border: "2px solid #1f1f1f",
};

// Buys overage blocks against the existing Pro subscription (card on file,
// prorated). Falls back to email while checkout is switched off.
function OverageBuy({ onDone }: { onDone: (usage: PlanUsage) => void }) {
  const [blocks, setBlocks] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/billing/overage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { onDone(data); return; }
      setError(data.error ?? `Could not add students (HTTP ${res.status}).`);
    } catch {
      setError("Could not reach the server — try again.");
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
        How many more students?
        <select value={blocks} onChange={(e) => setBlocks(Number(e.target.value))}
          style={{ display: "block", width: "100%", marginTop: 6, padding: "10px 12px",
            borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 14, color: "#111" }}>
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>+{n * 25} students — ${n * 10}/year</option>
          ))}
        </select>
      </label>
      {error && (
        <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 700, margin: 0 }}>
          {error}{" "}
          <a href="mailto:info@stembuilder.io?subject=Add%20students%20to%20Teacher%20Pro"
            style={{ color: "#2563eb" }}>
            Email us instead →
          </a>
        </p>
      )}
      <button type="button" onClick={buy} disabled={busy}
        style={{ ...BTN, background: "#1f1f1f", color: "#fff", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Adding…" : `Add ${blocks * 25} students — $${blocks * 10}/year`}
      </button>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
        Billed to your card on file, prorated for the rest of your year.
      </p>
    </div>
  );
}

export default function PlanMeter() {
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [showTrialForm, setShowTrialForm] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const autoOpened = useRef(false);

  async function load() {
    const res = await fetch("/api/teacher/plan");
    if (res.ok) setUsage(await res.json());
  }
  useEffect(() => { load(); }, []);

  // At/over the cap on an individual plan: surface the modal once per visit.
  useEffect(() => {
    if (usage && usage.atCap && !usage.institutional && !autoOpened.current) {
      autoOpened.current = true;
      dialogRef.current?.showModal();
    }
  }, [usage]);

  if (!usage || usage.institutional) return null;

  const cap = usage.cap ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((usage.count / cap) * 100)) : 0;
  const barColor = usage.atCap ? "#dc2626" : pct >= 80 ? "#d97706" : "#16a34a";
  const trialExpired = usage.plan === "pro_trial" && usage.effective === "free";
  const planLabel =
    usage.effective === "pro" ? "Teacher Pro"
    : usage.effective === "pro_trial" ? "Pro trial"
    : "Free plan";

  function onTrialStarted(next: PlanUsage) {
    setUsage(next);
    setShowTrialForm(false);
    dialogRef.current?.close();
  }

  return (
    <div style={{ ...CARD, padding: "18px 24px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
              {planLabel}
              {usage.effective === "pro_trial" && usage.trialEndsAt && (
                <span style={{ fontWeight: 600, color: "#6b7280" }}>
                  {" "}· until {new Date(usage.trialEndsAt).toLocaleDateString()}
                </span>
              )}
            </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: usage.atCap ? "#dc2626" : "#111" }}>
              {usage.count} / {cap} students
            </span>
          </div>
          <div style={{ marginTop: 8, height: 10, borderRadius: 999, background: "#e5e7eb", overflow: "hidden" }}
            role="progressbar" aria-valuenow={usage.count} aria-valuemin={0} aria-valuemax={cap}
            aria-label={`${usage.count} of ${cap} students used`}>
            <div style={{ width: `${pct}%`, height: "100%", background: barColor, transition: "width 300ms ease" }} />
          </div>
        </div>
        {(usage.atCap || trialExpired) && (
          <button type="button" onClick={() => dialogRef.current?.showModal()}
            style={{ ...BTN, background: "#dc2626", borderColor: "#dc2626", color: "#fff" }}>
            {trialExpired ? "Trial ended — see options" : "At your limit — see options"}
          </button>
        )}
      </div>

      {usage.atCap && (
        <p style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 700, color: "#dc2626" }}>
          You&apos;ve reached your student limit — new students can&apos;t join your classes
          until you upgrade{!usage.trialUsed && " or start a free Pro trial"}. Students who try
          will see &quot;This class is full — ask your teacher.&quot;
        </p>
      )}
      {trialExpired && !usage.atCap && (
        <p style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 700, color: "#92400e" }}>
          Your free Pro trial has ended — you&apos;re back on the Free plan (up to 50 students).
        </p>
      )}

      <dialog ref={dialogRef}
        style={{ border: "3px solid #1f1f1f", borderRadius: 20, padding: 0, maxWidth: "min(480px, 92vw)" }}
        aria-label="Student limit options">
        <div style={{ padding: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 10px" }}>
            {trialExpired ? "Your Pro trial has ended" : "You're at your student limit"}
          </h2>
          <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, margin: "0 0 18px" }}>
            {usage.effective === "pro"
              ? `Teacher Pro includes ${cap} students. Add more in blocks of 25 for $10/year per block.`
              : `The ${trialExpired ? "Free plan" : "free plan"} includes up to ${cap} students across all your classes. Upgrade to keep growing — or bring your school or district on board.`}
          </p>
          {showTrialForm ? (
            <TrialSignupForm onStarted={onTrialStarted} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {usage.effective === "pro" ? (
                <OverageBuy onDone={(next) => { setUsage(next); dialogRef.current?.close(); }} />
              ) : (
                <>
                  {!usage.trialUsed && (
                    <button type="button" onClick={() => setShowTrialForm(true)}
                      style={{ ...BTN, background: "#1f1f1f", color: "#fff" }}>
                      Start a free Pro trial (125 students, rest of the school year)
                    </button>
                  )}
                  <a href="/teachers/upgrade" style={{ ...BTN, background: "#fff", color: "#1f1f1f", textAlign: "center" }}>
                    Upgrade to Teacher Pro — $60/year
                  </a>
                  <a href="/for-teachers/pricing" style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", textAlign: "center", textDecoration: "none" }}>
                    See all plans →
                  </a>
                </>
              )}
            </div>
          )}
          <button type="button" onClick={() => dialogRef.current?.close()}
            style={{ marginTop: 16, background: "none", border: "none", color: "#6b7280", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Not now
          </button>
        </div>
      </dialog>
    </div>
  );
}
