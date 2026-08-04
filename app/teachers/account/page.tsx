"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { getProfile } from "@/lib/profile";
import { roleAtLeast } from "@/lib/roles";
import type { PlanUsage } from "@/lib/plan";

// Teacher "My Account": profile + classroom details (editable lead-gen
// fields) and membership status with the path to upgrade/add students.

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  padding: "28px 32px",
};
const INPUT: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
  fontSize: 14, color: "#111", outline: "none", boxSizing: "border-box",
};
const LABEL: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6,
};
const H2: React.CSSProperties = { fontSize: 18, fontWeight: 900, color: "#111", margin: "0 0 14px" };

interface AccountData {
  name: string | null;
  email: string | null;
  district: string | null;
  state: string | null;
  gradeLevels: string | null;
  contentArea: string | null;
  institutional: boolean;
  usage: PlanUsage | null;
  renewsAt: string | null;
}

export default function TeacherAccountPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [account, setAccount] = useState<AccountData | null>(null);
  const [district, setDistrict] = useState("");
  const [usState, setUsState] = useState("");
  const [gradeLevels, setGradeLevels] = useState("");
  const [contentArea, setContentArea] = useState("");
  const [saveState, setSaveState] = useState<"" | "saving" | "saved" | "error">("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/sign-in"); return; }
    getProfile(session.user.id).then((profile) => {
      if (!profile || !roleAtLeast(profile.role, "teacher")) { router.push("/"); return; }
      fetch("/api/teacher/account").then((r) => (r.ok ? r.json() : null)).then((data: AccountData | null) => {
        if (!data) return;
        setAccount(data);
        setDistrict(data.district ?? "");
        setUsState(data.state ?? "");
        setGradeLevels(data.gradeLevels ?? "");
        setContentArea(data.contentArea ?? "");
      });
    });
  }, [status, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    const res = await fetch("/api/teacher/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ district, state: usState, gradeLevels, contentArea }),
    });
    setSaveState(res.ok ? "saved" : "error");
    if (res.ok) setTimeout(() => setSaveState(""), 2500);
  }

  async function openPortal() {
    setPortalBusy(true);
    setPortalError("");
    try {
      const res = await fetch("/api/teacher/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setPortalError(data.error ?? "Could not open billing management.");
    } catch {
      setPortalError("Could not reach the server — try again.");
    }
    setPortalBusy(false);
  }

  const usage = account?.usage ?? null;
  const planLabel = !usage ? "" :
    account?.institutional ? "School / District plan" :
    usage.effective === "pro" ? "Teacher Pro" :
    usage.effective === "pro_trial" ? "Pro trial (free)" :
    "Free plan";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px",
          display: "flex", flexDirection: "column", gap: 24 }}>

          <div style={CARD}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>My Account</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              Your profile, classroom details, and membership.
            </p>
          </div>

          {/* Profile */}
          <div style={CARD}>
            <h2 style={H2}>Profile</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <span style={LABEL}>Name</span>
                <div style={{ ...INPUT, background: "#f9fafb", color: "#6b7280" }}>{account?.name ?? "—"}</div>
              </div>
              <div>
                <span style={LABEL}>Email</span>
                <div style={{ ...INPUT, background: "#f9fafb", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {account?.email ?? "—"}
                </div>
              </div>
            </div>
          </div>

          {/* Classroom details */}
          <div style={CARD}>
            <h2 style={H2}>Your classroom</h2>
            <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
                <div>
                  <label style={LABEL} htmlFor="acct-district">School district</label>
                  <input id="acct-district" style={INPUT} maxLength={120} value={district}
                    onChange={(e) => setDistrict(e.target.value)} placeholder="Your district or school" />
                </div>
                <div>
                  <label style={LABEL} htmlFor="acct-state">State</label>
                  <input id="acct-state" style={INPUT} maxLength={40} value={usState}
                    onChange={(e) => setUsState(e.target.value)} placeholder="e.g. NY" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={LABEL} htmlFor="acct-grades">Grade level(s)</label>
                  <input id="acct-grades" style={INPUT} maxLength={120} value={gradeLevels}
                    onChange={(e) => setGradeLevels(e.target.value)} placeholder="e.g. 6–8" />
                </div>
                <div>
                  <label style={LABEL} htmlFor="acct-course">Course / subject</label>
                  <input id="acct-course" style={INPUT} maxLength={120} value={contentArea}
                    onChange={(e) => setContentArea(e.target.value)} placeholder="e.g. STEM, Technology" />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="submit" disabled={saveState === "saving"}
                  style={{ padding: "11px 24px", borderRadius: 999, background: "#1f1f1f", color: "#fff",
                    border: "2px solid #1f1f1f", fontWeight: 800, fontSize: 14, cursor: "pointer",
                    opacity: saveState === "saving" ? 0.6 : 1 }}>
                  {saveState === "saving" ? "Saving…" : "Save"}
                </button>
                {saveState === "saved" && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>✓ Saved</span>
                )}
                {saveState === "error" && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>Could not save — try again</span>
                )}
              </div>
            </form>
          </div>

          {/* Membership */}
          <div style={CARD}>
            <h2 style={H2}>Membership</h2>
            {!usage ? (
              <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Loading…</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>
                  {planLabel}
                  {usage.cap !== null && (
                    <span style={{ fontWeight: 600, color: "#6b7280" }}>
                      {" "}· {usage.count} / {usage.cap} students
                    </span>
                  )}
                </p>
                {usage.effective === "pro_trial" && usage.trialEndsAt && (
                  <p style={{ fontSize: 14, color: "#92400e", fontWeight: 700, margin: 0 }}>
                    Trial ends {new Date(usage.trialEndsAt).toLocaleDateString()} — upgrade to keep
                    Pro and add the curriculum library.
                  </p>
                )}
                {account?.renewsAt && (
                  <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>
                    Renews {new Date(account.renewsAt).toLocaleDateString()} on your card on file.
                  </p>
                )}
                {account?.institutional ? (
                  <p style={{ fontSize: 14, color: "#166534", fontWeight: 700, margin: 0 }}>
                    Full access through your school or district — nothing to manage here.
                  </p>
                ) : (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                    <Link href="/teachers/upgrade"
                      style={{ padding: "11px 22px", borderRadius: 999, background: "#1f1f1f", color: "#fff",
                        border: "2px solid #1f1f1f", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
                      {usage.plan === "pro" ? "Add students" : "Upgrade to Teacher Pro"}
                    </Link>
                    {usage.plan === "pro" && (
                      <button type="button" onClick={openPortal} disabled={portalBusy}
                        style={{ padding: "11px 22px", borderRadius: 999, background: "#fff", color: "#1f1f1f",
                          border: "2px solid #1f1f1f", fontWeight: 700, fontSize: 14, cursor: "pointer",
                          opacity: portalBusy ? 0.6 : 1 }}>
                        {portalBusy ? "Opening…" : "Manage billing / cancel"}
                      </button>
                    )}
                    <a href="mailto:support@stembuilder.io?subject=Billing%20question"
                      style={{ padding: "11px 22px", borderRadius: 999, background: "#fff", color: "#1f1f1f",
                        border: "2px solid #1f1f1f", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                      Billing questions
                    </a>
                  </div>
                  {portalError && (
                    <p style={{ fontSize: 13, color: "#dc2626", fontWeight: 700, margin: "8px 0 0" }}>
                      {portalError}
                    </p>
                  )}
                )}
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
