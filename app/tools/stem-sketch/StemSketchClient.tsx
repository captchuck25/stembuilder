"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

export default function StemSketchClient() {
  const { data: session } = useSession();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dirtyRef = useRef(false);

  const postToSketch = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  // Warn before leaving the page when there are unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const handler = async (e: MessageEvent) => {
      const { type } = (e.data ?? {}) as { type?: string };
      if (!type?.startsWith("STEMSKETCH_")) return;

      if (type === "STEMSKETCH_DIRTY") {
        dirtyRef.current = (e.data as { dirty: boolean }).dirty;

      } else if (type === "STEMSKETCH_SAVE") {
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
        if (!session?.user?.id) {
          postToSketch({ type: "STEMSKETCH_LOAD_LIST", designs: [] });
          return;
        }
        const res = await fetch("/api/stem-sketch/designs");
        const designs = res.ok ? await res.json() : [];
        postToSketch({ type: "STEMSKETCH_LOAD_LIST", designs });

      } else if (type === "STEMSKETCH_REQUEST_LOAD") {
        const { id } = e.data as { id: string };
        const res = await fetch(`/api/stem-sketch/designs/${id}`);
        if (res.ok) {
          const design = await res.json();
          postToSketch({ type: "STEMSKETCH_LOAD", name: design.name, docJson: design.doc_json, units: design.units });
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [session, postToSketch]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        <Link
          href="/"
          onClick={(e) => {
            if (dirtyRef.current) {
              const ok = window.confirm("You have unsaved changes. Leave without saving?");
              if (!ok) e.preventDefault();
            }
          }}
          style={{ border: "1px solid #fff", color: "#fff", padding: "8px 14px",
            borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Home
        </Link>
      </SiteHeader>

      <iframe
        ref={iframeRef}
        src="/stem-sketch/index.html"
        title="STEM Sketch"
        style={{ flex: 1, border: "none", display: "block" }}
      />

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
    </div>
  );
}
