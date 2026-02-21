import Image from "next/image";
import Link from "next/link";

import styles from "./page.module.css";

const tiles = [
  {
    label: "Bridge Builder",
    href: "/tools/bridge",
    src: "/ui/bridge-button.png",
  },
];

export default function Home() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          height: 120,
          width: "100%",
          backgroundImage: "url('/ui/header-metal.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            height: "100%",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            <Image
              src="/ui/sb-logo.png"
              alt="STEM Builder"
              width={86}
              height={86}
              style={{ height: "86px", width: "auto" }}
              priority
            />
          </div>
          <nav style={{ display: "flex", gap: 12 }}>
            <Link
              href="/teachers"
              style={{
                border: "1px solid #fff",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                letterSpacing: "0.2px",
                background: "transparent",
              }}
            >
              Teachers
            </Link>
            <Link
              href="/login"
              style={{
                border: "1px solid #fff",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                letterSpacing: "0.2px",
                background: "transparent",
              }}
            >
              Log In
            </Link>
            <Link
              href="/signup"
              style={{
                border: "1px solid #fff",
                color: "#fff",
                padding: "8px 14px",
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
                letterSpacing: "0.2px",
                background: "transparent",
              }}
            >
              Sign Up
            </Link>
          </nav>
        </div>
      </header>
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
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
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
