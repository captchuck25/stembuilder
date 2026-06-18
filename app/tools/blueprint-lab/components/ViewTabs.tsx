'use client';

import { T } from '../engine/theme';

export type ViewId = '2d' | '3d' | 'specs' | 'roof-plan' | 'elevations' | 'rooms' | 'sandbox' | 'print';

const TABS: { id: ViewId; label: string; enabled: boolean }[] = [
  { id: '2d',         label: '2D Plan',     enabled: true  },
  { id: '3d',         label: '3D View',     enabled: true  },
  { id: 'specs',      label: 'Section Views', enabled: true  },
  { id: 'roof-plan',  label: 'Roof Plan',   enabled: true  },
  { id: 'elevations', label: 'Elevations',  enabled: true  },
  { id: 'rooms',      label: 'Rooms',       enabled: true  },
  { id: 'sandbox',    label: 'Sandbox',     enabled: true  },
  { id: 'print',      label: 'Print/Export', enabled: false },
];

export default function ViewTabs({ view, onChange }: { view: ViewId; onChange: (v: ViewId) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 2, background: T.bg,
      padding: 3, borderRadius: 8, border: `1px solid ${T.line}`,
    }}>
      {TABS.map(t => {
        const active = t.id === view;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            disabled={!t.enabled && t.id !== view}
            title={t.enabled ? t.label : `${t.label} — coming soon`}
            style={{
              padding: '5px 14px', fontSize: 12, fontWeight: 500,
              background: active ? T.panel : 'transparent',
              color: active ? T.ink : t.enabled ? T.inkSoft : T.inkMuted,
              border: active ? `1px solid ${T.lineStrong}` : '1px solid transparent',
              borderRadius: 6,
              cursor: t.enabled ? 'pointer' : 'not-allowed',
              boxShadow: active ? T.shadow : 'none',
              transition: 'all 120ms',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Placeholder panels for the non-2D views ──────────────────────────────────

export function PlaceholderView({ view }: { view: ViewId }) {
  const messages: Record<Exclude<ViewId, '2d'>, { title: string; body: string; bullets: string[] }> = {
    '3d': {
      title: '3D View',
      body: 'A 3D model will be generated automatically from your 2D plan.',
      bullets: [
        'Walls extruded to their stored heights',
        'Floor slabs from room boundaries',
        'Doors and windows cut from wall geometry',
        'Roof generated from RoofSettings',
      ],
    },
    'specs': {
      title: 'Building Specs',
      body: 'Project-wide structural data (foundation, joists, plate heights, roof, materials) feeding the 3D, elevations, and cross-section views.',
      bullets: [
        'Foundation type, wall thickness, footing dimensions',
        'Floor joist depths and plate heights',
        'Exterior material default + roof pitch',
        'Live cross-section preview',
      ],
    },
    'roof-plan': {
      title: 'Roof Plan',
      body: 'Top-down roof layout — building perimeter + spec-sheet overhang as background; user draws ridge beams, valley pads, and annotations.',
      bullets: [
        'Footprint generated from exterior walls',
        'Overhang offset from spec sheet',
        'Ridge beam + valley tools with snap to endpoints/midpoints/edges',
        'Same line / dim / text / offset / trim tools as Section view',
      ],
    },
    'elevations': {
      title: 'Elevations',
      body: 'Interior (per-wall) and exterior elevation drawings, generated from the plan + Specs data.',
      bullets: [
        'Wall heights from each wall object',
        'Openings projected from doors and windows',
        'Roof profile from pitch and overhang',
        'Material hatches (siding, brick, stone, stucco)',
      ],
    },
    'rooms': {
      title: 'Rooms',
      body: 'Compiled list of all rooms across all floors with sqft and totals.',
      bullets: [
        'Grouped by floor',
        'Sortable by name and sqft',
        'Per-room-type counts',
        'Verify assignment requirements (e.g., 3 bedrooms, 2 bathrooms)',
      ],
    },
    'sandbox': {
      title: 'Sandbox',
      body: 'A CAD-style layout sheet that composites all your views — roof plan, floor plans, elevations, and section — aligned on shared datums, with DXF export for AutoCAD.',
      bullets: [
        'Elevations lined up on shared height datums',
        'Floor plan aligned beneath, roof plan above',
        'Section off to the side for height checks',
        'Export to DXF for AutoCAD and other CAD tools',
      ],
    },
    'print': {
      title: 'Print / Export',
      body: 'Compose finished sheets with plans, elevations, and renders for printing.',
      bullets: [
        'Title block with project name and student',
        'Scale bar and north arrow',
        'Multiple drawings per sheet',
        'PDF or PNG export',
      ],
    },
  };

  if (view === '2d') return null;
  const m = messages[view];
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bg, padding: 40,
    }}>
      <div style={{
        maxWidth: 480, background: T.panel, border: `1px solid ${T.line}`,
        borderRadius: 10, padding: '30px 34px',
        boxShadow: T.shadow,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase', marginBottom: 8,
        }}>
          Generated from 2D Plan · Coming next
        </div>
        <h2 style={{
          fontSize: 22, fontWeight: 700, color: T.ink,
          margin: '0 0 10px', fontFamily: 'ui-sans-serif, system-ui',
        }}>{m.title}</h2>
        <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.6, margin: '0 0 18px' }}>
          {m.body}
        </p>
        <ul style={{ paddingLeft: 18, margin: 0, color: T.inkSoft, fontSize: 13, lineHeight: 1.8 }}>
          {m.bullets.map(b => <li key={b}>{b}</li>)}
        </ul>
      </div>
    </div>
  );
}
