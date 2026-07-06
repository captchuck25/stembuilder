"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

const WRAP: React.CSSProperties = {
  minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
  backgroundRepeat: "repeat", backgroundSize: "auto",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
};
const CARD: React.CSSProperties = {
  background: "#fff", borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
  border: "3px solid #1f1f1f", padding: "40px 36px", width: "100%", maxWidth: 440,
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
  fontSize: 14, outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6,
};

function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!agreed) return;
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    const res = await fetch("/api/auth/register-student", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, username, password, joinCode: code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not create account.");
      setLoading(false);
      return;
    }
    // Sign in with the new username + password (the credentials provider accepts
    // either an email or a username in its identifier field).
    const signInRes = await signIn("credentials", { email: data.username, password, redirect: false });
    if (signInRes?.error) {
      setError("Account created, but sign-in failed. Try signing in with your username.");
      setLoading(false);
      return;
    }
    router.push("/student/dashboard");
  }

  return (
    <div style={CARD}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <Link href="/">
          <Image src="/ui/sb-logo.png" alt="STEM Builder" width={140} height={42} unoptimized
            style={{ height: 42, width: "auto", margin: "0 auto 16px" }} />
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Join your class</h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
          Enter the class code from your teacher and pick a username — no email needed.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>Class code</label>
          <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} required
            placeholder="e.g. 7GX4QP" autoCapitalize="characters"
            style={{ ...INPUT, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase" }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>Your name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required
            placeholder="First name + last initial" style={INPUT} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={LABEL}>Username</label>
          <input type="text" value={username}
            onChange={e => setUsername(e.target.value.toLowerCase())} required
            placeholder="3–20 letters/numbers" autoCapitalize="none" autoCorrect="off"
            style={INPUT} />
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
            Lowercase letters, numbers, and . _ - — this is what you&apos;ll log in with.
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            placeholder="Min. 8 characters" style={INPUT} />
        </div>

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
          {loading ? "Joining…" : "Join class"}
        </button>
      </form>

      <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 20, marginBottom: 0 }}>
        Already have an account?{" "}
        <Link href="/sign-in" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function JoinPage() {
  return (
    <div style={WRAP}>
      <Suspense fallback={<div style={CARD} />}>
        <JoinForm />
      </Suspense>
    </div>
  );
}
