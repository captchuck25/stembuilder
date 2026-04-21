"use client";

import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { upsertProfile } from "@/lib/profile";

export default function OnboardingPage() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);

  if (!isLoaded) return null;
  if (!user) { router.push("/"); return null; }

  async function choose(role: "teacher" | "student") {
    if (!user || selecting) return;
    setSelecting(true);
    await upsertProfile({
      id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      name: user.fullName ?? user.firstName ?? "User",
      role,
    });
    router.push(role === "teacher" ? "/teachers/dashboard" : "/student/dashboard");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundImage: "url('/ui/bg-tools-pattern.png')",
      backgroundRepeat: "repeat",
      padding: "40px 20px",
    }}>
      <div style={{
        background: "rgba(255,255,255,0.97)",
        border: "3px solid #1f1f1f",
        borderRadius: 24,
        boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
        padding: "48px 40px",
        maxWidth: 560,
        width: "100%",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", marginBottom: 8 }}>
          Welcome to STEM Builder
        </h1>
        <p style={{ fontSize: 15, color: "#555", marginBottom: 36 }}>
          Are you joining as a teacher or a student?
        </p>

        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap" }}>
          {/* Teacher */}
          <button
            onClick={() => choose("teacher")}
            disabled={selecting}
            style={{
              width: 200,
              padding: "28px 20px",
              borderRadius: 20,
              border: "3px solid #1f1f1f",
              background: "linear-gradient(135deg,#1e3a5f,#2563eb)",
              color: "#fff",
              cursor: selecting ? "not-allowed" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              transition: "transform 150ms ease, box-shadow 150ms ease",
              opacity: selecting ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!selecting) (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          >
            <span style={{ fontSize: 40 }}>🧑‍🏫</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Teacher</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
              Create classes, assign work, track progress
            </span>
          </button>

          {/* Student */}
          <button
            onClick={() => choose("student")}
            disabled={selecting}
            style={{
              width: 200,
              padding: "28px 20px",
              borderRadius: 20,
              border: "3px solid #1f1f1f",
              background: "linear-gradient(135deg,#14532d,#16a34a)",
              color: "#fff",
              cursor: selecting ? "not-allowed" : "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
              transition: "transform 150ms ease, box-shadow 150ms ease",
              opacity: selecting ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!selecting) (e.currentTarget as HTMLElement).style.transform = "scale(1.04)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          >
            <span style={{ fontSize: 40 }}>🎒</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>Student</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>
              Join a class and complete assignments
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
