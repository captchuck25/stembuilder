// Printable orthographic worksheet for a Recreate challenge.
// /tools/stem-sketch/worksheet?challenge=<id>
//
// Server component on purpose: the page emits only the challenge's title,
// precision, and image — refDocJson never reaches the client here.
//
// Layout modeled on a classic drafting sheet (user's reference, 2026-08-17):
// LANDSCAPE letter, one continuous outer border, THIRD-ANGLE dot fields —
// TOP view field above the FRONT view field (left column), RIGHT SIDE field
// beside FRONT (bottom-right), the 3D visual floating top-right — and a
// drafting-style title block strip along the bottom (brand · name · class ·
// date). No boxes around the drawing areas: the dots ARE the drawing areas,
// so the page feels continuous.
//
// Dots are true physical size (CSS inches print 1:1 at 100% scale):
// quarter-inch spacing normally, eighth-inch for eighth-precision
// challenges — never finer than eighths, the platform's floor.

import { getChallenge, PRECISION_LABEL, STAGE_META } from "@/lib/stem-sketch/challenges";
import PrintButton from "./PrintButton";

export default async function WorksheetPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge: challengeId } = await searchParams;
  const challenge = challengeId ? getChallenge(challengeId) : undefined;

  if (!challenge) {
    return (
      <div style={{ padding: 40, fontFamily: "system-ui,sans-serif" }}>
        <h1 style={{ fontSize: 20 }}>Worksheet not found</h1>
        <p>Unknown challenge — open this page from the assignment picker in your class dashboard.</p>
      </div>
    );
  }

  // Dot fields are INLINE SVG patterns, not CSS background tiles: backgrounds
  // get rasterized at screen resolution before printing (tiny black circles
  // smear into gray), while inline SVG stays vector all the way to the
  // printer — tiny but SOLID BLACK dots, like real drafting dot-grid paper.
  // 96 SVG user units = 1in. Spacing: quarter-inch (24u), eighth for
  // eighth-precision challenges (12u). r=0.8u ≈ 0.42 mm dot diameter.
  const dotStep = challenge.precision === "eighth" ? 12 : 24;
  const DotField = ({ id }: { id: string }) => (
    <svg width="100%" height="100%" style={{ display: "block", position: "absolute", inset: 0 }}>
      <defs>
        <pattern id={id} patternUnits="userSpaceOnUse" width={dotStep} height={dotStep}>
          <circle cx={dotStep / 2} cy={dotStep / 2} r="0.8" fill="#000" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
  const DOTS: React.CSSProperties = { position: "relative" };
  // Labeled free-sketch dot field (stage 3 brainstorm ideas).
  const ViewBoxFree = ({ label }: { label: string }) => (
    <div style={DOTS}>
      <span style={FIELD_LABEL}>{label}</span>
      <DotField id={`dots-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} />
    </div>
  );
  const FIELD_LABEL: React.CSSProperties = {
    position: "absolute", top: "-0.22in", left: 0,
    fontSize: "8pt", fontWeight: 800, letterSpacing: "0.6px",
    color: "#9a9a9a", textTransform: "uppercase", whiteSpace: "nowrap",
  };
  const TITLE_CELL: React.CSSProperties = {
    borderLeft: "1.5px solid #444", padding: "0.05in 0.12in",
    display: "flex", flexDirection: "column", justifyContent: "flex-start",
  };
  const CELL_LABEL: React.CSSProperties = {
    fontSize: "7.5pt", color: "#999", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.5px",
  };

  const precisionLine = `measure to the nearest ${PRECISION_LABEL[challenge.precision]
    .toLowerCase().replace("whole inches", "whole inch")}`;

  // Stage 3 — BRAINSTORM sheet: brief summary + task checklist on the left,
  // two open idea-sketch dot fields on the right. Same border/title-block
  // chrome as the orthographic sheet.
  const isBrainstorm = challenge.stage === 3;
  const briefLines = (challenge.brief ?? "").split("\n").map(s => s.trim()).filter(Boolean);
  const kitTasks = (challenge.kit ?? []).filter(k => k.includes("("));

  return (
    <div style={{ background: "#e5e7eb", minHeight: "100vh", fontFamily: "system-ui,sans-serif" }}>
      <style>{`
        @page { size: letter landscape; margin: 0; }
        @media print {
          body { margin: 0; background: #fff !important; }
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; }
        }
      `}</style>

      <div className="no-print" style={{ textAlign: "center", padding: "18px 0" }}>
        <PrintButton />
      </div>

      <div
        className="sheet"
        style={{
          width: "11in", height: "8.5in", margin: "0 auto 30px", background: "#fff",
          boxShadow: "0 6px 30px rgba(0,0,0,0.25)", padding: "0.3in",
          boxSizing: "border-box", color: "#333",
          WebkitPrintColorAdjust: "exact", printColorAdjust: "exact",
        }}>
        {/* Single continuous border around the whole sheet */}
        <div style={{
          border: "1.5px solid #444", height: "100%", boxSizing: "border-box",
          display: "flex", flexDirection: "column",
        }}>
          {isBrainstorm ? (
          /* Stage 3 brainstorm layout: brief + checklist left, idea fields right */
          <div style={{
            flex: 1, display: "grid",
            gridTemplateColumns: "3.4in 1fr", gap: "0.35in",
            padding: "0.42in 0.35in 0.3in",
          }}>
            <div style={{ fontSize: "9pt", color: "#444", lineHeight: 1.5, overflow: "hidden" }}>
              <div style={{ fontSize: "10.5pt", fontWeight: 800, color: "#555", marginBottom: "0.08in" }}>The mission</div>
              {briefLines.map((line, i) =>
                line.startsWith("- ")
                  ? <div key={i} style={{ margin: "0.03in 0 0.03in 0.15in" }}>• {line.slice(2)}</div>
                  : <p key={i} style={{ margin: "0.05in 0" }}>{line}</p>
              )}
              {kitTasks.length > 0 && (
                <>
                  <div style={{ fontSize: "10.5pt", fontWeight: 800, color: "#555", margin: "0.12in 0 0.05in" }}>
                    Tasks — check them off as your design covers each
                  </div>
                  {kitTasks.map((k, i) => (
                    <div key={i} style={{ margin: "0.04in 0" }}>☐ {k}</div>
                  ))}
                </>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: "0.45in" }}>
              <ViewBoxFree label="Idea 1" />
              <ViewBoxFree label="Idea 2" />
            </div>
          </div>
          ) : (
          /* Levels 1-2: third-angle dot fields + 3D visual */
          <div style={{
            flex: 1, display: "grid",
            gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr",
            gap: "0.5in 0.5in", padding: "0.42in 0.35in 0.3in",
          }}>
            {/* TOP view field */}
            <div style={DOTS}>
              <span style={FIELD_LABEL}>Top view</span>
              <DotField id="dots-top" />
            </div>
            {/* 3D visual fills the top-right void. The capture thumbnails are
                already framed tight (home view, user-zoomed at save time), so
                contain — never crop or clip the block. */}
            <div style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {challenge.imagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={challenge.imagePath}
                  alt={`${challenge.title} reference`}
                  style={{
                    width: "100%", height: "100%", objectFit: "contain", objectPosition: "center",
                    filter: "grayscale(1) brightness(1.08)",
                  }}
                />
              )}
            </div>
            {/* FRONT view field */}
            <div style={DOTS}>
              <span style={FIELD_LABEL}>Front view — the face with the word FRONT</span>
              <DotField id="dots-front" />
            </div>
            {/* RIGHT SIDE view field */}
            <div style={DOTS}>
              <span style={FIELD_LABEL}>Right side view</span>
              <DotField id="dots-right" />
            </div>
          </div>
          )}

          {/* Drafting title block */}
          <div style={{ borderTop: "1.5px solid #444", display: "flex", height: "0.62in", flexShrink: 0 }}>
            <div style={{ ...TITLE_CELL, borderLeft: "none", flex: 1.7, justifyContent: "center" }}>
              <div style={{ fontSize: "11pt", fontWeight: 900, letterSpacing: "1px", color: "#9ca3af" }}>
                STEM<span style={{ color: "#c4c9d1" }}>BUILDER</span><span style={{ color: "#8b93a0" }}>.IO</span>
              </div>
              <div style={{ fontSize: "8.5pt", color: "#777" }}>
                {STAGE_META[challenge.stage].name}: <b>{challenge.title}</b> · {precisionLine}
              </div>
            </div>
            <div style={{ ...TITLE_CELL, flex: 1.6 }}>
              <span style={CELL_LABEL}>Name</span>
            </div>
            <div style={{ ...TITLE_CELL, flex: 1 }}>
              <span style={CELL_LABEL}>Class</span>
            </div>
            <div style={{ ...TITLE_CELL, flex: 0.8 }}>
              <span style={CELL_LABEL}>Date</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
