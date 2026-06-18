'use client';

import { ToolId } from '../engine/types';
import { ViewId } from './ViewTabs';
import { T } from '../engine/theme';

// `applies` lists the views in which this tool is meaningful. Tools not
// applicable to the current view render disabled (grayed, not clickable)
// so the palette stays visually consistent across views — the user always
// sees the same icons in the same positions.
interface ToolDef {
  id: ToolId;
  label: string;
  hint: string;
  glyph: React.ReactNode;
  enabled: boolean;
  applies: ViewId[];
}

// All icons share the STEM-Sketch style: 24×24 viewBox, currentColor stroke,
// stroke-width 1.6–1.8, rounded caps/joins, no fill. Render at 22×22 to fit
// the toolbar buttons cleanly.

// Select: classic pointer arrow.
const SelectIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M5 3l4 16 3-7 7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
);

// Wall: two parallel lines representing the wall thickness, with end caps.
const WallIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <line x1="9"  y1="4" x2="9"  y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="15" y1="4" x2="15" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="9"  y1="4"  x2="15" y2="4"  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="9"  y1="20" x2="15" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

// Offset: a solid rectangle with a dashed outer rectangle offset around it.
const OffsetIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3"  width="18" height="18" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    <rect x="7" y="7"  width="10" height="10" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

// Move: 4-way arrow plus pattern.
const MoveIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M12 3v18 M3 12h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M12 3l-3 3 M12 3l3 3 M12 21l-3 -3 M12 21l3 -3 M3 12l3 -3 M3 12l3 3 M21 12l-3 -3 M21 12l-3 3"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Door: plan-view swing — vertical panel + quarter-arc swing (dashed).
const DoorIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <line x1="5"  y1="20" x2="5"  y2="5"  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="2"  y1="20" x2="5"  y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="2"  y1="5"  x2="5"  y2="5"  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M5 5 A 15 15 0 0 1 20 20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 2" />
  </svg>
);

// Window: double-sash frame — outer rect, vertical mullion, horizontal glazing.
const WindowIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="6" width="16" height="12" stroke="currentColor" strokeWidth="1.6" />
    <line x1="12" y1="6"  x2="12" y2="18" stroke="currentColor" strokeWidth="1.4" />
    <line x1="4"  y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
  </svg>
);

// Room label: rectangle (room outline) with "RM" inside — distinct from the
// free-text tool, since rooms carry sqft data the Rooms tab will compile.
const RoomLabelIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="6" width="18" height="12" stroke="currentColor" strokeWidth="1.6" />
    <text x="12" y="15" textAnchor="middle" fontFamily="ui-sans-serif, system-ui"
          fontSize="8" fontWeight="700" fill="currentColor">RM</text>
  </svg>
);

// Text: free-form annotation — clean "T" with a short underline.
const TextIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M5 6h14 M12 6v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="9"  y1="18" x2="15" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

// Dimension: two extension lines bridged by a dim line with arrowheads.
const DimensionIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 7L5 17 M19 7L19 17 M5 12L19 12" />
      <path d="M5 12L8 10 M5 12L8 14 M19 12L16 10 M19 12L16 14" />
    </g>
  </svg>
);

// Stair: parallel tread lines climbing with a direction arrow.
const StairIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="6"  x2="20" y2="6"  />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="4" y1="14" x2="20" y2="14" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <path d="M12 18 L12 8 M9 11 L12 8 L15 11" strokeLinejoin="round" />
    </g>
  </svg>
);

// Furniture: simple chair-from-above — body + back rail.
const FurnitureIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="5" y="9"  width="14" height="10" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <rect x="5" y="5"  width="14" height="3"  stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

// Line: diagonal stroke with endpoint dots — distinct from Wall.
const LineIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <path d="M4 20L20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="4"  cy="20" r="1.6" fill="currentColor" />
    <circle cx="20" cy="4"  r="1.6" fill="currentColor" />
  </svg>
);

// Trim: scissors — two finger loops + crossing blades + pivot dot.
const TrimIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none">
      <circle cx="6" cy="6"  r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M9 8L21 18 M9 16L21 6" strokeLinecap="round" />
    </g>
    <circle cx="13" cy="12" r="1" fill="currentColor" />
  </svg>
);

// Extend: a line growing (arrow) to meet a boundary bar — the Trim counterpart.
const ExtendIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <line x1="20" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="3"  y1="12" x2="17" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M14 9l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Section: classic A——A' cut symbol — dashed cut line with arrow caps and
// a circle on each end (the section marker).
const SectionIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <g stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="3" />
      <circle cx="19" cy="12" r="3" />
      <line x1="8" y1="12" x2="16" y2="12" strokeDasharray="2.5 2" />
      <path d="M11 9 L14 12 L11 15" />
    </g>
  </svg>
);

// Hatch: a slanted-line fill swatch inside a small frame.
const HatchIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="4" width="16" height="16" stroke="currentColor" strokeWidth="1.6" />
    <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <line x1="4"  y1="10" x2="20" y2="10" />
      <line x1="4"  y1="14" x2="20" y2="14" />
      <line x1="4"  y1="18" x2="20" y2="18" />
    </g>
  </svg>
);

// Mirror: a shape and its reflection across a dashed center axis.
const MirrorIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 2" />
    <path d="M9 6L4 12l5 6z"  stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M15 6l5 6-5 6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

// Erase: classic eraser block (tilted) with diagonal seam.
const EraseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none">
      <path d="M14 4l6 6-10 10H4v-6z" />
      <path d="M9 9l6 6" />
    </g>
  </svg>
);

// Which views a tool is meaningful in. Tools applicable to 'specs' are the
// ones the section drafting workspace can use (select / line / offset /
// trim / dimension / text label). Plan-only tools are still rendered when
// the user is in Specs view, but grayed out — same palette layout, just
// some buttons aren't clickable.
const APPLIES_PLAN: ViewId[] = ['2d'];
// Tools that work in any drafting surface — 2D Plan, Section view, Roof Plan,
// AND Elevations. These are the geometric drawing primitives (select / offset
// / text / dim / line / trim) — same toolset across every drafting view.
const APPLIES_DRAFT: ViewId[] = ['2d', 'specs', 'roof-plan', 'elevations'];
// Draft tools that ALSO work on the Sandbox composite (editing the elevations &
// sections in "simple line" format): select / line / offset / text / dimension
// / trim / erase. (Plan-only tools and Hatch stay out of the Sandbox.)
const APPLIES_DRAFT_SB: ViewId[] = ['2d', 'specs', 'roof-plan', 'elevations', 'sandbox'];
// Hatch is elevation-only — fills a polygon region with a material pattern.
const APPLIES_HATCH: ViewId[] = ['elevations'];

const TOOLS: ToolDef[] = [
  { id: 'select',      label: 'Select',    hint: 'Click to select / V',              glyph: <SelectIcon/>,    enabled: true, applies: APPLIES_DRAFT_SB },
  { id: 'wall',        label: 'Wall',      hint: 'Draw walls / W',                   glyph: <WallIcon/>,      enabled: true, applies: APPLIES_PLAN },
  { id: 'offset',      label: 'Offset',    hint: 'Offset a wall or line / O',        glyph: <OffsetIcon/>,    enabled: true, applies: APPLIES_DRAFT_SB },
  { id: 'move',        label: 'Move',      hint: 'Move selection / M',               glyph: <MoveIcon/>,      enabled: true, applies: APPLIES_PLAN },
  { id: 'door',        label: 'Door',      hint: 'Place a door / D',                 glyph: <DoorIcon/>,      enabled: true, applies: APPLIES_PLAN },
  { id: 'window',      label: 'Window',    hint: 'Place a window / N',               glyph: <WindowIcon/>,    enabled: true, applies: APPLIES_PLAN },
  { id: 'room-label',  label: 'Room',      hint: 'Room label with sqft / R',         glyph: <RoomLabelIcon/>, enabled: true, applies: APPLIES_PLAN },
  { id: 'text',        label: 'Text',      hint: 'Free-form text annotation / X',    glyph: <TextIcon/>,      enabled: true, applies: APPLIES_DRAFT_SB },
  { id: 'dimension',   label: 'Dimension', hint: 'Measure between points / D',       glyph: <DimensionIcon/>, enabled: true, applies: APPLIES_DRAFT_SB },
  { id: 'stair',       label: 'Stairs',    hint: 'Place a stair',                    glyph: <StairIcon/>,     enabled: true, applies: APPLIES_PLAN },
  { id: 'furniture',   label: 'Furniture', hint: 'Place furniture',                  glyph: <FurnitureIcon/>, enabled: true, applies: APPLIES_PLAN },
  { id: 'line',        label: 'Line',      hint: 'Draw a line / L',                  glyph: <LineIcon/>,      enabled: true, applies: APPLIES_DRAFT_SB },
  { id: 'trim',        label: 'Trim',      hint: 'Split a wall/line at a crossing / T', glyph: <TrimIcon/>,   enabled: true, applies: APPLIES_DRAFT_SB },
  { id: 'extend',      label: 'Extend',    hint: 'Extend a line to the nearest boundary', glyph: <ExtendIcon/>, enabled: true, applies: ['sandbox'] },
  { id: 'section',     label: 'Section',   hint: 'Place a section cut / S',          glyph: <SectionIcon/>,   enabled: true, applies: APPLIES_PLAN },
  { id: 'hatch',       label: 'Hatch',     hint: 'Fill a polygon region with a material / H', glyph: <HatchIcon/>, enabled: true, applies: APPLIES_HATCH },
  { id: 'mirror',      label: 'Mirror',    hint: 'Mirror the selection across an X or Y axis', glyph: <MirrorIcon/>, enabled: true, applies: ['sandbox'] },
  { id: 'erase',       label: 'Erase',     hint: 'Click any shape to delete / E',    glyph: <EraseIcon/>,     enabled: true, applies: APPLIES_DRAFT_SB },
];

// Tools the section drafting workspace can act on, in priority order. Exported
// so views/components that consume the unified tool state know the
// section-applicable subset without re-deriving it from TOOLS.
export const SECTION_APPLICABLE_TOOLS: ToolId[] = TOOLS
  .filter(t => t.applies.includes('specs'))
  .map(t => t.id);

// Same idea for the Roof Plan view — the subset of palette tools that do
// something on the roof plan. Same list as SECTION_APPLICABLE_TOOLS today;
// kept separate so they can diverge without ripple.
export const ROOF_APPLICABLE_TOOLS: ToolId[] = TOOLS
  .filter(t => t.applies.includes('roof-plan'))
  .map(t => t.id);

// Same idea for the Elevations view — draft tools + the elevation-only Hatch.
export const ELEVATION_APPLICABLE_TOOLS: ToolId[] = TOOLS
  .filter(t => t.applies.includes('elevations'))
  .map(t => t.id);

// Sandbox composite — select / offset / text / dimension / trim / erase. These
// edit the elevations & sections in "simple line" format (no Line/plan tools).
export const SANDBOX_APPLICABLE_TOOLS: ToolId[] = TOOLS
  .filter(t => t.applies.includes('sandbox'))
  .map(t => t.id);

export default function ToolPalette({
  tool, onChange, view = '2d',
}: { tool: ToolId; onChange: (t: ToolId) => void; view?: ViewId }) {
  return (
    <aside style={{
      width: 64, flexShrink: 0, background: T.panel,
      borderRight: `1px solid ${T.line}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 0', gap: 4,
    }}>
      {TOOLS.map(t => {
        const applicable = t.applies.includes(view);
        const enabled = t.enabled && applicable;
        const active = enabled && tool === t.id;
        return (
          <button
            key={t.id}
            disabled={!enabled}
            onClick={() => enabled && onChange(t.id)}
            title={applicable ? `${t.label} — ${t.hint}` : `${t.label} — not available in this view`}
            style={{
              width: 44, height: 44, borderRadius: 8,
              background: active ? T.accentSoft : 'transparent',
              border: active ? `1px solid rgba(79,124,255,0.3)` : '1px solid transparent',
              color: active ? T.accentInk : enabled ? T.inkSoft : T.inkMuted,
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.35,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 120ms, border-color 120ms, color 120ms',
            }}
            onMouseEnter={e => {
              if (!active && enabled) {
                e.currentTarget.style.background = T.bg;
                e.currentTarget.style.color = T.ink;
              }
            }}
            onMouseLeave={e => {
              if (!active && enabled) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = T.inkSoft;
              }
            }}
          >
            {t.glyph}
          </button>
        );
      })}
    </aside>
  );
}
