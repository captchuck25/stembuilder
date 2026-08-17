// Printable orthographic worksheet for a Recreate challenge.
// /tools/stem-sketch/worksheet?challenge=<id>
//
// Server component on purpose: the page emits only the challenge's title,
// precision, and image — refDocJson never reaches the client here. Teachers
// open it from the challenge picker and hit Print (US Letter, portrait).
//
// Layout: THIRD-ANGLE projection — TOP directly above FRONT, RIGHT SIDE
// beside FRONT, so aligned edges teach why the views sit where they do.
// Boxes are TRUE 1:1 scale (every challenge block is ≤3in; CSS physical
// units print at real size), so a student can stand the block on the paper.
// Grid is eighth-inch (the platform's precision floor) in very light gray
// with whole inches slightly darker — all grayscale, photocopier-safe.

import { getChallenge, PRECISION_LABEL } from "@/lib/stem-sketch/challenges";
import PrintButton from "./PrintButton";

const BOX = "3.7in";
const GRID_BG: React.CSSProperties = {
  backgroundImage: [
    "linear-gradient(to right, #bfbfbf 1px, transparent 1px)",
    "linear-gradient(to bottom, #bfbfbf 1px, transparent 1px)",
    "linear-gradient(to right, #e6e6e6 1px, transparent 1px)",
    "linear-gradient(to bottom, #e6e6e6 1px, transparent 1px)",
  ].join(", "),
  backgroundSize: "1in 1in, 1in 1in, 0.125in 0.125in, 0.125in 0.125in",
};

const CAPTION: React.CSSProperties = {
  fontSize: "10pt", fontWeight: 800, color: "#555", letterSpacing: "0.5px",
  margin: "0 0 0.06in", textTransform: "uppercase",
};

function ViewBox({ label, sub }: { label: string; sub?: string }) {
  return (
    <div>
      <div style={CAPTION}>
        {label}
        {sub && <span style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, color: "#888" }}> — {sub}</span>}
      </div>
      <div style={{ width: BOX, height: BOX, border: "1.5px solid #999", ...GRID_BG }} />
    </div>
  );
}

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

  const precisionLine = `Measure to the nearest ${PRECISION_LABEL[challenge.precision].toLowerCase().replace("whole inches", "whole inch")}`;

  return (
    <div style={{ background: "#e5e7eb", minHeight: "100vh", fontFamily: "system-ui,sans-serif" }}>
      <style>{`
        @page { size: letter portrait; margin: 0; }
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
          width: "8.5in", minHeight: "11in", margin: "0 auto 30px", background: "#fff",
          boxShadow: "0 6px 30px rgba(0,0,0,0.25)", padding: "0.35in",
          boxSizing: "border-box", color: "#333",
        }}>
        {/* Name strip — top of the page */}
        <div style={{ display: "flex", gap: "0.35in", marginBottom: "0.25in", fontSize: "10.5pt", color: "#666" }}>
          <div style={{ flex: 2, borderBottom: "1px solid #999", paddingBottom: "0.02in" }}>Name:</div>
          <div style={{ flex: 1.2, borderBottom: "1px solid #999", paddingBottom: "0.02in" }}>Class:</div>
          <div style={{ flex: 1, borderBottom: "1px solid #999", paddingBottom: "0.02in" }}>Date:</div>
        </div>

        {/* Header — wordmark left, title center */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.25in", marginBottom: "0.15in" }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: "15pt", fontWeight: 900, letterSpacing: "1.5px", color: "#9ca3af" }}>
              STEM<span style={{ color: "#c4c9d1" }}>BUILDER</span>
            </div>
            <div style={{ fontSize: "8pt", color: "#b0b5bd", letterSpacing: "0.5px" }}>stembuilder.io · STEM Sketch</div>
          </div>
          <div style={{ flex: 1, paddingTop: "0.02in" }}>
            <div style={{ fontSize: "16pt", fontWeight: 900, color: "#444" }}>
              Recreate: {challenge.title}
            </div>
            <div style={{ fontSize: "10pt", color: "#777", marginTop: "0.03in" }}>
              {precisionLine} · draw all three views, then build it in STEM Sketch
            </div>
          </div>
        </div>

        {/* Third-angle projection: TOP above FRONT; RIGHT SIDE beside FRONT.
            The cell beside TOP holds the 3D visual, filling the whole void. */}
        <div style={{ display: "grid", gridTemplateColumns: `${BOX} ${BOX}`, gap: "0.18in 0.35in", justifyContent: "center" }}>
          <ViewBox label="Top View" sub="edges line up with the front view below" />
          {challenge.imagePath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={challenge.imagePath}
              alt={`${challenge.title} reference`}
              style={{
                width: "100%", height: "100%", objectFit: "cover", objectPosition: "center",
                filter: "grayscale(1) brightness(1.1)", alignSelf: "stretch",
              }}
            />
          ) : <div />}
          <ViewBox label="Front View" sub="the face with the word FRONT" />
          <ViewBox label="Right Side View" />
        </div>

      </div>
    </div>
  );
}
