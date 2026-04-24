'use client';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import SiteHeader from '@/app/components/SiteHeader';
import { UNITS, chalKey, countCompleted, BlockUnit } from './units';
import { blocksForLevel, BLOCK_MAP, BlockDef } from './engine/blocks';
import { ScriptNode, appendNode, deleteNode, updateParam, moveNode, MazeRuntime } from './engine/runtime';
import { THEMES } from './engine/themes';
import MazeBoard, { MazeBoardHandle } from './components/MazeBoard';

// ─── Progress ─────────────────────────────────────────────────────────────────

interface Progress {
  completedChallenges: Record<string, boolean>;
  completedUnits: Record<number, boolean>;
  savedScripts: Record<string, ScriptNode[]>;
}
function emptyProgress(): Progress {
  return { completedChallenges: {}, completedUnits: {}, savedScripts: {} };
}
const STORAGE_KEY = 'block_lab_progress';
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
async function syncToCloud(_userId: string, ui: number, ci: number | null, completed: boolean, savedScript?: ScriptNode[]) {
  await fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'block-lab', level_idx: ui, challenge_idx: ci ?? -1,
      completed, saved_code: savedScript ? JSON.stringify(savedScript) : null,
    }),
  });
}
async function loadFromCloud(_userId: string): Promise<Progress> {
  const res = await fetch('/api/progress?tool=block-lab');
  const data = res.ok ? await res.json() : [];
  const p = emptyProgress();
  for (const row of data ?? []) {
    if (row.challenge_idx !== null && row.challenge_idx >= 0) {
      const key = chalKey(row.level_idx, row.challenge_idx);
      if (row.completed) p.completedChallenges[key] = true;
      if (row.saved_code) { try { p.savedScripts[key] = JSON.parse(row.saved_code); } catch { /* ignore */ } }
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

// ─── Shared chrome ────────────────────────────────────────────────────────────

function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0c1120' }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: '#1a2540', border: '1px solid rgba(99,179,237,0.15)',
  borderRadius: 20, boxShadow: '0 8px 28px rgba(0,0,0,0.5)',
};

// ─── Markdown renderer (same as Python) ───────────────────────────────────────

function LessonPanel({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let k = 0;
  let tableRows: React.ReactNode[] = [];
  const flushTable = () => {
    if (!tableRows.length) return;
    const head = tableRows.filter(r => (r as React.ReactElement).type === 'thead');
    const body = tableRows.filter(r => (r as React.ReactElement).type !== 'thead');
    nodes.push(<table key={`t${k++}`} style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0', color: '#222' }}>
      {head}{<tbody>{body}</tbody>}
    </table>);
    tableRows = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.startsWith('# '))  { flushTable(); nodes.push(<h2 key={k++} style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', margin: '18px 0 6px' }}>{raw.slice(2)}</h2>); continue; }
    if (raw.startsWith('## ')) { flushTable(); nodes.push(<h3 key={k++} style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', margin: '14px 0 4px' }}>{raw.slice(3)}</h3>); continue; }
    if (raw.startsWith('> '))  { flushTable(); nodes.push(<blockquote key={k++} style={{ borderLeft: '4px solid #3b82f6', paddingLeft: 12, margin: '8px 0', color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>{raw.slice(2)}</blockquote>); continue; }
    if (raw.startsWith('|')) {
      const cells = raw.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) { tableRows.push(<thead key={k++} />); continue; }
      const isHead = tableRows.length === 1 && (tableRows[0] as React.ReactElement).type === 'thead';
      if (isHead) {
        tableRows[0] = <thead key={k++}><tr>{cells.map((c, j) => <th key={j} style={{ textAlign: 'left', padding: '6px 10px', background: 'rgba(99,179,237,0.12)', borderBottom: '1px solid rgba(99,179,237,0.2)', fontSize: 13, color: '#e2e8f0' }}>{c}</th>)}</tr></thead>;
      } else {
        tableRows.push(<tr key={k++}>{cells.map((c, j) => <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 13, color: '#cbd5e1', fontFamily: c.startsWith('`') ? 'monospace' : 'inherit' }}>{c.replace(/`/g, '')}</td>)}</tr>);
      }
      continue;
    }
    flushTable();
    if (raw === '') { nodes.push(<div key={k++} style={{ height: 8 }} />); continue; }
    const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, j) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={j} style={{ color: '#e2e8f0' }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith('`') && p.endsWith('`')) return <code key={j} style={{ background: 'rgba(99,179,237,0.15)', color: '#93c5fd', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{p.slice(1, -1)}</code>;
      return p;
    });
    nodes.push(<p key={k++} style={{ margin: '4px 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>{parts}</p>);
  }
  flushTable();
  return <div style={{ padding: '16px 20px' }}>{nodes}</div>;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function Overview({ progress, onSelect, assignedUnits }: {
  progress: Progress;
  onSelect: (ui: number) => void;
  assignedUnits: number[] | null;
}) {
  const assignedSet = assignedUnits ? new Set(assignedUnits) : null;
  return (
    <SiteChrome>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ ...CARD, padding: '18px 24px', marginBottom: 28 }}>
          <Link href="/tools/code-lab" style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>← Code Lab</Link>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>Block Lab</h1>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', margin: 0 }}>
            Learn to code by guiding STEM Bot through maze challenges. Complete each unit to unlock the next.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {UNITS.map((unit, ui) => {
            const done = countCompleted(ui, progress.completedChallenges);
            const total = unit.challenges.length;
            // Teacher-locked if teacher has configured this tool but hasn't assigned this unit
            const teacherLocked = assignedSet !== null && !assignedSet.has(ui);
            const locked = teacherLocked || (ui > 0 && !progress.completedUnits[ui - 1]);
            const pct = total ? Math.round(done / total * 100) : 0;
            const theme = THEMES[unit.theme];
            return (
              <div key={unit.id}
                onClick={() => !locked && onSelect(ui)}
                style={{ ...CARD, width: 248, padding: 24, cursor: locked ? 'not-allowed' : 'pointer', opacity: locked ? 0.55 : 1, position: 'relative', overflow: 'hidden', transition: 'transform 150ms ease, box-shadow 150ms ease' }}
                onMouseEnter={e => { if (!locked) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.22)'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = (CARD as { boxShadow: string }).boxShadow; }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: unit.color, borderRadius: '20px 20px 0 0' }} />
                {locked && <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 18 }}>🔒</div>}
                {progress.completedUnits[ui] && <div style={{ position: 'absolute', top: 12, right: 14, fontSize: 18 }}>✅</div>}
                <div style={{ fontSize: 13, marginTop: 8 }}>{theme.emoji}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 4 }}>Unit {unit.id}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#e2e8f0', margin: '4px 0 6px' }}>{unit.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>{unit.tagline}</div>
                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: unit.color, borderRadius: 20, transition: 'width 400ms ease' }} />
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 5 }}>{done} / {total} challenges</div>
              </div>
            );
          })}
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Unit intro ───────────────────────────────────────────────────────────────

function UnitIntro({ ui, onStart }: { ui: number; onStart: () => void }) {
  const unit = UNITS[ui];
  return (
    <SiteChrome>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px' }}>
        <button onClick={() => history.back()} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
          ← Back to Units
        </button>
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: unit.color, padding: '20px 28px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unit {unit.id}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', marginTop: 2 }}>{unit.title}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>{unit.tagline}</div>
          </div>
          <div style={{ padding: '0 28px 28px' }}>
            <LessonPanel text={unit.introNotes} />
            {unit.newBlocks.length > 0 && (
              <div style={{ background: 'rgba(99,179,237,0.06)', border: '1px solid rgba(99,179,237,0.2)', borderRadius: 14, padding: '16px 20px', margin: '16px 0' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>New Blocks This Unit</div>
                {unit.newBlocks.map(b => (
                  <div key={b.blockId} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'flex-start' }}>
                    <span style={{ background: BLOCK_MAP[b.blockId]?.color ?? '#3b82f6', color: '#fff', padding: '2px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{b.label}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{b.desc}</span>
                  </div>
                ))}
              </div>
            )}
            <button onClick={onStart} style={{ marginTop: 20, padding: '14px 36px', background: unit.color, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'block', width: '100%' }}>
              Begin Unit {unit.id} — Challenge 1 →
            </button>
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Script helpers ───────────────────────────────────────────────────────────

function nodeId() { return Math.random().toString(36).slice(2, 9); }

function flatNodes(node: ScriptNode): ScriptNode[] {
  return [node, ...(node.children ?? []).flatMap(flatNodes)];
}

// ─── Challenge view ───────────────────────────────────────────────────────────

function ChallengeView({
  ui, ci, progress,
  onSolve, onNext, onFinish, onBack, onJump,
}: {
  ui: number; ci: number; progress: Progress;
  onSolve: (script: ScriptNode[]) => void;
  onNext: (script: ScriptNode[]) => void;
  onFinish: (script: ScriptNode[]) => void;
  onBack: () => void;
  onJump: (ci: number, script: ScriptNode[]) => void;
}) {
  const unit = UNITS[ui];
  const ch = unit.challenges[ci];
  const isLast = ci === unit.challenges.length - 1;
  const availableBlocks = blocksForLevel(ui * 4); // desert=0, forest=4, space=8
  const theme = THEMES[unit.theme];

  const [leftTab, setLeftTab] = useState<'script' | 'notes'>('script');
  const [script, setScript] = useState<ScriptNode[]>(() => progress.savedScripts[chalKey(ui, ci)] ?? []);
  const [insertTargetId, setInsertTargetId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [solved, setSolved] = useState(progress.completedChallenges[chalKey(ui, ci)] ?? false);
  const [bumpFlash, setBumpFlash] = useState(false);

  const boardRef = useRef<MazeBoardHandle>(null);
  const scriptRef = useRef(script);
  useEffect(() => { scriptRef.current = script; }, [script]);

  // Reset when challenge changes
  useEffect(() => {
    setScript(progress.savedScripts[chalKey(ui, ci)] ?? []);
    setInsertTargetId(null);
    setRunning(false);
    setSolved(progress.completedChallenges[chalKey(ui, ci)] ?? false);
    setBumpFlash(false);
    setLeftTab('script');
  }, [ui, ci]);

  const handleAddBlock = useCallback((blockId: string, params: Record<string, number | string>) => {
    const def = availableBlocks.find(b => b.id === blockId);
    const newNode: ScriptNode = {
      id: nodeId(), blockId, params,
      children: def?.hasBody ? [] : undefined,
    };
    setScript(prev => {
      const next = appendNode(prev, insertTargetId, newNode);
      scriptRef.current = next;
      return next;
    });
    if (def?.hasBody) setInsertTargetId(newNode.id);
  }, [insertTargetId, availableBlocks]);

  const handleRun = useCallback(() => {
    if (running) return;
    setRunning(true);
    setBumpFlash(false);
    boardRef.current?.run(scriptRef.current);
  }, [running]);

  const handleStop = useCallback(() => {
    boardRef.current?.stop();
    setRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    boardRef.current?.reset();
    setRunning(false);
    setBumpFlash(false);
  }, []);

  const handleClear = useCallback(() => {
    handleReset();
    setScript([]);
    setInsertTargetId(null);
    scriptRef.current = [];
  }, [handleReset]);

  const handleWin = useCallback(() => {
    setRunning(false);
    setSolved(true);
    onSolve(scriptRef.current);
  }, [onSolve]);

  const handleBump = useCallback(() => {
    setBumpFlash(true);
    setTimeout(() => setBumpFlash(false), 500);
  }, []);

  const TAB = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
    borderBottom: active ? `3px solid ${unit.color}` : '3px solid transparent',
    background: 'transparent', color: active ? unit.color : '#64748b', transition: 'color 120ms',
  });

  const insertLabel = insertTargetId
    ? `Inside: ${BLOCK_MAP[flatNodes({ id: '', blockId: '', params: {}, children: script } as ScriptNode).find(n => n.id === insertTargetId)?.blockId ?? '']?.label ?? '…'}`
    : 'Main script';

  // Grouped blocks
  const grouped = availableBlocks.reduce<Record<string, BlockDef[]>>((acc, b) => {
    (acc[b.category] ??= []).push(b); return acc;
  }, {});
  const CAT_LABELS: Record<string, string> = { motion: 'Motion', control: 'Control' };

  return (
    <SiteChrome>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 28px 32px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }}>← Units</button>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: unit.color }}>{theme.emoji} Unit {unit.id} — {unit.title}</span>
          <span style={{ fontSize: 13, color: '#64748b' }}>Challenge {ci + 1} of {unit.challenges.length}</span>
        </div>

        {/* Challenge dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {unit.challenges.map((_, idx) => {
            const done = progress.completedChallenges[chalKey(ui, idx)];
            const active = idx === ci;
            return (
              <div key={idx}
                onClick={() => onJump(idx, scriptRef.current)}
                style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: active ? unit.color : done ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.07)',
                  color: active ? '#fff' : done ? '#4ade80' : '#64748b',
                  border: `2px solid ${active ? unit.color : done ? '#4ade80' : 'rgba(255,255,255,0.18)'}` }}>
                {done ? '✓ ' : ''}{idx + 1}
              </div>
            );
          })}
        </div>

        {/* Two-panel layout */}
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Left panel: Script / Notes */}
          <div style={{ ...CARD, flex: '0 0 460px', minWidth: 300, display: 'flex', flexDirection: 'column', height: 620, overflow: 'hidden' }}>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', flexShrink: 0 }}>
              <button style={TAB(leftTab === 'script')} onClick={() => setLeftTab('script')}>Script</button>
              <button style={TAB(leftTab === 'notes')} onClick={() => setLeftTab('notes')}>Lesson / Notes</button>
            </div>

            {/* Script tab */}
            <div style={{ flex: 1, display: leftTab === 'script' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Block palette */}
              <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Add Blocks</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {Object.entries(grouped).map(([cat, defs]) => (
                    <div key={cat} style={{ display: 'contents' }}>
                      {defs.map(b => (
                        <button key={b.id} disabled={running}
                          onClick={() => handleAddBlock(b.id, Object.fromEntries((b.params ?? []).map(p => [p.key, p.default])))}
                          style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8, border: 'none', color: '#fff', background: b.color, cursor: 'pointer', opacity: running ? 0.45 : 1, transition: 'all 100ms' }}
                        >{b.label}{b.hasBody ? ' {…}' : ''}</button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Insertion indicator */}
              <div style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>Adding to: <strong style={{ color: '#e2e8f0' }}>{insertLabel}</strong></span>
                {insertTargetId && (
                  <button onClick={() => setInsertTargetId(null)} style={{ fontSize: 11, color: unit.color, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>↑ Back to main</button>
                )}
              </div>

              {/* Script list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {script.length === 0 ? (
                  <div style={{ color: '#4a5568', fontSize: 13, fontStyle: 'italic', textAlign: 'center', marginTop: 32, padding: '0 16px' }}>
                    Click a block above to add it here
                  </div>
                ) : (
                  script.map(node => (
                    <ScriptNodeRow key={node.id} node={node} script={script} onChange={setScript}
                      onMove={(id, dir) => setScript(prev => moveNode(prev, id, dir))}
                      insertTargetId={insertTargetId} onSetInsert={setInsertTargetId}
                      running={running} unitColor={unit.color} depth={0} />
                  ))
                )}
              </div>

              {/* Run / Stop / Clear */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', flexShrink: 0, display: 'flex', gap: 8 }}>
                {!running ? (
                  <button onClick={handleRun} disabled={script.length === 0}
                    style={{ flex: 1, padding: '9px 20px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: script.length === 0 ? '#94a3b8' : '#22c55e', color: '#fff', border: 'none', cursor: script.length === 0 ? 'not-allowed' : 'pointer' }}>
                    ▶  Run
                  </button>
                ) : (
                  <button onClick={handleStop}
                    style={{ flex: 1, padding: '9px 20px', borderRadius: 10, fontWeight: 800, fontSize: 14, background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer' }}>
                    ■  Stop
                  </button>
                )}
                <button onClick={handleReset} disabled={running}
                  style={{ padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                  ↺
                </button>
                <button onClick={handleClear} disabled={running}
                  style={{ padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 14, background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>
                  🗑
                </button>
              </div>
            </div>

            {/* Notes tab */}
            <div style={{ flex: 1, overflowY: 'auto', display: leftTab === 'notes' ? 'block' : 'none' }}>
              <LessonPanel text={unit.introNotes} />
            </div>
          </div>

          {/* Right panel: maze */}
          <div style={{ flex: 1, minWidth: 300 }}>
            {/* Challenge header */}
            <div style={{ ...CARD, padding: '14px 20px', marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Challenge {ci + 1}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0', margin: '2px 0 4px' }}>{ch.title}</div>
              <div style={{ fontSize: 13, color: bumpFlash ? '#fca5a5' : '#94a3b8', background: bumpFlash ? 'rgba(239,68,68,0.15)' : 'transparent', padding: bumpFlash ? '6px 10px' : 0, borderRadius: 8, transition: 'all 200ms' }}>
                {bumpFlash ? '💥 STEM Bot hit a wall! Check your script.' : `💡 ${ch.hint}`}
              </div>
            </div>

            {/* Canvas */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <MazeBoard ref={boardRef} level={{
                idx: ui * 10 + ci, title: ch.title, hint: ch.hint,
                grid: ch.grid, startX: ch.startX, startY: ch.startY, startDir: ch.startDir,
                exitX: ch.exitX, exitY: ch.exitY, collectibles: ch.collectibles,
                theme: unit.theme, maxBlocks: 30,
              }} onWin={handleWin} onBump={handleBump} />
            </div>

            {/* Win banner */}
            {solved && (
              <div style={{ ...CARD, padding: '16px 20px', marginTop: 14, background: 'rgba(74,222,128,0.08)', border: '1px solid #4ade80', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 28 }}>🎉</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: '#4ade80', fontSize: 15 }}>Challenge complete!</div>
                  <div style={{ fontSize: 13, color: '#86efac' }}>{isLast ? 'All challenges done — take the quiz!' : 'Ready for the next one?'}</div>
                </div>
                {isLast ? (
                  <button onClick={() => onFinish(scriptRef.current)}
                    style={{ padding: '10px 22px', background: unit.color, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                    Take Quiz →
                  </button>
                ) : (
                  <button onClick={() => onNext(scriptRef.current)}
                    style={{ padding: '10px 22px', background: unit.color, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>
                    Next →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Script node renderer ─────────────────────────────────────────────────────

function ScriptNodeRow({ node, script, onChange, onMove, insertTargetId, onSetInsert, running, unitColor, depth }: {
  node: ScriptNode; script: ScriptNode[]; onChange: (s: ScriptNode[]) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  insertTargetId: string | null; onSetInsert: (id: string | null) => void;
  running: boolean; unitColor: string; depth: number;
}) {
  const def: BlockDef | undefined = BLOCK_MAP[node.blockId];
  if (!def) return null;
  const isTarget = insertTargetId === node.id;

  if (def.hasBody) {
    return (
      <div style={{ marginLeft: depth * 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: '10px 10px 0 0', padding: '6px 10px', background: def.color, color: '#fff', fontSize: 12, fontWeight: 700, outline: isTarget ? '2px solid white' : 'none', outlineOffset: 1 }}>
          <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            {def.label}
            {node.blockId === 'repeat' && (
              <input type="number" min={1} max={20} disabled={running}
                value={node.params.times ?? 3}
                onChange={e => onChange(updateParam(script, node.id, 'times', Math.max(1, Math.min(20, Number(e.target.value) || 1))))}
                onClick={e => e.stopPropagation()}
                style={{ width: 36, textAlign: 'center', borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 800, fontSize: 12, padding: '1px 0' }}
              />
            )}
            {node.blockId === 'repeat' && <span style={{ opacity: 0.75, fontSize: 11 }}>times</span>}
          </span>
          {depth === 0 && <>
            <button disabled={running} onClick={() => onMove(node.id, 'up')}
              style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, color: '#fff', padding: '1px 5px', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>↑</button>
            <button disabled={running} onClick={() => onMove(node.id, 'down')}
              style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, color: '#fff', padding: '1px 5px', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>↓</button>
          </>}
          <button disabled={running} onClick={() => onSetInsert(isTarget ? null : node.id)}
            style={{ fontSize: 10, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, color: '#fff', padding: '2px 6px', cursor: 'pointer', fontWeight: 700 }}>
            {isTarget ? '✓ here' : '+ in'}
          </button>
          <button disabled={running} onClick={() => onChange(deleteNode(script, node.id))}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
        </div>
        <div style={{ borderLeft: `3px solid ${def.color}60`, marginLeft: 8, paddingLeft: 6, paddingTop: 3, paddingBottom: 3, background: def.color + '10' }}>
          {(node.children ?? []).length === 0
            ? <div style={{ fontSize: 11, color: def.color + 'AA', fontStyle: 'italic', padding: '4px 6px' }}>empty — click &quot;+ in&quot;</div>
            : (node.children ?? []).map(child => (
              <ScriptNodeRow key={child.id} node={child} script={script} onChange={onChange} onMove={onMove}
                insertTargetId={insertTargetId} onSetInsert={onSetInsert}
                running={running} unitColor={unitColor} depth={0} />
            ))
          }
        </div>
        <div style={{ borderRadius: '0 0 10px 10px', padding: '2px 10px', background: def.color + 'BB', fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
          end {def.label.toLowerCase()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: depth * 14, borderRadius: 10, padding: '6px 10px', background: def.color, color: '#fff', fontSize: 12, fontWeight: 700 }}>
      <span style={{ flex: 1 }}>{def.label}</span>
      {depth === 0 && <>
        <button disabled={running} onClick={() => onMove(node.id, 'up')}
          style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, color: '#fff', padding: '1px 5px', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>↑</button>
        <button disabled={running} onClick={() => onMove(node.id, 'down')}
          style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 5, color: '#fff', padding: '1px 5px', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}>↓</button>
      </>}
      <button disabled={running} onClick={() => onChange(deleteNode(script, node.id))}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', fontSize: 13, padding: 0 }}>✕</button>
    </div>
  );
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

function QuizView({ ui, onDone }: { ui: number; onDone: (score: number, total: number) => void }) {
  const unit = UNITS[ui];
  const [answers, setAnswers] = useState<(number | null)[]>(unit.quiz.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const score = submitted ? unit.quiz.reduce((s, q, i) => s + (answers[i] === q.answer ? 1 : 0), 0) : 0;

  return (
    <SiteChrome>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: unit.color, padding: '18px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unit {unit.id} Quiz</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 2 }}>{unit.title}</div>
          </div>
          <div style={{ padding: '24px 28px' }}>
            {unit.quiz.map((q, qi) => {
              const chosen = answers[qi];
              const correct = submitted ? chosen === q.answer : null;
              return (
                <div key={qi} style={{ marginBottom: 28 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#e2e8f0', marginBottom: 10 }}>{qi + 1}. {q.question}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {q.options.map((opt, oi) => {
                      const picked = chosen === oi;
                      const isCorrect = submitted && oi === q.answer;
                      const isWrong = submitted && picked && oi !== q.answer;
                      return (
                        <button key={oi} disabled={submitted}
                          onClick={() => setAnswers(prev => { const a = [...prev]; a[qi] = oi; return a; })}
                          style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: submitted ? 'default' : 'pointer', border: `2px solid ${isCorrect ? '#22c55e' : isWrong ? '#ef4444' : picked ? unit.color : 'rgba(255,255,255,0.15)'}`, background: isCorrect ? 'rgba(74,222,128,0.15)' : isWrong ? 'rgba(239,68,68,0.15)' : picked ? unit.color + '22' : 'rgba(255,255,255,0.05)', color: '#e2e8f0', transition: 'all 120ms' }}>
                          {opt}
                          {isCorrect && ' ✓'}
                          {isWrong && ' ✗'}
                        </button>
                      );
                    })}
                  </div>
                  {submitted && (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', background: 'rgba(99,179,237,0.06)', borderRadius: 8, padding: '8px 12px', borderLeft: `4px solid ${unit.color}` }}>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })}
            {!submitted ? (
              <button
                disabled={answers.some(a => a === null)}
                onClick={() => { setSubmitted(true); }}
                style={{ width: '100%', padding: '14px 0', background: answers.some(a => a === null) ? '#94a3b8' : unit.color, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: answers.some(a => a === null) ? 'not-allowed' : 'pointer' }}>
                Submit Answers
              </button>
            ) : (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{ fontSize: 40 }}>{score === unit.quiz.length ? '🏆' : score >= unit.quiz.length * 0.75 ? '🎉' : '📚'}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#e2e8f0' }}>{score} / {unit.quiz.length}</div>
                  <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>
                    {score === unit.quiz.length ? 'Perfect score!' : score >= unit.quiz.length * 0.75 ? 'Great work — keep it up!' : 'Review the lesson notes and try again.'}
                  </div>
                </div>
                <button onClick={() => onDone(score, unit.quiz.length)}
                  style={{ width: '100%', padding: '14px 0', background: unit.color, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
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

function UnitComplete({ ui, score, total, onNext, onBack }: { ui: number; score: number; total: number; onNext: () => void; onBack: () => void }) {
  const unit = UNITS[ui];
  const pct = Math.round(score / total * 100);
  const hasNext = ui < UNITS.length - 1;
  return (
    <SiteChrome>
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '60px 32px', textAlign: 'center' }}>
        <div style={{ ...CARD, padding: '40px 36px' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>{pct >= 80 ? '🏆' : pct >= 60 ? '🎉' : '📚'}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: unit.color, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Unit {unit.id} Complete</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#e2e8f0', margin: '8px 0 4px' }}>{unit.title}</div>
          <div style={{ fontSize: 16, color: '#94a3b8', marginBottom: 24 }}>Quiz score: {score} / {total} ({pct}%)</div>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 28 }}>
            {pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good job — keep practicing!' : 'Review the lesson notes and try the quiz again when ready.'}
          </div>
          {hasNext ? (
            <button onClick={onNext} style={{ display: 'block', width: '100%', padding: '14px 0', background: unit.color, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', marginBottom: 12 }}>
              Start Unit {ui + 2} →
            </button>
          ) : (
            <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid #4ade80', borderRadius: 12, padding: '16px', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#4ade80' }}>🎓 Block Lab Complete!</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>You have mastered block coding. Ready for Python?</div>
              <Link href="/tools/code-lab/python" style={{ display: 'block', marginTop: 12, padding: '12px 0', background: '#7C3AED', color: '#fff', borderRadius: 10, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                Try Python Maze Challenges →
              </Link>
            </div>
          )}
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ← Back to Units
          </button>
        </div>
      </div>
    </SiteChrome>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function BlockLabPage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;
  const [progress, setProgress] = useState<Progress>(emptyProgress());
  const [phase, setPhase] = useState<Phase>({ tag: 'overview' });
  const progressRef = useRef<Progress>(emptyProgress());
  const [assignedUnits, setAssignedUnits] = useState<number[] | null>(null);

  useEffect(() => {
    const local = loadProgress();
    setProgress(local);
    progressRef.current = local;
    if (userId) {
      loadFromCloud(userId).then(cloud => {
        const merged: Progress = {
          completedChallenges: { ...local.completedChallenges, ...cloud.completedChallenges },
          completedUnits: { ...local.completedUnits, ...cloud.completedUnits },
          savedScripts: { ...local.savedScripts, ...cloud.savedScripts },
        };
        setProgress(merged);
        progressRef.current = merged;
        saveProgress(merged);
      });
    }
  }, [userId]);

  useEffect(() => {
    if (status === 'loading') return;
    fetch('/api/student/assignments?tool=block-lab')
      .then(r => r.ok ? r.json() : null)
      .then(data => setAssignedUnits(data));
  }, [status]);

  const updateProgress = useCallback((updater: (p: Progress) => Progress) => {
    const next = updater(progressRef.current);
    progressRef.current = next;
    setProgress(next);
    saveProgress(next);
    return next;
  }, []);

  const handleSolve = useCallback((ui: number, ci: number, script: ScriptNode[]) => {
    const key = chalKey(ui, ci);
    const next = updateProgress(p => ({
      ...p,
      completedChallenges: { ...p.completedChallenges, [key]: true },
      savedScripts: { ...p.savedScripts, [key]: script },
    }));
    if (userId) syncToCloud(userId, ui, ci, true, script);
    return next;
  }, [updateProgress, userId]);

  if (phase.tag === 'overview') {
    return <Overview progress={progress} assignedUnits={assignedUnits} onSelect={ui => setPhase({ tag: 'intro', ui })} />;
  }

  if (phase.tag === 'intro') {
    return <UnitIntro ui={phase.ui} onStart={() => setPhase({ tag: 'challenge', ui: phase.ui, ci: 0 })} />;
  }

  if (phase.tag === 'challenge') {
    const { ui, ci } = phase;
    const unit = UNITS[ui];
    return (
      <ChallengeView
        ui={ui} ci={ci} progress={progress}
        onSolve={script => handleSolve(ui, ci, script)}
        onNext={script => {
          handleSolve(ui, ci, script);
          setPhase({ tag: 'challenge', ui, ci: ci + 1 });
        }}
        onFinish={script => {
          handleSolve(ui, ci, script);
          setPhase({ tag: 'quiz', ui });
        }}
        onBack={() => setPhase({ tag: 'overview' })}
        onJump={(newCi, script) => {
          updateProgress(p => ({ ...p, savedScripts: { ...p.savedScripts, [chalKey(ui, ci)]: script } }));
          setPhase({ tag: 'challenge', ui, ci: newCi });
        }}
      />
    );
  }

  if (phase.tag === 'quiz') {
    const { ui } = phase;
    return (
      <QuizView ui={ui} onDone={(score, total) => {
        const passed = score >= total * 0.6;
        if (passed) {
          const next = updateProgress(p => ({ ...p, completedUnits: { ...p.completedUnits, [ui]: true } }));
          if (userId) syncToCloud(userId, ui, null, true);
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
        onBack={() => setPhase({ tag: 'overview' })}
      />
    );
  }

  return null;
}
