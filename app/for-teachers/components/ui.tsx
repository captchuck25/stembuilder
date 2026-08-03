import styles from "../marketing.module.css";

/**
 * Labeled placeholder for a screenshot/photo/video that will be added later.
 * The label doubles as the alt text contract for the eventual asset.
 */
export function MediaSlot({ label, kind = "image" }: { label: string; kind?: "image" | "video" }) {
  return (
    <div className={styles.mediaSlot} role="img" aria-label={`${label} (coming soon)`}>
      <span className={styles.mediaSlotIcon} aria-hidden="true">
        {kind === "video" ? "🎬" : "🖼️"}
      </span>
      <span className={styles.mediaSlotLabel}>{label}</span>
    </div>
  );
}

export function ComingSoon({ children = "Coming soon" }: { children?: React.ReactNode }) {
  return <span className={styles.comingSoon}>{children}</span>;
}
