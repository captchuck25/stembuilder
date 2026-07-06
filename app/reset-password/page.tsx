"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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

function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Could not reset password. Please try again.");
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
    setTimeout(() => router.push("/sign-in"), 2200);
  }

  return (
    <div style={CARD}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <Link href="/">
          <Image src="/ui/sb-logo.png" alt="STEM Builder" width={140} height={42} unoptimized
            style={{ height: 42, width: "auto", margin: "0 auto 16px" }} />
        </Link>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Choose a new password</h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Enter a new password for your account.</p>
      </div>

      {!token ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10,
          padding: "14px 16px", fontSize: 14, color: "#dc2626", fontWeight: 600, textAlign: "center" }}>
          This reset link is missing its token. Please request a new link.
        </div>
      ) : done ? (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10,
          padding: "14px 16px", fontSize: 14, color: "#166534", fontWeight: 600, textAlign: "center" }}>
          Password updated! Redirecting you to sign in…
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              New password
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="Min. 8 characters" style={INPUT} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              Confirm password
            </label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              placeholder="Re-enter password" style={INPUT} />
          </div>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
              padding: "10px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600, marginBottom: 16 }}>
              {error}
            </div>
          )}
          <button type="submit" disabled={loading}
            style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "none",
              background: "#1f1f1f", color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      )}

      <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 20, marginBottom: 0 }}>
        <Link href="/sign-in" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={WRAP}>
      <Suspense fallback={<div style={CARD} />}>
        <ResetForm />
      </Suspense>
    </div>
  );
}
