"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { CHALLENGES, type TurtleChallenge } from "./challenges";

// ─── Constants ────────────────────────────────────────────────────────────────
const CS       = 500;   // canvas size px
const CX       = CS / 2;
const CY       = CS / 2;
const MAX_OPS  = 8000;
// ms between animation steps per speed level (index 0 = instant)
const STEP_MS  = [0, 120, 70, 42, 25, 15, 9, 5, 3, 2, 1];

// ─── Types ────────────────────────────────────────────────────────────────────
type Cmd =
  | { t: "L"; x1: number; y1: number; x2: number; y2: number; c: string; w: number }
  | { t: "F"; pts: [number, number][]; c: string }
  | { t: "BG"; c: string }
  | { t: "CLR" }
  | { t: "T"; x: number; y: number; h: number; v: boolean };

interface TV { x: number; y: number; h: number; v: boolean; }

// ─── Python → JS transpiler ───────────────────────────────────────────────────
function transpile(src: string): string {
  // Security: block dangerous patterns
  const blocked = [
    "import ", "require(", "__", "eval(", "exec(",
    "fetch(", "XMLHttp", "WebSocket", "document.",
    "window.", "location.", "localStorage", "sessionStorage",
    ".innerHTML", ".outerHTML", "cookie", "alert(",
  ];
  for (const b of blocked) {
    if (src.includes(b))
      throw new Error(`"${b}" is not available in Turtle mode.`);
  }

  const lines = src.split("\n");

  // Pre-pass: collect all assigned variable names for flat (var) scoping
  const vars = new Set<string>();
  const apiNames = new Set([
    "forward","fd","backward","bk","back","right","rt","left","lt",
    "penup","pu","pendown","pd","color","pencolor","fillcolor",
    "pensize","width","goto","setpos","home","circle","setheading","seth",
    "setx","sety","begin_fill","end_fill","bgcolor","clear","reset",
    "hideturtle","ht","showturtle","st","xcor","ycor","heading","isdown",
    "abs","min","max","sqrt","sin","cos","floor","round","pi","PI","range",
    "print","i","True","False","None","and","or","not","in","for","while",
    "if","elif","else","def","return","pass",
  ]);
  for (const line of lines) {
    const m = line.trimStart().match(/^([a-zA-Z_]\w*)\s*=(?!=)/);
    if (m && !apiNames.has(m[1])) vars.add(m[1]);
  }

  const varDecl = vars.size > 0 ? `var ${[...vars].join(", ")};\n` : "";

  function xpr(e: string): string {
    return e
      .replace(/\bTrue\b/g,  "true").replace(/\bFalse\b/g, "false")
      .replace(/\bNone\b/g,  "null")
      .replace(/\bnot\s+/g,  "!").replace(/\band\b/g, "&&").replace(/\bor\b/g, "||")
      .replace(/\babs\(/g,   "Math.abs(").replace(/\bmin\(/g,   "Math.min(")
      .replace(/\bmax\(/g,   "Math.max(").replace(/\bsqrt\(/g,  "Math.sqrt(")
      .replace(/\bsin\(/g,   "Math.sin(").replace(/\bcos\(/g,   "Math.cos(")
      .replace(/\bfloor\(/g, "Math.floor(").replace(/\bround\(/g, "Math.round(")
      .replace(/\bpi\b/g,    "Math.PI").replace(/\bPI\b/g, "Math.PI");
  }

  function tline(raw: string): string {
    // for i in range(n/s,e/s,e,step):
    const forR = raw.match(/^for\s+(\w+)\s+in\s+range\(([^)]+)\)\s*:/);
    if (forR) {
      const v = forR[1];
      const a = forR[2].split(",").map(s => s.trim());
      if (a.length === 1) return `for(var ${v}=0;${v}<${xpr(a[0])};${v}++){`;
      if (a.length === 2) return `for(var ${v}=${xpr(a[0])};${v}<${xpr(a[1])};${v}++){`;
      const neg = a[2].trim().startsWith("-");
      return `for(var ${v}=${xpr(a[0])};${neg?`${v}>${xpr(a[1])}`:`${v}<${xpr(a[1])}`};${v}+=(${xpr(a[2])})){`;
    }
    // for x in [list]:
    const forL = raw.match(/^for\s+(\w+)\s+in\s+(\[[\s\S]*?\])\s*:/);
    if (forL) {
      const v = forL[1], lst = forL[2];
      return `{var _L_${v}=${lst};for(var _i_${v}=0;_i_${v}<_L_${v}.length;_i_${v}++){var ${v}=_L_${v}[_i_${v}];`;
    }
    // while:
    const wh = raw.match(/^while\s+(.+)\s*:/);
    if (wh) return `while(${xpr(wh[1])}){`;
    // if/elif/else:
    const ifm = raw.match(/^if\s+(.+)\s*:/);
    if (ifm) return `if(${xpr(ifm[1])}){`;
    const elm = raw.match(/^elif\s+(.+)\s*:/);
    if (elm) return `}else if(${xpr(elm[1])}){`;
    if (/^else\s*:/.test(raw)) return "}else{";
    // def:
    const df = raw.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
    if (df) return `function ${df[1]}(${df[2]}){`;
    // return:
    const ret = raw.match(/^return\s+(.*)/);
    if (ret) return `return ${xpr(ret[1])};`;
    if (raw === "return") return "return;";
    if (raw === "pass") return ";";
    // augmented assignment:
    const aug = raw.match(/^([a-zA-Z_]\w*(?:\[.+?\])?)\s*([+\-*/%]=)\s*(.+)/);
    if (aug) return `${aug[1]} ${aug[2]} ${xpr(aug[3])};`;
    // plain assignment (not ==):
    const asgn = raw.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)/);
    if (asgn) return `${asgn[1]} = ${xpr(asgn[2])};`;
    // expression / call:
    const out = xpr(raw);
    return out.endsWith(";") ? out : out + ";";
  }

  const out: string[] = [varDecl];
  const stack = [0];
  let expect = false;

  for (const raw of lines) {
    if (!raw.trimEnd()) { out.push(""); continue; }
    const trimmed = raw.trimStart();
    if (trimmed.startsWith("#")) { out.push("//" + trimmed.slice(1)); continue; }

    const indent = raw.length - trimmed.length;

    while (indent < stack[stack.length - 1]) {
      stack.pop();
      // close extra brace for for-in-list blocks
      out.push("}");
    }
    if (expect) {
      if (indent > stack[stack.length - 1]) stack.push(indent);
      expect = false;
    }

    const tr = tline(trimmed);
    out.push(tr);
    if (tr.endsWith("{")) expect = true;
  }

  while (stack.length > 1) { stack.pop(); out.push("}"); }
  return out.join("\n");
}

// ─── Turtle interpreter ───────────────────────────────────────────────────────
function runTurtle(code: string): { cmds: Cmd[]; prints: string[]; error: string | null } {
  const cmds: Cmd[]     = [];
  const prints: string[] = [];
  let ops = 0;

  // world coords: origin = center, y-up
  let wx = 0, wy = 0;           // position
  let heading = 0;              // 0=East, 90=North, CCW positive
  let penDown  = true;
  let penClr   = "#000000";
  let fillClr  = "#000000";
  let penW     = 1;
  let visible  = true;
  let filling  = false;
  let fillPts: [number, number][] = [];

  function w2c(x: number, y: number): [number, number] {
    return [CX + x, CY - y];
  }
  function tick() {
    if (++ops > MAX_OPS) throw new Error("Too many operations — check for infinite loops.");
  }
  function pushT() {
    const [cx, cy] = w2c(wx, wy);
    cmds.push({ t: "T", x: cx, y: cy, h: heading, v: visible });
  }
  function moveTo(nx: number, ny: number) {
    if (penDown) {
      const [x1, y1] = w2c(wx, wy);
      const [x2, y2] = w2c(nx, ny);
      cmds.push({ t: "L", x1, y1, x2, y2, c: penClr, w: penW });
    }
    if (filling) fillPts.push(w2c(nx, ny));
    wx = nx; wy = ny;
    pushT();
  }

  const api = {
    forward(d: number) { tick(); const r = heading * Math.PI / 180; moveTo(wx + d * Math.cos(r), wy + d * Math.sin(r)); },
    backward(d: number) { api.forward(-d); },
    right(a: number)  { heading = ((heading - a) % 360 + 360) % 360; pushT(); },
    left(a: number)   { api.right(-a); },
    penup()    { penDown = false; },
    pendown()  { penDown = true;  },
    color(c: string)      { penClr  = c; },
    pencolor(c: string)   { penClr  = c; },
    fillcolor(c: string)  { fillClr = c; },
    pensize(w: number)    { penW = w; },
    goto(x: number, y: number) {
      tick();
      if (penDown) {
        const [x1, y1] = w2c(wx, wy); const [x2, y2] = w2c(x, y);
        cmds.push({ t: "L", x1, y1, x2, y2, c: penClr, w: penW });
      }
      if (filling) fillPts.push(w2c(x, y));
      wx = x; wy = y; pushT();
    },
    home() { api.goto(0, 0); heading = 0; pushT(); },
    setheading(h: number) { heading = ((h % 360) + 360) % 360; pushT(); },
    setx(x: number) { api.goto(x, wy); },
    sety(y: number) { api.goto(wx, y); },
    circle(r: number, extent: number = 360) {
      const steps = Math.max(12, Math.ceil(Math.abs(extent) / 4));
      const sa    = extent / steps;
      const sl    = 2 * Math.abs(r) * Math.sin(Math.PI * Math.abs(sa) / 360);
      for (let i = 0; i < steps; i++) {
        api.forward(sl);
        if (r >= 0) api.left(sa); else api.right(sa);
      }
    },
    begin_fill() {
      filling  = true;
      fillPts  = [w2c(wx, wy)];
    },
    end_fill() {
      if (fillPts.length >= 3)
        cmds.push({ t: "F", pts: [...fillPts], c: fillClr });
      filling = false; fillPts = [];
    },
    bgcolor(c: string)  { cmds.push({ t: "BG", c }); },
    clear()             { cmds.push({ t: "CLR" }); },
    reset()             { cmds.push({ t: "CLR" }); wx = 0; wy = 0; heading = 0; pushT(); },
    hideturtle()        { visible = false; pushT(); },
    showturtle()        { visible = true;  pushT(); },
    xcor:     () => wx,
    ycor:     () => wy,
    heading:  () => heading,
    isdown:   () => penDown,
    print(...args: unknown[]) { prints.push(args.map(a => String(a)).join(" ")); },
    // aliases
    fd(d: number)  { api.forward(d); },
    bk(d: number)  { api.backward(d); },
    back(d: number){ api.backward(d); },
    rt(a: number)  { api.right(a); },
    lt(a: number)  { api.left(a); },
    pu()           { api.penup(); },
    pd()           { api.pendown(); },
    up()           { api.penup(); },
    down()         { api.pendown(); },
    width(w: number){ api.pensize(w); },
    setpos(x: number, y: number) { api.goto(x, y); },
    seth(h: number){ api.setheading(h); },
    ht()           { api.hideturtle(); },
    st()           { api.showturtle(); },
    // math helpers for Python parity
    abs:   Math.abs,   min: Math.min,  max: Math.max,
    sqrt:  Math.sqrt,  floor: Math.floor, round: Math.round,
    sin: (d: number) => Math.sin(d * Math.PI / 180),
    cos: (d: number) => Math.cos(d * Math.PI / 180),
    pi: Math.PI, PI: Math.PI,
    range(a: number, b?: number, c?: number) {
      const s = b === undefined ? 0 : a;
      const e = b === undefined ? a : b;
      const st = c ?? 1;
      const arr: number[] = [];
      if (st > 0) for (let i = s; i < e; i += st) arr.push(i);
      else        for (let i = s; i > e; i += st) arr.push(i);
      return arr;
    },
  };

  let error: string | null = null;
  try {
    const js = transpile(code);
    const keys = Object.keys(api) as (keyof typeof api)[];
    // eslint-disable-next-line no-new-func
    new Function("__t", `const {${keys.join(",")}} = __t;\n${js}`)(api);
  } catch (e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }

  // Always push final turtle position
  const [fx, fy] = w2c(wx, wy);
  cmds.push({ t: "T", x: fx, y: fy, h: heading, v: visible });

  return { cmds, prints, error };
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function drawTurtleSprite(ctx: CanvasRenderingContext2D, tv: TV) {
  if (!tv.v) return;
  ctx.save();
  ctx.translate(tv.x, tv.y);
  // canvas angle: heading 0=East → canvas angle 0; heading 90=North → canvas -π/2
  ctx.rotate(-tv.h * Math.PI / 180);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -8);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 8);
  ctx.closePath();
  ctx.fillStyle   = "#22c55e";
  ctx.strokeStyle = "#15803d";
  ctx.lineWidth   = 1.5;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function applyCmd(
  bgCtx: CanvasRenderingContext2D,
  cmd: Cmd,
  tvRef: React.MutableRefObject<TV>,
  bgColorRef: React.MutableRefObject<string>,
) {
  switch (cmd.t) {
    case "L":
      bgCtx.beginPath();
      bgCtx.moveTo(cmd.x1, cmd.y1);
      bgCtx.lineTo(cmd.x2, cmd.y2);
      bgCtx.strokeStyle = cmd.c;
      bgCtx.lineWidth   = cmd.w;
      bgCtx.lineCap     = "round";
      bgCtx.stroke();
      break;
    case "F": {
      bgCtx.beginPath();
      bgCtx.moveTo(cmd.pts[0][0], cmd.pts[0][1]);
      for (let i = 1; i < cmd.pts.length; i++) bgCtx.lineTo(cmd.pts[i][0], cmd.pts[i][1]);
      bgCtx.closePath();
      bgCtx.fillStyle = cmd.c;
      bgCtx.fill();
      break;
    }
    case "BG":
      bgColorRef.current = cmd.c;
      bgCtx.fillStyle = cmd.c;
      bgCtx.fillRect(0, 0, CS, CS);
      break;
    case "CLR":
      bgCtx.fillStyle = bgColorRef.current;
      bgCtx.fillRect(0, 0, CS, CS);
      break;
    case "T":
      tvRef.current = { x: cmd.x, y: cmd.y, h: cmd.h, v: cmd.v };
      break;
  }
}

// ─── Command reference data ───────────────────────────────────────────────────
const CMD_REF = [
  { group: "Motion", items: [
    { cmd: "forward(steps)",    desc: "Move forward" },
    { cmd: "backward(steps)",   desc: "Move backward" },
    { cmd: "right(angle)",      desc: "Turn clockwise" },
    { cmd: "left(angle)",       desc: "Turn counter-clockwise" },
    { cmd: "goto(x, y)",        desc: "Jump to position" },
    { cmd: "home()",            desc: "Return to center" },
    { cmd: "circle(radius)",    desc: "Draw a circle" },
    { cmd: "setheading(angle)", desc: "Set direction (0=East)" },
  ]},
  { group: "Pen", items: [
    { cmd: "penup()",           desc: "Lift pen (no drawing)" },
    { cmd: "pendown()",         desc: "Lower pen (draw)" },
    { cmd: 'color("red")',      desc: "Set pen color" },
    { cmd: 'fillcolor("blue")', desc: "Set fill color" },
    { cmd: "pensize(width)",    desc: "Set line thickness" },
    { cmd: "begin_fill()",      desc: "Start filling a shape" },
    { cmd: "end_fill()",        desc: "Finish filling" },
  ]},
  { group: "Screen", items: [
    { cmd: 'bgcolor("white")',  desc: "Background color" },
    { cmd: "clear()",           desc: "Erase all drawings" },
    { cmd: "hideturtle()",      desc: "Hide the turtle" },
    { cmd: "showturtle()",      desc: "Show the turtle" },
  ]},
  { group: "Colors", items: [
    { cmd: '"red"   "orange"',  desc: "" },
    { cmd: '"yellow" "gold"',   desc: "" },
    { cmd: '"green" "lime"',    desc: "" },
    { cmd: '"blue"  "navy"',    desc: "" },
    { cmd: '"purple" "violet"', desc: "" },
    { cmd: '"pink"  "cyan"',    desc: "" },
    { cmd: '"black" "white"',   desc: "" },
    { cmd: '"gray"  "brown"',   desc: "" },
    { cmd: '"#ff0000"',         desc: "Hex color" },
  ]},
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function TurtlePage() {
  const [code,        setCode]        = useState(CHALLENGES[0].starterCode);
  const [speed,       setSpeed]       = useState(7);
  const [running,     setRunning]     = useState(false);
  const [prints,      setPrints]      = useState<string[]>([]);
  const [error,       setError]       = useState<string | null>(null);
  const [leftTab,     setLeftTab]     = useState<"challenges" | "reference">("challenges");
  const [activeId,    setActiveId]    = useState<string>("line");

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const bgRef       = useRef<HTMLCanvasElement | null>(null);
  const tvRef       = useRef<TV>({ x: CX, y: CY, h: 0, v: true });
  const bgColorRef  = useRef<string>("#ffffff");
  const cmdsRef     = useRef<Cmd[]>([]);
  const idxRef      = useRef(0);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef  = useRef(false);

  // Init offscreen bg canvas
  useEffect(() => {
    const bg  = document.createElement("canvas");
    bg.width  = CS; bg.height = CS;
    const ctx = bg.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CS, CS);
    bgRef.current = bg;
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function renderFrame() {
    const canvas = canvasRef.current;
    const bg     = bgRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bg, 0, 0);
    drawTurtleSprite(ctx, tvRef.current);
  }

  function resetBg() {
    const bg = bgRef.current;
    if (!bg) return;
    const ctx = bg.getContext("2d")!;
    bgColorRef.current = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CS, CS);
    tvRef.current = { x: CX, y: CY, h: 0, v: true };
    renderFrame();
  }

  function stopAnim() {
    runningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRunning(false);
  }

  const step = useCallback(() => {
    if (!runningRef.current) return;
    const cmds = cmdsRef.current;
    const bg   = bgRef.current;
    if (!bg) return;
    const bgCtx = bg.getContext("2d")!;

    const batchSize = speed <= 3 ? 1 : speed <= 6 ? 3 : speed <= 8 ? 8 : 20;
    for (let b = 0; b < batchSize && idxRef.current < cmds.length; b++) {
      applyCmd(bgCtx, cmds[idxRef.current], tvRef, bgColorRef);
      idxRef.current++;
    }
    renderFrame();

    if (idxRef.current >= cmds.length) {
      runningRef.current = false;
      setRunning(false);
      return;
    }
    timerRef.current = setTimeout(step, STEP_MS[speed] || 1);
  }, [speed]);

  function runCode() {
    stopAnim();
    resetBg();
    setError(null);
    setPrints([]);

    const { cmds, prints: p, error: err } = runTurtle(code);
    setPrints(p);

    if (err) { setError(err); return; }
    if (cmds.length === 0) return;

    cmdsRef.current = cmds;
    idxRef.current  = 0;

    if (speed === 0) {
      // Instant: apply all cmds immediately
      const bg = bgRef.current;
      if (!bg) return;
      const bgCtx = bg.getContext("2d")!;
      for (const cmd of cmds) applyCmd(bgCtx, cmd, tvRef, bgColorRef);
      renderFrame();
      return;
    }

    runningRef.current = true;
    setRunning(true);
    timerRef.current = setTimeout(step, STEP_MS[speed] || 1);
  }

  function handleChallengeSelect(ch: TurtleChallenge) {
    stopAnim();
    resetBg();
    setError(null);
    setPrints([]);
    setCode(ch.starterCode);
    setActiveId(ch.id);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta  = e.currentTarget;
      const s   = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = code.slice(0, s) + "    " + code.slice(end);
      setCode(next);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = s + 4; });
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runCode(); }
  }

  const tutorials   = CHALLENGES.filter(c => c.category === "tutorial");
  const challenges  = CHALLENGES.filter(c => c.category === "challenge");
  const activeChallenge = CHALLENGES.find(c => c.id === activeId);

  const CARD: React.CSSProperties = {
    background: "rgba(255,255,255,0.97)", border: "3px solid #1f1f1f",
    borderRadius: 16, boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <SiteHeader>
        <Link href="/tools/code-lab"
          style={{ border: "1px solid rgba(255,255,255,0.6)", color: "white",
            padding: "7px 14px", borderRadius: 999, fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
          ← Code Lab
        </Link>
      </SiteHeader>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#f0f2f8", overflow: "hidden" }}>

        {/* ── Top bar ── */}
        <div style={{ background: "rgba(255,255,255,0.97)", borderBottom: "2px solid #e5e7eb",
          padding: "10px 20px", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={{ fontWeight: 900, fontSize: 15, color: "#111" }}>🐢 Python Turtle</span>
          <span style={{ color: "#d1d5db" }}>|</span>
          <span style={{ fontSize: 13, color: "#888", fontWeight: 600 }}>
            {activeChallenge ? activeChallenge.title : "Sandbox"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#aaa" }}>Speed</span>
            <input type="range" min={0} max={10} value={speed} onChange={e => setSpeed(+e.target.value)}
              style={{ width: 90, accentColor: "#10b981" }}/>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#10b981", width: 44 }}>
              {speed === 0 ? "Instant" : speed <= 3 ? "Slow" : speed <= 6 ? "Medium" : speed <= 8 ? "Fast" : "Turbo"}
            </span>
          </div>
        </div>

        {/* ── Three-panel layout ── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

          {/* LEFT: tabs + content */}
          <div style={{ width: 270, flexShrink: 0, display: "flex", flexDirection: "column",
            borderRight: "2px solid #e5e7eb", background: "rgba(255,255,255,0.95)" }}>

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: "2px solid #e5e7eb" }}>
              {(["challenges", "reference"] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)} style={{
                  flex: 1, padding: "9px 0", background: "transparent",
                  border: "none", borderBottom: leftTab === tab ? "3px solid #10b981" : "3px solid transparent",
                  fontWeight: 700, fontSize: 12, color: leftTab === tab ? "#10b981" : "#888",
                  cursor: "pointer", textTransform: "capitalize", letterSpacing: "0.3px",
                }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
              {leftTab === "challenges" ? (
                <>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#aaa", letterSpacing: "0.8px",
                    textTransform: "uppercase", paddingLeft: 4, marginBottom: 6 }}>Tutorials</div>
                  {tutorials.map(ch => (
                    <ChallengeRow key={ch.id} ch={ch} active={activeId === ch.id}
                      onSelect={() => handleChallengeSelect(ch)} />
                  ))}
                  <div style={{ fontSize: 10, fontWeight: 800, color: "#aaa", letterSpacing: "0.8px",
                    textTransform: "uppercase", paddingLeft: 4, marginTop: 14, marginBottom: 6 }}>Challenges</div>
                  {challenges.map(ch => (
                    <ChallengeRow key={ch.id} ch={ch} active={activeId === ch.id}
                      onSelect={() => handleChallengeSelect(ch)} />
                  ))}
                </>
              ) : (
                CMD_REF.map(group => (
                  <div key={group.group} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "#aaa", letterSpacing: "0.8px",
                      textTransform: "uppercase", paddingLeft: 4, marginBottom: 5 }}>{group.group}</div>
                    {group.items.map(item => (
                      <div key={item.cmd} style={{ display: "flex", alignItems: "baseline",
                        gap: 6, padding: "3px 6px", borderRadius: 6 }}>
                        <code style={{ fontSize: 11, fontFamily: "monospace", color: "#1d4ed8",
                          background: "#eff6ff", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>
                          {item.cmd}
                        </code>
                        {item.desc && (
                          <span style={{ fontSize: 11, color: "#666" }}>{item.desc}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CENTER: code editor */}
          <div style={{ width: 360, flexShrink: 0, display: "flex", flexDirection: "column",
            borderRight: "2px solid #e5e7eb", background: "#1e1e2e" }}>

            {/* Hint bar */}
            {activeChallenge && (
              <div style={{ background: "#2a2a3e", borderBottom: "1px solid #3a3a5e",
                padding: "7px 12px", fontSize: 12, color: "#a5b4fc", fontWeight: 600, flexShrink: 0 }}>
                💡 {activeChallenge.hint}
              </div>
            )}

            {/* Editor */}
            <textarea value={code} onChange={e => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false} autoCorrect="off" autoCapitalize="off"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#e2e8f0", fontFamily: "'Courier New', Courier, monospace",
                fontSize: 13, lineHeight: 1.65, padding: "12px 14px",
                resize: "none", overflowY: "auto",
              }}
            />

            {/* Run / Stop / Clear */}
            <div style={{ padding: "10px 12px", borderTop: "1px solid #3a3a5e",
              display: "flex", gap: 8, background: "#16162a", flexShrink: 0 }}>
              <button onClick={runCode} disabled={running}
                style={{ flex: 1, background: running ? "#374151" : "#10b981", color: "white",
                  border: "none", borderRadius: 8, padding: "9px 0", fontWeight: 800,
                  fontSize: 13, cursor: running ? "default" : "pointer" }}>
                ▶ Run
              </button>
              <button onClick={stopAnim} disabled={!running}
                style={{ background: running ? "#dc2626" : "#374151", color: running ? "white" : "#6b7280",
                  border: "none", borderRadius: 8, padding: "9px 14px", fontWeight: 800,
                  fontSize: 13, cursor: running ? "pointer" : "default" }}>
                ■ Stop
              </button>
              <button onClick={() => { stopAnim(); resetBg(); setError(null); setPrints([]); }}
                disabled={running}
                style={{ background: "transparent", color: "#9ca3af", border: "1px solid #4b5563",
                  borderRadius: 8, padding: "9px 12px", fontWeight: 700, fontSize: 12,
                  cursor: running ? "default" : "pointer", opacity: running ? 0.5 : 1 }}>
                ↺ Clear
              </button>
            </div>
          </div>

          {/* RIGHT: canvas + output */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "flex-start",
            padding: "20px 16px", overflowY: "auto", background: "#f0f2f8" }}>

            {/* Canvas */}
            <div style={{ ...CARD, padding: 0, overflow: "hidden", marginBottom: 12,
              border: `3px solid ${error ? "#dc2626" : "#1f1f1f"}`,
              boxShadow: error ? "0 0 0 3px rgba(220,38,38,0.2), 0 8px 24px rgba(0,0,0,0.18)" : undefined }}>
              <canvas ref={canvasRef} width={CS} height={CS}
                style={{ display: "block", maxWidth: "100%" }}/>
            </div>

            {/* Output / error */}
            {(error || prints.length > 0) && (
              <div style={{ ...CARD, padding: "10px 14px", width: CS, maxWidth: "100%",
                borderColor: error ? "#fca5a5" : "#a7f3d0",
                background: error ? "#fef2f2" : "#f0fdf4" }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.7px",
                  textTransform: "uppercase", color: error ? "#dc2626" : "#16a34a", marginBottom: 4 }}>
                  {error ? "Error" : "Output"}
                </div>
                {error && (
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#dc2626" }}>{error}</div>
                )}
                {prints.map((p, i) => (
                  <div key={i} style={{ fontFamily: "monospace", fontSize: 12, color: "#166534" }}>{p}</div>
                ))}
              </div>
            )}

            {/* Keyboard hint */}
            <div style={{ marginTop: 8, fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>
              Ctrl+Enter to run · Tab inserts 4 spaces
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

// ─── Challenge row component ──────────────────────────────────────────────────
function ChallengeRow({ ch, active, onSelect }: {
  ch: TurtleChallenge;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} style={{
      width: "100%", textAlign: "left", background: active ? "#f0fdf4" : "transparent",
      border: `2px solid ${active ? "#10b981" : "transparent"}`,
      borderRadius: 8, padding: "7px 10px", cursor: "pointer", marginBottom: 3,
      transition: "all 100ms",
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: active ? "#065f46" : "#222" }}>
        {ch.title}
      </div>
      <div style={{ fontSize: 11, color: "#666", marginTop: 1 }}>{ch.description}</div>
    </button>
  );
}
