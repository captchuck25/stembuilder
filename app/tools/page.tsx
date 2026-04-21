import Link from "next/link";

export default function ToolsPage() {
  return (
    <main
      style={{
        padding: "56px 24px",
        fontFamily: "system-ui",
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      <h1 style={{ fontSize: 34, marginBottom: 10 }}>Tools</h1>
      <p style={{ fontSize: 16, maxWidth: 720 }}>
        This will be the hub for student tool "avenues" (modules). For now, it's a
        placeholder page.
      </p>

      <ul style={{ marginTop: 18, lineHeight: 1.9 }}>
        <li>Bridge Builder (coming soon)</li>
        <li>Tower Challenge (coming soon)</li>
        <li>Catapult Lab (coming soon)</li>
        <li>STEM Journals (coming soon)</li>
      </ul>

      <p style={{ marginTop: 24 }}>
        <Link href="/" style={{ textDecoration: "underline" }}>
          {"<-"} Back to home
        </Link>
      </p>
    </main>
  );
}
