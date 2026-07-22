"use client";

// Onboarding serves two audiences:
//
//  1. First-time GOOGLE users (session.user.needsOnboarding): no profile row
//     exists yet — Google sign-in creates nothing. They pick a role and path
//     here and /api/onboarding/complete creates the profile with the correct
//     compliance handling (educator affirmation / class-code enrollment / 13+
//     age gate). Abandoning this page leaves no orphaned data.
//
//  2. Freshly registered CREDENTIALS teachers (?role=teacher, profile exists):
//     they only fill in the classroom details (district/state/grades/subjects),
//     which posts to /api/profile — role is fixed and not settable from here.
//
// Anyone else with a complete profile is bounced straight to their dashboard.

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { TEACHER_AFFIRMATION_TEXT } from "@/lib/compliance";

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
const ERROR_BOX: React.CSSProperties = {
  background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
  padding: "10px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600, marginBottom: 16,
};

type Step = "choose" | "teacher" | "studentPath" | "age" | "blocked";

const AGE_TOKEN_KEY = "sb_age_token";
const BLOCKED_KEY = "sb_gate_blocked";

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}

function Onboarding() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>(params.get("role") === "teacher" ? "teacher" : "choose");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // teacher fields
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("");
  const [grades, setGrades] = useState<Set<string>>(new Set());
  const [subjects, setSubjects] = useState<Set<string>>(new Set());
  const [affirmed, setAffirmed] = useState(false);

  // student fields
  const [code, setCode] = useState("");
  const [birthDate, setBirthDate] = useState("");

  const needsOnboarding = session?.user?.needsOnboarding === true;
  const bootstrapped = useRef(false);

  // Route users who don't belong here, and fast-path the Google independent
  // flow when the sign-up page already ran the age check this session.
  useEffect(() => {
    if (status === "loading" || bootstrapped.current) return;
    bootstrapped.current = true;

    if (status !== "authenticated") { router.replace("/sign-in"); return; }

    if (!needsOnboarding) {
      // Profile exists. Credentials teachers arriving with ?role=teacher fill
      // in classroom details; everyone else goes to their dashboard.
      if (session?.user?.role === "teacher" && params.get("role") === "teacher") {
        setStep("teacher");
      } else if (session?.user?.role === "teacher") {
        router.replace("/teachers/dashboard");
      } else {
        router.replace("/student/dashboard");
      }
      return;
    }

    if (params.get("path") === "independent") {
      const token = sessionStorage.getItem(AGE_TOKEN_KEY);
      if (token) { completeIndependent(token); return; }
      if (sessionStorage.getItem(BLOCKED_KEY)) { setStep("blocked"); return; }
      setStep("age");
    }
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "loading" || status !== "authenticated") return null;

  function toggle(set: Set<string>, value: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  }

  async function finish(dest: string) {
    // Refresh the JWT so it adopts the profile created a moment ago
    // (auth.ts jwt callback, trigger === "update").
    await update();
    router.replace(dest);
  }

  async function completeIndependent(token: string) {
    setSaving(true);
    setError("");
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "student", path: "independent", ageToken: token }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      sessionStorage.removeItem(AGE_TOKEN_KEY);
      await finish("/student/dashboard");
      return;
    }
    setSaving(false);
    if (data.code === "age_gate") {
      sessionStorage.removeItem(AGE_TOKEN_KEY);
      sessionStorage.setItem(BLOCKED_KEY, "1");
      setStep("blocked");
    } else if (res.status === 409) {
      await finish("/student/dashboard");
    } else {
      setError(data.error ?? "Something went wrong. Please try again.");
      setStep("age");
    }
  }

  async function submitAge(e: React.FormEvent) {
    e.preventDefault();
    if (!birthDate || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/auth/age-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.token) {
      await completeIndependent(data.token);
      return;
    }
    setSaving(false);
    if (data.blocked) {
      sessionStorage.setItem(BLOCKED_KEY, "1");
      setStep("blocked");
    } else {
      setError(data.error ?? "Please enter a valid date.");
    }
  }

  async function submitClassCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || saving) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "student", path: "class_code", code: code.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || res.status === 409) {
      await finish("/student/dashboard");
      return;
    }
    setSaving(false);
    setError(data.error ?? "Could not join that class.");
  }

  async function submitTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError("");
    if (!district.trim() || !state) { setError("Please add your school/district and state."); return; }
    if (needsOnboarding && !affirmed) {
      setError("Please confirm the educator affirmation to continue.");
      return;
    }
    setSaving(true);

    const gradeLevels = [...GRADES].filter(g => grades.has(g)).join(", ");
    const contentArea = [...SUBJECTS].filter(s => subjects.has(s)).join(", ");

    if (needsOnboarding) {
      // Google first login: creates the teacher profile + affirmation record.
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "teacher", affirmed,
          district: district.trim(), state, gradeLevels, contentArea,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        setSaving(false);
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      await finish("/teachers/dashboard");
      return;
    }

    // Credentials teacher (profile already exists): details only, never role.
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ district: district.trim(), state, grade_levels: gradeLevels, content_area: contentArea }),
    });
    router.replace("/teachers/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat", padding: "40px 20px" }}>

      {step === "choose" && (
        <div style={{ ...CARD, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>Welcome to STEM Builder</h1>
          <p style={{ fontSize: 15, color: "#555", marginBottom: 36 }}>Are you joining as a teacher or a student?</p>

          <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => { setError(""); setStep("teacher"); }} disabled={saving}
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

            <button onClick={() => { setError(""); setStep("studentPath"); }} disabled={saving}
              style={{ width: 200, padding: "28px 20px", borderRadius: 20, border: "3px solid #1f1f1f",
                background: "linear-gradient(135deg,#14532d,#16a34a)", color: "#fff",
                cursor: saving ? "not-allowed" : "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
              <span style={{ fontSize: 40 }}>🎒</span>
              <span style={{ fontSize: 18, fontWeight: 800 }}>Student</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
                Join a class or learn on your own
              </span>
            </button>
          </div>
        </div>
      )}

      {step === "studentPath" && (
        <div style={CARD}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🎒</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>How are you joining?</h1>
          </div>

          <div style={{ background: "#f0f9ff", border: "2px solid #bae6fd", borderRadius: 14,
            padding: "16px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#075985", marginBottom: 8 }}>
              🎫 I have a class code
            </div>
            <form onSubmit={submitClassCode} style={{ display: "flex", gap: 8 }}>
              <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7GX4QP" autoCapitalize="characters"
                style={{ ...INPUT, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", flex: 1 }} />
              <button type="submit" disabled={!code.trim() || saving}
                style={{ padding: "10px 18px", borderRadius: 10, border: "none",
                  background: code.trim() && !saving ? "#0284c7" : "#cbd5e1", color: "#fff", fontWeight: 800,
                  fontSize: 14, cursor: code.trim() && !saving ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                {saving ? "Joining…" : "Join →"}
              </button>
            </form>
          </div>

          <button onClick={() => { setError(""); setStep("age"); }} disabled={saving}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "2px solid #e5e7eb",
              background: "#fff", color: "#111", fontSize: 15, fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer", marginBottom: 16 }}>
            🚀 I&apos;m learning on my own
          </button>

          {error && <div style={ERROR_BOX}>{error}</div>}

          <button onClick={() => setStep("choose")} disabled={saving}
            style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13,
              fontWeight: 700, cursor: "pointer", padding: 0 }}>
            ← Back
          </button>
        </div>
      )}

      {step === "age" && (
        <div style={CARD}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Tell us about you</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>We use this to set up your account.</p>
          </div>
          <form onSubmit={submitAge}>
            <div style={{ marginBottom: 18 }}>
              <label style={LABEL}>When&apos;s your birthday?</label>
              <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required
                style={INPUT} />
            </div>
            {error && <div style={ERROR_BOX}>{error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={() => setStep("studentPath")} disabled={saving}
                style={{ padding: "12px 18px", borderRadius: 12, border: "2px solid #e5e7eb", background: "#fff",
                  color: "#6b7280", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                ← Back
              </button>
              <button type="submit" disabled={saving || !birthDate}
                style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: "none",
                  background: birthDate ? "#1f1f1f" : "#9ca3af", color: "#fff", fontSize: 15, fontWeight: 700,
                  cursor: saving || !birthDate ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "One moment…" : "Continue"}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "blocked" && (
        <div style={{ ...CARD, maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🎫</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>
            Join with a class code
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>
            To use StemBuilder, ask your teacher for a class code to join.
            Once you have it, enter it below.
          </p>
          <form onSubmit={submitClassCode} style={{ display: "flex", gap: 8 }}>
            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Class code" autoCapitalize="characters"
              style={{ ...INPUT, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", flex: 1 }} />
            <button type="submit" disabled={!code.trim() || saving}
              style={{ padding: "10px 18px", borderRadius: 10, border: "none",
                background: code.trim() && !saving ? "#0284c7" : "#cbd5e1", color: "#fff", fontWeight: 800,
                fontSize: 14, cursor: code.trim() && !saving ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
              {saving ? "Joining…" : "Join →"}
            </button>
          </form>
          {error && <div style={{ ...ERROR_BOX, marginTop: 16, marginBottom: 0 }}>{error}</div>}
        </div>
      )}

      {step === "teacher" && (
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

            {needsOnboarding && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20,
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                <input type="checkbox" id="affirm" checked={affirmed} onChange={e => setAffirmed(e.target.checked)}
                  style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                <label htmlFor="affirm" style={{ fontSize: 12, color: "#475569", lineHeight: 1.5,
                  cursor: "pointer", textAlign: "left" }}>
                  {TEACHER_AFFIRMATION_TEXT}
                </label>
              </div>
            )}

            {error && <div style={ERROR_BOX}>{error}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              {needsOnboarding && (
                <button type="button" onClick={() => setStep("choose")} disabled={saving}
                  style={{ padding: "12px 18px", borderRadius: 12, border: "2px solid #e5e7eb", background: "#fff",
                    color: "#6b7280", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer" }}>
                  ← Back
                </button>
              )}
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
