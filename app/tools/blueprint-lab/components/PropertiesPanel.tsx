'use client';

import {
  CABINET_COLOR_DEFAULT, COUNTERTOP_COLOR_DEFAULT,
  DEFAULT_BAY_PROJECTION, DEFAULT_SIDE_PANEL_WIDTH,
  DOOR_DEFAULTS, Door, DoorType, DoorTypeSettings,
  Dimension, FRIDGE_WIDTHS, FURNITURE_CATALOG, FURNITURE_ROOMS, FridgeSize, FurnitureItem, FurnitureKind, FurnitureRoom,
  Level, LINE_COLOR_HEX, LineColor, LineEntity, LineStyle, LineWeight, ROOM_TYPES, RoomLabel, STOVE_WIDTHS, Stair, StairShape, StoveSize, TextLabel,
  SectionCut, Selection, ToolId, Wall, WallStatus, WallType,
  WINDOW_DEFAULTS, Window, WindowType, WindowTypeSettings,
  formatImperial,
} from '../engine/types';
import { resolveDimAnchor } from '../engine/geometry';
import { useState } from 'react';
import { wallAngleDeg, wallLength } from '../engine/geometry';
import { T } from '../engine/theme';

const PANEL: React.CSSProperties = {
  width: 280, flexShrink: 0, background: T.panel,
  borderLeft: `1px solid ${T.line}`,
  display: 'flex', flexDirection: 'column',
  color: T.ink, fontFamily: 'ui-sans-serif, system-ui',
};

const HEADER: React.CSSProperties = {
  padding: '14px 16px 10px', fontSize: 11, fontWeight: 700,
  letterSpacing: '0.8px', textTransform: 'uppercase', color: T.inkMuted,
  borderBottom: `1px solid ${T.line}`,
};

const ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 16px', fontSize: 13,
};

const LABEL: React.CSSProperties = { color: T.inkSoft, fontSize: 13, fontWeight: 500 };
const VALUE: React.CSSProperties = { color: T.ink, fontFamily: 'ui-monospace, monospace', fontSize: 12 };

const INPUT: React.CSSProperties = {
  width: 70, padding: '5px 8px', background: T.panel,
  border: `1px solid ${T.line}`, borderRadius: 6,
  color: T.ink, fontSize: 12, fontFamily: 'ui-monospace, monospace',
  textAlign: 'right', outline: 'none',
};

const SELECT: React.CSSProperties = {
  width: 110, padding: '5px 8px', background: T.panel,
  border: `1px solid ${T.line}`, borderRadius: 6,
  color: T.ink, fontSize: 12, outline: 'none',
};

const inputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = T.accent;
  e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentSoft}`;
};
const inputBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.currentTarget.style.borderColor = T.line;
  e.currentTarget.style.boxShadow = 'none';
};

interface Props {
  tool: ToolId;
  activeLevel: Level;
  selections: Selection[];
  selectedWalls: Wall[];
  selectedDoors: Door[];
  selectedWindows: Window[];
  defaultWallThickness: number;
  defaultWallHeight: number;
  defaultWallType: WallType;
  defaultWallStatus: WallStatus;
  offsetDistance: number;
  activeDoorType: DoorType;
  doorTypeSettings: Record<DoorType, DoorTypeSettings>;
  activeWindowType: WindowType;
  windowTypeSettings: Record<WindowType, WindowTypeSettings>;
  onUpdateWalls: (ids: string[], patch: Partial<Wall>) => void;
  onUpdateDoors: (ids: string[], patch: Partial<Door>) => void;
  onUpdateWindows: (ids: string[], patch: Partial<Window>) => void;
  onUpdateDefaultWall: (patch: { thickness?: number; height?: number; type?: WallType; status?: WallStatus }) => void;
  onUpdateOffsetDistance: (inches: number) => void;
  onChangeActiveDoorType: (type: DoorType) => void;
  onUpdateDoorTypeSettings: (type: DoorType, patch: Partial<DoorTypeSettings>) => void;
  onChangeActiveWindowType: (type: WindowType) => void;
  onUpdateWindowTypeSettings: (type: WindowType, patch: Partial<WindowTypeSettings>) => void;
  // Dimensions / Room labels / Stairs / Furniture
  selectedDimensions: Dimension[];
  selectedRoomLabels: RoomLabel[];
  selectedTexts: TextLabel[];
  selectedStairs: Stair[];
  selectedFurniture: FurnitureItem[];
  selectedLines: LineEntity[];
  dimensionOffset: number;
  roomLabelDefaultName: string;
  textDefaultText: string;
  stairDefaults: { width: number; length: number; direction: 'up' | 'down'; shape: StairShape };
  activeFurnitureKind: FurnitureKind;
  furnitureSettings: Record<FurnitureKind, { width: number; depth: number }>;
  defaultLineStyle: LineStyle;
  defaultLineWeight: LineWeight;
  defaultLineColor: LineColor;
  onUpdateDimensions: (ids: string[], patch: Partial<Dimension>) => void;
  // Driving dimension: move the co-selected element so the dimension reads the
  // given length (inches). The client resolves which element from the selection.
  onDriveDimension: (dimId: string, targetInches: number) => void;
  onUpdateRoomLabels: (ids: string[], patch: Partial<RoomLabel>) => void;
  onUpdateTexts: (ids: string[], patch: Partial<TextLabel>) => void;
  onUpdateStairs: (ids: string[], patch: Partial<Stair>) => void;
  onUpdateFurniture: (ids: string[], patch: Partial<FurnitureItem>) => void;
  onUpdateLines: (ids: string[], patch: Partial<LineEntity>) => void;
  // (onUpdateDefaultLine accepts color too — declared loosely below.)
  onUpdateDimensionOffset: (inches: number) => void;
  onUpdateRoomLabelDefaultName: (name: string) => void;
  onUpdateTextDefaultText: (text: string) => void;
  onUpdateStairDefaults: (patch: Partial<{ width: number; length: number; direction: 'up' | 'down'; shape: StairShape }>) => void;
  onChangeActiveFurnitureKind: (k: FurnitureKind) => void;
  onUpdateFurnitureKindSize: (k: FurnitureKind, size: { width?: number; depth?: number }) => void;
  onUpdateDefaultLine: (patch: { style?: LineStyle; weight?: LineWeight; color?: LineColor }) => void;
  // Section cuts (project-wide; passed through from Project.sectionCuts).
  selectedSectionCuts: SectionCut[];
  onUpdateSectionCuts: (ids: string[], patch: Partial<SectionCut>) => void;
  // Room-boundary polyline drafting. When non-null the canvas is in
  // polyline-input mode for the named room; the editor swaps "Draw boundary"
  // for "Cancel". The "Clear" button removes an existing boundary.
  boundaryDraftRoomId: string | null;
  onStartBoundaryDraft: (roomId: string) => void;
  onCancelBoundaryDraft: () => void;
  onClearBoundary: (roomId: string) => void;
  // Auto-detect a rectangular footprint from the enclosing walls. Returns
  // false when the room isn't clearly enclosed.
  onAutoBoundary: (roomId: string) => boolean;
  onDelete: () => void;
}

export default function PropertiesPanel({
  tool, activeLevel, selections, selectedWalls, selectedDoors, selectedWindows,
  defaultWallThickness, defaultWallHeight, defaultWallType, defaultWallStatus,
  offsetDistance, activeDoorType, doorTypeSettings,
  activeWindowType, windowTypeSettings,
  onUpdateWalls, onUpdateDoors, onUpdateWindows,
  onUpdateDefaultWall, onUpdateOffsetDistance,
  onChangeActiveDoorType, onUpdateDoorTypeSettings,
  onChangeActiveWindowType, onUpdateWindowTypeSettings,
  selectedDimensions, selectedRoomLabels, selectedTexts, selectedStairs, selectedFurniture, selectedLines,
  dimensionOffset, roomLabelDefaultName, textDefaultText, stairDefaults,
  activeFurnitureKind, furnitureSettings,
  defaultLineStyle, defaultLineWeight, defaultLineColor,
  onUpdateDimensions, onDriveDimension, onUpdateRoomLabels, onUpdateTexts, onUpdateStairs, onUpdateFurniture, onUpdateLines,
  onUpdateDimensionOffset, onUpdateRoomLabelDefaultName, onUpdateTextDefaultText, onUpdateStairDefaults,
  onChangeActiveFurnitureKind, onUpdateFurnitureKindSize,
  onUpdateDefaultLine,
  selectedSectionCuts, onUpdateSectionCuts,
  boundaryDraftRoomId, onStartBoundaryDraft, onCancelBoundaryDraft, onClearBoundary, onAutoBoundary,
  onDelete,
}: Props) {
  const wallSelCount  = selectedWalls.length;
  const doorSelCount  = selectedDoors.length;
  const winSelCount   = selectedWindows.length;
  const dimSelCount   = selectedDimensions.length;
  const labelSelCount = selectedRoomLabels.length;
  const textSelCount  = selectedTexts.length;
  const stairSelCount = selectedStairs.length;
  const furnSelCount  = selectedFurniture.length;
  const lineSelCount  = selectedLines.length;
  const cutSelCount   = selectedSectionCuts.length;
  const otherSelCount = selections.length
    - wallSelCount - doorSelCount - winSelCount
    - dimSelCount - labelSelCount - stairSelCount - furnSelCount - lineSelCount
    - cutSelCount;

  // Driving dimension: exactly one dimension + one drivable element co-selected
  // (e.g. window + its dimension). Typing a distance moves the element so the
  // dimension reads it. Checked BEFORE the per-type editors below.
  const drivableSelCount = wallSelCount + doorSelCount + winSelCount + stairSelCount + furnSelCount;
  if (dimSelCount === 1 && drivableSelCount === 1 && selections.length === 2) {
    const dim = selectedDimensions[0];
    const elementLabel =
      wallSelCount ? 'wall' : doorSelCount ? 'door' : winSelCount ? 'window'
      : stairSelCount ? 'stair' : 'furniture';
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Set distance</div>
        <DrivingDimensionEditor
          dim={dim}
          activeLevel={activeLevel}
          elementLabel={elementLabel}
          onDrive={inches => onDriveDimension(dim.id, inches)}
        />
      </aside>
    );
  }

  // 1+ window selected → show window editor.
  if (winSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {winSelCount === 1 ? 'Window properties' : `${winSelCount} windows selected`}
        </div>
        <WindowEditor
          windows={selectedWindows}
          onUpdate={patch => onUpdateWindows(selectedWindows.map(w => w.id), patch)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // Window tool active, nothing selected → type picker + size/sill + variant.
  if (tool === 'window' && selections.length === 0) {
    const s = windowTypeSettings[activeWindowType];
    const update = (patch: Partial<WindowTypeSettings>) => onUpdateWindowTypeSettings(activeWindowType, patch);
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place window</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Pick a window type, configure it, then click on a wall.
        </div>
        <WindowTypePicker active={activeWindowType} onChange={onChangeActiveWindowType} />
        <div style={{ height: 1, background: T.line, margin: '6px 0' }} />
        <WindowSizeControls
          width={s.width} height={s.height} headHeight={s.headHeight}
          onChange={update}
        />
        <WindowTypeVariantControls
          windowType={activeWindowType} settings={s} onChange={update}
        />
      </aside>
    );
  }

  // 1+ dimension selected.
  if (dimSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {dimSelCount === 1 ? 'Dimension' : `${dimSelCount} dimensions selected`}
        </div>
        <DimensionEditor
          dims={selectedDimensions}
          activeLevel={activeLevel}
          onUpdate={p => onUpdateDimensions(selectedDimensions.map(d => d.id), p)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // 1+ room label selected.
  if (labelSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {labelSelCount === 1 ? 'Room label' : `${labelSelCount} labels selected`}
        </div>
        <RoomLabelEditor
          labels={selectedRoomLabels}
          onUpdate={p => onUpdateRoomLabels(selectedRoomLabels.map(r => r.id), p)}
          onDelete={onDelete}
          boundaryDraftRoomId={boundaryDraftRoomId}
          onStartBoundaryDraft={onStartBoundaryDraft}
          onCancelBoundaryDraft={onCancelBoundaryDraft}
          onClearBoundary={onClearBoundary}
          onAutoBoundary={onAutoBoundary}
        />
      </aside>
    );
  }

  // 1+ text label selected.
  if (textSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {textSelCount === 1 ? 'Text' : `${textSelCount} texts selected`}
        </div>
        <TextLabelEditor
          texts={selectedTexts}
          onUpdate={p => onUpdateTexts(selectedTexts.map(t => t.id), p)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // 1+ stair selected.
  if (stairSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {stairSelCount === 1 ? 'Stair' : `${stairSelCount} stairs selected`}
        </div>
        <StairEditor
          stairs={selectedStairs}
          onUpdate={p => onUpdateStairs(selectedStairs.map(s => s.id), p)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // 1+ furniture item selected.
  if (furnSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {furnSelCount === 1 ? 'Furniture' : `${furnSelCount} items selected`}
        </div>
        <FurnitureEditor
          items={selectedFurniture}
          onUpdate={p => onUpdateFurniture(selectedFurniture.map(f => f.id), p)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // 1+ annotation line selected.
  if (lineSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {lineSelCount === 1 ? 'Line' : `${lineSelCount} lines selected`}
        </div>
        <LineEditor
          lines={selectedLines}
          onUpdate={p => onUpdateLines(selectedLines.map(l => l.id), p)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // Tool placement views.
  if (tool === 'dimension' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place dimension</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click the first point, then the second. The dimension line places
          itself perpendicular to the measured segment.
        </div>
        <div style={ROW}>
          <span style={LABEL}>Offset</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" step={1} min={2} max={120}
              value={dimensionOffset}
              onChange={e => { const v = Number(e.target.value); if (v > 0) onUpdateDimensionOffset(v); }}
              onFocus={inputFocus} onBlur={inputBlur}
              style={INPUT}
            />
            <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
          </span>
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
          Distance from the measured segment to the dim line.
        </div>
      </aside>
    );
  }

  if (tool === 'room-label' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place room label</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click inside a room to drop a label. Pick from canonical names so
          the future Rooms tab can compile a clean list — choose
          &quot;Other&hellip;&quot; if you need a custom name.
        </div>
        <RoomTypePicker
          value={roomLabelDefaultName}
          onChange={onUpdateRoomLabelDefaultName}
        />
      </aside>
    );
  }

  if (tool === 'text' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place text</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click anywhere to drop a free-form text annotation. Use for headers,
          notes, callouts — anything that isn&apos;t a room name.
        </div>
        <div style={ROW}>
          <span style={LABEL}>Default text</span>
          <input
            type="text"
            value={textDefaultText}
            onChange={e => onUpdateTextDefaultText(e.target.value)}
            onFocus={inputFocus} onBlur={inputBlur}
            style={{ ...INPUT, width: 130, textAlign: 'left' }}
          />
        </div>
      </aside>
    );
  }

  if (tool === 'stair' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place stair</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click to drop a stair. Edit width, length, and direction afterward.
        </div>
        <StairControls
          width={stairDefaults.width}
          length={stairDefaults.length}
          direction={stairDefaults.direction}
          shape={stairDefaults.shape}
          onChange={onUpdateStairDefaults}
        />
      </aside>
    );
  }

  if (tool === 'furniture' && selections.length === 0) {
    const s = furnitureSettings[activeFurnitureKind];
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place furniture</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Pick a kind and click to place. Rotate from the properties panel after placement.
        </div>
        <FurnitureKindPicker active={activeFurnitureKind} onChange={onChangeActiveFurnitureKind} />
        <div style={{ height: 1, background: T.line, margin: '6px 0' }} />
        <FurnitureSizeControls
          width={s.width}
          depth={s.depth}
          onChange={p => onUpdateFurnitureKindSize(activeFurnitureKind, p)}
        />
      </aside>
    );
  }

  if (tool === 'line' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Draw line</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click a start point, then an end point. Type a length (or
          length@angle) before the second click to draw exactly. Esc cancels.
        </div>
        <LineStyleControls
          style={defaultLineStyle}
          weight={defaultLineWeight}
          color={defaultLineColor}
          onChange={onUpdateDefaultLine}
        />
      </aside>
    );
  }

  if (tool === 'erase' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Erase</div>
        <div style={{ padding: '10px 16px 16px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click any wall, door, window, line, dimension, room label, stair,
          or furniture item to delete it. Each click is one undo step.
        </div>
      </aside>
    );
  }

  if (tool === 'trim' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Trim / Split</div>
        <div style={{ padding: '10px 16px 16px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click a wall or line and it splits at every place another line or
          wall crosses it. Lines drawn with the Line tool also auto-trim
          anything they cross — this tool is for retroactive cleanups.
        </div>
      </aside>
    );
  }

  // 1+ door selected → show door editor (takes priority over tool, since
  // the user is clearly working with that door).
  if (doorSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {doorSelCount === 1 ? 'Door properties' : `${doorSelCount} doors selected`}
        </div>
        <DoorEditor
          doors={selectedDoors}
          onUpdate={patch => onUpdateDoors(selectedDoors.map(d => d.id), patch)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // Door tool active, nothing selected → type picker + ALL type-specific
  // settings, so the user can configure the door fully before clicking.
  if (tool === 'door' && selections.length === 0) {
    const s = doorTypeSettings[activeDoorType];
    const update = (patch: Partial<DoorTypeSettings>) => onUpdateDoorTypeSettings(activeDoorType, patch);
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Place door</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Pick a door type, configure it, then click on a wall.
        </div>
        <DoorTypePicker active={activeDoorType} onChange={onChangeActiveDoorType} />
        <div style={{ height: 1, background: T.line, margin: '6px 0' }} />
        <DoorSizeControls
          width={s.width} height={s.height}
          onChange={update}
        />
        <DoorTypeVariantControls doorType={activeDoorType} settings={s} onChange={update} />
      </aside>
    );
  }

  // Move tool active — show instructions. Selection of any kind drives the
  // move, so we don't replace the editor with this; we only show it when
  // nothing is selected (and the user needs guidance).
  if (tool === 'move' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Move selection</div>
        <div style={{ padding: '20px 22px', fontSize: 13, color: T.inkMuted, lineHeight: 1.6 }}>
          Nothing selected yet. Switch to the <strong style={{ color: T.inkSoft }}>Select</strong> tool,
          click or drag-box to pick what you want to move, then return to the Move tool.
        </div>
      </aside>
    );
  }
  if (tool === 'move') {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Move selection</div>
        <div style={{ padding: '12px 16px', fontSize: 12, color: T.inkSoft, lineHeight: 1.6 }}>
          <div>• Click a <strong style={{ color: T.ink }}>base point</strong> to start.</div>
          <div>• Drag — dimensions update live.</div>
          <div>• Click again to place, or type a distance / <code style={{ fontFamily: 'ui-monospace, monospace' }}>distance@angle</code> + Enter.</div>
          <div>• Esc to cancel.</div>
        </div>
        <div style={{ padding: '4px 16px 14px', fontSize: 11, color: T.inkMuted }}>
          {selections.length} object{selections.length === 1 ? '' : 's'} selected.
        </div>
      </aside>
    );
  }

  // Offset tool active — always show offset settings (even if a wall is selected
  // from a previous tool, since offset is a transient command).
  if (tool === 'offset') {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Offset wall</div>
        <div style={{ padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
          Click a wall, then click the side to offset toward.
          A new parallel wall is created at this distance.
        </div>
        <OffsetDistanceControl value={offsetDistance} onChange={onUpdateOffsetDistance} />
      </aside>
    );
  }

  // 1+ wall selected
  if (wallSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {wallSelCount === 1 ? 'Wall properties' : `${wallSelCount} walls selected`}
        </div>
        <WallEditor
          walls={selectedWalls}
          onUpdate={patch => onUpdateWalls(selectedWalls.map(w => w.id), patch)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // Wall tool active, nothing selected → show defaults
  if (tool === 'wall' && selections.length === 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>New wall defaults</div>
        <div style={{
          padding: '10px 16px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5,
        }}>
          Settings applied to the next wall you draw.
        </div>
        <WallSettingsControls
          thickness={defaultWallThickness}
          height={defaultWallHeight}
          type={defaultWallType}
          status={defaultWallStatus}
          onChange={onUpdateDefaultWall}
          mixed={{ thickness: false, height: false, type: false, status: false }}
        />
      </aside>
    );
  }

  // Section cut(s) selected.
  if (cutSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>
          {cutSelCount === 1 ? `Section ${selectedSectionCuts[0].name}-${selectedSectionCuts[0].name}'` : `${cutSelCount} section cuts`}
        </div>
        <SectionCutControls
          cuts={selectedSectionCuts}
          onUpdate={patch => onUpdateSectionCuts(selectedSectionCuts.map(c => c.id), patch)}
          onDelete={onDelete}
        />
      </aside>
    );
  }

  // Non-wall selection (door, window, etc.)
  if (otherSelCount > 0) {
    return (
      <aside style={PANEL}>
        <div style={HEADER}>Properties</div>
        <div style={{ padding: '20px 22px', fontSize: 13, color: T.inkMuted, lineHeight: 1.6 }}>
          This object type doesn&apos;t have editable properties yet in v1.
        </div>
      </aside>
    );
  }

  // Nothing selected, non-wall tool
  return (
    <aside style={PANEL}>
      <div style={HEADER}>Properties</div>
      <div style={{
        padding: '20px 22px', fontSize: 13, color: T.inkMuted, lineHeight: 1.6,
        fontStyle: 'italic',
      }}>
        Nothing selected. Click an object on the canvas to edit its properties,
        or drag a box to select multiple.
      </div>
    </aside>
  );
}

// ─── Wall editor (handles single + multi) ───────────────────────────────────

function WallEditor({ walls, onUpdate, onDelete }: {
  walls: Wall[]; onUpdate: (patch: Partial<Wall>) => void; onDelete: () => void;
}) {
  // For multi-select, only show shared values; otherwise leave the input blank.
  const single = walls.length === 1;
  const w0 = walls[0];
  const allSame = <K extends keyof Wall>(k: K) => walls.every(w => w[k] === w0[k]);

  const thicknessShared = allSame('thickness');
  const heightShared = allSame('height');
  const typeShared = allSame('type');
  // Walls created before WallStatus existed have undefined → treat as 'proposed'.
  const statusShared = walls.every(w => (w.status ?? 'proposed') === (walls[0].status ?? 'proposed'));

  return (
    <div>
      {single && (
        <>
          <div style={{ padding: '14px 16px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              background: T.accentSoft, color: T.accentInk, fontSize: 10, fontWeight: 700,
              padding: '3px 9px', borderRadius: 4, letterSpacing: '0.6px',
            }}>WALL</span>
            <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: 'ui-monospace, monospace' }}>
              {w0.id.split('_')[0]}
            </span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Length</span>
            <span style={VALUE}>{formatImperial(wallLength(w0))}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Angle</span>
            <span style={VALUE}>{wallAngleDeg(w0).toFixed(1)}°</span>
          </div>
          <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        </>
      )}

      <WallSettingsControls
        thickness={thicknessShared ? w0.thickness : null}
        height={heightShared ? w0.height : null}
        type={typeShared ? w0.type : null}
        status={statusShared ? (w0.status ?? 'proposed') : null}
        onChange={onUpdate}
        mixed={{ thickness: !thicknessShared, height: !heightShared, type: !typeShared, status: !statusShared }}
      />

      <div style={{ height: 1, background: T.line, margin: '8px 0' }} />

      <div style={{ padding: '8px 16px 16px' }}>
        <button
          onClick={onDelete}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            background: T.panel, color: T.danger,
            border: `1px solid ${T.line}`, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, transition: 'all 120ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#fff5f5';
            e.currentTarget.style.borderColor = 'rgba(229,62,62,0.35)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = T.panel;
            e.currentTarget.style.borderColor = T.line;
          }}
        >
          {single ? 'Delete wall' : `Delete ${walls.length} walls`}
        </button>
      </div>
    </div>
  );
}

// ─── Section cut editor ─────────────────────────────────────────────────────
// Shown when one or more SectionCuts are selected. Lets the user rename a
// single cut, flip the viewing direction, and read the cut's plan position
// and length. Multi-selection is reduced to flip + delete only (renaming
// multiple cuts at once doesn't make sense).

function SectionCutControls({
  cuts, onUpdate, onDelete,
}: {
  cuts: SectionCut[];
  onUpdate: (patch: Partial<SectionCut>) => void;
  onDelete: () => void;
}) {
  const single = cuts.length === 1 ? cuts[0] : null;
  const [draftName, setDraftName] = useState<string | null>(null);
  const nameValue = draftName ?? (single?.name ?? '');

  const length = single ? Math.abs(single.end - single.start) : 0;
  const posLabel = single
    ? (single.axis === 'x' ? `Y = ${formatImperial(single.position)}` : `X = ${formatImperial(single.position)}`)
    : '—';
  const axisLabel = single
    ? (single.axis === 'x' ? 'Horizontal (along X)' : 'Vertical (along Y)')
    : '—';

  const commitName = () => {
    if (draftName == null) return;
    const trimmed = draftName.trim();
    setDraftName(null);
    if (!trimmed || trimmed === single?.name) return;
    onUpdate({ name: trimmed });
  };

  return (
    <div>
      {single && (
        <>
          <div style={ROW}>
            <span style={LABEL}>Label</span>
            <input
              type="text"
              value={nameValue}
              onChange={(e) => setDraftName(e.target.value)}
              onFocus={inputFocus}
              onBlur={(e) => { commitName(); inputBlur(e); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { commitName(); (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Escape') { setDraftName(null); (e.target as HTMLInputElement).blur(); }
              }}
              style={{ ...INPUT, width: 80, textAlign: 'left' }}
              title="The letter shown at each end of the section line on the plan (e.g. A → A')."
            />
          </div>
          <div style={ROW}>
            <span style={LABEL}>Orientation</span>
            <span style={VALUE}>{axisLabel}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Position</span>
            <span style={VALUE}>{posLabel}</span>
          </div>
          <div style={ROW}>
            <span style={LABEL}>Length</span>
            <span style={VALUE}>{formatImperial(length)}</span>
          </div>
        </>
      )}
      <div style={ROW}>
        <span style={LABEL}>Viewing dir</span>
        <button
          type="button"
          onClick={() => onUpdate({ facing: cuts[0].facing === 1 ? -1 : 1 })}
          title="Flip the viewing-direction arrow (shortcut: F)"
          style={{
            padding: '5px 10px', fontSize: 12, fontWeight: 600,
            background: T.panel, color: T.ink,
            border: `1px solid ${T.line}`, borderRadius: 6, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ↻ Flip
        </button>
      </div>
      <div style={{ padding: '12px 16px 16px' }}>
        <button
          type="button"
          onClick={onDelete}
          style={{
            width: '100%', padding: '8px 12px', fontSize: 12, fontWeight: 600,
            background: T.panel, color: T.danger,
            border: `1px solid ${T.danger}`, borderRadius: 6, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Delete {cuts.length === 1 ? 'cut' : `${cuts.length} cuts`}
        </button>
      </div>
    </div>
  );
}

// ─── Shared controls for thickness/height/type ──────────────────────────────

function WallSettingsControls({
  thickness, height, type, status, onChange, mixed,
}: {
  thickness: number | null;
  height: number | null;
  type: WallType | null;
  status: WallStatus | null;
  onChange: (patch: { thickness?: number; height?: number; type?: WallType; status?: WallStatus }) => void;
  mixed: { thickness: boolean; height: boolean; type: boolean; status: boolean };
}) {
  return (
    <>
      <div style={ROW}>
        <span style={LABEL}>Thickness</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={0.25} min={1} max={24}
            value={thickness ?? ''}
            placeholder={mixed.thickness ? '—' : ''}
            onChange={e => {
              const v = Number(e.target.value);
              if (v > 0) onChange({ thickness: Math.max(1, v) });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Height</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={36} max={240}
            value={height ?? ''}
            placeholder={mixed.height ? '—' : ''}
            onChange={e => {
              const v = Number(e.target.value);
              if (v > 0) onChange({ height: Math.max(36, v) });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Type</span>
        <select
          value={type ?? ''}
          onChange={e => onChange({ type: e.target.value as WallType })}
          onFocus={inputFocus} onBlur={inputBlur}
          style={SELECT}
        >
          {mixed.type && <option value="" disabled>Mixed</option>}
          <option value="wall">Wall</option>
          <option value="partition">Partition</option>
        </select>
      </div>
      <div style={ROW}>
        <span style={LABEL}>
          Status
          <WallStatusSwatch status={status} mixed={mixed.status} />
        </span>
        <select
          value={status ?? ''}
          onChange={e => onChange({ status: e.target.value as WallStatus })}
          onFocus={inputFocus} onBlur={inputBlur}
          style={SELECT}
        >
          {mixed.status && <option value="" disabled>Mixed</option>}
          <option value="existing">Existing</option>
          <option value="proposed">Proposed</option>
          <option value="demo">Demo</option>
        </select>
      </div>
    </>
  );
}

// Tiny color chip beside the Status label so the user sees at a glance which
// hatch color goes with which status.
function WallStatusSwatch({ status, mixed }: { status: WallStatus | null; mixed: boolean }) {
  if (mixed || status == null) return null;
  const color =
    status === 'existing' ? '#6b7280' :
    status === 'proposed' ? '#4f7cff' :
                            '#e53e3e';
  return (
    <span style={{
      display: 'inline-block', verticalAlign: 'middle',
      width: 8, height: 8, marginLeft: 6, borderRadius: 2,
      background: color, opacity: 0.9,
    }} />
  );
}

// ─── Offset distance control ──────────────────────────────────────────────────
// Accepts a feet'inches" string or a plain number (inches). Commits on blur
// or Enter; shows the parsed value back in canonical form.

function parseLengthInput(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const ftIn = t.match(/^(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)?\s*"?$/);
  if (ftIn) {
    const ft = parseFloat(ftIn[1]);
    const inch = ftIn[2] ? parseFloat(ftIn[2]) : 0;
    const total = ft * 12 + inch;
    return total > 0 ? total : null;
  }
  const num = t.match(/^(\d+(?:\.\d+)?)\s*"?$/);
  if (num) {
    const v = parseFloat(num[1]);
    return v > 0 ? v : null;
  }
  return null;
}

// ─── Door: type picker (2×3 grid) ────────────────────────────────────────────

const DOOR_TYPES: DoorType[] = ['room', 'entry', 'sliding', 'bifold', 'pocket', 'barn'];

function DoorTypePicker({
  active, onChange,
}: { active: DoorType; onChange: (t: DoorType) => void }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: 6, padding: '8px 14px',
    }}>
      {DOOR_TYPES.map(t => {
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: '10px 8px',
              background: isActive ? T.accentSoft : T.panel,
              border: `1px solid ${isActive ? 'rgba(79,124,255,0.4)' : T.line}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              color: isActive ? T.accentInk : T.ink,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              transition: 'all 120ms',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.bg; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = T.panel; }}
          >
            <DoorGlyph type={t} active={isActive} />
            <span style={{ fontSize: 11 }}>{DOOR_DEFAULTS[t].label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Tiny SVG previews so users can recognize the type at a glance.
function DoorGlyph({ type, active }: { type: DoorType; active: boolean }) {
  const color = active ? T.accentInk : T.inkSoft;
  const light = active ? T.accent : T.inkMuted;
  switch (type) {
    case 'room':
    case 'entry':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M2 22 L38 22" stroke={light} strokeWidth="2" />
          <path d="M8 22 L8 6" stroke={color} strokeWidth="1.5" />
          <path d="M8 22 A 16 16 0 0 1 24 6" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
          {type === 'entry' && (
            <>
              <path d="M2 22 L2 26" stroke={light} strokeWidth="1.2" />
              <path d="M38 22 L38 26" stroke={light} strokeWidth="1.2" />
            </>
          )}
        </svg>
      );
    case 'sliding':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M2 10 L38 10 M2 18 L38 18" stroke={light} strokeWidth="1.2" />
          <rect x="4" y="6" width="16" height="6" fill="white" stroke={color} strokeWidth="1.3" />
          <rect x="20" y="16" width="16" height="6" fill="white" stroke={color} strokeWidth="1.3" />
        </svg>
      );
    case 'bifold':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M2 22 L38 22" stroke={light} strokeWidth="2" />
          <path d="M6 22 L20 8 L34 22" stroke={color} strokeWidth="1.5" />
          <circle cx="6" cy="22" r="1.5" fill={color} />
        </svg>
      );
    case 'pocket':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M2 22 L38 22" stroke={light} strokeWidth="2" />
          <rect x="8" y="13" width="24" height="6" fill="white" stroke={color} strokeWidth="1.3" />
          <path d="M32 13 L40 13 M32 19 L40 19" stroke={light} strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case 'barn':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M2 22 L38 22" stroke={light} strokeWidth="2" />
          <path d="M4 8 L36 8" stroke={light} strokeWidth="1.2" />
          <rect x="6" y="10" width="28" height="6" fill="white" stroke={color} strokeWidth="1.3" />
        </svg>
      );
  }
}

// ─── Door: size + properties controls ────────────────────────────────────────

function DoorSizeControls({
  width, height, onChange,
}: { width: number; height: number; onChange: (p: { width?: number; height?: number }) => void }) {
  return (
    <>
      <div style={ROW}>
        <span style={LABEL}>Width</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={18} max={120}
            value={width}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ width: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Height</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={48} max={120}
            value={height}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ height: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
    </>
  );
}

// Renders ONLY the controls that vary by door type. Shared by the placement
// view (active type) and the props panel (selected door's type).
function DoorTypeVariantControls({
  doorType, settings, onChange,
}: {
  doorType: DoorType;
  settings: DoorTypeSettings;
  onChange: (patch: Partial<DoorTypeSettings>) => void;
}) {
  if (doorType === 'bifold') {
    const isDouble = settings.width >= 36;
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={ROW}>
          <span style={LABEL}>Configuration</span>
          <span style={{ ...VALUE, color: T.accentInk }}>
            {isDouble ? 'Double (4 panels)' : 'Single (2 panels)'}
          </span>
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
          Bifolds switch to double automatically when width is 36&quot; or more.
        </div>
      </>
    );
  }
  if (doorType === 'barn') {
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={ROW}>
          <span style={LABEL}>Panels</span>
          <select
            value={settings.panels ?? 'single'}
            onChange={e => {
              const panels = e.target.value as 'single' | 'double';
              const patch: Partial<DoorTypeSettings> = { panels };
              if (panels === 'double' && settings.width < 60) patch.width = 72;
              onChange(patch);
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="single">Single</option>
            <option value="double">Double</option>
          </select>
        </div>
      </>
    );
  }
  if (doorType === 'sliding') {
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={ROW}>
          <span style={LABEL}>Style</span>
          <select
            value={settings.slideStyle ?? 'interior'}
            onChange={e => onChange({ slideStyle: e.target.value as 'interior' | 'exterior' })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="interior">Interior</option>
            <option value="exterior">Exterior (patio)</option>
          </select>
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
          Exterior sliding doors render with heavier frames and a sill line.
        </div>
      </>
    );
  }
  if (doorType === 'entry') {
    const sp = settings.sidePanels ?? 'none';
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={{ padding: '4px 16px 4px', fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '0.5px' }}>
          SIDELITES
        </div>
        <div style={ROW}>
          <span style={LABEL}>Side panels</span>
          <select
            value={sp}
            onChange={e => onChange({ sidePanels: e.target.value as DoorTypeSettings['sidePanels'] })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="none">None</option>
            <option value="left">Left only</option>
            <option value="right">Right only</option>
            <option value="both">Both sides</option>
          </select>
        </div>
        {sp !== 'none' && (
          <div style={ROW}>
            <span style={LABEL}>Panel width</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number" step={1} min={6} max={36}
                value={settings.sidePanelWidth ?? DEFAULT_SIDE_PANEL_WIDTH}
                onChange={e => {
                  const v = Number(e.target.value);
                  if (v > 0) onChange({ sidePanelWidth: v });
                }}
                onFocus={inputFocus} onBlur={inputBlur}
                style={INPUT}
              />
              <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
            </span>
          </div>
        )}
      </>
    );
  }
  return null;
}

function DoorEditor({ doors, onUpdate, onDelete }: {
  doors: Door[]; onUpdate: (p: Partial<Door>) => void; onDelete: () => void;
}) {
  const single = doors.length === 1;
  const d0 = doors[0];
  const allSame = <K extends keyof Door>(k: K) => doors.every(d => d[k] === d0[k]);
  const typeShared = allSame('doorType');
  const widthShared = allSame('width');
  const heightShared = allSame('height');
  const hingeShared = allSame('hingeSide');
  const flippedShared = allSame('flipped');

  return (
    <div>
      {single && (
        <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: T.accentSoft, color: T.accentInk, fontSize: 10, fontWeight: 700,
            padding: '3px 9px', borderRadius: 4, letterSpacing: '0.6px',
          }}>{DOOR_DEFAULTS[d0.doorType].label.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: 'ui-monospace, monospace' }}>
            {d0.id.split('_')[0]}
          </span>
        </div>
      )}

      {typeShared && (
        <div style={ROW}>
          <span style={LABEL}>Type</span>
          <select
            value={d0.doorType}
            onChange={e => onUpdate({ doorType: e.target.value as DoorType })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            {DOOR_TYPES.map(t => (
              <option key={t} value={t}>{DOOR_DEFAULTS[t].label}</option>
            ))}
          </select>
        </div>
      )}

      <DoorSizeControls
        width={widthShared ? d0.width : 0}
        height={heightShared ? d0.height : 0}
        onChange={onUpdate}
      />

      {typeShared && (
        <DoorTypeVariantControls
          doorType={d0.doorType}
          settings={{
            width: d0.width, height: d0.height,
            panels: d0.panels, sidePanels: d0.sidePanels,
            sidePanelWidth: d0.sidePanelWidth, slideStyle: d0.slideStyle,
          }}
          onChange={onUpdate}
        />
      )}

      <div style={{ height: 1, background: T.line, margin: '8px 0' }} />

      <div style={{ padding: '4px 16px 4px', fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '0.5px' }}>
        SWING DIRECTION
      </div>
      <div style={{ padding: '4px 14px 10px', display: 'flex', gap: 6 }}>
        <button
          onClick={() => onUpdate({ hingeSide: d0.hingeSide === 'start' ? 'end' : 'start' })}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 6,
            background: T.panel, border: `1px solid ${T.line}`,
            color: T.ink, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          ↔ Flip hinge
          {hingeShared && (
            <span style={{ display: 'block', fontSize: 10, color: T.inkMuted, fontWeight: 500 }}>
              hinge on {d0.hingeSide === 'start' ? 'left' : 'right'}
            </span>
          )}
        </button>
        <button
          onClick={() => onUpdate({ flipped: !d0.flipped })}
          style={{
            flex: 1, padding: '8px 10px', borderRadius: 6,
            background: T.panel, border: `1px solid ${T.line}`,
            color: T.ink, cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}
        >
          ⇅ Flip side
          {flippedShared && (
            <span style={{ display: 'block', fontSize: 10, color: T.inkMuted, fontWeight: 500 }}>
              opens {d0.flipped ? 'inward' : 'outward'}
            </span>
          )}
        </button>
      </div>

      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />

      <div style={{ padding: '8px 16px 16px' }}>
        <button
          onClick={onDelete}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            background: T.panel, color: T.danger,
            border: `1px solid ${T.line}`, cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#fff5f5';
            e.currentTarget.style.borderColor = 'rgba(229,62,62,0.35)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = T.panel;
            e.currentTarget.style.borderColor = T.line;
          }}
        >
          {single ? 'Delete door' : `Delete ${doors.length} doors`}
        </button>
      </div>
    </div>
  );
}

// ─── Windows ──────────────────────────────────────────────────────────────────

const WINDOW_TYPES: WindowType[] = ['double-hung', 'casement', 'awning', 'sliding', 'fixed', 'bay'];

function WindowTypePicker({
  active, onChange,
}: { active: WindowType; onChange: (t: WindowType) => void }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: 6, padding: '8px 14px',
    }}>
      {WINDOW_TYPES.map(t => {
        const isActive = active === t;
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            style={{
              padding: '10px 8px',
              background: isActive ? T.accentSoft : T.panel,
              border: `1px solid ${isActive ? 'rgba(79,124,255,0.4)' : T.line}`,
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              color: isActive ? T.accentInk : T.ink,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              transition: 'all 120ms',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.bg; }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = T.panel; }}
          >
            <WindowGlyph type={t} active={isActive} />
            <span style={{ fontSize: 11 }}>{WINDOW_DEFAULTS[t].label}</span>
          </button>
        );
      })}
    </div>
  );
}

function WindowGlyph({ type, active }: { type: WindowType; active: boolean }) {
  const color = active ? T.accentInk : T.inkSoft;
  const light = active ? T.accent : T.inkMuted;
  switch (type) {
    case 'double-hung':
    case 'fixed':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <rect x="4" y="10" width="32" height="8" fill="white" stroke={color} strokeWidth="1.3" />
          <line x1="4" y1="14" x2="36" y2="14" stroke={light} />
        </svg>
      );
    case 'sliding':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <rect x="4" y="10" width="32" height="8" fill="white" stroke={color} strokeWidth="1.3" />
          <line x1="20" y1="10" x2="20" y2="18" stroke={color} strokeWidth="1.2" />
          <line x1="4" y1="13" x2="20" y2="13" stroke={light} />
          <line x1="20" y1="15" x2="36" y2="15" stroke={light} />
        </svg>
      );
    case 'casement':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <rect x="4" y="10" width="32" height="8" fill="white" stroke={color} strokeWidth="1.3" />
          <line x1="4" y1="14" x2="36" y2="14" stroke={light} />
          <line x1="4" y1="18" x2="18" y2="26" stroke={color} strokeWidth="1.3" />
          <path d="M 4 18 A 14 14 0 0 1 18 26" stroke={color} strokeWidth="0.9" strokeDasharray="2 2" fill="none" />
        </svg>
      );
    case 'awning':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <rect x="4" y="10" width="32" height="8" fill="white" stroke={color} strokeWidth="1.3" />
          <line x1="4" y1="14" x2="36" y2="14" stroke={light} />
          <path d="M 4 18 L 20 25 L 36 18" stroke={color} strokeWidth="1.3" fill="none" />
        </svg>
      );
    case 'bay':
      return (
        <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
          <path d="M 4 14 L 4 8 L 12 4 L 28 4 L 36 8 L 36 14 Z"
                fill="white" stroke={color} strokeWidth="1.3" />
          <line x1="12" y1="4" x2="12" y2="8" stroke={color} strokeWidth="1" />
          <line x1="28" y1="4" x2="28" y2="8" stroke={color} strokeWidth="1" />
          <line x1="4" y1="14" x2="36" y2="14" stroke={light} />
        </svg>
      );
  }
}

function WindowSizeControls({
  width, height, headHeight, onChange,
}: {
  width: number; height: number; headHeight: number;
  onChange: (p: { width?: number; height?: number; headHeight?: number }) => void;
}) {
  const sill = headHeight - height;
  return (
    <>
      <div style={ROW}>
        <span style={LABEL}>Width</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={12} max={144}
            value={width}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ width: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Height</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={12} max={120}
            value={height}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ height: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Head height</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={24} max={144}
            value={headHeight}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ headHeight: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
        Top of window — keep this consistent across windows so the heads align.
        Sill height (derived): <strong style={{ color: T.inkSoft }}>{formatImperial(sill)}</strong>
      </div>
    </>
  );
}

function WindowTypeVariantControls({
  windowType, settings, onChange,
}: {
  windowType: WindowType;
  settings: WindowTypeSettings;
  onChange: (patch: Partial<WindowTypeSettings>) => void;
}) {
  if (windowType === 'casement') {
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={ROW}>
          <span style={LABEL}>Sashes</span>
          <select
            value={settings.panels ?? 'single'}
            onChange={e => onChange({ panels: e.target.value as 'single' | 'double' })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="single">Single</option>
            <option value="double">Double (paired)</option>
          </select>
        </div>
      </>
    );
  }
  if (windowType === 'double-hung') {
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={ROW}>
          <span style={LABEL}>Units</span>
          <select
            value={settings.panels ?? 'single'}
            onChange={e => {
              const panels = e.target.value as 'single' | 'double';
              const patch: Partial<WindowTypeSettings> = { panels };
              // A double double-hung is two units flanking a 2x4 mullion —
              // 36" per unit is the typical default, so bump to 72" total.
              if (panels === 'double' && settings.width < 60) patch.width = 72;
              onChange(patch);
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="single">Single</option>
            <option value="double">Double (2x4 mullion)</option>
          </select>
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
          Double places two double-hung units separated by a 1.5&quot; (2x4) mullion.
        </div>
      </>
    );
  }
  if (windowType === 'bay') {
    return (
      <>
        <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        <div style={ROW}>
          <span style={LABEL}>Projection</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number" step={1} min={6} max={48}
              value={settings.bayProjection ?? DEFAULT_BAY_PROJECTION}
              onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ bayProjection: v }); }}
              onFocus={inputFocus} onBlur={inputBlur}
              style={INPUT}
            />
            <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
          </span>
        </div>
        <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
          How far the window projects outward from the wall.
        </div>
      </>
    );
  }
  return null;
}

function WindowEditor({ windows, onUpdate, onDelete }: {
  windows: Window[]; onUpdate: (p: Partial<Window>) => void; onDelete: () => void;
}) {
  const single = windows.length === 1;
  const w0 = windows[0];
  const allSame = <K extends keyof Window>(k: K) => windows.every(w => w[k] === w0[k]);
  const typeShared = allSame('windowType');
  const widthShared = allSame('width');
  const heightShared = allSame('height');
  const headShared = allSame('headHeight');
  const flippedShared = allSame('flipped');
  const hingeShared = allSame('hingeSide');

  return (
    <div>
      {single && (
        <div style={{ padding: '14px 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            background: T.accentSoft, color: T.accentInk, fontSize: 10, fontWeight: 700,
            padding: '3px 9px', borderRadius: 4, letterSpacing: '0.6px',
          }}>{WINDOW_DEFAULTS[w0.windowType].label.toUpperCase()}</span>
          <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: 'ui-monospace, monospace' }}>
            {w0.id.split('_')[0]}
          </span>
        </div>
      )}

      {typeShared && (
        <div style={ROW}>
          <span style={LABEL}>Type</span>
          <select
            value={w0.windowType}
            onChange={e => onUpdate({ windowType: e.target.value as WindowType })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            {WINDOW_TYPES.map(t => (
              <option key={t} value={t}>{WINDOW_DEFAULTS[t].label}</option>
            ))}
          </select>
        </div>
      )}

      <WindowSizeControls
        width={widthShared ? w0.width : 0}
        height={heightShared ? w0.height : 0}
        headHeight={headShared ? w0.headHeight : 0}
        onChange={onUpdate}
      />

      {typeShared && (
        <WindowTypeVariantControls
          windowType={w0.windowType}
          settings={{
            width: w0.width, height: w0.height, headHeight: w0.headHeight,
            panels: w0.panels, bayProjection: w0.bayProjection,
          }}
          onChange={onUpdate}
        />
      )}

      {/* Casement and awning have a swing/projection side. */}
      {typeShared && (w0.windowType === 'casement' || w0.windowType === 'awning' || w0.windowType === 'bay') && (
        <>
          <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
          <div style={{ padding: '4px 16px 4px', fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: '0.5px' }}>
            ORIENTATION
          </div>
          <div style={{ padding: '4px 14px 10px', display: 'flex', gap: 6 }}>
            {w0.windowType === 'casement' && (
              <button
                onClick={() => onUpdate({ hingeSide: w0.hingeSide === 'start' ? 'end' : 'start' })}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6,
                  background: T.panel, border: `1px solid ${T.line}`,
                  color: T.ink, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                }}
              >
                ↔ Flip hinge
                {hingeShared && (
                  <span style={{ display: 'block', fontSize: 10, color: T.inkMuted, fontWeight: 500 }}>
                    hinge on {w0.hingeSide === 'start' ? 'left' : 'right'}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => onUpdate({ flipped: !w0.flipped })}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 6,
                background: T.panel, border: `1px solid ${T.line}`,
                color: T.ink, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              ⇅ Flip side
              {flippedShared && (
                <span style={{ display: 'block', fontSize: 10, color: T.inkMuted, fontWeight: 500 }}>
                  {w0.windowType === 'bay'
                    ? (w0.flipped ? 'projects inward' : 'projects outward')
                    : (w0.flipped ? 'opens inward' : 'opens outward')}
                </span>
              )}
            </button>
          </div>
        </>
      )}

      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />

      <div style={{ padding: '8px 16px 16px' }}>
        <button
          onClick={onDelete}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 6,
            background: T.panel, color: T.danger,
            border: `1px solid ${T.line}`, cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#fff5f5';
            e.currentTarget.style.borderColor = 'rgba(229,62,62,0.35)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = T.panel;
            e.currentTarget.style.borderColor = T.line;
          }}
        >
          {single ? 'Delete window' : `Delete ${windows.length} windows`}
        </button>
      </div>
    </div>
  );
}

function OffsetDistanceControl({
  value, onChange,
}: { value: number; onChange: (inches: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayed = draft ?? formatImperial(value);

  const commit = () => {
    if (draft == null) return;
    const parsed = parseLengthInput(draft);
    if (parsed != null) onChange(parsed);
    setDraft(null);
  };

  return (
    <>
      <div style={{ ...ROW, paddingTop: 12 }}>
        <span style={LABEL}>Distance</span>
        <input
          type="text"
          value={displayed}
          placeholder='e.g. 12, 1&apos;6", 24'
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onFocus={inputFocus}
          style={{ ...INPUT, width: 96, textAlign: 'right' }}
        />
      </div>
      <div style={{
        padding: '4px 16px 14px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5,
      }}>
        Type a number for inches, or use <code style={{ fontFamily: 'ui-monospace, monospace' }}>12&apos;6&quot;</code> for feet+inches.
        You can also type a distance directly on the canvas after picking a wall.
      </div>
    </>
  );
}

// ─── Driving dimension editor ────────────────────────────────────────────────
// Shown when a dimension and exactly one drivable element are co-selected.
// Typing a distance + Enter moves the element so the dimension reads that value.

function DrivingDimensionEditor({ dim, activeLevel, elementLabel, onDrive }: {
  dim: Dimension; activeLevel: Level; elementLabel: string;
  onDrive: (inches: number) => void;
}) {
  const a = resolveDimAnchor(dim.start, activeLevel);
  const b = resolveDimAnchor(dim.end, activeLevel);
  const len = (a && b) ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const apply = (raw: string) => { const v = parseLengthInput(raw); if (v != null) onDrive(v); };
  return (
    <div>
      <div style={{ padding: '10px 16px 8px', fontSize: 12, color: T.inkMuted, lineHeight: 1.5 }}>
        Type a distance and press Enter to move the selected <strong style={{ color: T.ink }}>{elementLabel}</strong> so
        this dimension matches.
      </div>
      <div style={ROW}>
        <span style={LABEL}>Distance</span>
        <input
          // Re-seed (remount) whenever the measured length changes — e.g. after a
          // drive or undo — but stay put while the user is typing.
          key={Math.round(len * 100)}
          defaultValue={formatImperial(len)}
          autoFocus
          onFocus={e => { inputFocus(e); e.currentTarget.select(); }}
          onBlur={inputBlur}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); apply(e.currentTarget.value); } }}
          style={INPUT}
        />
      </div>
      <div style={{ padding: '4px 16px 14px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
        e.g. <code style={{ fontFamily: 'ui-monospace, monospace' }}>4&apos;</code>,{' '}
        <code style={{ fontFamily: 'ui-monospace, monospace' }}>4&apos; 6&quot;</code>, or{' '}
        <code style={{ fontFamily: 'ui-monospace, monospace' }}>54</code> (inches).
        The dimension&apos;s other end stays fixed.
      </div>
    </div>
  );
}

// ─── Dimension editor ────────────────────────────────────────────────────────

function DimensionEditor({ dims, activeLevel, onUpdate, onDelete }: {
  dims: Dimension[]; activeLevel: Level;
  onUpdate: (p: Partial<Dimension>) => void; onDelete: () => void;
}) {
  const d = dims[0];
  // Resolved length: depends on the anchored objects' current positions.
  const a = resolveDimAnchor(d.start, activeLevel);
  const b = resolveDimAnchor(d.end, activeLevel);
  const len = (a && b) ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const single = dims.length === 1;
  return (
    <div>
      {single && (
        <>
          <div style={ROW}>
            <span style={LABEL}>Measured</span>
            <span style={VALUE}>{formatImperial(len)}</span>
          </div>
          <div style={{ height: 1, background: T.line, margin: '8px 0' }} />
        </>
      )}
      <div style={ROW}>
        <span style={LABEL}>Offset</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1}
            value={d.offset}
            onChange={e => { const v = Number(e.target.value); if (!isNaN(v)) onUpdate({ offset: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
        Negative offset flips the dim line to the other side of the measured segment.
      </div>
      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />
      <div style={{ padding: '8px 16px 16px' }}>
        <DeleteButton label={single ? 'Delete dimension' : `Delete ${dims.length} dimensions`} onClick={onDelete} />
      </div>
    </div>
  );
}

// ─── Room label editor ──────────────────────────────────────────────────────

// Canonical-name dropdown with "Other…" fallback to free text. Keeps the
// rooms list clean for teacher assignment verification while still allowing
// custom names when needed.
function RoomTypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const upper = (value || '').toUpperCase();
  const isCanonical = (ROOM_TYPES as readonly string[]).includes(upper);
  // "Other…" mode shows the free-text input. Triggered either by the user
  // explicitly picking "Other…" OR by an existing value that doesn't match
  // any canonical type (e.g. loaded from a save with a custom name).
  const [otherMode, setOtherMode] = useState(!isCanonical && value.length > 0);
  return (
    <div>
      <div style={ROW}>
        <span style={LABEL}>Name</span>
        <select
          value={otherMode ? '__other__' : (isCanonical ? upper : ROOM_TYPES[0])}
          onChange={e => {
            const v = e.target.value;
            if (v === '__other__') {
              setOtherMode(true);
              // Don't overwrite the current name — keep what's there so the
              // user can edit it. If it was canonical, leave it as-is until
              // they type something new.
            } else {
              setOtherMode(false);
              onChange(v);
            }
          }}
          onFocus={inputFocus} onBlur={inputBlur}
          style={{ ...SELECT, width: 150 }}
        >
          {ROOM_TYPES.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
          <option value="__other__">Other…</option>
        </select>
      </div>
      {otherMode && (
        <div style={ROW}>
          <span style={LABEL}>Custom</span>
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={inputFocus} onBlur={inputBlur}
            placeholder="Type a name"
            style={{ ...INPUT, width: 150, textAlign: 'left' }}
            autoFocus
          />
        </div>
      )}
    </div>
  );
}

function RoomLabelEditor({
  labels, onUpdate, onDelete,
  boundaryDraftRoomId, onStartBoundaryDraft, onCancelBoundaryDraft, onClearBoundary, onAutoBoundary,
}: {
  labels: RoomLabel[];
  onUpdate: (p: Partial<RoomLabel>) => void;
  onDelete: () => void;
  boundaryDraftRoomId: string | null;
  onStartBoundaryDraft: (roomId: string) => void;
  onCancelBoundaryDraft: () => void;
  onClearBoundary: (roomId: string) => void;
  onAutoBoundary: (roomId: string) => boolean;
}) {
  const r = labels[0];
  const single = labels.length === 1;
  const hasBoundary = !!(r.boundary && r.boundary.length >= 3);
  const drafting = single && boundaryDraftRoomId === r.id;
  const needsSqft = single && r.squareFeet == null && !hasBoundary;
  // Holds the room id Auto-detect last failed on, so we can nudge the user to
  // draw the boundary by hand. Keyed by id so it resets when a different room
  // is selected.
  const [autoFailedFor, setAutoFailedFor] = useState<string | null>(null);
  const autoFailed = single && autoFailedFor === r.id && !hasBoundary;
  return (
    <div>
      {single && (
        <RoomTypePicker value={r.name} onChange={name => onUpdate({ name })} />
      )}
      <div style={ROW}>
        <span style={LABEL}>Sq. footage</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={0}
            placeholder={hasBoundary ? 'from boundary' : 'auto'}
            value={r.squareFeet ?? ''}
            onChange={e => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              if (v === undefined || v >= 0) onUpdate({ squareFeet: v });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>sf</span>
        </span>
      </div>
      {single && (
        <>
          {needsSqft && !drafting && (
            <div style={{
              margin: '0 16px 10px', padding: '8px 10px',
              background: 'rgba(212,160,23,0.10)', border: '1px solid rgba(212,160,23,0.35)',
              borderRadius: 6, fontSize: 11, color: '#7a5a00', lineHeight: 1.5,
            }}>
              <strong>No square footage yet.</strong> Type a number above, or draw a boundary so it&apos;s calculated for you.
            </div>
          )}
          {autoFailed && (
            <div style={{
              margin: '0 16px 8px', padding: '8px 10px',
              background: 'rgba(212,160,23,0.10)', border: '1px solid rgba(212,160,23,0.35)',
              borderRadius: 6, fontSize: 11, color: '#7a5a00', lineHeight: 1.5,
            }}>
              <strong>Couldn&apos;t auto-detect.</strong> This room isn&apos;t fully enclosed by 4 walls — draw the boundary by hand instead.
            </div>
          )}
          <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {drafting ? (
              <button
                onClick={onCancelBoundaryDraft}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                  background: '#fff', color: T.warm,
                  border: `1px solid ${T.warm}`, borderRadius: 5, cursor: 'pointer',
                }}
              >Cancel drawing</button>
            ) : (
              <>
                <button
                  onClick={() => setAutoFailedFor(onAutoBoundary(r.id) ? null : r.id)}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                    background: hasBoundary ? '#fff' : T.accent,
                    color: hasBoundary ? T.accentInk : '#fff',
                    border: `1px solid ${hasBoundary ? T.line : T.accent}`,
                    borderRadius: 5, cursor: 'pointer',
                  }}
                  title="Measure to the 4 enclosing walls automatically"
                >⚡ Auto</button>
                <button
                  onClick={() => onStartBoundaryDraft(r.id)}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                    background: '#fff', color: T.accentInk,
                    border: `1px solid ${T.line}`,
                    borderRadius: 5, cursor: 'pointer',
                  }}
                >{hasBoundary ? 'Redraw' : 'Draw'}</button>
              </>
            )}
            {hasBoundary && !drafting && (
              <button
                onClick={() => onClearBoundary(r.id)}
                style={{
                  padding: '6px 10px', fontSize: 11, fontWeight: 600,
                  background: '#fff', color: T.inkSoft,
                  border: `1px solid ${T.line}`, borderRadius: 5, cursor: 'pointer',
                }}
                title="Remove boundary polygon (keeps sqft value)"
              >Clear</button>
            )}
          </div>
        </>
      )}
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
        {drafting
          ? 'Click each corner of the room on the canvas. Click the first vertex again to close.'
          : hasBoundary
            ? 'Sqft is calculated from the boundary. Re-run Auto or redraw if walls move.'
            : '⚡ Auto measures to the 4 enclosing walls. Or type a number / draw the boundary by hand.'}
      </div>
      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />
      <div style={{ padding: '8px 16px 16px' }}>
        <DeleteButton label={single ? 'Delete label' : `Delete ${labels.length} labels`} onClick={onDelete} />
      </div>
    </div>
  );
}

function TextLabelEditor({ texts, onUpdate, onDelete }: {
  texts: TextLabel[]; onUpdate: (p: Partial<TextLabel>) => void; onDelete: () => void;
}) {
  const t = texts[0];
  const single = texts.length === 1;
  return (
    <div>
      {single && (
        <div style={ROW}>
          <span style={LABEL}>Text</span>
          <input
            type="text"
            value={t.text}
            onChange={e => onUpdate({ text: e.target.value })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={{ ...INPUT, width: 150, textAlign: 'left' }}
          />
        </div>
      )}
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
        Free-form annotation. Renders exactly as typed.
      </div>
      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />
      <div style={{ padding: '8px 16px 16px' }}>
        <DeleteButton label={single ? 'Delete text' : `Delete ${texts.length} texts`} onClick={onDelete} />
      </div>
    </div>
  );
}

// ─── Stair editor ───────────────────────────────────────────────────────────

function StairControls({
  width, length, direction, shape, onChange,
}: {
  width: number; length: number; direction: 'up' | 'down'; shape: StairShape;
  onChange: (p: { width?: number; length?: number; direction?: 'up' | 'down'; shape?: StairShape }) => void;
}) {
  const lengthLabel = shape === 'straight' ? 'Length' : 'Run length';
  return (
    <>
      <div style={ROW}>
        <span style={LABEL}>Shape</span>
        <select
          value={shape}
          onChange={e => {
            const next = e.target.value as StairShape;
            // Suggest a shorter run length when switching off straight, since
            // straight defaults to 120" which is too long for each leg of an L or U.
            const patch: { shape: StairShape; length?: number } = { shape: next };
            if (next !== 'straight' && length > 84) patch.length = 60;
            if (next === 'straight' && length < 96) patch.length = 120;
            onChange(patch);
          }}
          onFocus={inputFocus} onBlur={inputBlur}
          style={SELECT}
        >
          <option value="straight">Straight</option>
          <option value="L-left">Turn left (L)</option>
          <option value="L-right">Turn right (L)</option>
          <option value="U">U-turn</option>
        </select>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Width</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={24} max={120}
            value={width}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ width: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>{lengthLabel}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={36} max={300}
            value={length}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ length: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Direction</span>
        <select
          value={direction}
          onChange={e => onChange({ direction: e.target.value as 'up' | 'down' })}
          onFocus={inputFocus} onBlur={inputBlur}
          style={SELECT}
        >
          <option value="up">Up</option>
          <option value="down">Down</option>
        </select>
      </div>
    </>
  );
}

function StairEditor({ stairs, onUpdate, onDelete }: {
  stairs: Stair[]; onUpdate: (p: Partial<Stair>) => void; onDelete: () => void;
}) {
  const s = stairs[0];
  const single = stairs.length === 1;
  const rotDeg = (s.rotation * 180) / Math.PI;
  return (
    <div>
      <StairControls
        width={s.width} length={s.length} direction={s.direction}
        shape={s.shape ?? 'straight'}
        onChange={onUpdate}
      />
      <div style={ROW}>
        <span style={LABEL}>Rotation</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={15}
            value={Math.round(rotDeg)}
            onChange={e => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onUpdate({ rotation: (v * Math.PI) / 180 });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>°</span>
        </span>
      </div>
      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />
      <div style={{ padding: '8px 16px 16px' }}>
        <DeleteButton label={single ? 'Delete stair' : `Delete ${stairs.length} stairs`} onClick={onDelete} />
      </div>
    </div>
  );
}

// ─── Furniture: kind picker + size + editor ─────────────────────────────────

const ALL_FURNITURE_KINDS: FurnitureKind[] = Object.keys(FURNITURE_CATALOG) as FurnitureKind[];

// Kinds that carry a cabinet face (use cabinetColor) and/or a countertop slab.
const KITCHEN_CABINET_KINDS    = new Set<FurnitureKind>([
  'cabinet-base', 'cabinet-upper', 'sink-kitchen', 'island',
]);
const KITCHEN_COUNTERTOP_KINDS = new Set<FurnitureKind>([
  'cabinet-base', 'sink-kitchen', 'island',
]);

// Preset colors for cabinets and countertops. Free hex still accepted via
// the rightmost native color picker in `ColorSwatchRow`.
const CABINET_PRESETS = [
  { color: '#f5f0e6', label: 'White' },
  { color: '#e8e2d4', label: 'Off-white' },
  { color: '#c8ccd2', label: 'Light gray' },
  { color: '#4a4d54', label: 'Charcoal' },
  { color: '#b08a5d', label: 'Oak' },
  { color: '#6a4530', label: 'Walnut' },
  { color: '#2c3a52', label: 'Navy' },
  { color: '#8a9879', label: 'Sage' },
];
const COUNTERTOP_PRESETS = [
  { color: '#ece8df', label: 'Quartz white' },
  { color: '#cfd5da', label: 'Light marble' },
  { color: '#6e7176', label: 'Granite gray' },
  { color: '#2a2c30', label: 'Black granite' },
  { color: '#b08555', label: 'Butcher block' },
  { color: '#b8a888', label: 'Beige granite' },
];

function ColorSwatchRow({ label, value, presets, onChange }: {
  label: string;
  value: string;
  presets: { color: string; label: string }[];
  onChange: (color: string) => void;
}) {
  return (
    <div style={{ ...ROW, alignItems: 'flex-start' }}>
      <span style={LABEL}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        {presets.map(p => {
          const active = p.color.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={p.color}
              title={p.label}
              onClick={() => onChange(p.color)}
              style={{
                width: 20, height: 20, padding: 0,
                background: p.color,
                border: active ? `2px solid ${T.accent}` : `1px solid ${T.line}`,
                borderRadius: 4, cursor: 'pointer',
              }}
            />
          );
        })}
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          title="Custom color"
          style={{ width: 22, height: 22, padding: 0, border: `1px solid ${T.line}`, borderRadius: 4, cursor: 'pointer' }}
        />
      </div>
    </div>
  );
}

// Two-step picker: pick a room, then pick a piece from that room.
// The active room is derived from the active kind so the picker always
// shows the room the user is currently working in.
function FurnitureKindPicker({
  active, onChange,
}: { active: FurnitureKind; onChange: (k: FurnitureKind) => void }) {
  const activeRoom: FurnitureRoom = FURNITURE_CATALOG[active].room;
  // Click a room button to switch the room view AND pick the first piece
  // in that room (so something is always active and ready to place).
  const onRoomClick = (room: FurnitureRoom) => {
    if (room === activeRoom) return;
    const first = ALL_FURNITURE_KINDS.find(k => FURNITURE_CATALOG[k].room === room);
    if (first) onChange(first);
  };
  const piecesInRoom = ALL_FURNITURE_KINDS.filter(k => FURNITURE_CATALOG[k].room === activeRoom);
  return (
    <>
      {/* Step 1 — room tabs */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 4, padding: '8px 12px 4px',
      }}>
        {FURNITURE_ROOMS.map(r => {
          const isActive = r.id === activeRoom;
          return (
            <button
              key={r.id}
              onClick={() => onRoomClick(r.id)}
              style={{
                padding: '6px 4px',
                background: isActive ? T.accentSoft : T.panel,
                border: `1px solid ${isActive ? 'rgba(79,124,255,0.4)' : T.line}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                color: isActive ? T.accentInk : T.inkSoft,
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.bg; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = T.panel; }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      {/* Step 2 — pieces grid for the active room */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: 6, padding: '4px 12px 8px',
      }}>
        {piecesInRoom.map(k => {
          const isActive = active === k;
          const entry = FURNITURE_CATALOG[k];
          return (
            <button
              key={k}
              onClick={() => onChange(k)}
              style={{
                padding: '8px 6px',
                background: isActive ? T.accentSoft : T.panel,
                border: `1px solid ${isActive ? 'rgba(79,124,255,0.4)' : T.line}`,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                color: isActive ? T.accentInk : T.ink,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                transition: 'all 120ms',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.bg; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = T.panel; }}
            >
              <span style={{ fontSize: 11 }}>{entry.label}</span>
              <span style={{ fontSize: 9, color: T.inkMuted, fontFamily: 'ui-monospace, monospace' }}>
                {entry.width}×{entry.depth}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function FurnitureSizeControls({
  width, depth, onChange,
}: {
  width: number; depth: number;
  onChange: (p: { width?: number; depth?: number }) => void;
}) {
  return (
    <>
      <div style={ROW}>
        <span style={LABEL}>Width</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={6} max={240}
            value={width}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ width: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Depth</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={1} min={6} max={240}
            value={depth}
            onChange={e => { const v = Number(e.target.value); if (v > 0) onChange({ depth: v }); }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>in</span>
        </span>
      </div>
    </>
  );
}

function FurnitureEditor({ items, onUpdate, onDelete }: {
  items: FurnitureItem[]; onUpdate: (p: Partial<FurnitureItem>) => void; onDelete: () => void;
}) {
  const f = items[0];
  const single = items.length === 1;
  const rotDeg = (f.rotation * 180) / Math.PI;
  const typeShared = items.every(i => i.kind === f.kind);
  const usesCabinetColor    = typeShared && KITCHEN_CABINET_KINDS.has(f.kind);
  const usesCountertopColor = typeShared && KITCHEN_COUNTERTOP_KINDS.has(f.kind);
  const isStove  = typeShared && f.kind === 'stove-range';
  const isFridge = typeShared && f.kind === 'fridge';
  return (
    <div>
      {typeShared && (
        <div style={ROW}>
          <span style={LABEL}>Kind</span>
          <select
            value={f.kind}
            onChange={e => onUpdate({ kind: e.target.value as FurnitureKind })}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            {FURNITURE_ROOMS.map(r => (
              <optgroup key={r.id} label={r.label}>
                {ALL_FURNITURE_KINDS
                  .filter(k => FURNITURE_CATALOG[k].room === r.id)
                  .map(k => (
                    <option key={k} value={k}>{FURNITURE_CATALOG[k].label}</option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}
      {isStove && (
        <div style={ROW}>
          <span style={LABEL}>Size</span>
          <select
            value={(f.sizeVariant as StoveSize) ?? '30'}
            onChange={e => {
              const v = e.target.value as StoveSize;
              onUpdate({ sizeVariant: v, width: STOVE_WIDTHS[v] });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="30">30&quot; (4 burners)</option>
            <option value="36">36&quot; (5 burners)</option>
            <option value="48">48&quot; (6 burners)</option>
          </select>
        </div>
      )}
      {isFridge && (
        <div style={ROW}>
          <span style={LABEL}>Size</span>
          <select
            value={(f.sizeVariant as FridgeSize) ?? '36'}
            onChange={e => {
              const v = e.target.value as FridgeSize;
              onUpdate({ sizeVariant: v, width: FRIDGE_WIDTHS[v] });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={SELECT}
          >
            <option value="30">30&quot; (single door)</option>
            <option value="36">36&quot; (French door)</option>
          </select>
        </div>
      )}
      {usesCabinetColor && (
        <ColorSwatchRow
          label="Cabinet"
          value={f.cabinetColor ?? CABINET_COLOR_DEFAULT}
          presets={CABINET_PRESETS}
          onChange={c => onUpdate({ cabinetColor: c })}
        />
      )}
      {usesCountertopColor && (
        <ColorSwatchRow
          label="Counter"
          value={f.countertopColor ?? COUNTERTOP_COLOR_DEFAULT}
          presets={COUNTERTOP_PRESETS}
          onChange={c => onUpdate({ countertopColor: c })}
        />
      )}
      <FurnitureSizeControls
        width={f.width} depth={f.depth}
        onChange={onUpdate}
      />
      <div style={ROW}>
        <span style={LABEL}>Rotation</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="number" step={15}
            value={Math.round(rotDeg)}
            onChange={e => {
              const v = Number(e.target.value);
              if (!isNaN(v)) onUpdate({ rotation: (v * Math.PI) / 180 });
            }}
            onFocus={inputFocus} onBlur={inputBlur}
            style={INPUT}
          />
          <span style={{ color: T.inkMuted, fontSize: 12 }}>°</span>
        </span>
      </div>
      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />
      <div style={{ padding: '8px 16px 16px' }}>
        <DeleteButton label={single ? 'Delete item' : `Delete ${items.length} items`} onClick={onDelete} />
      </div>
    </div>
  );
}

// Shared delete button.
function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '8px 12px', borderRadius: 6,
        background: T.panel, color: T.danger,
        border: `1px solid ${T.line}`, cursor: 'pointer',
        fontSize: 13, fontWeight: 600, transition: 'all 120ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#fff5f5';
        e.currentTarget.style.borderColor = 'rgba(229,62,62,0.35)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = T.panel;
        e.currentTarget.style.borderColor = T.line;
      }}
    >
      {label}
    </button>
  );
}

// ─── Line tool: style + weight + color pickers ────────────────────────────────
function LineStyleControls({ style, weight, color, onChange }: {
  style: LineStyle; weight: LineWeight; color: LineColor;
  onChange: (patch: { style?: LineStyle; weight?: LineWeight; color?: LineColor }) => void;
}) {
  const colorOptions: LineColor[] = ['black', 'gray', 'red', 'blue', 'yellow'];
  return (
    <>
      <div style={{ height: 1, background: T.line, margin: '6px 0' }} />
      <div style={ROW}>
        <span style={LABEL}>Style</span>
        <select
          value={style}
          onChange={e => onChange({ style: e.target.value as LineStyle })}
          onFocus={inputFocus} onBlur={inputBlur}
          style={SELECT}
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
          <option value="dash-dot">Dash-dot</option>
        </select>
      </div>
      <div style={ROW}>
        <span style={LABEL}>Weight</span>
        <select
          value={weight}
          onChange={e => onChange({ weight: e.target.value as LineWeight })}
          onFocus={inputFocus} onBlur={inputBlur}
          style={SELECT}
        >
          <option value="thin">Thin</option>
          <option value="medium">Medium</option>
          <option value="thick">Thick</option>
        </select>
      </div>
      <div style={{ ...ROW, alignItems: 'flex-start' }}>
        <span style={LABEL}>Color</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {colorOptions.map(c => {
            const active = c === color;
            return (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                title={c.charAt(0).toUpperCase() + c.slice(1)}
                style={{
                  width: 22, height: 22, borderRadius: 4, padding: 0,
                  background: LINE_COLOR_HEX[c],
                  border: active ? `2px solid ${T.ink}` : `1px solid ${T.line}`,
                  cursor: 'pointer',
                  outline: 'none',
                  boxShadow: active ? `0 0 0 2px ${T.accentSoft}` : 'none',
                }}
              />
            );
          })}
        </div>
      </div>
      <div style={{ padding: '0 16px 10px', fontSize: 11, color: T.inkMuted, lineHeight: 1.5 }}>
        Common conventions: solid for visible edges, dashed for headers/beams
        above, dotted for centerlines.
      </div>
    </>
  );
}

function LineEditor({ lines, onUpdate, onDelete }: {
  lines: LineEntity[];
  onUpdate: (p: Partial<LineEntity>) => void;
  onDelete: () => void;
}) {
  const l0 = lines[0];
  const allSameStyle  = lines.every(l => l.style  === l0.style);
  const allSameWeight = lines.every(l => l.weight === l0.weight);
  const allSameColor  = lines.every(l => (l.color ?? 'black') === (l0.color ?? 'black'));
  const length = lines.length === 1
    ? Math.hypot(l0.end.x - l0.start.x, l0.end.y - l0.start.y)
    : null;
  return (
    <>
      {length != null && (
        <div style={ROW}>
          <span style={LABEL}>Length</span>
          <span style={VALUE}>{formatImperial(length)}</span>
        </div>
      )}
      <LineStyleControls
        style={allSameStyle ? l0.style : 'solid'}
        weight={allSameWeight ? l0.weight : 'medium'}
        color={allSameColor ? (l0.color ?? 'black') : 'black'}
        onChange={onUpdate}
      />
      <div style={{ height: 1, background: T.line, margin: '0 0 4px' }} />
      <div style={{ padding: '8px 16px 16px' }}>
        <DeleteButton label={lines.length === 1 ? 'Delete line' : `Delete ${lines.length} lines`} onClick={onDelete} />
      </div>
    </>
  );
}
