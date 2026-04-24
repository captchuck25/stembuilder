"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";

// ─── Types ────────────────────────────────────────────────────────────────────

type Dir = 0 | 1 | 2 | 3; // 0=North 1=East 2=South 3=West
type TileColor = "green" | "blue" | "yellow" | "red";
type ActionType = "move_forward" | "turn_left" | "turn_right" | "stop";

type Block =
  | { id: string; type: "move_forward" }
  | { id: string; type: "turn_left" }
  | { id: string; type: "turn_right" }
  | { id: string; type: "stop" }
  | { id: string; type: "if_color"; color: TileColor; action: ActionType };

interface Robot { row: number; col: number; dir: Dir }

// ─── Constants ────────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 8;
const TILE = 56;
const CW = COLS * TILE;
const CH = ROWS * TILE;

const START: Robot = { row: 3, col: 1, dir: 1 };

// Activity 1 tile map — L-shaped path with colored reaction tiles
const TILE_MAP: Record<string, TileColor> = {
  "3,1": "green", "3,2": "green", "3,3": "green",
  "3,4": "blue",                                   // → turn right (now facing South)
  "4,4": "green", "5,4": "green",
  "6,4": "yellow",                                 // → turn left (now facing East)
  "6,5": "green", "6,6": "green",
  "6,7": "red",                                    // → stop / finish
};
const FINISH = "6,7";

const TILE_HEX: Record<TileColor, string> = {
  green: "#15803d", blue: "#1d4ed8", yellow: "#ca8a04", red: "#b91c1c",
};
const TILE_LABEL: Record<TileColor, string> = {
  green: "GO", blue: "TURN R", yellow: "TURN L", red: "STOP",
};

const DIR_DELTA: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];
const DIR_ANGLE: Record<Dir, number> = { 0: -Math.PI / 2, 1: 0, 2: Math.PI / 2, 3: Math.PI };

function key(r: number, c: number) { return `${r},${c}`; }
function uid() { return Math.random().toString(36).slice(2, 8); }
function wait(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE = [
  {
    category: "Motion", color: "#2563eb",
    blocks: [
      { type: "move_forward", label: "move_forward()" },
      { type: "turn_left",    label: "turn_left()" },
      { type: "turn_right",   label: "turn_right()" },
      { type: "stop",         label: "stop()" },
    ],
  },
  {
    category: "Sensor", color: "#7c3aed",
    blocks: [
      { type: "if_color", label: "if color_sensor() ==" },
    ],
  },
];

const BLOCK_COLOR: Record<string, string> = {
  move_forward: "#2563eb", turn_left: "#2563eb", turn_right: "#2563eb",
  stop: "#dc2626", if_color: "#7c3aed",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RobotLabPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runRef    = useRef(false);
  const robotRef  = useRef<Robot>({ ...START });

  const [robot,   setRobot]   = useState<Robot>({ ...START });
  const [script,  setScript]  = useState<Block[]>([]);
  const [running, setRunning] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [sensor,  setSensor]  = useState<TileColor | null>(null);
  const [success, setSuccess] = useState(false);
  const [oob,     setOob]     = useState(false); // out of bounds

  // ─── Canvas ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, CW, CH);

    // Grid dots
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.beginPath();
        ctx.arc(c * TILE + TILE / 2, r * TILE + TILE / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Tiles
    for (const [k, color] of Object.entries(TILE_MAP)) {
      const [r, c] = k.split(",").map(Number);
      const x = c * TILE + 4;
      const y = r * TILE + 4;
      const w = TILE - 8;
      const h = TILE - 8;

      // Tile body
      ctx.fillStyle = TILE_HEX[color];
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();

      // Tile glow border
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 8px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(TILE_LABEL[color], c * TILE + TILE / 2, r * TILE + TILE - 7);

      // Finish flag
      if (k === FINISH) {
        ctx.fillStyle = "#fff";
        ctx.font = "16px serif";
        ctx.textAlign = "center";
        ctx.fillText("🏁", c * TILE + TILE / 2, r * TILE + TILE / 2 + 3);
      }
    }

    // START label
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "bold 8px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("START", START.col * TILE + TILE / 2, START.row * TILE + 10);

    // Robot
    const rx = robot.col * TILE + TILE / 2;
    const ry = robot.row * TILE + TILE / 2;
    const angle = DIR_ANGLE[robot.dir];
    const sz = 16;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(2, 3, sz * 0.9, sz * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = success ? "#10b981" : oob ? "#ef4444" : "#e2e8f0";
    ctx.strokeStyle = success ? "#065f46" : oob ? "#7f1d1d" : "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sz, 0);
    ctx.lineTo(-sz * 0.65, -sz * 0.72);
    ctx.lineTo(-sz * 0.3, 0);
    ctx.lineTo(-sz * 0.65, sz * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front dot
    ctx.fillStyle = success ? "#34d399" : oob ? "#fca5a5" : "#3b82f6";
    ctx.beginPath();
    ctx.arc(sz * 0.55, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }, [robot, success, oob]);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function getSensor(r: Robot): TileColor | null {
    return TILE_MAP[key(r.row, r.col)] ?? null;
  }

  function applyRobot(r: Robot) {
    robotRef.current = r;
    setRobot(r);
    setSensor(getSensor(r));
  }

  // ─── Execution ───────────────────────────────────────────────────────────

  async function execBlock(block: Block, r: Robot): Promise<{ robot: Robot; halt: boolean }> {
    switch (block.type) {
      case "move_forward": {
        const [dr, dc] = DIR_DELTA[r.dir];
        const nr = r.row + dr;
        const nc = r.col + dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) {
          setOob(true); return { robot: r, halt: true };
        }
        const next = { ...r, row: nr, col: nc };
        applyRobot(next);
        if (key(nr, nc) === FINISH) { setSuccess(true); return { robot: next, halt: true }; }
        return { robot: next, halt: false };
      }
      case "turn_left": {
        const next = { ...r, dir: ((r.dir + 3) % 4) as Dir };
        applyRobot(next);
        return { robot: next, halt: false };
      }
      case "turn_right": {
        const next = { ...r, dir: ((r.dir + 1) % 4) as Dir };
        applyRobot(next);
        return { robot: next, halt: false };
      }
      case "stop":
        return { robot: r, halt: true };
      case "if_color": {
        const current = getSensor(r);
        if (current === block.color) {
          return execBlock({ id: "action", type: block.action } as Block, r);
        }
        return { robot: r, halt: false };
      }
    }
  }

  async function runProgram() {
    if (running || script.length === 0) return;
    runRef.current = true;
    setRunning(true);
    setSuccess(false);
    setOob(false);

    let r: Robot = { ...robotRef.current };
    let loops = 0;

    outer: while (runRef.current && loops < 120) {
      loops++;
      for (let i = 0; i < script.length; i++) {
        if (!runRef.current) break outer;
        setActiveIdx(i);
        await wait(420);
        const res = await execBlock(script[i], r);
        r = res.robot;
        if (res.halt) { runRef.current = false; break outer; }
      }
    }

    runRef.current = false;
    setRunning(false);
    setActiveIdx(null);
  }

  function stopProgram() {
    runRef.current = false;
    setRunning(false);
    setActiveIdx(null);
  }

  function resetProgram() {
    stopProgram();
    const s = { ...START };
    robotRef.current = s;
    setRobot(s);
    setSensor(null);
    setSuccess(false);
    setOob(false);
  }

  // ─── Script editing ──────────────────────────────────────────────────────

  function addBlock(type: string) {
    if (running) return;
    const block: Block = type === "if_color"
      ? { id: uid(), type: "if_color", color: "blue", action: "turn_right" }
      : { id: uid(), type: type as Block["type"] } as Block;
    setScript(prev => [...prev, block]);
  }

  function removeBlock(id: string) {
    if (running) return;
    setScript(prev => prev.filter(b => b.id !== id));
  }

  function updateIfColor(id: string, field: "color" | "action", value: string) {
    setScript(prev => prev.map(b =>
      b.id === id && b.type === "if_color" ? { ...b, [field]: value } : b
    ));
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <SiteHeader />

      <main style={{ flex: 1, background: "#0f172a", padding: "20px" }}>
        {/* Title bar */}
        <div style={{ maxWidth: 1160, margin: "0 auto 16px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <Link href="/tools/code-lab" style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, textDecoration: "none" }}>
            ← Code Lab
          </Link>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: "#fff", margin: 0 }}>
              🤖 Robot Logic Lab — Activity 1: Color Sensor Reactions
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "2px 0 0" }}>
              Program the robot to react to colored floor tiles and reach the finish zone
            </p>
          </div>
        </div>

        {/* 3-column layout */}
        <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid",
          gridTemplateColumns: "176px 1fr 264px", gap: 14, alignItems: "start" }}>

          {/* ── LEFT: Block palette ── */}
          <div style={{ background: "#1e293b", borderRadius: 14, padding: "14px 12px",
            border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)",
              textTransform: "uppercase", letterSpacing: "0.9px", marginBottom: 12 }}>
              Blocks
            </div>

            {PALETTE.map(cat => (
              <div key={cat.category} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: cat.color,
                  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
                  {cat.category}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {cat.blocks.map(b => (
                    <button key={b.type} onClick={() => addBlock(b.type)} disabled={running}
                      style={{ padding: "7px 10px", borderRadius: 7, border: "none",
                        background: running ? "rgba(255,255,255,0.04)" : cat.color,
                        color: running ? "rgba(255,255,255,0.25)" : "#fff",
                        fontSize: 11, fontWeight: 700, cursor: running ? "not-allowed" : "pointer",
                        textAlign: "left", lineHeight: 1.3 }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Tile legend */}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
                Tile Guide
              </div>
              {(Object.entries(TILE_LABEL) as [TileColor, string][]).map(([color, label]) => (
                <div key={color} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                  <div style={{ width: 11, height: 11, borderRadius: 2, background: TILE_HEX[color], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                    <strong style={{ color: TILE_HEX[color] }}>{color}</strong> — {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── CENTER: Canvas + controls ── */}
          <div>
            <div style={{ background: "#1e293b", borderRadius: 14, padding: 10,
              border: "1px solid rgba(255,255,255,0.08)", marginBottom: 10 }}>
              <canvas ref={canvasRef} width={CW} height={CH}
                style={{ display: "block", borderRadius: 8, width: "100%", imageRendering: "pixelated" }} />
            </div>

            {/* Feedback banners */}
            {success && (
              <div style={{ background: "#064e3b", border: "2px solid #10b981", borderRadius: 10,
                padding: "10px 16px", marginBottom: 10, textAlign: "center" }}>
                <span style={{ color: "#10b981", fontWeight: 900, fontSize: 15 }}>
                  🎉 Challenge Complete! Robot reached the finish zone.
                </span>
              </div>
            )}
            {oob && (
              <div style={{ background: "#450a0a", border: "2px solid #ef4444", borderRadius: 10,
                padding: "10px 16px", marginBottom: 10, textAlign: "center" }}>
                <span style={{ color: "#ef4444", fontWeight: 900, fontSize: 15 }}>
                  💥 Robot went out of bounds! Reset and try again.
                </span>
              </div>
            )}

            {/* Controls */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={runProgram} disabled={running || script.length === 0}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none",
                  background: running || script.length === 0 ? "rgba(255,255,255,0.07)" : "#16a34a",
                  color: running || script.length === 0 ? "rgba(255,255,255,0.25)" : "#fff",
                  fontWeight: 800, fontSize: 13, cursor: running || script.length === 0 ? "not-allowed" : "pointer" }}>
                ▶ Run
              </button>
              <button onClick={stopProgram} disabled={!running}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none",
                  background: running ? "#dc2626" : "rgba(255,255,255,0.07)",
                  color: running ? "#fff" : "rgba(255,255,255,0.25)",
                  fontWeight: 800, fontSize: 13, cursor: running ? "pointer" : "not-allowed" }}>
                ■ Stop
              </button>
              <button onClick={resetProgram}
                style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none",
                  background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)",
                  fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
                ↺ Reset
              </button>
            </div>
          </div>

          {/* ── RIGHT: Sensor + Script ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            {/* Sensor readout */}
            <div style={{ background: "#1e293b", borderRadius: 12, padding: "12px 14px",
              border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                Sensor Readout
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8,
                background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, transition: "background 200ms",
                  background: sensor ? TILE_HEX[sensor] : "rgba(255,255,255,0.15)" }} />
                <code style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                  color_sensor(){" = "}
                  <span style={{ color: sensor ? TILE_HEX[sensor] : "rgba(255,255,255,0.35)",
                    fontWeight: 700 }}>
                    {sensor ? `"${sensor}"` : "none"}
                  </span>
                </code>
              </div>
            </div>

            {/* Script panel */}
            <div style={{ background: "#1e293b", borderRadius: 12, padding: "12px 14px",
              border: "1px solid rgba(255,255,255,0.08)", minHeight: 300 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.35)",
                  textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  My Script
                </div>
                {script.length > 0 && !running && (
                  <button onClick={() => setScript([])}
                    style={{ fontSize: 10, background: "rgba(255,255,255,0.07)", border: "none",
                      color: "rgba(255,255,255,0.4)", borderRadius: 4, padding: "2px 7px", cursor: "pointer" }}>
                    Clear
                  </button>
                )}
              </div>

              {script.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 0",
                  color: "rgba(255,255,255,0.18)", fontSize: 12, lineHeight: 1.6 }}>
                  Click blocks on the left<br />to build your script
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {script.map((block, idx) => {
                    const isActive = activeIdx === idx;
                    const bg = BLOCK_COLOR[block.type] ?? "#475569";
                    return (
                      <div key={block.id} style={{ borderRadius: 7, padding: "6px 8px",
                        background: isActive ? "#fef9c3" : bg,
                        border: isActive ? "2px solid #eab308" : "2px solid rgba(255,255,255,0.06)",
                        display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
                        transition: "all 150ms" }}>
                        {block.type === "if_color" ? (
                          <>
                            <span style={{ fontSize: 11, fontWeight: 700,
                              color: isActive ? "#1f1f1f" : "#e2e8f0" }}>
                              if color ==
                            </span>
                            <select value={block.color}
                              onChange={e => updateIfColor(block.id, "color", e.target.value)}
                              disabled={running}
                              style={{ fontSize: 11, borderRadius: 4, border: "none",
                                padding: "1px 4px", background: "#fff", fontWeight: 700, color: "#111" }}>
                              <option value="blue">blue</option>
                              <option value="yellow">yellow</option>
                              <option value="red">red</option>
                              <option value="green">green</option>
                            </select>
                            <span style={{ fontSize: 11, color: isActive ? "#1f1f1f" : "#e2e8f0" }}>→</span>
                            <select value={block.action}
                              onChange={e => updateIfColor(block.id, "action", e.target.value as ActionType)}
                              disabled={running}
                              style={{ fontSize: 11, borderRadius: 4, border: "none",
                                padding: "1px 4px", background: "#fff", fontWeight: 700, color: "#111" }}>
                              <option value="move_forward">move_forward</option>
                              <option value="turn_left">turn_left</option>
                              <option value="turn_right">turn_right</option>
                              <option value="stop">stop</option>
                            </select>
                          </>
                        ) : (
                          <span style={{ fontSize: 12, fontWeight: 700,
                            color: isActive ? "#1f1f1f" : "#e2e8f0" }}>
                            {block.type}()
                          </span>
                        )}
                        {!running && (
                          <button onClick={() => removeBlock(block.id)}
                            style={{ marginLeft: "auto", background: "rgba(0,0,0,0.25)",
                              border: "none", color: "rgba(255,255,255,0.7)", borderRadius: 4,
                              width: 17, height: 17, fontSize: 10, cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Hint card */}
            <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)",
              borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: "#eab308", marginBottom: 5 }}>
                💡 Your Mission
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
                Build a script that reacts to each colored tile. Use{" "}
                <span style={{ color: "#a5b4fc", fontWeight: 700 }}>if color_sensor ==</span>{" "}
                blocks to turn or stop at the right tiles, and{" "}
                <span style={{ color: "#93c5fd", fontWeight: 700 }}>move_forward()</span>{" "}
                to keep moving. Reach the 🏁 to win!
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer style={{ height: 40, width: "100%",
        backgroundImage: "url('/ui/footer-metal.png')",
        backgroundSize: "cover", backgroundPosition: "center" }} />
    </div>
  );
}
