"use client";

import { useState } from "react";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

// Structures hub: one front door for the truss tools. Tabs switch the panel;
// each panel opens the actual tool. Truss Math is reserved for the upcoming
// explainer (the math behind trusses) and stays a disabled tab until then.

type TabId = "bridge" | "tower" | "math";

const TABS: {
  id: TabId;
  label: string;
  emoji: string;
  soon?: boolean;
  title: string;
  blurb: string;
  points: string[];
  href?: string;
  cta?: string;
  image?: string;
  imageAlt?: string;
}[] = [
  {
    id: "bridge",
    label: "Bridge Builder",
    emoji: "🌉",
    title: "Bridge Builder",
    blurb:
      "Design a truss bridge across a canyon, then send a truck across it and watch the physics play out. Members stretch and compress, color-shift under stress, and fail if the design can't take it.",
    points: [
      "Pick a span from 20 to 100 ft and a truck load up to 30 tons",
      "Six classic truss guides or go freestyle",
      "Live stress colors, a deflecting deck, and a real collapse when it fails",
      "Every design has a price — the cheapest bridge that holds wins",
    ],
    href: "/tools/bridge",
    cta: "Open Bridge Builder",
    image: "/marketing/bridge-builder/gallery-1.png",
    imageAlt: "Bridge Builder stress test",
  },
  {
    id: "tower",
    label: "Tower Builder",
    emoji: "🗼",
    title: "Tower Builder",
    blurb:
      "Build a lattice tower on a limited footprint, then lower a press plate onto it and ramp up the crush load. Same steel, same joints, same costs as the bridge — a different problem to solve.",
    points: [
      "Choose a height from 20 to 60 ft and a footprint of 10, 15, or 20 ft",
      "Zigzag, X-braced, and tapered guides or go freestyle",
      "Watch the load climb in pounds until the tower holds — or lets go",
      "Failed towers report the load they gave out at, so every attempt teaches something",
    ],
    href: "/tools/tower",
    cta: "Open Tower Builder",
    image: "/marketing/tower-builder/gallery-1.png",
    imageAlt: "Tower Builder crush test",
  },
  {
    id: "math",
    label: "Truss Math",
    emoji: "📐",
    soon: true,
    title: "Truss Math",
    blurb:
      "Coming soon: the math behind the tools. Why triangles are rigid, how a joint balances its forces, tension versus compression, and why long skinny members buckle.",
    points: [
      "Method of joints, one step at a time",
      "Worked examples pulled straight from the bridge and tower",
      "Practice problems that feed back into your designs",
    ],
  },
];

export default function StructuresPage() {
  const [active, setActive] = useState<TabId>("bridge");
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader />
      <main
        style={{
          flex: 1,
          width: "100%",
          backgroundImage: "url('/ui/bg-tools-pattern.png')",
          backgroundRepeat: "repeat",
          backgroundSize: "auto",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px 60px" }}>
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
              overflow: "hidden",
              fontFamily: "system-ui, sans-serif",
              color: "#111",
            }}
          >
            <div style={{ padding: "26px 30px 0" }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.2, color: "#64748b", textTransform: "uppercase" }}>
                Engineering
              </div>
              <h1 style={{ margin: "4px 0 6px", fontSize: 34, fontWeight: 900 }}>Structures</h1>
              <p style={{ margin: 0, fontSize: 15, color: "#475569", maxWidth: 760, lineHeight: 1.55 }}>
                Design it, price it, test it to failure. Pick a challenge below.
              </p>
            </div>

            {/* Tabs */}
            <div
              role="tablist"
              aria-label="Structures tools"
              style={{
                display: "flex",
                gap: 6,
                padding: "22px 30px 0",
                borderBottom: "2px solid #e2e8f0",
                flexWrap: "wrap",
              }}
            >
              {TABS.map((t) => {
                const isActive = t.id === active;
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActive(t.id)}
                    style={{
                      appearance: "none",
                      border: "none",
                      borderBottom: isActive ? "3px solid #2563eb" : "3px solid transparent",
                      marginBottom: -2,
                      background: "transparent",
                      padding: "10px 16px 12px",
                      fontSize: 15,
                      fontWeight: 800,
                      color: isActive ? "#1d4ed8" : t.soon ? "#94a3b8" : "#334155",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span aria-hidden>{t.emoji}</span>
                    {t.label}
                    {t.soon ? (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          padding: "2px 7px",
                          borderRadius: 999,
                          background: "#f1f5f9",
                          color: "#64748b",
                          textTransform: "uppercase",
                        }}
                      >
                        Soon
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Panel */}
            <div
              role="tabpanel"
              style={{
                display: "grid",
                gridTemplateColumns: tab.image ? "minmax(0, 1.05fr) minmax(0, 1fr)" : "1fr",
                gap: 30,
                padding: "28px 30px 32px",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 10px", fontSize: 26, fontWeight: 900 }}>
                  {tab.title}
                </h2>
                <p style={{ margin: "0 0 14px", fontSize: 15, lineHeight: 1.6, color: "#334155" }}>
                  {tab.blurb}
                </p>
                <ul style={{ margin: "0 0 22px", paddingLeft: 20, listStyle: "disc", color: "#334155", fontSize: 14, lineHeight: 1.7 }}>
                  {tab.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                {tab.href && tab.cta ? (
                  <Link
                    href={tab.href}
                    style={{
                      display: "inline-block",
                      background: "#2563eb",
                      color: "#fff",
                      padding: "12px 22px",
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: 15,
                      textDecoration: "none",
                      boxShadow: "0 6px 14px rgba(37,99,235,0.3)",
                    }}
                  >
                    {tab.cta} →
                  </Link>
                ) : (
                  <span
                    style={{
                      display: "inline-block",
                      background: "#f1f5f9",
                      color: "#64748b",
                      padding: "12px 22px",
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    Coming soon
                  </span>
                )}
              </div>
              {tab.image ? (
                <div
                  style={{
                    borderRadius: 12,
                    overflow: "hidden",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
                    background: "#f8fafc",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tab.image}
                    alt={tab.imageAlt ?? tab.title}
                    style={{ display: "block", width: "100%", height: "auto" }}
                  />
                </div>
              ) : null}
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
