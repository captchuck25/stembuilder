"use client";

import { useEffect, useRef } from "react";

// Hero promo video: autoplays muted on a loop (the only autoplay browsers
// allow), with controls shown so visitors can unmute the audio track.
// The effect re-asserts muted+play because React doesn't reliably render
// the muted attribute into SSR HTML, which can strand autoplay.

export default function PromoVideo({ src, label }: { src: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => {
      /* autoplay blocked — the poster frame and controls still show */
    });
  }, []);

  return (
    <video
      ref={ref}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      controls
      preload="metadata"
      aria-label={label}
      style={{
        width: "100%",
        display: "block",
        borderRadius: 16,
        border: "2px solid #1f1f1f",
        marginTop: 26,
      }}
    />
  );
}
