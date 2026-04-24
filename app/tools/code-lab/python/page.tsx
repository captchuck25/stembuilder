"use client";

import { useSession } from 'next-auth/react';

import { useEffect, useRef, useState, useCallback } from "react";

import Link from "next/link";
import SiteHeader from "@/app/components/SiteHeader";
import { getProfile } from "@/lib/profile";
import { EditorView, basicSetup } from "codemirror";
import { pythonLanguage } from "@codemirror/lang-python";
import { CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { LEVELS, type Challenge, type Dir } from "./levels";

// ─── Constants ────────────────────────────────────────────────────────────────

const CELL = 40;
const DIR_DELTA: [number, number][] = [[0,-1],[1,0],[0,1],[-1,0]];
const DIR_LABEL = ["North","East","South","West"];
const STORAGE_KEY = "python_maze_progress";

// ─── Progress helpers ─────────────────────────────────────────────────────────

interface Progress {
  completedChallenges: Record<string, boolean>; // "levelIdx_chalIdx"
  completedLevels: Record<number, boolean>;
  savedCode: Record<string, string>;           // "levelIdx_chalIdx" → last code
}
function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { savedCode: {}, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { completedChallenges: {}, completedLevels: {}, savedCode: {} };
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

async function syncProgressToCloud(
  userId: string,
  li: number,
  ci: number | null,
  completed: boolean,
  savedCode?: string,
  quizScore?: number
) {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: "code-lab-python",
      level_idx: li,
      challenge_idx: ci ?? -1,
      completed,
      saved_code: savedCode ?? null,
      quiz_score: quizScore ?? null,
    }),
  });
}

async function syncCodeToCloud(userId: string, li: number, ci: number, code: string) {
  await fetch("/api/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: "code-lab-python",
      level_idx: li,
      challenge_idx: ci,
      completed: false,
      saved_code: code,
    }),
  });
}

async function loadProgressFromCloud(_userId: string): Promise<Progress> {
  const res = await fetch("/api/progress?tool=code-lab-python");
  const data = res.ok ? await res.json() : [];

  const p: Progress = { completedChallenges: {}, completedLevels: {}, savedCode: {} };
  for (const row of data ?? []) {
    if (row.challenge_idx !== null && row.challenge_idx >= 0) {
      const key = `${row.level_idx}_${row.challenge_idx}`;
      if (row.completed) p.completedChallenges[key] = true;
      if (row.saved_code) p.savedCode[key] = row.saved_code;
    } else if (row.completed) {
      p.completedLevels[row.level_idx] = true;
    }
  }
  return p;
}
function chalKey(li: number, ci: number) { return `${li}_${ci}`; }
function countCompleted(li: number, p: Progress) {
  return LEVELS[li].challenges.filter((_, ci) => p.completedChallenges[chalKey(li, ci)]).length;
}

// ─── Phase type ───────────────────────────────────────────────────────────────

type Phase =
  | { tag: "overview" }
  | { tag: "intro"; li: number }
  | { tag: "challenge"; li: number; ci: number }
  | { tag: "quiz"; li: number }
  | { tag: "complete"; li: number; score: number; total: number };

// ─── Maze execution engine ────────────────────────────────────────────────────

interface MoveRecord { type: string; x: number; y: number; dir: Dir; }

function runMaze(ch: Challenge, code: string): { moves: MoveRecord[]; error: string | null; solved: boolean } {
  const indentErr = validateIndentation(code);
  if (indentErr) return { moves: [], error: indentErr, solved: false };

  const { grid } = ch;
  let x = ch.startX, y = ch.startY, dir: Dir = ch.startDir;
  const moves: MoveRecord[] = [];
  let error: string | null = null;
  let solved = false;
  const MAX = 2000;
  // Records moves.length the moment robot first steps onto the exit.
  // Any action after that (turn or move) increments moves.length above this value → fail.
  let exitReachedMoveCount: number | null = null;

  function isWall(nx: number, ny: number) {
    if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) return true;
    return grid[ny][nx] === 1;
  }

  const api = {
    move_forward: () => {
      if (moves.length >= MAX) throw new Error("Move limit reached — check for infinite loops.");
      const [dx,dy] = DIR_DELTA[dir];
      const nx = x+dx, ny = y+dy;
      if (isWall(nx,ny)) throw new Error(`Wall to the ${DIR_LABEL[dir]}! Can't move forward.`);
      x=nx; y=ny;
      moves.push({ type:"move", x, y, dir });
      if (x === ch.exitX && y === ch.exitY && exitReachedMoveCount === null) {
        exitReachedMoveCount = moves.length;
      }
    },
    turn_left:    () => { dir=((dir+3)%4) as Dir; moves.push({type:"turn",x,y,dir}); },
    turn_right:   () => { dir=((dir+1)%4) as Dir; moves.push({type:"turn",x,y,dir}); },
    turn_around:  () => { dir=((dir+2)%4) as Dir; moves.push({type:"turn",x,y,dir}); },
    // path_* — renamed; these throw a helpful error so students update their code
    path_ahead:  () => { throw new Error("path_ahead() is not recognized. Use has_path_ahead() instead."); },
    path_left:   () => { throw new Error("path_left() is not recognized. Use has_path_left() instead."); },
    path_right:  () => { throw new Error("path_right() is not recognized. Use has_path_right() instead."); },
    // has_path_* / forward / at_goal — Level 3–4 naming convention (aliases)
    has_path_ahead:   () => { const [dx,dy]=DIR_DELTA[dir]; return !isWall(x+dx,y+dy); },
    has_path_forward: () => { const [dx,dy]=DIR_DELTA[dir]; return !isWall(x+dx,y+dy); },
    has_path_left:    () => { const [dx,dy]=DIR_DELTA[((dir+3)%4) as Dir]; return !isWall(x+dx,y+dy); },
    has_path_right:   () => { const [dx,dy]=DIR_DELTA[((dir+1)%4) as Dir]; return !isWall(x+dx,y+dy); },
    at_goal:          () => x===ch.exitX && y===ch.exitY,
    // wall_* — kept for backward compatibility with saved student code
    wall_ahead:   () => { const [dx,dy]=DIR_DELTA[dir]; return isWall(x+dx,y+dy); },
    wall_left:    () => { const [dx,dy]=DIR_DELTA[((dir+3)%4) as Dir]; return isWall(x+dx,y+dy); },
    wall_right:   () => { const [dx,dy]=DIR_DELTA[((dir+1)%4) as Dir]; return isWall(x+dx,y+dy); },
    at_exit:      () => x===ch.exitX && y===ch.exitY,
  };

  try {
    // eslint-disable-next-line no-new-func
    new Function("__api", `
      "use strict";
      const move_forward=__api.move_forward, forward=__api.move_forward,
            turn_left=__api.turn_left, turn_right=__api.turn_right,
            turn_around=__api.turn_around,
            path_ahead=__api.path_ahead, path_left=__api.path_left,
            path_right=__api.path_right,
            has_path_ahead=__api.has_path_ahead,
            has_path_forward=__api.has_path_forward,
            has_path_left=__api.has_path_left,
            has_path_right=__api.has_path_right,
            at_goal=__api.at_goal,
            wall_ahead=__api.wall_ahead, wall_left=__api.wall_left,
            wall_right=__api.wall_right, at_exit=__api.at_exit;
      ${transpilePython(code)}
    `)(api);
  } catch(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  // Solved = reached exit AND no actions ran after landing there (no extra loop iterations).
  // !error catches straight corridors where extra steps hit the boundary wall.
  // moves.length === exitReachedMoveCount catches conditional loops that turn in place at exit.
  solved = !error && exitReachedMoveCount !== null && moves.length === exitReachedMoveCount;
  return { moves, error, solved };
}

// ─── Python indentation validator ────────────────────────────────────────────

function validateIndentation(src: string): string | null {
  const lines = src.split("\n");
  const stack: number[] = [0];  // stack of valid indent levels
  let expectIndent = false;     // true right after a line ending with ':'
  let prevIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.trimStart();
    if (stripped === "" || stripped.startsWith("#")) continue;

    const indent = raw.length - stripped.length;
    const lineNum = i + 1;

    if (expectIndent) {
      // The line after a block opener MUST be more indented
      if (indent <= prevIndent) {
        return `IndentationError on line ${lineNum}: expected an indented block after ':'`;
      }
      stack.push(indent);
      expectIndent = false;
    } else if (indent > stack[stack.length - 1]) {
      // Got more indentation without a preceding ':'
      return `IndentationError on line ${lineNum}: unexpected indent`;
    } else if (indent < stack[stack.length - 1]) {
      // Dedenting — must land on a level that is already in the stack
      if (!stack.includes(indent)) {
        return `IndentationError on line ${lineNum}: unindent does not match any outer indentation level`;
      }
      while (stack[stack.length - 1] > indent) stack.pop();
    }

    prevIndent = indent;
    // Does this line open a new block?
    const isBlockOpener = /:\s*(#.*)?$/.test(stripped);
    if (isBlockOpener) expectIndent = true;
  }
  return null;
}

// ─── Python → JS transpiler ───────────────────────────────────────────────────

function transpilePython(src: string): string {
  const lines = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stripped = line.trimStart();
    const indent = line.length - stripped.length;
    const ind = " ".repeat(indent);
    if (stripped === "" || stripped.startsWith("#")) {
      out.push(stripped.startsWith("#") ? ind + "//" + stripped.slice(1) : line);
      i++; continue;
    }
    const forM = stripped.match(/^for\s+(\w+)\s+in\s+range\((\d+)\)\s*:/);
    if (forM) { out.push(`${ind}for(let ${forM[1]}=0;${forM[1]}<${forM[2]};${forM[1]}++){`); i++; continue; }
    const whileM = stripped.match(/^while\s+(.+?)\s*:/);
    if (whileM) { out.push(`${ind}while(${tc(whileM[1])}){`); i++; continue; }
    const ifM = stripped.match(/^if\s+(.+?)\s*:/);
    if (ifM) { out.push(`${ind}if(${tc(ifM[1])}){`); i++; continue; }
    const elifM = stripped.match(/^elif\s+(.+?)\s*:/);
    if (elifM) { out.push(`${ind}}else if(${tc(elifM[1])}){`); i++; continue; }
    if (/^else\s*:/.test(stripped)) { out.push(`${ind}}else{`); i++; continue; }
    if (/^pass\s*$/.test(stripped)) { out.push(`${ind};`); i++; continue; }
    out.push(`${ind}${ts(stripped)}`);
    i++;
  }
  return closeBlocks(out.join("\n"));
}

function tc(c: string) {
  return c.replace(/\bnot\s+/g,"!").replace(/\band\b/g,"&&").replace(/\bor\b/g,"||")
          .replace(/\bTrue\b/g,"true").replace(/\bFalse\b/g,"false");
}
function ts(s: string) {
  return s.replace(/\bTrue\b/g,"true").replace(/\bFalse\b/g,"false")
          .replace(/\bnot\s+/g,"!").replace(/\band\b/g,"&&").replace(/\bor\b/g,"||");
}

function closeBlocks(code: string): string {
  const lines = code.split("\n");
  const result: string[] = [];
  const stack: number[] = [0];
  function nextIndent(from: number, fb: number) {
    for (let j=from; j<lines.length; j++) {
      const s = lines[j].trimStart();
      if (s !== "" && !s.startsWith("//")) return lines[j].length - s.length;
    }
    return fb;
  }
  for (let i=0; i<lines.length; i++) {
    const line = lines[i];
    const stripped = line.trimStart();
    if (stripped === "" || stripped.startsWith("//")) { result.push(line); continue; }
    const indent = line.length - stripped.length;
    if (stripped.startsWith("}")) {
      if (stack.length > 1) stack.pop();
      if (stripped.endsWith("{")) stack.push(nextIndent(i+1, indent+4));
    } else {
      while (stack.length > 1 && stack[stack.length-1] > indent) {
        result.push(" ".repeat(stack[stack.length-2]) + "}");
        stack.pop();
      }
      if (stripped.endsWith("{")) stack.push(nextIndent(i+1, indent+4));
    }
    result.push(line);
  }
  while (stack.length > 1) { stack.pop(); result.push("}"); }
  return result.join("\n");
}

// ─── Maze canvas ──────────────────────────────────────────────────────────────

const GUTTER = 14; // dark-navy strip around all maze edges

function MazeCanvas({ ch, px, py, pdir, solved, robotFlash }: { ch: Challenge; px: number; py: number; pdir: Dir; solved: boolean; robotFlash?: boolean }) {
  const rows = ch.grid.length, cols = ch.grid[0].length;
  const W = cols*CELL + GUTTER*2, H = rows*CELL + GUTTER*2;
  const angle = [Math.PI*1.5, 0, Math.PI*0.5, Math.PI][pdir];
  const cx2 = px*CELL+CELL/2+GUTTER, cy2 = py*CELL+CELL/2+GUTTER, r = CELL*0.36;
  const tip  = [cx2+Math.cos(angle)*r,   cy2+Math.sin(angle)*r];
  const lp   = [cx2+Math.cos(angle+2.4)*r*0.6, cy2+Math.sin(angle+2.4)*r*0.6];
  const rp   = [cx2+Math.cos(angle-2.4)*r*0.6, cy2+Math.sin(angle-2.4)*r*0.6];
  const arrow = `M${tip[0]},${tip[1]} L${lp[0]},${lp[1]} L${cx2},${cy2} L${rp[0]},${rp[1]} Z`;
  return (
    <svg width={W} height={H} style={{ display:"block", borderRadius:12, maxWidth:"100%" }}>
      <rect width={W} height={H} fill="#1a1a2e" />
      {ch.grid.map((row,ry) => row.map((cell,cx) => {
        const gx=cx*CELL+GUTTER, gy=ry*CELL+GUTTER;
        const isExit = cx===ch.exitX && ry===ch.exitY;
        const isStart = cx===ch.startX && ry===ch.startY;
        if (cell===1) return <rect key={`${ry}-${cx}`} x={gx} y={gy} width={CELL} height={CELL} fill="#2d3561" stroke="#1a1a2e" strokeWidth={1}/>;
        return (
          <g key={`${ry}-${cx}`}>
            <rect x={gx} y={gy} width={CELL} height={CELL} fill="#f0f0e8" stroke="#ccc" strokeWidth={0.5}/>
            {isExit && <><rect x={gx+2} y={gy+2} width={CELL-4} height={CELL-4} fill={solved?"#22c55e":"#fbbf24"} rx={4}/><text x={gx+CELL/2} y={gy+CELL/2+6} textAnchor="middle" fontSize={18}>{solved?"✓":"★"}</text></>}
            {isStart && !isExit && <rect x={gx+2} y={gy+2} width={CELL-4} height={CELL-4} fill="#dbeafe" rx={4}/>}
          </g>
        );
      }))}
      <circle cx={cx2} cy={cy2} r={r} fill={solved ? "#22c55e" : robotFlash ? "#dc2626" : "#3b82f6"}/>
      <path d={arrow} fill="white"/>
      {/* Uniform frame drawn on top — covers cell edges so border is always even */}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="#1a1a2e" strokeWidth={GUTTER*2} />
    </svg>
  );
}

// ─── Lesson renderer ──────────────────────────────────────────────────────────

function LessonPanel({ text }: { text: string }) {
  const lines = text.split("\n");
  const els: React.ReactNode[] = [];
  let inCode=false, codeLines: string[] = [], k=0;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        els.push(<pre key={k++} style={{background:"#1e1e2e",color:"#cdd6f4",padding:"10px 14px",borderRadius:8,fontSize:13,overflowX:"auto",margin:"6px 0"}}><code>{codeLines.join("\n")}</code></pre>);
        codeLines=[]; inCode=false;
      } else inCode=true;
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (line.startsWith("# ")) els.push(<h2 key={k++} style={{fontSize:20,fontWeight:900,margin:"0 0 12px",color:"#111"}}>{line.slice(2)}</h2>);
    else if (line.startsWith("## ")) els.push(<h3 key={k++} style={{fontSize:15,fontWeight:800,margin:"14px 0 4px",color:"#111"}}>{line.slice(3)}</h3>);
    else if (line.startsWith("| ")) {
      const cells = line.split("|").filter((_,i,a)=>i>0&&i<a.length-1).map(c=>c.trim());
      const isHeader = lines[lines.indexOf(line)+1]?.startsWith("|---");
      if (!isHeader) els.push(<tr key={k++}>{cells.map((c,i)=><td key={i} style={{padding:"6px 12px",borderBottom:"1px solid #e5e7eb",fontSize:13,color:"#222"}}>{ic(c)}</td>)}</tr>);
      else els.push(<thead key={k++}><tr>{cells.map((c,i)=><th key={i} style={{padding:"6px 12px",textAlign:"left",background:"#e8eaf0",color:"#111",fontSize:13,fontWeight:800,borderBottom:"2px solid #c7cadc"}}>{c}</th>)}</tr></thead>);
    } else if (line.startsWith("|---")) { /* skip separator */ }
    else if (line.startsWith("- ")) els.push(<li key={k++} style={{marginLeft:16,fontSize:13,lineHeight:1.8,color:"#222"}}>{ic(line.slice(2))}</li>);
    else if (line.trim()==="") els.push(<div key={k++} style={{height:8}}/>);
    else els.push(<p key={k++} style={{fontSize:13,lineHeight:1.8,color:"#222",margin:"2px 0"}}>{ic(line)}</p>);
  }
  // Wrap table rows in table — keep thead outside tbody
  const wrapped: React.ReactNode[] = [];
  let tableRows: React.ReactNode[] = [];
  const flushTable = () => {
    if (!tableRows.length) return;
    const head = tableRows.filter(r => (r as React.ReactElement).type === "thead");
    const body = tableRows.filter(r => (r as React.ReactElement).type === "tr");
    wrapped.push(
      <table key={`t${k++}`} style={{borderCollapse:"collapse",width:"100%",margin:"8px 0",color:"#222"}}>
        {head}
        <tbody>{body}</tbody>
      </table>
    );
    tableRows = [];
  };
  for (const el of els) {
    if ((el as React.ReactElement)?.type === "tr" || (el as React.ReactElement)?.type === "thead") {
      tableRows.push(el);
    } else {
      flushTable();
      wrapped.push(el);
    }
  }
  flushTable();
  return <div style={{padding:"20px 22px",overflowY:"auto",flex:1}}>{wrapped}</div>;
}

function ic(text: string): React.ReactNode {
  // Split on backtick code spans and **bold** spans
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p,i) => {
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} style={{background:"#dde1f0",color:"#1a1a3e",padding:"1px 6px",borderRadius:4,fontSize:12,fontFamily:"monospace",fontWeight:600}}>{p.slice(1,-1)}</code>;
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i} style={{fontWeight:800,color:"#111"}}>{p.slice(2,-2)}</strong>;
    return p;
  });
}

// ─── Shared header / footer ───────────────────────────────────────────────────

const NAV_LINK: React.CSSProperties = { border:"1px solid #fff",color:"#fff",padding:"8px 14px",borderRadius:999,fontWeight:600,fontSize:14,textDecoration:"none",background:"transparent" };

function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",fontFamily:"system-ui,sans-serif",background:"#0c1120"}}>
      <SiteHeader>
        <Link href="/teachers" style={NAV_LINK}>Teachers</Link>
      </SiteHeader>
      <main style={{flex:1}}>
        {children}
      </main>
      <footer style={{height:40,width:"100%",backgroundImage:"url('/ui/footer-metal.png')",backgroundSize:"cover",backgroundPosition:"center"}}/>
    </div>
  );
}

// ─── Card style ───────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = { background:"#1a2540",border:"1px solid rgba(99,179,237,0.15)",borderRadius:20,boxShadow:"0 14px 30px rgba(0,0,0,0.5)" };

// ─── Overview screen ──────────────────────────────────────────────────────────

function Overview({ progress, onSelect, isTeacher }: { progress: Progress; onSelect: (li: number) => void; isTeacher: boolean }) {
  return (
    <SiteChrome>
      <div style={{maxWidth:900,margin:"0 auto",padding:"40px 32px"}}>
        <div style={{...CARD,padding:"18px 24px",marginBottom:28}}>
          <Link href="/tools/code-lab" style={{color:"#94a3b8",fontSize:13,fontWeight:600,textDecoration:"none"}}>← Code Lab</Link>
          <h1 style={{fontSize:28,fontWeight:900,color:"#e2e8f0",margin:"8px 0 4px"}}>Python Maze Challenges</h1>
          <p style={{fontSize:14,fontWeight:600,color:"#94a3b8",margin:0}}>
            {isTeacher ? "Preview all levels — students unlock them as they progress." : "Complete each level to unlock the next."}
          </p>
        </div>
        <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
          {LEVELS.map((lv, li) => {
            const done = countCompleted(li, progress);
            const total = lv.challenges.length;
            const locked = !isTeacher && li > 0 && !progress.completedLevels[li-1];
            const pct = total ? Math.round(done/total*100) : 0;
            return (
              <div key={lv.id} onClick={() => !locked && onSelect(li)}
                style={{...CARD, width:240, padding:24, cursor:locked?"not-allowed":"pointer", opacity:locked?0.55:1, transition:"transform 150ms ease, box-shadow 150ms ease", position:"relative", overflow:"hidden"}}
                onMouseEnter={e => { if (!locked) { (e.currentTarget as HTMLElement).style.transform="translateY(-4px)"; (e.currentTarget as HTMLElement).style.boxShadow="0 20px 40px rgba(0,0,0,0.28)"; }}}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=""; (e.currentTarget as HTMLElement).style.boxShadow=CARD.boxShadow as string; }}
              >
                <div style={{position:"absolute",top:0,left:0,right:0,height:6,background:lv.color,borderRadius:"20px 20px 0 0"}}/>
                {locked && <div style={{position:"absolute",top:12,right:14,fontSize:18}}>🔒</div>}
                {progress.completedLevels[li] && <div style={{position:"absolute",top:12,right:14,fontSize:18}}>✅</div>}
                <div style={{fontSize:12,fontWeight:700,color:lv.color,textTransform:"uppercase",letterSpacing:"0.6px",marginTop:8}}>Level {lv.id}</div>
                <div style={{fontSize:20,fontWeight:900,color:"#e2e8f0",margin:"4px 0 6px"}}>{lv.title}</div>
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>{lv.tagline}</div>
                <div style={{background:"rgba(255,255,255,0.1)",borderRadius:20,height:6,overflow:"hidden"}}>
                  <div style={{width:`${pct}%`,height:"100%",background:lv.color,borderRadius:20,transition:"width 400ms ease"}}/>
                </div>
                <div style={{fontSize:11,color:"#64748b",marginTop:5}}>{done} / {total} challenges</div>
              </div>
            );
          })}
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Intro screen ─────────────────────────────────────────────────────────────

function LevelIntro({ li, onStart }: { li: number; onStart: () => void }) {
  const lv = LEVELS[li];
  return (
    <SiteChrome>
      <div style={{maxWidth:820,margin:"0 auto",padding:"40px 32px"}}>
        <button onClick={() => history.back()} style={{background:"transparent",border:"none",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer",padding:0,marginBottom:16}}>← Back to Levels</button>
        <div style={{...CARD,padding:0,overflow:"hidden"}}>
          <div style={{background:lv.color,padding:"20px 28px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.7px"}}>Level {lv.id}</div>
            <div style={{fontSize:26,fontWeight:900,color:"#fff",marginTop:2}}>{lv.title}</div>
            <div style={{fontSize:14,color:"rgba(255,255,255,0.8)",marginTop:4}}>{lv.tagline}</div>
          </div>
          <div style={{padding:"0 28px 28px"}}>
            <LessonPanel text={lv.introNotes}/>
            {lv.newCommands.length > 0 && (
              <div style={{background:"rgba(99,179,237,0.06)",border:"1px solid rgba(99,179,237,0.2)",borderRadius:14,padding:"16px 20px",margin:"16px 0"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#93c5fd",textTransform:"uppercase",letterSpacing:"0.6px",marginBottom:10}}>New Commands This Level</div>
                {lv.newCommands.map(c => (
                  <div key={c.cmd} style={{display:"flex",gap:12,marginBottom:8,alignItems:"flex-start"}}>
                    <code style={{background:"rgba(99,179,237,0.15)",color:"#93c5fd",padding:"2px 8px",borderRadius:6,fontSize:13,fontFamily:"monospace",whiteSpace:"nowrap",flexShrink:0}}>{c.cmd}</code>
                    <span style={{fontSize:13,color:"#94a3b8",lineHeight:1.5}}>{c.desc}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onStart} style={{marginTop:20,padding:"14px 36px",background:lv.color,color:"#fff",border:"none",borderRadius:12,fontSize:16,fontWeight:800,cursor:"pointer",display:"block",width:"100%",transition:"opacity 150ms"}}>
              Begin Level {lv.id} — Challenge 1 →
            </button>
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Per-level autocomplete ───────────────────────────────────────────────────

const LEVEL_CMDS = [
  // Level 0 — Commands
  [
    { label: "move_forward", apply: "move_forward()", type: "function", detail: "Move one step forward" },
    { label: "turn_right",   apply: "turn_right()",   type: "function", detail: "Turn 90° clockwise" },
    { label: "turn_left",    apply: "turn_left()",    type: "function", detail: "Turn 90° counter-clockwise" },
  ],
  // Level 1 — For Loops (cumulative)
  [
    { label: "move_forward", apply: "move_forward()", type: "function", detail: "Move one step forward" },
    { label: "turn_right",   apply: "turn_right()",   type: "function", detail: "Turn 90° clockwise" },
    { label: "turn_left",    apply: "turn_left()",    type: "function", detail: "Turn 90° counter-clockwise" },
    { label: "for",   type: "keyword",  detail: "Repeat a block n times" },
    { label: "range", apply: "range()", type: "function", detail: "Generate a number sequence" },
    { label: "in",    type: "keyword",  detail: "Used in for loops" },
  ],
  // Level 2 — If Statements (cumulative)
  [
    { label: "move_forward",    apply: "move_forward()",    type: "function", detail: "Move one step forward" },
    { label: "turn_right",      apply: "turn_right()",      type: "function", detail: "Turn 90° clockwise" },
    { label: "turn_left",       apply: "turn_left()",       type: "function", detail: "Turn 90° counter-clockwise" },
    { label: "forward",         apply: "forward()",         type: "function", detail: "Move one step forward" },
    { label: "for",   type: "keyword",  detail: "Repeat a block n times" },
    { label: "range", apply: "range()", type: "function", detail: "Generate a number sequence" },
    { label: "in",    type: "keyword",  detail: "Used in for loops" },
    { label: "if",    type: "keyword",  detail: "Run block if condition is true" },
    { label: "elif",  type: "keyword",  detail: "Else-if condition" },
    { label: "else",  type: "keyword",  detail: "Fallback block" },
    { label: "has_path_ahead",  apply: "has_path_ahead()",  type: "function", detail: "True if path ahead is clear" },
    { label: "has_path_left",   apply: "has_path_left()",   type: "function", detail: "True if path left is clear" },
    { label: "has_path_right",  apply: "has_path_right()",  type: "function", detail: "True if path right is clear" },
  ],
  // Level 3 — While Loops (cumulative)
  [
    { label: "move_forward",    apply: "move_forward()",    type: "function", detail: "Move one step forward" },
    { label: "turn_right",      apply: "turn_right()",      type: "function", detail: "Turn 90° clockwise" },
    { label: "turn_left",       apply: "turn_left()",       type: "function", detail: "Turn 90° counter-clockwise" },
    { label: "forward",         apply: "forward()",         type: "function", detail: "Move one step forward" },
    { label: "for",   type: "keyword",  detail: "Repeat a block n times" },
    { label: "range", apply: "range()", type: "function", detail: "Generate a number sequence" },
    { label: "in",    type: "keyword",  detail: "Used in for loops" },
    { label: "if",    type: "keyword",  detail: "Run block if condition is true" },
    { label: "elif",  type: "keyword",  detail: "Else-if condition" },
    { label: "else",  type: "keyword",  detail: "Fallback block" },
    { label: "while", type: "keyword",  detail: "Repeat while condition is true" },
    { label: "not",   type: "keyword",  detail: "Logical NOT" },
    { label: "has_path_ahead",    apply: "has_path_ahead()",    type: "function", detail: "True if path ahead is clear" },
    { label: "has_path_left",     apply: "has_path_left()",     type: "function", detail: "True if path left is clear" },
    { label: "has_path_right",    apply: "has_path_right()",    type: "function", detail: "True if path right is clear" },
    { label: "has_path_forward",  apply: "has_path_forward()",  type: "function", detail: "True if path forward is clear" },
    { label: "at_goal",           apply: "at_goal()",           type: "function", detail: "True if at the goal" },
  ],
  // Level 4 — elif and else (same as level 3, elif/else already included)
  [
    { label: "move_forward",    apply: "move_forward()",    type: "function", detail: "Move one step forward" },
    { label: "turn_right",      apply: "turn_right()",      type: "function", detail: "Turn 90° clockwise" },
    { label: "turn_left",       apply: "turn_left()",       type: "function", detail: "Turn 90° counter-clockwise" },
    { label: "forward",         apply: "forward()",         type: "function", detail: "Move one step forward" },
    { label: "for",   type: "keyword",  detail: "Repeat a block n times" },
    { label: "range", apply: "range()", type: "function", detail: "Generate a number sequence" },
    { label: "in",    type: "keyword",  detail: "Used in for loops" },
    { label: "if",    type: "keyword",  detail: "Run block if condition is true" },
    { label: "elif",  type: "keyword",  detail: "Else-if condition" },
    { label: "else",  type: "keyword",  detail: "Fallback block" },
    { label: "while", type: "keyword",  detail: "Repeat while condition is true" },
    { label: "not",   type: "keyword",  detail: "Logical NOT" },
    { label: "has_path_ahead",    apply: "has_path_ahead()",    type: "function", detail: "True if path ahead is clear" },
    { label: "has_path_left",     apply: "has_path_left()",     type: "function", detail: "True if path left is clear" },
    { label: "has_path_right",    apply: "has_path_right()",    type: "function", detail: "True if path right is clear" },
    { label: "has_path_forward",  apply: "has_path_forward()",  type: "function", detail: "True if path forward is clear" },
    { label: "at_goal",           apply: "at_goal()",           type: "function", detail: "True if at the goal" },
  ],
];

function makePythonCompleter(liRef: React.MutableRefObject<number>) {
  return function(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/\w+/);
    if (!word || word.from === word.to) return null;
    const cmds = LEVEL_CMDS[liRef.current] ?? LEVEL_CMDS[0];
    const options = cmds.filter(c => c.label.startsWith(word.text));
    if (!options.length) return null;
    return { from: word.from, options };
  };
}

// ─── Challenge screen ─────────────────────────────────────────────────────────

function ChallengeView({
  li, ci, progress,
  onSolve, onNext, onFinish, onBack, onJump,
}: {
  li: number; ci: number; progress: Progress;
  onSolve: (code: string) => void;
  onNext: (code: string) => void; onFinish: (code: string) => void;
  onBack: () => void; onJump: (ci: number, code: string) => void;
}) {
  const lv = LEVELS[li];
  const ch = lv.challenges[ci];
  const isLast = ci === lv.challenges.length - 1;

  const [leftTab, setLeftTab] = useState<"code"|"lesson">("code");
  const [animating, setAnimating] = useState(false);
  const [output, setOutput] = useState<{text:string;type:"info"|"error"|"success"}[]>([]);
  const [solved, setSolved] = useState(false);
  const [px, setPx] = useState(ch.startX);
  const [py, setPy] = useState(ch.startY);
  const [pdir, setPdir] = useState<Dir>(ch.startDir);

  const [robotFlash, setRobotFlash] = useState(false);

  const editorRef  = useRef<HTMLDivElement>(null);
  const viewRef    = useRef<EditorView|null>(null);
  const codeRef    = useRef(ch.starterCode);
  const flashIvRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liRef      = useRef(li);
  useEffect(() => { liRef.current = li; }, [li]);

  const stopFlash = () => {
    if (flashIvRef.current) { clearInterval(flashIvRef.current); flashIvRef.current = null; }
    setRobotFlash(false);
  };

  // Reinit when challenge changes — restore saved code if available
  useEffect(() => {
    stopFlash();
    setPx(ch.startX); setPy(ch.startY); setPdir(ch.startDir);
    setSolved(false); setOutput([]); setAnimating(false);
    const code = progress.savedCode?.[chalKey(li, ci)] ?? ch.starterCode;
    codeRef.current = code;
    if (viewRef.current) {
      viewRef.current.dispatch({ changes:{ from:0, to:viewRef.current.state.doc.length, insert:code }});
    }
  }, [li, ci]);

  // Init CodeMirror once
  useEffect(() => {
    if (!editorRef.current || viewRef.current) return;

    // Custom Enter: always continue at the current line's indent level,
    // adding 4 extra spaces if the line ends with ':'
    const pythonEnter = (): boolean => {
      const view = viewRef.current;
      if (!view) return false;
      const { state } = view;
      const sel = state.selection.main;
      const line = state.doc.lineAt(sel.from);
      const text = line.text;
      const indent = text.match(/^(\s*)/)?.[1] ?? "";
      const trimmed = text.trimEnd();
      const extra = trimmed.endsWith(":") ? "    " : "";
      const insert = "\n" + indent + extra;
      view.dispatch(state.update({
        changes: { from: sel.from, to: sel.to, insert },
        selection: { anchor: sel.from + insert.length },
        scrollIntoView: true,
        userEvent: "input",
      }));
      return true;
    };

    viewRef.current = new EditorView({
      state: EditorState.create({
        doc: ch.starterCode,
        extensions: [
          basicSetup, pythonLanguage,
          pythonLanguage.data.of({ autocomplete: makePythonCompleter(liRef) }),
          oneDark,
          indentUnit.of("    "),
          keymap.of([{ key: "Enter", run: pythonEnter }]),
          EditorView.updateListener.of(u => { if (u.docChanged) codeRef.current = u.state.doc.toString(); }),
          EditorView.theme({ "&":{ height:"100%", fontSize:"13px" }, ".cm-scroller":{ fontFamily:"'JetBrains Mono','Fira Code',monospace" } }),
        ],
      }),
      parent: editorRef.current,
    });
  }, []);

  const handleRun = useCallback(() => {
    if (animating) return;
    stopFlash();
    setOutput([]); setSolved(false);
    setPx(ch.startX); setPy(ch.startY); setPdir(ch.startDir);
    const { moves, error, solved: didSolve } = runMaze(ch, codeRef.current);
    // Syntax/indent errors have no moves — show immediately
    if (error && !moves.length) { setOutput([{text:error,type:"error"}]); return; }
    if (!moves.length) { setOutput([{text:"No moves yet — add some commands!",type:"info"}]); return; }
    setAnimating(true);
    let step=0;
    const iv = setInterval(() => {
      if (step >= moves.length) {
        clearInterval(iv); setAnimating(false);
        if (didSolve) {
          setSolved(true);
          onSolve(codeRef.current); // save immediately — don't wait for Next button
          setOutput([{text:"Challenge complete! 🎉",type:"success"}]);
        } else if (error) {
          // Animate the crash: flash robot red
          setOutput([{text:error,type:"error"}]);
          flashIvRef.current = setInterval(() => setRobotFlash(f => !f), 220);
        } else {
          setOutput([{text:`${moves.length} move${moves.length!==1?"s":""} — exit not reached. Try again!`,type:"info"}]);
        }
        return;
      }
      const m = moves[step]; setPx(m.x); setPy(m.y); setPdir(m.dir as Dir); step++;
    }, 120);
  }, [ch, animating]);

  const handleReset = useCallback(() => {
    stopFlash();
    setPx(ch.startX); setPy(ch.startY); setPdir(ch.startDir);
    setSolved(false); setOutput([]);
  }, [ch]);

  const TAB = (active: boolean): React.CSSProperties => ({
    padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",border:"none",
    borderBottom:active?"3px solid #3b82f6":"3px solid transparent",
    background:"transparent",color:active?"#3b82f6":"#64748b",transition:"color 120ms",
  });

  return (
    <SiteChrome>
      <div style={{maxWidth:1400,margin:"0 auto",padding:"20px 28px 32px"}}>
        {/* Breadcrumb */}
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
          <button onClick={onBack} style={{background:"transparent",border:"none",color:"#94a3b8",fontSize:13,fontWeight:600,cursor:"pointer",padding:0}}>← Levels</button>
          <span style={{color:"rgba(255,255,255,0.2)"}}>|</span>
          <span style={{fontSize:13,fontWeight:700,color:lv.color}}>Level {lv.id} — {lv.title}</span>
          <span style={{fontSize:13,color:"#64748b"}}>Challenge {ci+1} of {lv.challenges.length}</span>
        </div>

        {/* Level tabs — click any to jump to that challenge */}
        <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
          {lv.challenges.map((_,idx) => {
            const done = progress.completedChallenges[chalKey(li,idx)];
            const active = idx === ci;
            return (
              <div key={idx} onClick={() => onJump(idx, codeRef.current)}
                style={{padding:"5px 12px",borderRadius:16,fontSize:12,fontWeight:700,cursor:"pointer",
                  background:active?lv.color:done?"rgba(74,222,128,0.15)":"rgba(255,255,255,0.07)",
                  color:active?"#fff":done?"#4ade80":"#64748b",
                  border:`2px solid ${active?lv.color:done?"#4ade80":"rgba(255,255,255,0.18)"}`,
                  opacity: active ? 1 : 0.85,
                }}>
                {done?"✓ ":""}{idx+1}
              </div>
            );
          })}
        </div>

        {/* Two panels */}
        <div style={{display:"flex",gap:18,alignItems:"flex-start",flexWrap:"wrap"}}>
          {/* Left: editor + lesson */}
          <div style={{...CARD,flex:"0 0 460px",minWidth:300,display:"flex",flexDirection:"column",height:580,overflow:"hidden"}}>
            <div style={{display:"flex",borderBottom:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",flexShrink:0}}>
              <button style={TAB(leftTab==="code")}    onClick={()=>setLeftTab("code")}>Code</button>
              <button style={TAB(leftTab==="lesson")}  onClick={()=>setLeftTab("lesson")}>Lesson / Notes</button>
            </div>
            {/* Keep BOTH panels in the DOM — only toggle visibility.
                Unmounting the editor div destroys the CodeMirror instance. */}
            <div style={{flex:1,overflow:"hidden",flexDirection:"column",display:leftTab==="code"?"flex":"none"}}>
              <div ref={editorRef} style={{flex:1,overflow:"hidden"}}/>
              <div style={{padding:"10px 12px",borderTop:"1px solid rgba(255,255,255,0.08)",display:"flex",gap:8,background:"rgba(255,255,255,0.04)",flexShrink:0}}>
                <button onClick={handleRun} disabled={animating} style={{padding:"8px 22px",borderRadius:10,fontWeight:800,fontSize:14,background:animating?"#94a3b8":"#3b82f6",color:"#fff",border:"none",cursor:animating?"not-allowed":"pointer"}}>
                  {animating?"Running…":"▶  Run"}
                </button>
                <button onClick={handleReset} disabled={animating} style={{padding:"8px 14px",borderRadius:10,fontWeight:700,fontSize:14,background:"rgba(255,255,255,0.08)",color:"#94a3b8",border:"1px solid rgba(255,255,255,0.15)",cursor:"pointer"}}>
                  Reset
                </button>
                {solved && (
                  <button onClick={() => isLast ? onFinish(codeRef.current) : onNext(codeRef.current)} style={{marginLeft:"auto",padding:"8px 18px",borderRadius:10,fontWeight:800,fontSize:14,background:lv.color,color:"#fff",border:"none",cursor:"pointer"}}>
                    {isLast?"Go to Quiz →":"Next Challenge →"}
                  </button>
                )}
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",display:leftTab==="lesson"?"block":"none"}}>
              <LessonPanel text={lv.introNotes}/>
            </div>
          </div>

          {/* Right: level info + maze + output */}
          <div style={{flex:1,minWidth:300,display:"flex",flexDirection:"column",gap:14}}>
            <div style={{...CARD,padding:"14px 18px"}}>
              <div style={{fontSize:17,fontWeight:900,color:"#e2e8f0"}}>{ch.title}</div>
              <div style={{fontSize:13,color:"#94a3b8",marginTop:3}}>💡 {ch.hint}</div>
            </div>
            <div style={{...CARD,padding:"10px 14px",display:"flex",justifyContent:"center",overflowX:"auto"}}>
              <MazeCanvas ch={ch} px={px} py={py} pdir={pdir} solved={solved} robotFlash={robotFlash}/>
            </div>
            <div style={{...CARD,padding:"12px 16px",minHeight:64}}>
              <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.7px",color:"#64748b",marginBottom:6}}>Output</div>
              {!output.length
                ? <div style={{fontSize:13,color:"#4a5568"}}>Press Run to execute your code.</div>
                : output.map((o,idx)=>(
                  <div key={idx} style={{fontSize:14,fontWeight:600,padding:"6px 10px",borderRadius:8,background:o.type==="error"?"rgba(239,68,68,0.15)":o.type==="success"?"rgba(74,222,128,0.15)":"rgba(56,189,248,0.1)",color:o.type==="error"?"#fca5a5":o.type==="success"?"#4ade80":"#7dd3fc"}}>
                    {o.text}
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Quiz screen ──────────────────────────────────────────────────────────────

function QuizView({ li, onComplete }: { li: number; onComplete: (score: number, total: number) => void }) {
  const lv = LEVELS[li];
  const qs = lv.quiz;
  const [qi, setQi] = useState(0);
  const [selected, setSelected] = useState<number|null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);

  const q = qs[qi];
  const correct = selected === q.answer;

  function submit() {
    if (selected===null) return;
    setSubmitted(true);
    if (correct) setScore(s=>s+1);
  }

  function next() {
    if (qi < qs.length-1) { setQi(qi+1); setSelected(null); setSubmitted(false); }
    else onComplete(score, qs.length); // score already updated by submit()
  }

  return (
    <SiteChrome>
      <div style={{maxWidth:680,margin:"0 auto",padding:"40px 32px"}}>
        <div style={{...CARD,padding:0,overflow:"hidden"}}>
          <div style={{background:lv.color,padding:"18px 26px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.7px"}}>Level {lv.id} Quiz</div>
              <div style={{fontSize:18,fontWeight:900,color:"#fff",marginTop:2}}>{lv.title}</div>
            </div>
            <div style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.85)"}}>Question {qi+1} of {qs.length}</div>
          </div>
          {/* Progress bar */}
          <div style={{height:4,background:"rgba(0,0,0,0.1)"}}>
            <div style={{height:"100%",background:lv.color,width:`${(qi/qs.length)*100}%`,transition:"width 300ms"}}/>
          </div>
          <div style={{padding:"28px 30px"}}>
            {(() => {
              const parts = q.question.split("\n\n");
              return (
                <div style={{marginBottom:20}}>
                  <p style={{fontSize:16,fontWeight:700,color:"#e2e8f0",margin:"0 0 12px",lineHeight:1.5}}>{parts[0]}</p>
                  {parts.slice(1).map((block, bi) => (
                    <pre key={bi} style={{fontFamily:"'Courier New', monospace",fontSize:14,fontWeight:700,
                      background:"#0f172a",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,
                      padding:"12px 16px",margin:0,whiteSpace:"pre",overflowX:"auto",color:"#e2e8f0",lineHeight:1.7}}>
                      {block}
                    </pre>
                  ))}
                </div>
              );
            })()}
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {q.options.map((opt,idx)=>{
                let bg="rgba(255,255,255,0.05)", border="2px solid rgba(255,255,255,0.15)", color="#e2e8f0";
                if (submitted) {
                  if (idx===q.answer) { bg="rgba(74,222,128,0.15)"; border="2px solid #22c55e"; color="#4ade80"; }
                  else if (idx===selected) { bg="rgba(239,68,68,0.15)"; border="2px solid #dc2626"; color="#fca5a5"; }
                } else if (idx===selected) { bg="rgba(99,179,237,0.12)"; border=`2px solid ${lv.color}`; color="#e2e8f0"; }
                return (
                  <button key={idx} disabled={submitted} onClick={()=>setSelected(idx)}
                    style={{textAlign:"left",padding:"12px 16px",borderRadius:10,background:bg,border,color,fontWeight:600,fontSize:14,cursor:submitted?"default":"pointer",transition:"all 120ms"}}>
                    {String.fromCharCode(65+idx)}. {opt}
                  </button>
                );
              })}
            </div>
            {submitted && (
              <div style={{marginTop:16,padding:"12px 16px",borderRadius:10,background:correct?"#f0fdf4":"#fef9c3",border:`1px solid ${correct?"#bbf7d0":"#fde68a"}`,fontSize:13,color:"#333",lineHeight:1.6}}>
                <strong>{correct?"✓ Correct!":"✗ Not quite."}</strong> {q.explanation}
              </div>
            )}
            <div style={{marginTop:20,display:"flex",justifyContent:"flex-end",gap:10}}>
              {!submitted
                ? <button onClick={submit} disabled={selected===null} style={{padding:"10px 28px",borderRadius:10,background:selected!==null?lv.color:"#ccc",color:"#fff",border:"none",fontWeight:800,fontSize:14,cursor:selected!==null?"pointer":"not-allowed"}}>
                    Submit Answer
                  </button>
                : <button onClick={next} style={{padding:"10px 28px",borderRadius:10,background:lv.color,color:"#fff",border:"none",fontWeight:800,fontSize:14,cursor:"pointer"}}>
                    {qi<qs.length-1?"Next Question →":"See Results →"}
                  </button>
              }
            </div>
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Level complete screen ────────────────────────────────────────────────────

function LevelComplete({ li, score, total, onContinue }: { li: number; score: number; total: number; onContinue: () => void }) {
  const lv = LEVELS[li];
  const pct = Math.round(score/total*100);
  const hasNext = li < LEVELS.length-1;
  return (
    <SiteChrome>
      <div style={{maxWidth:560,margin:"0 auto",padding:"60px 32px",textAlign:"center"}}>
        <div style={{...CARD,padding:"40px 36px"}}>
          <div style={{fontSize:56,marginBottom:12}}>{pct>=80?"🏆":pct>=60?"🎉":"📚"}</div>
          <div style={{fontSize:11,fontWeight:700,color:lv.color,textTransform:"uppercase",letterSpacing:"0.7px"}}>Level {lv.id} Complete</div>
          <h2 style={{fontSize:28,fontWeight:900,color:"#111",margin:"8px 0 4px"}}>{lv.title}</h2>
          <div style={{fontSize:15,color:"#666",marginBottom:28}}>Quiz Score</div>
          <div style={{fontSize:64,fontWeight:900,color:lv.color,lineHeight:1}}>{score}<span style={{fontSize:32,color:"#aaa"}}>/{total}</span></div>
          <div style={{fontSize:16,color:"#555",marginTop:8,marginBottom:28}}>
            {pct>=80?"Excellent work!":pct>=60?"Good job — keep practicing!":"Review the lesson notes and try again."}
          </div>
          {hasNext && (
            <div style={{background:"#f0fdf4",border:"2px solid #bbf7d0",borderRadius:12,padding:"12px 18px",marginBottom:20,fontSize:14,color:"#16a34a",fontWeight:600}}>
              🔓 Level {li+2} — {LEVELS[li+1].title} is now unlocked!
            </div>
          )}
          <button onClick={onContinue} style={{padding:"14px 32px",borderRadius:12,background:lv.color,color:"#fff",border:"none",fontWeight:800,fontSize:16,cursor:"pointer",width:"100%"}}>
            {hasNext?"Start Next Level →":"Back to Levels"}
          </button>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PythonMazePage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [phase, setPhase] = useState<Phase>({ tag:"overview" });
  const [progress, setProgress] = useState<Progress>({ completedChallenges:{}, completedLevels:{}, savedCode:{} });
  const [isTeacher, setIsTeacher] = useState(false);

  // progressRef always holds the latest value — avoids stale-closure bugs
  // when multiple callbacks (onSolve, onJump) fire in quick succession.
  const progressRef = useRef<Progress>({ completedChallenges:{}, completedLevels:{}, savedCode:{} });

  // Load progress — cloud if logged in, localStorage otherwise.
  // On cloud load we MERGE with localStorage so a failed sync never erases local data.
  useEffect(() => {
    if (status === "loading") return;
    if (userId) {
      getProfile(userId).then(p => { if (p?.role === "teacher") setIsTeacher(true); });
      loadProgressFromCloud(userId).then(cloudP => {
        const localP = loadProgress();
        const merged: Progress = {
          completedChallenges: { ...cloudP.completedChallenges, ...localP.completedChallenges },
          completedLevels:     { ...cloudP.completedLevels,     ...localP.completedLevels },
          savedCode:           { ...cloudP.savedCode,           ...localP.savedCode },
        };
        progressRef.current = merged;
        setProgress(merged);
        saveProgress(merged);
      });
    } else {
      const p = loadProgress();
      progressRef.current = p;
      setProgress(p);
    }
  }, [status !== "loading", userId]);

  function updateProgress(p: Progress) {
    progressRef.current = p;
    setProgress(p);
    saveProgress(p);
  }

  function markChallengeComplete(li: number, ci: number, code: string) {
    const key = chalKey(li, ci);
    // Use progressRef.current — always the latest value, never stale
    const p = {
      ...progressRef.current,
      completedChallenges: { ...progressRef.current.completedChallenges, [key]: true },
      savedCode: { ...progressRef.current.savedCode, [key]: code },
    };
    const allDone = LEVELS[li].challenges.every((_,idx) => p.completedChallenges[chalKey(li,idx)]);
    if (allDone) p.completedLevels = { ...p.completedLevels, [li]: true };
    updateProgress(p);
    if (userId) {
      syncProgressToCloud(userId, li, ci, true, code);
      if (allDone) syncProgressToCloud(userId, li, null, true);
    }
  }

  function saveCodeOnly(li: number, ci: number, code: string) {
    // Use progressRef.current so we never clobber a completion that just fired
    const p = { ...progressRef.current, savedCode: { ...progressRef.current.savedCode, [chalKey(li,ci)]: code } };
    updateProgress(p);
    if (userId) syncCodeToCloud(userId, li, ci, code);
  }

  // Route to challenge
  if (phase.tag === "overview") {
    return <Overview progress={progress} isTeacher={isTeacher} onSelect={li => setPhase({tag:"intro",li})}/>;
  }
  if (phase.tag === "intro") {
    return <LevelIntro li={phase.li} onStart={() => {
      // Resume from first incomplete challenge instead of always challenge 0
      const li = phase.li;
      const firstIncomplete = LEVELS[li].challenges.findIndex(
        (_, idx) => !progress.completedChallenges[chalKey(li, idx)]
      );
      setPhase({tag:"challenge", li, ci: firstIncomplete >= 0 ? firstIncomplete : 0});
    }}/>;
  }
  if (phase.tag === "challenge") {
    const { li, ci } = phase;
    return (
      <ChallengeView
        li={li} ci={ci} progress={progress}
        onSolve={(code) => markChallengeComplete(li, ci, code)}
        onNext={(code) => {
          markChallengeComplete(li, ci, code);
          setPhase({tag:"challenge",li,ci:ci+1});
        }}
        onFinish={(code) => {
          markChallengeComplete(li, ci, code);
          setPhase({tag:"quiz",li});
        }}
        onBack={() => setPhase({tag:"overview"})}
        onJump={(newCi, code) => {
          saveCodeOnly(li, ci, code);
          setPhase({tag:"challenge",li,ci:newCi});
        }}
      />
    );
  }
  if (phase.tag === "quiz") {
    return (
      <QuizView li={phase.li} onComplete={(score,total) => {
        if (userId) syncProgressToCloud(userId, phase.li, null, true, undefined, score);
        setPhase({tag:"complete",li:phase.li,score,total});
      }}/>
    );
  }
  if (phase.tag === "complete") {
    const { li, score, total } = phase;
    return (
      <LevelComplete li={li} score={score} total={total}
        onContinue={() => {
          const nextLi = li+1 < LEVELS.length ? li+1 : li;
          if (li+1 < LEVELS.length) setPhase({tag:"intro",li:nextLi});
          else setPhase({tag:"overview"});
        }}
      />
    );
  }
  return null;
}
