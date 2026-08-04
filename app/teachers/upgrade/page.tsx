"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import SiteHeader from "@/app/components/SiteHeader";
import TrialSignupForm from "../TrialSignupForm";
import OverageBuy from "../OverageBuy";
import { getProfile } from "@/lib/profile";
import { roleAtLeast } from "@/lib/roles";
import type { PlanUsage } from "@/lib/plan";
import { PLANS, PRO_PRICE_PER_YEAR } from "@/lib/marketing/pricing";

// Self-serve Teacher Pro upgrade. The button starts a Stripe Checkout
// session; the webhook flips the plan to 'pro' automatically after payment.
// If billing env isn't configured, the API answers 503 and we fall back to
// the contact email.

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

function UpgradeInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const canceled = params.get("canceled") === "1";

  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [busy, setBusy] = useState<"" | "checkout">("");
  const [showTrialForm, setShowTrialForm] = useState(false);
  const [checkoutBlocks, setCheckoutBlocks] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/sign-in"); return; }
    getProfile(session.user.id).then((profile) => {
      if (!profile || !roleAtLeast(profile.role, "teacher")) { router.push("/"); return; }
      fetch("/api/teacher/plan").then((r) => (r.ok ? r.json() : null)).then(setUsage);
    });
  }, [status, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pro = PLANS.find((p) => p.id === "pro")!;

  async function startCheckout() {
    setBusy("checkout");
    setError("");
    try {
      const res = await fetch("/api/teacher/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: checkoutBlocks }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url; // → Stripe-hosted checkout
        return;
      }
      setError(data.error ?? `Could not start checkout (HTTP ${res.status}). Please try again.`);
    } catch {
      setError("Could not reach the server — check your connection and try again.");
    }
    setBusy("");
  }

  function onTrialStarted(next: PlanUsage) {
    setUsage(next);
    setShowTrialForm(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ ...CARD, padding: "36px 40px" }}>
            <Link href="/teachers/dashboard" style={{ fontSize: 13, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              ← Back to dashboard
            </Link>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "18px 0 6px" }}>
              Teacher Pro — ${PRO_PRICE_PER_YEAR}/year
            </h1>
            <p style={{ fontSize: 15, color: "#374151", margin: "0 0 18px" }}>{pro.blurb}</p>

            <ul style={{ fontSize: 15, color: "#374151", lineHeight: 2, paddingLeft: 20, margin: "0 0 22px" }}>
              {pro.features.map((f) => <li key={f}>{f}</li>)}
            </ul>

            {canceled && (
              <p style={{ fontSize: 14, color: "#92400e", fontWeight: 700, margin: "0 0 14px" }}>
                Checkout was canceled — no charge was made.
              </p>
            )}
            {error && (
              <p style={{ fontSize: 14, color: "#dc2626", fontWeight: 700, margin: "0 0 14px" }}>
                {error}{" "}
                <a href="mailto:info@stembuilder.io?subject=Teacher%20Pro" style={{ color: "#2563eb" }}>
                  Email us instead →
                </a>
              </p>
            )}

            {!usage ? null : usage.institutional ? (
              <p style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>
                Your school or district plan already includes full access — nothing to buy here.
              </p>
            ) : usage.plan === "pro" ? (
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>
                  ✓ You&apos;re on Teacher Pro ({usage.cap} students). Thanks for supporting STEM Builder!
                </p>
                <div style={{ border: "2px solid #e5e7eb", borderRadius: 14, padding: 18, marginTop: 14 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: "0 0 10px" }}>
                    Need room for more students?
                  </p>
                  <OverageBuy onDone={setUsage} />
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>
                  How many students do you teach?
                  <select value={checkoutBlocks} onChange={(e) => setCheckoutBlocks(Number(e.target.value))}
                    style={{ display: "block", width: "100%", marginTop: 6, padding: "10px 12px",
                      borderRadius: 10, border: "2px solid #e5e7eb", fontSize: 14, color: "#111" }}>
                    <option value={0}>Up to 125 — included</option>
                    <option value={1}>126–150 (+$10/year)</option>
                    <option value={2}>151–175 (+$20/year)</option>
                    <option value={3}>176–200 (+$30/year)</option>
                    <option value={4}>201–225 (+$40/year)</option>
                  </select>
                </label>
                <button type="button" onClick={startCheckout} disabled={busy !== ""}
                  style={{ padding: "14px 24px", borderRadius: 999, background: "#1f1f1f", color: "#fff",
                    border: "2px solid #1f1f1f", fontWeight: 800, fontSize: 16, cursor: "pointer",
                    opacity: busy ? 0.6 : 1 }}>
                  {busy === "checkout"
                    ? "Opening checkout…"
                    : `Upgrade now — $${PRO_PRICE_PER_YEAR + checkoutBlocks * 10}/year`}
                </button>
                {!usage.trialUsed && usage.effective === "free" && !showTrialForm && (
                  <button type="button" onClick={() => setShowTrialForm(true)} disabled={busy !== ""}
                    style={{ padding: "12px 24px", borderRadius: 999, background: "#fff", color: "#1f1f1f",
                      border: "2px solid #1f1f1f", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                    Or start a free Pro trial — rest of the school year, curriculum library not included
                  </button>
                )}
                {showTrialForm && (
                  <div style={{ border: "2px solid #e5e7eb", borderRadius: 14, padding: 18 }}>
                    <TrialSignupForm onStarted={onTrialStarted} />
                  </div>
                )}
                {usage.plan === "pro_trial" && usage.effective === "pro_trial" && (
                  <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                    You&apos;re on the free Pro trial
                    {usage.trialEndsAt && ` until ${new Date(usage.trialEndsAt).toLocaleDateString()}`}.
                    Upgrading adds the curriculum library and keeps Pro after the trial ends.
                  </p>
                )}
                <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                  Secure checkout by Stripe. Cancel anytime — your plan stays active through the
                  period you paid for.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
      <footer aria-hidden="true" style={{ height: 40, width: "100%",
        backgroundImage: "url('/ui/footer-metal.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradeInner />
    </Suspense>
  );
}
