"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { isAnyAdmin, isAdmin } from "@/lib/roles";
import { licenseBadge, type LicenseSummary } from "../license-badge";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "24px 28px",
};
const INPUT: React.CSSProperties = {
  padding: "10px 12px", borderRadius: 10, border: "2px solid #d1d5db", fontSize: 14,
  color: "#111", background: "#fff",
};
const BTN: React.CSSProperties = {
  background: "#1f1f1f", color: "#fff", border: "none", borderRadius: 10,
  padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer",
};
const BTN_DANGER: React.CSSProperties = {
  background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c",
  borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer",
};

interface SchoolRow { id: string; name: string; teacherCount: number; studentCount: number }
interface PersonRow {
  id: string; name: string; email: string | null; username?: string | null;
  school_id?: string | null; account_origin?: string | null; created_at: string;
  classCount?: number; enrollmentCount?: number;
}
interface RosterResult {
  kind: "class" | "student" | "enrollment";
  key: string; label: string;
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

interface AuditRow {
  id: number; actor_id: string; actor_role: string; action: string;
  target_type: string | null; target_id: string | null; created_at: string;
}
interface DistrictDetail {
  id: string; name: string; state: string | null;
  schools: SchoolRow[];
  teachers: PersonRow[];
  admins: { id: string; name: string; email: string | null }[];
  pendingInvites: { id: number; email: string; expires_at: string }[];
  license: LicenseSummary | null;
  counts: { schools: number; teachers: number; students: number; classes: number };
}

export default function DistrictDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const districtId = params.id;

  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [students, setStudents] = useState<PersonRow[] | null>(null);
  const [studentSchool, setStudentSchool] = useState<string>("");
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [tab, setTab] = useState<"schools" | "teachers" | "students" | "roster" | "audit">("schools");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Roster upload
  const [rosterCsv, setRosterCsv] = useState<string | null>(null);
  const [rosterFileName, setRosterFileName] = useState("");
  const [rosterPreview, setRosterPreview] = useState<RosterSummary | null>(null);
  const [rosterDone, setRosterDone] = useState<RosterSummary | null>(null);
  const [rosterBusy, setRosterBusy] = useState<"" | "preview" | "import">("");
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Forms
  const [newSchool, setNewSchool] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [licType, setLicType] = useState<"trial" | "paid">("trial");
  const [licSeats, setLicSeats] = useState("");
  const [licEnds, setLicEnds] = useState("");
  const [showLicForm, setShowLicForm] = useState(false);

  const platform = isAdmin(session?.user?.role);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/districts/${districtId}`);
    const body = r.ok ? await r.json() : null;
    if (r.status === 404 || r.status === 403) setNotFound(true);
    else if (body) setDetail(body);
  }, [districtId]);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAnyAdmin(session?.user?.role)) { router.push("/"); return; }
    let cancelled = false;
    fetch(`/api/admin/districts/${districtId}`)
      .then(async r => {
        if (cancelled) return;
        if (r.status === 404 || r.status === 403) { setNotFound(true); return; }
        if (r.ok) setDetail(await r.json());
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [status, session?.user?.role, router, districtId]);

  async function loadStudents(schoolId: string) {
    setStudentSchool(schoolId);
    const qs = schoolId ? `&schoolId=${schoolId}` : "";
    const r = await fetch(`/api/admin/districts/${districtId}/users?role=student${qs}`);
    if (r.ok) setStudents(await r.json());
  }

  async function loadAudit() {
    const r = await fetch(`/api/admin/audit?districtId=${districtId}&limit=100`);
    if (r.ok) setAudit(await r.json());
  }

  function openTab(next: typeof tab) {
    setTab(next);
    if (next === "students" && students === null) loadStudents("");
    if (next === "audit" && audit === null) loadAudit();
  }

  async function post(url: string, method: string, body?: unknown): Promise<boolean> {
    setMsg(null);
    const r = await fetch(url, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setMsg(d.error ?? `Request failed (${r.status})`);
      return false;
    }
    return true;
  }

  async function addSchool(e: React.FormEvent) {
    e.preventDefault();
    if (!newSchool.trim()) return;
    setBusy("school");
    if (await post("/api/admin/schools", "POST", { districtId, name: newSchool.trim() })) {
      setNewSchool(""); await load();
    }
    setBusy(null);
  }

  async function removeSchool(s: SchoolRow) {
    if (!confirm(`Remove school "${s.name}"?\n\nIts teachers and students stay in the district; they are just detached from this school. Restorable for 30 days.`)) return;
    setBusy(s.id);
    if (await post(`/api/admin/schools/${s.id}`, "DELETE")) await load();
    setBusy(null);
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setBusy("invite");
    const r = await fetch(`/api/admin/districts/${districtId}/admins`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setMsg(d.error ?? "Invite failed");
    else {
      setInviteEmail("");
      setMsg(d.devInviteUrl ? `Invite created (no email provider configured) — link: ${d.devInviteUrl}` : "Invitation sent.");
      await load();
    }
    setBusy(null);
  }

  async function revokeAdmin(userId: string, name: string) {
    if (!confirm(`Revoke district admin from ${name}? Their account becomes a regular teacher account.`)) return;
    setBusy(userId);
    if (await post(`/api/admin/districts/${districtId}/admins`, "DELETE", { userId })) await load();
    setBusy(null);
  }

  async function cancelInvite(inviteId: number) {
    setBusy(`inv-${inviteId}`);
    if (await post(`/api/admin/districts/${districtId}/admins`, "DELETE", { inviteId })) await load();
    setBusy(null);
  }

  async function saveLicense(e: React.FormEvent) {
    e.preventDefault();
    setBusy("license");
    const ok = await post(`/api/admin/districts/${districtId}/license`, "PUT", {
      type: licType,
      seats: licSeats.trim() ? Number(licSeats) : null,
      endsAt: licEnds ? new Date(licEnds + "T23:59:59").toISOString() : null,
    });
    if (ok) { setShowLicForm(false); await load(); }
    setBusy(null);
  }

  async function onRosterFile(file: File | undefined) {
    if (!file) return;
    setRosterError(null); setRosterPreview(null); setRosterDone(null);
    setRosterFileName(file.name);
    const text = await file.text();
    setRosterCsv(text);
    setRosterBusy("preview");
    try {
      const r = await fetch(`/api/admin/districts/${districtId}/roster/csv`, {
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

  async function runRosterImport() {
    if (!rosterCsv) return;
    setRosterBusy("import"); setRosterError(null);
    try {
      const r = await fetch(`/api/admin/districts/${districtId}/roster/csv`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: rosterCsv, dryRun: false }),
      });
      const d = await r.json();
      if (!r.ok) { setRosterError(d.error ?? "Import failed"); return; }
      setRosterDone(d); setRosterPreview(null); setRosterCsv(null);
      setStudents(null); // stale — refetched on next open
      await load();
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

  async function deleteUser(u: PersonRow, kind: "teacher" | "student") {
    const extra = kind === "teacher"
      ? `\n\nAll ${u.classCount ?? 0} of their classes (and every enrollment inside) will also be deleted.`
      : `\n\nTheir enrollments and saved work will also be deleted.`;
    if (!confirm(`Delete ${kind} "${u.name}"?${extra}\n\nRestorable for 30 days, then permanently purged.`)) return;
    setBusy(u.id);
    if (await post(`/api/admin/users/${u.id}`, "DELETE")) {
      if (kind === "teacher") await load();
      else setStudents(prev => prev?.filter(s => s.id !== u.id) ?? null);
    }
    setBusy(null);
  }

  if (status === "loading" || (!detail && !notFound)) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ ...CARD, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#111", marginBottom: 8 }}>District not found</div>
          <div style={{ fontSize: 13, color: "#666" }}>It may have been removed, or it isn&apos;t in your scope.</div>
        </div>
      </main>
    </div>
  );

  const d = detail!;
  const badge = licenseBadge(d.license);
  const seatText = d.license?.seats
    ? `${d.counts.students} / ${d.license.seats} seats used`
    : `${d.counts.students} students (unlimited seats)`;

  const tabs: { key: typeof tab; label: string }[] = [
    { key: "schools", label: `Schools (${d.counts.schools})` },
    { key: "teachers", label: `Teachers (${d.counts.teachers})` },
    { key: "students", label: `Students (${d.counts.students})` },
    { key: "roster", label: "Roster upload" },
    { key: "audit", label: "Audit log" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px" }}>

          {/* Header + license */}
          <div style={{ ...CARD, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                {platform && (
                  <Link href="/admin/districts" style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
                    ← All districts
                  </Link>
                )}
                <h1 style={{ fontSize: 26, fontWeight: 900, color: "#111", margin: "4px 0" }}>
                  {d.name}{d.state ? <span style={{ color: "#888", fontWeight: 600 }}> · {d.state}</span> : null}
                </h1>
                <div style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>
                  {d.counts.schools} schools · {d.counts.teachers} teachers · {d.counts.classes} classes · {seatText}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 12, fontWeight: 800, padding: "6px 14px", borderRadius: 999,
                  background: badge.bg, color: badge.color }}>{badge.label}</span>
                {d.license?.endsAt && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                    {d.license.effectiveStatus === "expired" ? "Ended" : "Ends"} {new Date(d.license.endsAt).toLocaleDateString()}
                  </div>
                )}
                {platform && (
                  <button onClick={() => setShowLicForm(v => !v)}
                    style={{ ...BTN, marginTop: 8, padding: "8px 14px", fontSize: 12 }}>
                    {d.license ? "Edit license" : "Start trial / license"}
                  </button>
                )}
              </div>
            </div>

            {d.license?.effectiveStatus === "expired" && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#fee2e2",
                color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>
                This {d.license.type} has expired. Set a new term or convert to paid.
              </div>
            )}
            {d.license?.effectiveStatus === "expiring" && (
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#fef3c7",
                color: "#b45309", fontSize: 13, fontWeight: 700 }}>
                This {d.license.type} ends in {d.license.daysLeft} day{d.license.daysLeft === 1 ? "" : "s"}.
              </div>
            )}

            {platform && showLicForm && (
              <form onSubmit={saveLicense} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
                marginTop: 16, paddingTop: 16, borderTop: "1px solid #eee" }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Type</label>
                  <select value={licType} onChange={e => setLicType(e.target.value as "trial" | "paid")} style={INPUT}>
                    <option value="trial">Trial</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>Seats (blank = unlimited)</label>
                  <input value={licSeats} onChange={e => setLicSeats(e.target.value)} placeholder="unlimited" style={{ ...INPUT, width: 140 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>End date (blank = open-ended)</label>
                  <input type="date" value={licEnds} onChange={e => setLicEnds(e.target.value)} style={INPUT} />
                </div>
                <button type="submit" disabled={busy === "license"} style={BTN}>
                  {busy === "license" ? "Saving…" : "Save license"}
                </button>
              </form>
            )}
          </div>

          {/* District admins (platform manages; both tiers can see) */}
          <div style={{ ...CARD, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: "0 0 12px" }}>District admins</h2>
            {d.admins.length === 0 && d.pendingInvites.length === 0 && (
              <div style={{ fontSize: 13, color: "#aaa", marginBottom: 8 }}>No district admins yet.</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {d.admins.map(a => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>
                    {a.name} <span style={{ color: "#888", fontWeight: 500 }}>{a.email}</span>
                  </div>
                  {platform && (
                    <button onClick={() => revokeAdmin(a.id, a.name)} disabled={busy === a.id} style={BTN_DANGER}>
                      {busy === a.id ? "…" : "Revoke"}
                    </button>
                  )}
                </div>
              ))}
              {d.pendingInvites.map(inv => (
                <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 10, background: "#fefce8", border: "1px solid #fde68a" }}>
                  <div style={{ fontSize: 13, color: "#92400e", fontWeight: 600 }}>
                    {inv.email} <span style={{ fontWeight: 500 }}>· invited, expires {new Date(inv.expires_at).toLocaleDateString()}</span>
                  </div>
                  {platform && (
                    <button onClick={() => cancelInvite(inv.id)} disabled={busy === `inv-${inv.id}`} style={BTN_DANGER}>
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
            {platform && (
              <form onSubmit={sendInvite} style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@district.org"
                  style={{ ...INPUT, flex: 1 }} />
                <button type="submit" disabled={busy === "invite" || !inviteEmail.trim()} style={BTN}>
                  {busy === "invite" ? "Sending…" : "Invite district admin"}
                </button>
              </form>
            )}
          </div>

          {msg && (
            <div style={{ ...CARD, marginBottom: 24, padding: "14px 20px", fontSize: 13, fontWeight: 600,
              color: msg.startsWith("Invit") ? "#16a34a" : "#b45309", wordBreak: "break-all" }}>
              {msg}
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => openTab(t.key)}
                style={{ background: tab === t.key ? "#1f1f1f" : "#fff", color: tab === t.key ? "#fff" : "#374151",
                  border: "2px solid #1f1f1f", borderRadius: 999, padding: "8px 18px", fontSize: 13,
                  fontWeight: 800, cursor: "pointer" }}>
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ ...CARD }}>
            {tab === "schools" && (
              <>
                <form onSubmit={addSchool} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                  <input value={newSchool} onChange={e => setNewSchool(e.target.value)} placeholder="New school name"
                    style={{ ...INPUT, flex: 1 }} />
                  <button type="submit" disabled={busy === "school" || !newSchool.trim()} style={BTN}>
                    {busy === "school" ? "Adding…" : "+ Add school"}
                  </button>
                </form>
                {d.schools.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#aaa" }}>No schools yet.</div>
                ) : d.schools.map(s => (
                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee", marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{s.name}</div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#555", fontWeight: 600 }}>
                        🧑‍🏫 {s.teacherCount} · 🎒 {s.studentCount}
                      </span>
                      <button onClick={() => removeSchool(s)} disabled={busy === s.id} style={BTN_DANGER}>
                        {busy === s.id ? "…" : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === "teachers" && (
              d.teachers.length === 0 ? <div style={{ fontSize: 13, color: "#aaa" }}>No teachers linked to this district yet.</div>
              : d.teachers.map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee", marginBottom: 8, gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "#888" }}>{t.email}</div>
                  </div>
                  <span style={{ fontSize: 11, color: "#7c3aed", fontWeight: 700, background: "#ede9fe",
                    padding: "2px 8px", borderRadius: 999 }}>
                    {d.schools.find(s => s.id === t.school_id)?.name ?? "No school"}
                  </span>
                  <a href={`/api/admin/users/${t.id}/export`} style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}>Export</a>
                  <button onClick={() => deleteUser(t, "teacher")} disabled={busy === t.id} style={BTN_DANGER}>
                    {busy === t.id ? "…" : "Remove"}
                  </button>
                </div>
              ))
            )}

            {tab === "students" && (
              <>
                <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>School:</label>
                  <select value={studentSchool} onChange={e => loadStudents(e.target.value)} style={INPUT}>
                    <option value="">All schools</option>
                    {d.schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {students === null ? <div style={{ fontSize: 13, color: "#888" }}>Loading…</div>
                : students.length === 0 ? <div style={{ fontSize: 13, color: "#aaa" }}>No students found.</div>
                : (
                  <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
                    {students.map(s => (
                      <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee", marginBottom: 8, gap: 12 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{s.name}</div>
                          <div style={{ fontSize: 11, color: "#888" }}>{s.email ?? s.username}</div>
                        </div>
                        {s.account_origin && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#0891b2", background: "#cffafe",
                            padding: "2px 8px", borderRadius: 999 }}>{s.account_origin}</span>
                        )}
                        <span style={{ fontSize: 11, color: "#aaa" }}>
                          {s.enrollmentCount ?? 0} class{(s.enrollmentCount ?? 0) === 1 ? "" : "es"}
                        </span>
                        <a href={`/api/admin/users/${s.id}/export`} style={{ fontSize: 12, fontWeight: 700, color: "#2563eb" }}>Export</a>
                        <button onClick={() => deleteUser(s, "student")} disabled={busy === s.id} style={BTN_DANGER}>
                          {busy === s.id ? "…" : "Remove"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "roster" && (
              <div>
                <p style={{ fontSize: 13, color: "#555", margin: "0 0 14px", lineHeight: 1.6 }}>
                  Upload a class roster CSV to create classes and student accounts in bulk.
                  Columns: <code>class_name, teacher_email, first_name, last_name</code> and optionally{" "}
                  <code>email, username, school</code>. Teachers must already have accounts in this district.
                  Re-uploading the same file is safe — existing students are matched, never duplicated.{" "}
                  <a href={`/api/admin/districts/${districtId}/roster/csv`} style={{ color: "#2563eb", fontWeight: 700 }}>
                    Download the template
                  </a>
                </p>

                <label style={{ display: "inline-block", ...BTN, marginBottom: 16 }}>
                  {rosterBusy === "preview" ? "Checking…" : rosterFileName ? `📄 ${rosterFileName} — choose another` : "📄 Choose CSV file"}
                  <input type="file" accept=".csv,text/csv" style={{ display: "none" }}
                    onChange={e => onRosterFile(e.target.files?.[0])} />
                </label>

                {rosterError && (
                  <div style={{ padding: "10px 14px", borderRadius: 10, background: "#fee2e2", color: "#b91c1c",
                    fontSize: 13, fontWeight: 700, marginBottom: 14 }}>{rosterError}</div>
                )}

                {(rosterPreview ?? rosterDone) && (() => {
                  const s = (rosterDone ?? rosterPreview)!;
                  const c = s.counts;
                  return (
                    <div>
                      <div style={{ padding: "12px 16px", borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 700,
                        background: rosterDone ? "#dcfce7" : "#eff6ff", color: rosterDone ? "#166534" : "#1e40af" }}>
                        {rosterDone ? "Import complete: " : "Preview — nothing imported yet: "}
                        {c.classesCreated} class{c.classesCreated === 1 ? "" : "es"} new, {c.classesLinked} existing ·{" "}
                        {c.studentsCreated} student{c.studentsCreated === 1 ? "" : "s"} new, {c.studentsLinked} existing ·{" "}
                        {c.enrollmentsCreated} enrollment{c.enrollmentsCreated === 1 ? "" : "s"}
                        {c.errors > 0 && <span style={{ color: "#b91c1c" }}> · {c.errors} error{c.errors === 1 ? "" : "s"}</span>}
                      </div>

                      {rosterDone && rosterDone.credentials.length > 0 && (
                        <div style={{ padding: "12px 16px", borderRadius: 10, background: "#fefce8",
                          border: "1px solid #fde68a", marginBottom: 14 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#92400e", marginBottom: 6 }}>
                            {rosterDone.credentials.length} new sign-in{rosterDone.credentials.length === 1 ? "" : "s"} created —
                            download now, they are shown only once.
                          </div>
                          <button onClick={() => downloadCredentials(rosterDone)} style={BTN}>
                            ⬇ Download credentials CSV
                          </button>
                        </div>
                      )}

                      {s.results.filter(r => r.action === "error").length > 0 && (
                        <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 14 }}>
                          {s.results.filter(r => r.action === "error").map((r, i) => (
                            <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "#fef2f2",
                              border: "1px solid #fecaca", marginBottom: 6, fontSize: 12, color: "#991b1b" }}>
                              <strong>{r.row ? `Row ${r.row}: ` : ""}{r.label}</strong> — {r.message}
                            </div>
                          ))}
                        </div>
                      )}

                      {rosterPreview && (
                        <div style={{ maxHeight: 260, overflowY: "auto", marginBottom: 14 }}>
                          {s.results.filter(r => r.action !== "error").map((r, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px",
                              borderRadius: 8, background: "#f9f9f9", border: "1px solid #eee", marginBottom: 4, fontSize: 12 }}>
                              <span style={{ color: "#111", fontWeight: 600 }}>
                                {r.kind === "class" ? "🏫" : "🎒"} {r.label}
                              </span>
                              <span style={{ fontWeight: 800, color: r.action === "create" ? "#16a34a" : "#6b7280" }}>
                                {r.action === "create" ? "will create" : "already exists"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {rosterPreview && (
                        <button onClick={runRosterImport} disabled={rosterBusy === "import"}
                          style={{ ...BTN, background: rosterBusy === "import" ? "#6b7280" : "#16a34a", fontSize: 14, padding: "12px 24px" }}>
                          {rosterBusy === "import" ? "Importing…" : `✓ Import ${c.studentsCreated} students / ${c.classesCreated} classes`}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {tab === "audit" && (
              audit === null ? <div style={{ fontSize: 13, color: "#888" }}>Loading…</div>
              : audit.length === 0 ? <div style={{ fontSize: 13, color: "#aaa" }}>No admin actions recorded for this district yet.</div>
              : (
                <div style={{ maxHeight: 480, overflowY: "auto", paddingRight: 4 }}>
                  {audit.map(a => (
                    <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 12,
                      padding: "8px 12px", borderRadius: 10, background: "#f9f9f9", border: "1px solid #eee", marginBottom: 6 }}>
                      <div style={{ fontSize: 12, color: "#111" }}>
                        <span style={{ fontWeight: 800 }}>{a.action}</span>
                        {a.target_type && <span style={{ color: "#666" }}> · {a.target_type} {a.target_id}</span>}
                        <span style={{ color: "#999" }}> · by {a.actor_role} {a.actor_id.slice(0, 8)}…</span>
                      </div>
                      <span style={{ fontSize: 11, color: "#aaa", whiteSpace: "nowrap" }}>
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

        </div>
      </main>
      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
