import { redirect } from "next/navigation";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

export default function StemSketchPage() {
  if (process.env.NODE_ENV !== "development") {
    redirect("/");
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader>
        <Link href="/" style={{ border: "1px solid #fff", color: "#fff", padding: "8px 14px",
          borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          ← Home
        </Link>
      </SiteHeader>

      <iframe
        src="/stem-sketch/index.html"
        title="STEM Sketch"
        style={{ flex: 1, border: "none", display: "block" }}
      />

      <footer style={{ height: 40, width: "100%", backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center", flexShrink: 0 }} />
    </div>
  );
}
