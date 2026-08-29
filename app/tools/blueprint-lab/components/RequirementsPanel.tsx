'use client';

// Live design-requirements checklist — evaluates the active level against a
// Brief (see engine/rubric.ts) and shows red/green checks grouped by room.
// This is the rubric engine's "guide mode"; the same evaluateBrief() runs
// server-side at submission in the future assignment flow.

import { useMemo, useState } from 'react';
import { Level } from '../engine/types';
import { Brief, BRIEFS, evaluateBrief, RubricCheck } from '../engine/rubric';
import { T } from '../engine/theme';

const DELIVERABLE_LABELS: Record<string, string> = {
  'floor-plan': 'Floor plan',
  'roof-plan': 'Roof plan',
  'elevations': 'Elevations',
};

export default function RequirementsPanel({ level, briefId, onChangeBrief, onClose, briefOverride, shellInfo }: {
  level: Level;
  briefId: string;
  onChangeBrief: (id: string) => void;
  onClose: () => void;
  // Assignment mode: check against this exact (teacher-edited) brief and hide
  // the built-in brief picker.
  briefOverride?: Brief;
  // e.g. "Shell: U-shape (courtyard) — 62' × 38' · 2,182 SF" — shown so the
  // student knows their seeded shell's real size without measuring it.
  shellInfo?: string;
}) {
  const brief = briefOverride ?? BRIEFS.find(b => b.id === briefId) ?? BRIEFS[0];
  const checks = useMemo(() => evaluateBrief(level, brief), [level, brief]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Minimized: collapse to just the header bar (≠ close — one click brings it back).
  const [minimized, setMinimized] = useState(false);

  const passed = checks.filter(c => c.status === 'pass').length;
  const groups: Array<{ name: string; items: RubricCheck[] }> = [];
  for (const c of checks) {
    const g = groups.find(x => x.name === c.group);
    if (g) g.items.push(c);
    else groups.push({ name: c.group, items: [c] });
  }

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, width: 272, maxHeight: 'calc(100% - 60px)',
      display: 'flex', flexDirection: 'column',
      background: T.panel, border: `1px solid ${T.lineStrong}`, borderRadius: T.radius,
      boxShadow: T.shadow, overflow: 'hidden', zIndex: 20,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 12px', borderBottom: `1px solid ${T.line}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: T.ink, flex: 1 }}>REQUIREMENTS</span>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
          background: passed === checks.length ? '#e6f7ef' : T.accentSoft,
          color: passed === checks.length ? T.good : T.accentInk,
        }}>{passed}/{checks.length}</span>
        <button
          onClick={() => setMinimized(m => !m)}
          title={minimized ? 'Expand' : 'Minimize'}
          style={{
            border: 'none', background: 'transparent', color: T.inkMuted,
            cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
          }}
        >{minimized ? '▾' : '–'}</button>
        <button
          onClick={onClose}
          title="Close"
          style={{
            border: 'none', background: 'transparent', color: T.inkMuted,
            cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2,
          }}
        >✕</button>
      </div>

      {minimized ? null : <>
      {/* Brief picker (fixed title in assignment mode) */}
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.line}`, background: T.panel2 }}>
        {briefOverride ? (
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.ink }}>{brief.title}</div>
        ) : (
          <select
            value={brief.id}
            onChange={e => onChangeBrief(e.target.value)}
            style={{
              width: '100%', fontSize: 12, padding: '5px 6px', color: T.ink,
              border: `1px solid ${T.lineStrong}`, borderRadius: 6, background: T.panel,
            }}
          >
            {BRIEFS.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
        )}
        <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 6, lineHeight: 1.45 }}>
          {brief.description}
        </div>
        <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 4 }}>
          Deliverables: {brief.deliverables.map(d => DELIVERABLE_LABELS[d]).join(' → ')}
        </div>
        {shellInfo && (
          <div style={{ fontSize: 10.5, color: T.accentInk, fontWeight: 600, marginTop: 4 }}>
            {shellInfo}
          </div>
        )}
      </div>

      {/* Checks */}
      <div style={{ overflowY: 'auto', padding: '4px 0 8px' }}>
        {groups.map(g => {
          const gPassed = g.items.filter(c => c.status === 'pass').length;
          const isCollapsed = collapsed[g.name] ?? false;
          return (
            <div key={g.name}>
              <button
                onClick={() => setCollapsed(s => ({ ...s, [g.name]: !isCollapsed }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px 3px', border: 'none', background: 'transparent',
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
                  color: gPassed === g.items.length ? T.good : T.inkSoft, flex: 1,
                }}>{g.name}</span>
                <span style={{ fontSize: 10, color: T.inkMuted }}>
                  {gPassed}/{g.items.length} {isCollapsed ? '▸' : '▾'}
                </span>
              </button>
              {!isCollapsed && g.items.map(c => (
                <div key={c.id} style={{ padding: '3px 12px 3px 14px', display: 'flex', gap: 8 }}>
                  <span style={{
                    fontSize: 11, lineHeight: '16px',
                    color: c.status === 'pass' ? T.good : T.danger,
                  }}>{c.status === 'pass' ? '✓' : '✗'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: T.ink, lineHeight: 1.35 }}>{c.label}</div>
                    <div style={{ fontSize: 10.5, color: c.status === 'pass' ? T.inkMuted : '#b05252', lineHeight: 1.35 }}>
                      {c.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </>}
    </div>
  );
}
