"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

const WRAP: React.CSSProperties = {
  minHeight: "100vh", backgroundImage: "url('/ui/bg-tools-pattern.png')",
  backgroundRepeat: "repeat", backgroundSize: "auto",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
};
const CARD: React.CSSProperties = {
  background: "#fff", borderRadius: 24, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
  border: "3px solid #1f1f1f", padding: "36px 36px", width: "100%", maxWidth: 420, textAlign: "center",
};

function Complete() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const code = params.get("code") ?? "";
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    // Not signed in (e.g. they cancelled Google) — send them back to the code screen.
    if (status !== "authenticated") { router.replace(`/join${code ? `?code=${code}` : ""}`); return; }

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/student/classes/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (cancelled) return;
      // 409 = already enrolled in this class — that's fine, treat as success.
      if (res.ok || res.status === 409) { router.replace("/student/dashboard"); return; }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "We couldn't add you to that class. Check the code with your teacher.");
    })();
    return () => { cancelled = true; };
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={CARD}>
      {error ? (
        <>
          <div style={{ fontSize: 40, marginBottom: 10 }}>😕</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>Couldn&apos;t join the class</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px" }}>{error}</p>
          <Link href={`/join${code ? `?code=${code}` : ""}`}
            style={{ display: "inline-block", padding: "10px 20px", borderRadius: 10, background: "#1f1f1f",
              color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Try another code
          </Link>
        </>
      ) : (
        <>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🎒</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>Adding you to your class…</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>One moment.</p>
        </>
      )}
    </div>
  );
}

export default function JoinCompletePage() {
  return (
    <div style={WRAP}>
      <Suspense fallback={<div style={CARD} />}>
        <Complete />
      </Suspense>
    </div>
  );
}
