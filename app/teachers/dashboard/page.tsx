"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type Class } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { roleAtLeast } from "@/lib/roles";
import SiteHeader from "@/app/components/SiteHeader";


const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

export default function TeacherDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [classes, setClasses] = useState<Class[]>([]);
  const [studentCounts, setStudentCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [emailUnverified, setEmailUnverified] = useState(false);
  const [resendState, setResendState] = useState<"" | "sending" | "sent">("");

  interface RosterResult {
    kind: string; key: string; label: string;
    action: "create" | "link" | "update" | "skip" | "error";
    message?: string; row?: number;
  }
  interface RosterSummary {
    dryRun: boolean;
    counts: {
      classesCreated: number; classesLinked: number;
      studentsCreated: number; studentsLinked: number;
      enrollmentsCreated: number; enrollmentsExisting: number;
      errors: number;
    };
    results: RosterResult[];
    credentials: { name: string; identifier: string; tempPassword: string; classTitle: string }[];
  }
  const [inDistrict, setInDistrict] = useState(false);
  const [showBulkInfo, setShowBulkInfo] = useState(false);

  // Self-serve roster import (district teachers only)
  const [rosterCsv, setRosterCsv] = useState<string | null>(null);
  const [rosterFileName, setRosterFileName] = useState("");
  const [rosterPreview, setRosterPreview] = useState<RosterSummary | null>(null);
  const [rosterDone, setRosterDone] = useState<RosterSummary | null>(null);
  const [rosterBusy, setRosterBusy] = useState<"" | "preview" | "import">("");
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<"csv" | "google">("csv");
  const [gcCourses, setGcCourses] = useState<{ id: string; title: string }[] | null>(null);
  const [gcSelected, setGcSelected] = useState<string[]>([]);
  const [gcState, setGcState] = useState<"" | "loading" | "unconfigured">("");

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/"); return; }

    // Verify teacher role
    getProfile(session?.user?.id).then(profile => {
      if (!profile) { router.push("/onboarding"); return; }
      if (!roleAtLeast(profile.role, "teacher")) { router.push("/tools/code-lab"); return; }
      // Unverified teachers can look around but can't create classes yet.
      setEmailUnverified(!!profile.email && !profile.email_verified_at);
      setInDistrict(!!profile.district_id);
      loadClasses(session?.user?.id);
      // One-time migration: fix turtle locks in classes that were auto-seeded with the
      // wrong (challenge-only) indexing before we corrected it. Only touches classes
      // where the teacher hasn't done anything with turtle yet. Idempotent — re-runs
      // are no-ops because the lock pattern no longer matches the buggy signature.
      const flagKey = `turtle_lock_migration_done:${session.user!.id}`;
      if (localStorage.getItem(flagKey) !== "1") {
        fetch("/api/teacher/migrate-turtle-locks", { method: "POST" })
          .then(r => r.ok ? r.json() : null)
          .then(result => {
            if (result) localStorage.setItem(flagKey, "1");
          })
          .catch(() => {});
      }
    });
  }, [status, session?.user?.id]);

  async function loadClasses(_teacherId: string) {
    const res = await fetch("/api/teacher/classes");
    const data = res.ok ? await res.json() : [];
    const classList: (Class & { studentCount: number })[] = data;
    setClasses(classList);
    const counts: Record<string, number> = {};
    for (const c of classList) counts[c.id] = c.studentCount ?? 0;
    setStudentCounts(counts);
    setLoading(false);
  }

  // Returning from the Google OAuth consent screen (?google=connected|denied|error)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const google = q.get("google");
    if (!google) return;
    window.history.replaceState(null, "", window.location.pathname);
    setShowBulkInfo(true);
    if (google === "connected") loadGoogleCourses();
    else setRosterError(google === "denied"
      ? "Google access was declined — connect and allow the Classroom permissions to import."
      : "Google connection failed — try again.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadGoogleCourses() {
    setGcState("loading");
    try {
      const r = await fetch("/api/teacher/roster/google/courses");
      if (r.status === 503) { setGcState("unconfigured"); return; }
      if (r.status === 401) { setGcCourses(null); setGcState(""); return; }
      if (r.ok) { setGcCourses(await r.json()); setGcState(""); return; }
      setGcState("");
    } catch {
      setGcState("");
    }
  }

  async function onRosterFile(file: File | undefined) {
    if (!file) return;
    setRosterError(null); setRosterPreview(null); setRosterDone(null);
    setPreviewSource("csv");
    setRosterFileName(file.name);
    const text = await file.text();
    setRosterCsv(text);
    setRosterBusy("preview");
    try {
      const r = await fetch("/api/teacher/roster/csv", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, dryRun: true }),
      });
      const d = await r.json();
      if (!r.ok) { setRosterError(d.error ?? "Validation failed"); return; }
      setRosterPreview(d);
    } finally {
      setRosterBusy("");
    }
  }

  async function runRosterImport(source: "csv" | "google") {
    setRosterBusy("import"); setRosterError(null);
    try {
      const r = source === "csv"
        ? await fetch("/api/teacher/roster/csv", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csv: rosterCsv, dryRun: false }),
          })
        : await fetch("/api/teacher/roster/google/sync", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseIds: gcSelected, dryRun: false }),
          });
      const d = await r.json();
      if (!r.ok) { setRosterError(d.error ?? "Import failed"); return; }
      setRosterDone(d); setRosterPreview(null); setRosterCsv(null);
      if (session?.user?.id) loadClasses(session.user.id);
    } finally {
      setRosterBusy("");
    }
  }

  async function previewGoogle() {
    if (gcSelected.length === 0) return;
    setRosterBusy("preview"); setRosterError(null); setRosterPreview(null); setRosterDone(null);
    try {
      const r = await fetch("/api/teacher/roster/google/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIds: gcSelected, dryRun: true }),
      });
      const d = await r.json();
      if (r.status === 401) { setGcCourses(null); setRosterError("Google session expired — connect again."); return; }
      if (!r.ok) { setRosterError(d.error ?? "Google sync failed"); return; }
      setPreviewSource("google"); setRosterPreview(d);
    } finally {
      setRosterBusy("");
    }
  }

  function downloadCredentials(summary: RosterSummary) {
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const rows = [["name", "sign_in_with", "temporary_password", "class"],
      ...summary.credentials.map(c => [c.name, c.identifier, c.tempPassword, c.classTitle])];
    const blob = new Blob([rows.map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "student-credentials.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function createClass() {
    if (!newClassName.trim()) return;
    setCreating(true);
    setCreateError("");
    const res = await fetch("/api/teacher/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClassName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setClasses(prev => [data, ...prev]);
      setStudentCounts(prev => ({ ...prev, [data.id]: 0 }));
      setNewClassName("");
      setShowCreate(false);
    } else {
      if (data.code === "email_unverified") setEmailUnverified(true);
      setCreateError(data.error ?? "Could not create the class.");
    }
    setCreating(false);
  }

  async function resendVerification() {
    setResendState("sending");
    const res = await fetch("/api/auth/resend-verification", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.devVerifyUrl) console.info("[dev] verify email:", data.devVerifyUrl);
    setResendState(res.ok ? "sent" : "");
  }

  if (status === "loading" || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        {session?.user?.name && (
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600, opacity: 0.85 }}>
            {session.user.name}
          </span>
        )}
      </SiteHeader>

      {/* Main */}
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px" }}>

          {/* Page title */}
          <div style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 28, flexWrap: "wrap", gap: 16, padding: "22px 28px" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: 0 }}>
                Teacher Dashboard
              </h1>
              <p style={{ fontSize: 14, color: "#555", margin: "4px 0 0" }}>
                Manage your classes and track student progress.
              </p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setShowBulkInfo(v => !v)} style={{
                padding: "12px 18px", borderRadius: 12, background: "#fff",
                color: "#7c3aed", border: "2px dashed #a78bfa", fontWeight: 800, fontSize: 14,
                cursor: "pointer",
              }}>
                ⚡ Bulk import
              </button>
              <button onClick={() => setShowCreate(true)} style={{
                padding: "12px 24px", borderRadius: 12, background: "#2563eb",
                color: "#fff", border: "none", fontWeight: 800, fontSize: 15,
                cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
              }}>
                + New Class
              </button>
            </div>
          </div>

          {/* Bulk import: functional for district teachers; a teaser for the
              paid tier otherwise — every teacher should SEE what it does. */}
          {showBulkInfo && !inDistrict && (
            <div style={{ ...CARD, borderColor: "#7c3aed", background: "#faf5ff", padding: "18px 24px",
              marginBottom: 28, display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 26 }}>🏫</span>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: "#5b21b6", marginBottom: 4 }}>
                  Import whole classes from Google Classroom or a CSV
                </div>
                <div style={{ fontSize: 13, color: "#6d28d9", lineHeight: 1.6 }}>
                  With <strong>StemBuilder for Districts</strong>, you connect your Google Classroom
                  or upload a roster and every class — with student accounts already created — appears
                  here automatically. No join codes, no manual setup. Interested? Have your school reach
                  out at <a href="mailto:info@stembuilder.io" style={{ color: "#5b21b6", fontWeight: 800 }}>
                  info@stembuilder.io</a> — district trials are free.
                </div>
              </div>
              <button onClick={() => setShowBulkInfo(false)} style={{ background: "none", border: "none",
                color: "#7c3aed", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
          )}

          {showBulkInfo && inDistrict && (
            <div style={{ ...CARD, borderColor: "#7c3aed", padding: "22px 26px", marginBottom: 28 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <h2 style={{ fontSize: 17, fontWeight: 900, color: "#111", margin: 0 }}>
                  ⚡ Import your classes
                </h2>
                <button onClick={() => setShowBulkInfo(false)} style={{ background: "none", border: "none",
                  color: "#7c3aed", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✕ Close</button>
              </div>
              <p style={{ fontSize: 13, color: "#555", margin: "0 0 16px", lineHeight: 1.6 }}>
                Classes and student accounts are created for you and appear below. Re-importing is safe —
                existing students are matched, never duplicated.
              </p>

              {/* Google Classroom */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111", marginBottom: 8 }}>From Google Classroom</div>
                {gcState === "unconfigured" ? (
                  <p style={{ fontSize: 13, color: "#888", margin: 0 }}>Google Classroom isn&apos;t configured on this site yet.</p>
                ) : gcCourses === null ? (
                  <a href="/api/teacher/roster/google/connect"
                    style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10, background: "#1f1f1f",
                      color: "#fff", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
                    {gcState === "loading" ? "Connecting…" : "🔗 Connect Google Classroom"}
                  </a>
                ) : gcCourses.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#888", margin: 0 }}>No active courses found on the connected Google account.</p>
                ) : (
                  <div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                      {gcCourses.map(c => (
                        <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 12px", borderRadius: 8, background: "#f9f9f9", border: "1px solid #eee",
                          fontSize: 13, fontWeight: 600, color: "#111", cursor: "pointer" }}>
                          <input type="checkbox" checked={gcSelected.includes(c.id)}
                            onChange={e => setGcSelected(prev => e.target.checked
                              ? [...prev, c.id] : prev.filter(x => x !== c.id))} />
                          {c.title}
                        </label>
                      ))}
                    </div>
                    <button onClick={previewGoogle} disabled={gcSelected.length === 0 || rosterBusy !== ""}
                      style={{ padding: "10px 16px", borderRadius: 10, background: "#1f1f1f", color: "#fff",
                        border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer",
                        opacity: gcSelected.length === 0 ? 0.5 : 1 }}>
                      {rosterBusy === "preview" && previewSource === "google" ? "Checking…" : `Preview import (${gcSelected.length})`}
                    </button>
                  </div>
                )}
              </div>

              {/* CSV */}
              <div style={{ borderTop: "1px solid #eee", paddingTop: 16, marginBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#111", marginBottom: 8 }}>
                  From a CSV file{" "}
                  <a href="/api/teacher/roster/csv" style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}>
                    (download template)
                  </a>
                </div>
                <label style={{ display: "inline-block", padding: "10px 16px", borderRadius: 10,
                  background: "#fff", border: "2px solid #1f1f1f", color: "#1f1f1f", fontSize: 13,
                  fontWeight: 800, cursor: "pointer" }}>
                  {rosterBusy === "preview" && previewSource === "csv" ? "Checking…"
                    : rosterFileName ? `📄 ${rosterFileName} — choose another` : "📄 Choose CSV file"}
                  <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
                    onChange={e => onRosterFile(e.target.files?.[0])} />
                </label>
              </div>

              {rosterError && (
                <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fee2e2", color: "#b91c1c",
                  fontSize: 13, fontWeight: 700, marginTop: 14 }}>{rosterError}</div>
              )}

              {(rosterPreview ?? rosterDone) && (() => {
                const s = (rosterDone ?? rosterPreview)!;
                const c = s.counts;
                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 700,
                      background: rosterDone ? "#dcfce7" : "#eff6ff", color: rosterDone ? "#166534" : "#1e40af" }}>
                      {rosterDone ? "Import complete: " : "Preview — nothing imported yet: "}
                      {c.classesCreated} class{c.classesCreated === 1 ? "" : "es"} new, {c.classesLinked} existing ·{" "}
                      {c.studentsCreated} student{c.studentsCreated === 1 ? "" : "s"} new, {c.studentsLinked} existing ·{" "}
                      {c.enrollmentsCreated} enrollment{c.enrollmentsCreated === 1 ? "" : "s"}
                      {c.errors > 0 && <span style={{ color: "#b91c1c" }}> · {c.errors} error{c.errors === 1 ? "" : "s"}</span>}
                    </div>
                    {rosterDone && rosterDone.credentials.length > 0 && (
                      <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fefce8",
                        border: "1px solid #fde68a", marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e", marginBottom: 6 }}>
                          {rosterDone.credentials.length} new student sign-in{rosterDone.credentials.length === 1 ? "" : "s"} —
                          download now, shown only once.
                        </div>
                        <button onClick={() => downloadCredentials(rosterDone)}
                          style={{ padding: "9px 14px", borderRadius: 10, background: "#1f1f1f", color: "#fff",
                            border: "none", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                          ⬇ Download credentials CSV
                        </button>
                      </div>
                    )}
                    {s.results.filter(r => r.action === "error").map((r, i) => (
                      <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2",
                        border: "1px solid #fecaca", marginBottom: 6, fontSize: 12, color: "#991b1b" }}>
                        <strong>{r.row ? `Row ${r.row}: ` : ""}{r.label}</strong> — {r.message}
                      </div>
                    ))}
                    {rosterPreview && (
                      <button onClick={() => runRosterImport(previewSource)} disabled={rosterBusy === "import"}
                        style={{ padding: "12px 22px", borderRadius: 10, border: "none", color: "#fff",
                          background: rosterBusy === "import" ? "#6b7280" : "#16a34a", fontSize: 14,
                          fontWeight: 800, cursor: "pointer" }}>
                        {rosterBusy === "import" ? "Importing…" : `✓ Import ${c.studentsCreated} students / ${c.classesCreated} classes`}
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Email verification notice — class creation is gated until verified */}
          {emailUnverified && (
            <div style={{ ...CARD, borderColor: "#b45309", background: "#fffbeb", padding: "16px 22px",
              marginBottom: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 24 }}>📬</span>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e" }}>
                  Verify your email to create classes
                </div>
                <div style={{ fontSize: 13, color: "#a16207" }}>
                  We sent a verification link to your inbox. Click it to unlock class creation.
                </div>
              </div>
              <button onClick={resendVerification} disabled={resendState !== ""}
                style={{ padding: "9px 18px", borderRadius: 10, border: "2px solid #b45309",
                  background: resendState === "sent" ? "#fef3c7" : "#fff", color: "#92400e",
                  fontWeight: 800, fontSize: 13, cursor: resendState === "" ? "pointer" : "default" }}>
                {resendState === "sent" ? "Sent ✓" : resendState === "sending" ? "Sending…" : "Resend email"}
              </button>
            </div>
          )}

          {/* Create class modal */}
          {showCreate && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
              <div style={{ ...CARD, padding: "36px 32px", width: 400, maxWidth: "90vw" }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 6 }}>
                  Create a New Class
                </h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  A join code will be generated automatically for your students.
                </p>
                <input
                  autoFocus
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createClass()}
                  placeholder="e.g. Period 3 — Engineering"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "2px solid #e0e0e0",
                    fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box",
                    fontFamily: "system-ui,sans-serif", color: "#111", background: "#fff" }}
                />
                {createError && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8,
                    padding: "10px 14px", fontSize: 13, color: "#dc2626", fontWeight: 600, marginTop: 12 }}>
                    {createError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => { setShowCreate(false); setNewClassName(""); setCreateError(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "2px solid #e0e0e0",
                      background: "#f5f5f5", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#555" }}>
                    Cancel
                  </button>
                  <button onClick={createClass} disabled={!newClassName.trim() || creating}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none",
                      background: newClassName.trim() ? "#2563eb" : "#ccc",
                      color: "#fff", fontWeight: 800, fontSize: 14,
                      cursor: newClassName.trim() ? "pointer" : "not-allowed" }}>
                    {creating ? "Creating…" : "Create Class"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Classes grid */}
          {classes.length === 0 ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🏫</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 8 }}>
                No classes yet
              </h2>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
                Create your first class to get started. Students join with the class code you give them.
              </p>
              <button onClick={() => setShowCreate(true)} style={{
                padding: "12px 28px", borderRadius: 12, background: "#2563eb",
                color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                + Create Your First Class
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 24 }}>
              {classes.map(cls => (
                <div key={cls.id} style={{ ...CARD, padding: "24px 26px" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 4 }}>
                    {cls.name}
                  </div>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
                    {studentCounts[cls.id] ?? 0} student{studentCounts[cls.id] !== 1 ? "s" : ""} enrolled
                  </div>

                  {/* Join code */}
                  <div style={{ background: "#f0f4ff", border: "2px solid #c7d7fd",
                    borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#3730a3",
                      textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>
                      Student Join Code
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: "#2563eb",
                      letterSpacing: "4px", fontFamily: "monospace" }}>
                      {cls.join_code}
                    </div>
                    <div style={{ fontSize: 11, color: "#6366f1", marginTop: 4 }}>
                      Share this code with your students
                    </div>
                  </div>

                  <Link href={`/teachers/classes/${cls.id}`}
                    style={{ display: "block", padding: "10px", borderRadius: 10,
                      background: "#1f1f1f", color: "#fff", textAlign: "center",
                      fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                    View Class →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
