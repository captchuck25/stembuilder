"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { isAnyAdmin, isAdmin } from "@/lib/roles";
import { licenseBadge, type LicenseSummary } from "./license-badge";

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  padding: "24px 28px",
};

interface DistrictRow {
  id: string;
  name: string;
  state: string | null;
  created_at: string;
  schoolCount: number;
  teacherCount: number;
  studentCount: number;
  license: LicenseSummary | null;
}

export default function DistrictsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<DistrictRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newState, setNewState] = useState("");
  const [error, setError] = useState<string | null>(null);

  const platform = isAdmin(session?.user?.role);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/districts");
    if (r.ok) setRows(await r.json());
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAnyAdmin(session?.user?.role)) { router.push("/"); return; }
    // District admins have exactly one district — take them straight to it.
    if (session?.user?.role === "district_admin" && session.user.districtId) {
      router.replace(`/admin/districts/${session.user.districtId}`);
      return;
    }
    load();
  }, [status, session?.user?.role, session?.user?.districtId, router, load]);

  async function createDistrict(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setError(null);
    try {
      const r = await fetch("/api/admin/districts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), state: newState.trim() || null }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Create failed"); return; }
      setNewName(""); setNewState("");
      router.push(`/admin/districts/${d.id}`);
    } finally {
      setCreating(false);
    }
  }

  if (status === "loading" || rows === null) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
      <div style={{ fontSize: 16, color: "#555", fontWeight: 600 }}>Loading...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: "repeat" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px" }}>

          <div style={{ ...CARD, marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 4px" }}>Districts</h1>
              <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
                Organizations on StemBuilder — drill into a district to manage schools, teachers, students, and its trial.
              </p>
            </div>
            <Link href="/admin" style={{ fontSize: 13, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}>
              ← Admin dashboard
            </Link>
          </div>

          {platform && (
            <form onSubmit={createDistrict} style={{ ...CARD, marginBottom: 32, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 2, minWidth: 220 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>New district name</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Springfield Public Schools"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #d1d5db", fontSize: 14, color: "#111", background: "#fff" }} />
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#555", display: "block", marginBottom: 6 }}>State</label>
                <input value={newState} onChange={e => setNewState(e.target.value)} placeholder="e.g. NJ"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "2px solid #d1d5db", fontSize: 14, color: "#111", background: "#fff" }} />
              </div>
              <button type="submit" disabled={creating || !newName.trim()}
                style={{ background: "#1f1f1f", color: "#fff", border: "none", borderRadius: 10,
                  padding: "12px 20px", fontSize: 14, fontWeight: 800, cursor: creating ? "wait" : "pointer" }}>
                {creating ? "Creating…" : "+ Add district"}
              </button>
              {error && <div style={{ color: "#b91c1c", fontSize: 13, fontWeight: 600, width: "100%" }}>{error}</div>}
            </form>
          )}

          {rows.length === 0 ? (
            <div style={{ ...CARD, color: "#888", fontSize: 14 }}>No districts yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
              {rows.map(d => {
                const badge = licenseBadge(d.license);
                return (
                  <Link key={d.id} href={`/admin/districts/${d.id}`} style={{ textDecoration: "none" }}>
                    <div style={{ ...CARD, padding: "20px 24px", cursor: "pointer", height: "100%" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: "#111" }}>
                          {d.name}{d.state ? <span style={{ color: "#888", fontWeight: 600 }}> · {d.state}</span> : null}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 999,
                          background: badge.bg, color: badge.color, whiteSpace: "nowrap" }}>{badge.label}</span>
                      </div>
                      <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 13, color: "#555", fontWeight: 600 }}>
                        <span>🏫 {d.schoolCount} school{d.schoolCount === 1 ? "" : "s"}</span>
                        <span>🧑‍🏫 {d.teacherCount}</span>
                        <span>🎒 {d.studentCount}{d.license?.seats ? ` / ${d.license.seats} seats` : ""}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

        </div>
      </main>
      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
