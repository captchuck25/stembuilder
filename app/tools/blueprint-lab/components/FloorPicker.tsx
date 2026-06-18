'use client';

import { useEffect, useRef, useState } from 'react';
import { Level, formatImperial } from '../engine/types';
import { T } from '../engine/theme';

interface Props {
  levels: Level[];
  activeLevelId: string;
  onSelectLevel: (id: string) => void;
  onAddFloor: (where: 'above' | 'below' | 'basement') => void;
  onRenameFloor: (id: string, name: string) => void;
  onDeleteFloor: (id: string) => void;
  onDuplicateFloor: (id: string) => void;
  onUpdateElevation: (id: string, elevation: number) => void;
}

export default function FloorPicker({
  levels, activeLevelId, onSelectLevel, onAddFloor,
  onRenameFloor, onDeleteFloor, onDuplicateFloor, onUpdateElevation,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const active = levels.find(l => l.id === activeLevelId) ?? levels[0];

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Sort top-down for the dropdown (highest elevation at top, basement at bottom).
  const sorted = [...levels].sort((a, b) => b.elevation - a.elevation);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 30, boxSizing: 'border-box', padding: '0 10px',
          background: T.panel, border: `1px solid ${T.lineStrong}`, borderRadius: 6,
          color: T.ink, fontSize: 12, fontWeight: 500,
          fontFamily: 'inherit', cursor: 'pointer',
          minWidth: 120,
        }}
        title="Switch floor"
      >
        <span style={{
          width: 6, height: 6, borderRadius: 1, background: T.accent,
        }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{active.name}</span>
        <span style={{ color: T.inkMuted, fontSize: 11 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8,
          boxShadow: T.shadow,
          minWidth: 280, zIndex: 50,
          padding: 4,
        }}>
          <div style={{
            padding: '6px 10px 4px', fontSize: 10, fontWeight: 700,
            color: T.inkMuted, letterSpacing: '0.6px', textTransform: 'uppercase',
          }}>Floors</div>
          {sorted.map(l => {
            const isActive = l.id === activeLevelId;
            const isEditing = editing === l.id;
            return (
              <div key={l.id} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 6px', borderRadius: 6,
                background: isActive ? T.accentSoft : 'transparent',
              }}>
                {isEditing ? (
                  <input
                    autoFocus
                    defaultValue={l.name}
                    onBlur={e => { onRenameFloor(l.id, e.currentTarget.value); setEditing(null); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    style={{
                      flex: 1, padding: '4px 8px', fontSize: 13, fontWeight: 600,
                      border: `1px solid ${T.accent}`, borderRadius: 4,
                      background: T.panel, color: T.ink, outline: 'none', fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => { onSelectLevel(l.id); setOpen(false); }}
                    onDoubleClick={() => setEditing(l.id)}
                    style={{
                      flex: 1, textAlign: 'left',
                      padding: '4px 6px', borderRadius: 4,
                      background: 'transparent', border: 'none',
                      color: isActive ? T.accentInk : T.ink,
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      fontFamily: 'inherit', cursor: 'pointer',
                    }}
                    title="Click to switch · double-click to rename"
                  >
                    {l.name}
                  </button>
                )}
                <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: T.inkMuted, paddingRight: 4 }}>
                  {formatImperial(l.elevation)}
                </span>
                <IconButton title="Edit elevation" onClick={() => {
                  const cur = formatImperial(l.elevation);
                  const v = window.prompt(`Elevation for "${l.name}" (inches, fractions like 12'6 OK):`, cur);
                  if (v == null) return;
                  const num = parseInches(v);
                  if (num != null) onUpdateElevation(l.id, num);
                }}>⇕</IconButton>
                <IconButton title="Duplicate" onClick={() => { onDuplicateFloor(l.id); setOpen(false); }}>⎘</IconButton>
                <IconButton
                  title={levels.length > 1 ? 'Delete' : 'Cannot delete last floor'}
                  disabled={levels.length <= 1}
                  onClick={() => {
                    if (levels.length <= 1) return;
                    const hasContent = l.walls.length || l.doors.length || l.windows.length
                      || l.stairs.length || l.furniture.length || l.roomLabels.length || l.dimensions.length;
                    if (hasContent && !window.confirm(`Delete "${l.name}" and all its content?`)) return;
                    onDeleteFloor(l.id);
                    setOpen(false);
                  }}
                  danger
                >×</IconButton>
              </div>
            );
          })}
          <div style={{ height: 1, background: T.line, margin: '4px 6px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', padding: '2px' }}>
            <ActionRow onClick={() => { onAddFloor('above'); setOpen(false); }}>
              + Add floor above
            </ActionRow>
            <ActionRow onClick={() => { onAddFloor('below'); setOpen(false); }}>
              + Add floor below
            </ActionRow>
            <ActionRow onClick={() => { onAddFloor('basement'); setOpen(false); }}>
              + Add basement
            </ActionRow>
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  children, onClick, title, disabled, danger,
}: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 22, height: 22, padding: 0,
        background: 'transparent', border: 'none', borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 0.7,
        fontSize: 13, fontFamily: 'inherit',
        color: danger ? T.danger : T.inkSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.opacity = '0.7'; }}
    >
      {children}
    </button>
  );
}

function ActionRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '6px 10px', borderRadius: 4,
        background: 'transparent', border: 'none',
        color: T.accentInk, fontSize: 12, fontWeight: 600,
        fontFamily: 'inherit', cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = T.accentSoft)}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

// Parse "12'6"", "-8'", "108", "-96" → inches.
function parseInches(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const sign = t.startsWith('-') ? -1 : 1;
  const body = t.replace(/^-/, '');
  const ftIn = body.match(/^(\d+(?:\.\d+)?)\s*'\s*(\d+(?:\.\d+)?)?\s*"?$/);
  if (ftIn) {
    const ft = parseFloat(ftIn[1]);
    const inch = ftIn[2] ? parseFloat(ftIn[2]) : 0;
    return sign * (ft * 12 + inch);
  }
  const num = body.match(/^(\d+(?:\.\d+)?)\s*"?$/);
  if (num) return sign * parseFloat(num[1]);
  return null;
}
