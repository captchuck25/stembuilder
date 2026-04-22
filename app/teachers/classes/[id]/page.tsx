"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase, type Class, type Assignment } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { LEVELS } from "@/app/tools/code-lab/python/levels";
import { CHALLENGES as TURTLE_CHALLENGES } from "@/app/tools/code-lab/turtle/challenges";
import { fetchTurtleSubmissionsForStudents, approveTurtleSubmission, type TurtleSubmission } from "@/lib/achievements";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

interface StudentRow {
  id: string;
  name: string;
  email: string;
  completedChallenges: number;
  totalChallenges: number;
}

export default function ClassDetailPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const [cls, setCls] = useState<Class | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTool, setSelectedTool] = useState<"code-lab" | "bridge" | "turtle">("code-lab");
  const [turtleSubs, setTurtleSubs] = useState<TurtleSubmission[]>([]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) { router.push("/"); return; }
    getProfile(user.id).then(profile => {
      if (!profile || profile.role !== "teacher") { router.push("/"); return; }
      loadClass();
    });
  }, [isLoaded, user]);

  async function loadClass() {
    const [{ data: classData }, { data: assignData }, { data: enrollData }] = await Promise.all([
      supabase.from("classes").select("*").eq("id", classId).single(),
      supabase.from("assignments").select("*").eq("class_id", classId).order("level_id"),
      supabase.from("enrollments").select("student_id").eq("class_id", classId),
    ]);

    if (!classData) { router.push("/teachers/dashboard"); return; }
    setCls(classData);
    setAssignments(assignData ?? []);

    // Load student profiles + progress
    const studentIds = (enrollData ?? []).map(e => e.student_id);
    if (studentIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", studentIds);

      const totalChallenges = (assignData ?? []).reduce((sum, a) => {
        const level = LEVELS[a.level_id];
        return sum + (level?.challenges.length ?? 0);
      }, 0);

      const rows: StudentRow[] = await Promise.all(
        (profiles ?? []).map(async (p) => {
          const { count } = await supabase
            .from("user_progress")
            .select("*", { count: "exact", head: true })
            .eq("user_id", p.id)
            .eq("completed", true)
            .not("challenge_idx", "is", null);
          return {
            id: p.id,
            name: p.name,
            email: p.email,
            completedChallenges: count ?? 0,
            totalChallenges,
          };
        })
      );
      setStudents(rows);
      const subs = await fetchTurtleSubmissionsForStudents(studentIds);
      setTurtleSubs(subs);
    }
    setLoading(false);
  }

  async function handleApprove(id: string, approved: boolean | null) {
    await approveTurtleSubmission(id, approved);
    setTurtleSubs(prev => prev.map(s => s.id === id ? { ...s, approved } : s));
  }

  async function toggleLevel(levelId: number) {
    if (!cls || saving) return;
    setSaving(true);
    const existing = assignments.find(a => a.level_id === levelId);
    if (existing) {
      await supabase.from("assignments").delete().eq("id", existing.id);
      setAssignments(prev => prev.filter(a => a.level_id !== levelId));
    } else {
      const { data } = await supabase.from("assignments").insert({
        class_id: cls.id,
        tool: "code-lab",
        level_id: levelId,
      }).select().single();
      if (data) setAssignments(prev => [...prev, data].sort((a, b) => a.level_id - b.level_id));
    }
    setSaving(false);
  }

  if (!isLoaded || loading || !cls) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  const assignedIds = new Set(assignments.map(a => a.level_id));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        <Link href="/teachers/dashboard" style={{ border: "1px solid #fff", color: "#fff",
          padding: "8px 14px", borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Dashboard
        </Link>
      </SiteHeader>

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 40px" }}>

          {/* Class header */}
          <div style={{ ...CARD, padding: "22px 28px", marginBottom: 28,
            display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 10px" }}>{cls.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ background: "#f0f4ff", border: "2px solid #c7d7fd", borderRadius: 10,
                  padding: "6px 16px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#3730a3", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                    Join Code
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: "#2563eb", letterSpacing: "3px", fontFamily: "monospace" }}>
                    {cls.join_code}
                  </span>
                </div>
                <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>
                  {students.length} student{students.length !== 1 ? "s" : ""} enrolled
                </span>
              </div>
            </div>
          </div>

          {/* Tool selector */}
          <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
            {[
              { id: "code-lab" as const, label: "Code Lab", icon: "🐍",
                color: "#2563eb", desc: "Python maze challenges" },
              { id: "bridge" as const, label: "Bridge Builder", icon: "🌉",
                color: "#d97706", desc: "Structural engineering" },
              { id: "turtle" as const, label: "Turtle Challenges", icon: "🐢",
                color: "#059669", desc: "Creative drawing review" },
            ].map(tool => {
              const active = selectedTool === tool.id;
              return (
                <button key={tool.id} onClick={() => setSelectedTool(tool.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px",
                    borderRadius: 16, border: `3px solid ${active ? tool.color : "rgba(255,255,255,0.6)"}`,
                    background: active ? "rgba(255,255,255,0.97)" : "rgba(255,255,255,0.55)",
                    cursor: "pointer", transition: "all 150ms",
                    boxShadow: active ? "0 4px 16px rgba(0,0,0,0.15)" : "none" }}>
                  <span style={{ fontSize: 28 }}>{tool.icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: active ? tool.color : "#444" }}>
                      {tool.label}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>{tool.desc}</div>
                  </div>
                  {active && <div style={{ width: 8, height: 8, borderRadius: 999,
                    background: tool.color, marginLeft: 4 }} />}
                </button>
              );
            })}
          </div>

          {/* Code Lab panel */}
          {selectedTool === "code-lab" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "start" }}>
              {/* Assign Levels */}
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 6 }}>Assign Levels</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Toggle which Code Lab levels this class can access.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {LEVELS.map((level, idx) => {
                    const assigned = assignedIds.has(idx);
                    return (
                      <button key={idx} onClick={() => toggleLevel(idx)} disabled={saving}
                        style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                          borderRadius: 14, border: `2px solid ${assigned ? level.color : "#e0e0e0"}`,
                          background: assigned ? `${level.color}18` : "#fafafa",
                          cursor: saving ? "not-allowed" : "pointer", textAlign: "left",
                          transition: "all 150ms", opacity: saving ? 0.6 : 1 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 999,
                          background: assigned ? level.color : "#e0e0e0",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, fontSize: 14, color: "#fff", fontWeight: 800,
                          transition: "background 150ms" }}>
                          {assigned ? "✓" : idx + 1}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#111" }}>
                            Level {level.id} — {level.title}
                          </div>
                          <div style={{ fontSize: 12, color: "#666" }}>{level.tagline}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Student Progress */}
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 6 }}>Student Progress</h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Challenges completed across all assigned levels.
                </p>
                {students.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                    No students enrolled yet. Share the join code above.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {students.map(s => {
                      const pct = s.totalChallenges > 0
                        ? Math.round((s.completedChallenges / s.totalChallenges) * 100) : 0;
                      return (
                        <div key={s.id} style={{ padding: "12px 14px", borderRadius: 12,
                          border: "2px solid #e8e8e8", background: "#fafafa" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#555" }}>
                              {s.completedChallenges}/{s.totalChallenges}
                            </div>
                          </div>
                          <div style={{ height: 6, background: "#e8e8e8", borderRadius: 999 }}>
                            <div style={{ height: "100%", borderRadius: 999, background: "#16a34a",
                              width: `${pct}%`, transition: "width 400ms ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Turtle panel */}
          {selectedTool === "turtle" && (() => {
            const challenges = TURTLE_CHALLENGES.filter(c => c.category === "challenge");
            const studentMap = new Map(students.map(s => [s.id, s]));
            const hasSubs = turtleSubs.length > 0;
            return (
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", marginBottom: 6 }}>
                  Turtle Creative Challenges
                </h2>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
                  Review student submissions. Click ✓ to approve or ✗ to send back.
                </p>
                {!hasSubs ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                    No submissions yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                    {challenges.map(ch => {
                      const chSubs = turtleSubs.filter(s => s.challenge_id === ch.id);
                      if (!chSubs.length) return null;
                      return (
                        <div key={ch.id}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#111",
                            marginBottom: 12, paddingBottom: 6, borderBottom: "2px solid #f0f0f0" }}>
                            {ch.title}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                            {chSubs.map(sub => {
                              const student = studentMap.get(sub.user_id);
                              const borderColor = sub.approved === true ? "#10b981"
                                : sub.approved === false ? "#dc2626" : "#d1d5db";
                              return (
                                <div key={sub.id} style={{ display: "flex", flexDirection: "column",
                                  alignItems: "center", gap: 6 }}>
                                  <div style={{ border: `3px solid ${borderColor}`, borderRadius: 10,
                                    overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                                    <img src={sub.image_data} alt={student?.name ?? "Student"}
                                      width={100} height={100} style={{ display: "block" }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#333",
                                    maxWidth: 106, textAlign: "center", lineHeight: 1.3 }}>
                                    {student?.name ?? "Unknown"}
                                  </span>
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button onClick={() => handleApprove(sub.id, sub.approved === true ? null : true)}
                                      style={{ padding: "4px 10px", borderRadius: 6, border: "none",
                                        background: sub.approved === true ? "#10b981" : "#e5e7eb",
                                        color: sub.approved === true ? "#fff" : "#555",
                                        fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                                      ✓
                                    </button>
                                    <button onClick={() => handleApprove(sub.id, sub.approved === false ? null : false)}
                                      style={{ padding: "4px 10px", borderRadius: 6, border: "none",
                                        background: sub.approved === false ? "#dc2626" : "#e5e7eb",
                                        color: sub.approved === false ? "#fff" : "#555",
                                        fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                                      ✗
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Bridge Builder panel */}
          {selectedTool === "bridge" && (
            <div style={{ ...CARD, padding: "48px 40px", textAlign: "center" }}>
              <div style={{ fontSize: 52, marginBottom: 16 }}>🌉</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111", marginBottom: 10 }}>
                Bridge Builder Challenges
              </h2>
              <p style={{ fontSize: 15, color: "#555", maxWidth: 480, margin: "0 auto 16px", lineHeight: 1.6 }}>
                Assigned challenges and student progress tracking for the Bridge Builder are coming soon.
                Students can currently access the tool freely — scored challenges will be added in a future update.
              </p>
              <div style={{ display: "inline-block", padding: "8px 20px", borderRadius: 999,
                background: "#fef3c7", border: "2px solid #fde68a", fontSize: 13,
                fontWeight: 700, color: "#92400e" }}>
                🚧 In Development
              </div>
            </div>
          )}
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
