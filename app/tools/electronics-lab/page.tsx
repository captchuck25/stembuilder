'use client';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SiteHeader from '@/app/components/SiteHeader';
import { isAdmin } from '@/lib/roles';

import { COMING_SOON, ElecChallenge, ElecUnit, UNITS, chalKey, countCompleted } from './units';
import { LED_MIN_LIT, LED_SAFE_MAX, Part, PartKind, Pt, SolveResult } from './engine/types';
import { solveCircuit, isSeries, clipWireAtSwitches, evaluateFreeBuild, continuity } from './engine/solver';
import { ptKey, wirePoints } from './engine/types';
import CircuitBoard, { BoardTool, CELL, PAD } from './components/CircuitBoard';
import { MeterState, MultimeterView, ProbePen, meterSockets } from './components/parts';

// ─── Progress ─────────────────────────────────────────────────────────────────

/** One saved piece of a student build. kind is absent for plain wires
 *  (backwards-compatible with earlier saves, which were wires only). */
interface SavedWire { kind?: PartKind; a: Pt; b: Pt; broken?: boolean }
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
// Admin review helper: clear one cloud row (challenge, or quiz when ci=null).
async function deleteCloudProgress(ui: number, ci: number | null) {
  await fetch(`/api/progress?tool=electronics-lab&level_idx=${ui}&challenge_idx=${ci ?? -1}`, { method: 'DELETE' });
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

// ─── Unit icon (Unit 6 wears the actual Ohm's Law triangle) ───────────────────

function UnitIcon({ unit, size }: { unit: { id: number; emoji: string }; size: number }) {
  if (unit.id === 6) {
    return <span style={{ display: 'inline-flex', verticalAlign: 'middle' }}><OhmTriangle size={size} /></span>;
  }
  return <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{unit.emoji}</span>;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ progress, onSelect, assignedUnits, lockedLevels, onResetQuiz }: {
  progress: Progress;
  onSelect: (ui: number) => void;
  assignedUnits: number[] | null;
  lockedLevels: Set<number>;
  /** Present only for admins — renders a quiz-reset button on completed unit cards. */
  onResetQuiz?: (ui: number) => void;
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
                <div style={{ marginTop: 8, minHeight: 34 }}><UnitIcon unit={unit} size={34} /></div>
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
                {onResetQuiz && progress.completedUnits[ui] && (
                  <button onClick={e => { e.stopPropagation(); onResetQuiz(ui); }}
                    title="Admin only: clear your quiz result for this unit so you can retake it"
                    style={{ marginTop: 10, padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                      background: '#fff', color: '#dc2626', border: '2px solid #fca5a5', cursor: 'pointer' }}>
                    ↺ Reset quiz (admin)
                  </button>
                )}
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
            <div style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.25))' }}><UnitIcon unit={unit} size={70} /></div>
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

function ChallengeShell({ unit, ui, ci, progress, lockedCis, banner, onBack, onJump, onAdminReset, children }: {
  unit: ElecUnit; ui: number; ci: number; progress: Progress; lockedCis: Set<number>;
  banner?: React.ReactNode;
  onBack: () => void; onJump: (ci: number) => void;
  /** Present only for admins on a completed challenge — renders the review reset button. */
  onAdminReset?: () => void;
  children: React.ReactNode;
}) {
  const ch = unit.challenges[ci];
  const bestStars = progress.stars[chalKey(ui, ci)] ?? 0;
  const [showNotes, setShowNotes] = useState(false);
  return (
    <SiteChrome>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 28px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Units</button>
          <span style={{ color: 'rgba(0,0,0,0.2)' }}>|</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: unit.color, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <UnitIcon unit={unit} size={16} /> Unit {unit.id} — {unit.title}
          </span>
          <span style={{ fontSize: 13, color: '#64748b' }}>Challenge {ci + 1} of {unit.challenges.length}</span>
          {onAdminReset && (
            <button onClick={onAdminReset} title="Admin only: clear your completion of this challenge so you can replay it"
              style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: 14, fontSize: 12, fontWeight: 700,
                background: '#fff', color: '#dc2626', border: '2px solid #fca5a5', cursor: 'pointer' }}>
              ↺ Reset challenge (admin)
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
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
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowNotes(s => !s)}
            style={{ padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `2px solid ${showNotes ? unit.color : '#cbd5e1'}`,
              background: showNotes ? `${unit.color}18` : '#fff',
              color: showNotes ? unit.color : '#64748b' }}>
            📖 {showNotes ? 'Hide notes' : 'Lesson notes'}
          </button>
        </div>
        {showNotes && (
          <div style={{ ...CARD, padding: '8px 12px', marginBottom: 14, maxHeight: 420, overflowY: 'auto' }}>
            <div style={{ margin: '10px 8px 0', background: '#f8fafc', border: '2px solid #cbd5e1', borderRadius: 12, padding: '12px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                📖 Words to Know
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '5px 16px' }}>
                {unit.vocab.map(v => (
                  <div key={v.term} style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 800, color: unit.color }}>{v.term}</span>
                    <span style={{ color: '#94a3b8' }}> — </span>
                    {v.def}
                  </div>
                ))}
              </div>
            </div>
            <LessonPanel text={unit.introNotes} />
          </div>
        )}
        <div style={{ ...CARD, padding: '14px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Challenge {ci + 1}</div>
            {ch.mode === 'build' && ch.par > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: '2px 10px' }}>
                Par: {ch.par} wires
              </span>
            )}
            {ch.mode === 'detective' && ch.par > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: '2px 10px' }}>
                ⭐⭐⭐ at {ch.par} tests or fewer
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
        {ch.objective && (
          <div style={{ ...CARD, padding: '14px 20px', marginBottom: 14, borderLeft: `8px solid ${unit.color}` }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#1f2937', marginBottom: 8 }}>🎯 Your goal: <span style={{ fontWeight: 700 }}>{ch.objective.goal}</span></div>
            <ol style={{ margin: 0, paddingLeft: 22 }}>
              {ch.objective.steps.map((step, i) => (
                <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 3 }}>{step}</li>
              ))}
            </ol>
          </div>
        )}
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
  // Components the student placed from the parts bin (palette challenges only)
  const [placed, setPlaced] = useState<Part[]>(() =>
    (savedWires ?? []).filter(w => w.kind && w.kind !== 'wire')
      .map(c => stampPart(c.kind as StampKind, c.a, c.b)));
  const [wires, setWires] = useState<Part[]>(() =>
    (savedWires ?? []).filter(w => (w.kind ?? 'wire') === 'wire')
      .map(w => ({ id: newWireId(), kind: 'wire' as const, a: w.a, b: w.b, ...(ch.breadboard ? { jump: true } : {}) })));
  const [tool, setTool] = useState<BoardTool>('wire');
  const [stamp, setStamp] = useState<StampKind | null>(null);
  const [schematic, setSchematic] = useState(false);
  const [xray, setXray] = useState(false);
  const solvedRef = useRef(alreadySolved);
  // Was this challenge already done when the student opened it? (stable per mount)
  const [openedSolved] = useState(alreadySolved);

  const allParts = useMemo(() => [...given, ...placed, ...wires], [given, placed, wires]);

  const serializeAll = useCallback((comps: Part[], ws: Part[]): SavedWire[] =>
    [...comps.map(p => ({ kind: p.kind, a: p.a, b: p.b })), ...ws.map(w => ({ a: w.a, b: w.b }))], []);
  const result: SolveResult = useMemo(() => solveCircuit(allParts), [allParts]);
  const refParts = ch.reference?.parts;
  const refResult = useMemo(() => (refParts ? solveCircuit(refParts) : null), [refParts]);

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
    if (g.type === 'led-safe') {
      // Every LED lit at a safe current with all switches closed; if a switch
      // is required, opening some switch must darken every LED.
      const withStates = (open: string | null) => allParts.map(p =>
        p.kind === 'switch' ? { ...p, closed: p.id !== open } : p);
      const base = solveCircuit(withStates(null));
      if (base.shorted) return false;
      const comps = [...given, ...placed];
      const leds = comps.filter(p => p.kind === 'led');
      if (!leds.length) return false;
      const safeLit = leds.every(l => {
        const c = base.parts[l.id]?.current ?? 0;
        return c > LED_MIN_LIT && c <= LED_SAFE_MAX;
      });
      if (!safeLit) return false;
      if (g.requireSwitch) {
        const switches = comps.filter(p => p.kind === 'switch');
        const controls = switches.some(s => {
          const r2 = solveCircuit(withStates(s.id));
          return !r2.shorted && leds.every(l => Math.abs(r2.parts[l.id]?.current ?? 0) < LED_MIN_LIT);
        });
        if (!controls) return false;
      }
      return true;
    }
    return false;
  }, [ch.goal, result, given, placed, allParts]);

  // The parent owns "solved" (it drives the success banner via progress); this
  // effect only reports the win upward — no local setState, no cascade.
  useEffect(() => {
    if (goalMet && !solvedRef.current) {
      solvedRef.current = true;
      const stars = ch.par <= 0 ? 3 : wires.length <= ch.par ? 3 : wires.length <= ch.par + 2 ? 2 : 1;
      onSolved(stars, serializeAll(placed, wires));
    }
  }, [goalMet, ch.par, placed, wires, serializeAll, onSolved]);

  const addWire = useCallback((a: Pt, b: Pt) => {
    const next = [...wires, { id: newWireId(), kind: 'wire' as const, a, b, ...(ch.breadboard ? { jump: true } : {}) }];
    setWires(next);
    onWiresChange(serializeAll(placed, next));
  }, [wires, placed, ch.breadboard, serializeAll, onWiresChange]);

  const eraseWire = useCallback((id: string) => {
    const nextW = wires.filter(w => w.id !== id);
    const nextP = placed.filter(p => p.id !== id);
    setWires(nextW);
    setPlaced(nextP);
    onWiresChange(serializeAll(nextP, nextW));
  }, [wires, placed, serializeAll, onWiresChange]);

  const resetWires = useCallback(() => {
    setWires([]);
    setPlaced([]);
    setStamp(null);
    setTool('wire');
    onWiresChange([]);
  }, [onWiresChange]);

  const remaining = useCallback((kind: StampKind) =>
    (ch.palette?.find(p => p.kind === kind)?.count ?? 0) - placed.filter(p => stampOf(p) === kind).length,
  [ch.palette, placed]);

  const place = useCallback((at: Pt) => {
    if (!stamp || remaining(stamp) <= 0) return;
    const span = STAMP_META[stamp].span;
    const candA = at.x;
    const candB = at.x + span;
    const blocked = [...given.filter(p => p.kind !== 'wire'), ...placed].some(o => {
      if (o.a.y !== at.y || o.b.y !== at.y) return false;
      const oA = Math.min(o.a.x, o.b.x);
      const oB = Math.max(o.a.x, o.b.x);
      return candA < oB && oA < candB;
    });
    if (blocked) return;
    const part = stampPart(stamp, { x: candA, y: at.y }, { x: candB, y: at.y });
    const next = [...placed, part];
    setPlaced(next);
    onWiresChange(serializeAll(next, wires));
    if (remaining(stamp) <= 1) {
      setStamp(null);
      setTool('wire');
    }
  }, [stamp, remaining, given, placed, wires, serializeAll, onWiresChange]);

  const toggleSwitch = useCallback((id: string) => {
    const flip = (prev: Part[]) => prev.map(p => (p.id === id ? { ...p, closed: !p.closed } : p));
    setGiven(flip);
    setPlaced(flip);
  }, []);

  const toggleBulb = useCallback((id: string) => {
    setGiven(prev => prev.map(p => (p.id === id ? { ...p, removed: !p.removed } : p)));
  }, []);

  const flipLed = useCallback((id: string) => {
    const swap = (prev: Part[]) => prev.map(p => (p.id === id ? { ...p, a: p.b, b: p.a } : p));
    setGiven(swap);
    setPlaced(swap);
  }, []);

  const burnedLeds = [...given, ...placed].filter(p => p.kind === 'led' && Math.abs(result.parts[p.id]?.current ?? 0) > LED_SAFE_MAX);

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
      {burnedLeds.length > 0 && (
        <div style={{ ...CARD, padding: '12px 18px', marginBottom: 14, background: '#fef2f2', border: '3px solid #ef4444', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 24 }}>💥</span>
          <div style={{ fontSize: 13.5, color: '#991b1b', fontWeight: 700 }}>
            The LED is burning out — way too much current! It needs the resistor in its path. Remove the shortcut jumper and route through the resistor.
          </div>
        </div>
      )}
      {ch.reference && (
        <div style={{ ...CARD, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
            📋 The schematic — build exactly this
          </div>
          <div style={{ maxWidth: 440 }}>
            <CircuitBoard
              parts={ch.reference.parts}
              result={refResult!}
              schematic
              interactive={false}
              allowSwitch={false}
              gridW={ch.reference.gridW}
              gridH={ch.reference.gridH}
            />
          </div>
        </div>
      )}
      <div style={{ ...CARD, padding: 18 }}>
        {ch.palette && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: '#64748b' }}>🧰 Parts bin:</span>
            {ch.palette.map(item => {
              const left = remaining(item.kind);
              const active = stamp === item.kind;
              const meta = STAMP_META[item.kind];
              return (
                <button key={item.kind} disabled={left <= 0}
                  onClick={() => {
                    if (active) { setStamp(null); setTool('wire'); }
                    else { setStamp(item.kind); setTool('place'); }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10,
                    border: `2px solid ${active ? unit.color : left > 0 ? '#cbd5e1' : '#e2e8f0'}`,
                    background: active ? `${unit.color}14` : '#fff',
                    cursor: left > 0 ? 'pointer' : 'not-allowed', opacity: left > 0 ? 1 : 0.45 }}>
                  <span style={{ fontSize: 17 }}>{meta.emoji}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: '#374151' }}>{meta.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: left > 0 ? '#64748b' : '#16a34a' }}>
                    {left > 0 ? `×${left}` : '✓'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={TOOL_BTN(tool === 'wire' && !stamp)} onClick={() => { setStamp(null); setTool('wire'); }}>🔌 {ch.breadboard ? 'Jumper' : 'Wire'}</button>
          <button style={TOOL_BTN(tool === 'erase')} onClick={() => { setStamp(null); setTool('erase'); }}>🧽 Erase</button>
          <button style={TOOL_BTN(false)} onClick={resetWires}>↺ Clear the {ch.palette ? 'bench' : ch.breadboard ? 'jumpers' : 'wires'}</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: '5px 12px', borderRadius: 12,
            background: goalMet ? '#f0fdf4' : '#f8fafc',
            border: `2px solid ${goalMet ? '#4ade80' : '#cbd5e1'}`,
            color: goalMet ? '#16a34a' : '#94a3b8' }}>
            {goalMet ? '✓ Checker: passing!' : 'Checker: not passing yet'}
          </span>
          {ch.breadboard ? (
            <button style={TOOL_BTN(xray)} onClick={() => setXray(x => !x)}>
              {xray ? '🎨 Normal view' : '🩻 X-ray view'}
            </button>
          ) : unit.schematicUnlocked && (
            <button style={TOOL_BTN(schematic)} onClick={() => setSchematic(s => !s)}>
              {schematic ? '🎨 Picture view' : '📐 Schematic view'}
            </button>
          )}
        </div>
        <CircuitBoard
          parts={allParts}
          result={result}
          schematic={!ch.breadboard && schematic}
          tool={tool}
          interactive
          allowSwitch
          allowUnscrew={!!ch.allowUnscrew}
          gridW={ch.gridW ?? 10}
          gridH={ch.gridH ?? 6}
          breadboard={ch.breadboard ? { xray } : undefined}
          placeSpan={stamp ? STAMP_META[stamp].span : undefined}
          clipEnd={(from, to) => clipWireAtSwitches(from, to, [...given, ...placed])}
          onPlace={place}
          onAddWire={addWire}
          onErase={eraseWire}
          onToggleSwitch={toggleSwitch}
          onToggleBulb={toggleBulb}
          onFlipLed={[...given, ...placed].some(p => p.kind === 'led') ? flipLed : undefined}
        />
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          {stamp
            ? `Tap the board to place your ${STAMP_META[stamp].label.toLowerCase()} — its two legs must land in DIFFERENT columns.`
            : tool === 'wire'
              ? ch.breadboard
                ? 'Drag from one hole to another to place a jumper — it arcs over the board and connects ONLY at its two ends.'
                : 'Drag from one dot to another to place a wire. Wires connect wherever they touch.'
              : `Tap one of your ${ch.palette ? 'parts or jumpers' : ch.breadboard ? 'jumpers' : 'wires'} to remove it. (Built-in parts can’t be erased.)`}
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
  breakwire: { span: 2, emoji: '💔', label: 'Broken wire' },
  resistor: { span: 2, emoji: '〰️', label: 'Resistor (100 Ω)' },
  led: { span: 2, emoji: '🔴', label: 'LED' },
} as const;
type StampKind = keyof typeof STAMP_META;

/** Palette stamps map onto engine parts; a breakwire is a wire born broken. */
const stampPart = (stamp: StampKind, a: Pt, b: Pt): Part => {
  const id = newPartId(stamp);
  if (stamp === 'breakwire') return { id, kind: 'wire', a, b, broken: true };
  if (stamp === 'resistor') return { id, kind: 'resistor', a, b, resistance: 100, label: '100 Ω' };
  if (stamp === 'led') return { id, kind: 'led', a, b, label: 'LED' };
  if (stamp === 'switch') return { id, kind: 'switch', a, b, closed: false };
  return { id, kind: stamp, a, b };
};
const stampOf = (p: Part): StampKind => (p.kind === 'wire' ? 'breakwire' : p.kind as StampKind);

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
    // components = every saved entry with a non-wire kind, plus broken wires
    // (deliberately-placed break segments live in the palette, not the wire list)
    const comps = (saved ?? []).filter(w => (w.kind && w.kind !== 'wire') || (w.kind === 'wire' && w.broken));
    const restored: Part[] = [];
    for (const c of comps) {
      const p: Part = { id: newPartId(c.kind!), kind: c.kind!, a: c.a, b: c.b };
      if (c.broken) p.broken = true;
      if (c.kind === 'bulb') p.label = nextBulbLabel(restored);
      if (c.kind === 'switch') p.closed = false;
      restored.push(p);
    }
    return restored;
  });
  const [wires, setWires] = useState<Part[]>(() =>
    (saved ?? []).filter(w => (w.kind ?? 'wire') === 'wire' && !w.broken)
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
    [...comps, ...ws].map(p => ({ kind: p.kind, a: p.a, b: p.b, ...(p.broken ? { broken: true } : {}) })), []);

  useEffect(() => {
    if (goalMet && !solvedRef.current) {
      solvedRef.current = true;
      onSolved(3, serialize(placed, wires));
    }
  }, [goalMet, placed, wires, serialize, onSolved]);

  const remaining = useCallback((kind: StampKind) =>
    (ch.palette?.find(p => p.kind === kind)?.count ?? 0) - placed.filter(p => stampOf(p) === kind).length,
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
    const part = stampPart(stamp, { x: candA, y: at.y }, { x: candB, y: at.y });
    if (stamp === 'bulb') part.label = nextBulbLabel(placed);
    if (stamp === 'switch') part.closed = false;
    const next = [...placed, part];
    setPlaced(next);
    onSave(serialize(next, wires));
    if (remaining(stamp) <= 1) {
      setStamp(null);
      setTool('wire');
    }
  }, [stamp, remaining, placed, wires, serialize, onSave]);

  const addWire = useCallback((a: Pt, b: Pt) => {
    const next = [...wires, { id: newWireId(), kind: 'wire' as const, a, b }];
    setWires(next);
    onSave(serialize(placed, next));
  }, [wires, placed, serialize, onSave]);

  const erase = useCallback((id: string) => {
    const nextW = wires.filter(w => w.id !== id);
    const nextP = placed.filter(p => p.id !== id);
    setWires(nextW);
    setPlaced(nextP);
    onSave(serialize(nextP, nextW));
  }, [wires, placed, serialize, onSave]);

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
          <span style={{ fontSize: 12.5, fontWeight: 800, padding: '5px 12px', borderRadius: 12,
            background: goalMet ? '#f0fdf4' : '#f8fafc',
            border: `2px solid ${goalMet ? '#4ade80' : '#cbd5e1'}`,
            color: goalMet ? '#16a34a' : '#94a3b8' }}>
            {goalMet ? '✓ Checker: passing!' : 'Checker: not passing yet'}
          </span>
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

// ─── Detective mode: continuity probing + hidden-fault repair (Unit 5) ────────

function DetectiveChallenge({ unit, ch, alreadySolved, onSolved }: {
  unit: ElecUnit; ch: ElecChallenge; alreadySolved: boolean;
  onSolved: (stars: number) => void;
}) {
  const intro = !!ch.detective?.intro;
  const [parts, setParts] = useState<Part[]>(ch.given);
  const [tool, setTool] = useState<'probe' | 'repair'>('probe');
  const [xray, setXray] = useState(false);
  const [red, setRed] = useState<Pt | null>(null);
  const [black, setBlack] = useState<Pt | null>(null);
  const [reading, setReading] = useState<{ connected: boolean; reached: Set<string> } | null>(null);
  const [probes, setProbes] = useState(0);
  /** Parts caught red-handed: an OL reading taken directly across their ends.
   *  Only condemned parts can be repaired — no guess-spamming the wrench. */
  const [condemned, setCondemned] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [seen, setSeen] = useState({ beep: false, silent: false });
  const dragOrigin = useRef<Pt | null>(null);
  const solvedRef = useRef(alreadySolved);

  const result = useMemo(() => solveCircuit(parts), [parts]);
  const fixedAll = parts.every(p => !p.broken);

  // Only points that belong to the circuit are probe-able
  const circuitPoints = useMemo(() => {
    const set = new Set<string>();
    for (const p of parts) {
      if (p.kind === 'wire') for (const pt of wirePoints(p.a, p.b)) set.add(ptKey(pt));
      else { set.add(ptKey(p.a)); set.add(ptKey(p.b)); }
    }
    return set;
  }, [parts]);

  const finish = useCallback((cost: number) => {
    if (solvedRef.current) return;
    solvedRef.current = true;
    onSolved(intro || ch.par <= 0 ? 3 : cost <= ch.par ? 3 : cost <= ch.par + 3 ? 2 : 1);
  }, [intro, ch.par, onSolved]);

  /** Run a measurement between two points — costs one test. */
  const measure = useCallback((a: Pt, b: Pt) => {
    const test = continuity(parts, a, b);
    setReading({ connected: test.connected, reached: test.reached });
    setProbes(n => n + 1);
    if (!test.connected) {
      // OL directly across a part's own points condemns it (a healthy part
      // would have beeped through itself, so this can never be wrong).
      const ka = ptKey(a);
      const kb = ptKey(b);
      const caught = parts.filter(p => {
        const pts = p.kind === 'wire' ? wirePoints(p.a, p.b).map(ptKey) : [ptKey(p.a), ptKey(p.b)];
        return pts.includes(ka) && pts.includes(kb);
      });
      if (caught.length) {
        setCondemned(prev => new Set([...prev, ...caught.map(p => p.id)]));
        setFlash(null);
      }
    }
    const nextSeen = { beep: seen.beep || test.connected, silent: seen.silent || !test.connected };
    setSeen(nextSeen);
    if (intro && nextSeen.beep && nextSeen.silent) finish(0);
  }, [parts, seen, intro, finish]);

  const handleProbe = useCallback((pt: Pt) => {
    if (!circuitPoints.has(ptKey(pt))) return; // must touch the circuit
    if (!red || (red && black)) {
      // fresh pair: place (or re-place) the red probe first
      setRed(pt);
      setBlack(null);
      setReading(null);
      return;
    }
    if (red.x === pt.x && red.y === pt.y) return;
    setBlack(pt);
    measure(red, pt);
  }, [circuitPoints, red, black, measure]);

  // Grab-and-move an already-placed probe; the measurement re-runs on drop.
  const handleMarkerDrag = useCallback((id: string, at: Pt) => {
    if (!dragOrigin.current) dragOrigin.current = id === 'red' ? red : black;
    setReading(null);
    if (id === 'red') setRed(at); else setBlack(at);
  }, [red, black]);

  const handleMarkerDrop = useCallback((id: string, at: Pt) => {
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    if (!origin) return; // tapped without moving
    const other = id === 'red' ? black : red;
    const valid = circuitPoints.has(ptKey(at)) && !(other && other.x === at.x && other.y === at.y);
    const finalPt = valid ? at : origin; // invalid drop → snap back
    if (id === 'red') setRed(finalPt); else setBlack(finalPt);
    if (!other) return;
    const moved = finalPt.x !== origin.x || finalPt.y !== origin.y;
    if (moved) {
      measure(id === 'red' ? finalPt : other, id === 'red' ? other : finalPt);
    } else {
      // back where it started — restore the reading without charging a test
      const test = continuity(parts, id === 'red' ? finalPt : other, id === 'red' ? other : finalPt);
      setReading({ connected: test.connected, reached: test.reached });
    }
  }, [red, black, circuitPoints, parts, measure]);

  const handleRepair = useCallback((id: string) => {
    const part = parts.find(p => p.id === id);
    if (!part) return;
    if (!condemned.has(id)) {
      setFlash('🔒 The meter hasn’t identified that part yet. Put one probe on EACH end of it — OL straight across a part proves it is the fault.');
      return;
    }
    const next = parts.map(p => (p.id === id ? { ...p, broken: false } : p));
    setParts(next);
    const remaining = next.filter(p => p.broken).length;
    setFlash(remaining > 0
      ? `🔧 Fixed! But the circuit is still dead — ${remaining} more fault to find.`
      : '🔧 Fixed! Power restored!');
    if (remaining === 0) finish(probes);
  }, [parts, condemned, probes, finish]);

  const TOOL_BTN = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: `2px solid ${active ? unit.color : '#cbd5e1'}`,
    background: active ? `${unit.color}18` : '#fff', color: active ? unit.color : '#64748b',
  });

  const probePx = (p: Pt) => ({ x: PAD + p.x * CELL, y: PAD + p.y * CELL });

  // The multimeter lives in a dock to the right of the grid; its screen IS the
  // test result, and its leads run out to wherever the probes touch.
  const DOCK_W = 170;
  const meterX = PAD * 2 + (ch.gridW ?? 10) * CELL + 4;
  const meterState: MeterState = reading ? (reading.connected ? 'beep' : 'open') : red ? 'waiting' : 'idle';

  const sockets = meterSockets(meterX, 16);
  const overlay = (
    <g pointerEvents="none">
      {reading?.connected && [...reading.reached].map(k => {
        const [x, y] = k.split(',').map(Number);
        const px = probePx({ x, y });
        return <circle key={k} cx={px.x} cy={px.y} r={5} fill="rgba(34,197,94,0.55)" />;
      })}
      <MultimeterView x={meterX} y={16} state={meterState} />
      {/* condemned parts wear a ⚠ tag until repaired */}
      {parts.filter(p => condemned.has(p.id) && p.broken).map(p => {
        const A = probePx(p.a);
        const B = probePx(p.b);
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        return (
          <g key={`c${p.id}`} className="elab-pulse">
            <rect x={mx - 44} y={my + 18} width={88} height={20} rx={10} fill="#fef2f2" stroke="#dc2626" strokeWidth={2} />
            <text x={mx} y={my + 32} textAnchor="middle" fontSize={11} fontWeight={800} fill="#dc2626">⚠ fault found</text>
          </g>
        );
      })}
      {red && <ProbePen x={probePx(red).x} y={probePx(red).y} color="#dc2626" lean={38} badge="1" leadFrom={sockets.red} />}
      {black && <ProbePen x={probePx(black).x} y={probePx(black).y} color="#1f2937" lean={22} badge="2" leadFrom={sockets.black} />}
    </g>
  );

  const dragMarkers = [
    ...(red ? [{ id: 'red', at: red }] : []),
    ...(black ? [{ id: 'black', at: black }] : []),
  ];

  return (
    <div>
      {flash && !fixedAll && (
        <div style={{ ...CARD, padding: '10px 18px', marginBottom: 14, background: '#fffbeb', border: '3px solid #f59e0b', fontSize: 13.5, fontWeight: 700, color: '#92400e' }}>
          {flash}
        </div>
      )}
      <div style={{ ...CARD, padding: 18 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={TOOL_BTN(tool === 'probe')} onClick={() => setTool('probe')}>🎧 Probe</button>
          {!intro && <button style={TOOL_BTN(tool === 'repair')} onClick={() => setTool('repair')}>🔧 Repair</button>}
          {ch.breadboard && (
            <button style={TOOL_BTN(xray)} onClick={() => setXray(x => !x)}>
              {xray ? '🎨 Normal view' : '🩻 X-ray view'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#64748b' }}>
            Tests used: {probes}{!intro && ch.par > 0 && ` · ⭐⭐⭐ ≤ ${ch.par}`}
          </span>
        </div>
        <CircuitBoard
          parts={parts}
          result={result}
          tool={tool}
          interactive
          allowSwitch={false}
          gridW={ch.gridW ?? 10}
          gridH={ch.gridH ?? 6}
          breadboard={ch.breadboard ? { xray } : undefined}
          onProbe={handleProbe}
          dragMarkers={dragMarkers}
          onMarkerDrag={handleMarkerDrag}
          onMarkerDrop={handleMarkerDrop}
          onPartTap={handleRepair}
          overlay={overlay}
          dockWidth={DOCK_W}
        />
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          {tool === 'probe'
            ? red && black
              ? 'Grab either probe and drag it to a new point to keep testing (each move counts as a test) — or tap an empty point to start a fresh pair.'
              : red
                ? 'Now tap a second point for the black probe — then read the meter screen.'
                : 'Tap a point on the circuit to place the red probe. The meter screen shows the result. (It never beeps through a battery!)'
            : 'Tap a part marked "⚠ fault found" to repair it. Parts must be caught by the meter first — OL straight across their two ends.'}
        </div>
      </div>
    </div>
  );
}

// ─── Meters mode: the Ohm's Law lab bench (Unit 6) ────────────────────────────

/** The classic V / I·R memory triangle: cover the unknown, read the rest. */
function OhmTriangle({ size = 110 }: { size?: number }) {
  const w = size, h = size * 0.82;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      <path d={`M ${w / 2} 4 L ${w - 4} ${h - 4} L 4 ${h - 4} Z`} fill="#fffbeb" stroke="#f59e0b" strokeWidth={2.5} strokeLinejoin="round" />
      <line x1={w * 0.22} y1={h * 0.62} x2={w * 0.78} y2={h * 0.62} stroke="#f59e0b" strokeWidth={2} />
      <line x1={w / 2} y1={h * 0.62} x2={w / 2} y2={h - 6} stroke="#f59e0b" strokeWidth={2} />
      <text x={w / 2} y={h * 0.5} textAnchor="middle" fontSize={22} fontWeight={900} fill="#92400e" fontFamily="monospace">V</text>
      <text x={w * 0.36} y={h * 0.9} textAnchor="middle" fontSize={20} fontWeight={900} fill="#92400e" fontFamily="monospace">I</text>
      <text x={w * 0.64} y={h * 0.9} textAnchor="middle" fontSize={20} fontWeight={900} fill="#92400e" fontFamily="monospace">R</text>
    </svg>
  );
}

function MetersChallenge({ unit, ch, alreadySolved, onSolved }: {
  unit: ElecUnit; ch: ElecChallenge; alreadySolved: boolean;
  onSolved: (stars: number) => void;
}) {
  const cfg = ch.meters!;
  const plan = cfg.requirePlan;
  const [phase, setPhase] = useState<'plan' | 'dial'>(plan && !alreadySolved ? 'plan' : 'dial');
  const [pv, setPv] = useState('');
  const [pr, setPr] = useState('');
  const [planWrong, setPlanWrong] = useState<string | null>(null);
  const [planMistakes, setPlanMistakes] = useState(0);
  const [planned, setPlanned] = useState<{ v?: number; r?: number } | null>(null);
  const [volts, setVolts] = useState(cfg.vLocked ?? cfg.vRange[0]);
  const [ohms, setOhms] = useState(cfg.rLocked ?? cfg.rRange[1]);
  const solvedRef = useRef(alreadySolved);

  const parts = useMemo<Part[]>(() => [
    { id: 'bat', kind: 'battery', a: { x: 1, y: 4 }, b: { x: 9, y: 4 }, fixed: true, voltage: volts, internalR: 0 },
    { id: 'res', kind: 'resistor', a: { x: 3, y: 1 }, b: { x: 7, y: 1 }, fixed: true, resistance: ohms, label: `${ohms} Ω` },
    { id: 'w1', kind: 'wire', a: { x: 1, y: 4 }, b: { x: 1, y: 1 }, fixed: true },
    { id: 'w2', kind: 'wire', a: { x: 1, y: 1 }, b: { x: 3, y: 1 }, fixed: true },
    { id: 'w3', kind: 'wire', a: { x: 9, y: 4 }, b: { x: 9, y: 1 }, fixed: true },
    { id: 'w4', kind: 'wire', a: { x: 9, y: 1 }, b: { x: 7, y: 1 }, fixed: true },
  ], [volts, ohms]);

  const result = useMemo(() => solveCircuit(parts), [parts]);
  const amps = Math.abs(result.parts['res']?.current ?? 0);
  const vAcross = Math.abs(result.parts['res']?.voltage ?? 0);
  const onTarget = Math.abs(amps - cfg.targetCurrent) <= cfg.tolerance;

  useEffect(() => {
    if (onTarget && phase === 'dial' && !solvedRef.current) {
      solvedRef.current = true;
      onSolved(planMistakes === 0 ? 3 : planMistakes <= 2 ? 2 : 1);
    }
  }, [onTarget, phase, planMistakes, onSolved]);

  const nearlyEq = (a: number, b: number) => Math.abs(a - b) <= 0.011;
  const onStep = (val: number, step: number) => Math.abs(Math.round(val / step) * step - val) < 1e-9;

  const checkPlan = () => {
    if (plan === 'r') {
      const val = Number(pr);
      if (!isFinite(val) || pr.trim() === '') return;
      if (nearlyEq(val, (cfg.vLocked ?? 0) / cfg.targetCurrent)) {
        setPlanned({ r: val });
        setPhase('dial');
        setPlanWrong(null);
      } else {
        setPlanMistakes(m => m + 1);
        setPlanWrong('Not quite. Cover the R on the triangle — what is left is V ÷ I. Try the division again!');
      }
    } else if (plan === 'v') {
      const val = Number(pv);
      if (!isFinite(val) || pv.trim() === '') return;
      if (nearlyEq(val, cfg.targetCurrent * (cfg.rLocked ?? 0))) {
        setPlanned({ v: val });
        setPhase('dial');
        setPlanWrong(null);
      } else {
        setPlanMistakes(m => m + 1);
        setPlanWrong('Not quite. Cover the V on the triangle — what is left is I × R. Try the multiplication again!');
      }
    } else if (plan === 'both') {
      const v = Number(pv);
      const r = Number(pr);
      if (!isFinite(v) || !isFinite(r) || pv.trim() === '' || pr.trim() === '') return;
      if (v < cfg.vRange[0] || v > cfg.vRange[1] || r < cfg.rRange[0] || r > cfg.rRange[1] || !onStep(v, cfg.vStep) || !onStep(r, cfg.rStep)) {
        setPlanMistakes(m => m + 1);
        setPlanWrong(`Pick values the dials can reach: V from ${cfg.vRange[0]} to ${cfg.vRange[1]} in steps of ${cfg.vStep}, R from ${cfg.rRange[0]} to ${cfg.rRange[1]} in whole ohms.`);
      } else if (Math.abs(v / r - cfg.targetCurrent) <= cfg.tolerance) {
        setPlanned({ v, r });
        setPhase('dial');
        setPlanWrong(null);
      } else {
        setPlanMistakes(m => m + 1);
        setPlanWrong(`Check the law: I = V ÷ R = ${v} ÷ ${r} = ${(v / r).toFixed(2)} A, but the motor needs ${cfg.targetCurrent.toFixed(2)} A. Adjust one of your numbers.`);
      }
    }
  };

  const VALUE_TILE = (label: string, sub: string, content: React.ReactNode, accent: string): React.ReactNode => (
    <div style={{ flex: '1 1 130px', minWidth: 120, borderRadius: 12, border: `3px solid ${accent}`, background: '#fff', padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#1f2937', fontFamily: 'monospace', margin: '4px 0 2px' }}>{content}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8' }}>{sub}</div>
    </div>
  );

  const planInput = (value: string, setValue: (s: string) => void, unitLabel: string) => (
    <span>
      <input type="number" inputMode="decimal" step="any" value={value}
        onChange={e => { setValue(e.target.value); setPlanWrong(null); }}
        onKeyDown={e => { if (e.key === 'Enter') checkPlan(); }}
        placeholder="?"
        style={{ width: 74, padding: '4px 6px', fontSize: 19, fontWeight: 800, fontFamily: 'monospace', textAlign: 'center',
          border: `2px solid ${planWrong ? '#ef4444' : unit.color}`, borderRadius: 8, color: '#1f2937' }} />
      <span style={{ fontSize: 15, fontWeight: 800, color: '#475569', marginLeft: 4 }}>{unitLabel}</span>
    </span>
  );

  // ── Phase 1: do the math before the dials unlock ────────────────────────────
  if (phase === 'plan') {
    return (
      <div style={{ maxWidth: 760 }}>
        <div style={{ ...CARD, padding: '24px 28px' }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#1f2937', marginBottom: 4 }}>🧮 Step 1 — Work it out with Ohm&apos;s Law</div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
            The dials are locked until your math is done. Fill in the missing value{plan === 'both' ? 's' : ''}:
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 380px' }}>
              {VALUE_TILE('V — Voltage', plan === 'v' || plan === 'both' ? 'the unknown push' : 'given · locked',
                plan === 'v' || plan === 'both' ? planInput(pv, setPv, 'V') : `${cfg.vLocked} V`,
                plan === 'v' || plan === 'both' ? unit.color : '#64748b')}
              {VALUE_TILE('I — Current', 'the target', `${cfg.targetCurrent.toFixed(2)} A`, '#16a34a')}
              {VALUE_TILE('R — Resistance', plan === 'r' || plan === 'both' ? 'the unknown push-back' : 'given · locked',
                plan === 'r' || plan === 'both' ? planInput(pr, setPr, 'Ω') : `${cfg.rLocked} Ω`,
                plan === 'r' || plan === 'both' ? unit.color : '#64748b')}
            </div>
            <div style={{ textAlign: 'center' }}>
              <OhmTriangle />
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginTop: 4 }}>cover the unknown!</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={checkPlan} style={BTN(unit.color)}>Check my math</button>
            <div style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 800, color: '#64748b' }}>
              I = V ÷ R &nbsp;·&nbsp; V = I × R &nbsp;·&nbsp; R = V ÷ I
            </div>
          </div>
          {planWrong && (
            <div style={{ marginTop: 12, fontSize: 13.5, color: '#92400e', background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10, padding: '10px 14px', lineHeight: 1.55 }}>
              {planWrong}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Phase 2: dial in the plan and watch the meters agree ────────────────────
  const METER: React.CSSProperties = {
    background: '#0f172a', borderRadius: 12, padding: '10px 16px', textAlign: 'center', minWidth: 130,
  };

  const slider = (label: string, value: number, unitLabel: string, range: [number, number], step: number,
    locked: number | undefined, onChange: (v: number) => void) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 900, color: locked !== undefined ? '#94a3b8' : unit.color }}>
          {value} {unitLabel}{locked !== undefined && ' 🔒'}
        </span>
      </div>
      {locked !== undefined ? (
        <div style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600 }}>Locked for this challenge — solve for the other dial!</div>
      ) : (
        <input type="range" min={range[0]} max={range[1]} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: unit.color }} />
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ ...CARD, padding: 18, flex: '1 1 460px', minWidth: 380 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={METER}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Ammeter — flow</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: onTarget ? '#4ade80' : '#fbbf24', fontFamily: 'monospace' }}>
              {amps.toFixed(2)} A
            </div>
          </div>
          <div style={METER}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Voltmeter — push</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#e2e8f0', fontFamily: 'monospace' }}>
              {vAcross.toFixed(1)} V
            </div>
          </div>
        </div>
        <CircuitBoard parts={parts} result={result} interactive={false} allowSwitch={false} gridW={10} gridH={5} />
      </div>
      <div style={{ ...CARD, padding: 20, flex: '1 1 300px', minWidth: 280 }}>
        {planned && (
          <div style={{ background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 12, padding: '8px 14px', marginBottom: 12, fontSize: 13, fontWeight: 800, color: '#166534', textAlign: 'center' }}>
            📋 Your plan: {planned.v !== undefined && `V = ${planned.v} V`}{planned.v !== undefined && planned.r !== undefined && ' · '}{planned.r !== undefined && `R = ${planned.r} Ω`} — now dial it in!
          </div>
        )}
        <div style={{ background: `${unit.color}12`, border: `2px solid ${unit.color}`, borderRadius: 12, padding: '10px 14px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px' }}>🎯 Target</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#1f2937', fontFamily: 'monospace' }}>{cfg.targetCurrent.toFixed(2)} A</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: onTarget ? '#16a34a' : amps < cfg.targetCurrent ? '#b45309' : '#dc2626' }}>
            {onTarget ? '✓ Locked in!' : amps < cfg.targetCurrent - cfg.tolerance ? 'Too little current — more push or less push-back' : 'Too much current — less push or more push-back'}
          </div>
        </div>
        {slider('Voltage dial (the push)', volts, 'V', cfg.vRange, cfg.vStep, cfg.vLocked, setVolts)}
        {slider('Resistance dial (the push-back)', ohms, 'Ω', cfg.rRange, cfg.rStep, cfg.rLocked, setOhms)}
        <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
          <OhmTriangle size={72} />
          {/* show-your-work: every line keeps I on the left, same columns throughout */}
          <div style={{ fontFamily: 'monospace', fontWeight: 800, lineHeight: 1.5 }}>
            <div style={{ fontSize: 16, color: '#1f2937' }}>I = V ÷ R</div>
            <div style={{ fontSize: 16, color: '#92400e' }}>I = {volts} ÷ {ohms}</div>
            <div style={{ fontSize: 16, color: '#16a34a' }}>I = {(volts / ohms).toFixed(2)} A</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compute mode: Ohm's Law worksheet with meter confirmation (Unit 6) ───────

function ComputeChallenge({ unit, ch, alreadySolved, onSolved }: {
  unit: ElecUnit; ch: ElecChallenge; alreadySolved: boolean;
  onSolved: (stars: number) => void;
}) {
  const rounds = ch.compute!;
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');
  const [state, setState] = useState<'ask' | 'correct' | 'wrong'>('ask');
  const [mistakes, setMistakes] = useState(0);
  const solvedRef = useRef(alreadySolved);

  const round = rounds[Math.min(idx, rounds.length - 1)];
  const done = idx >= rounds.length;

  const check = () => {
    const val = Number(input);
    if (!isFinite(val) || input.trim() === '') return;
    if (Math.abs(val - round.answer) <= 0.011) {
      setState('correct');
    } else {
      setState('wrong');
      setMistakes(m => m + 1);
    }
  };

  const next = () => {
    const nextIdx = idx + 1;
    setIdx(nextIdx);
    setInput('');
    setState('ask');
    if (nextIdx >= rounds.length && !solvedRef.current) {
      solvedRef.current = true;
      onSolved(mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', maxWidth: 900 }}>
      <div style={{ ...CARD, padding: '24px 28px', flex: '1 1 420px', minWidth: 360 }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>🧮</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1f2937' }}>Worksheet complete!</div>
            <div style={{ fontSize: 13.5, color: '#64748b', marginTop: 4 }}>
              {mistakes === 0 ? 'Every answer right the first time — the meters never disagreed with you once.' : 'The meters kept you honest — that is exactly what they are for.'}
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
              Problem {idx + 1} of {rounds.length}
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: '#1f2937', lineHeight: 1.55, marginBottom: 16 }}>{round.prompt}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={input}
                disabled={state === 'correct'}
                onChange={e => { setInput(e.target.value); if (state === 'wrong') setState('ask'); }}
                onKeyDown={e => { if (e.key === 'Enter' && state !== 'correct') check(); }}
                placeholder="your answer"
                style={{ flex: 1, maxWidth: 200, padding: '12px 14px', fontSize: 18, fontWeight: 800, fontFamily: 'monospace',
                  border: `2px solid ${state === 'correct' ? '#22c55e' : state === 'wrong' ? '#ef4444' : '#cbd5e1'}`,
                  borderRadius: 10, color: '#1f2937', background: '#fff' }}
              />
              <span style={{ fontSize: 18, fontWeight: 900, color: '#475569' }}>{round.unit}</span>
              {state !== 'correct' ? (
                <button onClick={check} style={BTN(unit.color)}>Check</button>
              ) : (
                <button onClick={next} style={BTN('#16a34a')}>{idx + 1 >= rounds.length ? 'Finish →' : 'Next →'}</button>
              )}
            </div>
            {state === 'correct' && (
              <div style={{ fontSize: 13.5, color: '#166534', background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 10, padding: '10px 14px', lineHeight: 1.55 }}>
                ✓ {round.explain}
              </div>
            )}
            {state === 'wrong' && (
              <div style={{ fontSize: 13.5, color: '#92400e', background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10, padding: '10px 14px', lineHeight: 1.55 }}>
                Not quite — remember the three faces of Ohm&apos;s Law: I = V ÷ R, &nbsp;V = I × R, &nbsp;R = V ÷ I. Try again!
              </div>
            )}
            <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
              The bench meters will confirm your answer — no guessing needed, just the law.
            </div>
          </>
        )}
      </div>
      <div style={{ ...CARD, padding: '18px 20px', flex: '0 1 240px', minWidth: 210, textAlign: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>
          Your helper
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}><OhmTriangle /></div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#92400e', margin: '4px 0 10px' }}>cover the unknown!</div>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: '#374151', lineHeight: 1.7, textAlign: 'center' }}>
          <div>I = V ÷ R</div>
          <div>V = I × R</div>
          <div>R = V ÷ I</div>
        </div>
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
              <div style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>🎓 Electronics Lab complete!</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Circuits, series, parallel, switches, troubleshooting, Ohm&apos;s Law, and the breadboard — you built and understood every one.
                Take what you know to a real breadboard: the workshop is wherever you are now.
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

  // Admin-only review resets: wipe one challenge (or one unit quiz) locally and
  // in the cloud so a changed activity can be replayed from scratch.
  const admin = isAdmin(session?.user?.role);
  const [resetNonce, setResetNonce] = useState(0);

  const resetChallenge = useCallback((ui: number, ci: number) => {
    if (!window.confirm(`Reset your progress on Unit ${UNITS[ui].id}, Challenge ${ci + 1}? (Admin review only — clears completion, stars, and your saved build.)`)) return;
    const key = chalKey(ui, ci);
    updateProgress(p => {
      const completedChallenges = { ...p.completedChallenges };
      const stars = { ...p.stars };
      const savedWires = { ...p.savedWires };
      delete completedChallenges[key];
      delete stars[key];
      delete savedWires[key];
      return { ...p, completedChallenges, stars, savedWires };
    });
    setResetNonce(n => n + 1);
    if (userId) deleteCloudProgress(ui, ci);
  }, [updateProgress, userId]);

  const resetQuiz = useCallback((ui: number) => {
    if (!window.confirm(`Reset your quiz result for Unit ${UNITS[ui].id}? (Admin review only — later units re-lock until you pass it again.)`)) return;
    updateProgress(p => {
      const completedUnits = { ...p.completedUnits };
      delete completedUnits[ui];
      return { ...p, completedUnits };
    });
    if (userId) deleteCloudProgress(ui, null);
  }, [updateProgress, userId]);

  const lockedLevels = new Set(lockedChallenges.filter(lc => lc.challenge_idx === -1).map(lc => lc.level_idx));

  if (phase.tag === 'overview') {
    return <Overview progress={progress} assignedUnits={assignedUnits} lockedLevels={lockedLevels}
      onSelect={ui => setPhase({ tag: 'intro', ui })}
      onResetQuiz={admin ? resetQuiz : undefined} />;
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
    // Bump on admin reset so the active challenge component remounts fresh.
    const mountKey = `${key}:${resetNonce}`;
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
        onJump={newCi => setPhase({ tag: 'challenge', ui, ci: newCi })}
        onAdminReset={admin && solved ? () => resetChallenge(ui, ci) : undefined}>
        {ch.mode === 'build' && (
          <BuildChallenge key={mountKey} unit={unit} ch={ch}
            savedWires={progress.savedWires[key]}
            alreadySolved={solved}
            onSolved={(stars, wires) => handleSolve(ui, ci, stars, wires)}
            onWiresChange={wires => handleWiresChange(ui, ci, wires)} />
        )}
        {ch.mode === 'materials' && (
          <MaterialsChallenge key={mountKey} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
        )}
        {ch.mode === 'predict' && (
          <PredictChallenge key={mountKey} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
        )}
        {ch.mode === 'freebuild' && (
          <FreeBuildChallenge key={mountKey} unit={unit} ch={ch}
            saved={progress.savedWires[key]}
            alreadySolved={solved}
            onSolved={(stars, parts) => handleSolve(ui, ci, stars, parts)}
            onSave={parts => handleWiresChange(ui, ci, parts)} />
        )}
        {ch.mode === 'detective' && (
          <DetectiveChallenge key={mountKey} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
        )}
        {ch.mode === 'meters' && (
          <MetersChallenge key={mountKey} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
        )}
        {ch.mode === 'compute' && (
          <ComputeChallenge key={mountKey} unit={unit} ch={ch} alreadySolved={solved}
            onSolved={stars => handleSolve(ui, ci, stars)} />
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
