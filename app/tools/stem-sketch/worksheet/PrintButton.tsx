"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: "10px 22px", borderRadius: 10, border: "none", cursor: "pointer",
        background: "#0891b2", color: "#fff", fontWeight: 800, fontSize: 14,
      }}>
      🖨 Print worksheet
    </button>
  );
}
