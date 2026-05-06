"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { type Class, type Assignment, type LessonLock } from "@/lib/supabase";
import { getProfile } from "@/lib/profile";
import { LEVELS } from "@/app/tools/code-lab/python/levels";
import { UNITS } from "@/app/tools/block-lab/units";
import { CHALLENGES as TURTLE_CHALLENGES } from "@/app/tools/code-lab/turtle/challenges";
import { fetchTurtleSubmissionsForStudents, approveTurtleSubmission, fetchTurtleAssignments, assignTurtleChallenge, unassignTurtleChallenge, type TurtleSubmission } from "@/lib/achievements";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const TH: React.CSSProperties = {
  padding: "8px 12px",
  fontWeight: 800,
  fontSize: 12,
  color: "#555",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  background: "#f9fafb",
  borderBottom: "2px solid #e5e7eb",
  whiteSpace: "nowrap",
  textAlign: "left",
};

const TD: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#111",
  borderBottom: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
};

const NAME_TD: React.CSSProperties = {
  ...TD,
  position: "sticky",
  left: 0,
  background: "#fff",
  fontWeight: 700,
  zIndex: 1,
  borderRight: "2px solid #e5e7eb",
  minWidth: 200,
};

interface StudentRow {
  id: string;
  name: string;
  email: string;
  completedChallenges: number;
  totalChallenges: number;
}

interface GradebookLevel {
  challengesDone: number;
  challengesTotal: number;
  quizScore: number | null;
  quizTotal: number;
}

interface GradebookStudent {
  id: string;
  name: string;
  email: string;
  levels: Record<number, GradebookLevel>;
}

interface GradebookData {
  students: GradebookStudent[];
  assignedLevelIds: number[];
}

function downloadCSV(rows: string[][], filename: string) {
  const csv = "﻿" + rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClassDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const [cls, setCls] = useState<Class | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [locks, setLocks] = useState<LessonLock[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTool, setSelectedTool] = useState<"code-lab" | "block-lab" | "bridge" | "turtle" | "stem-sketch">("code-lab");
  const [turtleSubs, setTurtleSubs] = useState<TurtleSubmission[]>([]);
  const [turtleAssigned, setTurtleAssigned] = useState<Set<string>>(new Set());
  const [turtleAssignSaving, setTurtleAssignSaving] = useState<string | null>(null);
  const [grades, setGrades] = useState<Record<string, GradebookData | null>>({});
  const [loadingGrades, setLoadingGrades] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const fetchedRef = useRef<Set<string>>(new Set());

  // Bridge assignments state
  interface BridgeAssignment { id: string; title: string; span_feet: number; load_lb: number; max_cost: number; completionCount: number; created_at: string; }
  interface BridgeSubmissionRow { rank: number; student_id: string; name: string; email: string; cost: number; submitted_at: string; }
  const [bridgeAssignments, setBridgeAssignments] = useState<BridgeAssignment[]>([]);
  const [showBridgeForm, setShowBridgeForm] = useState(false);
  const [bridgeForm, setBridgeForm] = useState({ title: "", spanFeet: 40, loadTon: 8, maxCost: "" });
  const [bridgeFormSaving, setBridgeFormSaving] = useState(false);
  const [bridgeFormError, setBridgeFormError] = useState("");
  const [deletingBridgeId, setDeletingBridgeId] = useState<string | null>(null);
  const [expandedBridgeId, setExpandedBridgeId] = useState<string | null>(null);
  const [bridgeLeaderboards, setBridgeLeaderboards] = useState<Record<string, BridgeSubmissionRow[]>>({});
  const [loadingLeaderboardId, setLoadingLeaderboardId] = useState<string | null>(null);
  interface BridgeSubmissionCell { cost: number; passed: boolean; thumbnail: string | null; }
  // submissionMap[student_id][assignment_id] = cell
  const [bridgeSubmissionMap, setBridgeSubmissionMap] = useState<Record<string, Record<string, BridgeSubmissionCell>>>({});
  const [loadingBridgeGradebook, setLoadingBridgeGradebook] = useState(false);
  const bridgeGradebookLoadedRef = useRef(false);

  // STEM Sketch
  interface StemSketchRow { id: string; user_id: string; name: string; units: string; thumbnail: string | null; updated_at: string; student_name: string; student_email: string; }
  const [stemSketchDesigns, setStemSketchDesigns] = useState<StemSketchRow[]>([]);
  const [loadingStemSketch, setLoadingStemSketch] = useState(false);
  const stemSketchLoadedRef = useRef(false);

  // Class settings state
  const [showSettings, setShowSettings] = useState(false);
  const [editName, setEditName] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [confirmDeleteClass, setConfirmDeleteClass] = useState(false);
  const [deletingClass, setDeletingClass] = useState(false);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);

  // Overall bridge leaderboard
  interface LeaderboardRow { rank: number; student_id: string; name: string; email: string; cost: number; assignment_title: string; }
  interface LeaderboardData { overall: LeaderboardRow[]; byAssignment: { title: string; rows: LeaderboardRow[] }[] }
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<"overall" | string>("overall");

  // Multi-class assignment
  const [otherClasses, setOtherClasses] = useState<Class[]>([]);
  const [multiAssignModal, setMultiAssignModal] = useState<{ tool: string; levelId: number } | null>(null);
  const [multiAssignSelected, setMultiAssignSelected] = useState<Set<string>>(new Set());
  const [multiAssigning, setMultiAssigning] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) { router.push("/"); return; }
    getProfile(session?.user?.id).then(profile => {
      if (!profile || profile.role !== "teacher") { router.push("/"); return; }
      loadClass();
    });
  }, [status, session?.user?.id]);

  useEffect(() => {
    if (!cls) return;
    if (selectedTool !== "code-lab" && selectedTool !== "block-lab") return;
    if (fetchedRef.current.has(selectedTool)) return;
    fetchedRef.current.add(selectedTool);
    setLoadingGrades(true);
    fetch(`/api/teacher/classes/${classId}/progress?tool=${selectedTool}`)
      .then(r => r.json())
      .then(data => setGrades(prev => ({ ...prev, [selectedTool]: data })))
      .finally(() => setLoadingGrades(false));
  }, [selectedTool, cls]);

  useEffect(() => {
    if (!cls || selectedTool !== "bridge" || bridgeGradebookLoadedRef.current) return;
    bridgeGradebookLoadedRef.current = true;
    setLoadingBridgeGradebook(true);
    fetch(`/api/teacher/bridge-gradebook?classId=${classId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ assignment_id: string; student_id: string; cost: number; passed: boolean; thumbnail: string | null }>) => {
        const map: Record<string, Record<string, BridgeSubmissionCell>> = {};
        for (const row of rows) {
          if (!map[row.student_id]) map[row.student_id] = {};
          map[row.student_id][row.assignment_id] = { cost: row.cost, passed: row.passed, thumbnail: row.thumbnail };
        }
        setBridgeSubmissionMap(map);
      })
      .finally(() => setLoadingBridgeGradebook(false));
  }, [selectedTool, cls]);

  useEffect(() => {
    if (!cls || selectedTool !== "stem-sketch" || stemSketchLoadedRef.current) return;
    stemSketchLoadedRef.current = true;
    setLoadingStemSketch(true);
    fetch(`/api/teacher/stem-sketch-designs?classId=${classId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setStemSketchDesigns)
      .finally(() => setLoadingStemSketch(false));
  }, [selectedTool, cls]);

  async function loadClass() {
    const res = await fetch(`/api/teacher/classes/${classId}`);
    if (!res.ok) { router.push("/teachers/dashboard"); return; }
    const data = await res.json();
    setCls(data.class);
    setAssignments(data.assignments ?? []);
    setLocks(data.locks ?? []);
    setStudents(data.students ?? []);
    if ((data.studentIds ?? []).length) {
      const subs = await fetchTurtleSubmissionsForStudents(data.studentIds);
      setTurtleSubs(subs);
    }
    const turtleAssn = await fetchTurtleAssignments(classId);
    setTurtleAssigned(new Set(turtleAssn));
    const bridgeRes = await fetch(`/api/teacher/bridge-assignments?classId=${classId}`);
    if (bridgeRes.ok) setBridgeAssignments(await bridgeRes.json());
    const allClassesRes = await fetch("/api/teacher/classes");
    if (allClassesRes.ok) {
      const allClasses: Class[] = await allClassesRes.json();
      setOtherClasses(allClasses.filter(c => c.id !== data.class.id));
    }
    setLoading(false);
  }

  async function handleCreateBridgeAssignment() {
    const maxCostNum = parseFloat(Number(bridgeForm.maxCost).toFixed(2));
    if (!bridgeForm.maxCost || isNaN(maxCostNum) || maxCostNum <= 0) {
      setBridgeFormError("Please enter a valid max cost (e.g. 5000).");
      return;
    }
    setBridgeFormSaving(true);
    setBridgeFormError("");
    const res = await fetch("/api/teacher/bridge-assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId,
        title: bridgeForm.title,
        spanFeet: bridgeForm.spanFeet,
        loadLb: bridgeForm.loadTon * 2000,
        maxCost: maxCostNum,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setBridgeAssignments(prev => [data, ...prev]);
      setShowBridgeForm(false);
      setBridgeForm({ title: "", spanFeet: 40, loadTon: 8, maxCost: "" });
    } else {
      const e = await res.json();
      setBridgeFormError(e.error ?? "Failed to create assignment");
    }
    setBridgeFormSaving(false);
  }

  async function loadOverallLeaderboard() {
    setLoadingLeaderboard(true);
    const res = await fetch("/api/teacher/bridge-overall-leaderboard");
    if (res.ok) setLeaderboardData(await res.json());
    setLoadingLeaderboard(false);
  }

  async function handleDeleteBridgeAssignment(id: string) {
    setDeletingBridgeId(id);
    const res = await fetch(`/api/teacher/bridge-assignments?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setBridgeAssignments(prev => prev.filter(a => a.id !== id));
      if (expandedBridgeId === id) setExpandedBridgeId(null);
    }
    setDeletingBridgeId(null);
  }

  async function toggleLeaderboard(id: string) {
    if (expandedBridgeId === id) { setExpandedBridgeId(null); return; }
    setExpandedBridgeId(id);
    if (bridgeLeaderboards[id]) return;
    setLoadingLeaderboardId(id);
    const res = await fetch(`/api/teacher/bridge-submissions?assignmentId=${id}`);
    if (res.ok) { const data = await res.json(); setBridgeLeaderboards(prev => ({ ...prev, [id]: data })); }
    setLoadingLeaderboardId(null);
  }

  async function toggleTurtleAssignment(challengeId: string) {
    if (turtleAssignSaving) return;
    setTurtleAssignSaving(challengeId);
    const isAssigned = turtleAssigned.has(challengeId);
    const ok = isAssigned
      ? await unassignTurtleChallenge(classId, challengeId)
      : await assignTurtleChallenge(classId, challengeId);
    if (ok) {
      setTurtleAssigned(prev => {
        const next = new Set(prev);
        if (isAssigned) next.delete(challengeId); else next.add(challengeId);
        return next;
      });
    }
    setTurtleAssignSaving(null);
  }

  async function handleApprove(id: string, approved: boolean | null) {
    await approveTurtleSubmission(id, approved);
    setTurtleSubs(prev => prev.map(s => s.id === id ? { ...s, approved } : s));
  }

  async function handleRename() {
    if (!cls || !editName.trim() || editName.trim() === cls.name) return;
    setRenameSaving(true);
    setRenameError("");
    const res = await fetch(`/api/teacher/classes/${classId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      setCls(data);
    } else {
      const e = await res.json();
      setRenameError(e.error ?? "Failed to rename");
    }
    setRenameSaving(false);
  }

  async function handleDeleteClass() {
    setDeletingClass(true);
    const res = await fetch(`/api/teacher/classes/${classId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/teachers/dashboard");
    } else {
      const e = await res.json();
      alert(e.error ?? "Failed to delete class");
      setDeletingClass(false);
      setConfirmDeleteClass(false);
    }
  }

  async function handleRemoveStudent(studentId: string) {
    setRemovingStudentId(studentId);
    const res = await fetch(`/api/teacher/classes/${classId}?studentId=${studentId}`, { method: "DELETE" });
    if (res.ok) {
      setStudents(prev => prev.filter(s => s.id !== studentId));
      setGrades(prev => {
        const updated = { ...prev };
        for (const tool of Object.keys(updated)) {
          if (updated[tool]) {
            updated[tool] = {
              ...updated[tool]!,
              students: updated[tool]!.students.filter(s => s.id !== studentId),
            };
          }
        }
        return updated;
      });
    }
    setRemovingStudentId(null);
  }

  async function toggleLevel(tool: string, levelId: number) {
    if (!cls || saving) return;
    setSaving(true);
    const existing = assignments.find(a => a.tool === tool && a.level_id === levelId);
    if (existing) {
      await fetch(`/api/teacher/assignments?id=${existing.id}`, { method: "DELETE" });
      setAssignments(prev => prev.filter(a => a.id !== existing.id));
      // Remove any per-challenge locks for this level
      const locksToDelete = locks.filter(l => l.tool === tool && l.level_idx === levelId);
      await Promise.all(locksToDelete.map(l => fetch(`/api/teacher/locks?id=${l.id}`, { method: "DELETE" })));
      setLocks(prev => prev.filter(l => !(l.tool === tool && l.level_idx === levelId)));
      // Re-lock this level if Lock All is active (other levels still have level locks)
      const lockAllActive = locks.some(l => l.tool === tool && l.level_idx !== levelId && l.challenge_idx === -1);
      if (lockAllActive) {
        const res = await fetch("/api/teacher/locks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: cls.id, tool, levelIdx: levelId, challengeIdx: -1 }),
        });
        if (res.ok) {
          const data = await res.json();
          setLocks(prev => [...prev, data]);
        }
      }
    } else {
      const res = await fetch("/api/teacher/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: cls.id, tool, levelId }),
      });
      const data = await res.json();
      if (res.ok) {
        setAssignments(prev => [...prev, data].sort((a, b) => a.level_id - b.level_id));
        // Assigning a level should also remove its lock so students can access it
        const existingLock = locks.find(l => l.tool === tool && l.level_idx === levelId && l.challenge_idx === -1);
        if (existingLock) {
          await fetch(`/api/teacher/locks?id=${existingLock.id}`, { method: "DELETE" });
          setLocks(prev => prev.filter(l => l.id !== existingLock.id));
        }
        if (otherClasses.length > 0) {
          setMultiAssignSelected(new Set(otherClasses.map(c => c.id)));
          setMultiAssignModal({ tool, levelId });
        }
      }
    }
    fetchedRef.current.delete(tool);
    setGrades(prev => { const n = { ...prev }; delete n[tool]; return n; });
    setSaving(false);
  }

  async function handleMultiAssign() {
    if (!multiAssignModal || multiAssignSelected.size === 0) { setMultiAssignModal(null); return; }
    setMultiAssigning(true);
    const { tool, levelId } = multiAssignModal;
    await Promise.all(
      [...multiAssignSelected].map(cid =>
        fetch("/api/teacher/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: cid, tool, levelId }),
        }),
      ),
    );
    setMultiAssigning(false);
    setMultiAssignModal(null);
  }

  async function toggleLevelLock(tool: string, levelIdx: number) {
    if (!cls || saving) return;
    setLockError(null);
    setSaving(true);
    try {
      const existing = locks.find(
        l => l.tool === tool && l.level_idx === levelIdx && l.challenge_idx === -1,
      );
      if (existing) {
        const res = await fetch(`/api/teacher/locks?id=${existing.id}`, { method: "DELETE" });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? res.statusText); }
        setLocks(prev => prev.filter(l => l.id !== existing.id));
      } else {
        const res = await fetch("/api/teacher/locks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: cls.id, tool, levelIdx, challengeIdx: -1 }),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.error ?? res.statusText); }
        const data = await res.json();
        setLocks(prev => [...prev, data]);
      }
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Lock failed");
    } finally {
      setSaving(false);
    }
  }

  async function lockAllTool(tool: string) {
    if (!cls || saving) return;

    const allIdxs = tool === "code-lab"
      ? LEVELS.map((_, i) => i)
      : tool === "block-lab"
      ? UNITS.map((_, i) => i)
      : tool === "turtle"
      ? Array.from({ length: TURTLE_CHALLENGES.filter(c => c.category === "challenge").length }, (_, i) => i)
      : [];
    if (!allIdxs.length) return;

    const allLocked = allIdxs.every(idx =>
      locks.some(l => l.tool === tool && l.level_idx === idx && l.challenge_idx === -1),
    );

    setLockError(null);
    setSaving(true);
    try {
      if (allLocked) {
        const toDelete = locks.filter(l => l.tool === tool && l.challenge_idx === -1);
        const results = await Promise.all(
          toDelete.map(l => fetch(`/api/teacher/locks?id=${l.id}`, { method: "DELETE" })),
        );
        const failed = results.find(r => !r.ok);
        if (failed) { const e = await failed.json(); throw new Error(e.error ?? failed.statusText); }
        setLocks(prev => prev.filter(l => !(l.tool === tool && l.challenge_idx === -1)));
      } else {
        const unlockedIdxs = allIdxs.filter(idx =>
          !locks.some(l => l.tool === tool && l.level_idx === idx && l.challenge_idx === -1),
        );
        const responses = await Promise.all(
          unlockedIdxs.map(idx =>
            fetch("/api/teacher/locks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ classId: cls!.id, tool, levelIdx: idx, challengeIdx: -1 }),
            }),
          ),
        );
        const failed = responses.find(r => !r.ok);
        if (failed) { const e = await failed.json(); throw new Error(e.error ?? failed.statusText); }
        const newLocks = await Promise.all(responses.map(r => r.json()));
        setLocks(prev => [...prev, ...newLocks]);
      }
    } catch (err) {
      setLockError(err instanceof Error ? err.message : "Lock failed");
    } finally {
      setSaving(false);
    }
  }

  function renderGradebook(
    tool: "code-lab" | "block-lab",
    levelMeta: Array<{ id: number; title: string; color: string }>,
    csvFilename: string,
  ) {
    const data = grades[tool];

    if (loadingGrades && !data) {
      return <div style={{ padding: "32px 0", textAlign: "center", color: "#888", fontSize: 14 }}>Loading gradebook…</div>;
    }
    if (!data || data.assignedLevelIds.length === 0) {
      return (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          No levels assigned yet — use the chips above to assign levels to this class.
        </div>
      );
    }
    if (data.students.length === 0) {
      return (
        <div style={{ padding: "48px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎒</div>
          No students enrolled yet.
        </div>
      );
    }

    const { students: gbStudents, assignedLevelIds } = data;

    function exportCSV() {
      const header = ["Student", "Email"];
      for (const li of assignedLevelIds) {
        const meta = levelMeta[li];
        if (!meta) continue;
        header.push(`${meta.title} — Challenges`, `${meta.title} — Quiz`);
      }
      const rows: string[][] = [header];
      for (const s of gbStudents) {
        const row = [s.name, s.email];
        for (const li of assignedLevelIds) {
          const lv = s.levels[li];
          row.push(
            lv ? `${lv.challengesDone}/${lv.challengesTotal}` : "0/0",
            lv?.quizScore !== null && lv?.quizScore !== undefined ? `${lv.quizScore}/${lv.quizTotal}` : "—",
          );
        }
        rows.push(row);
      }
      downloadCSV(rows, csvFilename);
    }

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 14, color: "#555" }}>
              {gbStudents.length} student{gbStudents.length !== 1 ? "s" : ""} · {assignedLevelIds.length} level{assignedLevelIds.length !== 1 ? "s" : ""} assigned
            </div>
          </div>
          <button onClick={exportCSV}
            style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid #2563eb",
              background: "#eff6ff", color: "#2563eb", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ↓ Export CSV
          </button>
        </div>
        <div style={{ overflowX: "auto", borderRadius: 12, border: "2px solid #e5e7eb" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }}>Student</th>
                {assignedLevelIds.map(li => {
                  const meta = levelMeta[li];
                  if (!meta) return null;
                  return (
                    <th key={li} colSpan={2}
                      style={{ ...TH, borderLeft: `4px solid ${meta.color}`, textAlign: "center", paddingLeft: 16, background: `${meta.color}08` }}>
                      <div style={{ color: meta.color, fontWeight: 900 }}>{meta.title}</div>
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }} />
                {assignedLevelIds.map(li => {
                  const meta = levelMeta[li];
                  if (!meta) return null;
                  return [
                    <th key={`${li}-ch`} style={{ ...TH, borderLeft: `4px solid ${meta.color}30`, color: "#666", fontWeight: 700, background: `${meta.color}05` }}>
                      Challenges
                    </th>,
                    <th key={`${li}-qz`} style={{ ...TH, color: "#666", fontWeight: 700, background: `${meta.color}05` }}>Quiz</th>,
                  ];
                })}
              </tr>
            </thead>
            <tbody>
              {gbStudents.map((s, si) => (
                <tr key={s.id} style={{ background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={{ ...NAME_TD, background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
                  </td>
                  {assignedLevelIds.map(li => {
                    const meta = levelMeta[li];
                    if (!meta) return null;
                    const lv = s.levels[li];
                    const chDone = lv?.challengesDone ?? 0;
                    const chTotal = lv?.challengesTotal ?? 0;
                    const chAllDone = chTotal > 0 && chDone === chTotal;
                    const chPartial = chDone > 0 && chDone < chTotal;
                    const quizScore = lv?.quizScore ?? null;
                    const quizTotal = lv?.quizTotal ?? 0;
                    const quizPassed = quizScore !== null && quizTotal > 0 && quizScore >= Math.ceil(quizTotal * 0.7);
                    return [
                      <td key={`${li}-ch`} style={{ ...TD, borderLeft: `4px solid ${meta.color}30` }}>
                        <span style={{
                          display: "inline-block", padding: "2px 8px", borderRadius: 6,
                          fontWeight: 700, fontSize: 13,
                          background: chAllDone ? "#dcfce7" : chPartial ? "#fef9c3" : "#f3f4f6",
                          color: chAllDone ? "#166534" : chPartial ? "#854d0e" : "#6b7280",
                        }}>
                          {chDone}/{chTotal}
                        </span>
                      </td>,
                      <td key={`${li}-qz`} style={TD}>
                        {quizScore !== null ? (
                          <span style={{
                            display: "inline-block", padding: "2px 8px", borderRadius: 6,
                            fontWeight: 700, fontSize: 13,
                            background: quizPassed ? "#dcfce7" : "#fee2e2",
                            color: quizPassed ? "#166534" : "#991b1b",
                          }}>
                            {quizScore}/{quizTotal}
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                        )}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderBridgeGradebook() {
    if (loadingBridgeGradebook) {
      return <div style={{ padding: "32px 0", textAlign: "center", color: "#888", fontSize: 14 }}>Loading gradebook…</div>;
    }
    if (bridgeAssignments.length === 0) return null;

    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
    if (sorted.length === 0) {
      return (
        <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🎒</div>
          No students enrolled yet.
        </div>
      );
    }

    function exportBridgeCSV() {
      const header = ["Student", "Email", ...bridgeAssignments.map(a => `${a.title || "Bridge Assignment"} — Passed`), ...bridgeAssignments.map(a => `${a.title || "Bridge Assignment"} — Cost`)];
      const rows: string[][] = [header];
      for (const s of sorted) {
        const row = [s.name, s.email];
        for (const a of bridgeAssignments) {
          const cell = bridgeSubmissionMap[s.id]?.[a.id];
          row.push(cell ? (cell.passed ? "Yes" : "No") : "—");
        }
        for (const a of bridgeAssignments) {
          const cell = bridgeSubmissionMap[s.id]?.[a.id];
          row.push(cell ? `$${cell.cost.toFixed(2)}` : "—");
        }
        rows.push(row);
      }
      downloadCSV(rows, `bridge-gradebook-${classId}.csv`);
    }

    return (
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 14, color: "#555" }}>
            {sorted.length} student{sorted.length !== 1 ? "s" : ""} · {bridgeAssignments.length} assignment{bridgeAssignments.length !== 1 ? "s" : ""}
          </div>
          <button onClick={exportBridgeCSV}
            style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid #d97706",
              background: "#fffbeb", color: "#92400e", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
            ↓ Export CSV
          </button>
        </div>
        <div style={{ overflowX: "auto", borderRadius: 12, border: "2px solid #fde68a" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400 }}>
            <thead>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: "#fef9c3", zIndex: 2 }}>Student</th>
                {bridgeAssignments.map(a => (
                  <th key={a.id} colSpan={3}
                    style={{ ...TH, borderLeft: "4px solid #d97706", textAlign: "center", paddingLeft: 16, background: "#fef9c308" }}>
                    <div style={{ color: "#92400e", fontWeight: 900 }}>{a.title || "Bridge Assignment"}</div>
                    <div style={{ fontSize: 10, color: "#888", fontWeight: 600, marginTop: 2 }}>
                      {a.span_feet} ft · {a.load_lb / 2000} ton · ${Number(a.max_cost).toFixed(0)} budget
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                <th style={{ ...TH, ...NAME_TD, background: "#fef9c3", zIndex: 2 }} />
                {bridgeAssignments.map(a => [
                  <th key={`${a.id}-pass`} style={{ ...TH, borderLeft: "4px solid #d97706" + "30", color: "#666", fontWeight: 700, background: "#fef9c305", textAlign: "center" }}>Result</th>,
                  <th key={`${a.id}-design`} style={{ ...TH, color: "#666", fontWeight: 700, background: "#fef9c305", textAlign: "center" }}>Design</th>,
                  <th key={`${a.id}-cost`} style={{ ...TH, color: "#666", fontWeight: 700, background: "#fef9c305", textAlign: "right" }}>Cost</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, si) => (
                <tr key={s.id} style={{ background: si % 2 === 0 ? "#fff" : "#fffdf5" }}>
                  <td style={{ ...NAME_TD, background: si % 2 === 0 ? "#fff" : "#fffdf5" }}>
                    <div style={{ fontWeight: 700, color: "#111" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
                  </td>
                  {bridgeAssignments.map(a => {
                    const cell = bridgeSubmissionMap[s.id]?.[a.id];
                    return [
                      <td key={`${a.id}-pass`} style={{ ...TD, borderLeft: "4px solid #d97706" + "30", textAlign: "center" }}>
                        {cell ? (
                          <span style={{
                            display: "inline-block", padding: "2px 10px", borderRadius: 6,
                            fontWeight: 800, fontSize: 12,
                            background: cell.passed ? "#dcfce7" : "#fee2e2",
                            color: cell.passed ? "#166534" : "#991b1b",
                          }}>
                            {cell.passed ? "✓ Pass" : "✗ Fail"}
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                        )}
                      </td>,
                      <td key={`${a.id}-design`} style={{ ...TD, textAlign: "center" }}>
                        {cell?.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cell.thumbnail} alt="Bridge design"
                            style={{ width: 96, height: 56, objectFit: "contain", display: "inline-block",
                              borderRadius: 4, border: "1px solid #fde68a", background: "#fff" }} />
                        ) : cell ? (
                          <span style={{ color: "#ccc", fontSize: 11, fontStyle: "italic" }}>no preview</span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                        )}
                      </td>,
                      <td key={`${a.id}-cost`} style={{ ...TD, textAlign: "right" }}>
                        {cell ? (
                          <span style={{
                            fontWeight: 700, fontSize: 13,
                            color: cell.cost <= Number(a.max_cost) ? "#166534" : "#991b1b",
                          }}>
                            ${cell.cost.toFixed(2)}
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                        )}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderAssignChips(
    tool: "code-lab" | "block-lab",
    items: Array<{ id: number; title: string; color: string }>,
    assignedSet: Set<number>,
  ) {
    const label = tool === "code-lab" ? "Level" : "Unit";
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {items.map((item, idx) => {
          const assigned = assignedSet.has(idx);
          const isLevelLocked = locks.some(l => l.tool === tool && l.level_idx === idx && l.challenge_idx === -1);
          const borderColor = isLevelLocked ? "#16a34a" : assigned ? item.color : "#d1d5db";
          const bg = isLevelLocked ? "#dcfce7" : assigned ? `${item.color}18` : "#f9fafb";
          const color = isLevelLocked ? "#166534" : assigned ? item.color : "#6b7280";
          return (
            <button key={idx}
              onClick={() => { if (assigned && isLevelLocked) toggleLevelLock(tool, idx); else toggleLevel(tool, idx); }}
              disabled={saving}
              title={isLevelLocked ? "Unlock for students" : assigned ? "Click to unassign" : "Click to assign"}
              style={{ padding: "8px 16px", borderRadius: 99, border: `2px solid ${borderColor}`,
                background: bg, color, fontWeight: 800, fontSize: 13,
                cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6,
                opacity: saving ? 0.6 : 1, transition: "all 120ms" }}>
              <span>{isLevelLocked ? "🔒" : assigned ? "✓" : "+"}</span>
              {label} {item.id} — {item.title}
            </button>
          );
        })}
      </div>
    );
  }

  if (status === "loading" || loading || !cls) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  const assignedCodeLab  = new Set(assignments.filter(a => a.tool === "code-lab").map(a => a.level_id));
  const assignedBlockLab = new Set(assignments.filter(a => a.tool === "block-lab").map(a => a.level_id));

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
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "48px 40px" }}>

          {/* Class header */}
          <div style={{ ...CARD, padding: "22px 28px", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 10px" }}>{cls.name}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ background: "#f0f4ff", border: "2px solid #c7d7fd", borderRadius: 10,
                    padding: "6px 16px", display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#3730a3",
                      textTransform: "uppercase", letterSpacing: "0.6px" }}>Join Code</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: "#2563eb",
                      letterSpacing: "3px", fontFamily: "monospace" }}>{cls.join_code}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>
                    {students.length} student{students.length !== 1 ? "s" : ""} enrolled
                  </span>
                </div>
              </div>
              <button
                onClick={() => { setShowSettings(s => !s); setEditName(cls.name); setRenameError(""); setConfirmDeleteClass(false); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "2px solid #e5e7eb",
                  background: showSettings ? "#f3f4f6" : "#fff", color: "#374151",
                  fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                ⚙ {showSettings ? "Close Settings" : "Class Settings"}
              </button>
            </div>

            {/* Settings panel */}
            {showSettings && (
              <div style={{ marginTop: 24, borderTop: "2px solid #f0f0f0", paddingTop: 24,
                display: "flex", flexDirection: "column", gap: 28 }}>

                {/* Rename */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#111", marginBottom: 10 }}>Rename Class</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={editName}
                      onChange={e => { setEditName(e.target.value); setRenameError(""); }}
                      onKeyDown={e => e.key === "Enter" && handleRename()}
                      maxLength={80}
                      style={{ flex: 1, maxWidth: 340, padding: "10px 14px", borderRadius: 10,
                        border: renameError ? "2px solid #dc2626" : "2px solid #e0e0e0",
                        fontSize: 15, fontWeight: 700, color: "#111", outline: "none" }}
                    />
                    <button
                      onClick={handleRename}
                      disabled={renameSaving || !editName.trim() || editName.trim() === cls.name}
                      style={{ padding: "10px 20px", borderRadius: 10, border: "none",
                        background: (!editName.trim() || editName.trim() === cls.name) ? "#e5e7eb" : "#2563eb",
                        color: (!editName.trim() || editName.trim() === cls.name) ? "#9ca3af" : "#fff",
                        fontWeight: 800, fontSize: 14,
                        cursor: (!editName.trim() || editName.trim() === cls.name) ? "not-allowed" : "pointer" }}>
                      {renameSaving ? "Saving…" : "Save Name"}
                    </button>
                  </div>
                  {renameError && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 6 }}>{renameError}</div>}
                </div>

                {/* Student roster */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#111", marginBottom: 10 }}>
                    Students ({students.length})
                  </div>
                  {students.length === 0 ? (
                    <div style={{ fontSize: 13, color: "#aaa", fontStyle: "italic" }}>No students enrolled yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 560 }}>
                      {students.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb", background: "#fafafa" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{s.name}</div>
                            <div style={{ fontSize: 12, color: "#888" }}>{s.email}</div>
                          </div>
                          <button
                            onClick={() => handleRemoveStudent(s.id)}
                            disabled={removingStudentId === s.id}
                            style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid #fca5a5",
                              background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: 12,
                              cursor: removingStudentId === s.id ? "not-allowed" : "pointer",
                              opacity: removingStudentId === s.id ? 0.6 : 1 }}>
                            {removingStudentId === s.id ? "Removing…" : "✕ Remove"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Danger zone */}
                <div style={{ borderTop: "2px solid #fee2e2", paddingTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", marginBottom: 10 }}>Danger Zone</div>
                  {!confirmDeleteClass ? (
                    <button
                      onClick={() => setConfirmDeleteClass(true)}
                      style={{ padding: "10px 20px", borderRadius: 10, border: "2px solid #dc2626",
                        background: "#fff", color: "#dc2626", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
                      🗑 Delete This Class
                    </button>
                  ) : (
                    <div style={{ background: "#fef2f2", border: "2px solid #fca5a5", borderRadius: 12,
                      padding: "16px 20px", maxWidth: 480 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#111", marginBottom: 6 }}>
                        Are you sure? This will permanently delete <strong>{cls.name}</strong> and remove all students and assignments.
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                        <button onClick={() => setConfirmDeleteClass(false)}
                          style={{ padding: "8px 20px", borderRadius: 8, border: "2px solid #e5e7eb",
                            background: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", color: "#555" }}>
                          Cancel
                        </button>
                        <button onClick={handleDeleteClass} disabled={deletingClass}
                          style={{ padding: "8px 20px", borderRadius: 8, border: "none",
                            background: deletingClass ? "#fca5a5" : "#dc2626", color: "#fff",
                            fontWeight: 800, fontSize: 13, cursor: deletingClass ? "not-allowed" : "pointer" }}>
                          {deletingClass ? "Deleting…" : "Yes, Delete Class"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

          {/* Tool selector */}
          <div style={{ display: "flex", gap: 14, marginBottom: 28, flexWrap: "wrap" }}>
            {([
              { id: "code-lab"    as const, label: "Python Code Lab",  icon: "🐍", color: "#2563eb", desc: "Maze challenges" },
              { id: "block-lab"  as const, label: "Block Lab",         icon: "🧩", color: "#7c3aed", desc: "Visual block coding" },
              { id: "bridge"     as const, label: "Bridge Builder",    icon: "🌉", color: "#d97706", desc: "Structural engineering" },
              { id: "turtle"     as const, label: "Turtle Challenges", icon: "🐢", color: "#059669", desc: "Creative drawing review" },
              { id: "stem-sketch" as const, label: "STEM Sketch",      icon: "✏️", color: "#0891b2", desc: "3D design & print" },
            ] as const).map(tool => {
              const active = selectedTool === tool.id;
              const hasLockControl = tool.id === "code-lab" || tool.id === "block-lab" || tool.id === "turtle";
              const turtleChallengeCount = TURTLE_CHALLENGES.filter(c => c.category === "challenge").length;
              const toolAllIdxs = tool.id === "code-lab" ? LEVELS.map((_, i) => i) : tool.id === "block-lab" ? UNITS.map((_, i) => i) : tool.id === "turtle" ? Array.from({ length: turtleChallengeCount }, (_, i) => i) : [];
              const allToolLocked = hasLockControl && toolAllIdxs.length > 0 && toolAllIdxs.every(idx =>
                locks.some(l => l.tool === tool.id && l.level_idx === idx && l.challenge_idx === -1),
              );
              return (
                <div key={tool.id} onClick={() => setSelectedTool(tool.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 22px",
                    borderRadius: 16, border: `3px solid ${active ? tool.color : "rgba(255,255,255,0.6)"}`,
                    background: active ? "rgba(255,255,255,0.97)" : "rgba(255,255,255,0.55)",
                    cursor: "pointer", transition: "all 150ms", userSelect: "none",
                    boxShadow: active ? "0 4px 16px rgba(0,0,0,0.15)" : "none" }}>
                  <span style={{ fontSize: 28 }}>{tool.icon}</span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: active ? tool.color : "#444" }}>{tool.label}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{tool.desc}</div>
                  </div>
                  {!hasLockControl && active && <div style={{ width: 8, height: 8, borderRadius: 999, background: tool.color, marginLeft: 4 }} />}
                  {hasLockControl && (
                    <div onClick={e => { e.stopPropagation(); lockAllTool(tool.id); }}
                      style={{ marginLeft: 4, padding: "5px 11px", borderRadius: 8,
                        border: `2px solid ${allToolLocked ? "#16a34a" : "#dc2626"}`,
                        background: allToolLocked ? "#dcfce7" : "#fee2e2",
                        color: allToolLocked ? "#166534" : "#dc2626",
                        fontWeight: 800, fontSize: 10, cursor: saving ? "not-allowed" : "pointer",
                        lineHeight: 1.3, textAlign: "center", whiteSpace: "nowrap" }}>
                      {allToolLocked ? "🔓 Unlock All" : "🔒 Lock All"}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Lock error banner */}
          {lockError && (
            <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 10,
              background: "#fee2e2", border: "2px solid #fca5a5",
              color: "#991b1b", fontSize: 13, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>⚠️ Lock error: {lockError}</span>
              <button onClick={() => setLockError(null)}
                style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontSize: 16, fontWeight: 900 }}>✕</button>
            </div>
          )}

          {/* ── Code Lab panel ─────────────────────────────────────────────────────── */}
          {selectedTool === "code-lab" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ ...CARD, padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: 0 }}>Assign Levels</h2>
                    <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
                      Click to assign · Use <strong>🔒 Lock All</strong> on the tab to restrict access
                    </p>
                  </div>
                </div>
                {renderAssignChips("code-lab", LEVELS.map(l => ({ id: l.id, title: l.title, color: l.color })), assignedCodeLab)}
              </div>

              <div style={{ ...CARD, padding: "24px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#2563eb", marginBottom: 16 }}>Student Progress — Python Code Lab</h2>
                {renderGradebook(
                  "code-lab",
                  LEVELS.map(l => ({ id: l.id, title: l.title, color: l.color })),
                  `${cls.name} — Python Code Lab.csv`,
                )}
              </div>
            </div>
          )}

          {/* ── Block Lab panel ────────────────────────────────────────────────────── */}
          {selectedTool === "block-lab" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ ...CARD, padding: "20px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <h2 style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: 0 }}>Assign Units</h2>
                    <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
                      Click to assign · Use <strong>🔒 Lock All</strong> on the tab to restrict access
                    </p>
                  </div>
                </div>
                {renderAssignChips("block-lab", UNITS.map(u => ({ id: u.id, title: u.title, color: u.color })), assignedBlockLab)}
              </div>

              <div style={{ ...CARD, padding: "24px 28px" }}>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#7c3aed", marginBottom: 16 }}>Student Progress — Block Lab</h2>
                {renderGradebook(
                  "block-lab",
                  UNITS.map(u => ({ id: u.id, title: u.title, color: u.color })),
                  `${cls.name} — Block Lab.csv`,
                )}
              </div>
            </div>
          )}

          {/* ── Turtle panel ───────────────────────────────────────────────────────── */}
          {selectedTool === "turtle" && (() => {
            const tutorials = TURTLE_CHALLENGES.filter(c => c.category === "tutorial");
            const challenges = TURTLE_CHALLENGES.filter(c => c.category === "challenge");
            const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name));

            function exportTurtleCSV() {
              const header = ["Student", "Email",
                ...tutorials.map(c => `${c.title}`),
                ...challenges.map(c => `${c.title} — Status`)];
              const rows: string[][] = [header];
              for (const s of sortedStudents) {
                const row = [s.name, s.email];
                for (const ch of tutorials) {
                  const sub = turtleSubs.find(x => x.user_id === s.id && x.challenge_id === ch.id);
                  row.push(sub ? "Completed" : "—");
                }
                for (const ch of challenges) {
                  const sub = turtleSubs.find(x => x.user_id === s.id && x.challenge_id === ch.id);
                  row.push(
                    !sub ? "No submission"
                    : sub.approved === true ? "Approved"
                    : sub.approved === false ? "Needs revision"
                    : "Pending review",
                  );
                }
                rows.push(row);
              }
              downloadCSV(rows, `${cls!.name} — Turtle.csv`);
            }

            const ChipRow = ({ items, color }: { items: typeof tutorials; color: string }) => (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {items.map(ch => {
                  const isAssigned = turtleAssigned.has(ch.id);
                  const isSaving = turtleAssignSaving === ch.id;
                  return (
                    <button key={ch.id} onClick={() => toggleTurtleAssignment(ch.id)} disabled={isSaving}
                      style={{
                        padding: "6px 12px", borderRadius: 999,
                        border: `2px solid ${isAssigned ? color : "#e5e7eb"}`,
                        background: isAssigned ? color : "#fff",
                        color: isAssigned ? "#fff" : "#374151",
                        fontWeight: 700, fontSize: 12, cursor: isSaving ? "wait" : "pointer",
                        opacity: isSaving ? 0.6 : 1, whiteSpace: "nowrap",
                      }}>
                      {isAssigned ? "✓ " : "+ "}{ch.title}
                    </button>
                  );
                })}
              </div>
            );

            const assignedTutorials = tutorials.filter(c => turtleAssigned.has(c.id));
            const assignedChallenges = challenges.filter(c => turtleAssigned.has(c.id));
            const anyAssigned = assignedTutorials.length + assignedChallenges.length > 0;

            return (
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "#059669" }}>Python Turtle</h2>
                  <button onClick={exportTurtleCSV}
                    style={{ padding: "8px 18px", borderRadius: 10, border: "2px solid #059669",
                      background: "#ecfdf5", color: "#059669", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                    ↓ Export CSV
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                  Click a chip to assign a tutorial or creative challenge to this class. Assigned items appear in the gradebook below.
                </p>

                {/* Assignment chips */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#3b82f6",
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Tutorials
                  </div>
                  <ChipRow items={tutorials} color="#3b82f6" />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#8b5cf6",
                    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                    Creative Challenges
                  </div>
                  <ChipRow items={challenges} color="#8b5cf6" />
                </div>

                {students.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                    No students enrolled yet.
                  </div>
                ) : !anyAssigned ? (
                  <div style={{ textAlign: "center", padding: "32px 16px", color: "#888", fontSize: 13,
                    background: "#f9fafb", borderRadius: 12, border: "2px dashed #e5e7eb" }}>
                    Assign at least one tutorial or challenge above to see student progress.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto", borderRadius: 12, border: "2px solid #e5e7eb" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }}>Student</th>
                          {assignedTutorials.length > 0 && (
                            <th colSpan={assignedTutorials.length}
                              style={{ ...TH, borderLeft: "4px solid #3b82f6", textAlign: "center",
                                background: "#eff6ff", color: "#1e40af" }}>
                              Tutorials
                            </th>
                          )}
                          {assignedChallenges.length > 0 && (
                            <th colSpan={assignedChallenges.length}
                              style={{ ...TH, borderLeft: "4px solid #8b5cf6", textAlign: "center",
                                background: "#f5f3ff", color: "#5b21b6" }}>
                              Creative Challenges
                            </th>
                          )}
                        </tr>
                        <tr>
                          <th style={{ ...TH, ...NAME_TD, background: "#f9fafb", zIndex: 2 }} />
                          {assignedTutorials.map((ch, i) => (
                            <th key={ch.id} style={{ ...TH, textAlign: "center", minWidth: 90,
                              borderLeft: i === 0 ? "4px solid #3b82f6" : undefined,
                              background: "#eff6ff05" }}>
                              {ch.title.replace(/^\d+\.\s*/, "")}
                            </th>
                          ))}
                          {assignedChallenges.map((ch, i) => (
                            <th key={ch.id} style={{ ...TH, textAlign: "center", minWidth: 148,
                              borderLeft: i === 0 ? "4px solid #8b5cf6" : undefined,
                              background: "#f5f3ff05" }}>
                              {ch.title}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedStudents.map((s, si) => (
                          <tr key={s.id} style={{ background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                            <td style={{ ...NAME_TD, background: si % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <div style={{ fontWeight: 700, color: "#111" }}>{s.name}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{s.email}</div>
                            </td>
                            {assignedTutorials.map((ch, i) => {
                              const sub = turtleSubs.find(x => x.user_id === s.id && x.challenge_id === ch.id);
                              return (
                                <td key={ch.id} style={{ ...TD, textAlign: "center", verticalAlign: "middle",
                                  borderLeft: i === 0 ? "4px solid #3b82f6" : undefined }}>
                                  {sub ? (
                                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999,
                                      background: "#dcfce7", color: "#166534", fontWeight: 800, fontSize: 12 }}>
                                      ✓ Done
                                    </span>
                                  ) : (
                                    <span style={{ color: "#ccc", fontSize: 13 }}>—</span>
                                  )}
                                </td>
                              );
                            })}
                            {assignedChallenges.map((ch, i) => {
                              const sub = turtleSubs.find(x => x.user_id === s.id && x.challenge_id === ch.id);
                              if (!sub) {
                                return (
                                  <td key={ch.id} style={{ ...TD, textAlign: "center", verticalAlign: "middle", color: "#ccc",
                                    borderLeft: i === 0 ? "4px solid #8b5cf6" : undefined }}>
                                    —
                                  </td>
                                );
                              }
                              const borderColor = sub.approved === true ? "#10b981"
                                : sub.approved === false ? "#dc2626" : "#d1d5db";
                              const statusLabel = sub.approved === true ? "Approved"
                                : sub.approved === false ? "Needs revision" : "Pending";
                              const statusColor = sub.approved === true ? "#166534"
                                : sub.approved === false ? "#991b1b" : "#92400e";
                              const statusBg = sub.approved === true ? "#dcfce7"
                                : sub.approved === false ? "#fee2e2" : "#fef9c3";
                              return (
                                <td key={ch.id} style={{ ...TD, textAlign: "center", verticalAlign: "middle",
                                  borderLeft: i === 0 ? "4px solid #8b5cf6" : undefined }}>
                                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <div style={{ border: `3px solid ${borderColor}`, borderRadius: 8, overflow: "hidden",
                                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={sub.image_data} alt={s.name} width={108} height={108} style={{ display: "block" }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px",
                                      borderRadius: 999, background: statusBg, color: statusColor }}>
                                      {statusLabel}
                                    </span>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button onClick={() => handleApprove(sub.id, sub.approved === true ? null : true)}
                                        style={{ padding: "4px 10px", borderRadius: 6, border: "none",
                                          background: sub.approved === true ? "#10b981" : "#e5e7eb",
                                          color: sub.approved === true ? "#fff" : "#555",
                                          fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✓</button>
                                      <button onClick={() => handleApprove(sub.id, sub.approved === false ? null : false)}
                                        style={{ padding: "4px 10px", borderRadius: 6, border: "none",
                                          background: sub.approved === false ? "#dc2626" : "#e5e7eb",
                                          color: sub.approved === false ? "#fff" : "#555",
                                          fontWeight: 800, fontSize: 13, cursor: "pointer" }}>✗</button>
                                    </div>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Bridge Builder panel ───────────────────────────────────────────────── */}
          {selectedTool === "bridge" && (
            <div style={{ ...CARD, padding: "28px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "#d97706", margin: 0 }}>Bridge Assignments</h2>
                  <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
                    Students open the bridge builder with pre-set span, load, and cost targets.
                  </p>
                </div>
                <button
                  onClick={() => { setShowBridgeForm(v => !v); setBridgeFormError(""); }}
                  style={{ padding: "10px 20px", borderRadius: 10, border: "2px solid #d97706",
                    background: showBridgeForm ? "#fef3c7" : "#fff", color: "#92400e",
                    fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                  {showBridgeForm ? "✕ Cancel" : "+ New Assignment"}
                </button>
              </div>

              {showBridgeForm && (
                <div style={{ background: "#fffbeb", border: "2px solid #fde68a", borderRadius: 14,
                  padding: "20px 22px", marginBottom: 24 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e", marginBottom: 14 }}>Create Bridge Assignment</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                      Title (optional)
                      <input
                        value={bridgeForm.title}
                        onChange={e => setBridgeForm(f => ({ ...f, title: e.target.value }))}
                        placeholder="e.g. River Crossing Challenge"
                        maxLength={80}
                        style={{ display: "block", width: "100%", marginTop: 4, padding: "9px 12px",
                          borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14,
                          fontWeight: 600, color: "#111", outline: "none", boxSizing: "border-box" }}
                      />
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                        Span
                        <select
                          value={bridgeForm.spanFeet}
                          onChange={e => setBridgeForm(f => ({ ...f, spanFeet: Number(e.target.value) as 20 | 40 | 60 | 80 | 100 }))}
                          style={{ display: "block", width: "100%", marginTop: 4, padding: "9px 10px",
                            borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14, fontWeight: 600 }}>
                          <option value={20}>20 ft</option>
                          <option value={40}>40 ft</option>
                          <option value={60}>60 ft</option>
                          <option value={80}>80 ft</option>
                          <option value={100}>100 ft</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                        Load
                        <select
                          value={bridgeForm.loadTon}
                          onChange={e => setBridgeForm(f => ({ ...f, loadTon: Number(e.target.value) as 8 | 15 | 30 }))}
                          style={{ display: "block", width: "100%", marginTop: 4, padding: "9px 10px",
                            borderRadius: 8, border: "2px solid #e0e0e0", fontSize: 14, fontWeight: 600 }}>
                          <option value={8}>8 Ton</option>
                          <option value={15}>15 Ton</option>
                          <option value={30}>30 Ton</option>
                        </select>
                      </label>
                    </div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: "#555" }}>
                      Max Total Cost ($)
                      <input
                        value={bridgeForm.maxCost}
                        onChange={e => { setBridgeForm(f => ({ ...f, maxCost: e.target.value })); setBridgeFormError(""); }}
                        placeholder="e.g. 5000 or 5000.00"
                        type="number"
                        min={0.01}
                        step={0.01}
                        style={{ display: "block", width: "100%", marginTop: 4, padding: "9px 12px",
                          borderRadius: 8, border: bridgeFormError ? "2px solid #dc2626" : "2px solid #e0e0e0",
                          fontSize: 14, fontWeight: 600, color: "#111", outline: "none", boxSizing: "border-box" }}
                      />
                    </label>
                    {bridgeFormError && <div style={{ fontSize: 12, color: "#dc2626" }}>{bridgeFormError}</div>}
                    <button
                      onClick={handleCreateBridgeAssignment}
                      disabled={bridgeFormSaving}
                      style={{ padding: "11px 24px", borderRadius: 10, border: "none",
                        background: bridgeFormSaving ? "#fcd34d" : "#d97706",
                        color: "#fff", fontWeight: 800, fontSize: 14,
                        cursor: bridgeFormSaving ? "not-allowed" : "pointer", alignSelf: "flex-start" }}>
                      {bridgeFormSaving ? "Creating…" : "Create Assignment"}
                    </button>
                  </div>
                </div>
              )}

              {renderBridgeGradebook()}

              {bridgeAssignments.length > 0 && (
                <div style={{ borderTop: "2px solid #fde68a", margin: "4px 0 24px", opacity: 0.6 }} />
              )}

              {bridgeAssignments.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#aaa", fontSize: 14 }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🌉</div>
                  No bridge assignments yet — click <strong>+ New Assignment</strong> to create one.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {bridgeAssignments.map(a => {
                    const isExpanded = expandedBridgeId === a.id;
                    const leaderboard = bridgeLeaderboards[a.id] ?? [];
                    const isLoadingLb = loadingLeaderboardId === a.id;
                    const MEDALS = ["🥇", "🥈", "🥉"];
                    return (
                      <div key={a.id} style={{ borderRadius: 14, border: "2px solid #fde68a", background: "#fffbeb", overflow: "hidden" }}>
                        {/* Assignment header row */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "16px 18px", flexWrap: "wrap", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: "#92400e", marginBottom: 4 }}>
                              {a.title || "Bridge Assignment"}
                            </div>
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Span: {a.span_feet} ft</span>
                              <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Load: {a.load_lb / 2000} ton</span>
                              <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>Budget: ${Number(a.max_cost).toFixed(2)}</span>
                              <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                                ✓ {a.completionCount} student{a.completionCount !== 1 ? "s" : ""} passed
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => toggleLeaderboard(a.id)}
                              style={{ padding: "7px 16px", borderRadius: 8, border: "2px solid #d97706",
                                background: isExpanded ? "#d97706" : "#fff", color: isExpanded ? "#fff" : "#92400e",
                                fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                              {isExpanded ? "▲ Hide" : "🏆 Leaderboard"}
                            </button>
                            <button
                              onClick={() => handleDeleteBridgeAssignment(a.id)}
                              disabled={deletingBridgeId === a.id}
                              style={{ padding: "7px 16px", borderRadius: 8, border: "2px solid #fca5a5",
                                background: "#fff", color: "#dc2626", fontWeight: 700, fontSize: 12,
                                cursor: deletingBridgeId === a.id ? "not-allowed" : "pointer",
                                opacity: deletingBridgeId === a.id ? 0.6 : 1 }}>
                              {deletingBridgeId === a.id ? "Deleting…" : "✕ Delete"}
                            </button>
                          </div>
                        </div>

                        {/* Leaderboard panel */}
                        {isExpanded && (
                          <div style={{ borderTop: "2px solid #fde68a", padding: "20px 18px" }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: "#92400e", marginBottom: 14 }}>
                              🏆 Leaderboard — {a.title || "Bridge Assignment"}
                            </div>
                            {isLoadingLb ? (
                              <div style={{ color: "#888", fontSize: 13 }}>Loading…</div>
                            ) : leaderboard.length === 0 ? (
                              <div style={{ color: "#aaa", fontSize: 13, fontStyle: "italic" }}>
                                No submissions yet.
                              </div>
                            ) : (
                              <div style={{ overflowX: "auto", borderRadius: 10, border: "2px solid #fde68a" }}>
                                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 380 }}>
                                  <thead>
                                    <tr style={{ background: "#fef9c3" }}>
                                      <th style={{ ...TH, width: 48, textAlign: "center" }}>Rank</th>
                                      <th style={{ ...TH }}>Student</th>
                                      <th style={{ ...TH, textAlign: "right" }}>Cost</th>
                                      <th style={{ ...TH, textAlign: "right" }}>vs Budget</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {leaderboard.map((row, si) => {
                                      const savings = Number(a.max_cost) - row.cost;
                                      const savingsPct = Number(a.max_cost) > 0 ? (savings / Number(a.max_cost) * 100) : 0;
                                      return (
                                        <tr key={row.student_id} style={{ background: si % 2 === 0 ? "#fff" : "#fffbeb" }}>
                                          <td style={{ ...TD, textAlign: "center", fontSize: 18 }}>
                                            {MEDALS[si] ?? `#${row.rank}`}
                                          </td>
                                          <td style={{ ...TD }}>
                                            <div style={{ fontWeight: 700, color: "#111" }}>{row.name}</div>
                                            <div style={{ fontSize: 11, color: "#888" }}>{row.email}</div>
                                          </td>
                                          <td style={{ ...TD, textAlign: "right", fontWeight: 800,
                                            color: si === 0 ? "#d97706" : "#111" }}>
                                            ${row.cost.toFixed(2)}
                                          </td>
                                          <td style={{ ...TD, textAlign: "right" }}>
                                            <span style={{ fontSize: 12, fontWeight: 700,
                                              color: savings >= 0 ? "#16a34a" : "#dc2626" }}>
                                              {savings >= 0 ? `-$${savings.toFixed(2)}` : `+$${Math.abs(savings).toFixed(2)}`}
                                              <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>
                                                ({savingsPct.toFixed(0)}% saved)
                                              </span>
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Overall Bridge Leaderboard — all teacher classes */}
          {selectedTool === "bridge" && (
            <div style={{ ...CARD, marginTop: 24, padding: "24px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: showLeaderboard ? 20 : 0 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "#d97706", margin: 0 }}>
                    Overall Bridge Leaderboard
                  </h2>
                  <p style={{ fontSize: 12, color: "#888", margin: "3px 0 0" }}>
                    Individual standings across all your classes, ranked by lowest cost.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!showLeaderboard && leaderboardData === null) loadOverallLeaderboard();
                    setShowLeaderboard(v => !v);
                  }}
                  style={{ padding: "9px 20px", borderRadius: 99, border: "2px solid #d97706",
                    background: showLeaderboard ? "#d97706" : "#fff",
                    color: showLeaderboard ? "#fff" : "#92400e",
                    fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {showLeaderboard ? "Hide" : "Show Leaderboard"}
                </button>
              </div>

              {showLeaderboard && (
                loadingLeaderboard ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#888", fontWeight: 600 }}>Loading…</div>
                ) : !leaderboardData || leaderboardData.overall.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                    No passing bridge submissions yet.
                  </div>
                ) : (() => {
                  const tabs = [{ key: "overall", label: "Overall" }, ...leaderboardData.byAssignment.map(a => ({ key: a.title, label: a.title }))];
                  const activeRows = leaderboardTab === "overall"
                    ? leaderboardData.overall
                    : (leaderboardData.byAssignment.find(a => a.title === leaderboardTab)?.rows ?? []);
                  const showChallenge = leaderboardTab === "overall";
                  return (
                    <div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                        {tabs.map(tab => (
                          <button key={tab.key} onClick={() => setLeaderboardTab(tab.key)}
                            style={{ padding: "7px 16px", borderRadius: 99, border: "2px solid",
                              borderColor: leaderboardTab === tab.key ? "#d97706" : "#e5e7eb",
                              background: leaderboardTab === tab.key ? "#d97706" : "#fff",
                              color: leaderboardTab === tab.key ? "#fff" : "#374151",
                              fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                            {tab.label}
                          </button>
                        ))}
                      </div>
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr>
                              {["Rank", "Student", showChallenge ? "Best Cost" : "Cost", ...(showChallenge ? ["Challenge"] : [])].map(h => (
                                <th key={h} style={{ padding: "8px 14px", fontWeight: 800, fontSize: 12,
                                  color: "#555", textTransform: "uppercase", letterSpacing: "0.4px",
                                  background: "#fffbeb", borderBottom: "2px solid #fde68a",
                                  textAlign: h === "Rank" ? "center" : "left", whiteSpace: "nowrap" }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {activeRows.map(row => (
                              <tr key={row.student_id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                                <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 800, fontSize: 15 }}>
                                  {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                                </td>
                                <td style={{ padding: "10px 14px" }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{row.name}</div>
                                  <div style={{ fontSize: 11, color: "#888" }}>{row.email}</div>
                                </td>
                                <td style={{ padding: "10px 14px", fontWeight: 800, fontSize: 14,
                                  color: row.rank <= 3 ? "#16a34a" : "#111" }}>
                                  ${row.cost.toLocaleString()}
                                </td>
                                {showChallenge && (
                                  <td style={{ padding: "10px 14px", fontSize: 13, color: "#555" }}>
                                    {row.assignment_title}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          )}

          {/* ── STEM Sketch panel ──────────────────────────────────────────────────── */}
          {selectedTool === "stem-sketch" && (
            <div style={{ ...CARD, padding: "26px 28px" }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#0891b2", marginBottom: 6 }}>STEM Sketch Designs</h2>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 20 }}>
                All designs saved by students in this class.
              </p>
              {loadingStemSketch ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>Loading…</div>
              ) : stemSketchDesigns.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#aaa", fontSize: 14 }}>
                  No designs saved yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  {stemSketchDesigns.map(d => (
                    <div key={d.id} style={{ borderRadius: 12, border: "2px solid #e0f2fe",
                      background: "#f0f9ff", overflow: "hidden", width: 190, flexShrink: 0 }}>
                      {/* Thumbnail */}
                      <div style={{ width: "100%", height: 120, background: "#bae6fd", overflow: "hidden",
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {d.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.thumbnail} alt={d.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <span style={{ fontSize: 32, opacity: 0.3 }}>✏️</span>
                        )}
                      </div>
                      {/* Info */}
                      <div style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#111",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0891b2", marginTop: 2 }}>
                          {d.student_name}
                        </div>
                        <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                          {d.units} · {new Date(d.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {multiAssignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...CARD, padding: 32, minWidth: 360, maxWidth: 480, width: "90%", color: "#111" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "#111" }}>Assign to other classes?</h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#111" }}>
              You just assigned{" "}
              <strong>
                {multiAssignModal.tool === "code-lab" ? "Code Lab" : multiAssignModal.tool === "block-lab" ? "Block Lab" : multiAssignModal.tool.charAt(0).toUpperCase() + multiAssignModal.tool.slice(1)}
                {" — "}
                {multiAssignModal.tool === "block-lab" ? "Unit" : "Level"} {multiAssignModal.levelId + 1}
              </strong>{" "}
              to <strong>{cls?.name}</strong>. Select other classes to assign it to as well.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {otherClasses.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 10, border: "2px solid #e5e7eb",
                  background: multiAssignSelected.has(c.id) ? "#eff6ff" : "#f9fafb",
                  cursor: "pointer", fontWeight: 600, fontSize: 14, color: "#111" }}>
                  <input type="checkbox" checked={multiAssignSelected.has(c.id)}
                    onChange={() => setMultiAssignSelected(prev => {
                      const next = new Set(prev);
                      next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                      return next;
                    })}
                    style={{ width: 16, height: 16, accentColor: "#2563eb", cursor: "pointer" }} />
                  {c.name}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setMultiAssignModal(null)} disabled={multiAssigning}
                style={{ padding: "10px 20px", borderRadius: 99, border: "2px solid #d1d5db",
                  background: "#fff", color: "#374151", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                Skip
              </button>
              <button onClick={handleMultiAssign} disabled={multiAssigning || multiAssignSelected.size === 0}
                style={{ padding: "10px 20px", borderRadius: 99, border: "none",
                  background: multiAssignSelected.size === 0 ? "#d1d5db" : "#2563eb",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: multiAssignSelected.size === 0 ? "not-allowed" : "pointer" }}>
                {multiAssigning ? "Assigning…" : `Assign to ${multiAssignSelected.size} class${multiAssignSelected.size === 1 ? "" : "es"}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
