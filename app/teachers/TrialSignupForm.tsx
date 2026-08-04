"use client";

import { useState } from "react";
import type { PlanUsage } from "@/lib/plan";

// Free Pro trial signup: one short form (course, grade level, state,
// district — lead-gen for follow-up, stored on the existing profile
// columns from migration 0004), then the trial activates immediately.
// The trial itself stays server-enforced and one-time; these fields are
// the only client input and they're plain contact context, never plan state.

const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6,
};

export default function TrialSignupForm({ onStarted }: { onStarted: (usage: PlanUsage) => void }) {
  const [contentArea, setContentArea] = useState("");
  const [gradeLevels, setGradeLevels] = useState("");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/teacher/plan/trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentArea, gradeLevels, state, district }),
    });
    const data = await res.json();
    if (res.ok) onStarted(data);
    else setError(data.error ?? "Could not start the trial.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
        Tell us a little about your classroom and your free Pro trial starts instantly —
        everything in Pro except the curriculum library, through the end of the school year.
      </p>
      <div>
        <label style={LABEL} htmlFor="trial-course">What course do you teach?</label>
        <input id="trial-course" style={INPUT} required maxLength={120} value={contentArea}
          onChange={(e) => setContentArea(e.target.value)} placeholder="e.g. STEM, Technology, Science" />
      </div>
      <div>
        <label style={LABEL} htmlFor="trial-grades">Grade level(s)</label>
        <input id="trial-grades" style={INPUT} required maxLength={120} value={gradeLevels}
          onChange={(e) => setGradeLevels(e.target.value)} placeholder="e.g. 6–8" />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={LABEL} htmlFor="trial-state">State</label>
          <input id="trial-state" style={INPUT} required maxLength={40} value={state}
            onChange={(e) => setState(e.target.value)} placeholder="e.g. NY" />
        </div>
        <div style={{ flex: 2 }}>
          <label style={LABEL} htmlFor="trial-district">School district</label>
          <input id="trial-district" style={INPUT} required maxLength={120} value={district}
            onChange={(e) => setDistrict(e.target.value)} placeholder="Your district or school" />
        </div>
      </div>
      {error && (
        <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 700, margin: 0 }}>{error}</p>
      )}
      <button type="submit" disabled={busy}
        style={{ padding: "12px 22px", borderRadius: 999, background: "#1f1f1f", color: "#fff",
          border: "2px solid #1f1f1f", fontWeight: 800, fontSize: 15, cursor: "pointer",
          opacity: busy ? 0.6 : 1 }}>
        {busy ? "Starting…" : "Start my free Pro trial"}
      </button>
    </form>
  );
}
