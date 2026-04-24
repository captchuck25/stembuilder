"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import SiteHeader from "@/app/components/SiteHeader";
import { CHALLENGES, type TurtleChallenge } from "./challenges";
import { saveTurtleWork, submitTurtleWork, fetchTurtleSubmission } from "@/lib/achievements";

// ─── Constants ────────────────────────────────────────────────────────────────
const CS      = 500;
const CX      = CS / 2;
const CY      = CS / 2;
const MAX_OPS = 8000;
const STEP_MS = [0, 180, 100, 60, 35, 20, 12, 6, 3, 2, 1];
const DRAW_STEP_PX = 12; // pixels per animation sub-step (makes turtle lead the line)

// ─── Types ────────────────────────────────────────────────────────────────────
type Cmd =
  | { t: "DRAW"; x1: number; y1: number; x2: number; y2: number; c: string; w: number; tx: number; ty: number; h: number; v: boolean }
  | { t: "F"; pts: [number, number][]; c: string }
  | { t: "BG"; c: string }
  | { t: "CLR" }
  | { t: "T"; x: number; y: number; h: number; v: boolean };

interface TV { x: number; y: number; h: number; v: boolean; }

// ─── Python → JS transpiler ───────────────────────────────────────────────────
function transpile(src: string): string {
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
    const forR = raw.match(/^for\s+(\w+)\s+in\s+range\s*\(([^)]+)\)\s*:/);
    if (forR) {
      const v = forR[1]; const a = forR[2].split(",").map(s => s.trim());
      if (a.length === 1) return `for(var ${v}=0;${v}<${xpr(a[0])};${v}++){`;
      if (a.length === 2) return `for(var ${v}=${xpr(a[0])};${v}<${xpr(a[1])};${v}++){`;
      const neg = a[2].trim().startsWith("-");
      return `for(var ${v}=${xpr(a[0])};${neg?`${v}>${xpr(a[1])}`:`${v}<${xpr(a[1])}`};${v}+=(${xpr(a[2])})){`;
    }
    const forL = raw.match(/^for\s+(\w+)\s+in\s+(\[[\s\S]*?\])\s*:/);
    if (forL) {
      const v = forL[1], lst = forL[2];
      return `{var _L_${v}=${lst};for(var _i_${v}=0;_i_${v}<_L_${v}.length;_i_${v}++){var ${v}=_L_${v}[_i_${v}];`;
    }
    const wh = raw.match(/^while\s+(.+)\s*:/);
    if (wh) return `while(${xpr(wh[1])}){`;
    const ifm = raw.match(/^if\s+(.+)\s*:/);
    if (ifm) return `if(${xpr(ifm[1])}){`;
    const elm = raw.match(/^elif\s+(.+)\s*:/);
    if (elm) return `}else if(${xpr(elm[1])}){`;
    if (/^else\s*:/.test(raw)) return "}else{";
    const df = raw.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:/);
    if (df) return `function ${df[1]}(${df[2]}){`;
    const ret = raw.match(/^return\s+(.*)/);
    if (ret) return `return ${xpr(ret[1])};`;
    if (raw === "return") return "return;";
    if (raw === "pass") return ";";
    const aug = raw.match(/^([a-zA-Z_]\w*(?:\[.+?\])?)\s*([+\-*/%]=)\s*(.+)/);
    if (aug) return `${aug[1]} ${aug[2]} ${xpr(aug[3])};`;
    const asgn = raw.match(/^([a-zA-Z_]\w*)\s*=(?!=)\s*(.+)/);
    if (asgn) return `${asgn[1]} = ${xpr(asgn[2])};`;
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
    while (indent < stack[stack.length - 1]) { stack.pop(); out.push("}"); }
    if (expect) { if (indent > stack[stack.length - 1]) stack.push(indent); expect = false; }
    const tr = tline(trimmed);
    out.push(tr);
    if (tr.endsWith("{")) expect = true;
  }

  while (stack.length > 1) { stack.pop(); out.push("}"); }
  return out.join("\n");
}

// ─── Turtle interpreter ───────────────────────────────────────────────────────
function runTurtle(code: string): { cmds: Cmd[]; prints: string[]; error: string | null } {
  const cmds: Cmd[] = []; const prints: string[] = [];
  let ops = 0;
  let wx = 0, wy = 0, heading = 0;
  let penDown = true, penClr = "#000000", fillClr = "#000000", penW = 1;
  let visible = true, filling = false;
  let fillPts: [number, number][] = [];

  function w2c(x: number, y: number): [number, number] { return [CX + x, CY - y]; }
  function tick() { if (++ops > MAX_OPS) throw new Error("Too many operations — check for infinite loops."); }
  function pushT() { const [cx, cy] = w2c(wx, wy); cmds.push({ t: "T", x: cx, y: cy, h: heading, v: visible }); }

  // Break every move into small sub-steps so the turtle visibly leads the line
  function drawLineTo(nx: number, ny: number) {
    const dist = Math.hypot(nx - wx, ny - wy);
    const nSteps = Math.max(1, Math.ceil(dist / DRAW_STEP_PX));
    const ox = wx, oy = wy;
    for (let s = 1; s <= nSteps; s++) {
      const t0 = (s - 1) / nSteps, t1 = s / nSteps;
      const [x1, y1] = w2c(ox + (nx - ox) * t0, oy + (ny - oy) * t0);
      const [x2, y2] = w2c(ox + (nx - ox) * t1, oy + (ny - oy) * t1);
      if (penDown) {
        cmds.push({ t: "DRAW", x1, y1, x2, y2, c: penClr, w: penW, tx: x2, ty: y2, h: heading, v: visible });
      } else {
        cmds.push({ t: "T", x: x2, y: y2, h: heading, v: visible });
      }
    }
    if (filling) fillPts.push(w2c(nx, ny));
    wx = nx; wy = ny;
  }
  function moveTo(nx: number, ny: number) { drawLineTo(nx, ny); }

  const api = {
    forward(d: number) { tick(); const r=heading*Math.PI/180; moveTo(wx+d*Math.cos(r), wy+d*Math.sin(r)); },
    backward(d: number) { api.forward(-d); },
    right(a: number)  { heading=((heading-a)%360+360)%360; pushT(); },
    left(a: number)   { api.right(-a); },
    penup()   { penDown=false; }, pendown() { penDown=true; },
    color(c: string)     { penClr=c; }, pencolor(c: string) { penClr=c; },
    fillcolor(c: string) { fillClr=c; }, pensize(w: number) { penW=w; },
    goto(x: number, y: number) { tick(); drawLineTo(x, y); },
    home() { api.goto(0,0); heading=0; pushT(); },
    setheading(h: number) { heading=((h%360)+360)%360; pushT(); },
    setx(x: number) { api.goto(x,wy); }, sety(y: number) { api.goto(wx,y); },
    circle(r: number, extent: number=360) {
      const steps=Math.max(12,Math.ceil(Math.abs(extent)/4));
      const sa=extent/steps, sl=2*Math.abs(r)*Math.sin(Math.PI*Math.abs(sa)/360);
      for (let i=0;i<steps;i++) { api.forward(sl); if(r>=0) api.left(sa); else api.right(sa); }
    },
    begin_fill() { filling=true; fillPts=[w2c(wx,wy)]; },
    end_fill() { if(fillPts.length>=3) cmds.push({t:"F",pts:[...fillPts],c:fillClr}); filling=false; fillPts=[]; },
    bgcolor(c: string) { cmds.push({t:"BG",c}); },
    clear()  { cmds.push({t:"CLR"}); },
    reset()  { cmds.push({t:"CLR"}); wx=0; wy=0; heading=0; pushT(); },
    hideturtle() { visible=false; pushT(); }, showturtle() { visible=true; pushT(); },
    xcor: ()=>wx, ycor: ()=>wy, heading: ()=>heading, isdown: ()=>penDown,
    print(...args: unknown[]) { prints.push(args.map(a=>String(a)).join(" ")); },
    fd(d:number){api.forward(d);}, bk(d:number){api.backward(d);}, back(d:number){api.backward(d);},
    rt(a:number){api.right(a);}, lt(a:number){api.left(a);},
    turn_right(a:number){api.right(a);}, turn_left(a:number){api.left(a);},
    move_forward(d:number){api.forward(d);}, move_backward(d:number){api.backward(d);},
    pu(){api.penup();}, pd(){api.pendown();}, up(){api.penup();}, down(){api.pendown();},
    width(w:number){api.pensize(w);}, setpos(x:number,y:number){api.goto(x,y);},
    seth(h:number){api.setheading(h);}, ht(){api.hideturtle();}, st(){api.showturtle();},
    abs:Math.abs, min:Math.min, max:Math.max, sqrt:Math.sqrt, floor:Math.floor, round:Math.round,
    sin:(d:number)=>Math.sin(d*Math.PI/180), cos:(d:number)=>Math.cos(d*Math.PI/180),
    pi:Math.PI, PI:Math.PI,
    range(a:number,b?:number,c?:number) {
      const s=b===undefined?0:a, e=b===undefined?a:b, st=c??1, arr:number[]=[];
      if(st>0) for(let i=s;i<e;i+=st) arr.push(i);
      else     for(let i=s;i>e;i+=st) arr.push(i);
      return arr;
    },
  };

  let error: string | null = null;
  try {
    const js = transpile(code);
    const keys = Object.keys(api) as (keyof typeof api)[];
    // eslint-disable-next-line no-new-func
    new Function("__t", `const {${keys.join(",")}} = __t;\n${js}`)(api);
  } catch (e: unknown) { error = e instanceof Error ? e.message : String(e); }

  const [fx,fy] = w2c(wx,wy);
  cmds.push({t:"T",x:fx,y:fy,h:heading,v:visible});
  return { cmds, prints, error };
}

// ─── Success checking ─────────────────────────────────────────────────────────
function checkTutorialSuccess(id: string, cmds: Cmd[], code: string): boolean {
  const draws = cmds.filter(c => c.t === "DRAW").length;
  const fills = cmds.filter(c => c.t === "F").length;
  switch (id) {
    case "line":    return draws >= 1;
    case "turns":   return draws >= 2 && (/\bright\b|\brt\b/.test(code) || /\bleft\b|\blt\b/.test(code));
    case "square":  return draws >= 4;
    case "colors":  return draws >= 1 && (/\bcolor\s*\(/.test(code) || /\bpensize\s*\(/.test(code) || /\bwidth\s*\(/.test(code));
    case "fill":    return fills >= 1;
    default:        return false;
  }
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
function drawTurtleSprite(ctx: CanvasRenderingContext2D, tv: TV) {
  if (!tv.v) return;
  ctx.save();
  ctx.translate(tv.x, tv.y);
  ctx.rotate(-tv.h * Math.PI / 180);

  const G  = "#22c55e";   // body green
  const DG = "#15803d";   // dark green (outline / shell lines)
  const SG = "#16a34a";   // shell green (slightly darker than body)

  // ── Legs (drawn behind shell) ──────────────────────────
  ctx.fillStyle = G;
  const legs: [number, number, number][] = [
    [6, -9,  0.4],   // front-left
    [6,  9, -0.4],   // front-right
   [-4, -9, -0.4],   // back-left
   [-4,  9,  0.4],   // back-right
  ];
  for (const [lx, ly, la] of legs) {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(la);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ── Tail ───────────────────────────────────────────────
  ctx.beginPath();
  ctx.ellipse(-11, 0, 3.5, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Shell (dark outline ring) ──────────────────────────
  ctx.fillStyle = DG;
  ctx.beginPath();
  ctx.ellipse(0, 0, 11, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Shell (main fill) ──────────────────────────────────
  ctx.fillStyle = SG;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9.5, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Shell pattern ─────────────────────────────────────
  ctx.strokeStyle = DG;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -6);  ctx.lineTo(0,  6);   // vertical centre
  ctx.moveTo(-6, 0);  ctx.lineTo(6,  0);   // horizontal centre
  ctx.moveTo(-4, -4); ctx.lineTo(4,  4);   // diagonal ↘
  ctx.moveTo( 4, -4); ctx.lineTo(-4, 4);   // diagonal ↙
  ctx.stroke();

  // ── Neck ──────────────────────────────────────────────
  ctx.fillStyle = G;
  ctx.beginPath();
  ctx.ellipse(11, 0, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Head ──────────────────────────────────────────────
  ctx.fillStyle = G;
  ctx.strokeStyle = DG;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(15.5, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ── Eye ───────────────────────────────────────────────
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(17, -1.8, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(17.5, -2.3, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function applyCmd(
  bgCtx: CanvasRenderingContext2D, cmd: Cmd,
  tvRef: { current: TV }, bgColorRef: { current: string },
) {
  switch (cmd.t) {
    case "DRAW":
      bgCtx.beginPath(); bgCtx.moveTo(cmd.x1,cmd.y1); bgCtx.lineTo(cmd.x2,cmd.y2);
      bgCtx.strokeStyle=cmd.c; bgCtx.lineWidth=cmd.w; bgCtx.lineCap="round"; bgCtx.stroke();
      tvRef.current={x:cmd.tx,y:cmd.ty,h:cmd.h,v:cmd.v}; break;
    case "F": {
      bgCtx.beginPath(); bgCtx.moveTo(cmd.pts[0][0],cmd.pts[0][1]);
      for (let i=1;i<cmd.pts.length;i++) bgCtx.lineTo(cmd.pts[i][0],cmd.pts[i][1]);
      bgCtx.closePath(); bgCtx.fillStyle=cmd.c; bgCtx.fill(); break;
    }
    case "BG": bgColorRef.current=cmd.c; bgCtx.fillStyle=cmd.c; bgCtx.fillRect(0,0,CS,CS); break;
    case "CLR": bgCtx.fillStyle=bgColorRef.current; bgCtx.fillRect(0,0,CS,CS); break;
    case "T":   tvRef.current={x:cmd.x,y:cmd.y,h:cmd.h,v:cmd.v}; break;
  }
}

// ─── Example canvas (static, instant render) ─────────────────────────────────
function ExampleCanvas({ code, size = 300 }: { code: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);

    const offscreen = document.createElement("canvas");
    offscreen.width = CS; offscreen.height = CS;
    const bgCtx = offscreen.getContext("2d")!;
    bgCtx.fillStyle = "#ffffff"; bgCtx.fillRect(0, 0, CS, CS);

    const tvRef      = { current: { x: CX, y: CY, h: 0, v: true } };
    const bgColorRef = { current: "#ffffff" };

    const { cmds } = runTurtle(code);
    for (const cmd of cmds) applyCmd(bgCtx, cmd, tvRef, bgColorRef);

    const scale = size / CS;
    ctx.drawImage(offscreen, 0, 0, CS, CS, 0, 0, size, size);
    drawTurtleSprite(ctx, {
      ...tvRef.current,
      x: tvRef.current.x * scale,
      y: tvRef.current.y * scale,
    });
  }, [code, size]);

  return (
    <canvas ref={canvasRef} width={size} height={size}
      style={{ display: "block", borderRadius: 10, border: "2px solid #e5e7eb" }} />
  );
}

// ─── Notes text renderer (backtick → inline code) ────────────────────────────
function NotesParagraphs({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
        const parts = line.split(/`([^`]+)`/);
        return (
          <p key={i} style={{ margin: "0 0 4px", fontSize: 13, color: "#cbd5e1", lineHeight: 1.65 }}>
            {parts.map((part, j) =>
              j % 2 === 1
                ? <code key={j} style={{ background: "rgba(99,179,237,0.15)", color: "#93c5fd",
                    padding: "1px 5px", borderRadius: 4, fontFamily: "monospace", fontSize: 12 }}>{part}</code>
                : part
            )}
          </p>
        );
      })}
    </>
  );
}

// ─── Command reference ────────────────────────────────────────────────────────
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
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const [view,          setView]          = useState<"hub" | "notes" | "editor">("hub");
  const [code,          setCode]          = useState(CHALLENGES[0].starterCode);
  const [speed,         setSpeed]         = useState(7);
  const [running,       setRunning]       = useState(false);
  const [prints,        setPrints]        = useState<string[]>([]);
  const [error,         setError]         = useState<string | null>(null);
  const [leftTab,       setLeftTab]       = useState<"task" | "notes" | "reference">("task");
  const [activeId,      setActiveId]      = useState<string>("line");
  const [justCompleted, setJustCompleted] = useState(false);
  const [completedIds,  setCompletedIds]  = useState<Set<string>>(new Set());
  const [hasRunOnce,    setHasRunOnce]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [isSaved,       setIsSaved]       = useState(false);
  const [isSubmitted,   setIsSubmitted]   = useState(false);
  const [isEnrolled,    setIsEnrolled]    = useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const bgRef      = useRef<HTMLCanvasElement | null>(null);
  const tvRef      = useRef<TV>({ x: CX, y: CY, h: 0, v: true });
  const bgColorRef = useRef<string>("#ffffff");
  const cmdsRef    = useRef<Cmd[]>([]);
  const idxRef     = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("turtle_completed");
      if (saved) setCompletedIds(new Set(JSON.parse(saved)));
    } catch {}
  }, []);

  // Check if student is enrolled in any class
  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/enrollments/check")
      .then(r => r.json())
      .then(d => setIsEnrolled(d.enrolled ?? false));
  }, [userId]);

  // Handle ?challenge= param from My Work page (load saved code)
  useEffect(() => {
    if (!session?.user) return;
    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get("challenge");
    if (!challengeId) return;
    const ch = CHALLENGES.find(c => c.id === challengeId);
    if (!ch || !userId) return;
    fetchTurtleSubmission(userId, challengeId).then(saved => {
      setCode(saved?.code ?? ch.starterCode);
      setActiveId(ch.id);
      setIsSaved(!!saved?.code);
      setIsSubmitted(!!saved?.submitted_at);
      setHasRunOnce(false);
      setView("editor");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (view !== "editor") return;
    const bg = document.createElement("canvas");
    bg.width = CS; bg.height = CS;
    const ctx = bg.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CS, CS);
    bgRef.current = bg;
    renderFrame();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function renderFrame() {
    const canvas = canvasRef.current; const bg = bgRef.current;
    if (!canvas || !bg) return;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bg, 0, 0); drawTurtleSprite(ctx, tvRef.current);
  }

  function resetBg() {
    const bg = bgRef.current; if (!bg) return;
    const ctx = bg.getContext("2d")!;
    bgColorRef.current = "#ffffff"; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, CS, CS);
    tvRef.current = { x: CX, y: CY, h: 0, v: true }; renderFrame();
  }

  function stopAnim() {
    runningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setRunning(false);
  }

  const step = useCallback(() => {
    if (!runningRef.current) return;
    const cmds = cmdsRef.current; const bg = bgRef.current; if (!bg) return;
    const bgCtx = bg.getContext("2d")!;
    const batchSize = speed<=3?1:speed<=6?3:speed<=8?8:20;
    for (let b=0;b<batchSize&&idxRef.current<cmds.length;b++) {
      applyCmd(bgCtx, cmds[idxRef.current], tvRef, bgColorRef); idxRef.current++;
    }
    renderFrame();
    if (idxRef.current >= cmds.length) { runningRef.current=false; setRunning(false); return; }
    timerRef.current = setTimeout(step, STEP_MS[speed]||1);
  }, [speed]);

  function markComplete(id: string) {
    setCompletedIds(prev => {
      const next = new Set(prev); next.add(id);
      try { localStorage.setItem("turtle_completed", JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function captureCanvas(): string {
    const src = canvasRef.current; if (!src) return "";
    const thumb = document.createElement("canvas");
    thumb.width = 200; thumb.height = 200;
    thumb.getContext("2d")!.drawImage(src, 0, 0, CS, CS, 0, 0, 200, 200);
    return thumb.toDataURL("image/jpeg", 0.8);
  }

  async function handleSave() {
    if (!session?.user || !userId) return;
    setSaving(true);
    const err = await saveTurtleWork(userId, activeId, code, captureCanvas());
    setSaving(false);
    if (err) { setError("Save failed: " + err); } else { setIsSaved(true); }
  }

  async function handleSubmit() {
    if (!session?.user || !userId) return;
    setSubmitting(true);
    const err = await submitTurtleWork(userId, activeId, code, captureCanvas());
    setSubmitting(false);
    if (err) { setError("Submit failed: " + err); } else { setIsSubmitted(true); setIsSaved(true); }
  }

  function runCode() {
    stopAnim(); resetBg(); setError(null); setPrints([]); setJustCompleted(false);
    const { cmds, prints: p, error: err } = runTurtle(code);
    setPrints(p);
    if (err) { setError(err); return; }

    const activeCh = CHALLENGES.find(c => c.id === activeId);
    if (activeCh?.category === "tutorial" && !completedIds.has(activeId)) {
      if (checkTutorialSuccess(activeId, cmds, code)) {
        markComplete(activeId); setJustCompleted(true);
      }
    }

    setHasRunOnce(true);
    if (cmds.length === 0) return;
    cmdsRef.current = cmds; idxRef.current = 0;

    if (speed === 0) {
      const bg = bgRef.current; if (!bg) return;
      const bgCtx = bg.getContext("2d")!;
      for (const cmd of cmds) applyCmd(bgCtx, cmd, tvRef, bgColorRef);
      renderFrame(); return;
    }
    runningRef.current = true; setRunning(true);
    timerRef.current = setTimeout(step, STEP_MS[speed]||1);
  }

  function handleChallengeSelect(ch: TurtleChallenge) {
    stopAnim();
    setError(null); setPrints([]); setJustCompleted(false);
    setHasRunOnce(false); setIsSaved(false); setIsSubmitted(false);
    setCode(ch.starterCode); setActiveId(ch.id);
    setLeftTab("task");
    setView((ch.category === "tutorial" && ch.notes) || ch.previewLines ? "notes" : "editor");
    // Load previously saved code for challenges
    if (session?.user && userId && ch.category === "challenge") {
      fetchTurtleSubmission(userId, ch.id).then(saved => {
        if (saved?.code) { setCode(saved.code); setIsSaved(true); setIsSubmitted(!!saved.submitted_at); }
      });
    }
  }

  function jumpToEditor(ch: TurtleChallenge) {
    stopAnim();
    setError(null); setPrints([]); setJustCompleted(false);
    setHasRunOnce(false); setIsSaved(false); setIsSubmitted(false);
    setCode(ch.starterCode); setActiveId(ch.id);
    setLeftTab("task");
    setView("editor");
    if (session?.user && userId && ch.category === "challenge") {
      fetchTurtleSubmission(userId, ch.id).then(saved => {
        if (saved?.code) { setCode(saved.code); setIsSaved(true); setIsSubmitted(!!saved.submitted_at); }
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta=e.currentTarget, s=ta.selectionStart, end=ta.selectionEnd;
      const next=code.slice(0,s)+"    "+code.slice(end);
      setCode(next);
      requestAnimationFrame(()=>{ ta.selectionStart=ta.selectionEnd=s+4; });
    }
    if (e.key==="Enter"&&(e.ctrlKey||e.metaKey)) { e.preventDefault(); runCode(); }
  }

  const tutorials       = CHALLENGES.filter(c => c.category === "tutorial");
  const challenges      = CHALLENGES.filter(c => c.category === "challenge");
  const activeChallenge = CHALLENGES.find(c => c.id === activeId);
  const activeTutIndex  = tutorials.findIndex(t => t.id === activeId);
  const nextTutorial    = activeTutIndex >= 0 && activeTutIndex < tutorials.length - 1
    ? tutorials[activeTutIndex + 1] : null;

  // ── Hub view ──────────────────────────────────────────────────────────────
  if (view === "hub") {
    const allTutsDone = tutorials.every(t => completedIds.has(t.id));
    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", fontFamily:"system-ui, sans-serif" }}>
        <SiteHeader>
          <Link href="/tools/code-lab" style={{ border:"1px solid rgba(255,255,255,0.6)", color:"white",
            padding:"7px 14px", borderRadius:999, fontWeight:600, fontSize:13, textDecoration:"none" }}>
            ← Code Lab
          </Link>
        </SiteHeader>

        <main style={{ flex:1, background:"#0c1120" }}>
          <div style={{ maxWidth:1100, margin:"0 auto", padding:"40px 32px" }}>

            <div style={{ background:"#1a2540", border:"1px solid rgba(99,179,237,0.15)",
              borderRadius:20, boxShadow:"0 8px 24px rgba(0,0,0,0.5)", padding:"22px 28px", marginBottom:28 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:36 }}>🐢</span>
                <div>
                  <h1 style={{ fontSize:26, fontWeight:900, color:"#e2e8f0", margin:"0 0 4px" }}>Python Turtle</h1>
                  <p style={{ fontSize:13, color:"#94a3b8", fontWeight:600, margin:0 }}>
                    Learn to draw with code — complete the tutorials in order, then tackle the creative challenges.
                  </p>
                </div>
                {allTutsDone && (
                  <div style={{ marginLeft:"auto", background:"rgba(74,222,128,0.12)", border:"1px solid #4ade80",
                    borderRadius:12, padding:"8px 14px", fontSize:13, fontWeight:800, color:"#4ade80" }}>
                    🎉 All tutorials complete!
                  </div>
                )}
              </div>
            </div>

            <div style={{ background:"#1a2540", border:"1px solid rgba(99,179,237,0.15)",
              borderRadius:20, boxShadow:"0 8px 24px rgba(0,0,0,0.5)", padding:"24px 28px", marginBottom:24 }}>
              <h2 style={{ fontSize:14, fontWeight:900, color:"#e2e8f0", margin:"0 0 16px",
                textTransform:"uppercase", letterSpacing:"0.5px" }}>
                Tutorials — complete in order
              </h2>
              <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                {tutorials.map((ch, i) => {
                  const completed = completedIds.has(ch.id);
                  const locked    = i > 0 && !completedIds.has(tutorials[i-1].id);
                  return (
                    <TutorialCard key={ch.id} ch={ch} index={i} completed={completed} locked={locked}
                      onClick={locked ? undefined : () => handleChallengeSelect(ch)} />
                  );
                })}
              </div>
            </div>

            <div style={{ background:"#1a2540", border:"1px solid rgba(99,179,237,0.15)",
              borderRadius:20, boxShadow:"0 8px 24px rgba(0,0,0,0.5)", padding:"24px 28px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
                <h2 style={{ fontSize:14, fontWeight:900, color:"#e2e8f0", margin:0,
                  textTransform:"uppercase", letterSpacing:"0.5px" }}>
                  Creative Challenges
                </h2>
                {!allTutsDone && (
                  <span style={{ fontSize:12, color:"#64748b", fontWeight:600 }}>
                    🔒 Finish all tutorials to unlock
                  </span>
                )}
              </div>
              <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
                {challenges.map(ch => (
                  <ChallengeCard key={ch.id} ch={ch} locked={!allTutsDone}
                    onClick={allTutsDone ? () => handleChallengeSelect(ch) : undefined} />
                ))}
              </div>
            </div>

          </div>
        </main>

        <footer style={{ height:40, width:"100%", backgroundImage:"url('/ui/footer-metal.png')",
          backgroundSize:"cover", backgroundPosition:"center" }} />
      </div>
    );
  }

  // ── Notes intro view ──────────────────────────────────────────────────────
  if (view === "notes") {
    const ch = activeChallenge!;
    const isTut = ch.category === "tutorial";
    const tutNum = tutorials.findIndex(t => t.id === ch.id) + 1;

    // For challenges: split starter code into visible + blurred portions
    const codeLines   = ch.starterCode.trimEnd().split("\n");
    const visibleCode = codeLines.slice(0, ch.previewLines ?? codeLines.length).join("\n");
    const blurredCode = ch.previewLines ? codeLines.slice(ch.previewLines).join("\n") : "";

    return (
      <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", fontFamily:"system-ui, sans-serif" }}>
        <SiteHeader>
          <button onClick={() => setView("hub")}
            style={{ border:"1px solid rgba(255,255,255,0.6)", color:"white", background:"transparent",
              padding:"7px 14px", borderRadius:999, fontWeight:600, fontSize:13, cursor:"pointer" }}>
            ← Tutorials
          </button>
        </SiteHeader>

        <main style={{ flex:1, background:"#0c1120", overflowY:"auto" }}>
          <div style={{ maxWidth:960, margin:"0 auto", padding:"36px 32px 48px" }}>

            {/* Header */}
            <div style={{ background:"#1a2540", border:"1px solid rgba(99,179,237,0.15)",
              borderRadius:20, boxShadow:"0 8px 24px rgba(0,0,0,0.5)",
              padding:"20px 28px", marginBottom:24 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{
                  background: isTut ? "#3b82f6" : "#8b5cf6", color:"white", borderRadius:10,
                  padding:"4px 12px", fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.5px" }}>
                  {isTut ? `Tutorial ${tutNum} of ${tutorials.length}` : "Creative Challenge"}
                </div>
                {completedIds.has(ch.id) && (
                  <div style={{ background:"rgba(74,222,128,0.12)", border:"1px solid #4ade80",
                    borderRadius:10, padding:"4px 12px", fontSize:11, fontWeight:800, color:"#4ade80" }}>
                    ✅ Completed
                  </div>
                )}
              </div>
              <h1 style={{ fontSize:24, fontWeight:900, color:"#e2e8f0", margin:"10px 0 4px" }}>
                {ch.title.replace(/^\d+\.\s*/, "")}
              </h1>
              <p style={{ fontSize:13, color:"#94a3b8", fontWeight:600, margin:0 }}>{ch.description}</p>
            </div>

            {/* Progress dots */}
            <div style={{ background:"#131d2e", border:"1px solid rgba(255,255,255,0.07)",
              borderRadius:14, padding:"10px 18px", marginBottom:24,
              display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
              {tutorials.map((tut, i) => {
                const done = completedIds.has(tut.id);
                const act  = ch.id === tut.id;
                const lock = i > 0 && !completedIds.has(tutorials[i-1].id);
                return (
                  <button key={tut.id} onClick={lock ? undefined : () => handleChallengeSelect(tut)}
                    style={{ padding:"4px 12px", borderRadius:14, fontSize:12, fontWeight:700,
                      cursor:lock?"default":"pointer", border:"none",
                      background:act?"#3b82f6":done?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.05)",
                      color:act?"#fff":done?"#4ade80":"#4a5568",
                      outline:`2px solid ${act?"#3b82f6":done?"#4ade80":"rgba(255,255,255,0.12)"}`,
                      outlineOffset:-2, opacity:lock?0.45:1 }}>
                    {done&&!act?"✓ ":""}{i+1}
                  </button>
                );
              })}
              {challenges.length > 0 && (
                <div style={{ width:1, height:18, background:"rgba(255,255,255,0.1)", margin:"0 4px" }} />
              )}
              {challenges.map((chalItem, i) => {
                const act  = ch.id === chalItem.id;
                const lock = !tutorials.every(t => completedIds.has(t.id));
                return (
                  <button key={chalItem.id} onClick={lock ? undefined : () => handleChallengeSelect(chalItem)}
                    style={{ padding:"4px 12px", borderRadius:14, fontSize:12, fontWeight:700,
                      cursor:lock?"default":"pointer", border:"none",
                      background:act?"#8b5cf6":"rgba(255,255,255,0.05)",
                      color:act?"#fff":lock?"#4a5568":"#64748b",
                      outline:`2px solid ${act?"#8b5cf6":"rgba(255,255,255,0.12)"}`,
                      outlineOffset:-2, opacity:lock?0.45:1 }}>
                    C{i+1}
                  </button>
                );
              })}
            </div>

            {/* Two columns */}
            <div style={{ display:"flex", gap:20, alignItems:"flex-start", flexWrap:"wrap" }}>

              {/* LEFT: tutorial notes OR challenge code preview */}
              <div style={{ flex:1, minWidth:280, background:"#1a2540",
                border:"1px solid rgba(99,179,237,0.15)", borderRadius:20,
                boxShadow:"0 6px 20px rgba(0,0,0,0.4)", padding:"22px 24px", userSelect:"none" }}>

                {isTut ? (
                  <>
                    <div style={{ fontSize:11, fontWeight:800, color:"#60a5fa", textTransform:"uppercase",
                      letterSpacing:"0.6px", marginBottom:12 }}>
                      What you&apos;ll learn
                    </div>
                    {ch.notes && <NotesParagraphs text={ch.notes} />}
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:11, fontWeight:800, color:"#a78bfa", textTransform:"uppercase",
                      letterSpacing:"0.6px", marginBottom:12 }}>
                      Starter Code — figure out the rest!
                    </div>
                    <pre style={{
                      background:"#1e1e2e", borderRadius:10, padding:"14px 16px",
                      fontSize:12, fontFamily:"'Courier New', monospace", lineHeight:1.65,
                      margin:0, border:"2px solid #3a3a5e", overflowX:"hidden",
                      whiteSpace:"pre-wrap", userSelect:"none",
                    }}>
                      <span style={{ color:"#e2e8f0" }}>{visibleCode}</span>
                      {blurredCode && (
                        <span style={{
                          display:"block", color:"#e2e8f0",
                          filter:"blur(4px)", pointerEvents:"none",
                        }}>
                          {blurredCode}
                        </span>
                      )}
                    </pre>
                  </>
                )}
              </div>

              {/* RIGHT: tutorial example canvas OR challenge solution canvas */}
              {(isTut ? ch.example : ch.solutionCode) && (
                <div style={{ width:340, flexShrink:0, background:"#1a2540",
                  border:"1px solid rgba(99,179,237,0.15)", borderRadius:20,
                  boxShadow:"0 6px 20px rgba(0,0,0,0.4)", padding:"22px 24px", userSelect:"none" }}>
                  <div style={{ fontSize:11, fontWeight:800,
                    color:"#a78bfa",
                    textTransform:"uppercase", letterSpacing:"0.6px", marginBottom:12 }}>
                    {isTut ? "Example" : "Goal"}
                  </div>
                  {isTut && ch.example && (
                    <pre style={{ background:"#1e1e2e", color:"#e2e8f0", borderRadius:10,
                      padding:"14px 16px", fontSize:12, fontFamily:"'Courier New', monospace",
                      lineHeight:1.65, margin:"0 0 16px", overflowX:"auto",
                      border:"2px solid #3a3a5e", whiteSpace:"pre-wrap" }}>
                      {ch.example}
                    </pre>
                  )}
                  <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", marginBottom:8 }}>
                    {isTut ? "Output:" : "What you're building:"}
                  </div>
                  <ExampleCanvas code={(isTut ? ch.example : ch.solutionCode) ?? ""} size={292} />
                </div>
              )}

            </div>

            {/* Start button */}
            <div style={{ textAlign:"center", marginTop:28 }}>
              <button onClick={() => setView("editor")}
                style={{ background: isTut
                  ? "linear-gradient(135deg,#059669,#10b981)"
                  : "linear-gradient(135deg,#7c3aed,#8b5cf6)",
                  color:"white", border:"none", borderRadius:14, padding:"14px 40px",
                  fontSize:16, fontWeight:800, cursor:"pointer",
                  boxShadow:"0 4px 16px rgba(16,185,129,0.4)" }}>
                Start Challenge →
              </button>
            </div>

          </div>
        </main>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  const isTutorial = activeChallenge?.category === "tutorial";
  const hasNotes   = isTutorial ? !!activeChallenge?.notes : !!activeChallenge?.previewLines;
  const editorTabs = [
    { key: "task",      label: "Task" },
    ...(hasNotes ? [{ key: "notes", label: "Notes" }] : []),
    { key: "reference", label: "Reference" },
  ] as { key: typeof leftTab; label: string }[];

  const CARD: React.CSSProperties = {
    background:"#1a2540", border:"1px solid rgba(99,179,237,0.15)",
    borderRadius:16, boxShadow:"0 6px 20px rgba(0,0,0,0.5)",
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", flexDirection:"column", fontFamily:"system-ui, sans-serif" }}>
      <SiteHeader>
        <button onClick={() => { stopAnim(); setView(isTutorial && activeChallenge?.notes ? "notes" : "hub"); setJustCompleted(false); }}
          style={{ border:"1px solid rgba(255,255,255,0.6)", color:"white", background:"transparent",
            padding:"7px 14px", borderRadius:999, fontWeight:600, fontSize:13, cursor:"pointer" }}>
          ← {isTutorial ? "Notes" : "Tutorials"}
        </button>
      </SiteHeader>

      <main style={{ flex:1, display:"flex", flexDirection:"column", backgroundColor:"#0c1120", overflow:"hidden" }}>

        {/* Top bar */}
        <div style={{ background:"#131d2e", borderBottom:"1px solid rgba(255,255,255,0.08)",
          padding:"10px 20px", display:"flex", alignItems:"center", gap:14, flexShrink:0 }}>
          <span style={{ fontWeight:900, fontSize:15, color:"#e2e8f0" }}>🐢 Python Turtle</span>
          <span style={{ color:"rgba(255,255,255,0.2)" }}>|</span>
          <span style={{ fontSize:13, color:"#64748b", fontWeight:600 }}>{activeChallenge?.title ?? "Sandbox"}</span>
          {completedIds.has(activeId) && (
            <span style={{ fontSize:12, fontWeight:800, color:"#4ade80",
              background:"rgba(74,222,128,0.12)", border:"1px solid #4ade80", borderRadius:20, padding:"2px 10px" }}>
              ✓ Completed
            </span>
          )}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>Speed</span>
            <input type="range" min={0} max={10} value={speed} onChange={e=>setSpeed(+e.target.value)}
              style={{ width:90, accentColor:"#10b981" }} />
            <span style={{ fontSize:11, fontWeight:700, color:"#10b981", width:44 }}>
              {speed===0?"Instant":speed<=3?"Slow":speed<=6?"Medium":speed<=8?"Fast":"Turbo"}
            </span>
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ background:"#0d1629", borderBottom:"1px solid rgba(255,255,255,0.06)",
          padding:"6px 20px", display:"flex", alignItems:"center", gap:6, flexShrink:0, overflowX:"auto" }}>
          {tutorials.map((tut, i) => {
            const done = completedIds.has(tut.id);
            const act  = activeId === tut.id;
            const lock = i > 0 && !completedIds.has(tutorials[i-1].id);
            return (
              <button key={tut.id} onClick={lock ? undefined : () => jumpToEditor(tut)}
                style={{ padding:"4px 12px", borderRadius:14, fontSize:12, fontWeight:700,
                  cursor:lock?"default":"pointer", flexShrink:0, border:"none",
                  background:act?"#3b82f6":done?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.05)",
                  color:act?"#fff":done?"#4ade80":"#4a5568",
                  outline:`2px solid ${act?"#3b82f6":done?"#4ade80":"rgba(255,255,255,0.12)"}`,
                  outlineOffset:-2, opacity:lock?0.45:1 }}>
                {done&&!act?"✓ ":""}{i+1}
              </button>
            );
          })}
          {challenges.length > 0 && (
            <div style={{ width:1, height:18, background:"rgba(255,255,255,0.1)", margin:"0 4px", flexShrink:0 }} />
          )}
          {challenges.map((chalItem, i) => {
            const act  = activeId === chalItem.id;
            const lock = !tutorials.every(t => completedIds.has(t.id));
            return (
              <button key={chalItem.id} onClick={lock ? undefined : () => jumpToEditor(chalItem)}
                style={{ padding:"4px 12px", borderRadius:14, fontSize:12, fontWeight:700,
                  cursor:lock?"default":"pointer", flexShrink:0, border:"none",
                  background:act?"#8b5cf6":"rgba(255,255,255,0.05)",
                  color:act?"#fff":lock?"#4a5568":"#64748b",
                  outline:`2px solid ${act?"#8b5cf6":"rgba(255,255,255,0.12)"}`,
                  outlineOffset:-2, opacity:lock?0.45:1 }}>
                C{i+1}
              </button>
            );
          })}
        </div>

        {/* Success banner */}
        {justCompleted && (
          <div style={{ background:"linear-gradient(90deg,#065f46,#059669)",
            padding:"12px 20px", display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
            <span style={{ fontSize:20 }}>🎉</span>
            <span style={{ color:"white", fontWeight:800, fontSize:14 }}>
              Tutorial complete! You drew it successfully.
            </span>
            <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
              {nextTutorial && (
                <button onClick={() => handleChallengeSelect(nextTutorial)}
                  style={{ background:"white", color:"#065f46", border:"none",
                    borderRadius:8, padding:"7px 16px", fontWeight:800, fontSize:13, cursor:"pointer" }}>
                  Next: {nextTutorial.title} →
                </button>
              )}
              <button onClick={() => { stopAnim(); setView("hub"); setJustCompleted(false); }}
                style={{ background:"rgba(255,255,255,0.2)", color:"white",
                  border:"1.5px solid rgba(255,255,255,0.5)", borderRadius:8,
                  padding:"7px 16px", fontWeight:700, fontSize:13, cursor:"pointer" }}>
                Back to Hub
              </button>
            </div>
          </div>
        )}

        {/* Three-panel layout */}
        <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

          {/* LEFT */}
          <div style={{ width:270, flexShrink:0, display:"flex", flexDirection:"column",
            borderRight:"1px solid rgba(255,255,255,0.08)", background:"#131d2e" }}>

            <div style={{ display:"flex", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
              {editorTabs.map(({ key, label }) => (
                <button key={key} onClick={() => setLeftTab(key)} style={{
                  flex:1, padding:"9px 0", background:"transparent", border:"none",
                  borderBottom: leftTab===key ? "3px solid #10b981" : "3px solid transparent",
                  fontWeight:700, fontSize:12, color: leftTab===key ? "#10b981" : "#64748b",
                  cursor:"pointer", letterSpacing:"0.3px",
                }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ flex:1, overflowY:"auto", padding:"10px 8px" }}>

              {/* Task tab */}
              {leftTab === "task" && activeChallenge && (
                <div style={{ padding:"4px 4px 12px" }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"#64748b", letterSpacing:"0.8px",
                    textTransform:"uppercase", marginBottom:8 }}>
                    {activeChallenge.category === "tutorial" ? "Tutorial" : "Challenge"}
                  </div>
                  <div style={{ fontWeight:800, fontSize:14, color:"#e2e8f0", marginBottom:8 }}>
                    {activeChallenge.title}
                  </div>
                  <div style={{ fontSize:12, color:"#94a3b8", lineHeight:1.55, marginBottom:14 }}>
                    {activeChallenge.description}
                  </div>
                  {completedIds.has(activeChallenge.id) ? (
                    <div>
                      <div style={{ background:"rgba(74,222,128,0.12)", border:"1px solid #4ade80",
                        borderRadius:10, padding:"10px 12px", fontSize:12, fontWeight:700,
                        color:"#4ade80", marginBottom: nextTutorial ? 8 : 0 }}>
                        ✅ Completed! Keep experimenting or go back to the hub.
                      </div>
                      {nextTutorial && (
                        <button onClick={() => handleChallengeSelect(nextTutorial)}
                          style={{ width:"100%", background:"#10b981", color:"white",
                            border:"none", borderRadius:8, padding:"9px 0",
                            fontSize:12, fontWeight:800, cursor:"pointer", marginTop:4 }}>
                          Next: {nextTutorial.title} →
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ background:"rgba(234,179,8,0.1)", border:"1px solid rgba(234,179,8,0.4)",
                      borderRadius:10, padding:"10px 12px", fontSize:12, color:"#fde68a" }}>
                      <span style={{ fontWeight:800, display:"block", marginBottom:3 }}>💡 Hint</span>
                      {activeChallenge.hint}
                    </div>
                  )}
                  {/* Save / Submit buttons (challenges only) */}
                  {!isTutorial && session?.user && (
                    <div style={{ marginTop:14, display:"flex", flexDirection:"column", gap:8 }}>
                      {/* Save button — always available */}
                      <button onClick={handleSave} disabled={saving || running || !hasRunOnce}
                        style={{ width:"100%", background: hasRunOnce ? "#1e40af" : "#e5e7eb",
                          color: hasRunOnce ? "white" : "#9ca3af", border:"none",
                          borderRadius:8, padding:"9px 0", fontSize:12, fontWeight:800,
                          cursor: hasRunOnce && !running ? "pointer" : "default" }}>
                        {saving ? "Saving…" : isSaved ? "💾 Saved ✓" : hasRunOnce ? "💾 Save Work" : "Run your code first"}
                      </button>
                      {/* Submit — only if enrolled in a class */}
                      {isEnrolled && (
                        <button onClick={handleSubmit} disabled={submitting || running || !hasRunOnce}
                          style={{ width:"100%", background: hasRunOnce
                            ? (isSubmitted ? "#059669" : "linear-gradient(135deg,#7c3aed,#8b5cf6)") : "#e5e7eb",
                            color: hasRunOnce ? "white" : "#9ca3af", border:"none",
                            borderRadius:8, padding:"9px 0", fontSize:12, fontWeight:800,
                            cursor: hasRunOnce && !running ? "pointer" : "default" }}>
                          {submitting ? "Submitting…" : isSubmitted ? "📤 Submitted ✓" : hasRunOnce ? "📤 Submit for Review" : ""}
                        </button>
                      )}
                    </div>
                  )}
                  <button onClick={() => { stopAnim(); setView("hub"); setJustCompleted(false); }}
                    style={{ marginTop:10, width:"100%", background:"transparent",
                      border:"1px solid rgba(255,255,255,0.15)", borderRadius:8, padding:"8px 0",
                      fontSize:12, fontWeight:700, color:"#94a3b8", cursor:"pointer" }}>
                    ← Back to Hub
                  </button>
                </div>
              )}

              {/* Notes tab */}
              {leftTab === "notes" && activeChallenge && hasNotes && (
                <div style={{ padding:"4px 4px 12px", userSelect:"none" }}>
                  {isTutorial ? (
                    <>
                      <div style={{ fontSize:10, fontWeight:800, color:"#60a5fa", letterSpacing:"0.8px",
                        textTransform:"uppercase", marginBottom:10 }}>
                        What you&apos;ll learn
                      </div>
                      {activeChallenge.notes && <NotesParagraphs text={activeChallenge.notes} />}
                      {activeChallenge.example && (
                        <>
                          <div style={{ fontSize:10, fontWeight:800, color:"#8b5cf6", letterSpacing:"0.8px",
                            textTransform:"uppercase", margin:"14px 0 8px" }}>
                            Example
                          </div>
                          <pre style={{ background:"#1e1e2e", color:"#e2e8f0", borderRadius:8,
                            padding:"10px 12px", fontSize:11, fontFamily:"'Courier New', monospace",
                            lineHeight:1.6, margin:0, overflowX:"auto",
                            border:"1px solid #3a3a5e", whiteSpace:"pre-wrap" }}>
                            {activeChallenge.example}
                          </pre>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:10, fontWeight:800, color:"#8b5cf6", letterSpacing:"0.8px",
                        textTransform:"uppercase", marginBottom:10 }}>
                        Starter Code Preview
                      </div>
                      {(() => {
                        const cLines = activeChallenge.starterCode.trimEnd().split("\n");
                        const vis = cLines.slice(0, activeChallenge.previewLines ?? cLines.length).join("\n");
                        const blr = activeChallenge.previewLines ? cLines.slice(activeChallenge.previewLines).join("\n") : "";
                        return (
                          <pre style={{ background:"#1e1e2e", borderRadius:8, padding:"10px 12px",
                            fontSize:11, fontFamily:"'Courier New', monospace", lineHeight:1.6,
                            margin:"0 0 14px", border:"1px solid #3a3a5e", overflowX:"hidden",
                            whiteSpace:"pre-wrap", userSelect:"none" }}>
                            <span style={{ color:"#e2e8f0" }}>{vis}</span>
                            {blr && (
                              <span style={{ display:"block", color:"#e2e8f0",
                                filter:"blur(4px)", pointerEvents:"none" }}>
                                {blr}
                              </span>
                            )}
                          </pre>
                        );
                      })()}
                      {activeChallenge.solutionCode && (
                        <>
                          <div style={{ fontSize:10, fontWeight:800, color:"#8b5cf6", letterSpacing:"0.8px",
                            textTransform:"uppercase", marginBottom:8 }}>
                            Goal
                          </div>
                          <ExampleCanvas code={activeChallenge.solutionCode} size={238} />
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Reference tab */}
              {leftTab === "reference" && <div style={{ userSelect:"none" }}>{CMD_REF.map(group => (
                <div key={group.group} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, fontWeight:800, color:"#64748b", letterSpacing:"0.8px",
                    textTransform:"uppercase", paddingLeft:4, marginBottom:5 }}>{group.group}</div>
                  {group.items.map(item => (
                    <div key={item.cmd} style={{ display:"flex", alignItems:"baseline",
                      gap:6, padding:"3px 6px", borderRadius:6 }}>
                      <code style={{ fontSize:11, fontFamily:"monospace", color:"#93c5fd",
                        background:"rgba(99,179,237,0.15)", padding:"1px 5px", borderRadius:4, flexShrink:0 }}>
                        {item.cmd}
                      </code>
                      {item.desc && <span style={{ fontSize:11, color:"#94a3b8" }}>{item.desc}</span>}
                    </div>
                  ))}
                </div>
              ))}</div>}

            </div>
          </div>

          {/* CENTER: editor */}
          <div style={{ width:360, flexShrink:0, display:"flex", flexDirection:"column",
            borderRight:"2px solid #e5e7eb", background:"#1e1e2e" }}>

            {activeChallenge && (
              <div style={{ background:"#2a2a3e", borderBottom:"1px solid #3a3a5e",
                padding:"7px 12px", fontSize:12, color:"#a5b4fc", fontWeight:600, flexShrink:0 }}>
                💡 {activeChallenge.hint}
              </div>
            )}

            <textarea value={code} onChange={e=>setCode(e.target.value)}
              onKeyDown={handleKeyDown} spellCheck={false} autoCorrect="off" autoCapitalize="off"
              style={{ flex:1, background:"transparent", border:"none", outline:"none",
                color:"#e2e8f0", fontFamily:"'Courier New', Courier, monospace",
                fontSize:13, lineHeight:1.65, padding:"12px 14px",
                resize:"none", overflowY:"auto" }} />

            <div style={{ padding:"10px 12px", borderTop:"1px solid #3a3a5e",
              display:"flex", gap:8, background:"#16162a", flexShrink:0 }}>
              <button onClick={runCode} disabled={running}
                style={{ flex:1, background:running?"#374151":"#10b981", color:"white",
                  border:"none", borderRadius:8, padding:"9px 0", fontWeight:800,
                  fontSize:13, cursor:running?"default":"pointer" }}>
                ▶ Run
              </button>
              <button onClick={stopAnim} disabled={!running}
                style={{ background:running?"#dc2626":"#374151", color:running?"white":"#6b7280",
                  border:"none", borderRadius:8, padding:"9px 14px", fontWeight:800,
                  fontSize:13, cursor:running?"pointer":"default" }}>
                ■ Stop
              </button>
              <button onClick={()=>{ stopAnim(); resetBg(); setError(null); setPrints([]); setJustCompleted(false); }}
                disabled={running}
                style={{ background:"transparent", color:"#9ca3af", border:"1px solid #4b5563",
                  borderRadius:8, padding:"9px 12px", fontWeight:700, fontSize:12,
                  cursor:running?"default":"pointer", opacity:running?0.5:1 }}>
                ↺ Clear
              </button>
            </div>
          </div>

          {/* RIGHT: canvas + output */}
          <div style={{ flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"flex-start",
            padding:"20px 16px", overflowY:"auto", background:"#0c1120" }}>

            <div style={{ ...CARD, padding:0, overflow:"hidden", marginBottom:12,
              border:error?"2px solid #dc2626":"1px solid rgba(99,179,237,0.15)",
              boxShadow:error?"0 0 0 3px rgba(220,38,38,0.2), 0 8px 24px rgba(0,0,0,0.5)":undefined }}>
              <canvas ref={canvasRef} width={CS} height={CS} style={{ display:"block", maxWidth:"100%" }} />
            </div>

            {(error || prints.length > 0) && (
              <div style={{ ...CARD, padding:"10px 14px", width:CS, maxWidth:"100%",
                borderColor:error?"#dc2626":"#4ade80",
                background:error?"rgba(239,68,68,0.1)":"rgba(74,222,128,0.08)" }}>
                <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.7px",
                  textTransform:"uppercase", color:error?"#fca5a5":"#4ade80", marginBottom:4 }}>
                  {error?"Error":"Output"}
                </div>
                {error && <div style={{ fontFamily:"monospace", fontSize:12, color:"#fca5a5" }}>{error}</div>}
                {prints.map((p,i) => (
                  <div key={i} style={{ fontFamily:"monospace", fontSize:12, color:"#86efac" }}>{p}</div>
                ))}
              </div>
            )}

            <div style={{ marginTop:8, fontSize:11, color:"#4a5568", fontWeight:600 }}>
              Ctrl+Enter to run · Tab inserts 4 spaces
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

// ─── Hub card components ──────────────────────────────────────────────────────
function TutorialCard({ ch, index, completed, locked, onClick }: {
  ch: TurtleChallenge; index: number; completed: boolean; locked: boolean; onClick?: () => void;
}) {
  const bgColor = locked ? "rgba(255,255,255,0.04)" : completed ? "rgba(74,222,128,0.08)" : "#1a2540";
  const border  = locked ? "1px solid rgba(255,255,255,0.08)" : completed ? "1px solid #4ade80" : "1px solid rgba(99,179,237,0.25)";
  return (
    <button onClick={onClick} disabled={locked}
      style={{ width:175, textAlign:"left", background:bgColor, border, borderRadius:14,
        padding:"14px 16px", cursor:locked?"not-allowed":"pointer", opacity:locked?0.55:1,
        boxShadow:locked?"none":"0 2px 8px rgba(0,0,0,0.3)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:11, fontWeight:800,
          color:locked?"#4a5568":completed?"#4ade80":"#60a5fa",
          textTransform:"uppercase", letterSpacing:"0.5px" }}>
          Step {index + 1}
        </span>
        <span style={{ fontSize:16 }}>{locked?"🔒":completed?"✅":""}</span>
      </div>
      <div style={{ fontWeight:800, fontSize:13, color:locked?"#4a5568":"#e2e8f0", marginBottom:4 }}>
        {ch.title.replace(/^\d+\.\s*/, "")}
      </div>
      <div style={{ fontSize:11, color:locked?"#4a5568":"#94a3b8", lineHeight:1.4 }}>{ch.description}</div>
    </button>
  );
}

function ChallengeCard({ ch, locked, onClick }: {
  ch: TurtleChallenge; locked: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick} disabled={locked}
      style={{ width:175, textAlign:"left",
        background:locked?"rgba(255,255,255,0.04)":"#1a2540",
        border:locked?"1px solid rgba(255,255,255,0.08)":"1px solid rgba(139,92,246,0.35)",
        borderRadius:14, padding:"14px 16px", cursor:locked?"not-allowed":"pointer",
        opacity:locked?0.55:1, boxShadow:locked?"none":"0 2px 8px rgba(0,0,0,0.3)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <span style={{ fontSize:11, fontWeight:800,
          color:locked?"#4a5568":"#a78bfa", textTransform:"uppercase", letterSpacing:"0.5px" }}>
          Challenge
        </span>
        {locked && <span style={{ fontSize:14 }}>🔒</span>}
      </div>
      <div style={{ fontWeight:800, fontSize:13, color:locked?"#4a5568":"#e2e8f0", marginBottom:4 }}>
        {ch.title}
      </div>
      <div style={{ fontSize:11, color:locked?"#4a5568":"#94a3b8", lineHeight:1.4 }}>{ch.description}</div>
    </button>
  );
}
