"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { type Class } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
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

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/"); return; }

    // Verify teacher role
    getProfile(session?.user?.id).then(profile => {
      if (!profile) { router.push("/onboarding"); return; }
      if (profile.role !== "teacher") { router.push("/tools/code-lab"); return; }
      // Unverified teachers can look around but can't create classes yet.
      setEmailUnverified(!!profile.email && !profile.email_verified_at);
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
            <button onClick={() => setShowCreate(true)} style={{
              padding: "12px 24px", borderRadius: 12, background: "#2563eb",
              color: "#fff", border: "none", fontWeight: 800, fontSize: 15,
              cursor: "pointer", boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
            }}>
              + New Class
            </button>
          </div>

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
