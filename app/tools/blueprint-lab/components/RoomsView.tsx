'use client';

// Rooms tab — compiled list of every room label across every floor, with
// sqft totals and per-room-type counts. Intended for teacher assignment
// verification: students design "3 bedrooms + 2 baths + a kitchen" and the
// tab makes the count + sqft easy to scan and audit.

import { useMemo } from 'react';
import { Project, RoomLabel, Vec2, formatImperial } from '../engine/types';
import { T } from '../engine/theme';

// Bounding-box W × H of a room boundary polygon, formatted as feet'inches".
// Falls back to '—' when there is no boundary (and so no real dimensions to
// report — the user typed a sqft value or hasn't drawn the room yet).
function roomDimensionsLabel(boundary: Vec2[] | undefined): string {
  if (!boundary || boundary.length < 2) return '—';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of boundary) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return `${formatImperial(w)} × ${formatImperial(h)}`;
}

interface Props {
  project: Project;
  // Jump to a specific room: switch to 2D plan, focus the active level on
  // the room's floor, and select the label.
  onJumpToRoom: (levelId: string, roomId: string) => void;
}

interface RoomRow {
  room: RoomLabel;
  levelId: string;
  levelName: string;
}

export default function RoomsView({ project, onJumpToRoom }: Props) {
  const rows: RoomRow[] = useMemo(() => {
    const out: RoomRow[] = [];
    for (const lvl of project.levels) {
      for (const r of lvl.roomLabels) {
        out.push({ room: r, levelId: lvl.id, levelName: lvl.name });
      }
    }
    return out;
  }, [project.levels]);

  // Per-room-type counts (group by name, case-insensitive) — useful for
  // teachers verifying "3 bedrooms" type assignments.
  const counts = useMemo(() => {
    const m = new Map<string, { count: number; totalSf: number }>();
    for (const r of rows) {
      const k = (r.room.name || 'ROOM').toUpperCase();
      const prev = m.get(k) ?? { count: 0, totalSf: 0 };
      prev.count += 1;
      prev.totalSf += r.room.squareFeet ?? 0;
      m.set(k, prev);
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [rows]);

  const grandTotalSf = useMemo(
    () => rows.reduce((sum, r) => sum + (r.room.squareFeet ?? 0), 0),
    [rows],
  );
  const totalWithSf = useMemo(
    () => rows.filter(r => r.room.squareFeet != null).length,
    [rows],
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', background: T.bg, padding: '24px 32px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{
            margin: 0, fontSize: 22, fontWeight: 700, color: T.ink,
            fontFamily: 'ui-sans-serif, system-ui',
          }}>Rooms</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.inkSoft }}>
            {rows.length === 0
              ? 'No room labels yet — add them with the Room tool in the 2D Plan.'
              : `${rows.length} room${rows.length === 1 ? '' : 's'} across ${project.levels.length} floor${project.levels.length === 1 ? '' : 's'}`}
          </p>
        </header>

        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Summary counts={counts} grandTotalSf={grandTotalSf} totalWithSf={totalWithSf} totalRooms={rows.length} />

            <h2 style={{
              fontSize: 14, fontWeight: 700, color: T.inkSoft, textTransform: 'uppercase',
              letterSpacing: '0.6px', margin: '28px 0 10px',
            }}>By floor</h2>

            {project.levels.map(lvl => {
              const floorRows = rows.filter(r => r.levelId === lvl.id);
              if (floorRows.length === 0) return null;
              const floorTotal = floorRows.reduce((sum, r) => sum + (r.room.squareFeet ?? 0), 0);
              return (
                <FloorCard
                  key={lvl.id}
                  name={lvl.name}
                  rows={floorRows}
                  totalSf={floorTotal}
                  onJumpToRoom={onJumpToRoom}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function Summary({ counts, grandTotalSf, totalWithSf, totalRooms }: {
  counts: { name: string; count: number; totalSf: number }[];
  grandTotalSf: number;
  totalWithSf: number;
  totalRooms: number;
}) {
  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
      padding: '16px 20px', boxShadow: T.shadow,
    }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label="Total rooms" value={String(totalRooms)} />
        <Stat label="Total sqft" value={`${grandTotalSf.toLocaleString()} sf`}
              sub={totalWithSf < totalRooms ? `${totalRooms - totalWithSf} unsized` : undefined} />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 8,
      }}>
        {counts.map(c => (
          <div key={c.name} style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            padding: '6px 10px', background: T.bg, borderRadius: 6,
            border: `1px solid ${T.line}`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{c.name}</span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>{c.count}</span>
              {c.totalSf > 0 && (
                <span style={{ fontSize: 11, color: T.inkMuted }}>· {c.totalSf.toLocaleString()} sf</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10, fontWeight: 700, color: T.inkMuted,
        textTransform: 'uppercase', letterSpacing: '0.6px',
      }}>{label}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: T.ink,
        fontFamily: 'ui-sans-serif, system-ui', marginTop: 2,
      }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{sub}</div>
      )}
    </div>
  );
}

function FloorCard({ name, rows, totalSf, onJumpToRoom }: {
  name: string;
  rows: RoomRow[];
  totalSf: number;
  onJumpToRoom: (levelId: string, roomId: string) => void;
}) {
  return (
    <div style={{
      background: T.panel, border: `1px solid ${T.line}`, borderRadius: 10,
      padding: '14px 18px', marginBottom: 14, boxShadow: T.shadow,
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.line}`,
      }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.ink }}>{name}</h3>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: T.inkSoft }}>
          <span>{rows.length} room{rows.length === 1 ? '' : 's'}</span>
          {totalSf > 0 && <span style={{ fontWeight: 700, color: T.ink }}>{totalSf.toLocaleString()} sf</span>}
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <Th>Name</Th>
            <Th align="right">Sqft</Th>
            <Th align="right">Dimensions</Th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const hasBoundary = !!(r.room.boundary && r.room.boundary.length >= 3);
            const needsSqft = r.room.squareFeet == null && !hasBoundary;
            return (
              <tr
                key={r.room.id}
                style={{
                  borderTop: `1px solid ${T.line}`,
                  background: needsSqft ? 'rgba(212,160,23,0.08)' : undefined,
                }}
              >
                <Td>
                  <span style={{ fontWeight: 600, color: T.ink }}>
                    {(r.room.name || 'ROOM').toUpperCase()}
                  </span>
                  {needsSqft && (
                    <span style={{
                      marginLeft: 8, padding: '1px 6px', fontSize: 10, fontWeight: 700,
                      color: '#7a5a00', background: 'rgba(212,160,23,0.20)',
                      border: '1px solid rgba(212,160,23,0.45)', borderRadius: 4,
                    }}>NO SF</span>
                  )}
                </Td>
                <Td align="right">
                  {r.room.squareFeet != null
                    ? <span style={{ fontFamily: 'ui-monospace, monospace' }}>{r.room.squareFeet.toLocaleString()} sf</span>
                    : <span style={{ color: '#a07800', fontWeight: 600 }}>—</span>}
                </Td>
                <Td align="right">
                  <span style={{
                    color: hasBoundary ? T.inkSoft : T.inkMuted,
                    fontFamily: 'ui-monospace, monospace', fontSize: 12,
                  }}>
                    {roomDimensionsLabel(r.room.boundary)}
                  </span>
                </Td>
                <Td align="right">
                  <button
                    onClick={() => onJumpToRoom(r.levelId, r.room.id)}
                    style={{
                      padding: '4px 10px', fontSize: 11, fontWeight: 600,
                      background: T.panel, color: T.accentInk,
                      border: `1px solid ${T.line}`, borderRadius: 5, cursor: 'pointer',
                    }}
                    title="Open this room on the 2D plan"
                  >Open →</button>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th style={{
      padding: '6px 8px',
      textAlign: align ?? 'left',
      fontSize: 10, fontWeight: 700, color: T.inkMuted,
      textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>{children}</th>
  );
}

function Td({ children, align }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td style={{
      padding: '8px 8px', textAlign: align ?? 'left',
      verticalAlign: 'middle',
    }}>{children}</td>
  );
}

function EmptyState() {
  return (
    <div style={{
      background: T.panel, border: `1px dashed ${T.lineStrong}`, borderRadius: 10,
      padding: '40px 32px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
      <p style={{ margin: 0, fontSize: 14, color: T.inkSoft, lineHeight: 1.6 }}>
        Use the <strong style={{ color: T.ink }}>Room</strong> tool to label rooms in your plan.
        Each label you drop appears here with its sqft and a button to jump back to it.
      </p>
    </div>
  );
}
