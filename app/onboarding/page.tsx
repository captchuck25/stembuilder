"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { upsertProfile } from "@/lib/profile";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];
const GRADES = ["K","1","2","3","4","5","6","7","8","9","10","11","12"];
const SUBJECTS = ["Science", "Math", "Engineering / STEM", "Computer Science", "CTE / Technology", "Other"];

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f", borderRadius: 24,
  boxShadow: "0 14px 40px rgba(0,0,0,0.22)", padding: "44px 40px", maxWidth: 560, width: "100%",
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6, textAlign: "left",
};

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  // Arriving from the Teachers tab skips the teacher/student choice.
  const [step, setStep] = useState<"choose" | "teacher">(params.get("role") === "teacher" ? "teacher" : "choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // teacher fields
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [grades, setGrades] = useState<Set<string>>(new Set());
  const [subjects, setSubjects] = useState<Set<string>>(new Set());

  if (status === "loading") return null;
  if (!session?.user) { router.push("/sign-in"); return null; }

  function toggle(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  }

  async function chooseStudent() {
    if (!session?.user || saving) return;
    setSaving(true);
    await upsertProfile({ id: session.user.id, email: session.user.email, name: session.user.name, role: "student" });
    router.push("/student/dashboard");
  }

  async function submitTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.user || saving) return;
    setError("");
    if (!district.trim() || !state) { setError("Please add your school/district and state."); return; }
    setSaving(true);
    await upsertProfile({
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: "teacher",
      district: district.trim(),
      state,
      grade_levels: [...GRADES].filter(g => grades.has(g)).join(", "),
      content_area: [...SUBJECTS].filter(s => subjects.has(s)).join(", "),
    });
    router.push("/teachers/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat", padding: "40px 20px" }}>

      {step === "choose" ? (
        <div style={{ ...CARD, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Welcome to STEM Builder</h1>
          <p style={{ fontSize: 15, color: "#555", marginBottom: 36 }}>Are you joining as a teacher or a student?</p>

          <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => setStep("teacher")} disabled={saving}
              style={{ width: 200, padding: "28px 20px", borderRadius: 20, border: "3px solid #1f1f1f",
                background: "linear-gradient(135deg,#1e3a5f,#2563eb)", color: "#fff",
                cursor: saving ? "not-allowed" : "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
              <span style={{ fontSize: 40 }}>🧑‍🏫</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>Teacher</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
                Create classes, assign work, track progress
              </span>
            </button>

            <button onClick={chooseStudent} disabled={saving}
              style={{ width: 200, padding: "28px 20px", borderRadius: 20, border: "3px solid #1f1f1f",
                background: "linear-gradient(135deg,#14532d,#16a34a)", color: "#fff",
                cursor: saving ? "not-allowed" : "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
              <span style={{ fontSize: 40 }}>🎒</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>Student</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
                Join a class and complete assignments
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div style={CARD}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🧑‍🏫</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Tell us about your classroom</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              This helps us support you — and it&apos;s only a few quick fields.
            </p>
          </div>

          <form onSubmit={submitTeacher}>
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>School or district *</label>
              <input type="text" value={district} onChange={e => setDistrict(e.target.value)} required
                placeholder="e.g. Lincoln Middle School / Springfield USD" style={INPUT} />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={LABEL}>State *</label>
              <select value={state} onChange={e => setState(e.target.value)} required
                style={{ ...INPUT, background: "#fff" }}>
                <option value="" disabled>Select a state…</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={LABEL}>Grade level(s) you teach</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {GRADES.map(g => {
                  const on = grades.has(g);
                  return (
                    <button type="button" key={g} onClick={() => toggle(grades, g, setGrades)}
                      style={chip(on)}>{g}</button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={LABEL}>Subject / content area</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SUBJECTS.map(s => {
                  const on = subjects.has(s);
                  return (
                    <button type="button" key={s} onClick={() => toggle(subjects, s, setSubjects)}
                      style={chip(on)}>{s}</button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                padding: "10px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setStep("choose")} disabled={saving}
                style={{ padding: "12px 18px", borderRadius: 12, border: "2px solid #e5e7eb", background: "#fff",
                  color: "#6b7280", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                ← Back
              </button>
              <button type="submit" disabled={saving}
                style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none", background: "#1f1f1f",
                  color: "#fff", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.7 : 1 }}>
                {saving ? "Setting up…" : "Go to my dashboard"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function chip(on: boolean): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: on ? "2px solid #2563eb" : "2px solid #e5e7eb",
    background: on ? "#eff6ff" : "#fff", color: on ? "#2563eb" : "#6b7280",
  };
}
