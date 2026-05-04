import Image from "next/image";
import Link from "next/link";
import SiteHeader from "./components/SiteHeader";
import { auth } from "@/auth";
import { adminDb } from "@/lib/db.server";

import styles from "./page.module.css";

const tiles = [
  {
    label: "Bridge Builder",
    href: "/tools/bridge",
    src: "/ui/bridge-button.png",
  },
  {
    label: "Code Lab",
    href: "/tools/code-lab",
    src: "/ui/codelab.png",
  },
  {
    label: "Measurement Lab",
    href: "/tools/measurement-lab",
    src: "/ui/measurement-button.png",
  },
  {
    label: "STEM Sketch",
    href: "/tools/stem-sketch",
    src: "/ui/stem_sketch.png",
  },
];

export default async function Home() {
  const session = await auth();
  let isTeacher = false;
  if (session?.user?.id) {
    const { data } = await adminDb()
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .single();
    isTeacher = data?.role === "teacher";
  }
  const showTeachersBtn = !session?.user || isTeacher;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader>
        {showTeachersBtn && (
          <Link href="/teachers" style={{ border: "1px solid #fff", color: "#fff", padding: "8px 14px",
            borderRadius: 999, fontWeight: 600, fontSize: 14, textDecoration: "none",
            letterSpacing: "0.2px", background: "transparent" }}>
            Teachers
          </Link>
        )}
      </SiteHeader>
      <main
        style={{
          flex: 1,
          width: "100%",
          backgroundImage: "url('/ui/bg-tools-pattern.png')",
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "60px 40px" }}>
          <div className={styles.container}>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
              {tiles.map((tile) => (
                <Link key={tile.label} href={tile.href} className={styles.tile}>
                  <Image
                    src={tile.src}
                    alt={tile.label}
                    width={420}
                    height={140}
                    className={styles.image}
                    priority
                    unoptimized
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
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
