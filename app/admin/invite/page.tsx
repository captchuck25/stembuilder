"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "32px 36px",
  maxWidth: 440,
  width: "100%",
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #d1d5db", fontSize: 14,
};

interface Peek { email: string; districtName: string; accountExists: boolean }

function InviteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";

  const [peek, setPeek] = useState<Peek | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setInvalid(true); return; }
    fetch(`/api/admin/invite/accept?token=${encodeURIComponent(token)}`)
      .then(async r => { if (r.ok) setPeek(await r.json()); else setInvalid(true); })
      .catch(() => setInvalid(true));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(peek?.accountExists ? { token } : { token, name: name.trim(), password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "Something went wrong"); return; }
      setDone(true);
      setTimeout(() => router.push("/sign-in"), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={CARD}>
          {invalid ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>Invite not valid</h1>
              <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
                This invitation link is invalid, expired, or already used. Ask your StemBuilder contact to send a new one.
              </p>
            </>
          ) : done ? (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#16a34a", margin: "0 0 8px" }}>You&apos;re in! 🎉</h1>
              <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
                You&apos;re now a district admin for <strong>{peek?.districtName}</strong>. Taking you to sign in…
              </p>
            </>
          ) : !peek ? (
            <div style={{ fontSize: 14, color: "#666", fontWeight: 600 }}>Checking your invitation…</div>
          ) : (
            <>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>District admin invitation</h1>
              <p style={{ fontSize: 14, color: "#666", margin: "0 0 20px" }}>
                You&apos;ve been invited to administer <strong>{peek.districtName}</strong> as{" "}
                <strong>{peek.email}</strong>.
                {peek.accountExists
                  ? " Your existing StemBuilder account will gain district admin access."
                  : " Create your admin account to accept."}
              </p>
              <form onSubmit={accept} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {!peek.accountExists && (
                  <>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Your name</label>
                      <input value={name} onChange={e => setName(e.target.value)} style={INPUT} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Password (min 8 characters)</label>
                      <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={INPUT} />
                    </div>
                  </>
                )}
                {error && <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{error}</div>}
                <button type="submit"
                  disabled={busy || (!peek.accountExists && (!name.trim() || password.length < 8))}
                  style={{ background: "#1f1f1f", color: "#fff", border: "none", borderRadius: 10,
                    padding: "12px 20px", fontSize: 14, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
                  {busy ? "Accepting…" : "Accept invitation"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={null}>
      <InviteInner />
    </Suspense>
  );
}
