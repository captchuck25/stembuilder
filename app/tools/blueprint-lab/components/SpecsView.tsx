'use client';

// Building Specs view — project-wide structural data sheet with a live
// architectural cross-section preview. Drives 3D, Elevations, Roof Plan,
// and (future) Cross-section. See `engine/structural.ts` for derivations.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConcreteWallThickness, CeilingJoistDepth, ExteriorMaterial,
  FOUNDATION_WALL_HEIGHT_DEFAULT, FloorSpecs, FoundationSpecs, FoundationType,
  GRADE_TO_FIRST_FLOOR_DEFAULT, JoistDepth, LUMBER_ACTUAL_DEPTH, PrimLine,
  Project, RafterDepth, SectionCut, SectionLineStyle, SectionPrimitive, SectionTool,
  StructuralSpecs, ToolId, Vec2, formatJoistLabel,
} from '../engine/types';
import {
  KEYWAY_DEPTH, KEYWAY_WIDTH,
  buildSectionStack, computeBuildingWidth, computeFootingWidth, getStructural,
} from '../engine/structural';
import {
  DIM_CHAIN_OFFSET_IN, OVERALL_DIM_OFFSET_IN, TO_LINE_INSET_IN,
  analyzeSectionCut, buildPrimarySectionCut, buildSectionPrimitives, classifySectionRoof,
  getSectionPrimitives, renderSectionPrimitives,
} from '../engine/sectionPrimitives';
import { SnapResult, drawSnapIndicator, findSnap } from '../engine/sectionSnap';
import {
  addPrimitive, computeBoxSelection, computeLineExtend, drawDimGhost, drawFilletGhost, drawLineGhost, drawLineHandles,
  drawOffsetGhost, drawOffsetSource, drawSelectionBox, drawSelectionOverlay,
  explodePrimitives, filletLines, hitTestLineBody, hitTestLineHandle,
  hitTestTopmost, makeUserDimLinear, makeUserLine, makeUserText, mirrorReflector, moveLineEndpoint,
  offsetLineCopy, reflectPrimitives, removePrimitives, replaceLinePrimitive, replacePrimitiveWithMany,
  setDraftingPrimitives, signedPerpendicularOffset, translatePrimitivesBy, trimLineByClick, trimPolylineByClick,
} from '../engine/sectionEdit';
import { T } from '../engine/theme';

// Map between the unified ToolId (used by the main left toolbar) and the
// SectionTool the cross-section canvas speaks. The plan tools that have a
// section equivalent reuse the same icon: 'dimension' ↔ 'dim' (linear dim),
// 'room-label' ↔ 'text' (label). Everything else collapses to 'select'.
function toolIdToSectionTool(t?: ToolId): SectionTool {
  switch (t) {
    case 'line':       return 'line';
    case 'offset':     return 'offset';
    case 'trim':       return 'trim';
    case 'extend':     return 'extend';
    case 'mirror':     return 'mirror';
    case 'fillet':     return 'fillet';
    case 'dimension':  return 'dim';
    case 'room-label': return 'text';
    case 'text':       return 'text';
    case 'erase':      return 'erase';
    case 'select':     return 'select';
    default:           return 'select';
  }
}
const FOUNDATION_LABELS: Record<FoundationType, string> = {
  'slab':             'Slab on grade',
  'crawlspace':       'Crawl space',
  'full-basement':    'Full basement',
};

const EXTERIOR_LABELS: Record<ExteriorMaterial, string> = {
  'lap-siding':   'Lap siding',
  'board-batten': 'Board & batten',
  'brick':        'Brick',
  'stone':        'Stone',
  'stucco':       'Stucco',
  'shake':        'Shake / shingle',
};

const FOUNDATION_OPTIONS: FoundationType[] = ['slab', 'crawlspace', 'full-basement'];
const CONCRETE_WALL_OPTIONS: ConcreteWallThickness[] = [8, 10, 12];
const JOIST_OPTIONS: JoistDepth[] = [8, 10, 12, 14];
const CEILING_OPTIONS: CeilingJoistDepth[] = [8, 10, 12];
const EXTERIOR_OPTIONS: ExteriorMaterial[] = ['lap-siding', 'board-batten', 'brick', 'stone', 'stucco', 'shake'];
const RAFTER_OPTIONS: RafterDepth[] = [6, 8, 10, 12];

export default function SpecsView({ project, onChange, tool, onChangeTool }: {
  project: Project;
  onChange: (p: Project) => void;
  // Unified active tool from the main toolbar. SpecsView translates it to a
  // SectionTool internally (see toolIdToSectionTool below). Optional so the
  // component remains usable in test/embed contexts where the parent doesn't
  // pass it — defaults to 'select'.
  tool?: ToolId;
  onChangeTool?: (t: ToolId) => void;
}) {
  const s = getStructural(project);

  function patch(next: Partial<StructuralSpecs>) {
    onChange({ ...project, structural: { ...s, ...next } });
  }
  function patchFoundation(next: Partial<FoundationSpecs>) {
    patch({ foundation: { ...s.foundation, ...next } });
  }
  function patchFirstFloor(next: Partial<FloorSpecs>) {
    patch({ firstFloor: { ...s.firstFloor, ...next } });
  }
  function patchSecondFloor(next: Partial<FloorSpecs>) {
    if (!s.secondFloor) return;
    patch({ secondFloor: { ...s.secondFloor, ...next } });
  }
  function patchRoof(next: Partial<typeof project.roof>) {
    onChange({ ...project, roof: { ...project.roof, ...next } });
  }

  // Foundation type drives a default wall height AND a default grade height.
  // Auto-snap both on type change so the section preview reflects sensible
  // defaults (e.g. slab → 28" stem wall, 10" grade-to-floor).
  function setFoundationType(type: FoundationType) {
    patchFoundation({
      type,
      wallHeight: FOUNDATION_WALL_HEIGHT_DEFAULT[type],
      gradeToFirstFloor: GRADE_TO_FIRST_FLOOR_DEFAULT[type],
    });
  }

  function addSecondFloor() {
    patch({ secondFloor: { joistDepth: 10, plateHeight: 96 } });
  }
  function removeSecondFloor() {
    const { secondFloor: _drop, ...rest } = s;
    onChange({ ...project, structural: rest });
  }

  const footingWidth = computeFootingWidth(s.foundation);
  const isOverride = s.foundation.footingWidthOverride !== undefined;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: T.bg }}>
      {/* ─── Form panel ─────────────────────────────────────────────────── */}
      <div style={{
        width: 380, overflow: 'auto', padding: '20px 22px',
        background: T.panel, borderRight: `1px solid ${T.line}`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
          color: T.accent, textTransform: 'uppercase', marginBottom: 6,
        }}>Building Specs</div>
        <div style={{ fontSize: 12, color: T.inkSoft, marginBottom: 18, lineHeight: 1.5 }}>
          Project-wide structural data. Feeds 3D, Elevations, and the future cross-section view.
        </div>

        {/* Foundation ──────────────────────────────────────────────── */}
        <Section title="Foundation">
          <Row label="Type">
            <Select<FoundationType>
              value={s.foundation.type}
              options={FOUNDATION_OPTIONS}
              labels={FOUNDATION_LABELS}
              onChange={setFoundationType}
            />
          </Row>
          {s.foundation.type !== 'slab' && (
            <>
              <Row label="Wall thickness">
                <Select<ConcreteWallThickness>
                  value={s.foundation.wallThickness}
                  options={CONCRETE_WALL_OPTIONS}
                  labels={Object.fromEntries(CONCRETE_WALL_OPTIONS.map(n => [n, `${n}"`])) as Record<ConcreteWallThickness, string>}
                  onChange={(v) => patchFoundation({ wallThickness: v })}
                />
              </Row>
              <Row label="Wall height">
                <NumberInput
                  value={s.foundation.wallHeight}
                  unit='"'
                  min={0}
                  onChange={(v) => patchFoundation({ wallHeight: v })}
                />
              </Row>
              <Row label="Footing width">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {isOverride ? (
                    <NumberInput
                      value={s.foundation.footingWidthOverride!}
                      unit='"'
                      min={s.foundation.wallThickness + 2}
                      onChange={(v) => patchFoundation({ footingWidthOverride: v })}
                    />
                  ) : (
                    <DerivedValue value={`${footingWidth}"`} hint="(wall + 8)" />
                  )}
                  <button
                    type="button"
                    onClick={() => patchFoundation({
                      footingWidthOverride: isOverride ? undefined : footingWidth,
                    })}
                    style={miniBtn(isOverride)}
                    title={isOverride ? 'Restore auto-derived width' : 'Override derived width'}
                  >
                    {isOverride ? '↺ auto' : '✎ override'}
                  </button>
                </div>
              </Row>
              <Row label="Footing thickness">
                <NumberInput
                  value={s.foundation.footingThickness}
                  unit='"'
                  min={6}
                  onChange={(v) => patchFoundation({ footingThickness: v })}
                />
              </Row>
            </>
          )}
          <Row label="Slab thickness">
            <NumberInput
              value={s.foundation.slabThickness}
              unit='"'
              min={2}
              onChange={(v) => patchFoundation({ slabThickness: v })}
            />
          </Row>
          {s.foundation.type !== 'slab' && (
            <Row label="Keyway">
              <Checkbox
                checked={s.foundation.keyway}
                onChange={(c) => patchFoundation({ keyway: c })}
                hint={`${KEYWAY_WIDTH}" × ${KEYWAY_DEPTH}" centered`}
              />
            </Row>
          )}
          <Row label="Grade to 1st floor">
            <NumberInput
              value={s.foundation.gradeToFirstFloor ?? 18}
              unit='"'
              min={0}
              onChange={(v) => patchFoundation({ gradeToFirstFloor: v })}
            />
          </Row>
        </Section>

        {/* First floor ─────────────────────────────────────────────── */}
        <Section title="First floor">
          <Row label="Floor joists">
            <Select<JoistDepth>
              value={s.firstFloor.joistDepth}
              options={JOIST_OPTIONS}
              labels={Object.fromEntries(JOIST_OPTIONS.map(n => [n, formatJoistLabel(n)])) as Record<JoistDepth, string>}
              onChange={(v) => patchFirstFloor({ joistDepth: v })}
            />
          </Row>
          <Row label="Plate height">
            <NumberInput
              value={s.firstFloor.plateHeight}
              unit='"'
              min={84}
              onChange={(v) => patchFirstFloor({ plateHeight: v })}
            />
          </Row>
        </Section>

        {/* Second floor ────────────────────────────────────────────── */}
        {s.secondFloor ? (
          <Section title="Second floor" onRemove={removeSecondFloor}>
            <Row label="Floor joists">
              <Select<JoistDepth>
                value={s.secondFloor.joistDepth}
                options={JOIST_OPTIONS}
                labels={Object.fromEntries(JOIST_OPTIONS.map(n => [n, formatJoistLabel(n)])) as Record<JoistDepth, string>}
                onChange={(v) => patchSecondFloor({ joistDepth: v })}
              />
            </Row>
            <Row label="Plate height">
              <NumberInput
                value={s.secondFloor.plateHeight}
                unit='"'
                min={84}
                onChange={(v) => patchSecondFloor({ plateHeight: v })}
              />
            </Row>
          </Section>
        ) : (
          <button type="button" onClick={addSecondFloor} style={addRowBtn}>
            + Add second floor
          </button>
        )}

        {/* Ceiling ─────────────────────────────────────────────────── */}
        <Section title="Ceiling (top floor)">
          <Row label="Ceiling joists">
            <Select<CeilingJoistDepth>
              value={s.ceiling.joistDepth}
              options={CEILING_OPTIONS}
              labels={Object.fromEntries(CEILING_OPTIONS.map(n => [n, `2×${n}`])) as Record<CeilingJoistDepth, string>}
              onChange={(v) => patch({ ceiling: { ...s.ceiling, joistDepth: v } })}
            />
          </Row>
        </Section>

        {/* Exterior ────────────────────────────────────────────────── */}
        <Section title="Exterior">
          <Row label="Default material">
            <Select<ExteriorMaterial>
              value={s.exteriorMaterial}
              options={EXTERIOR_OPTIONS}
              labels={EXTERIOR_LABELS}
              onChange={(v) => patch({ exteriorMaterial: v })}
            />
          </Row>
        </Section>

        {/* Roof ────────────────────────────────────────────────────── */}
        <Section title="Roof">
          <Row label="Type">
            <Select<'gable' | 'hip' | 'flat'>
              value={project.roof.type}
              options={['gable', 'hip', 'flat']}
              labels={{ gable: 'Gable', hip: 'Hip', flat: 'Flat' }}
              onChange={(v) => patchRoof({ type: v })}
            />
          </Row>
          <Row label="Pitch">
            <NumberInput
              value={project.roof.pitch}
              unit="/12"
              min={0}
              max={18}
              onChange={(v) => patchRoof({ pitch: v })}
            />
          </Row>
          <Row label="Rafters">
            <Select<RafterDepth>
              value={project.roof.rafterDepth ?? 10}
              options={RAFTER_OPTIONS}
              labels={Object.fromEntries(RAFTER_OPTIONS.map(n => [n, `2×${n}`])) as Record<RafterDepth, string>}
              onChange={(v) => patchRoof({ rafterDepth: v })}
            />
          </Row>
          <Row label="Overhang">
            <NumberInput
              value={project.roof.overhang}
              unit='"'
              min={0}
              onChange={(v) => patchRoof({ overhang: v })}
            />
          </Row>
          <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 4, lineHeight: 1.5 }}>
            Per-edge overhangs, cross-gables, and dormers ship in the Roof Plan view.
          </div>
        </Section>
      </div>

      {/* ─── Live cross-section preview ─────────────────────────────────── */}
      <SectionPreviewPane project={project} onChange={onChange} tool={tool} onChangeTool={onChangeTool} />
    </div>
  );
}

// Right-hand pane of the Specs view: header with Customize / Reset controls,
// optional drafting-mode warning banner, and the section canvas. Owns the
// drafting tool state (Select / Line / Trim / Dim / Text) and threads the
// active tool down to the canvas; Phase F wires the tool behaviors.
function SectionPreviewPane({ project, onChange, tool, onChangeTool }: {
  project: Project;
  onChange: (p: Project) => void;
  tool?: ToolId;
  onChangeTool?: (t: ToolId) => void;
}) {
  // Which section the user is currently viewing. `null` = the Typical section
  // (procedural cross-section, the default). A string id = a placed
  // SectionCut. The Specs view's tab strip switches between them.
  const [activeCutId, setActiveCutId] = useState<string | null>(
    () => project.sectionCuts?.[0]?.id ?? null,
  );
  // Keep the selection valid. There is no "Typical" any more — the first
  // section the user places is the primary one — so if the active cut was
  // deleted, or nothing is selected while cuts exist, snap to the first cut.
  useEffect(() => {
    const cuts = project.sectionCuts ?? [];
    if (activeCutId != null && cuts.some(c => c.id === activeCutId)) return;
    setActiveCutId(cuts[0]?.id ?? null);
  }, [project.sectionCuts, activeCutId]);

  const drafting = activeCutId == null
    ? !!project.sectionDrafting?.typical?.length
    : !!project.sectionDrafting?.cuts?.[activeCutId]?.length;
  // Translate the unified ToolId (from the main toolbar) into the
  // SectionTool the cross-section canvas speaks. Plan-only ToolIds collapse
  // to 'select' so the canvas stays in a safe no-op state.
  const activeTool: SectionTool = toolIdToSectionTool(tool);

  // ── Undo / Redo history ─────────────────────────────────────────────────
  // Stacks of full Project snapshots. Each undoable action pushes the
  // PREVIOUS project onto `undo` and clears `redo`. Ctrl+Z restores from
  // undo (pushing current onto redo); Ctrl+Y / Ctrl+Shift+Z replays redo.
  // Limited to 50 entries — enough for any reasonable edit session.
  const UNDO_LIMIT = 50;
  const [undoStack, setUndoStack] = useState<Project[]>([]);
  const [redoStack, setRedoStack] = useState<Project[]>([]);
  const pushUndo = useCallback(() => {
    setUndoStack(s => {
      const next = [...s, project];
      return next.length > UNDO_LIMIT ? next.slice(next.length - UNDO_LIMIT) : next;
    });
    setRedoStack([]);
  }, [project]);
  const onUndo = useCallback(() => {
    setUndoStack(stack => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setRedoStack(r => [...r, project]);
      onChange(restored);
      return stack.slice(0, -1);
    });
  }, [project, onChange]);
  const onRedo = useCallback(() => {
    setRedoStack(stack => {
      if (stack.length === 0) return stack;
      const restored = stack[stack.length - 1];
      setUndoStack(u => [...u, project]);
      onChange(restored);
      return stack.slice(0, -1);
    });
  }, [project, onChange]);

  // Reset to the select tool whenever drafting mode ends, so leaving and
  // re-entering drafting doesn't strand the user on a draw tool.
  useEffect(() => {
    if (!drafting && tool && tool !== 'select' && onChangeTool) onChangeTool('select');
  }, [drafting, tool, onChangeTool]);

  // Keyboard shortcuts (only while drafting):
  //   V/L/T/D/X — tool selection (mapped to the unified ToolId)
  //   Ctrl+Z / Cmd+Z — undo
  //   Ctrl+Y / Ctrl+Shift+Z — redo
  // Ignored when the user is typing in an input.
  useEffect(() => {
    if (!drafting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) { onUndo(); e.preventDefault(); return; }
        if ((k === 'z' && e.shiftKey) || k === 'y') { onRedo(); e.preventDefault(); return; }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const next: ToolId | null =
        k === 'v' ? 'select'
        : k === 'l' ? 'line'
        : k === 'o' ? 'offset'
        : k === 't' ? 'trim'
        : k === 'd' ? 'dimension'
        : k === 'x' ? 'room-label'
        : null;
      if (!next) return;
      onChangeTool?.(next);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drafting, onUndo, onRedo, onChangeTool]);

  const onCustomize = useCallback(() => {
    const ok = window.confirm(
      'Customize this drawing?\n\n'
      + 'The section will be frozen — changes to your structural specs '
      + 'will no longer update it. You can reset back to the auto-generated '
      + 'drawing at any time, but any custom edits will be lost.'
    );
    if (!ok) return;
    // Explode the procedural primitives into individual line segments so
    // every edge (including lumber-X diagonals) is its own selectable piece
    // the user can click, drag, or delete. For a placed cut, the procedural
    // section is built with cut-derived width + interior wall blocks.
    const activeCut = activeCutId == null
      ? undefined
      : (project.sectionCuts ?? []).find(c => c.id === activeCutId);
    const snapshot = explodePrimitives(buildSectionPrimitives(project, activeCut));
    pushUndo();
    const drafting = project.sectionDrafting ?? {};
    if (activeCutId == null) {
      onChange({ ...project, sectionDrafting: { ...drafting, typical: snapshot } });
    } else {
      onChange({
        ...project,
        sectionDrafting: {
          ...drafting,
          cuts: { ...(drafting.cuts ?? {}), [activeCutId]: snapshot },
        },
      });
    }
  }, [project, activeCutId, onChange, pushUndo]);

  const onReset = useCallback(() => {
    const ok = window.confirm(
      'Reset this drawing to auto?\n\n'
      + 'All customizations will be discarded and the section will be '
      + 'driven by your structural specs again.'
    );
    if (!ok) return;
    pushUndo();
    const next = { ...project.sectionDrafting };
    if (activeCutId == null) {
      delete next.typical;
    } else if (next.cuts) {
      const cuts = { ...next.cuts };
      delete cuts[activeCutId];
      next.cuts = Object.keys(cuts).length ? cuts : undefined;
    }
    const nextDrafting = (next.typical || (next.cuts && Object.keys(next.cuts).length))
      ? next : undefined;
    onChange({ ...project, sectionDrafting: nextDrafting });
  }, [project, activeCutId, onChange, pushUndo]);

  // Auto-place the mandated first section: a transverse cut across the primary
  // ridge at its widest point, so overall height is established before anything
  // else. The engine picks the ridge + position; the user can nudge it after.
  const onPlacePrimary = useCallback(() => {
    const cut = buildPrimarySectionCut(project);
    if (!cut) {
      window.alert(
        'No roof yet.\n\nThe primary section is cut straight across the main ridge to '
        + 'establish overall building height — so draw your roof on the Roof Plan first.',
      );
      return;
    }
    pushUndo();
    onChange({ ...project, sectionCuts: [...(project.sectionCuts ?? []), cut] });
    setActiveCutId(cut.id);
  }, [project, onChange, pushUndo]);

  const activeCutName = activeCutId == null
    ? null
    : (project.sectionCuts ?? []).find(c => c.id === activeCutId)?.name ?? null;
  const headerLabel = activeCutId == null
    ? (drafting ? 'Customized typical cross-section' : 'Live typical cross-section preview')
    : (drafting ? `Section ${activeCutName}-${activeCutName}' (drafting mode)` : `Section ${activeCutName}-${activeCutName}'`);

  // No section yet → no drawing. The Section tab opens on a prompt to place the
  // mandated primary section (across the main ridge) rather than a "Typical".
  if ((project.sectionCuts ?? []).length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 24 }}>
        <div style={{
          maxWidth: 460, textAlign: 'center', background: T.panel2,
          border: `1px solid ${T.line}`, borderRadius: 12, padding: '32px 34px',
        }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>⌖</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 8 }}>
            Start with the primary section
          </div>
          <p style={{ fontSize: 12.5, lineHeight: 1.55, color: T.inkSoft, margin: '0 0 20px' }}>
            Your first section cuts straight across the <strong>main ridge</strong>, at the widest
            part of the building — so it establishes the overall roof height. Every section you
            add after this reads against that height.
          </p>
          <button
            type="button" onClick={onPlacePrimary}
            style={{
              fontSize: 13, fontWeight: 700, color: '#fff', background: T.accent,
              border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer',
            }}
          >
            Place primary section (A‑A)
          </button>
          <div style={{ fontSize: 11, color: T.inkSoft, marginTop: 14, opacity: 0.85 }}>
            Or draw a section line yourself on the plan with the Section tool.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SectionTabStrip
        cuts={project.sectionCuts ?? []}
        activeCutId={activeCutId}
        onChange={setActiveCutId}
        draftingByScope={(id) => id == null
          ? !!project.sectionDrafting?.typical?.length
          : !!project.sectionDrafting?.cuts?.[id]?.length}
      />
      <div style={{
        padding: '8px 18px', borderBottom: `1px solid ${T.line}`,
        background: T.panel2, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 700,
          letterSpacing: '0.6px', color: T.inkSoft, textTransform: 'uppercase',
        }}>
          {headerLabel}
        </span>
        {drafting ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button" onClick={onUndo} disabled={undoStack.length === 0}
              style={{ ...customizeBtn, opacity: undoStack.length === 0 ? 0.4 : 1 }}
              title="Undo (Ctrl+Z)"
            >↶ Undo</button>
            <button
              type="button" onClick={onRedo} disabled={redoStack.length === 0}
              style={{ ...customizeBtn, opacity: redoStack.length === 0 ? 0.4 : 1 }}
              title="Redo (Ctrl+Y)"
            >↷ Redo</button>
            <button type="button" onClick={onReset} style={resetBtn} title="Discard customizations and return to the auto-generated drawing.">
              ↺ Reset to auto
            </button>
          </div>
        ) : (
          <button type="button" onClick={onCustomize} style={customizeBtn} title="Freeze this drawing so you can edit individual lines. Structural-spec changes won't affect it.">
            ✎ Customize this drawing
          </button>
        )}
      </div>
      {drafting && <DraftingWarningBanner />}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <CrossSectionCanvas
          project={project}
          onChange={onChange}
          pushUndo={pushUndo}
          activeTool={drafting ? activeTool : 'select'}
          drafting={drafting}
          activeCutId={activeCutId}
        />
        {/* Floating section tool palette removed — tools live in the unified
            main toolbar on the left (ToolPalette grays out plan-only tools
            when in this view). */}
      </div>
    </div>
  );
}

// Horizontal tab strip at the top of the Specs view that switches the
// section view between the Typical drawing and any placed SectionCut. Tabs
// with a customized drafting snapshot get a small dot marker so users can
// see at a glance which sections they've edited.
function SectionTabStrip({ cuts, activeCutId, onChange, draftingByScope }: {
  cuts: SectionCut[];
  activeCutId: string | null;
  onChange: (id: string | null) => void;
  draftingByScope: (id: string | null) => boolean;
}) {
  // No "Typical" tab — the section view only shows placed cuts now. The first
  // one is the mandated primary section across the main ridge.
  const tabs: { id: string | null; label: string }[] =
    cuts.map(c => ({ id: c.id, label: `Section ${c.name}-${c.name}'` }));
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch',
      borderBottom: `1px solid ${T.line}`, background: T.panel,
      padding: '0 12px',
    }}>
      {tabs.map(t => {
        const active = t.id === activeCutId;
        const isDrafting = draftingByScope(t.id);
        return (
          <button
            key={t.id ?? 'typical'}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 12px',
              background: active ? T.panel2 : 'transparent',
              color: active ? T.ink : T.inkSoft,
              border: 'none',
              borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
              borderRadius: 0,
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.4px', textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'ui-sans-serif, system-ui',
            }}
            title={t.id == null
              ? 'The procedural typical cross-section derived from your structural specs.'
              : 'A cross-section taken at this cut line on the floor plan.'}
          >
            <span>{t.label}</span>
            {isDrafting && (
              <span title="Customized" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#F59E0B',  // amber dot = customized
                flexShrink: 0,
              }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// (Floating section tool palette removed — section drafting tools now live
// in the unified main toolbar on the left side of the workspace. See the
// `ToolPalette` component and its `view`-aware gray-out logic.)

function DraftingWarningBanner() {
  return (
    <div style={{
      padding: '6px 18px',
      background: '#FEF3C7',                       // amber-100
      borderBottom: '1px solid #FCD34D',           // amber-300
      color: '#78350F',                            // amber-900
      fontSize: 11, lineHeight: 1.5,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <span style={{ fontSize: 13, lineHeight: 1 }}>⚠</span>
      <span>
        <strong>Customized drawing.</strong>{' '}
        Changes to the structural specs on the left no longer update this section.
        Use <em>Reset to auto</em> to bring back the auto-generated version.
      </span>
    </div>
  );
}

const customizeBtn: React.CSSProperties = {
  padding: '5px 12px', fontSize: 11, fontWeight: 600,
  background: T.panel, color: T.ink,
  border: `1px solid ${T.lineStrong}`, borderRadius: 6, cursor: 'pointer',
};
const resetBtn: React.CSSProperties = {
  padding: '5px 12px', fontSize: 11, fontWeight: 600,
  background: '#FEF3C7', color: '#78350F',
  border: '1px solid #FCD34D', borderRadius: 6, cursor: 'pointer',
};

// ─── Form atoms ──────────────────────────────────────────────────────────────

function Section({ title, onRemove, children }: {
  title: string; onRemove?: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{
      marginBottom: 18, padding: '12px 14px',
      background: T.panel2, border: `1px solid ${T.line}`,
      borderRadius: 8,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 10,
        letterSpacing: '0.3px',
      }}>
        <span>{title}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} style={{
            background: 'none', border: 'none', color: T.danger,
            fontSize: 11, cursor: 'pointer', padding: 0,
          }}>Remove</button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{
      display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: 10,
      fontSize: 12, color: T.inkSoft,
    }}>
      <span>{label}</span>
      <div>{children}</div>
    </label>
  );
}

function Select<V extends string | number>({ value, options, labels, onChange }: {
  value: V;
  options: V[];
  labels: Record<string | number, string>;
  onChange: (v: V) => void;
}) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const raw = e.target.value;
        // Try to coerce back to the original type — Select<number> usage works.
        const next = typeof options[0] === 'number' ? (Number(raw) as V) : (raw as V);
        onChange(next);
      }}
      style={selectStyle}
    >
      {options.map(o => (
        <option key={String(o)} value={String(o)}>{labels[String(o)] ?? String(o)}</option>
      ))}
    </select>
  );
}

function NumberInput({ value, unit, min, max, onChange }: {
  value: number; unit?: string; min?: number; max?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return;
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={numberInputStyle}
      />
      {unit && <span style={{ fontSize: 11, color: T.inkMuted }}>{unit}</span>}
    </div>
  );
}

function Checkbox({ checked, onChange, hint }: {
  checked: boolean; onChange: (c: boolean) => void; hint?: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: 'pointer' }}
      />
      {hint && <span style={{ fontSize: 11, color: T.inkMuted }}>{hint}</span>}
    </div>
  );
}

function DerivedValue({ value, hint }: { value: string; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block', padding: '4px 8px',
        background: T.bg, border: `1px solid ${T.line}`,
        borderRadius: 6, fontSize: 12, color: T.ink,
        fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      {hint && <span style={{ fontSize: 11, color: T.inkMuted }}>{hint}</span>}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '5px 8px', fontSize: 12, color: T.ink,
  background: T.panel, border: `1px solid ${T.lineStrong}`,
  borderRadius: 6, cursor: 'pointer', minWidth: 110,
};

const numberInputStyle: React.CSSProperties = {
  width: 70, padding: '5px 8px', fontSize: 12, color: T.ink,
  background: T.panel, border: `1px solid ${T.lineStrong}`,
  borderRadius: 6, fontVariantNumeric: 'tabular-nums',
};

const addRowBtn: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  background: T.panel2, border: `1px dashed ${T.lineStrong}`,
  color: T.inkSoft, fontSize: 12, fontWeight: 600,
  borderRadius: 8, cursor: 'pointer', marginBottom: 18,
  transition: 'all 120ms',
};

function miniBtn(active: boolean): React.CSSProperties {
  return {
    padding: '3px 8px', fontSize: 10.5, fontWeight: 600,
    background: active ? T.accentSoft : T.panel,
    color: active ? T.accentInk : T.inkSoft,
    border: `1px solid ${active ? T.accent : T.lineStrong}`,
    borderRadius: 5, cursor: 'pointer',
  };
}

// ─── Cross-section canvas ────────────────────────────────────────────────────
// A to-scale, zoomable, pannable architectural section. Defaults to
// 1/2" = 1'-0" (1:24), falling back to 1/4" = 1'-0" (1:48) if a 2-story
// home doesn't fit at 1/2". Mirrors the 2D plan canvas UX: scroll-to-zoom,
// drag-to-pan, Fit / 100% / scale toolbar.

type ScaleMode = 'half' | 'quarter';
// World inches → screen pixels at zoom 1.0. Architectural-scale aware:
//   1/2"=1'-0" ⇒ 0.5 paper-in per 12 world-in × 96 CSS-px/in ÷ 12 = 4 px/in
//   1/4"=1'-0" ⇒ 2 px/in
const SCALE_PX_PER_INCH: Record<ScaleMode, number> = { half: 4, quarter: 2 };
const SCALE_LABEL: Record<ScaleMode, string> = {
  half:    '1/2" = 1\'-0"',
  quarter: '1/4" = 1\'-0"',
};
// Dim-chain X positions in world inches, anchored relative to the LEFT
// outside-wall face. The chain hangs off to the left of the structure at a
// real architectural distance (so panning/zooming feels right).
// Dim-chain layout constants live in engine/sectionPrimitives.ts so the
// section bounds (here) and the section builder stay in sync.

interface VP {
  panX: number;       // screen-pixel offset from center
  panY: number;
  zoom: number;       // multiplicative; 1.0 = chosen scale mode 1:1
  scaleMode: ScaleMode;
  width: number;      // viewport CSS pixels
  height: number;
}

function pxPerInchOf(vp: VP): number {
  return SCALE_PX_PER_INCH[vp.scaleMode] * vp.zoom;
}

// World (section coords, Y-up) → screen pixels.
function makeProjector(vp: VP) {
  const px = pxPerInchOf(vp);
  const cx = vp.panX + vp.width / 2;
  const cy = vp.panY + vp.height / 2;
  return {
    px,
    zoom: vp.zoom,    // exposed so renderers can scale text + drafting indicators
    sx: (xIn: number) => cx + xIn * px,
    sy: (yIn: number) => cy - yIn * px,
    // Inverse — useful for snap / pointer math.
    wx: (sx: number) => (sx - cx) / px,
    wy: (sy: number) => (cy - sy) / px,
  };
}

// Parses the LENGTH portion of a line-tool input. Returns inches.
// Accepts:
//   "12"        → 12"     (plain inches)
//   "12.5"      → 12.5"   (decimal inches)
//   "6\""       → 6"      (explicit inch mark)
//   "12'"       → 144"    (feet)
//   "12'6"      → 150"    (feet + inches)
//   "12'6\""    → 150"    (feet + inches with explicit mark)
//   "1'-6\""    → 18"     (dash separator, common architectural form)
// Returns null on empty / malformed input.
function parseLengthInches(s: string): number | null {
  const cleaned = s.trim().replace(/[\s-]/g, '');
  if (!cleaned) return null;
  // (optional N') (optional N optional ")
  const m = cleaned.match(/^(?:(\d+(?:\.\d+)?)')?(?:(\d+(?:\.\d+)?)"?)?$/);
  if (!m) return null;
  // Must match at least one of feet / inches.
  if (m[1] === undefined && m[2] === undefined) return null;
  const ft = m[1] !== undefined ? parseFloat(m[1]) : 0;
  const inch = m[2] !== undefined ? parseFloat(m[2]) : 0;
  const total = ft * 12 + inch;
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

// Constrains the cursor to horizontal or vertical from the anchor — whichever
// axis the cursor is dominant on. Used to give the Line tool an "ortho"
// default direction.
function applyOrthoFromCursor(anchor: Vec2, cursor: Vec2): Vec2 {
  const dx = cursor.x - anchor.x;
  const dy = cursor.y - anchor.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: cursor.x, y: anchor.y };   // horizontal
  }
  return { x: anchor.x, y: cursor.y };     // vertical
}

// Parses the dynamic-input box used by the Line tool. Returns the resulting
// endpoint in world coords (relative to `anchor`), or null if the input is
// empty / invalid. Two forms:
//   "12"        → 12" in the cursor's ortho direction (nearest H or V)
//   "12'"       → 144" in the cursor's ortho direction
//   "12@45"     → 12" at 45° from horizontal (positive = CCW in world Y-up)
//   "12'6@-30"  → 12'6" at -30° from horizontal
// Negative angles are allowed. Length must be positive.
function parseTypedLineInput(
  input: string,
  anchor: Vec2,
  cursor: Vec2 | null,
): Vec2 | null {
  const trim = input.trim();
  if (!trim) return null;
  // Split at @ — everything before is the length, everything after is the angle.
  const atIdx = trim.indexOf('@');
  const lengthStr = atIdx >= 0 ? trim.slice(0, atIdx) : trim;
  const angleStr  = atIdx >= 0 ? trim.slice(atIdx + 1).trim() : null;

  const length = parseLengthInches(lengthStr);
  if (length === null) return null;

  let angleRad: number;
  if (angleStr !== null) {
    const angleDeg = parseFloat(angleStr);
    if (!Number.isFinite(angleDeg)) return null;
    angleRad = angleDeg * Math.PI / 180;
  } else if (cursor) {
    // Length only → ortho direction based on which axis the cursor is on.
    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      angleRad = dx >= 0 ? 0 : Math.PI;
    } else {
      angleRad = dy >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
  } else {
    angleRad = 0;
  }
  return {
    x: anchor.x + Math.cos(angleRad) * length,
    y: anchor.y + Math.sin(angleRad) * length,
  };
}

// Picks the endpoint the user expects when they click the second time. Same
// priority as the ghost preview so the committed line matches what they saw:
//   1. Parsed typed input (length / length@angle)
//   2. Non-grid snap (endpoint/midpoint/intersection/on-edge) — overrides ortho
//   3. Ortho-constrained cursor (H/V nearest cursor)
function resolveLineEndpoint(
  anchor: Vec2,
  cursor: Vec2 | null,
  snap: SnapResult | null,
  input: string,
): Vec2 | null {
  const cursorForTyped = snap?.point ?? cursor;
  const typed = parseTypedLineInput(input, anchor, cursorForTyped);
  if (typed) return typed;
  if (snap && snap.kind !== 'grid') return snap.point;
  if (cursor) return applyOrthoFromCursor(anchor, cursor);
  return null;
}

// World-space bounding box of everything we draw (structure + dim chain +
// roof cap). Used by Auto-fit and the Fit button. When a cut is active and
// it intersects 2+ walls, the bounding box's width uses the cut-derived
// section width instead of the default `computeBuildingWidth`.
function getSectionContentBounds(project: Project, cutId: string | null = null) {
  const s = getStructural(project);
  const stack = buildSectionStack(project);
  const cut = cutId == null ? null : (project.sectionCuts ?? []).find(c => c.id === cutId) ?? null;
  const cutAnalysis = cut ? analyzeSectionCut(project, cut) : null;
  const useCutWidth = !!(cutAnalysis && cutAnalysis.leftHit && cutAnalysis.rightHit);
  const halfBuildingWidth = (useCutWidth ? cutAnalysis!.sectionWidth : computeBuildingWidth(project)) / 2;
  const overhang = Math.max(0, project.roof.overhang || 0);
  // Roof height reserved at the top of the drawing comes from the SAME
  // topology-driven classifier the builder uses, so longitudinal / profile /
  // flat cuts reserve their true height (not a bbox guess) and aren't clipped.
  const rafterDepth = LUMBER_ACTUAL_DEPTH[project.roof.rafterDepth ?? 10];
  const roofShape = classifySectionRoof(
    project, cut ?? undefined, cutAnalysis, halfBuildingWidth, overhang, stack.topOfWallsY,
  );
  const ridgeCap = roofShape.maxAboveWalls + rafterDepth;
  // Dim chain extends left of building by ~52" (T/O inset + dim chain offset
  // + overall offset + label text room).
  const dimChainExtent = TO_LINE_INSET_IN + DIM_CHAIN_OFFSET_IN + OVERALL_DIM_OFFSET_IN + 8;
  return {
    xMin: -halfBuildingWidth - Math.max(overhang, dimChainExtent),
    xMax: +halfBuildingWidth + Math.max(overhang, 8),
    yMin: stack.footingBottomY - 8,
    yMax: stack.topOfWallsY + ridgeCap + 8,
    // helpers
    cx: 0,
    cy: ((stack.footingBottomY - 8) + (stack.topOfWallsY + ridgeCap + 8)) / 2,
  };
}

// Pick scaleMode + pan such that the section fits at the requested zoom (1.0
// for "100%" / first open). At 1/2", we use ~85% of the viewport; if it
// doesn't fit we fall back to 1/4". For zoom-to-extents (Fit), we keep the
// current scaleMode and adjust zoom to fill.
function autoFitVp(project: Project, width: number, height: number, prevScaleMode?: ScaleMode, cutId: string | null = null): VP {
  const b = getSectionContentBounds(project, cutId);
  const buildingH = b.yMax - b.yMin;
  const buildingW = b.xMax - b.xMin;
  // Try 1/2" first (or whatever the previous scale mode was if we have one).
  const tryMode: ScaleMode = prevScaleMode ?? 'half';
  const pxHalf = SCALE_PX_PER_INCH[tryMode];
  const fits = buildingH * pxHalf <= height * 0.9 && buildingW * pxHalf <= width * 0.9;
  const scaleMode: ScaleMode = fits ? tryMode : 'quarter';
  const px = SCALE_PX_PER_INCH[scaleMode];
  // Center building in viewport. worldToScreen(b.cx, b.cy) should be (W/2, H/2).
  const panX = -b.cx * px;
  const panY = b.cy * px;
  return { panX, panY, zoom: 1, scaleMode, width, height };
}

// Zoom-to-extents: keep scaleMode, compute zoom such that building fills
// ~85% of viewport, then center.
function fitVp(project: Project, vpIn: VP, cutId: string | null = null): VP {
  const b = getSectionContentBounds(project, cutId);
  const buildingH = b.yMax - b.yMin;
  const buildingW = b.xMax - b.xMin;
  const pxAtZoom1 = SCALE_PX_PER_INCH[vpIn.scaleMode];
  const zoomFitW = (vpIn.width * 0.9)  / (buildingW * pxAtZoom1);
  const zoomFitH = (vpIn.height * 0.9) / (buildingH * pxAtZoom1);
  const zoom = Math.min(zoomFitW, zoomFitH);
  const px = pxAtZoom1 * zoom;
  return {
    ...vpIn,
    zoom: Math.max(0.1, Math.min(8, zoom)),
    panX: -b.cx * px,
    panY: b.cy * px,
  };
}

function CrossSectionCanvas({ project, onChange, pushUndo, activeTool, drafting, activeCutId }: {
  project: Project;
  // onChange commits edits (new primitives, deletions). Optional so the
  // canvas can be embedded read-only too, but in practice it's always
  // passed by SectionPreviewPane.
  onChange?: (p: Project) => void;
  // Record the current project on the undo stack BEFORE the next edit.
  // Called once per discrete user action (line commit, delete, drag start).
  pushUndo?: () => void;
  activeTool?: SectionTool;
  drafting?: boolean;
  // Which section the canvas is showing. null = Typical; a string id =
  // sectionDrafting.cuts[activeCutId]. All read/write goes through this
  // scope so each cut has its own snapshot.
  activeCutId?: string | null;
}) {
  const cutScope = activeCutId ?? null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState<VP>({
    panX: 0, panY: 0, zoom: 1, scaleMode: 'half', width: 800, height: 600,
  });
  const [panning, setPanning] = useState<{ from: { x: number; y: number }; pan0: { x: number; y: number } } | null>(null);
  const autoFittedRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;

  // ── Drafting-mode edit state ────────────────────────────────────────────
  // Which primitives are currently selected (by id). The Select tool drives
  // this; the Delete key reads it.
  const [selection, setSelection] = useState<Set<string>>(new Set());
  // First-click anchor when the Line tool is mid-draw. Null when idle.
  const [lineAnchor, setLineAnchor] = useState<Vec2 | null>(null);
  // Text in the dynamic-input box that appears while a line draw is in
  // progress. Accepts "12" (length, cursor direction) or "12<45" (length
  // at 45° from horizontal).
  const [lineInput, setLineInput] = useState('');
  const lineInputRef = useRef<HTMLInputElement>(null);
  // Offset tool state. Matching STEM Sketch's UX:
  //   • Source = the (single) line currently in `selection`. User must
  //     pick a line with the Select tool BEFORE switching to Offset.
  //   • `offsetInput` mirrors the value in the floating tooltip's input.
  //     It auto-fills with the cursor's live perpendicular distance to the
  //     source unless the user starts typing (then their value locks).
  //   • `offsetUserTyped` is the lock flag — set true on user keystroke,
  //     cleared on Esc or on a blur with empty input.
  const [offsetInput, setOffsetInput] = useState('');
  const [offsetUserTyped, setOffsetUserTyped] = useState(false);
  const [offsetInputFocused, setOffsetInputFocused] = useState(false);
  const offsetInputRef = useRef<HTMLInputElement>(null);
  // Cursor SCREEN position (CSS px relative to canvas). Used to anchor the
  // offset tooltip next to the cursor. Tracked alongside cursorWorld.
  const [cursorScreen, setCursorScreen] = useState<{ x: number; y: number } | null>(null);
  // Drag state for the Select tool. Set when the user mouse-downs on the
  // endpoint handle of a selected line; cleared on mouse-up.
  const [dragHandle, setDragHandle] = useState<{ primId: string; endpoint: 'a' | 'b' } | null>(null);
  // Drag-rectangle selection (Select tool, click empty space + drag). Stores
  // both anchor and current cursor in world coords. Direction of drag
  // (start.x vs current.x) controls crossing vs window semantics.
  const [boxSelect, setBoxSelect] = useState<{ start: Vec2; current: Vec2; additive: boolean } | null>(null);
  // Text tool: click on the canvas sets an anchor, then a floating input
  // appears for typing the label. Enter commits, Escape cancels.
  const [textAnchor, setTextAnchor] = useState<Vec2 | null>(null);
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);
  // Dim tool: 3-click flow. After A and B are placed, the cursor's
  // perpendicular distance to AB becomes the offset (third click commits).
  const [dimA, setDimA] = useState<Vec2 | null>(null);
  const [dimB, setDimB] = useState<Vec2 | null>(null);
  // Trim tool: id of the line chosen as the cutting edge (first click).
  // Subsequent clicks on other lines trim them at the intersection.
  // Active line style for new lines drawn with the Line tool. The procedural
  // 'normal' / 'sheathing' styles are internal only — the user picks from a
  // CAD-traditional set: solid / dashed / dotted / center / hidden.
  const [currentLineStyle, setCurrentLineStyle] = useState<SectionLineStyle>('solid');
  // Tracks whether the active drag has actually moved the endpoint. We push
  // an undo entry on the FIRST mousemove of a drag, not on mousedown, so a
  // click-without-move doesn't pollute the undo stack with no-op entries.
  const dragPushedUndoRef = useRef(false);
  // Drag-start world point + click-vs-drag threshold: a handle/body drag commits
  // (and pushes an undo entry) only once the pointer clears ~4 screen px, so a
  // jittery click records nothing. `dragPushedUndoRef` latches once armed.
  const dragStartWorldRef = useRef<Vec2 | null>(null);
  // Whole-primitive translate drag. Set when the user mouse-downs on the
  // BODY of a selected line (not an endpoint handle). We snapshot the
  // project once on drag-start and re-derive each move-frame from it so the
  // delta accumulates against the ORIGINAL geometry, not the previous
  // frame's already-translated copy.
  const [dragTranslate, setDragTranslate] = useState<{
    ids: Set<string>;
    startWorld: Vec2;
    baseProject: Project;
  } | null>(null);
  // Mirror tool: y = vertical axis (flip L/R), x = horizontal (flip top/bottom).
  // Matches the Sandbox/Roof/Elevations mirror convention.
  const [mirrorAxis, setMirrorAxis] = useState<'x' | 'y'>('y');
  // Extend tool hover ghost — the line's current end → the boundary it reaches.
  const [extendPreview, setExtendPreview] = useState<{ from: Vec2; to: Vec2 } | null>(null);
  // Fillet tool: first picked line + the point clicked on it. Second click joins.
  const [filletFirst, setFilletFirst] = useState<{ id: string; pick: Vec2 } | null>(null);

  // Reset transient tool/selection state when leaving drafting mode or
  // switching tools, so we never get stranded mid-draw.
  useEffect(() => {
    setLineAnchor(null);
    setDragHandle(null);
    setDragTranslate(null);
    setLineInput('');
    setOffsetInput('');
    setOffsetUserTyped(false);
    setTextAnchor(null);
    setTextInput('');
    setDimA(null);
    setDimB(null);
    setExtendPreview(null);
    setFilletFirst(null);
  }, [activeTool, drafting]);
  // Auto-focus the text input when an anchor is placed.
  useEffect(() => {
    if (textAnchor) {
      const id = setTimeout(() => textInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [textAnchor]);
  useEffect(() => {
    if (!drafting) setSelection(new Set());
  }, [drafting]);
  // Whenever a new line anchor is dropped, clear the input and auto-focus
  // so the user can immediately type a length / angle.
  useEffect(() => {
    if (lineAnchor) {
      setLineInput('');
      // The input element only mounts after `lineAnchor` is set; defer
      // focus to the next tick so it's in the DOM.
      const id = setTimeout(() => lineInputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [lineAnchor]);

  // ── Container size observer ─────────────────────────────────────────────
  // Track the host element's size. On the first valid size, auto-fit;
  // subsequent resizes preserve the user's zoom/pan and just update W/H.
  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    const apply = (w: number, h: number) => {
      if (w < 20 || h < 20) return;
      if (!autoFittedRef.current) {
        autoFittedRef.current = true;
        setVp(autoFitVp(projectRef.current, w, h, undefined, cutScope));
      } else {
        setVp(v => ({ ...v, width: w, height: h }));
      }
    };
    apply(host.clientWidth, host.clientHeight);
    const ro = new ResizeObserver(() => apply(host.clientWidth, host.clientHeight));
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // Re-auto-fit when the user switches section tabs. Different cuts can have
  // very different widths (a partial cut through one room vs the whole house),
  // so the previous tab's pan/zoom usually doesn't make sense for the new
  // one. The user can pan/zoom freely after the auto-fit.
  useEffect(() => {
    const host = containerRef.current;
    if (!host || !autoFittedRef.current) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w < 20 || h < 20) return;
    setVp(autoFitVp(projectRef.current, w, h, undefined, cutScope));
  }, [cutScope]);

  // ── Wheel zoom (zooms around cursor) ────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      setVp(s => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newZoom = Math.min(8, Math.max(0.1, s.zoom * factor));
        const oldPx = SCALE_PX_PER_INCH[s.scaleMode] * s.zoom;
        const newPx = SCALE_PX_PER_INCH[s.scaleMode] * newZoom;
        // World point under cursor stays put. Solve for new pan:
        //   sx = panX_new + W/2 + worldX * newPx
        // and worldX = (sx - panX_old - W/2) / oldPx
        const worldX = (sx - s.panX - s.width / 2) / oldPx;
        const worldYscr = (sy - s.panY - s.height / 2) / oldPx;   // Y-down screen units
        const newPanX = sx - s.width / 2 - worldX * newPx;
        const newPanY = sy - s.height / 2 - worldYscr * newPx;
        return { ...s, zoom: newZoom, panX: newPanX, panY: newPanY };
      });
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, []);

  // ── Mouse handlers ──────────────────────────────────────────────────────
  // In Auto mode (not drafting) left-click pans, matching the original UX.
  // In Drafting mode the LEFT button drives the active tool; middle/right
  // always pans so the user can still move the view while drawing.
  const isDraftToolActive = !!(drafting && activeTool && activeTool !== 'select');
  const onMouseDown = (e: React.MouseEvent) => {
    // Middle / right always = pan.
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setPanning({ from: { x: e.clientX, y: e.clientY }, pan0: { x: vp.panX, y: vp.panY } });
      return;
    }
    if (e.button !== 0) return;
    // Auto mode: left-click pans.
    if (!drafting) {
      setPanning({ from: { x: e.clientX, y: e.clientY }, pan0: { x: vp.panX, y: vp.panY } });
      return;
    }
    // Drafting mode: dispatch by active tool.
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const proj = makeProjector(vp);
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const rawWorld: Vec2 = { x: proj.wx(sx), y: proj.wy(sy) };
    // Use the snapped point when a snap is active so click targets line
    // up with the indicator the user sees.
    const clickWorld: Vec2 = snap ? snap.point : rawWorld;

    if (activeTool === 'select') {
      const primitives = getSectionPrimitives(project, cutScope);
      // Step 1: if a SELECTED line's endpoint handle is under the cursor,
      // start dragging that endpoint instead of re-selecting. Undo is
      // recorded on the first mousemove of the drag, not here, so a
      // click-without-move doesn't add a no-op entry to the undo stack.
      const handleTolWorld = 7 / proj.px;
      for (const p of primitives) {
        if (!selection.has(p.id) || p.kind !== 'line') continue;
        const which = hitTestLineHandle(p, rawWorld, handleTolWorld);
        if (which) {
          setDragHandle({ primId: p.id, endpoint: which });
          dragPushedUndoRef.current = false;
          dragStartWorldRef.current = rawWorld;
          return;
        }
      }
      // Step 1b: if a SELECTED line's BODY is under the cursor (not on an
      // endpoint handle), start a whole-primitive translate drag. All
      // currently-selected primitives translate together, so the gesture
      // works on multi-selections too. Snapshot the project here so each
      // move frame deltas against the ORIGINAL geometry.
      const bodyTolWorld = 6 / proj.px;
      for (const p of primitives) {
        if (!selection.has(p.id) || p.kind !== 'line') continue;
        if (hitTestLineBody(p, rawWorld, bodyTolWorld, handleTolWorld)) {
          setDragTranslate({ ids: new Set(selection), startWorld: rawWorld, baseProject: project });
          dragPushedUndoRef.current = false;
          dragStartWorldRef.current = rawWorld;
          return;
        }
      }
      // Step 2: pick the topmost primitive under the cursor.
      const hitTolWorld = 6 / proj.px;
      const hit = hitTestTopmost(primitives, rawWorld, hitTolWorld);
      if (hit) {
        if (e.shiftKey) {
          // Toggle: add to selection if not in, remove if in.
          setSelection(prev => {
            const next = new Set(prev);
            if (next.has(hit.id)) next.delete(hit.id);
            else next.add(hit.id);
            return next;
          });
        } else {
          setSelection(new Set([hit.id]));
        }
        return;
      }
      // Step 3: empty space — start a drag-rectangle selection. We DON'T
      // clear the existing selection until mouse-up so the user can preview
      // the box without losing what they had if they Esc out.
      setBoxSelect({ start: rawWorld, current: rawWorld, additive: e.shiftKey });
      return;
    }
    if (activeTool === 'erase') {
      if (!onChange) return;
      // Click any primitive to delete it (matches the Erase tool elsewhere).
      const primitives = getSectionPrimitives(project, cutScope);
      const tolWorld = 6 / proj.px;
      const hit = hitTestTopmost(primitives, rawWorld, tolWorld);
      if (!hit) return;
      pushUndo?.();
      onChange(removePrimitives(project, new Set([hit.id]), cutScope));
      setSelection(new Set());
      return;
    }
    if (activeTool === 'line') {
      if (!onChange) return;
      if (!lineAnchor) {
        // First click: anchor at the snapped point (any kind) — even grid
        // snap is fine for setting the start of a line.
        setLineAnchor(clickWorld);
      } else {
        // Second click: use the same ortho/snap priority the ghost showed.
        const endpoint = resolveLineEndpoint(lineAnchor, rawWorld, snap, lineInput) ?? clickWorld;
        const newLine = makeUserLine(lineAnchor, endpoint, currentLineStyle);
        pushUndo?.();
        onChange(addPrimitive(project, newLine, cutScope));
        setLineAnchor(null);
      }
      return;
    }
    if (activeTool === 'text') {
      if (!onChange) return;
      // Drop the anchor at the (possibly-snapped) click point. The input
      // auto-focuses via the textAnchor effect.
      setTextAnchor(clickWorld);
      setTextInput('');
      return;
    }
    if (activeTool === 'trim') {
      if (!onChange) return;
      // STEM Sketch single-click trim: click any piece of a line or polyline
      // segment and that piece disappears. Every crossing AND every natural
      // polyline vertex acts as a cut so closed outlines open up cleanly.
      const primitives = getSectionPrimitives(project, cutScope);
      const tolWorld = 6 / proj.px;
      const hit = hitTestTopmost(primitives, rawWorld, tolWorld);
      if (!hit) return;
      const target = primitives.find(p => p.id === hit.id);
      if (!target) return;
      let keep: SectionPrimitive[] | null = null;
      if (target.kind === 'line') {
        const result = trimLineByClick(target, primitives, rawWorld);
        if (result) keep = result.keep;
      } else if (target.kind === 'polyline') {
        const result = trimPolylineByClick(target, primitives, rawWorld);
        if (result) keep = result.keep;
      }
      if (!keep) return;
      pushUndo?.();
      onChange(replacePrimitiveWithMany(project, hit.id, keep, cutScope));
      return;
    }
    if (activeTool === 'dim') {
      if (!onChange) return;
      if (!dimA) {
        setDimA(clickWorld);
      } else if (!dimB) {
        // Reject zero-length dims.
        if (Math.hypot(clickWorld.x - dimA.x, clickWorld.y - dimA.y) < 1e-6) return;
        setDimB(clickWorld);
      } else {
        // Third click — commits at the cursor's signed perpendicular offset
        // from segment AB (so the dim line lands on whichever side the
        // cursor is on).
        const offset = signedPerpendicularOffset(dimA, dimB, rawWorld);
        pushUndo?.();
        onChange(addPrimitive(project, makeUserDimLinear(dimA, dimB, offset), cutScope));
        setDimA(null);
        setDimB(null);
      }
      return;
    }
    if (activeTool === 'offset') {
      if (!onChange || offsetSources.length === 0) return;
      const distance = parseLengthInches(offsetInput);
      if (distance === null) return;
      // Offset every source line by the same distance; each picks its own
      // side relative to the cursor. Chain by setting the new lines as the
      // sources for the next click.
      const newLines: PrimLine[] = [];
      for (const src of offsetSources) {
        const offset = offsetLineCopy(src, distance, rawWorld);
        if (offset) newLines.push(offset);
      }
      if (newLines.length === 0) return;
      pushUndo?.();
      let next = project;
      for (const nl of newLines) next = addPrimitive(next, nl, cutScope);
      onChange(next);
      setOffsetSources(newLines);
      return;
    }
    if (activeTool === 'extend') {
      if (!onChange) return;
      // Extend the clicked line's nearer end out to the closest boundary —
      // the counterpart to Trim. Other primitives' edges are the boundaries.
      const primitives = getSectionPrimitives(project, cutScope);
      const tolWorld = 6 / proj.px;
      const hit = hitTestTopmost(primitives, rawWorld, tolWorld);
      if (!hit || hit.kind !== 'line') return;
      const r = computeLineExtend(hit, primitives, rawWorld);
      if (!r) return;
      pushUndo?.();
      onChange(replaceLinePrimitive(project, hit.id, { ...hit, [r.end]: r.point }, cutScope));
      setExtendPreview(null);
      return;
    }
    if (activeTool === 'mirror') {
      if (!onChange || selection.size === 0) return;
      // Reflect the current selection across an X/Y axis placed at the click,
      // ADDING mirrored copies (originals kept). Needs an existing selection.
      const primitives = getSectionPrimitives(project, cutScope);
      const pos = mirrorAxis === 'x' ? rawWorld.y : rawWorld.x;
      const { copies, newIds } = reflectPrimitives(primitives, selection, mirrorAxis, pos);
      if (copies.length === 0) return;
      pushUndo?.();
      onChange(setDraftingPrimitives(project, [...primitives, ...copies], cutScope));
      setSelection(new Set(newIds));
      return;
    }
    if (activeTool === 'fillet') {
      if (!onChange) return;
      // Two-click corner join: pick line 1 (side to keep), then line 2 — both
      // near ends move to where the two lines intersect (any angle).
      const primitives = getSectionPrimitives(project, cutScope);
      const hit = hitTestTopmost(primitives, rawWorld, 6 / proj.px);
      if (!hit || hit.kind !== 'line') return;
      if (!filletFirst || filletFirst.id === hit.id) {
        setFilletFirst({ id: hit.id, pick: rawWorld });
        return;
      }
      const next = filletLines(primitives, filletFirst.id, filletFirst.pick, hit.id, rawWorld);
      if (next) { pushUndo?.(); onChange(setDraftingPrimitives(project, next, cutScope)); }
      setFilletFirst(null);
      return;
    }
  };

  // ── Drafting key handler: Delete removes selected primitives, Escape
  // cancels in-progress draws. Ignored while typing in an input.
  useEffect(() => {
    if (!drafting) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        if (lineAnchor) { setLineAnchor(null); e.preventDefault(); return; }
        if (textAnchor) { setTextAnchor(null); setTextInput(''); e.preventDefault(); return; }
        if (dimA || dimB) { setDimA(null); setDimB(null); e.preventDefault(); return; }
        // In Offset mode: first Esc clears a typed lock (so live distance
        // resumes); second Esc clears the selection (exits the tool effectively).
        if (activeTool === 'offset' && offsetUserTyped) {
          setOffsetUserTyped(false);
          setOffsetInput('');
          e.preventDefault();
          return;
        }
        if (filletFirst) { setFilletFirst(null); e.preventDefault(); return; }
        if (boxSelect) { setBoxSelect(null); e.preventDefault(); return; }
        if (selection.size > 0) { setSelection(new Set()); e.preventDefault(); return; }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0 && onChange) {
        pushUndo?.();
        onChange(removePrimitives(project, selection, cutScope));
        setSelection(new Set());
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drafting, selection, lineAnchor, textAnchor, dimA, dimB, boxSelect, filletFirst, activeTool, offsetUserTyped, project, onChange, pushUndo]);

  // ── Offset: auto-focus the tooltip input on the first typed digit ──────
  // Matches STEM Sketch's UX — the tooltip shows the live cursor distance
  // until the user starts typing a number, at which point we focus the
  // input and seed it with that first keystroke.
  useEffect(() => {
    if (!drafting || activeTool !== 'offset') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Accept digits, decimal point, foot/inch marks. Letters and arrows
      // pass through to the existing tool/keyboard handlers.
      if (!/^[0-9.'"]$/.test(e.key)) return;
      e.preventDefault();
      setOffsetInput(e.key);
      setOffsetUserTyped(true);
      offsetInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drafting, activeTool]);
  // Cursor world position. Tracked while drafting + a draw tool is active so
  // the snap indicator can follow the mouse. Null when no snap is happening.
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const onMouseMove = (e: React.MouseEvent) => {
    if (panning) {
      const dx = e.clientX - panning.from.x;
      const dy = e.clientY - panning.from.y;
      setVp(s => ({ ...s, panX: panning.pan0.x + dx, panY: panning.pan0.y + dy }));
      return;
    }
    // Box-select drag always tracks the cursor — even outside the normal
    // tool-active cursor-tracking conditions — so the rectangle follows.
    const trackCursor = isDraftToolActive || (drafting && (dragHandle !== null || dragTranslate !== null)) || boxSelect !== null;
    if (!trackCursor) {
      if (cursorWorld !== null) setCursorWorld(null);
      if (cursorScreen !== null) setCursorScreen(null);
      return;
    }
    const cv = canvasRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const proj = makeProjector(vp);
    const screenX = e.clientX - r.left;
    const screenY = e.clientY - r.top;
    const raw: Vec2 = { x: proj.wx(screenX), y: proj.wy(screenY) };
    setCursorWorld(raw);
    setCursorScreen({ x: screenX, y: screenY });
    // Extend hover ghost — show where the line under the cursor would land.
    if (activeTool === 'extend') {
      const primitives = getSectionPrimitives(project, cutScope);
      const hit = hitTestTopmost(primitives, raw, 6 / proj.px);
      let pv: { from: Vec2; to: Vec2 } | null = null;
      if (hit && hit.kind === 'line') {
        const r = computeLineExtend(hit, primitives, raw);
        if (r) pv = { from: r.from, to: r.point };
      }
      setExtendPreview(pv);
    } else if (extendPreview) {
      setExtendPreview(null);
    }
    if (boxSelect) {
      setBoxSelect({ ...boxSelect, current: raw });
    }
    // Click-vs-drag: only commit (and push undo) once the pointer clears ~4
    // screen px from where the drag began. `dragPushedUndoRef` latches true on
    // the first real commit so dragging back toward the start still tracks.
    const armed = dragPushedUndoRef.current || (
      dragStartWorldRef.current != null &&
      Math.hypot(raw.x - dragStartWorldRef.current.x, raw.y - dragStartWorldRef.current.y) * pxPerInchOf(vp) >= 4
    );
    // Live update during a handle drag — use the snapped point if a snap
    // target is under the cursor, otherwise the raw cursor position. Push
    // ONE undo entry per drag on the first real move.
    if (dragHandle && onChange && armed) {
      if (!dragPushedUndoRef.current) {
        pushUndo?.();
        dragPushedUndoRef.current = true;
      }
      const target = snap ? snap.point : raw;
      onChange(moveLineEndpoint(project, dragHandle.primId, dragHandle.endpoint, target, cutScope));
    }
    // Live update during a whole-primitive translate drag. Delta is computed
    // against the snapshot taken at drag-start (`baseProject`) so the gesture
    // is stable as the on-screen geometry updates underneath the cursor.
    if (dragTranslate && onChange && armed) {
      const dx = raw.x - dragTranslate.startWorld.x;
      const dy = raw.y - dragTranslate.startWorld.y;
      if (dx !== 0 || dy !== 0) {
        if (!dragPushedUndoRef.current) {
          pushUndo?.();
          dragPushedUndoRef.current = true;
        }
        onChange(translatePrimitivesBy(dragTranslate.baseProject, dragTranslate.ids, dx, dy, cutScope));
      }
    }
  };
  const onMouseUp = () => {
    setPanning(null);
    setDragHandle(null);
    setDragTranslate(null);
    // Resolve box select on release. Zero-extent drags (click without
    // move) clear selection — same as a plain click on empty space.
    if (boxSelect) {
      const primitives = getSectionPrimitives(project, cutScope);
      const dxw = boxSelect.current.x - boxSelect.start.x;
      const dyw = boxSelect.current.y - boxSelect.start.y;
      const moved = Math.abs(dxw) + Math.abs(dyw) > 1e-6;   // > 0.000001"
      if (!moved) {
        if (!boxSelect.additive) setSelection(new Set());
      } else {
        const { ids } = computeBoxSelection(primitives, boxSelect.start, boxSelect.current);
        if (boxSelect.additive) {
          setSelection(prev => {
            const next = new Set(prev);
            for (const id of ids) next.add(id);
            return next;
          });
        } else {
          setSelection(ids);
        }
      }
      setBoxSelect(null);
    }
  };
  const onMouseLeaveCanvas = () => {
    setPanning(null);
    setDragHandle(null);
    setDragTranslate(null);
    setBoxSelect(null);
    setCursorWorld(null);
    setCursorScreen(null);
    setExtendPreview(null);
  };

  // ── Snap result: computed from current cursor + primitives + tolerance ──
  // Tolerance is fixed at ~8 screen pixels regardless of zoom. Grid snap is
  // a 1" base grid (low priority — only fires when no structural snap is in
  // range). Active whenever a draw tool is up OR the user is dragging a
  // handle in the Select tool.
  const snap: SnapResult | null = useMemo(() => {
    if (!cursorWorld || !drafting) return null;
    const snapActive = isDraftToolActive || dragHandle !== null;
    if (!snapActive) return null;
    const px = pxPerInchOf(vp);
    const tolWorld = 8 / px;
    const primitives = getSectionPrimitives(project, cutScope);
    return findSnap(cursorWorld, primitives, tolWorld, {
      grid: { size: 1, enabled: true },
    });
  }, [cursorWorld, drafting, isDraftToolActive, dragHandle, vp, project]);

  // ── Ghost endpoint while drawing a line ─────────────────────────────────
  // Priority (see resolveLineEndpoint):
  //   1. Parsed typed input (length / length@angle)
  //   2. Non-grid snap (endpoint/midpoint/intersection/on-edge) — overrides ortho
  //   3. Ortho-constrained cursor (H/V nearest cursor)
  const lineGhostEndpoint: Vec2 | null = useMemo(() => {
    if (!lineAnchor) return null;
    return resolveLineEndpoint(lineAnchor, cursorWorld, snap, lineInput);
  }, [lineAnchor, lineInput, snap, cursorWorld]);

  // ── Offset sources (chained, multi-line) ───────────────────────────────
  // STEM Sketch's repeat-offset pattern: the SOURCES start as every line
  // the user pre-selected, but after each commit they become the JUST-
  // PLACED offset lines. Subsequent cursor-distance + clicks measure from
  // those, so repeated clicks in the same direction "walk" outward at the
  // same (or freshly typed) distance — and ALL selected lines offset
  // together.
  const [offsetSources, setOffsetSources] = useState<PrimLine[]>([]);

  // Keep the latest project in a ref so the sync effect below can look up
  // primitives by id without re-running on every project change (which
  // would reset the chained source after each offset commit).
  const offsetProjectRef = useRef(project);
  offsetProjectRef.current = project;

  // Sync sources from the selection whenever the user activates Offset or
  // changes their selection. Only LINE primitives are eligible — text /
  // dim / etc. in the selection are ignored. Project changes don't reset
  // the chain (the click handler updates offsetSources to just-placed lines).
  useEffect(() => {
    if (activeTool !== 'offset') {
      setOffsetSources([]);
      return;
    }
    const primitives = getSectionPrimitives(offsetProjectRef.current, cutScope);
    const lines: PrimLine[] = [];
    for (const id of selection) {
      const p = primitives.find(x => x.id === id);
      if (p && p.kind === 'line') lines.push(p);
    }
    setOffsetSources(lines);
  }, [activeTool, selection]);

  // Live perpendicular distance from the cursor to the CLOSEST source line.
  // With multiple selected lines the reading reflects whichever line the
  // user's cursor is nearest — usually the one they're hovering over.
  const offsetCursorDistance: number | null = useMemo(() => {
    if (offsetSources.length === 0 || !cursorWorld) return null;
    let min = Infinity;
    for (const line of offsetSources) {
      const { a, b } = line;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const d = Math.abs((cursorWorld.x - a.x) * (-dy / len) + (cursorWorld.y - a.y) * (dx / len));
      if (d < min) min = d;
    }
    return Number.isFinite(min) ? min : null;
  }, [offsetSources, cursorWorld]);

  // Keep the tooltip input in sync with the live cursor distance UNLESS the
  // user is typing (focused) or has locked a value (offsetUserTyped). Format
  // to 2 decimal places so the tooltip doesn't jitter wildly.
  useEffect(() => {
    if (activeTool !== 'offset') return;
    if (offsetInputFocused || offsetUserTyped) return;
    if (offsetCursorDistance == null) {
      setOffsetInput('');
      return;
    }
    setOffsetInput(offsetCursorDistance.toFixed(2));
  }, [activeTool, offsetCursorDistance, offsetInputFocused, offsetUserTyped]);

  // ── Offset preview (source highlight + ghost line, per-source) ─────────
  // For multi-line offset we draw a highlight + ghost for every selected
  // source. All sources offset by the same distance, but each picks its
  // own side relative to the cursor.
  const offsetPreview: { sources: PrimLine[]; distance: number; side: Vec2 } | null = useMemo(() => {
    if (offsetSources.length === 0 || !cursorWorld) return null;
    const distance = parseLengthInches(offsetInput);
    if (distance === null) return null;
    return { sources: offsetSources, distance, side: cursorWorld };
  }, [offsetSources, cursorWorld, offsetInput]);

  // ── Dim tool ghost preview ──────────────────────────────────────────────
  // After A is placed: draw a "rubber band" line from A to the cursor.
  // After B is also placed: draw the full dim preview (extension lines +
  // dashed dim line + label) at the cursor's perpendicular offset.
  const dimGhost: { a: Vec2; b: Vec2; offset: number } | null = useMemo(() => {
    if (!dimA || !cursorWorld) return null;
    if (!dimB) return null;   // pre-B handled separately (just a line)
    const offset = signedPerpendicularOffset(dimA, dimB, snap?.point ?? cursorWorld);
    return { a: dimA, b: dimB, offset };
  }, [dimA, dimB, cursorWorld, snap]);

  // ── Draw whenever project, vp, size, snap, selection, or in-progress
  // draw state changes ─────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || vp.width < 10 || vp.height < 10) return;
    const dpr = window.devicePixelRatio || 1;
    draw(cv, vp, project, dpr, snap, selection, lineAnchor, lineGhostEndpoint, offsetPreview, boxSelect, dimA, dimB, dimGhost, cursorWorld, cutScope, activeTool ?? 'select', mirrorAxis, extendPreview, filletFirst);
  }, [project, vp, snap, selection, lineAnchor, lineGhostEndpoint, offsetPreview, boxSelect, dimA, dimB, dimGhost, cursorWorld, cutScope, activeTool, mirrorAxis, extendPreview, filletFirst]);

  // ── Commit a typed line from the dynamic input ──────────────────────────
  // Resolves using the same priority as the ghost preview, so pressing Enter
  // with an empty input commits at the ortho cursor (or current snap target).
  const commitTypedLine = useCallback(() => {
    if (!lineAnchor || !onChange) return;
    const endpoint = resolveLineEndpoint(lineAnchor, cursorWorld, snap, lineInput);
    if (!endpoint) return;   // invalid input AND no cursor — nothing to draw
    pushUndo?.();
    onChange(addPrimitive(project, makeUserLine(lineAnchor, endpoint, currentLineStyle), cutScope));
    setLineAnchor(null);
    setLineInput('');
  }, [lineAnchor, lineInput, snap, cursorWorld, onChange, pushUndo, project, currentLineStyle]);

  // ── Commit a text label at the current anchor ──────────────────────────
  const commitTextLabel = useCallback(() => {
    if (!textAnchor || !onChange) return;
    const content = textInput.trim();
    if (!content) {
      // Empty text = cancel rather than commit (avoids invisible primitives).
      setTextAnchor(null);
      setTextInput('');
      return;
    }
    pushUndo?.();
    onChange(addPrimitive(project, makeUserText(textAnchor, content), cutScope));
    setTextAnchor(null);
    setTextInput('');
  }, [textAnchor, textInput, onChange, pushUndo, project]);

  // ── Toolbar handlers ────────────────────────────────────────────────────
  const onFit = useCallback(() => setVp(s => fitVp(project, s, cutScope)), [project, cutScope]);
  const onReset100 = useCallback(() => {
    setVp(s => autoFitVp(project, s.width, s.height, s.scaleMode, cutScope));
  }, [project, cutScope]);
  const onToggleScale = useCallback(() => {
    setVp(s => {
      const nextMode: ScaleMode = s.scaleMode === 'half' ? 'quarter' : 'half';
      return autoFitVp(project, s.width, s.height, nextMode, cutScope);
    });
  }, [project, cutScope]);

  const zoomPct = useMemo(() => Math.round(vp.zoom * 100), [vp.zoom]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', background: T.panel, position: 'relative' }}>
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeaveCanvas}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          display: 'block',
          // Cursor: grabbing while panning; crosshair for a draw/edit tool
          // in drafting mode; pointer (the select tool); grab in auto mode.
          cursor: panning ? 'grabbing'
            : isDraftToolActive ? 'crosshair'
            : drafting ? 'default'
            : 'grab',
        }}
      />
      <SectionToolbar
        scaleLabel={SCALE_LABEL[vp.scaleMode]}
        zoomPct={zoomPct}
        onFit={onFit}
        onReset100={onReset100}
        onToggleScale={onToggleScale}
      />
      {/* Mirror axis toggle — floating control while the Mirror tool is active.
          Y = vertical axis (flip L/R), X = horizontal (flip top/bottom). Same
          convention as the Sandbox / Roof / Elevations mirror. */}
      {drafting && activeTool === 'mirror' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
          background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
        }}>
          <span style={{ fontSize: 11, color: T.inkSoft }}>Mirror axis:</span>
          <div style={{ display: 'flex', gap: 2 }}>
            {([['y', 'Vertical'], ['x', 'Horizontal']] as const).map(([ax, label]) => (
              <button
                key={ax}
                onClick={() => setMirrorAxis(ax)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                  border: mirrorAxis === ax ? `1px solid ${T.accent}` : `1px solid ${T.line}`,
                  background: mirrorAxis === ax ? T.accentSoft : 'transparent',
                  color: mirrorAxis === ax ? T.accentInk : T.inkSoft, fontWeight: 600,
                }}
              >{label}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: T.inkMuted }}>
            {selection.size > 0 ? 'click to place axis' : 'select shapes first'}
          </span>
        </div>
      )}
      {drafting && activeTool === 'fillet' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          padding: '5px 10px', background: T.panel, border: `1px solid ${T.line}`,
          borderRadius: 8, boxShadow: T.shadow, fontSize: 11, color: T.inkSoft,
        }}>
          {filletFirst ? 'Click the second line — they join where they intersect' : 'Click the first line (the side to keep)'}
        </div>
      )}
      {lineAnchor && activeTool === 'line' && (
        <LineDynamicInput
          inputRef={lineInputRef}
          value={lineInput}
          onChange={setLineInput}
          onCommit={commitTypedLine}
          onCancel={() => { setLineAnchor(null); setLineInput(''); }}
        />
      )}
      {textAnchor && activeTool === 'text' && (
        <TextAnchorInput
          anchorScreen={(() => {
            const proj = makeProjector(vp);
            return { x: proj.sx(textAnchor.x), y: proj.sy(textAnchor.y) };
          })()}
          inputRef={textInputRef}
          value={textInput}
          onChange={setTextInput}
          onCommit={commitTextLabel}
          onCancel={() => { setTextAnchor(null); setTextInput(''); }}
        />
      )}
      {activeTool === 'offset' && drafting && cursorScreen && (
        <OffsetCursorTooltip
          screenPos={cursorScreen}
          sourceCount={offsetSources.length}
          inputRef={offsetInputRef}
          value={offsetInput}
          onChange={(v) => { setOffsetInput(v); setOffsetUserTyped(true); }}
          onFocus={() => setOffsetInputFocused(true)}
          onBlur={() => {
            setOffsetInputFocused(false);
            // Empty blur = unlock (resume live cursor distance updates).
            if (!offsetInput.trim()) setOffsetUserTyped(false);
          }}
        />
      )}
      {drafting && (
        <LineStylePicker value={currentLineStyle} onChange={setCurrentLineStyle} />
      )}
    </div>
  );
}

// Horizontal style strip below the tool palette. Always visible in drafting
// mode — sets the dash pattern for any line drawn next with the Line tool.
// Each chip renders a tiny SVG preview of its dash pattern so the choice is
// visual (matches AutoCAD's style picker).
const LINE_STYLE_CHOICES: { id: SectionLineStyle; label: string; preview: string; arrow?: boolean }[] = [
  { id: 'solid',  label: 'Solid',  preview: '' },
  { id: 'dashed', label: 'Dashed', preview: '8,4' },
  { id: 'dotted', label: 'Dotted', preview: '1.5,3' },
  { id: 'center', label: 'Center', preview: '12,3,2,3' },
  { id: 'hidden', label: 'Hidden', preview: '4,4' },
  { id: 'arrow',  label: 'Arrow',  preview: '', arrow: true },
];

function LineStylePicker({ value, onChange }: {
  value: SectionLineStyle;
  onChange: (s: SectionLineStyle) => void;
}) {
  return (
    <div style={{
      position: 'absolute', left: 14, top: 280,
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: 4, background: T.panel,
      border: `1px solid ${T.line}`, borderRadius: 8, boxShadow: T.shadow,
      fontFamily: 'ui-sans-serif, system-ui',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.6px', color: T.inkMuted,
        textTransform: 'uppercase', padding: '2px 4px 4px',
      }}>Line style</div>
      {LINE_STYLE_CHOICES.map(c => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            title={`Draw new lines as ${c.label.toLowerCase()}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 8px', minWidth: 92,
              fontSize: 10, fontWeight: 600,
              background: active ? T.accentSoft : T.panel2,
              color:      active ? T.accentInk  : T.ink,
              border: `1px solid ${active ? T.accent : T.lineStrong}`,
              borderRadius: 5, cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <svg width="32" height="8" style={{ flexShrink: 0 }}>
              <line
                x1="1" y1="4" x2={c.arrow ? "27" : "31"} y2="4"
                stroke={active ? T.accentInk : T.ink}
                strokeWidth="1.2"
                strokeDasharray={c.preview || undefined}
              />
              {c.arrow && (
                <polygon
                  points="31,4 27,2 27,6"
                  fill={active ? T.accentInk : T.ink}
                />
              )}
            </svg>
            <span style={{ flex: 1 }}>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Cursor-following tooltip for the Offset tool. Matches the STEM Sketch UX:
//   • If no source line is in the user's selection → show a hint instead of
//     an input ("Select a line first").
//   • Otherwise → small floating chip near the cursor with the live
//     perpendicular distance from cursor → source line. Click anywhere in
//     the canvas to commit at that distance; typing a digit (handled by a
//     window keydown elsewhere) focuses the input and locks the value.
function OffsetCursorTooltip({ screenPos, sourceCount, inputRef, value, onChange, onFocus, onBlur }: {
  screenPos: { x: number; y: number };
  sourceCount: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const left = screenPos.x + 14;
  const top  = screenPos.y - 28;
  if (sourceCount === 0) {
    return (
      <div style={{
        position: 'absolute', left, top, pointerEvents: 'none',
        padding: '5px 9px', fontSize: 11, fontFamily: 'ui-sans-serif, system-ui',
        background: T.panel, color: T.danger,
        border: `1px solid ${T.danger}`, borderRadius: 6, boxShadow: T.shadow,
        whiteSpace: 'nowrap',
      }}>
        Select one or more lines first (V), then offset (O)
      </div>
    );
  }
  return (
    <div style={{
      position: 'absolute', left, top,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 8px', fontFamily: 'ui-sans-serif, system-ui',
      background: T.panel, border: `1px solid ${T.lineStrong}`,
      borderRadius: 6, boxShadow: T.shadow,
    }}>
      <span style={{ fontSize: 10, color: T.inkSoft, fontWeight: 600 }}>
        {sourceCount > 1 ? `Offset ×${sourceCount}` : 'Offset'}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputRef.current?.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            inputRef.current?.blur();
          }
        }}
        style={{
          width: 70, padding: '2px 6px', fontSize: 12,
          fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          color: T.ink, background: T.panel2,
          border: `1px solid ${T.lineStrong}`, borderRadius: 4, outline: 'none',
        }}
      />
      <span style={{ fontSize: 10, color: T.inkSoft }}>in</span>
    </div>
  );
}

// Floating text-entry box positioned right next to the placed anchor. The
// anchor itself is drawn as a small blue square in the canvas; the input
// floats just to the right so the user can see exactly where the label
// will land.
function TextAnchorInput({ anchorScreen, inputRef, value, onChange, onCommit, onCancel }: {
  anchorScreen: { x: number; y: number };
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {/* Anchor marker — a small blue square at the click point */}
      <div style={{
        position: 'absolute',
        left: anchorScreen.x - 4, top: anchorScreen.y - 4,
        width: 8, height: 8,
        background: '#3B82F6',
        pointerEvents: 'none',
      }} />
      {/* Input box to the right of the anchor */}
      <div style={{
        position: 'absolute',
        left: anchorScreen.x + 10,
        top:  anchorScreen.y - 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 8px', fontFamily: 'ui-sans-serif, system-ui',
        background: T.panel, border: `1px solid ${T.lineStrong}`,
        borderRadius: 6, boxShadow: T.shadow,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          placeholder='Label text'
          autoFocus
          style={{
            width: 160, padding: '3px 6px', fontSize: 12,
            fontFamily: 'inherit',
            color: T.ink, background: T.panel2,
            border: `1px solid ${T.lineStrong}`, borderRadius: 4, outline: 'none',
          }}
        />
        <span style={{ fontSize: 10, color: T.inkMuted, lineHeight: 1.3 }}>
          Enter · Esc
        </span>
      </div>
    </>
  );
}

// Floating dynamic-input box for the Line tool. Visible only while a line
// draw is in progress (first anchor placed). Accepts:
//   "12"      — length 12" in the cursor direction
//   "12<45"   — length 12" at 45° from horizontal (positive = CCW)
function LineDynamicInput({ inputRef, value, onChange, onCommit, onCancel }: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', left: '50%', bottom: 14,
      transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      background: T.panel, border: `1px solid ${T.lineStrong}`, borderRadius: 8,
      boxShadow: T.shadow, fontFamily: 'ui-sans-serif, system-ui',
    }}>
      <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>Length:</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        placeholder={`e.g. 12  ·  12'  ·  12'6  ·  12@45`}
        autoFocus
        style={{
          width: 140, padding: '5px 8px', fontSize: 13,
          fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
          color: T.ink, background: T.panel2,
          border: `1px solid ${T.lineStrong}`, borderRadius: 6,
          outline: 'none',
        }}
      />
      <span style={{ fontSize: 10, color: T.inkMuted, lineHeight: 1.3 }}>
        Enter to draw · Esc to cancel
      </span>
    </div>
  );
}

// Toolbar overlay pinned to the bottom-right of the section canvas.
function SectionToolbar({
  scaleLabel, zoomPct, onFit, onReset100, onToggleScale,
}: {
  scaleLabel: string;
  zoomPct: number;
  onFit: () => void;
  onReset100: () => void;
  onToggleScale: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', right: 14, bottom: 14, display: 'flex', gap: 4,
      padding: 4, background: T.panel, border: `1px solid ${T.line}`,
      borderRadius: 8, boxShadow: T.shadow, fontFamily: 'ui-sans-serif, system-ui',
    }}>
      <button type="button" onClick={onFit} title="Fit section to viewport" style={toolbarBtn}>Fit</button>
      <button type="button" onClick={onReset100} title="Reset to 100%" style={toolbarBtn}>100%</button>
      <button
        type="button" onClick={onToggleScale}
        title="Toggle scale (1/2&quot; ↔ 1/4&quot;)"
        style={{ ...toolbarBtn, minWidth: 92, fontVariantNumeric: 'tabular-nums' }}
      >
        {scaleLabel}
      </button>
      <div style={{
        display: 'inline-flex', alignItems: 'center', padding: '0 8px',
        fontSize: 11, color: T.inkSoft, fontVariantNumeric: 'tabular-nums',
        minWidth: 44, justifyContent: 'flex-end',
      }}>
        {zoomPct}%
      </div>
    </div>
  );
}

const toolbarBtn: React.CSSProperties = {
  padding: '5px 10px', fontSize: 11, fontWeight: 600,
  background: T.panel2, color: T.ink,
  border: `1px solid ${T.lineStrong}`, borderRadius: 6, cursor: 'pointer',
};

function draw(
  canvas: HTMLCanvasElement,
  vp: VP,
  project: Project,
  dpr: number,
  snap: SnapResult | null,
  selection: Set<string>,
  lineAnchor: Vec2 | null,
  ghostCursor: Vec2 | null,
  offsetPreview: { sources: PrimLine[]; distance: number; side: Vec2 } | null,
  boxSelect: { start: Vec2; current: Vec2 } | null,
  dimA: Vec2 | null,
  dimB: Vec2 | null,
  dimGhost: { a: Vec2; b: Vec2; offset: number } | null,
  cursorWorld: Vec2 | null,
  cutScope: string | null,
  activeTool: SectionTool,
  mirrorAxis: 'x' | 'y',
  extendPreview: { from: Vec2; to: Vec2 } | null,
  filletFirst: { id: string; pick: Vec2 } | null,
) {
  const W = vp.width;
  const H = vp.height;
  if (W < 10 || H < 10) return;

  canvas.width = Math.floor(W * dpr);
  canvas.height = Math.floor(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = T.panel;
  ctx.fillRect(0, 0, W, H);

  // ── Section as a primitive list, then rendered ─────────────────────────
  // Every line / polyline / text / dim is a structured object. In Auto mode
  // these are built procedurally from `project.structural`; in Drafting mode
  // we render the snapshot stored on `project.sectionDrafting.typical`.
  // `getSectionPrimitives` picks the right source.
  const proj = makeProjector(vp);
  const primitives = getSectionPrimitives(project, cutScope);
  renderSectionPrimitives(ctx, primitives, proj);

  // ── Selection highlight + handles (drafting mode) ──────────────────────
  // Thick blue stroke over each selected primitive, plus square handles at
  // the endpoints of each selected line so the user can grab and drag.
  const toScreen = (p: Vec2) => ({ x: proj.sx(p.x), y: proj.sy(p.y) });
  drawSelectionOverlay(ctx, primitives, selection, toScreen);
  drawLineHandles(ctx, primitives, selection, toScreen);

  // ── Line tool ghost preview ────────────────────────────────────────────
  // Dashed line from the first-click anchor to the (snapped) cursor.
  if (lineAnchor && ghostCursor) {
    drawLineGhost(ctx, lineAnchor, ghostCursor, toScreen);
  }

  // ── Offset tool preview (per source) ───────────────────────────────────
  // Each selected source gets an amber highlight + a dashed ghost showing
  // its offset target on whichever side the cursor is on.
  if (offsetPreview) {
    for (const src of offsetPreview.sources) {
      drawOffsetSource(ctx, src, toScreen);
      drawOffsetGhost(ctx, src, offsetPreview.distance, offsetPreview.side, toScreen);
    }
  }

  // ── Dim tool preview (between clicks) ──────────────────────────────────
  // Click 1 placed: rubber-band line from A to the cursor.
  // Click 2 placed: full ghost (extension lines + dashed dim line + label).
  if (dimA && !dimB && cursorWorld) {
    drawLineGhost(ctx, dimA, cursorWorld, toScreen);
  }
  if (dimGhost) {
    drawDimGhost(ctx, dimGhost.a, dimGhost.b, dimGhost.offset, vp.zoom, toScreen);
  }

  // ── Extend tool ghost ──────────────────────────────────────────────────
  // Dashed line from the hovered line's current end to the boundary it
  // reaches + a marker at the landing point (matches Roof / Elevations).
  if (extendPreview) {
    const f = toScreen(extendPreview.from), t = toScreen(extendPreview.to);
    ctx.save();
    ctx.strokeStyle = '#16A34A';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(t.x, t.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#16A34A'; ctx.fill();
    ctx.restore();
  }

  // ── Mirror tool preview ────────────────────────────────────────────────
  // Axis line at the cursor + a ghost of the reflected selection.
  if (activeTool === 'mirror' && selection.size > 0 && cursorWorld) {
    const pos = mirrorAxis === 'x' ? cursorWorld.y : cursorWorld.x;
    const R = mirrorReflector(mirrorAxis, pos);
    ctx.save();
    ctx.strokeStyle = '#7C3AED';
    ctx.lineWidth = 1.25;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    if (mirrorAxis === 'x') { const y = toScreen({ x: 0, y: pos }).y; ctx.moveTo(0, y); ctx.lineTo(vp.width, y); }
    else { const x = toScreen({ x: pos, y: 0 }).x; ctx.moveTo(x, 0); ctx.lineTo(x, vp.height); }
    ctx.stroke();
    ctx.strokeStyle = T.accent;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    for (const p of primitives) {
      if (!selection.has(p.id) || p.kind !== 'line') continue;
      const a = toScreen(R(p.a)), b = toScreen(R(p.b));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.restore();
  }

  // ── Fillet tool preview ────────────────────────────────────────────────
  if (activeTool === 'fillet' && filletFirst) {
    let hoverId: string | null = null;
    if (cursorWorld) {
      const h = hitTestTopmost(primitives, cursorWorld, 6 / proj.px);
      if (h && h.kind === 'line') hoverId = h.id;
    }
    drawFilletGhost(ctx, primitives, filletFirst.id, filletFirst.pick, hoverId, cursorWorld, toScreen);
  }

  // ── Box selection rectangle (drag in Select tool) ──────────────────────
  // Drawn last so it sits on top of all structure / preview overlays. Color
  // and dash style indicate the semantics (crossing = green dashed,
  // window = blue solid).
  if (boxSelect) {
    drawSelectionBox(ctx, boxSelect.start, boxSelect.current, toScreen);
  }

  // ── Snap indicator (overlaid AFTER the section) ────────────────────────
  // Only rendered when a draw/edit tool is active in drafting mode and the
  // cursor is within tolerance of a snap target. Drawn last so it sits on
  // top of the structure outlines.
  if (snap) {
    drawSnapIndicator(ctx, snap, toScreen);
  }

  // ── Title (screen-pixel overlay, doesn't scale with zoom) ───────────────
  ctx.fillStyle = T.inkSoft;
  ctx.font = '11px ui-sans-serif, system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Section — through exterior wall · ${SCALE_LABEL[vp.scaleMode]}`, 16, 8);
}

