'use client';
import { CompiledRules, summarizeRules } from '../engine/types';

// Compact chip strip describing a game's actual (compiled) rules.
export default function RuleSummary({ rules }: { rules: CompiledRules }) {
  const s = summarizeRules(rules);
  const GROUPS: { label: string; items: string[]; color: string }[] = [
    { label: 'Controls', items: s.controls, color: '#7DF9FF' },
    { label: 'How to win', items: s.goals, color: '#4ade80' },
    { label: 'Watch out', items: s.danger, color: '#fbbf24' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {GROUPS.map(g => (
        <div key={g.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: g.color, textTransform: 'uppercase', letterSpacing: '0.6px', minWidth: 74 }}>
            {g.label}
          </span>
          {g.items.map((item, i) => (
            <span key={i} style={{ fontSize: 12, fontWeight: 700, color: '#cbd5e1',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12, padding: '2px 10px' }}>
              {item}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
