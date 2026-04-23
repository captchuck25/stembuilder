"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

const NAV_BTN: React.CSSProperties = {
  border: "1px solid #fff",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: 999,
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: "0.2px",
  background: "transparent",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-block",
};

export default function SiteHeader({ children, onLogoClick, hideUserButton }: {
  children?: React.ReactNode;
  onLogoClick?: (e: React.MouseEvent) => void;
  hideUserButton?: boolean;
}) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header style={{ height: 120, width: "100%", backgroundImage: "url('/ui/header-metal.png')",
      backgroundSize: "cover", backgroundPosition: "center" }}>
      <div style={{ position: "relative", height: "100%", maxWidth: 1200, margin: "0 auto",
        padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>

        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}>
          {onLogoClick ? (
            <button onClick={onLogoClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
              <img src="/ui/sb-logo.png" alt="STEM Builder" style={{ height: 86, width: "auto", display: "block" }} />
            </button>
          ) : (
            <Link href="/">
              <img src="/ui/sb-logo.png" alt="STEM Builder" style={{ height: 86, width: "auto", display: "block" }} />
            </Link>
          )}
        </div>

        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {children}
          {session?.user ? (
            !hideUserButton && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setMenuOpen(o => !o)}
                  style={{ ...NAV_BTN, display: "flex", alignItems: "center", gap: 8 }}
                >
                  {session.user.image ? (
                    <img src={session.user.image} alt="" style={{ width: 32, height: 32, borderRadius: "50%", display: "block" }} />
                  ) : (
                    <span style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800 }}>
                      {(session.user.name ?? session.user.email ?? "?")[0].toUpperCase()}
                    </span>
                  )}
                </button>
                {menuOpen && (
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#fff",
                    borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 180,
                    border: "1px solid #e5e7eb", zIndex: 50, overflow: "hidden" }}>
                    <Link href="/mywork" onClick={() => setMenuOpen(false)}
                      style={{ display: "block", padding: "10px 16px", fontSize: 14, fontWeight: 600,
                        color: "#111", textDecoration: "none", borderBottom: "1px solid #f3f4f6" }}>
                      🏆 My Work
                    </Link>
                    <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                      style={{ display: "block", padding: "10px 16px", fontSize: 14, fontWeight: 600,
                        color: "#111", textDecoration: "none", borderBottom: "1px solid #f3f4f6" }}>
                      🏫 My Classes
                    </Link>
                    <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                      style={{ width: "100%", padding: "10px 16px", fontSize: 14, fontWeight: 600,
                        color: "#dc2626", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            <>
              <Link href="/sign-in" style={NAV_BTN}>Log In</Link>
              <Link href="/sign-up" style={{ ...NAV_BTN, background: "rgba(255,255,255,0.15)" }}>Sign Up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}