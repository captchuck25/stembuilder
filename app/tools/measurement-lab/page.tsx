import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  border: "3px solid #1f1f1f",
  borderRadius: 20,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
};

const tools = [
  {
    id: "ruler",
    icon: "📏",
    label: "Ruler Game",
    desc: "Read inches & metric measurements",
    color: "#2563eb",
    href: "/tools/measurement-lab/ruler",
    ready: true,
  },
  {
    id: "dial-caliper",
    icon: "🔩",
    label: "Dial Caliper",
    desc: "Precision measurements to 0.001\"",
    color: "#d97706",
    href: "/tools/measurement-lab/dial-caliper",
    ready: true,
  },
  {
    id: "graduated-cylinder",
    icon: "🧪",
    label: "Graduated Cylinder",
    desc: "Read liquid volume using the meniscus",
    color: "#7c3aed",
    href: "/tools/measurement-lab/graduated-cylinder",
    ready: true,
  },
  {
    id: "triple-beam",
    icon: "⚖️",
    label: "Triple Beam Balance",
    desc: "Measure mass to 0.1 gram",
    color: "#dc2626",
    href: "/tools/measurement-lab/triple-beam",
    ready: true,
  },
];

export default function MeasurementLabPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <SiteHeader />

      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 40px" }}>

          <div style={{ ...CARD, padding: "22px 28px", marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 6px" }}>
              Measurement Lab
            </h1>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#555", margin: 0 }}>
              Practice reading precision measurement instruments used in science and engineering.
            </p>
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "stretch" }}>
            {tools.map(tool => {
              const card = (
                <div
                  key={tool.id}
                  style={{ ...CARD, width: 210, overflow: "hidden", height: "100%",
                    display: "flex", flexDirection: "column",
                    opacity: tool.ready ? 1 : 0.7,
                    cursor: tool.ready ? "pointer" : "default",
                  }}
                >
                  <div style={{ height: 6, background: tool.color }} />
                  <div style={{ padding: "20px 20px 22px" }}>
                    <div style={{ fontSize: 34, marginBottom: 10 }}>{tool.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: "#111", marginBottom: 4 }}>{tool.label}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#666", lineHeight: 1.5, marginBottom: 16 }}>{tool.desc}</div>
                    {tool.ready ? (
                      <span style={{ display: "inline-block", padding: "6px 16px",
                        background: tool.color, color: "#fff",
                        borderRadius: 8, fontSize: 13, fontWeight: 800 }}>
                        Play →
                      </span>
                    ) : (
                      <span style={{ display: "inline-block", padding: "5px 12px",
                        background: "#f3f4f6", border: "2px solid #e5e7eb",
                        borderRadius: 8, fontSize: 12, fontWeight: 700, color: "#9ca3af" }}>
                        Coming Soon
                      </span>
                    )}
                  </div>
                </div>
              );

              return tool.href ? (
                <Link key={tool.id} href={tool.href} style={{ textDecoration: "none", display: "flex" }}>
                  {card}
                </Link>
              ) : card;
            })}
          </div>
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
