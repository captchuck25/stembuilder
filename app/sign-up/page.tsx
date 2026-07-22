"use client";

// Signup entry point. Role is an explicit choice — there is no default:
//   Teacher                -> /teachers (educator affirmation + verification)
//   Student, class code    -> /join     (school consent; no age asked)
//   Student, on my own     -> neutral birthday screen, then 13+ account here.
// The birthday screen wording is deliberately neutral (it never says a minimum
// age); under-13 is bounced to "ask your teacher for a class code" and the
// server refuses re-checks from this browser (signed httpOnly cookie).

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6,
};
const CHOICE: React.CSSProperties = {
  width: "100%", padding: "18px 20px", borderRadius: 16, border: "3px solid #1f1f1f",
  color: "#fff", cursor: "pointer", display: "flex", flexDirection: "column",
  alignItems: "center", gap: 6, boxShadow: "0 6px 20px rgba(0,0,0,0.15)", marginBottom: 14,
};
const BACK: React.CSSProperties = {
  background: "none", border: "none", color: "#6b7280", fontSize: 13, fontWeight: 700,
  cursor: "pointer", padding: 0, marginBottom: 16,
};

type Step = "role" | "studentPath" | "age" | "independent" | "blocked";

// UI persistence only — the real retry block is the server's httpOnly cookie.
const BLOCKED_KEY = "sb_gate_blocked";
// Lets the Google variant of the independent path reuse this screen's passed
// check at /onboarding instead of asking for the birthday twice.
const AGE_TOKEN_KEY = "sb_age_token";

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("role");
  const [code, setCode] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [ageToken, setAgeToken] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(BLOCKED_KEY)) setStep("blocked");
  }, []);

  async function submitAge(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!birthDate) return;
    setLoading(true);
    const res = await fetch("/api/auth/age-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ birthDate }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok && data.token) {
      setAgeToken(data.token);
      sessionStorage.setItem(AGE_TOKEN_KEY, data.token);
      setStep("independent");
    } else if (data.blocked) {
      sessionStorage.setItem(BLOCKED_KEY, "1");
      setStep("blocked");
    } else {
      setError(data.error ?? "Please enter a valid date.");
    }
  }

  async function submitIndependent(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!agreed) return;
    setLoading(true);
    const res = await fetch("/api/auth/register-independent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, ageToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === "age_gate") {
        sessionStorage.setItem(BLOCKED_KEY, "1");
        setStep("blocked");
      } else {
        setError(data.error ?? "Registration failed.");
      }
      setLoading(false);
      return;
    }
    sessionStorage.removeItem(AGE_TOKEN_KEY);
    await signIn("credentials", { email, password, redirect: false });
    router.push("/student/dashboard");
  }

  function googleIndependent() {
    if (!agreed) return;
    setLoading(true);
    // The age pass token rides along in sessionStorage; /onboarding finishes
    // account creation (server re-verifies the token at /api/onboarding/complete).
    signIn("google", { callbackUrl: "/onboarding?path=independent" });
  }

  function goJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    router.push(`/join?code=${encodeURIComponent(code.trim().toUpperCase())}`);
  }

  return (
    <div style={{ minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat", backgroundSize: "auto",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        border: "3px solid #1f1f1f", padding: "36px 36px", width: "100%", maxWidth: 440 }}>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <Link href="/">
            <Image src="/ui/sb-logo.png" alt="STEM Builder" width={140} height={42} unoptimized
              style={{ height: 42, width: "auto", margin: "0 auto 16px" }} />
          </Link>
          {step === "role" && (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Create account</h1>
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>First, tell us who you are.</p>
            </>
          )}
        </div>

        {step === "role" && (
          <>
            <button onClick={() => router.push("/teachers")}
              style={{ ...CHOICE, background: "linear-gradient(135deg,#1e3a5f,#2563eb)" }}>
              <span style={{ fontSize: 32 }}>🧑‍🏫</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>I&apos;m a teacher</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                Create classes, assign work, track progress
              </span>
            </button>
            <button onClick={() => { setError(""); setStep("studentPath"); }}
              style={{ ...CHOICE, background: "linear-gradient(135deg,#14532d,#16a34a)", marginBottom: 0 }}>
              <span style={{ fontSize: 32 }}>🎒</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>I&apos;m a student</span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
                Join a class or learn on your own
              </span>
            </button>
          </>
        )}

        {step === "studentPath" && (
          <>
            <button onClick={() => setStep("role")} style={BACK}>← Back</button>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 16px", textAlign: "center" }}>
              How are you joining?
            </h2>

            <div style={{ background: "#f0f9ff", border: "2px solid #bae6fd", borderRadius: 14,
              padding: "16px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#075985", marginBottom: 8 }}>
                🎫 I have a class code
              </div>
              <form onSubmit={goJoin} style={{ display: "flex", gap: 8 }}>
                <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. 7GX4QP" autoCapitalize="characters"
                  style={{ ...INPUT, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", flex: 1 }} />
                <button type="submit" disabled={!code.trim()}
                  style={{ padding: "10px 18px", borderRadius: 10, border: "none",
                    background: code.trim() ? "#0284c7" : "#cbd5e1", color: "#fff", fontWeight: 800,
                    fontSize: 14, cursor: code.trim() ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                  Join →
                </button>
              </form>
              <div style={{ fontSize: 11, color: "#0369a1", marginTop: 8 }}>
                Pick a username on the next step — no email required.
              </div>
            </div>

            <button onClick={() => { setError(""); setStep("age"); }}
              style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "2px solid #e5e7eb",
                background: "#fff", color: "#111", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              🚀 I&apos;m learning on my own
            </button>
          </>
        )}

        {step === "age" && (
          <>
            <button onClick={() => setStep("studentPath")} style={BACK}>← Back</button>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 6px", textAlign: "center" }}>
              Tell us about you
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px", textAlign: "center" }}>
              We use this to set up your account.
            </p>
            <form onSubmit={submitAge}>
              <div style={{ marginBottom: 18 }}>
                <label style={LABEL}>When&apos;s your birthday?</label>
                <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} required
                  style={INPUT} />
              </div>
              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                  padding: "10px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600, marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading || !birthDate}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none",
                  background: birthDate ? "#1f1f1f" : "#9ca3af", color: "#fff", fontSize: 15,
                  fontWeight: 700, cursor: loading || !birthDate ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1 }}>
                {loading ? "One moment…" : "Continue"}
              </button>
            </form>
          </>
        )}

        {step === "independent" && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 16px", textAlign: "center" }}>
              Create your account
            </h2>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 18 }}>
              <input type="checkbox" id="agree" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
              <label htmlFor="agree" style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, cursor: "pointer" }}>
                I agree to the{" "}
                <Link href="/privacy" target="_blank" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
                  Privacy Policy
                </Link>.
              </label>
            </div>

            <button onClick={googleIndependent} disabled={loading || !agreed}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #e5e7eb",
                background: "#fff", cursor: agreed ? "pointer" : "not-allowed", display: "flex",
                alignItems: "center", justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 700,
                color: agreed ? "#111" : "#9ca3af", marginBottom: 18, opacity: agreed ? 1 : 0.6 }}>
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
              <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>or sign up with email</span>
              <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
            </div>

            <form onSubmit={submitIndependent}>
              <div style={{ marginBottom: 14 }}>
                <label style={LABEL}>Full Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required
                  placeholder="Your name" style={INPUT} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={LABEL}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  placeholder="you@example.com" style={INPUT} />
              </div>
              <div style={{ marginBottom: 18 }}>
                <label style={LABEL}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  placeholder="Min. 8 characters" style={INPUT} />
              </div>
              {error && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                  padding: "10px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600, marginBottom: 16 }}>
                  {error}
                </div>
              )}
              <button type="submit" disabled={loading || !agreed}
                style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none",
                  background: agreed ? "#1f1f1f" : "#9ca3af", color: "#fff", fontSize: 15, fontWeight: 700,
                  cursor: loading || !agreed ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
                {loading ? "Creating account…" : "Create Account"}
              </button>
            </form>
          </>
        )}

        {step === "blocked" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🎫</div>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>
              Join with a class code
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: "0 0 20px" }}>
              To use StemBuilder, ask your teacher for a class code to join.
              Your teacher can set up your class in minutes.
            </p>
            <Link href="/join"
              style={{ display: "inline-block", padding: "12px 24px", borderRadius: 12, background: "#1f1f1f",
                color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              I have a class code
            </Link>
          </div>
        )}

        {step !== "blocked" && (
          <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 18, marginBottom: 0 }}>
            Already have an account?{" "}
            <Link href="/sign-in" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
