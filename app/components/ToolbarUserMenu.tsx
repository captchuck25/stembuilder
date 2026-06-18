"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

// Compact profile control for the slim in-app toolbars (Blueprint Lab / STEM
// Sketch). Mirrors the avatar + dropdown from SiteHeader, but styled for a
// light panel background instead of the metal header.
export default function ToolbarUserMenu({ size = 30, accent = "#7c3aed" }: {
  size?: number;
  accent?: string;
}) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!session?.user) {
    return (
      <Link
        href="/sign-in"
        style={{
          border: "1px solid #d1d5db", color: "#374151",
          padding: "6px 14px", borderRadius: 999,
          fontWeight: 600, fontSize: 13, textDecoration: "none",
        }}
      >Log In</Link>
    );
  }

  const initial = (session.user.name ?? session.user.email ?? "?")[0].toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={session.user.name ?? session.user.email ?? "Account"}
        style={{
          padding: 0, border: "none", background: "none", cursor: "pointer",
          display: "flex", alignItems: "center",
        }}
      >
        {session.user.image ? (
          <img src={session.user.image} alt="" style={{ width: size, height: size, borderRadius: "50%", display: "block" }} />
        ) : (
          <span style={{
            width: size, height: size, borderRadius: "50%", background: accent,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: Math.round(size * 0.46), fontWeight: 800, color: "#fff",
          }}>{initial}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#fff",
          borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 180,
          border: "1px solid #e5e7eb", zIndex: 60, overflow: "hidden",
        }}>
          <Link href="/mywork" onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 16px", fontSize: 14, fontWeight: 600,
              color: "#111", textDecoration: "none", borderBottom: "1px solid #f3f4f6" }}>
            🏆 My Work
          </Link>
          <Link href="/dashboard" onClick={() => setOpen(false)}
            style={{ display: "block", padding: "10px 16px", fontSize: 14, fontWeight: 600,
              color: "#111", textDecoration: "none", borderBottom: "1px solid #f3f4f6" }}>
            🏫 My Classes
          </Link>
          <button onClick={() => { setOpen(false); signOut({ callbackUrl: "/" }); }}
            style={{ width: "100%", padding: "10px 16px", fontSize: 14, fontWeight: 600,
              color: "#dc2626", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
