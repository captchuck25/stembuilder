"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, type Class, type Assignment } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { LEVELS } from "@/app/tools/code-lab/python/levels";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

interface EnrolledClass {
  class: Class;
  assignments: Assignment[];
}

export default function StudentDashboard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [enrolledClasses, setEnrolledClasses] = useState<EnrolledClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) { router.push("/"); return; }
    getProfile(user.id).then(profile => {
      if (!profile) { router.push("/onboarding"); return; }
      if (profile.role === "teacher") { router.push("/teachers/dashboard"); return; }
      loadClasses(user.id);
    });
  }, [isLoaded, user]);

  async function loadClasses(studentId: string) {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("class_id")
      .eq("student_id", studentId);

    if (!enrollments?.length) { setLoading(false); return; }

    const classIds = enrollments.map(e => e.class_id);
    const { data: classes } = await supabase
      .from("classes")
      .select("*")
      .in("id", classIds);

    const result: EnrolledClass[] = await Promise.all(
      (classes ?? []).map(async (cls) => {
        const { data: assignments } = await supabase
          .from("assignments")
          .select("*")
          .eq("class_id", cls.id)
          .order("level_id");
        return { class: cls, assignments: assignments ?? [] };
      })
    );

    setEnrolledClasses(result);
    setLoading(false);
  }

  async function joinClass() {
    if (!user || !joinCode.trim()) return;
    setJoining(true);
    setJoinError("");

    const { data: cls } = await supabase
      .from("classes")
      .select("*")
      .eq("join_code", joinCode.trim().toUpperCase())
      .single();

    if (!cls) {
      setJoinError("Class not found. Check the code and try again.");
      setJoining(false);
      return;
    }

    // Check already enrolled
    const { data: existing } = await supabase
      .from("enrollments")
      .select("id")
      .eq("class_id", cls.id)
      .eq("student_id", user.id)
      .single();

    if (existing) {
      setJoinError("You are already enrolled in this class.");
      setJoining(false);
      return;
    }

    await supabase.from("enrollments").insert({
      class_id: cls.id,
      student_id: user.id,
    });

    setJoinCode("");
    setShowJoin(false);
    loadClasses(user.id);
    setJoining(false);
  }

  if (!isLoaded || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        {user?.firstName && (
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{user.firstName}</span>
        )}
      </SiteHeader>

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 40px" }}>

          <div style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 28, flexWrap: "wrap", gap: 16, padding: "22px 28px" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: 0 }}>My Classes</h1>
              <p style={{ fontSize: 14, color: "#555", margin: "4px 0 0" }}>
                Your enrolled classes and assigned work.
              </p>
            </div>
            <button onClick={() => setShowJoin(true)} style={{
              padding: "12px 24px", borderRadius: 12, background: "#16a34a",
              color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(22,163,74,0.3)",
            }}>
              + Join a Class
            </button>
          </div>

          {/* Join class modal */}
          {showJoin && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
              <div style={{ ...CARD, padding: "36px 32px", width: 400, maxWidth: "90vw" }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 6 }}>Join a Class</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Enter the join code your teacher gave you.
                </p>
                <input
                  autoFocus
                  value={joinCode}
                  onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
                  onKeyDown={e => e.key === "Enter" && joinClass()}
                  placeholder="e.g. A3K9PZ"
                  maxLength={6}
                  style={{ width: "100%", padding: "12px 14px", borderRadius: 10,
                    border: joinError ? "2px solid #dc2626" : "2px solid #e0e0e0",
                    fontSize: 22, fontWeight: 900, letterSpacing: "4px", textAlign: "center",
                    fontFamily: "monospace", outline: "none", boxSizing: "border-box",
                    textTransform: "uppercase" }}
                />
                {joinError && <p style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{joinError}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => { setShowJoin(false); setJoinCode(""); setJoinError(""); }}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "2px solid #e0e0e0",
                      background: "#f5f5f5", fontWeight: 700, fontSize: 14, cursor: "pointer", color: "#555" }}>
                    Cancel
                  </button>
                  <button onClick={joinClass} disabled={joinCode.length !== 6 || joining}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none",
                      background: joinCode.length === 6 ? "#16a34a" : "#ccc",
                      color: "#fff", fontWeight: 800, fontSize: 14,
                      cursor: joinCode.length === 6 ? "pointer" : "not-allowed" }}>
                    {joining ? "Joining…" : "Join Class"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* No classes yet */}
          {enrolledClasses.length === 0 ? (
            <div style={{ ...CARD, padding: "64px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🎒</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111", marginBottom: 8 }}>
                You are not enrolled in any classes yet
              </h2>
              <p style={{ fontSize: 14, color: "#666", marginBottom: 24 }}>
                Ask your teacher for a join code to get started.
              </p>
              <button onClick={() => setShowJoin(true)} style={{
                padding: "12px 28px", borderRadius: 12, background: "#16a34a",
                color: "#fff", border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
                Enter Join Code
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {enrolledClasses.map(({ class: cls, assignments }) => (
                <div key={cls.id} style={{ ...CARD, padding: "28px 30px" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#111", marginBottom: 4 }}>{cls.name}</div>
                  <div style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
                    {assignments.length} level{assignments.length !== 1 ? "s" : ""} assigned
                  </div>

                  {assignments.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>
                      No assignments yet — check back soon.
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {assignments.map(a => {
                        const level = LEVELS[a.level_id];
                        if (!level) return null;
                        return (
                          <Link key={a.id} href={`/tools/code-lab/python`}
                            style={{ textDecoration: "none" }}>
                            <div style={{ padding: "14px 20px", borderRadius: 14,
                              background: `linear-gradient(135deg, ${level.color}22, ${level.color}44)`,
                              border: `2px solid ${level.color}`,
                              display: "flex", alignItems: "center", gap: 10 }}>
                              <div style={{ fontSize: 22 }}>
                                {a.level_id === 0 ? "🐍" : a.level_id === 1 ? "🔁" : "🧠"}
                              </div>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                                  Level {level.id} — {level.title}
                                </div>
                                <div style={{ fontSize: 12, color: "#555" }}>{level.tagline}</div>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
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
