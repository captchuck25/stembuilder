"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
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

// Teacher account creation. After the account exists we send them to
// /onboarding?role=teacher, which jumps straight to the district/grade/subject
// questions (no teacher/student choice — they came in as a teacher).
export default function TeacherSignUpPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  // A signed-in user doesn't need this page — send them to their dashboard.
  useEffect(() => {
    if (status === "authenticated" && session?.user) router.replace("/dashboard");
  }, [status, session?.user, router]);

  async function handleGoogle() {
    if (!agreed) return;
    setLoading(true);
    await signIn("google", { callbackUrl: "/onboarding?role=teacher" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Registration failed.");
      setLoading(false);
      return;
    }
    await signIn("credentials", { email, password, redirect: false });
    router.push("/onboarding?role=teacher");
  }

  return (
    <div style={{ minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat", backgroundSize: "auto",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        border: "3px solid #1f1f1f", padding: "40px 36px", width: "100%", maxWidth: 420 }}>

        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <Link href="/">
            <Image src="/ui/sb-logo.png" alt="STEM Builder" width={140} height={42} unoptimized
              style={{ height: 42, width: "auto", margin: "0 auto 14px" }} />
          </Link>
          <div style={{ fontSize: 34, marginBottom: 6 }}>🧑‍🏫</div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>STEM Builder for Teachers</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            Create classes, assign challenges, and track progress. Free to start.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 20 }}>
          <input type="checkbox" id="agree" checked={agreed} onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
          <label htmlFor="agree" style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, cursor: "pointer" }}>
            I agree to the{" "}
            <Link href="/privacy" target="_blank" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              Privacy Policy
            </Link>.
          </label>
        </div>

        <button onClick={handleGoogle} disabled={loading || !agreed}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #e5e7eb",
            background: "#fff", cursor: agreed ? "pointer" : "not-allowed", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 700, color: agreed ? "#111" : "#9ca3af",
            marginBottom: 20, opacity: agreed ? 1 : 0.6 }}>
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
          <span style={{ fontSize: 13, color: "#9ca3af", fontWeight: 600 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#e5e7eb" }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Full Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required
              placeholder="Your name" style={INPUT} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@school.edu" style={INPUT} />
          </div>
          <div style={{ marginBottom: 20 }}>
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
            {loading ? "Creating account…" : "Create Teacher Account"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 20, marginBottom: 0 }}>
          Already have an account?{" "}
          <Link href="/sign-in" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
