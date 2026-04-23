"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setError("Invalid email or password.");
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div style={{ minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat", backgroundSize: "auto",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        border: "3px solid #1f1f1f", padding: "40px 36px", width: "100%", maxWidth: 420 }}>

        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Link href="/">
            <Image src="/ui/sb-logo.png" alt="STEM Builder" width={140} height={42} unoptimized
              style={{ height: 42, width: "auto", margin: "0 auto 16px" }} />
          </Link>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Welcome back</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Sign in to your account</p>
        </div>

        <button onClick={handleGoogle} disabled={loading}
          style={{ width: "100%", padding: "12px 16px", borderRadius: 12, border: "2px solid #e5e7eb",
            background: "#fff", cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 700, color: "#111",
            marginBottom: 20, transition: "border-color 160ms" }}>
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
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              Email
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              placeholder="you@school.edu"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
                fontSize: 14, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              Password
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
                fontSize: 14, outline: "none", boxSizing: "border-box" }} />
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
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 20, marginBottom: 0 }}>
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" style={{ color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}