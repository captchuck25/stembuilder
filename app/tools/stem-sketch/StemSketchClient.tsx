"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { proxiedAvatarUrl } from "@/lib/avatar";

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
    /** Stage 3 (design briefs): brief text, requirement gates, check params. */
    brief?: string | null;
    briefImagePath?: string | null;
    requirements?: { singleBody?: boolean; minThicknessIn?: number } | null;
    checks?: object | null;
  };
};

// Payload the iframe posts for STEMSKETCH_SAVE and STEMSKETCH_SHARE.
type SavePayload = {
  name: string;
  docJson?: object;
  docJsonGz?: string;
  units: string;
  thumbnail: string | null;
};

type ShareFeedback = { id: number; body: string; authorName: string; mine?: boolean; createdAt: string };
type ShareInfo = {
  id: string;
  className: string;
  student: { id: string; name: string; email: string };
  note: string | null;
  sharedAt: string;
  feedback: ShareFeedback[];
};

function friendlyHttpError(res: Response, txt: string, payloadKB: number): string {
  let msg = `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(txt);
    if (parsed?.error) msg = `${parsed.error} (HTTP ${res.status})`;
    else msg = `${txt.slice(0, 160)} (HTTP ${res.status})`;
  } catch {
    msg = `${txt.slice(0, 160) || res.statusText} (HTTP ${res.status}, payload ${payloadKB} KB)`;
  }
  // Common-case hint when we're clearly over Vercel's default body limit.
  if (res.status === 413 || (res.status === 0 && payloadKB > 4000)) {
    msg = `Design too large for the server (${payloadKB} KB — Vercel limit ~4500 KB). Try fewer bevels / simpler geometry, or undo a recent CSG step.`;
  }
  return msg;
}

// POST the design to /api/stem-sketch/designs. Shared by Save and Share.
async function saveDesign(p: SavePayload): Promise<{ ok: true; id: string | null } | { ok: false; message: string }> {
  // The iframe ships either docJson (legacy / fallback) or docJsonGz
  // (gzip + base64 — the modern path that keeps complex saves under
  // the Vercel/Supabase body-size limits). Pass whichever it sent
  // straight through; the API route accepts either.
  const body = p.docJsonGz
    ? { name: p.name, docJsonGz: p.docJsonGz, units: p.units, thumbnail: p.thumbnail }
    : { name: p.name, docJson: p.docJson, units: p.units, thumbnail: p.thumbnail };
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
    return { ok: false, message: `network error (${(netErr as Error).message}) at ${payloadKB} KB payload` };
  }
  // Read response as TEXT first — many failure modes (Vercel 413
  // body-size, 504 timeout, gateway HTML pages, Supabase HTML
  // error pages) return non-JSON.
  let txt = "";
  try { txt = await res.text(); } catch { /* response body wasn't readable */ }
  if (!res.ok) return { ok: false, message: friendlyHttpError(res, txt, payloadKB) };
  let id: string | null = null;
  try { id = (JSON.parse(txt) as { id?: string | null }).id ?? null; } catch { /* older API shape */ }
  return { ok: true, id };
}

// Teacher edit of a shared design → saved into the STUDENT's account as a
// separate version (see /api/teacher/stem-sketch-shares/[id]/design).
async function saveTeacherVersion(shareId: string, p: SavePayload): Promise<{ ok: true; versionName: string } | { ok: false; message: string }> {
  const body = p.docJsonGz
    ? { docJsonGz: p.docJsonGz, units: p.units, thumbnail: p.thumbnail }
    : { docJson: p.docJson, units: p.units, thumbnail: p.thumbnail };
  const payloadJson = JSON.stringify(body);
  const payloadKB = Math.round(payloadJson.length / 1024);
  let res: Response;
  try {
    res = await fetch(`/api/teacher/stem-sketch-shares/${encodeURIComponent(shareId)}/design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payloadJson,
    });
  } catch (netErr) {
    return { ok: false, message: `network error (${(netErr as Error).message}) at ${payloadKB} KB payload` };
  }
  let txt = "";
  try { txt = await res.text(); } catch { /* unreadable body */ }
  if (!res.ok) return { ok: false, message: friendlyHttpError(res, txt, payloadKB) };
  let versionName = "your version";
  try { versionName = (JSON.parse(txt) as { versionName?: string }).versionName || versionName; } catch { /* keep default */ }
  return { ok: true, versionName };
}

export default function StemSketchClient() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const viewAsStudent = searchParams.get("asStudent");
  const demoDesignId = searchParams.get("id");
  // Teacher viewer can open either a saved design (?id=) or a frozen
  // assignment submission (?submissionId=) — same read-only demo mode.
  const demoSubmissionId = searchParams.get("submissionId");
  const isDemoMode = !!viewAsStudent && !!(demoDesignId || demoSubmissionId);
  // Opened from a class's "Shared with you" list: the teacher also gets the
  // student's note and a feedback thread beside the read-only view.
  const shareId = isDemoMode ? searchParams.get("shareId") : null;
  // Student pressed Share in the tool: the design is saved, then this holds
  // the saved id while the class picker is open.
  const [sharePrompt, setSharePrompt] = useState<{ designId: string; name: string } | null>(null);
  // Teacher saved while viewing a shared design: the version name their edit
  // landed under in the student's My Work (shown in the banner).
  const [teacherSaveNote, setTeacherSaveNote] = useState<string | null>(null);
  // Student (or teacher trying it) launched from an assignment card.
  const assignmentId = searchParams.get("assignment");
  // Teacher previewing a challenge BEFORE assigning it (from the picker).
  const challengeId = searchParams.get("challenge");
  // Deep link straight into a tutorial (dashboard cards, future teacher
  // tutorial assignments). Content + checks live in the iframe; this just
  // tells it which one to open.
  const tutorialId = searchParams.get("tutorial");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dirtyRef = useRef(false);
  const iframeLoadedRef = useRef(false);
  const [demoDesign, setDemoDesign] = useState<DemoDesign | null>(null);
  const [viewingStudent, setViewingStudent] = useState<{ name: string; email: string } | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<AssignmentInfo | null>(null);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [tutorialProgress, setTutorialProgress] = useState<string[] | null>(null);

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
            // Proxied through our origin so the iframe's <img> never hits Google.
            image: proxiedAvatarUrl(session.user.image, 30),
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

  // ── Tutorials ──
  // Server-known completions for the signed-in user, pushed into the iframe
  // so the picker shows cross-device progress (anonymous users just use the
  // iframe's localStorage — nothing to sync).
  useEffect(() => {
    if (!session?.user?.id || isDemoMode) return;
    let cancelled = false;
    fetch("/api/stem-sketch/tutorials")
      .then(r => (r.ok ? r.json() : null))
      .then((data: { completed?: { tutorialId: string }[] } | null) => {
        if (data && !cancelled) setTutorialProgress((data.completed ?? []).map(c => c.tutorialId));
      })
      .catch(() => { /* progress push is best-effort */ });
    return () => { cancelled = true; };
  }, [session?.user?.id, isDemoMode]);

  const postTutorialState = useCallback(() => {
    if (!iframeLoadedRef.current) return;
    if (tutorialProgress) postToSketch({ type: "STEMSKETCH_TUTORIALS", completed: tutorialProgress });
    if (tutorialId) postToSketch({ type: "STEMSKETCH_TUTORIAL_START", tutorialId });
  }, [tutorialProgress, tutorialId, postToSketch]);

  useEffect(() => {
    postTutorialState();
  }, [postTutorialState]);

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
    if (isDemoMode && !shareId) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDemoMode, shareId]);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const { type } = (e.data ?? {}) as { type?: string };
      if (!type?.startsWith("STEMSKETCH_")) return;

      if (type === "STEMSKETCH_DIRTY") {
        // Ignore dirty signals in demo mode — nothing can persist there
        // (except the shared-design viewer, where the teacher may save).
        if (isDemoMode && !shareId) return;
        dirtyRef.current = (e.data as { dirty: boolean }).dirty;

      } else if (type === "STEMSKETCH_REQUEST_USER") {
        postUser();

      } else if (type === "STEMSKETCH_REQUEST_ASSIGNMENT") {
        postAssignment();

      } else if (type === "STEMSKETCH_REQUEST_TUTORIALS") {
        postTutorialState();

      } else if (type === "STEMSKETCH_TUTORIAL_COMPLETE") {
        // Best-effort persist; the iframe's localStorage already recorded it,
        // so a failure here only costs cross-device sync, not the completion.
        const { tutorialId: doneId } = e.data as { tutorialId?: string };
        if (!doneId || !session?.user?.id || isDemoMode) return;
        try {
          const res = await fetch("/api/stem-sketch/tutorials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tutorialId: doneId }),
          });
          if (res.ok) setTutorialProgress(prev => (prev && !prev.includes(doneId) ? [...prev, doneId] : prev));
          else console.warn(`Tutorial completion sync failed (HTTP ${res.status})`);
        } catch (err) {
          console.warn("Tutorial completion sync failed:", err);
        }

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

      } else if (type === "STEMSKETCH_SAVE" || type === "STEMSKETCH_SHARE") {
        const sharing = type === "STEMSKETCH_SHARE";
        if (isDemoMode) {
          if (shareId && !sharing && session?.user?.id) {
            // Teacher editing a shared design: the save goes back to the
            // student as "<name> (<teacher>'s version)" beside their original.
            const result = await saveTeacherVersion(shareId, e.data as SavePayload);
            if (!result.ok) {
              postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: result.message });
              return;
            }
            dirtyRef.current = false;
            setTeacherSaveNote(result.versionName);
            postToSketch({ type: "STEMSKETCH_SAVE_OK" });
            return;
          }
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: "Demo view — saves are disabled while viewing a student's work." });
          return;
        }
        if (!session?.user?.id) {
          // SAVE_ERR resets the cloud button's "saving" state; SHARE_ERR sets the final status line.
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: "Sign in to save" });
          if (sharing) postToSketch({ type: "STEMSKETCH_SHARE_ERR", message: "Sign in to share" });
          return;
        }
        const payload = e.data as SavePayload;
        const result = await saveDesign(payload);
        if (!result.ok) {
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: result.message });
          if (sharing) postToSketch({ type: "STEMSKETCH_SHARE_ERR", message: `could not save first — ${result.message}` });
          return;
        }
        dirtyRef.current = false;
        postToSketch({ type: "STEMSKETCH_SAVE_OK" });
        if (sharing) {
          if (!result.id) {
            postToSketch({ type: "STEMSKETCH_SHARE_ERR", message: "saved, but the server did not return a design id" });
            return;
          }
          setSharePrompt({ designId: result.id, name: payload.name });
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
  }, [session, postToSketch, postUser, postAssignment, postTutorialState, isDemoMode, shareId, demoDesign, assignmentId, assignment]);

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
            👁 Viewing {viewingStudent?.name || "student"}&apos;s design
            {shareId
              ? (teacherSaveNote
                ? ` — ✓ saved to their My Work as “${teacherSaveNote}”`
                : ` — Save ☁ gives ${viewingStudent?.name || "them"} your edited version next to their original`)
              : " — changes won't be saved"}
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

      {shareId && <ShareFeedbackPanel shareId={shareId} />}


      {sharePrompt && (
        <SharePrompt
          designId={sharePrompt.designId}
          designName={sharePrompt.name}
          onDone={(ok, msg) => {
            setSharePrompt(null);
            if (ok === null) return; // cancelled — nothing to report
            postToSketch(ok ? { type: "STEMSKETCH_SHARE_OK", className: msg } : { type: "STEMSKETCH_SHARE_ERR", message: msg });
          }}
        />
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
          postTutorialState();
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
          // Assignment/preview/tutorial mode: the canvas starts per the
          // iframe's own flow — don't pull in unrelated saved work.
          if (assignmentId || challengeId || tutorialId) return;
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

// ── Share with a class (student) ──
// Picks one of the student's classes and an optional note; the share row
// points at the just-saved design, so the teacher always sees the live copy.
function SharePrompt({ designId, designName, onDone }: {
  designId: string;
  designName: string;
  onDone: (ok: boolean | null, msg: string) => void;
}) {
  const [classes, setClasses] = useState<{ id: string; name: string }[] | null>(null);
  const [classId, setClassId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/classes")
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { class: { id: string; name: string } }[]) => {
        if (cancelled) return;
        const list = rows.map(r => ({ id: String(r.class.id), name: r.class.name }));
        setClasses(list);
        if (list.length === 1) setClassId(list[0].id);
      })
      .catch(() => { if (!cancelled) setClasses([]); });
    return () => { cancelled = true; };
  }, []);

  async function submit() {
    if (!classId) { setError("Pick a class first."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/stem-sketch/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designId, classId, note: note.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || `Share failed (HTTP ${res.status})`); setBusy(false); return; }
      onDone(true, data?.className || classes?.find(c => c.id === classId)?.name || "your class");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const field = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "2px solid #e5e7eb",
    fontSize: 14, color: "#111", outline: "none", fontFamily: "inherit", boxSizing: "border-box" as const };

  return (
    <div onClick={() => onDone(null, "")} style={{ position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 420,
        padding: "22px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", color: "#111" }}>
        <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 4 }}>Share “{designName}”</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
          Your teacher can open it and leave feedback. You’ll see their notes in My Work.
        </div>

        {classes === null ? (
          <div style={{ fontSize: 13, color: "#888" }}>Loading your classes…</div>
        ) : classes.length === 0 ? (
          <div style={{ fontSize: 13, color: "#92400e", background: "#fef3c7", border: "2px solid #fcd34d",
            borderRadius: 10, padding: "10px 12px" }}>
            You’re not in a class yet. Join one with your teacher’s class code (My Work → Join a class), then share.
          </div>
        ) : (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>Class</label>
            <select value={classId} onChange={e => setClassId(e.target.value)} style={{ ...field, marginBottom: 14 }}>
              {classes.length > 1 && <option value="">Choose a class…</option>}
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#374151", marginBottom: 6 }}>
              Note to your teacher <span style={{ fontWeight: 600, color: "#888" }}>(optional)</span>
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3}
              placeholder="What would you like them to look at?"
              style={{ ...field, resize: "vertical", marginBottom: 14 }} />
          </>
        )}

        {error && <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginBottom: 10 }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => onDone(null, "")} style={{ padding: "9px 16px", borderRadius: 8, border: "2px solid #e5e7eb",
            background: "#fff", color: "#374151", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            Cancel
          </button>
          {classes && classes.length > 0 && (
            <button onClick={submit} disabled={busy || !classId} style={{ padding: "9px 18px", borderRadius: 8, border: "none",
              background: busy || !classId ? "#cbd5e1" : "#0891b2", color: "#fff", fontWeight: 800, fontSize: 13,
              cursor: busy || !classId ? "not-allowed" : "pointer" }}>
              {busy ? "Sharing…" : "Share"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Feedback thread (teacher viewer) ──
// Shown under the demo banner when the design was opened from a class's
// "Shared with you" list. Owner and co-teachers can both write here.
function ShareFeedbackPanel({ shareId }: { shareId: string }) {
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teacher/stem-sketch-shares/${encodeURIComponent(shareId)}`)
      .then(async r => {
        if (!r.ok) { if (!cancelled) setError(`Could not load the share (HTTP ${r.status})`); return null; }
        return r.json() as Promise<ShareInfo>;
      })
      .then(s => { if (s && !cancelled) setShare(s); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [shareId]);

  async function post() {
    const body = draft.trim();
    if (!body || !share) return;
    setPosting(true); setError(null);
    try {
      const res = await fetch(`/api/teacher/stem-sketch-shares/${encodeURIComponent(shareId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || `Could not post (HTTP ${res.status})`); return; }
      setShare({ ...share, feedback: [...share.feedback, data.feedback as ShareFeedback] });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{ background: "#fffbeb", borderBottom: "2px solid #fcd34d", color: "#78350f", flexShrink: 0,
      padding: open ? "10px 20px 14px" : "6px 20px", fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 800 }}>
          💬 Feedback{share ? ` for ${share.student.name || "student"} · ${share.className}` : ""}
          {share && share.feedback.length > 0 && (
            <span style={{ marginLeft: 8, fontWeight: 700, color: "#92400e" }}>
              {share.feedback.length} note{share.feedback.length === 1 ? "" : "s"}
            </span>
          )}
          {error && <span style={{ marginLeft: 12, color: "#b91c1c", fontWeight: 700 }}>{error}</span>}
        </div>
        <button onClick={() => setOpen(o => !o)} style={{ padding: "4px 12px", borderRadius: 999, border: "2px solid #d97706",
          background: "#fff", color: "#92400e", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && share && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 10 }}>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            {share.note ? (
              <div style={{ background: "#fff", border: "2px solid #fde68a", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "#b45309" }}>
                  {share.student.name || "Student"} wrote
                </div>
                <div style={{ whiteSpace: "pre-wrap", color: "#1f2937", marginTop: 2 }}>{share.note}</div>
              </div>
            ) : (
              <div style={{ color: "#a16207", marginBottom: 10 }}>No note from the student — shared {new Date(share.sharedAt).toLocaleDateString()}.</div>
            )}
            {share.feedback.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                {share.feedback.map(f => (
                  <div key={f.id} style={{ background: f.mine ? "#ecfeff" : "#fff", border: "2px solid #e5e7eb", borderRadius: 10, padding: "6px 12px" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#0e7490" }}>
                      {f.mine ? "You" : f.authorName} · {new Date(f.createdAt).toLocaleString()}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", color: "#1f2937" }}>{f.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} maxLength={4000}
              placeholder="Leave feedback for the student…"
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px", borderRadius: 10, border: "2px solid #fcd34d",
                fontSize: 13, color: "#111", fontFamily: "inherit", resize: "vertical", outline: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
              <button onClick={post} disabled={posting || !draft.trim()} style={{ padding: "7px 16px", borderRadius: 8, border: "none",
                background: posting || !draft.trim() ? "#e5e7eb" : "#d97706", color: posting || !draft.trim() ? "#9ca3af" : "#fff",
                fontWeight: 800, fontSize: 13, cursor: posting || !draft.trim() ? "not-allowed" : "pointer" }}>
                {posting ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
