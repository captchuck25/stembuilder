"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

const WRAP: React.CSSProperties = {
  minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
  backgroundRepeat: "repeat", backgroundSize: "auto",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
};
const CARD: React.CSSProperties = {
  background: "#fff", borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
  border: "3px solid #1f1f1f", padding: "40px 36px", width: "100%", maxWidth: 420,
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box",
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/request-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setDevUrl(data.devResetUrl ?? null);
    setSent(true);
    setLoading(false);
  }

  return (
    <div style={WRAP}>
      <div style={CARD}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Link href="/">
            <Image src="/ui/sb-logo.png" alt="STEM Builder" width={140} height={42} unoptimized
              style={{ height: 42, width: "auto", margin: "0 auto 16px" }} />
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Reset password</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10,
              padding: "14px 16px", fontSize: 14, color: "#166534", fontWeight: 600, marginBottom: 20 }}>
              If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your inbox
              (and spam). The link expires in 1 hour.
            </div>

            {devUrl && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10,
                padding: "12px 14px", fontSize: 12, color: "#92400e", marginBottom: 20, wordBreak: "break-all" }}>
                <strong>Dev/preview:</strong> email delivery isn&apos;t configured, so here&apos;s the link:{" "}
                <Link href={devUrl.replace(/^https?:\/\/[^/]+/, "")} style={{ color: "#b45309", fontWeight: 700 }}>
                  Open reset link
                </Link>
              </div>
            )}

            <p style={{ fontSize: 13, color: "#6b7280", textAlign: "center", margin: 0 }}>
              No email on your account? A teacher can reset a student&apos;s password from their dashboard.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="you@school.edu" style={INPUT} />
            </div>
            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none",
                background: "#1f1f1f", color: "#fff", fontSize: 15, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 20, marginBottom: 0 }}>
          <Link href="/sign-in" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
            ← Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
