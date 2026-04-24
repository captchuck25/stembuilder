import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/db.server";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

const BTN: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 28px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  textDecoration: "none",
  border: "none",
};

export default async function TeachersLandingPage() {
  const session = await auth();

  if (session?.user?.id) {
    const db = adminDb();
    const { data: profile } = await db.from("profiles").select("role").eq("id", session.user.id).single();
    if (!profile) redirect("/onboarding");
    if (profile.role === "teacher") redirect("/teachers/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />

      {/* Hero */}
      <main style={{ flex: 1, backgroundImage: "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "80px 40px", textAlign: "center" }}>

          {/* Hero text — white on dark background */}
          <div style={{ marginBottom: 52 }}>
            <div style={{ fontSize: 60, marginBottom: 20, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}>🧑‍🏫</div>
            <h1 style={{ fontSize: 40, fontWeight: 900, color: "#fff", marginBottom: 16, lineHeight: 1.2,
              textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
              STEM Builder for Teachers
            </h1>
            <p style={{ fontSize: 17, color: "rgba(255,255,255,0.88)", maxWidth: 540,
              margin: "0 auto", lineHeight: 1.7, textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
              Create classes, assign challenges, and watch your students progress through
              hands-on STEM tools — all from one dashboard.
            </p>
          </div>

          {/* Feature list */}
          <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap", marginBottom: 52 }}>
            {[
              { icon: "🏫", title: "Class Management", desc: "Create classes and share a simple join code with students" },
              { icon: "📋", title: "Assign Work", desc: "Choose which levels and tools each class can access" },
              { icon: "📊", title: "Track Progress", desc: "See every student's completion, code, and quiz scores" },
            ].map(f => (
              <div key={f.title} style={{ background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
                borderRadius: 20, padding: "28px 24px", width: 200, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>{f.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#111", marginBottom: 6 }}>{f.title}</div>
                <div style={{ fontSize: 13, color: "#444", lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/sign-up" style={{ ...BTN, background: "#2563eb", color: "#fff",
              boxShadow: "0 4px 16px rgba(37,99,235,0.35)", fontSize: 16 }}>
              Get Started Free →
            </Link>
            <Link href="/sign-in" style={{ ...BTN, background: "rgba(255,255,255,0.15)",
              border: "2px solid rgba(255,255,255,0.8)", color: "#fff", fontSize: 16 }}>
              Sign In to Dashboard
            </Link>
          </div>
        </div>
      </main>

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
