// Blueprint Lab data model.
// All linear measurements are stored in INCHES (imperial source of truth).
// Display layers convert to feet'inches".

export type Vec2 = { x: number; y: number };

export type ToolId =
  | 'select'
  | 'wall'
  | 'offset'
  | 'move'
  | 'door'
  | 'window'
  | 'room-label'
  | 'text'
  | 'dimension'
  | 'stair'
  | 'furniture'
  | 'line'
  | 'trim'
  | 'extend'
  | 'section'
  | 'hatch'
  | 'mirror'
  | 'erase';

// A wall is either a structural 'wall' or a non-structural 'partition'.
// "Exterior" is NOT a stored type — it's derived from geometry: any wall on the
// building perimeter is exterior automatically (see deriveExteriorWallIds in
// engine/roof.ts). Legacy 'exterior'/'interior' values migrate to 'wall'.
export type WallType = 'wall' | 'partition';

// Renovation status, orthogonal to WallType. Drives visual hatch:
//   existing → gray hatch, solid outline (already there)
//   proposed → blue hatch, solid outline (default for new walls)
//   demo     → red hatch, DASHED outline (to be removed)
export type WallStatus = 'existing' | 'proposed' | 'demo';

export interface Wall {
  id: string;
  levelId: string;
  start: Vec2;
  end: Vec2;
  thickness: number;   // inches — default 4
  height: number;      // inches — default 96 (8')
  type: WallType;      // 'wall' | 'partition'; exterior is derived from geometry
  status?: WallStatus; // optional; treated as 'proposed' when missing
}

// Openings live on a wall in v2; for v1 they're free-floating 2D symbols
// keyed to a level so future binding to a Wall.id is a drop-in change.
export interface Opening {
  id: string;
  levelId: string;
  wallId?: string;     // future: anchor to a wall
  position: Vec2;      // current placement (world coords, inches)
  rotation: number;    // radians
  width: number;       // inches
}

// ─── Doors ────────────────────────────────────────────────────────────────────
// Doors are anchored to a wall via wallId + positionAlong (inches from wall.start
// along the wall's centerline). Position/rotation in world coords are derived
// from the wall, so the door follows the wall if the wall moves. The wall data
// is preserved fully even when a door visually cuts it — needed for 3D extrude.

export type DoorType = 'room' | 'entry' | 'sliding' | 'bifold' | 'pocket' | 'barn';

export interface Door {
  kind: 'door';
  id: string;
  levelId: string;
  wallId: string;
  positionAlong: number;     // inches from wall.start along centerline
  width: number;             // along wall, inches (door panel only — excludes side panels)
  height: number;            // up the wall (for 3D), inches
  doorType: DoorType;
  hingeSide: 'start' | 'end';// which end of the opening is the hinge (swing doors)
  flipped: boolean;          // which side of the wall the door opens toward
  openAngle: number;         // visual open angle in degrees (0=closed, 90=fully open)

  // Variant fields — meaning depends on doorType.
  // 'panels' applies to barn: how many independently moving panels.
  // (Bifold's single/double is derived from width — see renderer.)
  panels?: 'single' | 'double';
  // Entry doors: optional sidelites flanking the door.
  sidePanels?: 'none' | 'left' | 'right' | 'both';
  sidePanelWidth?: number;   // each sidelite's width, inches (default 14)
  // Sliding doors: interior pocket-style vs exterior patio door (heavier frame).
  slideStyle?: 'interior' | 'exterior';
}

export const DEFAULT_SIDE_PANEL_WIDTH = 14;

// Per-door-type placement defaults. Only the fields relevant to that type
// are populated; e.g. `slideStyle` lives under `sliding`, `sidePanels` under
// `entry`. Used both for the placement preview and the props panel.
export interface DoorTypeSettings {
  width: number;
  height: number;
  panels?: 'single' | 'double';
  sidePanels?: 'none' | 'left' | 'right' | 'both';
  sidePanelWidth?: number;
  slideStyle?: 'interior' | 'exterior';
}

export interface DoorTypeDefaults {
  width: number;
  height: number;
  label: string;
}

export const DOOR_DEFAULTS: Record<DoorType, DoorTypeDefaults> = {
  room:    { width: 30, height: 80, label: 'Room door' },
  entry:   { width: 36, height: 80, label: 'Entry door' },
  sliding: { width: 60, height: 80, label: 'Sliding door' },
  bifold:  { width: 48, height: 80, label: 'Bifold door' },
  pocket:  { width: 30, height: 80, label: 'Pocket door' },
  barn:    { width: 36, height: 84, label: 'Barn door' },
};

// ─── Windows ──────────────────────────────────────────────────────────────────
// Windows are anchored to a wall just like doors and cut the wall visually
// in 2D plan; the wall data is preserved for 3D extrude.

export type WindowType = 'double-hung' | 'casement' | 'awning' | 'sliding' | 'fixed' | 'bay';

export interface Window {
  kind: 'window';
  id: string;
  levelId: string;
  wallId: string;
  positionAlong: number;     // inches from wall.start along centerline
  width: number;             // along wall, inches
  height: number;            // up the wall, inches
  // We store HEAD height (top of window) rather than sill, because in real
  // buildings window tops are typically aligned (matching door head height)
  // while sills float to whatever the window height requires.
  // Sill height is derived: sill = headHeight - height.
  headHeight: number;        // inches from floor to top of window
  windowType: WindowType;
  // Variant fields per type:
  hingeSide?: 'start' | 'end';  // casement
  flipped?: boolean;             // casement (swing side), awning (projection side)
  panels?: 'single' | 'double';  // casement (single vs double casement pair)
  bayProjection?: number;        // bay window: how far it projects from the wall, inches
}

export interface WindowTypeDefaults {
  width: number;
  height: number;
  headHeight: number;
  label: string;
}

// All window types default to the same HEAD height (80" — matches a typical
// interior door head). Sill height varies per type as a derived value
// (sill = headHeight - height).
export const WINDOW_DEFAULTS: Record<WindowType, WindowTypeDefaults> = {
  'double-hung': { width: 36, height: 60, headHeight: 80, label: 'Double-hung' },
  'casement':    { width: 30, height: 48, headHeight: 80, label: 'Casement' },
  'awning':      { width: 36, height: 24, headHeight: 80, label: 'Awning' },
  'sliding':     { width: 60, height: 36, headHeight: 80, label: 'Sliding' },
  'fixed':       { width: 60, height: 48, headHeight: 80, label: 'Fixed' },
  'bay':         { width: 96, height: 60, headHeight: 80, label: 'Bay' },
};

export const DEFAULT_BAY_PROJECTION = 18; // inches outward from wall

export interface WindowTypeSettings {
  width: number;
  height: number;
  headHeight: number;
  panels?: 'single' | 'double';
  bayProjection?: number;
}

export interface RoomLabel {
  id: string;
  levelId: string;
  position: Vec2;
  name: string;
  squareFeet?: number;
  // User-drawn closed polygon (world inches) that defines this room's footprint
  // when walls don't fully enclose it (open plan / partial walls). When present,
  // squareFeet is the shoelace area of this polygon converted to sqft. Cleared
  // when the user deletes the boundary via the panel.
  boundary?: Vec2[];
}

// Canonical residential room types — surfaced as a dropdown in the Room
// editor so students can't introduce spelling/case drift ("Bed Rm",
// "bedroom", "BedRoom" all collapse to BEDROOM). The UI exposes an
// "Other…" escape hatch that switches to a free-text input, so custom
// names are still possible when needed.
export const ROOM_TYPES: readonly string[] = [
  // Sleeping
  'BEDROOM', 'MASTER BEDROOM', 'GUEST BEDROOM', 'NURSERY',
  // Bath
  'BATHROOM', 'HALF BATH', 'MASTER BATH', 'POWDER ROOM',
  // Living
  'LIVING ROOM', 'FAMILY ROOM', 'GREAT ROOM', 'DEN',
  // Eating / cooking
  'KITCHEN', 'DINING ROOM', 'BREAKFAST NOOK', 'PANTRY',
  // Circulation
  'FOYER', 'ENTRY', 'HALLWAY', 'STAIRS', 'LANDING',
  // Utility
  'LAUNDRY', 'MUDROOM', 'UTILITY', 'MECHANICAL',
  // Storage / work
  'CLOSET', 'WALK-IN CLOSET', 'STORAGE', 'OFFICE', 'STUDY', 'LIBRARY',
  // Special-use
  'GARAGE', 'BASEMENT', 'ATTIC', 'BONUS ROOM',
  // Outdoor
  'DECK', 'PATIO', 'PORCH', 'BALCONY',
] as const;

// Free-form text annotation — distinct from RoomLabel because text is for
// arbitrary callouts/notes and shouldn't feed into the rooms list that a
// future "Rooms" tab will compile from RoomLabels (room name + sqft).
export interface TextLabel {
  id: string;
  levelId: string;
  position: Vec2;
  text: string;
}

// A dimension endpoint anchors to a specific snap point on another object so
// the dimension follows when that object is moved/stretched. `kind: 'free'`
// is a raw world point (used when the user clicks empty space).
export type DimAnchor =
  | { kind: 'free'; point: Vec2 }
  | { kind: 'wall-corner'; wallId: string; cornerIndex: 0 | 1 | 2 | 3 }
  // The mitered intersection of two walls' face lines (sideA/sideB = +1 for
  // the wall's +n face, -1 for the -n face). This is the "room inside
  // corner" / "room outside corner" point you'd see in a mitered drawing —
  // distinct from each wall's individual polygon corner.
  | { kind: 'wall-junction'; wallAId: string; wallBId: string; sideA: 1 | -1; sideB: 1 | -1 }
  // Where one wall's centerline CROSSES another's (not at an endpoint), the
  // four face lines form a small rectangle. Each corner of that rectangle is
  // a visible architectural feature (e.g. T-junction outline). Distinct from
  // wall-junction (which requires shared endpoints).
  | { kind: 'wall-cross'; wallAId: string; wallBId: string; sideA: 1 | -1; sideB: 1 | -1 }
  // Midpoint of one of a wall's long faces (side = +1 for +n face, -1 for -n
  // face). Lets the dim tool snap to the visible center of a wall edge.
  | { kind: 'wall-edge-mid'; wallId: string; side: 1 | -1 }
  | { kind: 'opening-jamb'; openingKind: 'door' | 'window'; openingId: string; side: 'start' | 'end'; face: 'left' | 'right' }
  // Midpoint of an opening (door/window) along its wall, on one of the two
  // faces. Useful when you want a dim FROM the centerline of a door.
  | { kind: 'opening-mid'; openingKind: 'door' | 'window'; openingId: string; face: 'left' | 'right' }
  | { kind: 'furniture-corner'; furnitureId: string; cornerIndex: 0 | 1 | 2 | 3 }
  // Midpoint of one of a furniture item's 4 edges (0=top, 1=right, 2=bottom, 3=left
  // in the unrotated local frame; rotated to world by the item's rotation).
  | { kind: 'furniture-edge-mid'; furnitureId: string; edgeIndex: 0 | 1 | 2 | 3 }
  | { kind: 'stair-corner'; stairId: string; cornerIndex: 0 | 1 | 2 | 3 };

export interface Dimension {
  id: string;
  levelId: string;
  start: DimAnchor;
  end: DimAnchor;
  offset: number;      // perpendicular offset of the dim line, inches
}

// Plan-view shape of the staircase. `width` is always the tread width;
// `length` is interpreted differently per shape:
//   straight → total run length
//   L-left / L-right → length of EACH run (turn happens via a width×width landing)
//   U → length of EACH run (full U-turn landing spans both runs at one end)
export type StairShape = 'straight' | 'L-left' | 'L-right' | 'U';

export interface Stair {
  id: string;
  levelId: string;
  position: Vec2;
  width: number;       // inches — default 36
  length: number;      // inches — default 120 (straight) / 60-72 (L) / 48-60 (U)
  rotation: number;    // radians
  direction: 'up' | 'down';
  shape?: StairShape;  // defaults to 'straight' for back-compat
  treads?: number;     // visible tread count for the plan symbol; defaults to STAIR_DEFAULTS.treads
}

// Furniture is organized as a catalog by room. Each kind has standard-size
// defaults — bed-queen is 60x80, bed-king is 76x80, etc.
export type FurnitureRoom = 'bedroom' | 'bathroom' | 'kitchen' | 'living' | 'dining' | 'office';

export type FurnitureKind =
  // Bedroom
  | 'bed-twin' | 'bed-full' | 'bed-queen' | 'bed-king' | 'crib'
  | 'nightstand' | 'dresser' | 'wardrobe'
  // Bathroom
  | 'toilet' | 'sink-vanity' | 'sink-pedestal' | 'bathtub' | 'shower-stall'
  // Kitchen
  | 'cabinet-base' | 'cabinet-upper'
  | 'fridge' | 'stove-range' | 'sink-kitchen' | 'dishwasher' | 'island'
  // Living room
  | 'sofa-3' | 'loveseat' | 'armchair' | 'coffee-table' | 'end-table' | 'tv-console' | 'bookshelf'
  // Dining room
  | 'dining-table-4' | 'dining-table-6' | 'dining-table-8' | 'dining-chair' | 'buffet'
  // Office
  | 'desk' | 'office-chair' | 'filing-cabinet';

// Stove + fridge size variants — burner count / door layout adjusts with width.
export type StoveSize  = '30' | '36' | '48';
export type FridgeSize = '30' | '36';
export const STOVE_BURNERS: Record<StoveSize, number> = { '30': 4, '36': 5, '48': 6 };
export const STOVE_WIDTHS:  Record<StoveSize, number> = { '30': 30, '36': 36, '48': 48 };
export const FRIDGE_WIDTHS: Record<FridgeSize, number> = { '30': 30, '36': 36 };

// Default color presets used when an item doesn't specify a custom color.
export const CABINET_COLOR_DEFAULT    = '#e8e2d4'; // warm off-white shaker
export const COUNTERTOP_COLOR_DEFAULT = '#cfd5da'; // light marble / quartz

export interface FurnitureCatalogEntry {
  room: FurnitureRoom;
  label: string;
  width: number;   // along the long axis when rotation = 0, inches
  depth: number;
}

export const FURNITURE_ROOMS: { id: FurnitureRoom; label: string }[] = [
  { id: 'bedroom',  label: 'Bedroom' },
  { id: 'bathroom', label: 'Bath' },
  { id: 'kitchen',  label: 'Kitchen' },
  { id: 'living',   label: 'Living' },
  { id: 'dining',   label: 'Dining' },
  { id: 'office',   label: 'Office' },
];

export const FURNITURE_CATALOG: Record<FurnitureKind, FurnitureCatalogEntry> = {
  // ── Bedroom ────────────────────────────────────────────────
  'bed-twin':      { room: 'bedroom',  label: 'Twin bed',     width: 38, depth: 75 },
  'bed-full':      { room: 'bedroom',  label: 'Full bed',     width: 54, depth: 75 },
  'bed-queen':     { room: 'bedroom',  label: 'Queen bed',    width: 60, depth: 80 },
  'bed-king':      { room: 'bedroom',  label: 'King bed',     width: 76, depth: 80 },
  'crib':          { room: 'bedroom',  label: 'Crib',         width: 28, depth: 52 },
  'nightstand':    { room: 'bedroom',  label: 'Nightstand',   width: 22, depth: 18 },
  'dresser':       { room: 'bedroom',  label: 'Dresser',      width: 60, depth: 20 },
  'wardrobe':      { room: 'bedroom',  label: 'Wardrobe',     width: 48, depth: 22 },
  // ── Bathroom ───────────────────────────────────────────────
  'toilet':        { room: 'bathroom', label: 'Toilet',       width: 20, depth: 28 },
  'sink-vanity':   { room: 'bathroom', label: 'Vanity',       width: 36, depth: 21 },
  'sink-pedestal': { room: 'bathroom', label: 'Pedestal sink',width: 22, depth: 19 },
  'bathtub':       { room: 'bathroom', label: 'Bathtub',      width: 60, depth: 32 },
  'shower-stall':  { room: 'bathroom', label: 'Shower',       width: 36, depth: 36 },
  // ── Kitchen ────────────────────────────────────────────────
  'cabinet-base':  { room: 'kitchen',  label: 'Base cabinet', width: 36, depth: 24 },
  'cabinet-upper': { room: 'kitchen',  label: 'Upper cabinet',width: 36, depth: 12 },
  'fridge':        { room: 'kitchen',  label: 'Refrigerator', width: 36, depth: 30 },
  'stove-range':   { room: 'kitchen',  label: 'Range / stove',width: 30, depth: 26 },
  'sink-kitchen':  { room: 'kitchen',  label: 'Kitchen sink', width: 33, depth: 24 },
  'dishwasher':    { room: 'kitchen',  label: 'Dishwasher',   width: 24, depth: 24 },
  'island':        { room: 'kitchen',  label: 'Island',       width: 72, depth: 36 },
  // ── Living room ────────────────────────────────────────────
  'sofa-3':        { room: 'living',   label: 'Sofa',         width: 84, depth: 36 },
  'loveseat':      { room: 'living',   label: 'Loveseat',     width: 60, depth: 36 },
  'armchair':      { room: 'living',   label: 'Armchair',     width: 32, depth: 36 },
  'coffee-table':  { room: 'living',   label: 'Coffee table', width: 48, depth: 24 },
  'end-table':     { room: 'living',   label: 'End table',    width: 22, depth: 22 },
  'tv-console':    { room: 'living',   label: 'TV console',   width: 60, depth: 18 },
  'bookshelf':     { room: 'living',   label: 'Bookshelf',    width: 36, depth: 12 },
  // ── Dining room ────────────────────────────────────────────
  'dining-table-4':{ room: 'dining',   label: 'Dining table (4)',  width: 48, depth: 36 },
  'dining-table-6':{ room: 'dining',   label: 'Dining table (6)',  width: 72, depth: 38 },
  'dining-table-8':{ room: 'dining',   label: 'Dining table (8)',  width: 96, depth: 42 },
  'dining-chair':  { room: 'dining',   label: 'Dining chair',      width: 18, depth: 18 },
  'buffet':        { room: 'dining',   label: 'Buffet',            width: 60, depth: 20 },
  // ── Office ─────────────────────────────────────────────────
  'desk':          { room: 'office',   label: 'Desk',         width: 60, depth: 30 },
  'office-chair':  { room: 'office',   label: 'Office chair', width: 22, depth: 22 },
  'filing-cabinet':{ room: 'office',   label: 'Filing cabinet', width: 18, depth: 27 },
};

// Back-compat alias for any code still importing FURNITURE_DEFAULTS.
export const FURNITURE_DEFAULTS = FURNITURE_CATALOG;

export const STAIR_DEFAULTS = {
  width:  36,
  length: 120,
  treads: 12,
};

export const DIMENSION_DEFAULT_OFFSET = 24; // inches perpendicular from the measured points

export interface FurnitureItem {
  id: string;
  levelId: string;
  kind: FurnitureKind;
  position: Vec2;
  rotation: number;    // radians
  width: number;       // inches
  depth: number;       // inches
  // Kitchen cabinetry: optional color overrides. Items that don't carry these
  // fall back to CABINET_COLOR_DEFAULT / COUNTERTOP_COLOR_DEFAULT in renderers.
  // `countertopColor` only applies to pieces with a counter (cabinet-base,
  // island, sink-kitchen). cabinet-upper has no countertop.
  cabinetColor?: string;
  countertopColor?: string;
  // Stove / fridge size variants — drives door layout and burner count.
  // Empty / undefined → catalog default ('30' for stove, '36' for fridge).
  sizeVariant?: StoveSize | FridgeSize;
}

// Standalone annotation lines — not walls, not anchored to anything.
// Used to sketch details (headers, beams above, centerlines, custom
// furniture outlines, etc.) and to mark where walls should be split/trimmed.
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dash-dot';
export type LineWeight = 'thin' | 'medium' | 'thick';
export type LineColor  = 'black' | 'gray' | 'red' | 'blue' | 'yellow';

export interface LineEntity {
  id: string;
  levelId: string;
  start: Vec2;
  end: Vec2;
  style: LineStyle;
  weight: LineWeight;
  color?: LineColor; // optional for back-compat with pre-color saves; treated as 'black' when missing
}

export const LINE_DEFAULTS = {
  style: 'solid' as LineStyle,
  weight: 'medium' as LineWeight,
  color: 'black' as LineColor,
};

// Hex values per color name — picked for legibility on the light pattern bg
// and for distinct print appearance.
export const LINE_COLOR_HEX: Record<LineColor, string> = {
  black:  '#1f2540',
  gray:   '#8a8fa3',
  red:    '#dc2626',
  blue:   '#2563eb',
  yellow: '#d4a017', // muted "amber" — pure yellow is unreadable on white
};

// Pixel widths per weight at 1× zoom; scale with pxPerInch when drawing.
export const LINE_WEIGHT_PX: Record<LineWeight, number> = {
  thin:   0.7,
  medium: 1.2,
  thick:  2.0,
};

// Dash arrays in INCHES (converted to pixels in the renderer). 'solid' has
// no dash. Patterns chosen to read clearly at typical print scales.
export const LINE_DASH_INCHES: Record<LineStyle, number[]> = {
  solid:     [],
  dashed:    [6, 3],
  dotted:    [1, 2],
  'dash-dot': [6, 3, 1, 3],
};

export interface Level {
  id: string;
  name: string;
  elevation: number;   // inches above grade (for future 3D stacking)
  walls: Wall[];
  doors: Door[];
  windows: Window[];
  roomLabels: RoomLabel[];
  texts: TextLabel[];
  dimensions: Dimension[];
  stairs: Stair[];
  furniture: FurnitureItem[];
  lines: LineEntity[];
}

export interface RoofSettings {
  type: 'flat' | 'gable' | 'hip';
  pitch: number;       // rise per 12" run
  overhang: number;    // inches
  // Nominal 2×_ rafter depth. Optional for back-compat with saves predating
  // the Specs sheet; consumers fall back to 2×10.
  rafterDepth?: RafterDepth;
  // User-drawn roof-plan primitives: ridge beams, valley pads, generic
  // construction lines, text labels, dimensions. Same primitive shape as
  // the Section view (SectionPrimitive) so the same snap / edit / render
  // helpers operate on it. Empty / undefined = blank canvas; users start
  // a roof plan from scratch and place each ridge/valley by hand.
  drafting?: SectionPrimitive[];
  // Per-wall eave overhang overrides (inches). Walls without an entry use
  // `overhang` (the default). Lets the user push one section of the soffit
  // out farther than the rest — e.g. a deeper gable-end overhang where a
  // cross-gable meets the eave.
  eaveOverhangs?: Record<string, number>;
}

// 2×_ rafter sizes. Rafters can run smaller than floor joists (2×6 OK for
// short spans / garage roofs), so this overlaps but isn't equal to JoistDepth.
export type RafterDepth = 6 | 8 | 10 | 12;

// ─── Structural specs ─────────────────────────────────────────────────────────
// Project-wide building data driving 3D, elevations, roof plan, and (future)
// cross-section views. Single source of truth — per-view code should READ
// from project.structural, never duplicate values into UI state.

export type FoundationType = 'slab' | 'crawlspace' | 'full-basement';
export type JoistDepth = 8 | 10 | 12 | 14;        // 2×_ nominal lumber

// 2× lumber max sizes: solid sawn tops out at 2×12. A "2×14" only exists as
// LVL (laminated veneer lumber) — call it out explicitly in dropdowns and
// in the section's structural labels so students don't get the wrong idea.
export function formatJoistLabel(depth: JoistDepth): string {
  return depth === 14 ? `2×${depth} LVL` : `2×${depth}`;
}
export type CeilingJoistDepth = 8 | 10 | 12;
export type ConcreteWallThickness = 8 | 10 | 12;  // standard residential pour
export type ExteriorMaterial =
  | 'lap-siding' | 'board-batten' | 'brick' | 'stone' | 'stucco' | 'shake';

export interface FoundationSpecs {
  type: FoundationType;
  wallThickness: ConcreteWallThickness;
  // Inches from top of footing to top of wall. Defaults: full-basement = 84,
  // crawlspace = 36, slab = 28 (so footing bottom lands 36" below floor finish
  // with the default 8" footing thickness).
  wallHeight: number;
  // Derived by default (= wallThickness + 8 — 4" wider on each side).
  // Stored only when the user overrides via the Override toggle.
  footingWidthOverride?: number;
  footingThickness: number;   // default 8"
  // 4" wide × ~1.5" deep groove centered on top of footing where the wall
  // keys in. The Specs cross-section diagram renders this when true.
  keyway: boolean;
  slabThickness: number;      // default 4" — basement floor / slab-on-grade
  // Inches from grade UP to top of first-floor subfloor. Drives the GRADE
  // T/O line in the section view. Default 18" — typical residential.
  gradeToFirstFloor?: number;
}

export interface FloorSpecs {
  joistDepth: JoistDepth;
  plateHeight: number;        // wall stud height, default 96"
}

export interface CeilingSpecs {
  joistDepth: CeilingJoistDepth;
}

export interface StructuralSpecs {
  foundation: FoundationSpecs;
  firstFloor: FloorSpecs;
  // Present iff a second floor exists. Kept optional rather than derived from
  // levels.length so the user can pre-spec a planned second floor before
  // drawing it (or keep secondFloor values around when temporarily collapsing
  // to a single floor).
  secondFloor?: FloorSpecs;
  ceiling: CeilingSpecs;
  exteriorMaterial: ExteriorMaterial;
}

export interface Project {
  id: string;
  name: string;
  units: 'imperial' | 'metric';
  activeLevelId: string;
  levels: Level[];
  roof: RoofSettings;
  // Optional for back-compat with saves predating the Specs sheet. Use
  // `getStructural(project)` in engine/structural.ts to read with defaults.
  structural?: StructuralSpecs;
  // Drafting-mode snapshot for the cross-section view. When set, the
  // section renders from these primitives instead of building procedurally
  // from `structural` — the user has "customized" the drawing and
  // structural-spec changes no longer affect it. Cleared by "Reset to auto".
  sectionDrafting?: SectionDrafting;
  // Drafting-mode snapshot for exterior elevations (per direction). Same
  // semantics as `sectionDrafting`: when a direction's snapshot is set,
  // structural-spec/plan changes no longer affect that elevation.
  elevationDrafting?: ElevationDrafting;
  // Section cuts placed by the user on the 2D plan. Project-wide (apply to
  // all floors). The Specs view shows a Typical | Section A-A | Section B-B…
  // picker that lets the user pick which cut to view. Optional for back-compat
  // with saves predating the section tool.
  sectionCuts?: SectionCut[];
  // Sandbox-sheet state (projection guide lines, etc.). Lives on the project so
  // it persists with the design. Optional for back-compat.
  sheet?: SheetSettings;
}

// ─── Sandbox sheet ────────────────────────────────────────────────────────────
// A projection / construction guide line on the Sandbox sheet: infinite in one
// direction, used to check alignment across all the composited views. `pos` is
// the sheet-world coordinate (Y for a horizontal guide, X for a vertical one).
export interface SheetGuide {
  id: string;
  axis: 'h' | 'v';
  pos: number;
}

export interface SheetSettings {
  guides?: SheetGuide[];
}

// ─── Section drawing primitives ──────────────────────────────────────────────
// Structured drawing data for the Specs cross-section view. The same flat
// list is consumed by the auto renderer (engine/sectionPrimitives.ts), the
// drafting-mode snapshot, and the (Phase D+) snap engine and tools. Coords
// are world inches (origin = building centerline at top of first-floor
// subfloor, Y-up).

// Line styles for section primitives. `normal` and `sheathing` are reserved
// for procedural construction (the section builder uses them) — user-picked
// styles for new drawing extend with traditional CAD dash patterns:
//   solid   — continuous (alias for normal but presented to the user)
//   dashed  — long-short repeating
//   dotted  — small dot + gap
//   center  — long-short-short-short (centerline marker)
//   hidden  — short-short repeating (hidden / behind-object lines)
export type SectionLineStyle =
  | 'normal' | 'sheathing'
  | 'solid' | 'dashed' | 'dotted' | 'center' | 'hidden' | 'arrow'
  | 'thin' | 'thick'
  // Roof-plan specific. `ridge` = bold solid (a ridge beam line);
  // `valley` = bold dashed (a valley pad line); `hip` = bold solid hip rafter
  // (runs from a ridge end out to an eave corner — its presence at a ridge
  // endpoint makes that end a HIP rather than a gable). Render-wise they pick
  // up a heavier weight in `drawPrimLine` so they read as primary roof framing.
  | 'ridge' | 'valley' | 'hip';
export type SectionPolyStyle =
  | 'normal' | 'sheathing' | 'lumber-x'
  | 'thin' | 'thick';
export type SectionTextColor = 'ink' | 'inkSoft' | 'inkMuted';

export interface PrimLine {
  id: string;
  kind: 'line';
  a: Vec2; b: Vec2;
  style: SectionLineStyle;
}
export interface PrimPolyline {
  id: string;
  kind: 'polyline';
  verts: Vec2[];
  closed: boolean;
  style: SectionPolyStyle;
  // Optional fill — drives the polygon's interior colour. Used by the
  // elevation builder to express casing/sill/corner-board as `'trim'`,
  // glass panes as `'glass'`, solid door slabs as `'panel'`. When omitted
  // the polyline renders with no fill (outline only).
  fill?: DrawingFillStyle;
  // When true the polygon is FILLED but NOT stroked. Setback gable-side hidden-
  // line uses this to fill a subtracted (clipped) piece without stroking its
  // internal cut edges; the real visible outline is drawn separately.
  noStroke?: boolean;
}

// Fill style for closed polylines. Each renderer maps the enum to a colour;
// keeping the value semantic (`trim`, `glass`, `panel`) rather than literal
// hex means a future theme change touches one place.
export type DrawingFillStyle =
  | 'none'
  | 'trim'        // casing, fascia, sill, corner board — white-fill ink-stroke
  | 'glass'       // window pane or sliding-door glazing — blue tint
  | 'panel'       // solid door slab — wood tone
  | 'door';       // painted door slab — light grey

// Material hatch pattern for wall-body cladding. Mirrors ExteriorMaterial
// (the project-level default lives on StructuralSpecs); kept as a distinct
// alias because hatch primitives can override the project default per
// region (water-table band, gable accent, etc.).
export type HatchPattern =
  | 'lap-siding' | 'board-batten'
  | 'brick'      | 'stone'
  | 'stucco'     | 'shake'
  | 'roof-shingles'
  | 'blank';   // solid white fill, no pattern — used to mask over a hatch

// Closed polygon filled with a repeating material pattern. The renderer
// picks the pattern off `pattern` and renders inside `verts` (world inches,
// Y-up). `angle` rotates the pattern in radians (default 0 — pattern lines
// run horizontal for lap-siding, vertical for board-batten, etc.).
export interface PrimHatch {
  id: string;
  kind: 'hatch';
  verts: Vec2[];
  pattern: HatchPattern;
  angle?: number;
}
export interface PrimText {
  id: string;
  kind: 'text';
  at: Vec2;
  content: string;
  size?: number;
  align?: 'left' | 'center' | 'right';
  baseline?: 'top' | 'middle' | 'bottom';
  angle?: number;              // radians (screen-space rotation; sloped labels)
  color?: SectionTextColor;
}
// T/O elevation extension line + label hugging its left end. Stored as a
// world-coord primitive (xL, xR, y) so it pans/zooms with the structure.
export interface PrimTOLine {
  id: string;
  kind: 'toLine';
  leftXIn: number;
  rightXIn: number;
  yIn: number;
  label: string;
}
// Vertical dim segment between two world Y values, at a world X. Tick marks
// and rotated label are added by the renderer.
export interface PrimDimChain {
  id: string;
  kind: 'dimChain';
  xIn: number;
  y1In: number;
  y2In: number;
  text: string;
}
// Compound L-glyph showing roof pitch (rise / 12).
export interface PrimPitchSymbol {
  id: string;
  kind: 'pitchSymbol';
  anchor: Vec2;
  pitch: number;
}
// Linear dimension between two world points. `offset` is the signed
// perpendicular distance from the AB segment to the dimension line
// (positive = CCW from A→B, negative = CW). The renderer draws extension
// lines from A and B, a dim line parallel to AB at the offset, tick
// marks at the dim-line endpoints, and a label showing the formatted
// distance.
export interface PrimDimLinear {
  id: string;
  kind: 'dimLinear';
  a: Vec2;
  b: Vec2;
  offset: number;
}

// Primitives shared between the section view and the elevation view. The
// section view adds one extra primitive (PrimTOLine — top-of-floor extension
// label) and the elevation view doesn't need it; otherwise the toolset, the
// snap engine, and the drafting-mode storage all operate on this union.
export type DrawingPrimitive =
  | PrimLine | PrimPolyline | PrimHatch
  | PrimText | PrimDimLinear | PrimDimChain | PrimPitchSymbol;

// Superset including the section-only PrimTOLine. Section snapshots are
// stored as SectionPrimitive[]; elevation snapshots use DrawingPrimitive[]
// directly.
export type SectionPrimitive = DrawingPrimitive | PrimTOLine;

// Drafting-mode snapshot. When `typical` is set, the Specs section is
// "customized" — it renders from these primitives instead of building
// procedurally. `cuts` keys are SectionCut ids — each cut can be
// independently customized once the user clicks "Customize this drawing"
// while viewing it.
export interface SectionDrafting {
  typical?: SectionPrimitive[];
  cuts?: Record<string, SectionPrimitive[]>;
}

// Per-direction drafting snapshot for exterior elevations. Mirrors
// SectionDrafting's pattern (snapshot per scope). When a direction's
// snapshot is set, the elevation renders from these primitives instead of
// building procedurally — structural-spec, roof, and floor-plan changes no
// longer affect it until the user clicks "Reset to auto".
export interface ElevationDrafting {
  north?: DrawingPrimitive[];
  east?:  DrawingPrimitive[];
  south?: DrawingPrimitive[];
  west?:  DrawingPrimitive[];
}

// ─── Section cuts (placed on the 2D floor plan) ──────────────────────────────
// A section cut is a project-wide annotation that defines where a vertical
// slice through the building is taken. The cut applies across ALL floors at
// the same plan position. v1 is restricted to ORTHOGONAL cuts (horizontal
// or vertical in plan) — picking an axis + position lets the section
// builder enumerate intersected walls without any projection math.
//
// `axis: 'x'` means the cut runs along the X axis at a fixed Y (a horizontal
// slice on the plan). `axis: 'y'` means the cut runs along the Y axis at a
// fixed X. The cut's extent is bounded by [start, end] along the parallel
// axis; only walls whose footprint intersects the line within that range
// are included in the derived section.
//
// `facing` is the viewing direction normal to the cut line:
//   axis = 'x', facing = +1 → viewer looks in +Y (cut shows what's above the line)
//   axis = 'x', facing = -1 → viewer looks in -Y
//   axis = 'y', facing = +1 → viewer looks in +X
//   axis = 'y', facing = -1 → viewer looks in -X
export interface SectionCut {
  id: string;
  name: string;            // Auto-generated: 'A', 'B', 'C', …
  axis: 'x' | 'y';
  // Fixed coordinate along the perpendicular axis (the value the cut line
  // sits AT). For axis='x' this is the Y of the horizontal cut line.
  position: number;        // world inches
  // Bounds along the parallel axis. start ≤ end always; the builder uses
  // these to clamp which walls the cut "sees".
  start: number;           // world inches
  end: number;             // world inches
  facing: 1 | -1;
}

// Tools available in the section drafting palette. `select` is the default;
// it lets the user click primitives to select/drag/delete (Phase F). The
// other tools draw new primitives or modify existing ones.
export type SectionTool = 'select' | 'line' | 'offset' | 'trim' | 'dim' | 'text' | 'erase';

// ─── Selection ────────────────────────────────────────────────────────────────

export type SelectionKind =
  | 'wall' | 'door' | 'window' | 'roomLabel' | 'text' | 'dimension' | 'stair' | 'furniture' | 'line'
  | 'sectionCut';

export interface Selection {
  kind: SelectionKind;
  id: string;
}

// ─── Defaults / factory ───────────────────────────────────────────────────────

// 4.5" matches a typical 2×4 stud (3.5") + ½" drywall on each face.
export const DEFAULT_WALL_THICKNESS = 4.5;
export const DEFAULT_WALL_HEIGHT = 96;
export const DEFAULT_WALL_STATUS: WallStatus = 'proposed';
export const DEFAULT_DOOR_WIDTH = 32;
export const DEFAULT_DOOR_HEIGHT = 80;
export const DEFAULT_WINDOW_WIDTH = 36;
export const DEFAULT_WINDOW_HEIGHT = 48;
export const DEFAULT_WINDOW_SILL = 36;

let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function emptyLevel(name: string, elevation = 0): Level {
  return {
    id: makeId('lvl'),
    name,
    elevation,
    walls: [],
    doors: [],
    windows: [],
    roomLabels: [],
    dimensions: [],
    stairs: [],
    furniture: [],
    lines: [],
    texts: [],
  };
}

export function newProject(name = 'Untitled Plan'): Project {
  const ground = emptyLevel('Floor 1', 0);
  return {
    id: makeId('prj'),
    name,
    units: 'imperial',
    activeLevelId: ground.id,
    levels: [ground],
    roof: { type: 'gable', pitch: 6, overhang: 12, rafterDepth: 10 },
    structural: DEFAULT_STRUCTURAL,
  };
}

// ─── Structural defaults ──────────────────────────────────────────────────────
// Sensible starting values for a single-story full-basement house. The Specs
// view lets the user change any of these; `getStructural(project)` in
// engine/structural.ts merges in these defaults for back-compat saves.

export const DEFAULT_FOUNDATION: FoundationSpecs = {
  type: 'full-basement',
  wallThickness: 8,
  wallHeight: 84,
  footingThickness: 8,
  keyway: true,
  slabThickness: 4,
  gradeToFirstFloor: 18,
};

export const DEFAULT_STRUCTURAL: StructuralSpecs = {
  foundation: DEFAULT_FOUNDATION,
  firstFloor: { joistDepth: 10, plateHeight: 96 },
  ceiling:    { joistDepth: 10 },
  exteriorMaterial: 'lap-siding',
};

// Standard wall heights per foundation type, used when the user changes
// foundation.type in the Specs sheet (the height field auto-snaps to the
// new default unless they've manually edited it).
//
// Slab: stem wall + footing must put the BOTTOM of the footing 36" below
// the floor finish (frost-line target). With a default 8" footing thickness,
// that means a 28" stem wall (28 + 8 = 36").
export const FOUNDATION_WALL_HEIGHT_DEFAULT: Record<FoundationType, number> = {
  'slab':              28,
  'crawlspace':        36,
  'full-basement':     84,
};

// Default `gradeToFirstFloor` per foundation type. Slab-on-grade sits
// closer to grade (typically ~10" rise from grade up to the slab top).
export const GRADE_TO_FIRST_FLOOR_DEFAULT: Record<FoundationType, number> = {
  'slab':              10,
  'crawlspace':        18,
  'full-basement':     18,
};

// Nominal 2×_ lumber → actual milled depth (industry standard). Covers the
// union of all 2×_ sizes used across joists, rafters, and ceiling members.
export const LUMBER_ACTUAL_DEPTH: Record<6 | 8 | 10 | 12 | 14, number> = {
  6:  5.5,
  8:  7.25,
  10: 9.25,
  12: 11.25,
  14: 13.25,
};

// ─── Unit display ─────────────────────────────────────────────────────────────

// Render inches as a clean architectural string: 7'-4" or 4".
export function formatImperial(inches: number): string {
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  const ft = Math.floor(abs / 12);
  const remIn = abs - ft * 12;
  const rounded = Math.round(remIn * 100) / 100;
  if (ft === 0) return `${sign}${rounded}"`;
  if (rounded === 0) return `${sign}${ft}'-0"`;
  return `${sign}${ft}'-${rounded}"`;
}
