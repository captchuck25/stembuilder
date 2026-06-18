'use client';

import { T } from '../engine/theme';

interface Props {
  gridInches: number;
  gridVisible: boolean;
  snapToGridOn: boolean;
  orthoOn: boolean;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onToggleOrtho: () => void;
  onChangeGrid: (inches: number) => void;
  activeFloor: string;
}

const PILL: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
  background: T.panel, color: T.inkSoft, cursor: 'pointer',
  border: `1px solid ${T.line}`,
  transition: 'all 120ms',
};

const PILL_ON: React.CSSProperties = {
  ...PILL, background: T.accentSoft, color: T.accentInk,
  border: `1px solid rgba(79,124,255,0.4)`,
};

export default function StatusBar({
  gridInches, gridVisible, snapToGridOn, orthoOn,
  onToggleGrid, onToggleSnap, onToggleOrtho, onChangeGrid, activeFloor,
}: Props) {
  return (
    <div style={{
      height: 36, background: T.panel,
      borderTop: `1px solid ${T.line}`,
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 14,
      color: T.inkSoft, fontSize: 12,
      flexShrink: 0,
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          width: 8, height: 8, borderRadius: 2, background: T.accent,
        }} />
        <strong style={{ color: T.ink, fontWeight: 600 }}>{activeFloor}</strong>
      </span>

      <Sep />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.inkSoft }}>
        <select
          value={gridInches}
          onChange={e => onChangeGrid(Number(e.target.value))}
          disabled={!gridVisible}
          style={{
            background: T.panel, color: gridVisible ? T.ink : T.inkMuted,
            border: `1px solid ${T.line}`, borderRadius: 6,
            padding: '3px 8px', fontSize: 12, fontFamily: 'inherit',
            outline: 'none',
            cursor: gridVisible ? 'pointer' : 'not-allowed',
          }}
        >
          <option value={6}>6 in</option>
          <option value={12}>12 in (1 ft)</option>
          <option value={24}>24 in (2 ft)</option>
          <option value={48}>48 in (4 ft)</option>
        </select>
      </label>

      <button
        style={gridVisible ? PILL_ON : PILL}
        onClick={onToggleGrid}
        title="Show or hide the drafting grid"
      >Grid</button>
      <button
        style={snapToGridOn ? PILL_ON : PILL}
        onClick={onToggleSnap}
        title="Snap new points to the grid"
      >Snap</button>
      <button
        style={orthoOn ? PILL_ON : PILL}
        onClick={onToggleOrtho}
        title="Lock new lines to horizontal or vertical"
      >Right Angle</button>

      <span style={{ flex: 1 }} />

      <span style={{ color: T.inkMuted, fontSize: 11 }}>Imperial · v0.1</span>
    </div>
  );
}

const Sep = () => (
  <span style={{ width: 1, height: 16, background: T.line }} />
);
