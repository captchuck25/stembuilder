"use client";

import { useRef } from "react";
import styles from "../marketing.module.css";

// Gallery image that enlarges in a lightbox <dialog> on click (native Esc +
// backdrop-click to close, same conventions as the quick-view modal).

export default function GalleryImage({ src, alt }: { src: string; alt: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Enlarge: ${alt}`}
        title="Click to enlarge"
        style={{
          padding: 0,
          border: "none",
          background: "none",
          display: "block",
          width: "100%",
          cursor: "zoom-in",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{
            width: "100%",
            height: "auto",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            display: "block",
          }}
        />
      </button>

      <dialog
        ref={dialogRef}
        className={`${styles.dialog} ${styles.dialogWide}`}
        aria-label={alt}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        <button
          type="button"
          className={styles.dialogClose}
          aria-label="Close enlarged image"
          onClick={() => dialogRef.current?.close()}
        >
          ✕
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
        />
      </dialog>
    </>
  );
}
