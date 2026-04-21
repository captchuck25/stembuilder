"use client";

import Link from "next/link";
import { SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";

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
};

/**
 * Shared site header used across all pages.
 * `children` renders inside the nav, to the left of the auth buttons.
 * `onLogoClick` — if provided, intercepts the logo click (e.g. unsaved-changes guard).
 * `hideUserButton` — if true, suppresses the default UserButton so the caller can render its own.
 */
export default function SiteHeader({ children, onLogoClick, hideUserButton }: {
  children?: React.ReactNode;
  onLogoClick?: (e: React.MouseEvent) => void;
  hideUserButton?: boolean;
}) {
  return (
    <header style={{ height: 120, width: "100%", backgroundImage: "url('/ui/header-metal.png')",
      backgroundSize: "cover", backgroundPosition: "center" }}>
      <div style={{ position: "relative", height: "100%", maxWidth: 1200, margin: "0 auto",
        padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>

        {/* Centered logo */}
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

        {/* Right-side nav */}
        <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {children}
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <button style={NAV_BTN}>Log In</button>
            </SignInButton>
            <SignUpButton mode="modal" forceRedirectUrl="/onboarding">
              <button style={NAV_BTN}>Sign Up</button>
            </SignUpButton>
          </Show>
          {!hideUserButton && (
            <Show when="signed-in">
              <UserButton appearance={{ elements: { avatarBox: { width: 48, height: 48 } } }}>
                <UserButton.MenuItems>
                  <UserButton.Link label="My Work" labelIcon={<span>🏆</span>} href="/mywork" />
                  <UserButton.Link label="My Classes" labelIcon={<span>🏫</span>} href="/dashboard" />
                </UserButton.MenuItems>
              </UserButton>
            </Show>
          )}
        </nav>
      </div>
    </header>
  );
}
