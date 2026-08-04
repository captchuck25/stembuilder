"use client";

import { useState } from "react";
import type { PlanUsage } from "@/lib/plan";

// Buys overage blocks ($10/year = 25 students each) against the teacher's
// existing Pro subscription — card on file, prorated, no checkout page.
// Falls back to email while checkout is switched off (BILLING_ENABLED unset).
// Used in the dashboard's at-cap dialog and on /teachers/upgrade for
// proactive purchases.

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

export default function OverageBuy({ onDone }: { onDone: (usage: PlanUsage) => void }) {
  const [blocks, setBlocks] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function buy() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/teacher/billing/overage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Replace the form with the confirmation — the buy button disappears
        // so an absent-minded second click can't buy (and charge) twice.
        // Buying more is a deliberate re-open via the "Add more" link.
        setSuccess(`✓ Added ${blocks * 25} students — you now have room for ${data.cap}.`);
        setBlocks(1);
        onDone(data);
      } else {
        setError(data.error ?? `Could not add students (HTTP ${res.status}).`);
      }
    } catch {
      setError("Could not reach the server — try again.");
    }
    setBusy(false);
  }

  // Post-purchase: confirmation only, no armed buy button.
  if (success) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 14, color: "#16a34a", fontWeight: 800, margin: 0 }}>{success}</p>
        <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
          Your receipt is on its way to your email.
        </p>
        <button type="button" onClick={() => setSuccess("")}
          style={{ background: "none", border: "none", padding: 0, textAlign: "left",
            color: "#2563eb", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Need even more room? Add more students →
        </button>
      </div>
    );
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
        $10 per 25 students, per year — billed to your card on file today, and
        renews with your plan.
      </p>
    </div>
  );
}
