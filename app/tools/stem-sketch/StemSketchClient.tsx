"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

type DemoDesign = {
  id: string;
  name: string;
  units: string;
  doc_json: object;
  thumbnail: string | null;
  updated_at: string;
};

export default function StemSketchClient() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const viewAsStudent = searchParams.get("asStudent");
  const demoDesignId = searchParams.get("id");
  const isDemoMode = !!viewAsStudent && !!demoDesignId;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dirtyRef = useRef(false);
  const iframeLoadedRef = useRef(false);
  const [demoDesign, setDemoDesign] = useState<DemoDesign | null>(null);
  const [viewingStudent, setViewingStudent] = useState<{ name: string; email: string } | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);

  const postToSketch = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // Fetch the student's design via the teacher endpoint
  useEffect(() => {
    if (!isDemoMode) return;
    fetch(`/api/teacher/student-work/stem-sketch?designId=${encodeURIComponent(demoDesignId!)}`)
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
  }, [isDemoMode, demoDesignId]);

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

      } else if (type === "STEMSKETCH_SAVE") {
        if (isDemoMode) {
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: "Demo view — saves are disabled while viewing a student's work." });
          return;
        }
        const { name, docJson, units, thumbnail } = e.data as { name: string; docJson: object; units: string; thumbnail: string | null };
        if (!session?.user?.id) {
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: "Sign in to save" });
          return;
        }
        const res = await fetch("/api/stem-sketch/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, docJson, units, thumbnail }),
        });
        if (res.ok) {
          dirtyRef.current = false;
          postToSketch({ type: "STEMSKETCH_SAVE_OK" });
        } else {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          postToSketch({ type: "STEMSKETCH_SAVE_ERR", message: err.error });
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
  }, [session, postToSketch, isDemoMode, demoDesign]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        <Link
          href="/"
          onClick={(e) => {
            if (!isDemoMode && dirtyRef.current) {
              const ok = window.confirm("You have unsaved changes. Leave without saving?");
              if (!ok) e.preventDefault();
            }
          }}
          style={{ border: "1px solid #fff", color: "#fff", padding: "8px 14px",
            borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Home
        </Link>
      </SiteHeader>

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
        onLoad={() => {
          iframeLoadedRef.current = true;
          pushDemoDesign();
        }}
        style={{ flex: 1, border: "none", display: "block" }}
      />

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
    </div>
  );
}
