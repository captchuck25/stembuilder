"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { MODULES } from "./modules";
import { ALL_BLOCKS, type BlockDef } from "./engine/blocks";
import {
  compileScript,
  applyStep,
  makeInitialState,
  type ScriptNode,
  type GameState,
  type ExecutionStep,
} from "./engine/runtime";

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID        = 10;
const CELL        = 40;
const CANVAS_PX   = GRID * CELL; // 400
const STEP_MS     = 220;
const STORAGE_KEY = "block_lab_progress";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Progress {
  completedChallenges: Record<string, boolean>;
  completedModules:    Record<number, boolean>;
  savedScripts:        Record<string, ScriptNode[]>;
  quizScores:          Record<number, number>;
}

type Phase =
  | { tag: "overview" }
  | { tag: "intro";     mi: number }
  | { tag: "challenge"; mi: number; ci: number }
  | { tag: "quiz";      mi: number }
  | { tag: "complete";  mi: number; score: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid(): string { return Math.random().toString(36).slice(2, 9); }

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { savedScripts: {}, quizScores: {}, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { completedChallenges: {}, completedModules: {}, savedScripts: {}, quizScores: {} };
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function ck(mi: number, ci: number) { return `${mi}_${ci}`; }

function defaultScript(): ScriptNode[] {
  return [{ id: uid(), blockId: "when_flag_clicked", params: {} }];
}

function blocksForModule(moduleId: number): BlockDef[] {
  return ALL_BLOCKS.filter(b => b.module <= moduleId);
}

async function syncToCloud(_userId: string, mi: number, ci: number | null, completed: boolean, quizScore?: number) {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool: "block-lab", level_idx: mi, challenge_idx: ci, completed, quiz_score: quizScore ?? null }),
  });
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

// (0,0) is bottom-left — matches math class convention.
// Convert grid coords to canvas pixels by flipping Y.
function toPixel(gx: number, gy: number) {
  return {
    px: gx * CELL,
    py: (GRID - 1 - gy) * CELL,
    cx: gx * CELL + CELL / 2,
    cy: (GRID - 1 - gy) * CELL + CELL / 2,
  };
}

function drawCanvas(
  canvas:   HTMLCanvasElement | null,
  state:    GameState | null,
  won:      boolean,
  running:  boolean,
  showAxes: boolean,
) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // ── Mars surface background ──
  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

  // Subtle texture overlay
  ctx.fillStyle = "rgba(180, 90, 0, 0.05)";
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if ((r + c) % 2 === 0) ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
  }

  // ── Grid lines ──
  ctx.strokeStyle = "rgba(160, 80, 0, 0.15)";
  ctx.lineWidth   = 1;
  for (let i = 0; i <= GRID; i++) {
    ctx.beginPath(); ctx.moveTo(i * CELL, 0);       ctx.lineTo(i * CELL, CANVAS_PX); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,        i * CELL); ctx.lineTo(CANVAS_PX, i * CELL); ctx.stroke();
  }

  // ── Axis labels — only shown on later challenges ──
  if (showAxes) {
    ctx.font      = "bold 9px monospace";
    ctx.fillStyle = "rgba(120, 60, 0, 0.55)";
    // X axis: 0–9 along the bottom row
    ctx.textAlign    = "center";
    ctx.textBaseline = "bottom";
    for (let x = 0; x < GRID; x++)
      ctx.fillText(String(x), x * CELL + CELL / 2, CANVAS_PX - 2);
    // Y axis: 0 at bottom, 9 at top — left edge of canvas
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    for (let y = 0; y < GRID; y++)
      ctx.fillText(String(y), 2, (GRID - 1 - y) * CELL + CELL / 2);
  }

  // ── Boulders (walls) ──
  for (const key of state?.walls ?? []) {
    const [wx, wy] = key.split(",").map(Number);
    const { px, py, cx, cy } = toPixel(wx, wy);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(cx + 2, py + CELL - 6, CELL/2 - 5, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.beginPath(); ctx.ellipse(cx, cy, CELL/2 - 4, CELL/2 - 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#a16207";
    ctx.beginPath(); ctx.ellipse(cx - 4, cy - 5, CELL/4, CELL/6, -0.4, 0, Math.PI*2); ctx.fill();
  }

  // ── Rock samples (collectibles) ──
  for (const c of state?.collectibles ?? []) {
    const { cx, cy } = toPixel(c.x, c.y);
    if (c.collected) {
      ctx.fillStyle = "rgba(251,191,36,0.35)";
      ctx.beginPath(); ctx.arc(cx, cy, CELL/2 - 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#fbbf24";
      ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("✓", cx, cy);
    } else {
      ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 10;
      ctx.fillStyle   = "#6b7280";
      ctx.beginPath(); ctx.ellipse(cx, cy + 3, 8, 6, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#9ca3af";
      ctx.beginPath(); ctx.ellipse(cx - 2, cy, 5, 3, 0.3, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath(); ctx.arc(cx + 5, cy - 5, 3, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Rover ──
  const rover = state?.sprites["rover"];
  if (rover?.visible !== false) {
    const { cx: rx, cy: ry } = toPixel(rover?.x ?? 0, rover?.y ?? 0);

    const dirAngles: Record<string, number> = {
      right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2,
    };
    const angle = dirAngles[rover?.direction ?? "right"] ?? 0;

    if (running) { ctx.shadowColor = "#3b82f6"; ctx.shadowBlur = 14; }

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle);

    // Wheels
    ctx.fillStyle = "#1f2937";
    for (const [wx, wy] of [[-11,-9],[11,-9],[-11,9],[11,9]] as [number,number][]) {
      ctx.beginPath(); ctx.arc(wx, wy, 5, 0, Math.PI*2); ctx.fill();
    }
    // Body
    ctx.fillStyle   = "#e2e8f0"; ctx.strokeStyle = "#475569"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-10, -7, 20, 14, 3); ctx.fill(); ctx.stroke();
    // Solar panels (perpendicular to travel direction)
    ctx.fillStyle = "#3b82f6"; ctx.strokeStyle = "#1d4ed8"; ctx.lineWidth = 1;
    ctx.fillRect(-18, -4, 7, 8); ctx.strokeRect(-18, -4, 7, 8);
    ctx.fillRect(11,  -4, 7, 8); ctx.strokeRect(11,  -4, 7, 8);
    // Antenna (front-right of body)
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(7, -15); ctx.stroke();
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath(); ctx.arc(7, -17, 2.5, 0, Math.PI*2); ctx.fill();
    // Camera eye (front face)
    ctx.fillStyle = "#ef4444";
    ctx.beginPath(); ctx.arc(10, -1, 2.5, 0, Math.PI*2); ctx.fill();

    ctx.restore();
    ctx.shadowBlur = 0;

    // Say bubble (absolute coords, drawn after restore)
    if (rover?.bubble) {
      const txt = rover.bubble;
      ctx.font = "11px system-ui"; ctx.textAlign = "left";
      const tw  = ctx.measureText(txt).width;
      const bx  = Math.min(rx + 12, CANVAS_PX - tw - 20);
      const by  = Math.max(ry - 32, 2);
      ctx.fillStyle = "white"; ctx.strokeStyle = "#333"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bx, by, tw + 14, 20, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#111"; ctx.textBaseline = "middle";
      ctx.fillText(txt, bx + 7, by + 10);
    }
  }

  // ── Win overlay pulse ──
  if (won) {
    ctx.fillStyle = "rgba(34,197,94,0.08)";
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
  }
}

// ─── Block label renderer ─────────────────────────────────────────────────────

function renderBlockLabel(
  def:      BlockDef,
  params:   Record<string, number | string>,
  onChange: (name: string, val: string) => void,
  disabled: boolean,
) {
  if (!def.params?.length) return <span>{def.label}</span>;

  const parts = def.label.split(/\[([^\]]+)\]/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 1) {
          const pd = def.params!.find(p => p.name === part);
          if (!pd) return <span key={i}>{part}</span>;
          const val = params[part] ?? pd.default;
          if (pd.type === "select" && pd.options) {
            return (
              <select key={i} value={String(val)} disabled={disabled}
                onChange={e => onChange(part, e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ borderRadius: 4, border: "none", padding: "1px 3px",
                  fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.9)", color: "#111" }}>
                {pd.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          }
          return (
            <input key={i} type={pd.type === "number" ? "number" : "text"}
              value={String(val)} min={pd.min} max={pd.max} disabled={disabled}
              onChange={e => onChange(part, e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{ width: pd.type === "number" ? 42 : 72, borderRadius: 4,
                border: "none", padding: "2px 4px", fontSize: 13, fontWeight: 700,
                textAlign: "center", background: "rgba(255,255,255,0.9)", color: "#111" }}
            />
          );
        }
        return part ? <span key={i}>{part}</span> : null;
      })}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlocksPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;

  const [phase,     setPhase]     = useState<Phase>({ tag: "overview" });
  const [progress,  setProgress]  = useState<Progress>(() => loadProgress());
  const [script,    setScript]    = useState<ScriptNode[]>(defaultScript);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [running,   setRunning]   = useState(false);
  const [won,       setWon]       = useState(false);
  const [output,    setOutput]    = useState("");

  // Quiz state
  const [quizIdx,      setQuizIdx]      = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizScore,    setQuizScore]    = useState(0);

  // Refs for animation
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const gameStateRef  = useRef<GameState | null>(null);
  const runningRef    = useRef(false);
  const stepsRef      = useRef<ExecutionStep[]>([]);
  const stepIdxRef    = useRef(0);
  const timeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef      = useRef<Phase>(phase);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const currentModule    = phase.tag !== "overview" ? MODULES[phase.mi]                         : null;
  const currentChallenge = phase.tag === "challenge" ? MODULES[phase.mi].challenges[phase.ci]   : null;
  const paletteBlocks    = currentModule ? blocksForModule(currentModule.id).filter(b => !b.isHat) : [];

  // ── Canvas: redraw on every state change ─────────────────────────────────

  const showAxes = phase.tag === "challenge" && phase.ci >= 8;

  useEffect(() => {
    drawCanvas(canvasRef.current, gameState, won, running, showAxes);
  }, [gameState, won, running, showAxes]);

  // ── Execution engine ──────────────────────────────────────────────────────

  function stopExecution() {
    runningRef.current = false;
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    setRunning(false);
  }

  function executeNextStep() {
    if (!runningRef.current) return;
    const steps = stepsRef.current;
    const idx   = stepIdxRef.current;

    if (idx >= steps.length) {
      runningRef.current = false;
      setRunning(false);
      return;
    }

    const step = steps[idx];
    stepIdxRef.current++;

    if (step.kind === "wait") {
      timeoutRef.current = setTimeout(executeNextStep, step.ms);
      return;
    }

    const next = applyStep(step, gameStateRef.current!);
    gameStateRef.current = next;
    setGameState(next);

    const allCollected = next.collectibles.every(c => c.collected);
    if (allCollected) {
      runningRef.current = false;
      setRunning(false);
      setWon(true);
      setOutput("🎉 All samples collected! Great work, mission control!");
      const p = phaseRef.current;
      if (p.tag === "challenge") markChallengeComplete(p.mi, p.ci);
      return;
    }

    timeoutRef.current = setTimeout(executeNextStep, STEP_MS);
  }

  function runScript() {
    if (!currentChallenge) return;
    stopExecution();

    const compiled = compileScript(script, "rover");
    if (compiled.length === 0) {
      setOutput("Add some blocks to your script first!");
      return;
    }

    stepsRef.current   = compiled;
    stepIdxRef.current = 0;
    runningRef.current = true;
    setRunning(true);
    setWon(false);
    setOutput("");

    const gs = makeInitialState(
      currentChallenge.spriteStart.x, currentChallenge.spriteStart.y,
      currentChallenge.collectibles,  currentChallenge.walls,
    );
    gameStateRef.current = gs;
    setGameState(gs);

    timeoutRef.current = setTimeout(executeNextStep, STEP_MS / 2);
  }

  function resetChallenge() {
    if (!currentChallenge) return;
    stopExecution();
    const gs = makeInitialState(
      currentChallenge.spriteStart.x, currentChallenge.spriteStart.y,
      currentChallenge.collectibles,  currentChallenge.walls,
    );
    gameStateRef.current = gs;
    setGameState(gs);
    setWon(false);
    setOutput("");
  }

  // ── Challenge navigation ──────────────────────────────────────────────────

  const enterChallenge = useCallback((mi: number, ci: number) => {
    stopExecution();
    const chal  = MODULES[mi].challenges[ci];
    const saved = progress.savedScripts[ck(mi, ci)];
    const gs    = makeInitialState(
      chal.spriteStart.x, chal.spriteStart.y,
      chal.collectibles,  chal.walls,
    );
    gameStateRef.current = gs;
    setGameState(gs);
    setScript(saved ?? defaultScript());
    setWon(false);
    setOutput("");
    setPhase({ tag: "challenge", mi, ci });
  }, [progress.savedScripts]);

  // ── Progress ──────────────────────────────────────────────────────────────

  function markChallengeComplete(mi: number, ci: number) {
    const mod     = MODULES[mi];
    const allDone = mod.challenges.every((_, i) =>
      i === ci || progress.completedChallenges[ck(mi, i)]
    );
    const next: Progress = {
      ...progress,
      completedChallenges: { ...progress.completedChallenges, [ck(mi, ci)]: true },
      completedModules:    allDone ? { ...progress.completedModules, [mi]: true } : progress.completedModules,
    };
    setProgress(next);
    saveProgress(next);
    if (userId) syncToCloud(userId, mi, ci, true).catch(() => {});
  }

  function saveScriptForCurrent(s: ScriptNode[]) {
    if (phase.tag !== "challenge") return;
    const next = { ...progress, savedScripts: { ...progress.savedScripts, [ck(phase.mi, phase.ci)]: s } };
    setProgress(next);
    saveProgress(next);
  }

  // ── Script editing ────────────────────────────────────────────────────────

  function addBlock(def: BlockDef) {
    const params: Record<string, number | string> = {};
    def.params?.forEach(p => { params[p.name] = p.default; });
    const next = [...script, { id: uid(), blockId: def.id, params }];
    setScript(next);
    saveScriptForCurrent(next);
  }

  function removeBlock(nodeId: string) {
    const next = script.filter(n => n.id !== nodeId);
    setScript(next);
    saveScriptForCurrent(next);
  }

  function updateParam(nodeId: string, name: string, val: string) {
    const next = script.map(n =>
      n.id === nodeId ? { ...n, params: { ...n.params, [name]: val } } : n
    );
    setScript(next);
    saveScriptForCurrent(next);
  }

  function clearScript() {
    const next = defaultScript();
    setScript(next);
    saveScriptForCurrent(next);
    resetChallenge();
  }

  // ── Module helpers ────────────────────────────────────────────────────────

  function isModuleLocked(mi: number) {
    return mi > 0 && !progress.completedModules[mi - 1];
  }
  function moduleProgress(mi: number) {
    const mod = MODULES[mi];
    if (!mod.challenges.length) return 0;
    const done = mod.challenges.filter((_, ci) => progress.completedChallenges[ck(mi, ci)]).length;
    return Math.round((done / mod.challenges.length) * 100);
  }

  // ── Quiz helpers ──────────────────────────────────────────────────────────

  function enterQuiz(mi: number) {
    setQuizIdx(0); setQuizSelected(null);
    setQuizAnswered(false); setQuizScore(0);
    setPhase({ tag: "quiz", mi });
  }

  function answerQuiz(optionIdx: number) {
    if (quizAnswered || phase.tag !== "quiz") return;
    const q       = MODULES[phase.mi].quiz[quizIdx];
    const correct = optionIdx === q.answer;
    setQuizSelected(optionIdx);
    setQuizAnswered(true);
    if (correct) setQuizScore(s => s + 1);
  }

  function nextQuizQuestion() {
    if (phase.tag !== "quiz") return;
    const total = MODULES[phase.mi].quiz.length;
    if (quizIdx + 1 >= total) {
      const finalScore = quizScore + (quizSelected === MODULES[phase.mi].quiz[quizIdx].answer ? 1 : 0);
      const next = { ...progress, quizScores: { ...progress.quizScores, [phase.mi]: finalScore } };
      setProgress(next); saveProgress(next);
      if (userId) syncToCloud(userId, phase.mi, null, true, finalScore).catch(() => {});
      setPhase({ tag: "complete", mi: phase.mi, score: finalScore });
    } else {
      setQuizIdx(i => i + 1);
      setQuizSelected(null);
      setQuizAnswered(false);
    }
  }

  // ─── RENDER: Overview ─────────────────────────────────────────────────────

  function renderOverview() {
    return (
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 32px" }}>
        <div style={{
          background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
          borderRadius: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          padding: "22px 28px", marginBottom: 36,
        }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111", margin: "0 0 6px", letterSpacing: "-0.3px" }}>
            Blocks — Code Lab
          </h1>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#555", margin: 0 }}>
            Program a Mars rover with visual blocks. Collect rock samples, navigate boulders, and complete your mission.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 20 }}>
          {MODULES.map((mod, mi) => {
            const locked   = isModuleLocked(mi);
            const pct      = moduleProgress(mi);
            const complete = progress.completedModules[mi];
            const hasChals = mod.challenges.length > 0;

            return (
              <div key={mod.id}
                onClick={() => !locked && hasChals && setPhase({ tag: "intro", mi })}
                onMouseEnter={e => { if (!locked && hasChals) { (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 28px rgba(0,0,0,0.22)"; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.14)"; }}
                style={{
                  background: "rgba(255,255,255,0.97)",
                  border: `3px solid ${locked ? "#ccc" : "#1f1f1f"}`,
                  borderRadius: 20, boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
                  padding: "22px 24px", cursor: locked || !hasChals ? "default" : "pointer",
                  opacity: locked ? 0.55 : 1, transition: "transform 140ms, box-shadow 140ms",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: locked ? "#e5e7eb" : mod.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontWeight: 900, fontSize: 15 }}>
                    {locked ? "🔒" : mod.id}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#111" }}>{mod.title}</div>
                    <div style={{ fontSize: 12, color: "#666", fontWeight: 600 }}>{mod.tagline}</div>
                  </div>
                  {complete && <div style={{ marginLeft: "auto", color: "#16a34a", fontWeight: 800, fontSize: 13 }}>✓ Done</div>}
                  {!hasChals && !locked && <div style={{ marginLeft: "auto", color: "#999", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px" }}>Coming Soon</div>}
                </div>
                {hasChals && !locked && (
                  <>
                    <div style={{ height: 6, background: "#f0f0f0", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: mod.color, borderRadius: 99, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 5, fontWeight: 600 }}>{pct}% complete</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── RENDER: Intro ────────────────────────────────────────────────────────

  function renderIntro() {
    if (phase.tag !== "intro") return null;
    const mod = MODULES[phase.mi];
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 32px" }}>
        <div style={{
          background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
          borderRadius: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "32px 36px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: mod.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 900, fontSize: 20 }}>{mod.id}</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 22, color: "#111" }}>{mod.title}</div>
              <div style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>{mod.tagline}</div>
            </div>
          </div>
          <pre style={{ fontFamily: "system-ui,sans-serif", fontSize: 14, lineHeight: 1.75,
            color: "#222", whiteSpace: "pre-wrap", margin: "0 0 28px", padding: 0 }}>
            {mod.introNotes}
          </pre>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => enterChallenge(phase.mi, 0)} style={{
              background: mod.color, color: "white", border: "none", borderRadius: 12,
              padding: "12px 28px", fontWeight: 800, fontSize: 15, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
              Launch Mission →
            </button>
            <button onClick={() => setPhase({ tag: "overview" })} style={{
              background: "transparent", color: "#555", border: "2px solid #ccc",
              borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER: Challenge ────────────────────────────────────────────────────

  function renderChallenge() {
    if (phase.tag !== "challenge" || !currentModule || !currentChallenge) return null;
    const { mi, ci } = phase;
    const mod    = currentModule;
    const chal   = currentChallenge;
    const total  = mod.challenges.length;
    const collected = gameState?.collectibles.filter(c => c.collected).length ?? 0;
    const needed    = chal.collectibles.length;
    const isLast    = ci === total - 1;

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

        {/* ── Top bar ── */}
        <div style={{
          background: "rgba(255,255,255,0.97)", borderBottom: "2px solid #e5e7eb",
          padding: "10px 24px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        }}>
          <button onClick={() => setPhase({ tag: "overview" })} style={{
            background: "transparent", border: "none", fontWeight: 700, fontSize: 13,
            color: "#555", cursor: "pointer", padding: "4px 0" }}>
            ← Modules
          </button>
          <span style={{ color: "#ccc" }}>|</span>
          <span style={{ fontWeight: 800, fontSize: 14, color: mod.color }}>Module {mod.id} — {mod.title}</span>
          <span style={{ color: "#ccc" }}>|</span>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#555" }}>Mission {ci + 1} of {total}</span>

          <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
            {mod.challenges.map((_, i) => {
              const done   = progress.completedChallenges[ck(mi, i)];
              const active = i === ci;
              return (
                <button key={i} onClick={() => enterChallenge(mi, i)} style={{
                  width: 30, height: 30, borderRadius: 8, border: "2px solid",
                  borderColor: active ? mod.color : done ? "#16a34a" : "#d1d5db",
                  background:  active ? mod.color : done ? "#dcfce7" : "#f9fafb",
                  color:       active ? "white"   : done ? "#16a34a" : "#555",
                  fontWeight: 800, fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {done && !active ? "✓" : i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Three panels ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* LEFT: Block palette */}
          <div style={{ width: 185, flexShrink: 0, padding: "14px 10px",
            borderRight: "2px solid #e5e7eb", background: "rgba(255,255,255,0.95)", overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#888",
              letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 10, paddingLeft: 4 }}>
              Blocks
            </div>
            {(["motion","control","looks","sensing","variable"] as const).map(cat => {
              const catBlocks = paletteBlocks.filter(b => b.category === cat);
              if (!catBlocks.length) return null;
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#aaa",
                    textTransform: "uppercase", letterSpacing: "0.6px",
                    paddingLeft: 4, marginBottom: 5 }}>{cat}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {catBlocks.map(def => (
                      <button key={def.id} onClick={() => addBlock(def)} disabled={running}
                        title={def.label}
                        onMouseEnter={e => { if (!running) (e.currentTarget as HTMLElement).style.transform = "scale(1.03)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
                        style={{
                          background: def.color, color: "white", border: "none",
                          borderRadius: 8, padding: "7px 10px", fontWeight: 700,
                          fontSize: 12, cursor: running ? "default" : "pointer",
                          textAlign: "left", opacity: running ? 0.6 : 1,
                          boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
                          transition: "transform 80ms",
                        }}>
                        {def.label.replace(/\[[^\]]+\]/g, "…")}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* CENTER: Canvas + controls */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", padding: "16px 16px", overflowY: "auto",
            background: "rgba(250,251,255,0.97)", borderRight: "2px solid #e5e7eb" }}>

            {/* Challenge info + sample counter */}
            <div style={{ width: CANVAS_PX, marginBottom: 10,
              background: "rgba(255,255,255,0.97)", border: `2px solid ${mod.color}40`,
              borderRadius: 12, padding: "10px 14px",
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: "#111", marginBottom: 2 }}>{chal.title}</div>
                <div style={{ fontSize: 13, color: "#555" }}>💡 {chal.hint}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#888",
                  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>
                  Samples
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {chal.collectibles.map((_, i) => (
                    <div key={i} style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: (gameState?.collectibles[i]?.collected) ? "#fbbf24" : "#e5e7eb",
                      border: "2px solid",
                      borderColor: (gameState?.collectibles[i]?.collected) ? "#d97706" : "#d1d5db",
                      transition: "all 0.2s",
                    }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Canvas */}
            <canvas ref={canvasRef} width={CANVAS_PX} height={CANVAS_PX} style={{
              borderRadius: 14,
              border: won ? "3px solid #22c55e" : "3px solid #1f1f1f",
              boxShadow: won ? "0 0 28px rgba(34,197,94,0.35), 0 8px 24px rgba(0,0,0,0.2)" : "0 8px 24px rgba(0,0,0,0.2)",
              display: "block", transition: "border-color 0.3s, box-shadow 0.3s",
            }} />

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={runScript} disabled={running} style={{
                background: running ? "#9ca3af" : "#16a34a", color: "white", border: "none",
                borderRadius: 10, padding: "10px 22px", fontWeight: 800, fontSize: 14,
                cursor: running ? "default" : "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.18)" }}>
                ▶ Run
              </button>
              <button onClick={stopExecution} disabled={!running} style={{
                background: !running ? "#e5e7eb" : "#dc2626",
                color: !running ? "#9ca3af" : "white", border: "none",
                borderRadius: 10, padding: "10px 18px", fontWeight: 800, fontSize: 14,
                cursor: !running ? "default" : "pointer" }}>
                ■ Stop
              </button>
              <button onClick={resetChallenge} disabled={running} style={{
                background: "transparent", border: "2px solid #d1d5db", color: "#555",
                borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 13,
                cursor: running ? "default" : "pointer", opacity: running ? 0.5 : 1 }}>
                ↺ Reset
              </button>
            </div>

            {/* Output */}
            {output && (
              <div style={{ width: CANVAS_PX, marginTop: 10, borderRadius: 10,
                padding: "10px 14px", fontWeight: 700, fontSize: 14,
                background: won ? "#dcfce7" : "#fef9c3",
                border: `2px solid ${won ? "#86efac" : "#fde047"}`,
                color: won ? "#166534" : "#854d0e" }}>
                {output}
              </div>
            )}

            {/* Next / Quiz */}
            {won && (
              <div style={{ width: CANVAS_PX, marginTop: 10 }}>
                {!isLast ? (
                  <button onClick={() => enterChallenge(mi, ci + 1)} style={{
                    width: "100%", background: mod.color, color: "white", border: "none",
                    borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 14,
                    cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.18)" }}>
                    Next Mission →
                  </button>
                ) : (
                  <button onClick={() => enterQuiz(mi)} style={{
                    width: "100%", background: mod.color, color: "white", border: "none",
                    borderRadius: 10, padding: "11px 0", fontWeight: 800, fontSize: 14,
                    cursor: "pointer", boxShadow: "0 3px 8px rgba(0,0,0,0.18)" }}>
                    Take the Quiz →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: Script panel */}
          <div style={{ width: 255, flexShrink: 0, padding: "14px 12px",
            background: "rgba(255,255,255,0.95)", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#888",
                letterSpacing: "0.8px", textTransform: "uppercase" }}>Script</span>
              <button onClick={clearScript} disabled={running} style={{
                marginLeft: "auto", background: "transparent", border: "none",
                fontSize: 11, color: "#aaa", cursor: running ? "default" : "pointer",
                fontWeight: 700, opacity: running ? 0.4 : 1 }}>
                Clear all
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {script.map(node => {
                const def = ALL_BLOCKS.find(b => b.id === node.blockId);
                if (!def) return null;
                return (
                  <div key={node.id} style={{
                    background: def.color,
                    borderRadius: def.isHat ? "10px 10px 4px 4px" : 8,
                    padding: "7px 10px",
                    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                    color: "white", fontWeight: 700, fontSize: 13,
                    boxShadow: "0 2px 5px rgba(0,0,0,0.15)",
                  }}>
                    {renderBlockLabel(def, node.params,
                      (name, val) => !running && updateParam(node.id, name, val), running)}
                    {!def.isHat && (
                      <button onClick={() => !running && removeBlock(node.id)} disabled={running} style={{
                        marginLeft: "auto", background: "rgba(0,0,0,0.2)", border: "none",
                        borderRadius: 4, width: 18, height: 18, color: "white",
                        cursor: running ? "default" : "pointer", fontSize: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0, fontWeight: 900, opacity: running ? 0.4 : 1 }}>
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {script.length <= 1 && (
                <div style={{ border: "2px dashed #d1d5db", borderRadius: 8,
                  padding: "16px 12px", textAlign: "center",
                  fontSize: 12, color: "#9ca3af", fontWeight: 600, marginTop: 4 }}>
                  Click a block on the left to add it here
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── RENDER: Quiz ─────────────────────────────────────────────────────────

  function renderQuiz() {
    if (phase.tag !== "quiz") return null;
    const mod  = MODULES[phase.mi];
    const qs   = mod.quiz;
    const q    = qs[quizIdx];
    if (!q) return null;
    const correct = quizAnswered && quizSelected === q.answer;
    const wrong   = quizAnswered && quizSelected !== q.answer;

    return (
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 32px" }}>
        <div style={{
          background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
          borderRadius: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.18)", padding: "32px 36px",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: mod.color,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontWeight: 900, fontSize: 15 }}>{mod.id}</div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 16, color: "#111" }}>Module {mod.id} Quiz</div>
              <div style={{ fontSize: 12, color: "#888", fontWeight: 600 }}>
                Question {quizIdx + 1} of {qs.length}
              </div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
              {qs.map((_, i) => (
                <div key={i} style={{
                  width: 10, height: 10, borderRadius: "50%",
                  background: i < quizIdx ? mod.color : i === quizIdx ? "#fbbf24" : "#e5e7eb",
                }} />
              ))}
            </div>
          </div>

          {/* Question */}
          <p style={{ fontSize: 17, fontWeight: 700, color: "#111", marginBottom: 20, lineHeight: 1.5 }}>
            {q.question}
          </p>

          {/* Options */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {q.options.map((opt, i) => {
              const isCorrect  = i === q.answer;
              const isSelected = i === quizSelected;
              let bg = "#f9fafb", border = "#e5e7eb", color = "#111";
              if (quizAnswered) {
                if (isCorrect)         { bg = "#dcfce7"; border = "#86efac"; color = "#166534"; }
                else if (isSelected)   { bg = "#fee2e2"; border = "#fca5a5"; color = "#991b1b"; }
              }
              if (isSelected && !quizAnswered) { bg = `${mod.color}18`; border = mod.color; }

              return (
                <button key={i} onClick={() => answerQuiz(i)} disabled={quizAnswered} style={{
                  background: bg, border: `2px solid ${border}`, borderRadius: 10,
                  padding: "12px 16px", textAlign: "left", fontWeight: 600, fontSize: 14,
                  color, cursor: quizAnswered ? "default" : "pointer", transition: "all 0.15s",
                }}>
                  <span style={{ fontWeight: 800, marginRight: 10 }}>{["A","B","C","D"][i]}.</span>
                  {opt}
                  {quizAnswered && isCorrect  && <span style={{ float: "right" }}>✓</span>}
                  {quizAnswered && isSelected && !isCorrect && <span style={{ float: "right" }}>✗</span>}
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {quizAnswered && (
            <div style={{
              borderRadius: 10, padding: "12px 16px", marginBottom: 20,
              background: correct ? "#f0fdf4" : "#fff7ed",
              border: `2px solid ${correct ? "#bbf7d0" : "#fed7aa"}`,
              fontSize: 13, color: correct ? "#166534" : "#9a3412", fontWeight: 600,
            }}>
              {correct ? "✓ Correct! " : "✗ Not quite. "}{q.explanation}
            </div>
          )}

          {/* Next button */}
          {quizAnswered && (
            <button onClick={nextQuizQuestion} style={{
              background: mod.color, color: "white", border: "none", borderRadius: 12,
              padding: "12px 28px", fontWeight: 800, fontSize: 15, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
              {quizIdx + 1 < qs.length ? "Next Question →" : "See Results →"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── RENDER: Complete ─────────────────────────────────────────────────────

  function renderComplete() {
    if (phase.tag !== "complete") return null;
    const { mi, score } = phase;
    const mod    = MODULES[mi];
    const total  = mod.quiz.length;
    const isLast = mi === MODULES.length - 1;

    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "48px 32px" }}>
        <div style={{
          background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
          borderRadius: 20, boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          padding: "36px", textAlign: "center",
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: "#111", margin: "0 0 8px" }}>
            Module {mod.id} Complete!
          </h2>
          <p style={{ fontSize: 15, color: "#555", margin: "0 0 6px" }}>
            {mod.challenges.length} missions completed
          </p>
          <p style={{ fontSize: 15, color: "#555", margin: "0 0 28px" }}>
            Quiz score: <strong style={{ color: mod.color }}>{score} / {total}</strong>
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {!isLast && (
              <button onClick={() => setPhase({ tag: "intro", mi: mi + 1 })} style={{
                background: MODULES[mi + 1].color, color: "white", border: "none",
                borderRadius: 12, padding: "12px 24px", fontWeight: 800,
                fontSize: 15, cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
                Start Module {mi + 2} →
              </button>
            )}
            <button onClick={() => setPhase({ tag: "overview" })} style={{
              background: "transparent", color: "#555", border: "2px solid #ccc",
              borderRadius: 12, padding: "12px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              ← All Modules
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────

  const isChallenge = phase.tag === "challenge";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <SiteHeader>
        <Link href="/tools/code-lab" style={{
          border: "1px solid rgba(255,255,255,0.6)", color: "white",
          padding: "7px 14px", borderRadius: 999, fontWeight: 600,
          fontSize: 13, textDecoration: "none" }}>
          ← Code Lab
        </Link>
      </SiteHeader>

      <main style={{
        flex: 1, display: isChallenge ? "flex" : "block",
        flexDirection: "column",
        backgroundImage: isChallenge ? "none" : "url('/ui/bg-tools-pattern.png')",
        backgroundRepeat: "repeat", backgroundSize: "auto",
        backgroundColor: isChallenge ? "#f8faff" : undefined,
        overflow: "hidden",
      }}>
        {phase.tag === "overview"  && renderOverview()}
        {phase.tag === "intro"     && renderIntro()}
        {phase.tag === "challenge" && renderChallenge()}
        {phase.tag === "quiz"      && renderQuiz()}
        {phase.tag === "complete"  && renderComplete()}
      </main>

      {!isChallenge && (
        <footer style={{
          height: 40, width: "100%",
          backgroundImage: "url('/ui/footer-metal.png')",
          backgroundSize: "cover", backgroundPosition: "center",
        }} />
      )}
    </div>
  );
}
