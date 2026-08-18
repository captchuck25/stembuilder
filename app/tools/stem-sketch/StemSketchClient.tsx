"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";

type DemoDesign = {
  id: string;
  name: string;
  units: string;
  doc_json: object;
  thumbnail: string | null;
  updated_at: string;
};

// Assignment context pushed into the iframe (see
// docs/STEM_SKETCH_ASSIGNMENTS_BRIDGE.md for the full contract).
type AssignmentInfo = {
  id: string;
  title: string;
  /** Teacher challenge preview (?challenge=): fit check runs, nothing is recorded. */
  preview?: boolean;
  challenge: {
    id: string;
    stage: number;
    title: string;
    precision: string;
    studentInstructions: string;
    refDocJson: object | null;
    toleranceMm: number;
    /** Stage 2 (Fill the Void): edge length of the target cube in inches. */
    targetCubeIn?: number | null;
  };
};

export default function StemSketchClient() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const viewAsStudent = searchParams.get("asStudent");
  const demoDesignId = searchParams.get("id");
  // Teacher viewer can open either a saved design (?id=) or a frozen
  // assignment submission (?submissionId=) — same read-only demo mode.
  const demoSubmissionId = searchParams.get("submissionId");
  const isDemoMode = !!viewAsStudent && !!(demoDesignId || demoSubmissionId);
  // Student (or teacher trying it) launched from an assignment card.
  const assignmentId = searchParams.get("assignment");
  // Teacher previewing a challenge BEFORE assigning it (from the picker).
  const challengeId = searchParams.get("challenge");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dirtyRef = useRef(false);
  const iframeLoadedRef = useRef(false);
  const [demoDesign, setDemoDesign] = useState<DemoDesign | null>(null);
  const [viewingStudent, setViewingStudent] = useState<{ name: string; email: string } | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const postToSketch = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // Feed the iframe's in-toolbar account menu with the wrapper's auth session.
  const postUser = useCallback(() => {
    postToSketch({
      type: "STEMSKETCH_USER",
      user: session?.user
        ? {
            signedIn: true,
            name: session.user.name ?? null,
            email: session.user.email ?? null,
            image: session.user.image ?? null,
          }
        : { signedIn: false },
    });
  }, [postToSketch, session]);

  // Re-push whenever the session resolves/changes (the iframe may already be loaded).
  useEffect(() => {
    if (iframeLoadedRef.current) postUser();
  }, [postUser]);

  // Fetch the student's design (or frozen submission) via the teacher endpoint
  useEffect(() => {
    if (!isDemoMode) return;
    const query = demoSubmissionId
      ? `submissionId=${encodeURIComponent(demoSubmissionId)}`
      : `designId=${encodeURIComponent(demoDesignId!)}`;
    fetch(`/api/teacher/student-work/stem-sketch?${query}`)
      .then(async r => {
        if (!r.ok) {
          setDemoError(`Could not load design (status ${r.status})`);
          return null;
        }
        return r.json() as Promise<{ design: DemoDesign; student: { name: string; email: string } }>;
      })
      .then(payload => {
        if (!payload) return;
        if (payload.student) setViewingStudent(payload.student);
        setDemoDesign(payload.design);
      })
      .catch(err => {
        setDemoError(err instanceof Error ? err.message : String(err));
      });
  }, [isDemoMode, demoDesignId, demoSubmissionId]);

  // ── Assignment mode ──
  // Fetch the assignment (with its resolved challenge) and push it into the
  // iframe. The current iframe build ignores STEMSKETCH_ASSIGNMENT — that's
  // fine, the platform side ships first (see docs/STEM_SKETCH_ASSIGNMENTS_BRIDGE.md).
  useEffect(() => {
    if (!assignmentId || isDemoMode) return;
    let cancelled = false;
    fetch(`/api/stem-sketch-assignments/${encodeURIComponent(assignmentId)}`)
      .then(async r => {
        if (!r.ok) {
          if (!cancelled) setAssignmentError(`Could not load assignment (status ${r.status})`);
          return null;
        }
        return r.json() as Promise<AssignmentInfo>;
      })
      .then(a => { if (a && !cancelled) { setAssignment(a); setAssignmentError(null); } })
      .catch(err => { if (!cancelled) setAssignmentError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [assignmentId, isDemoMode]);

  // Teacher challenge preview (?challenge=) — same in-tool experience as an
  // assignment, but nothing is recorded on submit.
  useEffect(() => {
    if (!challengeId || assignmentId || isDemoMode) return;
    let cancelled = false;
    fetch(`/api/stem-sketch-challenges/${encodeURIComponent(challengeId)}`)
      .then(async r => {
        if (!r.ok) {
          if (!cancelled) setAssignmentError(`Could not load challenge (status ${r.status})`);
          return null;
        }
        return r.json() as Promise<{ challenge: AssignmentInfo["challenge"] }>;
      })
      .then(data => {
        if (!data || cancelled) return;
        setAssignment({ id: "", title: data.challenge.title, preview: true, challenge: data.challenge });
        setAssignmentError(null);
      })
      .catch(err => { if (!cancelled) setAssignmentError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [challengeId, assignmentId, isDemoMode]);

  const postAssignment = useCallback(() => {
    if (!assignment || !iframeLoadedRef.current) return;
    postToSketch({
      type: "STEMSKETCH_ASSIGNMENT",
      assignment: {
        id: assignment.id,
        title: assignment.title,
        preview: !!assignment.preview,
        challenge: assignment.challenge,
      },
    });
  }, [assignment, postToSketch]);

  useEffect(() => {
    if (assignment) postAssignment();
  }, [assignment, postAssignment]);

  // Push the design into the iframe once BOTH the iframe is loaded AND the design has arrived
  const pushDemoDesign = useCallback(() => {
    if (!demoDesign || !iframeLoadedRef.current) return;
    postToSketch({
      type: "STEMSKETCH_LOAD",
      name: demoDesign.name,
      docJson: demoDesign.doc_json,
      units: demoDesign.units,
    });
  }, [demoDesign, postToSketch]);

  useEffect(() => {
    if (demoDesign) pushDemoDesign();
  }, [demoDesign, pushDemoDesign]);

  // Warn before leaving the page when there are unsaved changes — but never in demo mode
  useEffect(() => {
    if (isDemoMode) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDemoMode]);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const { type } = (e.data ?? {}) as { type?: string };
      if (!type?.startsWith("STEMSKETCH_")) return;

      if (type === "STEMSKETCH_DIRTY") {
        // Ignore dirty signals in demo mode — nothing can persist anyway
        if (isDemoMode) return;
        dirtyRef.current = (e.data as { dirty: boolean }).dirty;

      } else if (type === "STEMSKETCH_REQUEST_USER") {
        postUser();

      } else if (type === "STEMSKETCH_REQUEST_ASSIGNMENT") {
        postAssignment();

      } else if (type === "STEMSKETCH_SUBMIT") {
        // Assignment submission: frozen model snapshot + the in-tool fit-check
        // verdict. Append-only server-side; the iframe shows OK/ERR.
        if (assignment?.preview) {
          postToSketch({ type: "STEMSKETCH_SUBMIT_ERR", message: "Preview mode — submissions aren't recorded. Assign the challenge to a class to collect student work." });
          return;
        }
        if (!assignmentId || isDemoMode) {
          postToSketch({ type: "STEMSKETCH_SUBMIT_ERR", message: "No assignment is open." });
          return;
        }
        if (!session?.user?.id) {
          postToSketch({ type: "STEMSKETCH_SUBMIT_ERR", message: "Sign in to submit" });
          return;
        }
        const { docJson, docJsonGz, units, thumbnail, passed, metrics } = e.data as {
          docJson?: object;
          docJsonGz?: string;
          units?: string;
          thumbnail?: string | null;
          passed: boolean;
          metrics?: object;
        };
        const body = docJsonGz
          ? { docJsonGz, units, thumbnail, passed, metrics }
          : { docJson, units, thumbnail, passed, metrics };
        const payloadJson = JSON.stringify(body);
        const payloadKB = Math.round(payloadJson.length / 1024);
        let res: Response;
        try {
          res = await fetch(`/api/stem-sketch-assignments/${encodeURIComponent(assignmentId)}/submissions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payloadJson,
          });
        } catch (netErr) {
          postToSketch({
            type: "STEMSKETCH_SUBMIT_ERR",
            message: `network error (${(netErr as Error).message}) at ${payloadKB} KB payload`,
          });
          return;
        }
        if (res.ok) {
          postToSketch({ type: "STEMSKETCH_SUBMIT_OK", passed });
        } else {
          let msg = `HTTP ${res.status}`;
          try {
            const txt = await res.text();
            try {
              const parsed = JSON.parse(txt);
              msg = parsed?.error ? `${parsed.error} (HTTP ${res.status})` : `${txt.slice(0, 160)} (HTTP ${res.status})`;
            } catch {
              msg = `${txt.slice(0, 160) || res.statusText} (HTTP ${res.status}, payload ${payloadKB} KB)`;
            }
          } catch { /* response body wasn't readable */ }
          if (res.status === 413 || (res.status === 0 && payloadKB > 4000)) {
            msg = `Design too large for the server (${payloadKB} KB — Vercel limit ~4500 KB). Try simpler geometry, or undo a recent CSG step.`;
          }
          postToSketch({ type: "STEMSKETCH_SUBMIT_ERR", message: msg });
        }

      } else if (type === "STEMSKETCH_SIGNOUT") {
        signOut({ callbackUrl: "/" });

      } else if (type === "STEMSKETCH_SAVE") {
        if (isDemoMode) {
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: "Demo view — saves are disabled while viewing a student's work." });
          return;
        }
        // The iframe ships either docJson (legacy / fallback) or docJsonGz
        // (gzip + base64 — the modern path that keeps complex saves under
        // the Vercel/Supabase body-size limits). Pass whichever it sent
        // straight through; the API route accepts either.
        const { name, docJson, docJsonGz, units, thumbnail } = e.data as {
          name: string;
          docJson?: object;
          docJsonGz?: string;
          units: string;
          thumbnail: string | null;
        };
        if (!session?.user?.id) {
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: "Sign in to save" });
          return;
        }
        const body = docJsonGz
          ? { name, docJsonGz, units, thumbnail }
          : { name, docJson, units, thumbnail };
        // Capture payload size up front so a 413 / 504 from Vercel
        // doesn't look like a mysterious "unknown error" downstream.
        const payloadJson = JSON.stringify(body);
        const payloadKB = Math.round(payloadJson.length / 1024);
        let res: Response;
        try {
          res = await fetch("/api/stem-sketch/designs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payloadJson,
          });
        } catch (netErr) {
          // Network error before we got a status back (CORS, connection
          // reset, request aborted because Vercel rejected it pre-handler
          // for size). Surface it instead of silently dropping.
          postToSketch({
            type: "STEMSKETCH_SAVE_ERR",
            message: `network error (${(netErr as Error).message}) at ${payloadKB} KB payload`,
          });
          return;
        }
        if (res.ok) {
          dirtyRef.current = false;
          postToSketch({ type: "STEMSKETCH_SAVE_OK" });
        } else {
          // Read response as TEXT first — many failure modes (Vercel 413
          // body-size, 504 timeout, gateway HTML pages, Supabase HTML
          // error pages) return non-JSON. Try to JSON-parse and fall
          // back to a truncated text snippet so the iframe shows what
          // actually came back.
          let msg = `HTTP ${res.status}`;
          try {
            const txt = await res.text();
            try {
              const parsed = JSON.parse(txt);
              if (parsed?.error) msg = `${parsed.error} (HTTP ${res.status})`;
              else msg = `${txt.slice(0, 160)} (HTTP ${res.status})`;
            } catch {
              msg = `${txt.slice(0, 160) || res.statusText} (HTTP ${res.status}, payload ${payloadKB} KB)`;
            }
          } catch {
            /* response body wasn't readable */
          }
          // Common-case hint when we're clearly over Vercel's default body limit.
          if (res.status === 413 || (res.status === 0 && payloadKB > 4000)) {
            msg = `Design too large for the server (${payloadKB} KB — Vercel limit ~4500 KB). Try fewer bevels / simpler geometry, or undo a recent CSG step.`;
          }
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: msg });
        }

      } else if (type === "STEMSKETCH_REQUEST_LIST") {
        // In demo mode, expose only the design being viewed
        if (isDemoMode) {
          postToSketch({
            type: "STEMSKETCH_LOAD_LIST",
            designs: demoDesign ? [{
              id: demoDesign.id,
              name: demoDesign.name,
              units: demoDesign.units,
              thumbnail: demoDesign.thumbnail,
              updated_at: demoDesign.updated_at,
            }] : [],
          });
          return;
        }
        if (!session?.user?.id) {
          postToSketch({ type: "STEMSKETCH_LOAD_LIST", designs: [] });
          return;
        }
        const res = await fetch("/api/stem-sketch/designs");
        const designs = res.ok ? await res.json() : [];
        postToSketch({ type: "STEMSKETCH_LOAD_LIST", designs });

      } else if (type === "STEMSKETCH_REQUEST_LOAD") {
        const { id } = e.data as { id: string };
        if (isDemoMode) {
          // Only allow loading the same design we're viewing
          if (demoDesign && demoDesign.id === id) {
            postToSketch({ type: "STEMSKETCH_LOAD", name: demoDesign.name, docJson: demoDesign.doc_json, units: demoDesign.units });
          }
          return;
        }
        const res = await fetch(`/api/stem-sketch/designs/${id}`);
        if (res.ok) {
          const design = await res.json();
          postToSketch({ type: "STEMSKETCH_LOAD", name: design.name, docJson: design.doc_json, units: design.units });
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [session, postToSketch, postUser, postAssignment, isDemoMode, demoDesign, assignmentId, assignment]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      {/* The former 120px SiteHeader is gone — the SB logo, Home, and account
          menu now live inside the iframe's own single toolbar row (see
          public/stem-sketch/index.html), so the canvas gets the full height. */}
      {(assignmentId || challengeId) && !isDemoMode && (
        <div style={{
          background: "#ecfeff", borderBottom: "3px solid #0891b2", color: "#155e75",
          padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap", flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            ✏️ {assignment?.preview ? "Previewing challenge" : "Assignment"}: {assignment?.title ?? "loading…"}
            {assignment && (
              <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: "#0e7490" }}>
                {assignment.challenge.title}
              </span>
            )}
            {assignmentError && (
              <span style={{ marginLeft: 12, padding: "2px 10px", borderRadius: 999,
                background: "#fecaca", color: "#7f1d1d", fontSize: 12, fontWeight: 800 }}>
                {assignmentError}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              try { window.close(); } catch {}
              setTimeout(() => { window.location.href = "/student/dashboard"; }, 50);
            }}
            style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid #0e7490",
              background: "#fff", color: "#155e75", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ← Close
          </button>
        </div>
      )}

      {isDemoMode && (
        <div style={{
          background: "#fef3c7", borderBottom: "3px solid #f59e0b", color: "#78350f",
          padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap", flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            👁 Viewing {viewingStudent?.name || "student"}&apos;s design — changes won&apos;t be saved
            {demoError && (
              <span style={{ marginLeft: 12, padding: "2px 10px", borderRadius: 999,
                background: "#fde68a", color: "#7c2d12", fontSize: 12, fontWeight: 800 }}>
                {demoError}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              try { window.close(); } catch {}
              setTimeout(() => { window.location.href = "/teachers/dashboard"; }, 50);
            }}
            style={{ padding: "6px 14px", borderRadius: 8, border: "2px solid #92400e",
              background: "#fff", color: "#78350f", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ← Close
          </button>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src="/stem-sketch/index.html"
        title="STEM Sketch"
        onLoad={async () => {
          iframeLoadedRef.current = true;
          postUser();
          pushDemoDesign();
          postAssignment();
          // Cloud-backed fallback. If the iframe's localStorage draft is
          // missing or corrupt, restoreLocalDraft inside the iframe leaves
          // a blank canvas. That's surprising right after a successful
          // cloud save (the cloud has the work, but a plain refresh
          // doesn't reach for it). Detect the empty case from out here —
          // we share an origin with the iframe so the same localStorage
          // key is readable — and fetch the user's most recent design
          // to seed the canvas. Skipped in demo mode and when a draft
          // exists (iframe's own restore handles that path).
          if (isDemoMode) return;
          // Assignment/preview mode: the canvas starts per the iframe's
          // assignment flow — don't pull in unrelated saved work.
          if (assignmentId || challengeId) return;
          if (!session?.user?.id) return;
          // If the URL specifies a design id (e.g. opened from My Work), load
          // THAT design directly — overrides both the localStorage-draft check
          // and the most-recent fallback. Without this, double-clicking a
          // thumbnail in My Work landed in the canvas with whatever was last
          // edited, not the design the user clicked on.
          if (demoDesignId) {
            try {
              const designRes = await fetch(`/api/stem-sketch/designs/${encodeURIComponent(demoDesignId)}`);
              if (designRes.ok) {
                const design = await designRes.json();
                postToSketch({
                  type: "STEMSKETCH_LOAD",
                  name: design.name,
                  docJson: design.doc_json,
                  units: design.units,
                });
              }
            } catch (err) {
              console.warn("STEM Sketch open-by-id failed:", err);
            }
            return;
          }
          let hasDraft = false;
          try { hasDraft = !!localStorage.getItem("stem-sketch:draft"); } catch {}
          if (hasDraft) return;
          try {
            const listRes = await fetch("/api/stem-sketch/designs");
            if (!listRes.ok) return;
            const designs = (await listRes.json()) as Array<{ id: string; updated_at: string }>;
            if (!designs.length) return;
            const mostRecent = designs[0]; // API returns updated_at DESC
            const designRes = await fetch(`/api/stem-sketch/designs/${mostRecent.id}`);
            if (!designRes.ok) return;
            const design = await designRes.json();
            postToSketch({
              type: "STEMSKETCH_LOAD",
              name: design.name,
              docJson: design.doc_json,
              units: design.units,
            });
          } catch (err) {
            console.warn("STEM Sketch auto-load of most recent design failed:", err);
          }
        }}
        style={{ flex: 1, border: "none", display: "block" }}
      />
    </div>
  );
}
