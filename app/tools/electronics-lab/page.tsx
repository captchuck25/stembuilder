'use client';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '@/app/components/SiteHeader';

import { COMING_SOON, ElecChallenge, ElecUnit, UNITS, chalKey, countCompleted } from './units';
import { Part, PartKind, Pt, SolveResult } from './engine/types';
import { solveCircuit, isSeries, clipWireAtSwitches, evaluateFreeBuild } from './engine/solver';
import CircuitBoard, { BoardTool } from './components/CircuitBoard';

// ─── Progress ─────────────────────────────────────────────────────────────────

/** One saved piece of a student build. kind is absent for plain wires
 *  (backwards-compatible with earlier saves, which were wires only). */
interface SavedWire { kind?: PartKind; a: Pt; b: Pt }
interface Progress {
  completedChallenges: Record<string, boolean>;
  completedUnits: Record<number, boolean>;
  savedWires: Record<string, SavedWire[]>;
  /** Best star rating (1-3) per challenge key */
  stars: Record<string, number>;
}
function emptyProgress(): Progress {
  return { completedChallenges: {}, completedUnits: {}, savedWires: {}, stars: {} };
}
const STORAGE_KEY = 'electronics_lab_progress';
function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyProgress(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyProgress();
}
function saveProgress(p: Progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
// Same convention as Block Lab: challenge rows (challenge_idx >= 0) store the
// star rating in quiz_score; unit rows (challenge_idx = -1) store the quiz score.
async function syncToCloud(ui: number, ci: number | null, completed: boolean, savedWires?: SavedWire[], score?: number) {
  await fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'electronics-lab', level_idx: ui, challenge_idx: ci ?? -1,
      completed, saved_code: savedWires ? JSON.stringify(savedWires) : null,
      quiz_score: score ?? null,
    }),
  });
}
async function loadFromCloud(): Promise<Progress> {
  const res = await fetch('/api/progress?tool=electronics-lab');
  const data = res.ok ? await res.json() : [];
  const p = emptyProgress();
  for (const row of data ?? []) {
    if (row.challenge_idx !== null && row.challenge_idx >= 0) {
      const key = chalKey(row.level_idx, row.challenge_idx);
      if (row.completed) p.completedChallenges[key] = true;
      if (row.saved_code?.startsWith('[')) {
        try { p.savedWires[key] = JSON.parse(row.saved_code); } catch { /* ignore */ }
      }
      if (typeof row.quiz_score === 'number' && row.quiz_score > 0) p.stars[key] = Math.min(3, row.quiz_score);
    } else if (row.completed) {
      p.completedUnits[row.level_idx] = true;
    }
  }
  return p;
}

// ─── Phase ────────────────────────────────────────────────────────────────────

type Phase =
  | { tag: 'overview' }
  | { tag: 'intro'; ui: number }
  | { tag: 'challenge'; ui: number; ci: number }
  | { tag: 'quiz'; ui: number }
  | { tag: 'complete'; ui: number; score: number; total: number };

// ─── Shared chrome (light theme — white cards over the tools pattern) ─────────

function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundImage: "url('/ui/bg-tools-pattern.png')", backgroundRepeat: 'repeat', backgroundSize: 'auto' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.97)', border: '3px solid #1f1f1f',
  borderRadius: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
};

const BTN = (color: string): React.CSSProperties => ({
  padding: '12px 28px', background: color, color: '#fff', border: 'none',
  borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer',
});

// ─── Lesson notes renderer (light-theme twin of Block Lab's LessonPanel) ──────

function LessonPanel({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let k = 0;
  let tableRows: React.ReactNode[] = [];
  const flushTable = () => {
    if (!tableRows.length) return;
    const head = tableRows.filter(r => (r as React.ReactElement).type === 'thead');
    const body = tableRows.filter(r => (r as React.ReactElement).type !== 'thead');
    nodes.push(<table key={`t${k++}`} style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>{head}<tbody>{body}</tbody></table>);
    tableRows = [];
  };
  for (const raw of lines) {
    if (raw.startsWith('# ')) { flushTable(); nodes.push(<h2 key={k++} style={{ fontSize: 20, fontWeight: 900, color: '#1f2937', margin: '18px 0 6px' }}>{raw.slice(2)}</h2>); continue; }
    if (raw.startsWith('## ')) { flushTable(); nodes.push(<h3 key={k++} style={{ fontSize: 16, fontWeight: 800, color: '#1f2937', margin: '14px 0 4px' }}>{raw.slice(3)}</h3>); continue; }
    if (raw.startsWith('> ')) { flushTable(); nodes.push(<blockquote key={k++} style={{ borderLeft: '4px solid #f59e0b', paddingLeft: 12, margin: '8px 0', color: '#64748b', fontStyle: 'italic', fontSize: 13 }}>{raw.slice(2)}</blockquote>); continue; }
    if (raw.startsWith('|')) {
      const cells = raw.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) { tableRows.push(<thead key={k++} />); continue; }
      const isHead = tableRows.length === 1 && (tableRows[0] as React.ReactElement).type === 'thead';
      const renderCell = (c: string, j: number, th: boolean) => {
        const parts = c.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={i} style={{ color: '#1f2937' }}>{p.slice(2, -2)}</strong> : p);
        return th
          ? <th key={j} style={{ textAlign: 'left', padding: '6px 10px', background: '#fef3c7', borderBottom: '2px solid #f59e0b', fontSize: 13, color: '#1f2937' }}>{parts}</th>
          : <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: '#374151' }}>{parts}</td>;
      };
      if (isHead) tableRows[0] = <thead key={k++}><tr>{cells.map((c, j) => renderCell(c, j, true))}</tr></thead>;
      else tableRows.push(<tr key={k++}>{cells.map((c, j) => renderCell(c, j, false))}</tr>);
      continue;
    }
    flushTable();
    if (raw === '') { nodes.push(<div key={k++} style={{ height: 8 }} />); continue; }
    const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={j} style={{ color: '#1f2937' }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`')) return <code key={j} style={{ background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{p.slice(1, -1)}</code>;
      return p;
    });
    nodes.push(<p key={k++} style={{ margin: '4px 0', fontSize: 13.5, color: '#374151', lineHeight: 1.65 }}>{parts}</p>);
  }
  flushTable();
  return <div style={{ padding: '16px 20px' }}>{nodes}</div>;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ progress, onSelect, assignedUnits, lockedLevels }: {
  progress: Progress;
  onSelect: (ui: number) => void;
  assignedUnits: number[] | null;
  lockedLevels: Set<number>;
}) {
  const assignedSet = assignedUnits ? new Set(assignedUnits) : null;
  return (
    <SiteChrome>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ ...CARD, padding: '18px 24px', marginBottom: 28 }}>
          <Link href="/" style={{ color: '#64748b', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← STEM Builder Home</Link>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#1f2937', margin: '8px 0 4px' }}>⚡ Electronics Lab</h1>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#64748b', margin: 0 }}>
            Learn how electricity really works by building circuits — then try each one for real. Complete a unit to unlock the next.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {UNITS.map((unit, ui) => {
            const done = countCompleted(ui, progress.completedChallenges);
            const total = unit.challenges.length;
            const starSum = unit.challenges.reduce((s, _, ci) => s + (progress.stars[chalKey(ui, ci)] ?? 0), 0);
            const teacherLocked = lockedLevels.has(ui) || (assignedSet !== null && !assignedSet.has(ui));
            const locked = teacherLocked || (ui > 0 && !progress.completedUnits[ui - 1]);
            const pct = total ? Math.round(done / total * 100) : 0;
            return (
              <div key={unit.id}
                onClick={() => !locked && onSelect(ui)}
                style={{ ...CARD, width: 248, padding: 24, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.55 : 1, position: 'relative', overflow: 'hidden', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
                onMouseEnter={e => { if (!locked) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.25)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = (CARD as { boxShadow: string }).boxShadow; }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: unit.color }} />
                {locked && <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 18 }}>🔒</div>}
                {progress.completedUnits[ui] && <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 18 }}>✅</div>}
                <div style={{ fontSize: 26, marginTop: 8 }}>{unit.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 4 }}>Unit {unit.id}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#1f2937', margin: '4px 0 6px' }}>{unit.title}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 14 }}>{unit.tagline}</div>
                <div style={{ background: '#e5e7eb', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: unit.color, borderRadius: 20, transition: 'width 400ms ease' }} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 5 }}>
                  {done} / {total} challenges
                  {starSum > 0 && <span style={{ color: '#d97706', fontWeight: 700 }}> · ⭐ {starSum}/{total * 3}</span>}
                </div>
              </div>
            );
          })}
          {COMING_SOON.map(u => (
            <div key={u.id} style={{ ...CARD, width: 248, padding: 24, opacity: 0.5, position: 'relative', overflow: 'hidden', borderStyle: 'dashed' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: '#cbd5e1' }} />
              <div style={{ fontSize: 26, marginTop: 8, filter: 'grayscale(1)' }}>{u.emoji}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 4 }}>Unit {u.id}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#64748b', margin: '4px 0 6px' }}>{u.title}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{u.tagline}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Coming soon</div>
            </div>
          ))}
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Unit intro ───────────────────────────────────────────────────────────────

function UnitIntro({ ui, onStart, onBack }: { ui: number; onStart: () => void; onBack: () => void }) {
  const unit = UNITS[ui];
  return (
    <SiteChrome>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          ← Back to Units
        </button>
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: unit.color, padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unit {unit.id}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginTop: 2 }}>{unit.title}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>{unit.tagline}</div>
            </div>
            <div style={{ fontSize: 56, filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' }}>{unit.emoji}</div>
          </div>
          <div style={{ padding: '0 28px 28px' }}>
            <div style={{ marginTop: 20, background: `${unit.color}12`, border: `1px solid ${unit.color}55`, borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 4 }}>Mission Briefing</div>
              <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.65, fontStyle: 'italic' }}>{unit.story}</div>
            </div>
            <div style={{ marginTop: 16, background: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: 14, padding: '14px 18px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
                📖 Words to Know — these will be on the quiz!
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '6px 18px' }}>
                {unit.vocab.map(v => (
                  <div key={v.term} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: unit.color }}>{v.term}</span>
                    <span style={{ color: '#94a3b8' }}> — </span>
                    {v.def}
                  </div>
                ))}
              </div>
            </div>
            <LessonPanel text={unit.introNotes} />
            <button onClick={onStart} style={{ ...BTN(unit.color), display: 'block', width: '100%', marginTop: 12 }}>
              Begin Unit {unit.id} — Challenge 1 →
            </button>
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Challenge chrome (breadcrumb + dots + hint header, shared by all modes) ──

function ChallengeShell({ unit, ui, ci, progress, lockedCis, banner, onBack, onJump, children }: {
  unit: ElecUnit; ui: number; ci: number; progress: Progress; lockedCis: Set<number>;
  banner?: React.ReactNode;
  onBack: () => void; onJump: (ci: number) => void;
  children: React.ReactNode;
}) {
  const ch = unit.challenges[ci];
  const bestStars = progress.stars[chalKey(ui, ci)] ?? 0;
  return (
    <SiteChrome>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Units</button>
          <span style={{ color: 'rgba(0,0,0,0.2)' }}>|</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: unit.color }}>{unit.emoji} Unit {unit.id} — {unit.title}</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>Challenge {ci + 1} of {unit.challenges.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {unit.challenges.map((_, idx) => {
            const done = progress.completedChallenges[chalKey(ui, idx)];
            const active = idx === ci;
            const dotLocked = lockedCis.has(-1) || lockedCis.has(idx);
            return (
              <div key={idx}
                onClick={() => !dotLocked && onJump(idx)}
                title={dotLocked ? 'Locked by teacher' : undefined}
                style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700,
                  cursor: dotLocked ? 'not-allowed' : 'pointer',
                  background: dotLocked ? '#f1f5f9' : active ? unit.color : done ? '#dcfce7' : '#fff',
                  color: dotLocked ? '#94a3b8' : active ? '#fff' : done ? '#16a34a' : '#64748b',
                  border: `2px solid ${dotLocked ? '#e2e8f0' : active ? unit.color : done ? '#4ade80' : '#cbd5e1'}` }}>
                {dotLocked ? '🔒' : done ? '✓ ' : ''}{dotLocked ? '' : idx + 1}
              </div>
            );
          })}
        </div>
        <div style={{ ...CARD, padding: '14px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Challenge {ci + 1}</div>
            {ch.mode === 'build' && ch.par > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: '2px 10px' }}>
                Par: {ch.par} wires
              </span>
            )}
            {bestStars > 0 && (
              <span style={{ fontSize: 13, letterSpacing: 1 }}>
                {'⭐'.repeat(bestStars)}<span style={{ filter: 'grayscale(1) opacity(0.35)' }}>{'⭐'.repeat(3 - bestStars)}</span>
              </span>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#1f2937', margin: '2px 0 4px' }}>{ch.title}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>💡 {ch.hint}</div>
        </div>
        {banner}
        {children}
      </div>
    </SiteChrome>
  );
}

function SuccessBanner({ ch, isLast, stars, color, onNext, onFinish }: {
  ch: ElecChallenge; isLast: boolean; stars: number; color: string;
  onNext: () => void; onFinish: () => void;
}) {
  return (
    <div style={{ ...CARD, padding: '16px 20px', marginBottom: 14, background: '#f0fdf4', border: '3px solid #4ade80', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 28 }}>🎉</span>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontWeight: 800, color: '#16a34a', fontSize: 15 }}>
          Challenge complete!{' '}
          <span style={{ fontSize: 13, letterSpacing: 1 }}>
            {'⭐'.repeat(stars)}<span style={{ filter: 'grayscale(1) opacity(0.35)' }}>{'⭐'.repeat(3 - stars)}</span>
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#374151', marginTop: 2 }}>{ch.successNote}</div>
      </div>
      {isLast ? (
        <button onClick={onFinish} style={BTN(color)}>Take Quiz →</button>
      ) : (
        <button onClick={onNext} style={BTN(color)}>Next →</button>
      )}
    </div>
  );
}

// ─── Build-mode challenge ─────────────────────────────────────────────────────

let wireSeq = 0;
const newWireId = () => `sw${++wireSeq}_${Math.random().toString(36).slice(2, 7)}`;

function BuildChallenge({ unit, ch, savedWires, alreadySolved, onSolved, onWiresChange }: {
  unit: ElecUnit; ch: ElecChallenge;
  savedWires?: SavedWire[];
  alreadySolved: boolean;
  onSolved: (stars: number, wires: SavedWire[]) => void;
  onWiresChange: (wires: SavedWire[]) => void;
}) {
  const [given, setGiven] = useState<Part[]>(ch.given);
  const [wires, setWires] = useState<Part[]>(() =>
    (savedWires ?? []).filter(w => (w.kind ?? 'wire') === 'wire')
      .map(w => ({ id: newWireId(), kind: 'wire' as const, a: w.a, b: w.b })));
  const [tool, setTool] = useState<BoardTool>('wire');
  const [schematic, setSchematic] = useState(false);
  const solvedRef = useRef(alreadySolved);
  // Was this challenge already done when the student opened it? (stable per mount)
  const [openedSolved] = useState(alreadySolved);

  const allParts = useMemo(() => [...given, ...wires], [given, wires]);
  const result: SolveResult = useMemo(() => solveCircuit(allParts), [allParts]);

  const goalMet = useMemo(() => {
    const g = ch.goal;
    const lit = (r: SolveResult, id: string, min = 0.05) => (r.parts[id]?.brightness ?? 0) > min;
    if (g.type === 'short') return result.shorted;
    if (g.type === 'light-all') {
      if (result.shorted) return false;
      const bulbs = given.filter(p => p.kind === 'bulb' && (!g.bulbs || g.bulbs.includes(p.id)));
      if (!bulbs.every(b => lit(result, b.id, g.minBrightness ?? 0.05))) return false;
      if (g.series && !isSeries(result, bulbs.map(b => b.id))) return false;
      return true;
    }
    if (g.type === 'redundant') {
      // Every bulb lit now, AND the circuit survives losing any single bulb —
      // proven by actually re-solving with each bulb removed.
      if (result.shorted) return false;
      const bulbs = given.filter(p => p.kind === 'bulb');
      if (!bulbs.every(b => lit(result, b.id))) return false;
      return bulbs.every(victim => {
        const r2 = solveCircuit(allParts.map(p => (p.id === victim.id ? { ...p, removed: true } : p)));
        return !r2.shorted && bulbs.filter(o => o.id !== victim.id).every(o => lit(r2, o.id));
      });
    }
    if (g.type === 'switch-test') {
      // Judged on topology, not on the current lever positions: simulate with
      // all switches closed, then re-solve with each tested switch open.
      const withStates = (open: string | null) => allParts.map(p =>
        p.kind === 'switch' ? { ...p, closed: p.id !== open } : p);
      const base = solveCircuit(withStates(null));
      if (base.shorted) return false;
      const bulbs = given.filter(p => p.kind === 'bulb');
      if (!bulbs.every(b => lit(base, b.id))) return false;
      return g.tests.every(t => {
        const r2 = solveCircuit(withStates(t.switchId));
        if (r2.shorted) return false;
        return t.darkWhenOpen.every(id => !lit(r2, id)) && t.litWhenOpen.every(id => lit(r2, id));
      });
    }
    return false;
  }, [ch.goal, result, given, allParts]);

  // The parent owns "solved" (it drives the success banner via progress); this
  // effect only reports the win upward — no local setState, no cascade.
  useEffect(() => {
    if (goalMet && !solvedRef.current) {
      solvedRef.current = true;
      const stars = ch.par <= 0 ? 3 : wires.length <= ch.par ? 3 : wires.length <= ch.par + 2 ? 2 : 1;
      onSolved(stars, wires.map(w => ({ a: w.a, b: w.b })));
    }
  }, [goalMet, ch.par, wires, onSolved]);

  const addWire = useCallback((a: Pt, b: Pt) => {
    setWires(prev => {
      const next = [...prev, { id: newWireId(), kind: 'wire' as const, a, b }];
      onWiresChange(next.map(w => ({ a: w.a, b: w.b })));
      return next;
    });
  }, [onWiresChange]);

  const eraseWire = useCallback((id: string) => {
    setWires(prev => {
      const next = prev.filter(w => w.id !== id);
      onWiresChange(next.map(w => ({ a: w.a, b: w.b })));
      return next;
    });
  }, [onWiresChange]);

  const resetWires = useCallback(() => {
    setWires([]);
    onWiresChange([]);
  }, [onWiresChange]);

  const toggleSwitch = useCallback((id: string) => {
    setGiven(prev => prev.map(p => (p.id === id ? { ...p, closed: !p.closed } : p)));
  }, []);

  const toggleBulb = useCallback((id: string) => {
    setGiven(prev => prev.map(p => (p.id === id ? { ...p, removed: !p.removed } : p)));
  }, []);

  const TOOL_BTN = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${active ? unit.color : '#cbd5e1'}`,
    background: active ? `${unit.color}18` : '#fff', color: active ? unit.color : '#64748b',
  });

  return (
    <div>
      {result.shorted && ch.goal.type !== 'short' && (
        <div style={{ ...CARD, padding: '12px 18px', marginBottom: 14, background: '#fef2f2', border: '3px solid #ef4444', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div style={{ fontSize: 13.5, color: '#991b1b', fontWeight: 700 }}>
            Short circuit! Current is skipping the bulbs and racing through a wire — find the shortcut and erase it.
          </div>
        </div>
      )}
      <div style={{ ...CARD, padding: 18 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={TOOL_BTN(tool === 'wire')} onClick={() => setTool('wire')}>🔌 Wire</button>
          <button style={TOOL_BTN(tool === 'erase')} onClick={() => setTool('erase')}>🧽 Erase</button>
          <button style={TOOL_BTN(false)} onClick={resetWires}>↺ Clear my wires</button>
          <div style={{ flex: 1 }} />
          {unit.schematicUnlocked && (
            <button style={TOOL_BTN(schematic)} onClick={() => setSchematic(s => !s)}>
              {schematic ? '🎨 Picture view' : '📐 Schematic view'}
            </button>
          )}
        </div>
        <CircuitBoard
          parts={allParts}
          result={result}
          schematic={schematic}
          tool={tool}
          interactive
          allowSwitch
          allowUnscrew={!!ch.allowUnscrew}
          gridW={ch.gridW ?? 10}
          gridH={ch.gridH ?? 6}
          clipEnd={(from, to) => clipWireAtSwitches(from, to, given)}
          onAddWire={addWire}
          onErase={eraseWire}
          onToggleSwitch={toggleSwitch}
          onToggleBulb={toggleBulb}
        />
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          {tool === 'wire'
            ? 'Drag from one dot to another to place a wire. Wires connect wherever they touch.'
            : 'Tap one of your wires to remove it. (Built-in parts can’t be erased.)'}
        </div>
      </div>
      {openedSolved && (
        <div style={{ fontSize: 13, color: '#16a34a', fontWeight: 700, marginTop: 10 }}>✓ Already completed — feel free to experiment!</div>
      )}
    </div>
  );
}

// ─── Freebuild capstone: design a circuit from scratch off a parts bin ────────

const STAMP_META = {
  battery: { span: 4, emoji: '🔋', label: 'Battery pack' },
  bulb: { span: 2, emoji: '💡', label: 'Bulb' },
  switch: { span: 1, emoji: '🎚️', label: 'Switch' },
} as const;
type StampKind = keyof typeof STAMP_META;

let partSeq = 0;
const newPartId = (kind: string) => `fp_${kind}${++partSeq}_${Math.random().toString(36).slice(2, 6)}`;

/** First unused letter label ("Bulb A", "Bulb B", …) among existing bulbs. */
function nextBulbLabel(placed: Part[]): string {
  const used = new Set(placed.filter(p => p.kind === 'bulb').map(p => p.label));
  for (let i = 0; i < 26; i++) {
    const label = `Bulb ${String.fromCharCode(65 + i)}`;
    if (!used.has(label)) return label;
  }
  return 'Bulb';
}

function FreeBuildChallenge({ unit, ch, saved, alreadySolved, onSolved, onSave }: {
  unit: ElecUnit; ch: ElecChallenge;
  saved?: SavedWire[];
  alreadySolved: boolean;
  onSolved: (stars: number, parts: SavedWire[]) => void;
  onSave: (parts: SavedWire[]) => void;
}) {
  const [placed, setPlaced] = useState<Part[]>(() => {
    const comps = (saved ?? []).filter(w => w.kind && w.kind !== 'wire');
    const restored: Part[] = [];
    for (const c of comps) {
      const p: Part = { id: newPartId(c.kind!), kind: c.kind!, a: c.a, b: c.b };
      if (c.kind === 'bulb') p.label = nextBulbLabel(restored);
      if (c.kind === 'switch') p.closed = false;
      restored.push(p);
    }
    return restored;
  });
  const [wires, setWires] = useState<Part[]>(() =>
    (saved ?? []).filter(w => (w.kind ?? 'wire') === 'wire')
      .map(w => ({ id: newWireId(), kind: 'wire' as const, a: w.a, b: w.b })));
  const [tool, setTool] = useState<BoardTool>('wire');
  const [stamp, setStamp] = useState<StampKind | null>(null);
  const [schematic, setSchematic] = useState(false);
  const solvedRef = useRef(alreadySolved);

  const allParts = useMemo(() => [...placed, ...wires], [placed, wires]);
  const result: SolveResult = useMemo(() => solveCircuit(allParts), [allParts]);
  const spec = ch.goal.type === 'free-spec' ? ch.goal : null;
  const goalMet = useMemo(() =>
    spec ? evaluateFreeBuild(allParts, { check: spec.check, minBulbs: spec.minBulbs, minBrightness: spec.minBrightness }) : false,
  [allParts, spec]);

  const serialize = useCallback((comps: Part[], ws: Part[]): SavedWire[] =>
    [...comps, ...ws].map(p => ({ kind: p.kind, a: p.a, b: p.b })), []);

  useEffect(() => {
    if (goalMet && !solvedRef.current) {
      solvedRef.current = true;
      onSolved(3, serialize(placed, wires));
    }
  }, [goalMet, placed, wires, serialize, onSolved]);

  const remaining = useCallback((kind: StampKind) =>
    (ch.palette?.find(p => p.kind === kind)?.count ?? 0) - placed.filter(p => p.kind === kind).length,
  [ch.palette, placed]);

  const place = useCallback((at: Pt) => {
    if (!stamp || remaining(stamp) <= 0) return;
    const span = STAMP_META[stamp].span;
    const candA = at.x;
    const candB = at.x + span;
    // no overlapping another component's span on the same row (touching ends is fine)
    const blocked = placed.some(o => {
      if (o.a.y !== at.y || o.b.y !== at.y) return false;
      const oA = Math.min(o.a.x, o.b.x);
      const oB = Math.max(o.a.x, o.b.x);
      return candA < oB && oA < candB;
    });
    if (blocked) return;
    const part: Part = { id: newPartId(stamp), kind: stamp, a: { x: candA, y: at.y }, b: { x: candB, y: at.y } };
    if (stamp === 'bulb') part.label = nextBulbLabel(placed);
    if (stamp === 'switch') part.closed = false;
    setPlaced(prev => {
      const next = [...prev, part];
      onSave(serialize(next, wires));
      if (remaining(stamp) <= 1) {
        setStamp(null);
        setTool('wire');
      }
      return next;
    });
  }, [stamp, remaining, placed, wires, serialize, onSave]);

  const addWire = useCallback((a: Pt, b: Pt) => {
    setWires(prev => {
      const next = [...prev, { id: newWireId(), kind: 'wire' as const, a, b }];
      onSave(serialize(placed, next));
      return next;
    });
  }, [placed, serialize, onSave]);

  const erase = useCallback((id: string) => {
    setWires(prevW => {
      const nextW = prevW.filter(w => w.id !== id);
      setPlaced(prevP => {
        const nextP = prevP.filter(p => p.id !== id);
        onSave(serialize(nextP, nextW));
        return nextP;
      });
      return nextW;
    });
  }, [serialize, onSave]);

  const clearAll = useCallback(() => {
    setPlaced([]);
    setWires([]);
    setStamp(null);
    setTool('wire');
    onSave([]);
  }, [onSave]);

  const toggleSwitch = useCallback((id: string) => {
    setPlaced(prev => prev.map(p => (p.id === id ? { ...p, closed: !p.closed } : p)));
  }, []);

  const TOOL_BTN = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${active ? unit.color : '#cbd5e1'}`,
    background: active ? `${unit.color}18` : '#fff', color: active ? unit.color : '#64748b',
  });

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...CARD, padding: 18, flex: '0 1 220px', minWidth: 200 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1f2937', marginBottom: 10 }}>🧰 Parts bin</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(ch.palette ?? []).map(item => {
            const left = remaining(item.kind);
            const active = stamp === item.kind;
            const meta = STAMP_META[item.kind];
            return (
              <button key={item.kind}
                disabled={left <= 0}
                onClick={() => {
                  if (active) { setStamp(null); setTool('wire'); }
                  else { setStamp(item.kind); setTool('place'); }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
                  border: `2px solid ${active ? unit.color : left > 0 ? '#cbd5e1' : '#e2e8f0'}`,
                  background: active ? `${unit.color}14` : '#fff',
                  cursor: left > 0 ? 'pointer' : 'not-allowed', opacity: left > 0 ? 1 : 0.45, textAlign: 'left' }}>
                <span style={{ fontSize: 22 }}>{meta.emoji}</span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151' }}>{meta.label}</span>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: left > 0 ? '#64748b' : '#94a3b8' }}>
                    {left > 0 ? `×${left} left` : 'all placed'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 12, lineHeight: 1.5 }}>
          Tap a part, then tap the board to place it. Use the Erase tool to take parts back.
        </div>
      </div>
      <div style={{ ...CARD, padding: 18, flex: '1 1 480px', minWidth: 380 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={TOOL_BTN(tool === 'wire' && !stamp)} onClick={() => { setStamp(null); setTool('wire'); }}>🔌 Wire</button>
          <button style={TOOL_BTN(tool === 'erase')} onClick={() => { setStamp(null); setTool('erase'); }}>🧽 Erase</button>
          <button style={TOOL_BTN(false)} onClick={clearAll}>↺ Clear the bench</button>
          <div style={{ flex: 1 }} />
          {unit.schematicUnlocked && (
            <button style={TOOL_BTN(schematic)} onClick={() => setSchematic(s => !s)}>
              {schematic ? '🎨 Picture view' : '📐 Schematic view'}
            </button>
          )}
        </div>
        <CircuitBoard
          parts={allParts}
          result={result}
          schematic={schematic}
          tool={tool}
          interactive
          allowSwitch
          gridW={ch.gridW ?? 10}
          gridH={ch.gridH ?? 6}
          placeSpan={stamp ? STAMP_META[stamp].span : undefined}
          clipEnd={(from, to) => clipWireAtSwitches(from, to, placed)}
          onPlace={place}
          onAddWire={addWire}
          onErase={erase}
          onToggleSwitch={toggleSwitch}
        />
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          {stamp
            ? `Tap the board to place your ${STAMP_META[stamp].label.toLowerCase()} — it needs a clear spot on its row.`
            : tool === 'erase'
              ? 'Tap any of your parts or wires to take it back to the bin.'
              : 'Drag from one dot to another to place a wire. Wires connect wherever they touch.'}
        </div>
      </div>
    </div>
  );
}

// ─── Materials-mode challenge (Unit 1 C2) ─────────────────────────────────────

function MaterialsChallenge({ unit, ch, alreadySolved, onSolved }: {
  unit: ElecUnit; ch: ElecChallenge; alreadySolved: boolean;
  onSolved: (stars: number) => void;
}) {
  const materials = useMemo(() => ch.materials ?? [], [ch.materials]);
  const [placed, setPlaced] = useState<number | null>(null);
  const [tested, setTested] = useState<Set<number>>(new Set());
  const [sorted, setSorted] = useState<Record<number, 'conductor' | 'insulator'>>({});
  const [mistakes, setMistakes] = useState(0);
  const [wrongFlash, setWrongFlash] = useState<number | null>(null);
  const solvedRef = useRef(alreadySolved);

  const parts = useMemo(() => ch.given.map(p => {
    if (p.id !== 'gap') return p;
    if (placed === null) return { ...p, removed: true };
    const m = materials[placed];
    return { ...p, removed: false, conductive: m.conductive, label: m.label };
  }), [ch.given, placed, materials]);

  const result = useMemo(() => solveCircuit(parts), [parts]);
  const emojiMap = useMemo(() => Object.fromEntries(materials.map(m => [m.label, m.emoji])), [materials]);

  const allSorted = materials.length > 0 && materials.every((_, i) => sorted[i] !== undefined);
  useEffect(() => {
    if (allSorted && !solvedRef.current) {
      solvedRef.current = true;
      onSolved(mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);
    }
  }, [allSorted, mistakes, onSolved]);

  const trySort = (i: number, bin: 'conductor' | 'insulator') => {
    const correct = (bin === 'conductor') === materials[i].conductive;
    if (correct) {
      setSorted(prev => ({ ...prev, [i]: bin }));
      if (placed === i) setPlaced(null);
    } else {
      setMistakes(m => m + 1);
      setWrongFlash(i);
      setTimeout(() => setWrongFlash(null), 900);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...CARD, padding: 18, flex: '1 1 480px', minWidth: 380 }}>
        <CircuitBoard parts={parts} result={result} interactive={false} allowSwitch={false} materialEmoji={emojiMap}
          gridW={ch.gridW ?? 10} gridH={ch.gridH ?? 6} />
        <div style={{ fontSize: 12.5, color: placed !== null ? '#374151' : '#94a3b8', marginTop: 8, fontWeight: 600 }}>
          {placed === null
            ? 'Tap a material below to clip it into the tester.'
            : (result.parts['b1']?.brightness ?? 0) > 0.05
              ? `The bulb is ON — the ${materials[placed].label.toLowerCase()} lets electricity through!`
              : `The bulb stays OFF — the ${materials[placed].label.toLowerCase()} blocks the flow.`}
        </div>
      </div>
      <div style={{ ...CARD, padding: 18, flex: '1 1 300px', minWidth: 280 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1f2937', marginBottom: 10 }}>Materials tray</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {materials.map((m, i) => {
            const done = sorted[i] !== undefined;
            const isPlaced = placed === i;
            const wasTested = tested.has(i);
            return (
              <div key={m.label} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12,
                border: `2px solid ${wrongFlash === i ? '#ef4444' : done ? '#4ade80' : isPlaced ? unit.color : '#e2e8f0'}`,
                background: wrongFlash === i ? '#fef2f2' : done ? '#f0fdf4' : '#fff',
                opacity: done ? 0.75 : 1, transition: 'all 150ms',
              }}>
                <button
                  disabled={done}
                  onClick={() => { setPlaced(i); setTested(prev => new Set(prev).add(i)); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: done ? 'default' : 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
                  <span style={{ fontSize: 22 }}>{m.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{m.label}</span>
                </button>
                {done ? (
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: '#16a34a' }}>
                    {sorted[i] === 'conductor' ? '⚡ Conductor' : '🚫 Insulator'} ✓
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => trySort(i, 'conductor')} disabled={!wasTested}
                      title={wasTested ? undefined : 'Test it in the clips first!'}
                      style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: wasTested ? 'pointer' : 'not-allowed', border: '2px solid #f59e0b', background: '#fffbeb', color: '#b45309', opacity: wasTested ? 1 : 0.4 }}>
                      ⚡ Conductor
                    </button>
                    <button onClick={() => trySort(i, 'insulator')} disabled={!wasTested}
                      title={wasTested ? undefined : 'Test it in the clips first!'}
                      style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: wasTested ? 'pointer' : 'not-allowed', border: '2px solid #64748b', background: '#f8fafc', color: '#475569', opacity: wasTested ? 1 : 0.4 }}>
                      🚫 Insulator
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {wrongFlash !== null && (
          <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, color: '#dc2626' }}>
            Not quite — look at what the bulb did when you tested it!
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Predict-mode challenge (Unit 2 C3) ───────────────────────────────────────

function PredictChallenge({ unit, ch, alreadySolved, onSolved }: {
  unit: ElecUnit; ch: ElecChallenge; alreadySolved: boolean;
  onSolved: (stars: number) => void;
}) {
  const pd = ch.predict!;
  const [parts, setParts] = useState<Part[]>(ch.given);
  const [picked, setPicked] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false); // prediction submitted
  const [observed, setObserved] = useState(false);   // target bulb unscrewed
  const solvedRef = useRef(alreadySolved);

  const result = useMemo(() => solveCircuit(parts), [parts]);

  // Unscrew detection happens right in the click handler — bulbs are only
  // tappable once the prediction is locked in, so `picked` is final here.
  const toggleBulb = useCallback((id: string) => {
    setParts(prev => {
      const next = prev.map(p => (p.id === id ? { ...p, removed: !p.removed } : p));
      if (next.find(p => p.id === pd.targetBulb)?.removed) {
        setObserved(true);
        if (!solvedRef.current) {
          solvedRef.current = true;
          onSolved(picked === pd.answer ? 3 : 2);
        }
      }
      return next;
    });
  }, [pd, picked, onSolved]);

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...CARD, padding: 18, flex: '1 1 480px', minWidth: 380 }}>
        <CircuitBoard parts={parts} result={result} interactive={false}
          allowSwitch={false} allowUnscrew={confirmed} onToggleBulb={toggleBulb}
          gridW={ch.gridW ?? 10} gridH={ch.gridH ?? 6} />
        {confirmed && !observed && (
          <div style={{ fontSize: 13, color: unit.color, fontWeight: 700, marginTop: 8 }}>👆 {pd.actionPrompt}</div>
        )}
      </div>
      <div style={{ ...CARD, padding: 20, flex: '1 1 300px', minWidth: 280 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Make a prediction</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>{pd.question}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pd.options.map((opt, i) => {
            const chosen = picked === i;
            const showCorrect = confirmed && i === pd.answer;
            const showWrong = confirmed && chosen && i !== pd.answer;
            return (
              <button key={i} disabled={confirmed}
                onClick={() => setPicked(i)}
                style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  cursor: confirmed ? 'default' : 'pointer',
                  border: `2px solid ${showCorrect ? '#22c55e' : showWrong ? '#ef4444' : chosen ? unit.color : '#e2e8f0'}`,
                  background: showCorrect ? '#f0fdf4' : showWrong ? '#fef2f2' : chosen ? `${unit.color}14` : '#fff',
                  color: '#374151' }}>
                {opt}{showCorrect && ' ✓'}{showWrong && ' ✗'}
              </button>
            );
          })}
        </div>
        {!confirmed ? (
          <button disabled={picked === null} onClick={() => setConfirmed(true)}
            style={{ ...BTN(picked === null ? '#94a3b8' : unit.color), width: '100%', marginTop: 14, cursor: picked === null ? 'not-allowed' : 'pointer' }}>
            Lock in my prediction
          </button>
        ) : observed ? (
          <div style={{ marginTop: 14, fontSize: 13, color: '#374151', background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 10, padding: '10px 14px', lineHeight: 1.55 }}>
            {pd.resultNote}
          </div>
        ) : (
          <div style={{ marginTop: 14, fontSize: 12.5, color: '#64748b' }}>
            {picked === pd.answer ? 'Prediction locked in. Now prove it!' : 'Prediction locked in — now test it and see what really happens.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

function QuizView({ ui, onDone }: { ui: number; onDone: (score: number, total: number) => void }) {
  const unit = UNITS[ui];
  const [answers, setAnswers] = useState<(number | null)[]>(unit.quiz.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  // Shuffle displayed option order once per attempt (answers track original indices)
  const [order] = useState<number[][]>(() => unit.quiz.map(() => {
    const idx = [0, 1, 2, 3];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }));

  const score = submitted ? unit.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0) : 0;

  return (
    <SiteChrome>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: unit.color, padding: '18px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unit {unit.id} Quiz</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>{unit.title}</div>
          </div>
          <div style={{ padding: '24px 28px' }}>
            {unit.quiz.map((q, qi) => {
              const chosen = answers[qi];
              return (
                <div key={qi} style={{ marginBottom: 28 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', marginBottom: 10 }}>{qi + 1}. {q.question}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {order[qi].map(oi => {
                      const opt = q.options[oi];
                      const pickedThis = chosen === oi;
                      const isCorrect = submitted && oi === q.answer;
                      const isWrong = submitted && pickedThis && oi !== q.answer;
                      return (
                        <button key={oi} disabled={submitted}
                          onClick={() => setAnswers(prev => { const a = [...prev]; a[qi] = oi; return a; })}
                          style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: submitted ? 'default' : 'pointer',
                            border: `2px solid ${isCorrect ? '#22c55e' : isWrong ? '#ef4444' : pickedThis ? unit.color : '#e2e8f0'}`,
                            background: isCorrect ? '#f0fdf4' : isWrong ? '#fef2f2' : pickedThis ? `${unit.color}14` : '#fff',
                            color: '#374151', transition: 'all 120ms' }}>
                          {opt}
                          {isCorrect && ' ✓'}
                          {isWrong && ' ✗'}
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <div style={{ marginTop: 8, fontSize: 12.5, color: '#475569', background: '#fffbeb', borderRadius: 8, padding: '8px 12px', borderLeft: `4px solid ${unit.color}` }}>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
            {!submitted ? (
              <button
                disabled={answers.some(a => a === null)}
                onClick={() => setSubmitted(true)}
                style={{ ...BTN(answers.some(a => a === null) ? '#94a3b8' : unit.color), width: '100%', cursor: answers.some(a => a === null) ? 'not-allowed' : 'pointer' }}>
                Submit Answers
              </button>
            ) : (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 40 }}>{score === unit.quiz.length ? '🏆' : score >= unit.quiz.length * 0.75 ? '🎉' : '📚'}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#1f2937' }}>{score} / {unit.quiz.length}</div>
                  <div style={{ fontSize: 14, color: '#64748b', marginTop: 4 }}>
                    {score === unit.quiz.length ? 'Perfect score!' : score >= unit.quiz.length * 0.75 ? 'Great work — keep it up!' : 'Review the lesson notes and try again.'}
                  </div>
                </div>
                <button onClick={() => onDone(score, unit.quiz.length)} style={{ ...BTN(unit.color), width: '100%' }}>
                  {score >= unit.quiz.length * 0.6 ? 'Continue →' : 'Try Again →'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Unit complete ────────────────────────────────────────────────────────────

function UnitComplete({ ui, score, total, onNext, onRetake, onBack }: {
  ui: number; score: number; total: number;
  onNext: () => void; onRetake: () => void; onBack: () => void;
}) {
  const unit = UNITS[ui];
  const pct = Math.round(score / total * 100);
  const passed = score >= total * 0.6;
  const hasNext = ui < UNITS.length - 1;
  return (
    <SiteChrome>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '50px 32px' }}>
        <div style={{ ...CARD, padding: '40px 36px', textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>{pct >= 80 ? '🏆' : pct >= 60 ? '🎉' : '📚'}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unit {unit.id} Complete</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1f2937', margin: '8px 0 4px' }}>{unit.title}</div>
          <div style={{ fontSize: 16, color: '#64748b', marginBottom: 20 }}>Quiz score: {score} / {total} ({pct}%)</div>
          {passed && (
            <div style={{ textAlign: 'left', background: '#fffbeb', border: `2px solid ${unit.color}`, borderRadius: 14, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
                🔧 Try it for real
              </div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
                The screen was just practice — the real thing is even better. With your teacher:
              </div>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {unit.tryReal.map((step, i) => (
                  <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 4 }}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          {!passed ? (
            <button onClick={onRetake} style={{ ...BTN(unit.color), display: 'block', width: '100%', marginBottom: 12 }}>
              Retake Quiz →
            </button>
          ) : hasNext ? (
            <button onClick={onNext} style={{ ...BTN(unit.color), display: 'block', width: '100%', marginBottom: 12 }}>
              Start Unit {ui + 2} →
            </button>
          ) : (
            <div style={{ background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>⚡ You’re up to date!</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                More units are on the way — parallel circuits, switches, and the circuit detective are coming soon.
              </div>
            </div>
          )}
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ← Back to Units
          </button>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ElectronicsLabPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [progress, setProgress] = useState<Progress>(emptyProgress());
  const [phase, setPhase] = useState<Phase>({ tag: 'overview' });
  const progressRef = useRef<Progress>(emptyProgress());
  const [assignedUnits, setAssignedUnits] = useState<number[] | null>(null);
  const [lockedChallenges, setLockedChallenges] = useState<{ level_idx: number; challenge_idx: number }[]>([]);

  useEffect(() => {
    const local = loadProgress();
    setProgress(local);
    progressRef.current = local;
    if (userId) {
      loadFromCloud().then(cloud => {
        const starKeys = new Set([...Object.keys(local.stars), ...Object.keys(cloud.stars)]);
        const merged: Progress = {
          completedChallenges: { ...local.completedChallenges, ...cloud.completedChallenges },
          completedUnits: { ...local.completedUnits, ...cloud.completedUnits },
          savedWires: { ...cloud.savedWires, ...local.savedWires },
          stars: Object.fromEntries(
            [...starKeys].map(k => [k, Math.max(local.stars[k] ?? 0, cloud.stars[k] ?? 0)]),
          ),
        };
        setProgress(merged);
        progressRef.current = merged;
        saveProgress(merged);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (status === 'loading') return;
    fetch('/api/student/assignments?tool=electronics-lab')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setAssignedUnits(data));
    fetch('/api/student/locks?tool=electronics-lab')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setLockedChallenges(data ?? []));
  }, [status]);

  const updateProgress = useCallback((updater: (p: Progress) => Progress) => {
    const next = updater(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
    return next;
  }, []);

  const handleSolve = useCallback((ui: number, ci: number, stars: number, wires?: SavedWire[]) => {
    const key = chalKey(ui, ci);
    const best = Math.max(progressRef.current.stars[key] ?? 0, stars);
    updateProgress(p => ({
      ...p,
      completedChallenges: { ...p.completedChallenges, [key]: true },
      savedWires: wires ? { ...p.savedWires, [key]: wires } : p.savedWires,
      stars: { ...p.stars, [key]: best },
    }));
    if (userId) syncToCloud(ui, ci, true, wires, best);
  }, [updateProgress, userId]);

  const handleWiresChange = useCallback((ui: number, ci: number, wires: SavedWire[]) => {
    updateProgress(p => ({ ...p, savedWires: { ...p.savedWires, [chalKey(ui, ci)]: wires } }));
  }, [updateProgress]);

  const lockedLevels = new Set(lockedChallenges.filter(lc => lc.challenge_idx === -1).map(lc => lc.level_idx));

  if (phase.tag === 'overview') {
    return <Overview progress={progress} assignedUnits={assignedUnits} lockedLevels={lockedLevels}
      onSelect={ui => setPhase({ tag: 'intro', ui })} />;
  }

  if (phase.tag === 'intro') {
    return <UnitIntro ui={phase.ui}
      onStart={() => setPhase({ tag: 'challenge', ui: phase.ui, ci: 0 })}
      onBack={() => setPhase({ tag: 'overview' })} />;
  }

  if (phase.tag === 'challenge') {
    const { ui, ci } = phase;
    const unit = UNITS[ui];
    const ch = unit.challenges[ci];
    const key = chalKey(ui, ci);
    const lockedCis = new Set(lockedChallenges.filter(lc => lc.level_idx === ui).map(lc => lc.challenge_idx));
    const isLocked = lockedCis.has(-1) || lockedCis.has(ci);
    const isLast = ci === unit.challenges.length - 1;
    const solved = !!progress.completedChallenges[key];

    if (isLocked) {
      return (
        <SiteChrome>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: '40px 28px' }}>
            <div style={{ ...CARD, padding: '48px 40px', textAlign: 'center', maxWidth: 440 }}>
              <div style={{ fontSize: 60, marginBottom: 16 }}>🔒</div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1f2937', margin: '0 0 12px' }}>Challenge Locked</h2>
              <p style={{ fontSize: 15, color: '#64748b', lineHeight: 1.6, margin: '0 0 24px' }}>
                Your teacher has locked this challenge. Check back once it&apos;s been unlocked.
              </p>
              <button onClick={() => setPhase({ tag: 'overview' })} style={BTN(unit.color)}>← Back to Units</button>
            </div>
          </div>
        </SiteChrome>
      );
    }

    const banner = solved ? (
      <SuccessBanner ch={ch} isLast={isLast} stars={progress.stars[key] ?? 1} color={unit.color}
        onNext={() => setPhase({ tag: 'challenge', ui, ci: ci + 1 })}
        onFinish={() => setPhase({ tag: 'quiz', ui })} />
    ) : undefined;

    return (
      <ChallengeShell unit={unit} ui={ui} ci={ci} progress={progress} lockedCis={lockedCis} banner={banner}
        onBack={() => setPhase({ tag: 'overview' })}
        onJump={newCi => setPhase({ tag: 'challenge', ui, ci: newCi })}>
        {ch.mode === 'build' && (
          <BuildChallenge key={key} unit={unit} ch={ch}
            savedWires={progress.savedWires[key]}
            alreadySolved={solved}
            onSolved={(stars, wires) => handleSolve(ui, ci, stars, wires)}
            onWiresChange={wires => handleWiresChange(ui, ci, wires)} />
        )}
        {ch.mode === 'materials' && (
          <MaterialsChallenge key={key} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
        )}
        {ch.mode === 'predict' && (
          <PredictChallenge key={key} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
        )}
        {ch.mode === 'freebuild' && (
          <FreeBuildChallenge key={key} unit={unit} ch={ch}
            saved={progress.savedWires[key]}
            alreadySolved={solved}
            onSolved={(stars, parts) => handleSolve(ui, ci, stars, parts)}
            onSave={parts => handleWiresChange(ui, ci, parts)} />
        )}
      </ChallengeShell>
    );
  }

  if (phase.tag === 'quiz') {
    const { ui } = phase;
    return (
      <QuizView ui={ui} onDone={(score, total) => {
        const passed = score >= total * 0.6;
        if (passed) {
          updateProgress(p => ({ ...p, completedUnits: { ...p.completedUnits, [ui]: true } }));
          if (userId) syncToCloud(ui, null, true, undefined, score);
        }
        setPhase({ tag: 'complete', ui, score, total });
      }} />
    );
  }

  if (phase.tag === 'complete') {
    const { ui, score, total } = phase;
    return (
      <UnitComplete ui={ui} score={score} total={total}
        onNext={() => setPhase({ tag: 'intro', ui: ui + 1 })}
        onRetake={() => setPhase({ tag: 'quiz', ui })}
        onBack={() => setPhase({ tag: 'overview' })}
      />
    );
  }

  return null;
}
