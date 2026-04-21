import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import SiteHeader from "@/app/components/SiteHeader";

export default async function CodeLabPage() {
  const { userId } = await auth();
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteHeader>
        {!userId && (
          <Link href="/teachers" style={{ border: "1px solid #fff", color: "#fff", padding: "8px 14px",
            borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none",
            letterSpacing: "0.2px", background: "transparent" }}>
            Teachers
          </Link>
        )}
      </SiteHeader>

      {/* Main */}
      <main
        style={{
          flex: 1,
          width: "100%",
          backgroundImage: "url('/ui/bg-tools-pattern.png')",
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 40px" }}>

          {/* Page header card */}
          <div style={{ background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
            borderRadius: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            padding: "22px 28px", marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 6px", letterSpacing: "-0.3px" }}>
              Code Lab
            </h1>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#555", margin: 0 }}>
              Learn to program by solving real challenges. Choose your coding environment below.
            </p>
          </div>

          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {/* Python tile */}
            <Link
              href="/tools/code-lab/python"
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  width: 280,
                  height: 180,
                  borderRadius: 20,
                  background:
                    "linear-gradient(135deg, #1a1a2e 0%, #16213e 55%, #0f3460 100%)",
                  border: "2px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 8px 28px rgba(0,0,0,0.30)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                  transition: "transform 160ms ease, box-shadow 160ms ease",
                }}
              >
                <span
                  style={{
                    fontSize: 40,
                    lineHeight: 1,
                  }}
                >
                  🐍
                </span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#fff",
                    letterSpacing: "0.3px",
                  }}
                >
                  Python
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 700,
                  }}
                >
                  Maze Challenges
                </span>
              </div>
            </Link>

            {/* Blocks tile */}
            <Link href="/tools/code-lab/blocks" style={{ textDecoration: "none" }}>
              <div
                style={{
                  width: 280,
                  height: 180,
                  borderRadius: 20,
                  background:
                    "linear-gradient(135deg, #1e3a5f 0%, #2563eb 55%, #60a5fa 100%)",
                  border: "2px solid rgba(255,255,255,0.15)",
                  boxShadow: "0 8px 28px rgba(0,0,0,0.30)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  cursor: "pointer",
                  transition: "transform 160ms ease, box-shadow 160ms ease",
                }}
              >
                <span style={{ fontSize: 40, lineHeight: 1 }}>🧩</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: "#fff",
                    letterSpacing: "0.3px",
                  }}
                >
                  Blocks
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255,255,255,0.85)",
                    fontWeight: 700,
                  }}
                >
                  Visual Block Coding
                </span>
              </div>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          height: 40,
          width: "100%",
          backgroundImage: "url('/ui/footer-metal.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    </div>
  );
}
