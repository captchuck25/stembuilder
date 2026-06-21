'use client';

// Read-only 3D view, generated automatically from the 2D plan.
//
// Coordinate convention: three.js is Y-up. We map
//   plan X        → 3D X
//   level Y (plan)→ 3D Z   (so looking down −Y shows the plan)
//   elevation     → 3D Y
//
// Walls are rendered as axis-aligned box prisms per segment from
// `wallSegmentsWithCuts`, rotated around Y to the wall's plan angle.
// Headers are added above each opening; sills below each window. The wall
// data itself is preserved untouched (so 2D plan edits flow through here).

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

import {
  doorOpeningCut, windowOpeningCuts, wallSegmentsWithCuts, stairHalfExtents,
} from '../engine/geometry';
import { deriveExteriorWallIds } from '../engine/roof';
import {
  buildRoofTiers, pointInPolygon, RoofTopology,
} from '../engine/roofTopology';
import {
  FurnitureItem,
  Project, Stair, Wall, Window as WinType,
} from '../engine/types';
import { T } from '../engine/theme';
import { FurnitureModel } from './Furniture3D';
import { FURNITURE_HEIGHTS, CABINET_UPPER_FLOOR_OFFSET } from '../engine/heights';

// ─── Visual constants ─────────────────────────────────────────────────────────

const FLOOR_SLAB_THICKNESS = 12; // inches between two stacked floors

// Exterior is derived from geometry (perimeter), not a stored wall type — so
// keyed by visual role: a perimeter wall reads 'exterior', an interior
// structural wall reads 'wall', and a partition reads 'partition'.
const WALL_COLOR: Record<'exterior' | 'wall' | 'partition', string> = {
  exterior:  '#bcc0c6',
  wall:      '#d2d5da',
  partition: '#e0e3e7',
};

const FLOOR_COLOR = '#d8c5a3'; // light wood tone
const ROOF_COLOR  = '#5b5f66'; // asphalt-shingle gray

// Roof withheld from the 3D view in PRODUCTION only: the live site renders no
// 3D roof and hides its toggle, while local `next dev` keeps the roof + toggle
// so it can still be worked on. (NODE_ENV is 'production' in the Vercel build,
// 'development' under next dev.)
const ROOF_IN_3D = process.env.NODE_ENV !== 'production';
const WINDOW_GLASS_COLOR = '#a8c7e3';
const DOOR_SLAB_COLOR    = '#9a7e58'; // exterior entry doors — stained wood
const DOOR_SLAB_INTERIOR = '#f4f3ef'; // interior doors are painted white
const TRIM_COLOR         = '#ffffff';
const DOOR_FRAME_COLOR   = '#ffffff';

// Entry doors are the only exterior door type; everything else is interior
// (room, bifold, pocket, barn) and painted white.
function doorSlabColor(doorType: import('../engine/types').DoorType): string {
  return doorType === 'entry' ? DOOR_SLAB_COLOR : DOOR_SLAB_INTERIOR;
}

// Per-kind 3D geometry + heights live in ./Furniture3D.

// ─── Scene ────────────────────────────────────────────────────────────────────

// Probe for a usable WebGL context. Some environments (sandboxed browsers
// without hardware acceleration, certain VMs/remote desktops) silently fail
// to create one, which would otherwise crash the page on first paint.
function detectWebGL(): boolean {
  if (typeof window === 'undefined') return true; // SSR — defer the check
  try {
    const probe = document.createElement('canvas');
    const ctx = probe.getContext('webgl2') || probe.getContext('webgl');
    return !!ctx;
  } catch {
    return false;
  }
}

export default function Scene3D({ project }: { project: Project }) {
  const bounds = useMemo(() => computeProjectBounds(project), [project]);
  const wallTopMax = useMemo(() => computeMaxWallTop(project), [project]);

  // Distance the camera from the model based on its size so any project fits.
  const camDist = Math.max(bounds.size, 240) * 1.4;
  const center: [number, number, number] = [
    (bounds.minX + bounds.maxX) / 2,
    wallTopMax * 0.35,
    (bounds.minY + bounds.maxY) / 2,
  ];

  const [webglOk, setWebglOk] = useState<boolean | null>(null);
  useEffect(() => { setWebglOk(detectWebGL()); }, []);

  // Floor visibility — levels stack low→high; the lowest is the "ground" floor
  // (its slab gets the foundation lip). Hidden levels are skipped entirely so
  // you can peel the top floor off and inspect the one below.
  const sortedLevels = useMemo(
    () => [...project.levels].sort((a, b) => a.elevation - b.elevation),
    [project.levels],
  );
  const groundElev = sortedLevels[0]?.elevation;
  const [hiddenLevels, setHiddenLevels] = useState<Set<string>>(new Set());
  const [showRoof, setShowRoof] = useState(true);

  // Roof tiers — derived from the SAME source as the Roof Plan / elevations /
  // sections: buildRoofTiers reads the drawn ridges (project.roof.drafting) and
  // each level's footprint, and roofHeightAt(topology, p) is the canonical 3D
  // roof height those views project from. The 3D roof here samples that exact
  // function, so a roof only appears once it's been drawn in the Roof Plan.
  const roofTiers = useMemo(() => buildRoofTiers(project), [project]);

  if (webglOk === false) return <WebGLFallback />;
  if (webglOk === null) return <div style={{ flex: 1, background: T.bg }} />;

  return (
    <div style={{ flex: 1, background: T.bg, position: 'relative' }}>
      <Canvas
        shadows
        camera={{
          position: [center[0] + camDist * 0.7, center[1] + camDist * 0.9, center[2] + camDist * 0.7],
          fov: 35,
          near: 1,
          far: camDist * 8,
        }}
        onCreated={({ gl }) => {
          // If the renderer fails to acquire a context after layout (e.g.
          // GPU access yanked mid-session), swap to the fallback panel.
          if (!gl || !gl.getContext()) setWebglOk(false);
        }}
      >
        <color attach="background" args={[T.bg]} />
        <hemisphereLight args={['#ffffff', '#b0b5c4', 0.6]} />
        <directionalLight
          position={[bounds.maxX + 200, wallTopMax + 400, bounds.minY - 200]}
          intensity={0.9}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <ambientLight intensity={0.35} />

        {project.levels.map(level => (
          hiddenLevels.has(level.id) ? null : (
            <LevelGroup
              key={level.id}
              level={level}
              project={project}
              isGround={level.elevation === groundElev}
            />
          )
        ))}

        {ROOF_IN_3D && showRoof && roofTiers.map(tier => {
          const lvl = project.levels.find(l => l.id === tier.levelId);
          if (!lvl || hiddenLevels.has(tier.levelId) || !tier.topology.hasRoof) return null;
          let top = 0;
          for (const w of lvl.walls) top = Math.max(top, lvl.elevation + w.height);
          const higherTiers = roofTiers.filter(t => t.index > tier.index);
          // Masking a lower tier against the floor(s) above it:
          //  • coveredWall — the area genuinely UNDER a higher floor (no lower
          //    roof there). The lower roof runs right up to this wall, so a wing
          //    dies cleanly INTO the taller wall (no gap at the overhang line).
          //  • coveredEave — wall + overhang. In the ring between a higher wall
          //    and its eave, the lower roof is kept ONLY where it's genuinely
          //    high (a wing rising into the wall); the low flat sliver elsewhere
          //    (the stray band around the upper block) is dropped.
          const coveredWall = higherTiers
            .filter(t => t.footprint.wallOuter)
            .map(t => t.footprint.wallOuter);
          const coveredEave = higherTiers
            .filter(t => t.footprint.eave)
            .map(t => t.footprint.eave);
          // A ridge endpoint that lands on a higher tier's WALL (the wing gable
          // meeting the 2-story) must DIE INTO that wall as a gable, not continue
          // past it as a hip.
          const topology = gableizeAgainstHigher(tier.topology, coveredWall);
          return (
            <RoofTierMesh
              key={tier.levelId}
              topology={topology}
              baseY={top || lvl.elevation + 96}
              coveredWall={coveredWall}
              coveredEave={coveredEave}
            />
          );
        })}

        <OrbitControls
          target={center}
          enableDamping
          dampingFactor={0.12}
          minDistance={24}
          maxDistance={camDist * 4}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />
      </Canvas>

      <ViewBadge />

      <FloorToggle
        levels={sortedLevels}
        hidden={hiddenLevels}
        onToggle={id => setHiddenLevels(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id); else next.add(id);
          return next;
        })}
        showRoof={showRoof}
        onToggleRoof={() => setShowRoof(v => !v)}
      />
    </div>
  );
}

// Visibility control — a Roof toggle plus one toggle per level, listed top
// floor first so the stack reads the way it looks in the view. Click to peel a
// layer off. The Floors section only appears when there's more than one level.
function FloorToggle({ levels, hidden, onToggle, showRoof, onToggleRoof }: {
  levels: Pick<Project['levels'][number], 'id' | 'name'>[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
  showRoof: boolean;
  onToggleRoof: () => void;
}) {
  const Row = ({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        border: `1px solid ${on ? T.warm : T.line}`,
        background: on ? T.warm : 'transparent',
        color: on ? '#fff' : T.inkSoft,
        borderRadius: 6, padding: '5px 8px', cursor: 'pointer',
        fontSize: 12, fontWeight: 600, textAlign: 'left', width: '100%',
      }}
    >
      <span style={{ fontSize: 11, width: 12, display: 'inline-block' }}>
        {on ? '◉' : '○'}
      </span>
      {label}
    </button>
  );

  // With the roof toggle withheld, a single-floor project has nothing to show
  // here, so skip the panel entirely rather than render an empty "Show" box.
  if (!ROOF_IN_3D && levels.length <= 1) return null;

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 1,
      background: T.panel, border: `1px solid ${T.line}`,
      borderRadius: 8, padding: 6, boxShadow: T.shadow,
      display: 'flex', flexDirection: 'column', gap: 4, minWidth: 110,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.6px',
        color: T.inkSoft, textTransform: 'uppercase', padding: '2px 4px 0',
      }}>Show</div>
      {ROOF_IN_3D && <Row on={showRoof} onClick={onToggleRoof} label="Roof" />}
      {levels.length > 1 && levels.slice().reverse().map((lvl, i) => (
        <Row
          key={lvl.id}
          on={!hidden.has(lvl.id)}
          onClick={() => onToggle(lvl.id)}
          label={lvl.name || `Floor ${levels.length - i}`}
        />
      ))}
    </div>
  );
}

function ViewBadge() {
  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 1,
      background: T.panel, border: `1px solid ${T.line}`,
      borderRadius: 8, padding: '6px 10px', boxShadow: T.shadow,
      fontSize: 11, fontWeight: 600, color: T.inkSoft,
      letterSpacing: '0.3px',
    }}>
      Auto-generated from 2D plan · drag to orbit · scroll to zoom
    </div>
  );
}

// ─── Per-level group ──────────────────────────────────────────────────────────

function LevelGroup({ level, project, isGround }: { level: Pick<Project['levels'][number], 'id' | 'elevation' | 'walls' | 'doors' | 'windows' | 'stairs' | 'furniture'>; project: Project; isGround: boolean }) {
  const elev = level.elevation;

  // Pre-index openings by wallId so each wall knows its cuts.
  const doorsByWall = useMemo(() => groupBy(level.doors, d => d.wallId), [level.doors]);
  const windowsByWall = useMemo(() => groupBy(level.windows, w => w.wallId), [level.windows]);

  // Endpoint extensions to fill the outside-corner wedge where walls meet.
  const wallExtensions = useMemo(() => computeWallExtensions(level.walls), [level.walls]);

  // Walls on the building perimeter render with the exterior tone (derived from
  // geometry — exterior is no longer a stored wall type).
  const exteriorIds = useMemo(() => deriveExteriorWallIds(level), [level]);

  // Exterior wall thickness — the wall bounding box runs along centerlines, so
  // the siding face sits half a thickness beyond it. The inter-floor slab edge
  // is pushed out by this much so its band is flush with the siding (not
  // recessed, which would read as a shaded horizontal stripe between floors).
  const exteriorThickness = useMemo(() => {
    let t = 0;
    for (const w of level.walls) if (exteriorIds.has(w.id)) t = Math.max(t, w.thickness);
    return t || 6;
  }, [level.walls, exteriorIds]);

  // Floor slab — sized to the level's wall bounding box, tiled around any
  // stairwell openings. A 'down' stair on this level (the auto-generated mirror
  // of an 'up' flight arriving from below, or a manual descent) means the floor
  // is cut open there, so we omit slab tiles over its footprint.
  const slab = useMemo(() => computeLevelBounds(level.walls), [level.walls]);
  const slabTilesList = useMemo(() => {
    if (!slab) return [];
    // Ground floor: 12" foundation lip. Upper floors: push the edge out half a
    // wall thickness so the slab band is flush with the siding (not a recessed
    // stripe between floors).
    const halfMargin = isGround ? 12 : exteriorThickness / 2;
    const outer: Rect = {
      x0: slab.minX - halfMargin, x1: slab.maxX + halfMargin,
      z0: slab.minY - halfMargin, z1: slab.maxY + halfMargin,
    };
    const holes = level.stairs
      .filter(s => s.direction === 'down')
      .map(s => stairHoleRect(s, 1.5));
    return slabTiles(outer, holes);
  }, [slab, isGround, exteriorThickness, level.stairs]);

  return (
    <group>
      {/* Floor slab tiles. Upper floors get a wood TOP face (the visible floor
          of the open box) with exterior-colored sides so the inter-floor band
          reads as continuous siding; the ground slab is wood all around. */}
      {slabTilesList.map((t, i) => (
        <SlabTile
          key={i}
          rect={t}
          y={elev - FLOOR_SLAB_THICKNESS / 2}
          thickness={FLOOR_SLAB_THICKNESS}
          isGround={isGround}
        />
      ))}

      {level.walls.map(w => (
        <WallMesh
          key={w.id}
          wall={w}
          elevation={elev}
          doors={doorsByWall.get(w.id) ?? []}
          windows={windowsByWall.get(w.id) ?? []}
          extension={wallExtensions.get(w.id) ?? { start: 0, end: 0 }}
          isExterior={exteriorIds.has(w.id)}
        />
      ))}

      {/* Render the stepped flight only for 'up' stairs (the source). The
          linked 'down' mirror on the arrival floor occupies the same space, so
          rendering it too would double the geometry — instead it just cuts the
          stairwell hole in that floor's slab (above). */}
      {level.stairs.filter(s => s.direction === 'up').map(s => (
        <StairMesh key={s.id} stair={s} elevation={elev} project={project} />
      ))}

      {level.furniture.map(f => (
        <FurnitureMesh key={f.id} item={f} elevation={elev} />
      ))}
    </group>
  );
}

// ─── Wall ────────────────────────────────────────────────────────────────────

function WallMesh({ wall, elevation, doors, windows, extension, isExterior }: {
  wall: Wall;
  elevation: number;
  doors: import('../engine/types').Door[];
  windows: WinType[];
  extension: { start: number; end: number };
  isExterior: boolean;
}) {
  // Build the "cut" wall segments using the same helper the 2D renderer uses,
  // so 3D and 2D stay consistent when openings move. Hooks must run before
  // any early-return below.
  const cuts = useMemo(() => [
    ...doors.map(d => doorOpeningCut(d)),
    ...windows.flatMap(w => windowOpeningCuts(w)),
  ], [doors, windows]);
  const segments = useMemo(() => wallSegmentsWithCuts(wall, cuts), [wall, cuts]);

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const fullLen = Math.hypot(dx, dy);
  if (fullLen === 0) return null;

  const angle = Math.atan2(dy, dx); // plan radians, 0 = +X
  const color = WALL_COLOR[isExterior ? 'exterior' : wall.type];

  return (
    <group>
      {segments.map(seg => {
        // wallSegmentsWithCuts returns the ORIGINAL wall.start/wall.end objects
        // on the first/last segments — so identity check tells us which segment
        // boundaries are real wall endpoints (eligible for corner extension)
        // vs cut boundaries (not eligible).
        const startExt = seg.start === wall.start ? extension.start : 0;
        const endExt   = seg.end   === wall.end   ? extension.end   : 0;
        return (
          <WallSegmentBox
            key={seg.id}
            wall={seg}
            elevation={elevation}
            color={color}
            startExt={startExt}
            endExt={endExt}
          />
        );
      })}

      {/* Headers above each opening — width matches the cut, height fills to wall top. */}
      {doors.map(d => {
        const cut = doorOpeningCut(d);
        return (
          <OpeningBlock
            key={`hdr-d-${d.id}`}
            wall={wall}
            positionAlong={cut.positionAlong}
            width={cut.width}
            fromY={elevation + d.height}
            toY={elevation + wall.height}
            angle={angle}
            color={color}
          />
        );
      })}
      {windows.map(w => {
        const sill = w.headHeight - w.height;
        const isBay = w.windowType === 'bay';
        // A "double" double-hung is two units flanking a wall pier, so it
        // renders as two independent glazed openings; everything else is one.
        const cuts = windowOpeningCuts(w);
        return (
          <group key={`hdr-w-${w.id}`}>
            {cuts.map((cut, ci) => (
              <group key={ci}>
                {/* Header above window */}
                <OpeningBlock
                  wall={wall}
                  positionAlong={cut.positionAlong}
                  width={cut.width}
                  fromY={elevation + w.headHeight}
                  toY={elevation + wall.height}
                  angle={angle}
                  color={color}
                />
                {/* Sill below window */}
                <OpeningBlock
                  wall={wall}
                  positionAlong={cut.positionAlong}
                  width={cut.width}
                  fromY={elevation}
                  toY={elevation + sill}
                  angle={angle}
                  color={color}
                />
                {isBay ? (
                  <BayWindow window={w} wall={wall} elevation={elevation} angle={angle} />
                ) : (
                  <WindowGlazing
                    wall={wall}
                    windowType={w.windowType}
                    positionAlong={cut.positionAlong}
                    width={cut.width}
                    bottomY={elevation + sill}
                    topY={elevation + w.headHeight}
                    angle={angle}
                  />
                )}
              </group>
            ))}
          </group>
        );
      })}

      {/* Door slabs — thin, set in the opening. Pure visual cue. */}
      {doors.map(d => {
        if (d.doorType === 'sliding')
          return <SlidingDoorSlab key={`slab-${d.id}`} door={d} wall={wall} elevation={elevation} angle={angle} />;
        if (d.doorType === 'bifold')
          return <BifoldDoorSlab key={`slab-${d.id}`} door={d} wall={wall} elevation={elevation} angle={angle} />;
        return <DoorSlab key={`slab-${d.id}`} door={d} wall={wall} elevation={elevation} angle={angle} />;
      })}

      {/* Trim casing — 3-sided for doors, 4-sided for windows, on both faces. */}
      {doors.map(d => {
        const cut = doorOpeningCut(d);
        return (
          <OpeningTrim
            key={`trim-d-${d.id}`}
            wall={wall}
            positionAlong={cut.positionAlong}
            cutWidth={cut.width}
            bottomY={elevation}
            topY={elevation + d.height}
            angle={angle}
            includeBottom={false}
          />
        );
      })}
      {windows.map(w => {
        const sill = w.headHeight - w.height;
        // Bay windows project their own frame outward; the outside-face
        // casing would otherwise poke past the bay's roof soffit.
        const isBay = w.windowType === 'bay';
        const skipFace: -1 | 0 | 1 = isBay ? (w.flipped ? -1 : 1) : 0;
        // Casing wraps each opening; a double double-hung gets one per unit.
        return windowOpeningCuts(w).map((cut, ci) => (
          <OpeningTrim
            key={`trim-w-${w.id}-${ci}`}
            wall={wall}
            positionAlong={cut.positionAlong}
            cutWidth={cut.width}
            bottomY={elevation + sill}
            topY={elevation + w.headHeight}
            angle={angle}
            includeBottom
            skipFace={skipFace}
          />
        ));
      })}
    </group>
  );
}

function WallSegmentBox({ wall, elevation, color, startExt = 0, endExt = 0 }: {
  wall: Wall;
  elevation: number;
  color: string;
  startExt?: number;
  endExt?: number;
}) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const baseLen = Math.hypot(dx, dy);
  if (baseLen === 0) return null;
  const ux = dx / baseLen, uy = dy / baseLen;

  // Stretch the box outward by `startExt` past wall.start and `endExt` past
  // wall.end (along the wall axis). Center shifts by half the net extension.
  const len = baseLen + startExt + endExt;
  const cx = (wall.start.x - ux * startExt + wall.end.x + ux * endExt) / 2;
  const cy = (wall.start.y - uy * startExt + wall.end.y + uy * endExt) / 2;
  const angle = Math.atan2(dy, dx);

  return (
    <mesh
      position={[cx, elevation + wall.height / 2, cy]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[len, wall.height, wall.thickness]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  );
}

// Block placed above/below an opening, parameterized in wall-local frame.
function OpeningBlock({ wall, positionAlong, width, fromY, toY, angle, color, thicknessOverride, transparent, opacity }: {
  wall: Wall;
  positionAlong: number;
  width: number;
  fromY: number;
  toY: number;
  angle: number;
  color: string;
  thicknessOverride?: number;
  transparent?: boolean;
  opacity?: number;
}) {
  const h = toY - fromY;
  if (h <= 0.01 || width <= 0.01) return null;
  // Center along the wall direction.
  const cx = wall.start.x + Math.cos(angle) * positionAlong;
  const cy = wall.start.y + Math.sin(angle) * positionAlong;
  const thickness = thicknessOverride ?? wall.thickness;
  return (
    <mesh
      position={[cx, fromY + h / 2, cy]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[width, h, thickness]} />
      <meshStandardMaterial
        color={color}
        roughness={0.7}
        transparent={transparent ?? false}
        opacity={opacity ?? 1}
      />
    </mesh>
  );
}

// Glazed window in the wall plane: a tinted glass pane behind a white sash
// frame, with muntin/rail bars that identify the window type — a horizontal
// meeting rail for double-hung, a center mullion for sliding/wide casement,
// a near-top bar for awning. `fixed` is left as plain glass in its frame.
function WindowGlazing({ wall, windowType, positionAlong, width, bottomY, topY, angle }: {
  wall: Wall;
  windowType: import('../engine/types').WindowType;
  positionAlong: number;
  width: number;
  bottomY: number;
  topY: number;
  angle: number;
}) {
  const FRAME = 2;      // sash frame band, inches
  const FRAME_T = 1.6;  // frame thickness across the wall
  const GLASS_T = 1.0;
  const BAR = 1.6;      // muntin / meeting-rail width

  const w = width, h = topY - bottomY;
  if (w <= 0.01 || h <= 0.01) return null;
  const cx = wall.start.x + Math.cos(angle) * positionAlong;
  const cy = wall.start.y + Math.sin(angle) * positionAlong;
  const midY = (bottomY + topY) / 2;
  const glassW = Math.max(0.5, w - 2 * FRAME);
  const glassH = Math.max(0.5, h - 2 * FRAME);

  const frame = (key: string, lx: number, ly: number, bw: number, bh: number) => (
    <mesh key={key} position={[lx, ly, 0]} castShadow>
      <boxGeometry args={[bw, bh, FRAME_T]} />
      <meshStandardMaterial color={TRIM_COLOR} roughness={0.6} />
    </mesh>
  );

  return (
    <group position={[cx, midY, cy]} rotation={[0, -angle, 0]}>
      {/* Glass pane */}
      <mesh castShadow>
        <boxGeometry args={[glassW, glassH, GLASS_T]} />
        <meshStandardMaterial
          color={WINDOW_GLASS_COLOR}
          roughness={0.2}
          metalness={0.1}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Perimeter sash frame */}
      {frame('top', 0, h / 2 - FRAME / 2, w, FRAME)}
      {frame('bot', 0, -h / 2 + FRAME / 2, w, FRAME)}
      {frame('lft', -w / 2 + FRAME / 2, 0, FRAME, glassH)}
      {frame('rgt', w / 2 - FRAME / 2, 0, FRAME, glassH)}
      {/* Type-specific divider bars */}
      {windowType === 'double-hung' && frame('rail', 0, 0, glassW, BAR)}
      {(windowType === 'sliding' || (windowType === 'casement' && w > 36)) &&
        frame('mull', 0, 0, BAR, glassH)}
      {windowType === 'awning' && frame('awn', 0, h / 2 - FRAME - 3, glassW, BAR)}
    </group>
  );
}

function DoorSlab({ door, wall, elevation, angle }: {
  door: import('../engine/types').Door;
  wall: Wall;
  elevation: number;
  angle: number;
}) {
  // Swung door: thin slab hinged at one jamb. The slab mesh extends from local
  // x=0 (hinge) to x=+door.width along local +X. We pick the rotation so that
  // closed (openAngle=0) → slab lies parallel to the wall, pointing from hinge
  // toward the other jamb; open 90° → slab is perpendicular to the wall.
  const openRad = (door.openAngle * Math.PI) / 180;
  const hingeAtStart = door.hingeSide === 'start';
  const hingeAlong = hingeAtStart
    ? door.positionAlong - door.width / 2
    : door.positionAlong + door.width / 2;
  const hx = wall.start.x + Math.cos(angle) * hingeAlong;
  const hy = wall.start.y + Math.sin(angle) * hingeAlong;
  // Closed orientation points from the hinge toward the other jamb (along
  // ±wall direction). When hingeAtStart, that's +wall (angle); else -wall.
  const closedRot = hingeAtStart ? angle : angle + Math.PI;
  // Swing direction (which side of the wall the slab rotates toward) flips on
  // hingeSide and on `flipped` — XOR gives the consistent sign convention.
  const swingSign = (hingeAtStart !== !!door.flipped) ? 1 : -1;
  const totalRot = closedRot + swingSign * openRad;
  return (
    <group position={[hx, elevation + door.height / 2, hy]} rotation={[0, -totalRot, 0]}>
      <mesh position={[door.width / 2, 0, 0]} castShadow>
        <boxGeometry args={[door.width, door.height, 1.5]} />
        <meshStandardMaterial color={doorSlabColor(door.doorType)} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Bifold closet door — accordion panels folded slightly toward the open side,
// matching the 2D chevron plan symbol. A "single" (opening < 36") is one
// 2-panel chevron; a "double" (>= 36") is two chevrons folding toward the
// center, each anchored at a jamb. Rendered closed-but-ajar so the fold reads.
function BifoldDoorSlab({ door, wall, elevation, angle }: {
  door: import('../engine/types').Door;
  wall: Wall;
  elevation: number;
  angle: number;
}) {
  const PANEL_T = 1.2;             // panel thickness across the opening
  const w = door.width;
  const flipSign = door.flipped ? -1 : 1;
  const cx = wall.start.x + Math.cos(angle) * door.positionAlong;
  const cy = wall.start.y + Math.sin(angle) * door.positionAlong;
  const yMid = elevation + door.height / 2;

  // A chevron is a pair of flat panels meeting at a peak pushed `peakZ` toward
  // the open side. Given the two jamb-anchored endpoints along local X and the
  // peak depth in Z, emit the two panels (each a thin vertical box).
  const isDouble = w >= 36;
  const chevrons: { fixedX: number; tipX: number; peakZ: number }[] = [];
  if (isDouble) {
    const halfW = w / 2;
    const centerGap = Math.min(halfW * 0.18, 8);
    const chevronLen = halfW - centerGap / 2;
    const peakZ = flipSign * chevronLen * 0.5;
    chevrons.push({ fixedX: -halfW, tipX: -centerGap / 2, peakZ });
    chevrons.push({ fixedX: halfW, tipX: centerGap / 2, peakZ });
  } else {
    const hingeSign = door.hingeSide === 'start' ? -1 : 1;
    chevrons.push({ fixedX: hingeSign * (w / 2), tipX: -hingeSign * (w / 2), peakZ: flipSign * w * 0.42 });
  }

  return (
    <group position={[cx, yMid, cy]} rotation={[0, -angle, 0]}>
      {chevrons.map((c, ci) => {
        const peakX = (c.fixedX + c.tipX) / 2;
        const segs: [number, number, number, number][] = [
          [c.fixedX, 0, peakX, c.peakZ],   // jamb panel
          [peakX, c.peakZ, c.tipX, 0],     // tip panel
        ];
        return segs.map(([x1, z1, x2, z2], si) => {
          const len = Math.hypot(x2 - x1, z2 - z1);
          const a = Math.atan2(z2 - z1, x2 - x1);
          return (
            <mesh
              key={`${ci}-${si}`}
              position={[(x1 + x2) / 2, 0, (z1 + z2) / 2]}
              rotation={[0, -a, 0]}
              castShadow
            >
              <boxGeometry args={[len, door.height, PANEL_T]} />
              <meshStandardMaterial color={DOOR_SLAB_INTERIOR} roughness={0.6} />
            </mesh>
          );
        });
      })}
    </group>
  );
}

// Sliding door — rendered as a closed glass patio door: full-opening glass
// pane in the wall plane, a thin top + bottom rail, and a center mullion
// where the two panels meet. We don't try to depict the door "open" — sliders
// are visually identified by being glass, not by being half-open.
function SlidingDoorSlab({ door, wall, elevation, angle }: {
  door: import('../engine/types').Door;
  wall: Wall;
  elevation: number;
  angle: number;
}) {
  const RAIL = 2;          // top/bottom rail height, inches
  const MULLION = 1.5;     // center mullion width, inches
  const PANE_T = 1.0;      // glass pane thickness across wall
  const FRAME_T = PANE_T + 0.5;

  const cx = wall.start.x + Math.cos(angle) * door.positionAlong;
  const cy = wall.start.y + Math.sin(angle) * door.positionAlong;
  const yMid = elevation + door.height / 2;
  const w = door.width;
  const h = door.height;

  return (
    <group position={[cx, yMid, cy]} rotation={[0, -angle, 0]}>
      {/* Glass pane filling the whole opening (between top/bottom rails) */}
      <mesh castShadow>
        <boxGeometry args={[w - MULLION, h - 2 * RAIL, PANE_T]} />
        <meshStandardMaterial
          color={WINDOW_GLASS_COLOR}
          roughness={0.2}
          metalness={0.1}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Top rail */}
      <mesh position={[0, h / 2 - RAIL / 2, 0]} castShadow>
        <boxGeometry args={[w, RAIL, FRAME_T]} />
        <meshStandardMaterial color={DOOR_FRAME_COLOR} roughness={0.6} />
      </mesh>
      {/* Bottom rail */}
      <mesh position={[0, -h / 2 + RAIL / 2, 0]} castShadow>
        <boxGeometry args={[w, RAIL, FRAME_T]} />
        <meshStandardMaterial color={DOOR_FRAME_COLOR} roughness={0.6} />
      </mesh>
      {/* Center mullion between the two panels */}
      <mesh castShadow>
        <boxGeometry args={[MULLION, h, FRAME_T]} />
        <meshStandardMaterial color={DOOR_FRAME_COLOR} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Bay window — projects OUTWARD from the wall on the flipped side, forming a
// trapezoid in plan: center pane parallel to wall + two angled side panes.
// Footprint matches the 2D `drawBayWindow` (sideInset = min(w*0.3, proj*0.6)).
//
// Geometry is built in a LOCAL frame where +X = along wall, +Y = up, and +Z =
// outward on the bay side (sign baked into the vertex coords via `zSign`).
// A wrapping <group> applies the world-space rotation and translation, so all
// the math stays in 2D until rendering.
//
// Built pieces:
//   - Sloped roof wedge (BufferGeometry): trapezoid soffit at the head, ridge
//     line along the wall at +RISE — gives the classic bay hood that ties
//     back to the house.
//   - Flat trapezoidal sill prism (BufferGeometry) under the glass.
//   - 3 glass panes (center + 2 angled) shrunk vertically to leave room for
//     chunky top and bottom rails matching each pane's footprint.
//   - 4 vertical mullions at the trapezoid corners.
function BayWindow({ window: win, wall, elevation, angle }: {
  window: WinType;
  wall: Wall;
  elevation: number;
  angle: number;
}) {
  const projection = win.bayProjection ?? 18;
  const w = win.width;
  const sideInset = Math.min(w * 0.30, projection * 0.6);
  const sill = win.headHeight - win.height;
  const bottomY = elevation + sill;
  const topY = elevation + win.headHeight;
  const flipSign = win.flipped ? -1 : 1;

  const baseOff = wall.thickness / 2;
  const tipOff  = baseOff + projection;
  const cx = wall.start.x + Math.cos(angle) * win.positionAlong;
  const cy = wall.start.y + Math.sin(angle) * win.positionAlong;

  // ── Local-frame trapezoid corners (+X = wall dir, +Z = outward on bay side)
  const zSign = flipSign;
  const xBL = -w / 2,  xBR = +w / 2;
  const xFLT = -w / 2 + sideInset,  xFRT = +w / 2 - sideInset;
  const zBack  = baseOff * zSign;
  const zFront = tipOff  * zSign;

  // ── Frame proportions
  const FRAME_W = 4;          // mullion / rail thickness (chunky white)
  const RAIL_H  = 4;          // horizontal head and seat rail height
  const PANE_T  = 1.0;        // glass thickness
  const SILL_T  = 5;          // sill slab thickness
  const RISE    = Math.max(8, projection * 0.6);
  const ridgeY  = topY + RISE;
  const sillBottomY = bottomY - SILL_T;

  const glassBottomY = bottomY + RAIL_H;
  const glassTopY    = topY    - RAIL_H;
  const glassH       = Math.max(0.1, glassTopY - glassBottomY);
  const glassMidY    = (glassBottomY + glassTopY) / 2;

  // ── Pane footprints (shared by glass + top and bottom rails)
  const sideLen = Math.hypot(sideInset, projection);
  // Left pane direction = (sideInset, projection*zSign) in (x, z) local.
  // After rotation around Y by `rotY`, a box's local +X aligns with that dir
  // when `rotY = -atan2(dz, dx)`.
  const leftRotY  = -Math.atan2(projection * zSign,  sideInset);
  const rightRotY = -Math.atan2(projection * zSign, -sideInset);
  const panes = [
    { label: 'center', x: 0,                      z: zFront,                len: w - 2 * sideInset, rotY: 0 },
    { label: 'left',   x: (xBL + xFLT) / 2,       z: (zBack + zFront) / 2,  len: sideLen,           rotY: leftRotY },
    { label: 'right',  x: (xBR + xFRT) / 2,       z: (zBack + zFront) / 2,  len: sideLen,           rotY: rightRotY },
  ];

  // ── Sloped HIP roof wedge (6 vertices: trapezoid soffit + SHORT inset ridge)
  // The ridge ends are inset to match the front-tip inset (xFLT / xFRT), so the
  // roof tapers from all four sides toward a shorter ridge — a classic hipped
  // bay roof. With this, the front slope becomes a rectangle and the LEFT /
  // RIGHT faces are triangles that hip inward from the back-outer corners.
  //
  // Eave overhang: expand the soffit trapezoid by EAVE inches PERPENDICULAR to
  // each outward edge (front + two angled sides), by intersecting the shifted
  // edge lines. Back corners slide along ±X to keep the side overhang uniform
  // perpendicular to the angled walls; back edge itself stays at the wall.
  // Derivation: for an edge with direction (sideInset, projection) shifted by
  // EAVE in its outward normal, the back-corner offset along ±X works out to
  // EAVE * sideLen / projection, and the front-corner offset along ±X works
  // out to EAVE * (sideLen - sideInset) / projection. The front edge shifts
  // outward by EAVE along the wall normal (±Z via zSign).
  const EAVE = 5;
  const backEaveX  = EAVE * sideLen / projection;
  const frontEaveX = EAVE * (sideLen - sideInset) / projection;
  const xBL_e  = xBL  - backEaveX;
  const xBR_e  = xBR  + backEaveX;
  const xFLT_e = xFLT - frontEaveX;
  const xFRT_e = xFRT + frontEaveX;
  const zFront_e = zFront + EAVE * zSign;
  const roofGeom = useMemo(() => {
    const positions = new Float32Array([
      xBL_e,  topY,   zBack,     // 0: BL  (back-left, low, eave-expanded along X)
      xBR_e,  topY,   zBack,     // 1: BR  (back-right, low, eave-expanded along X)
      xFLT_e, topY,   zFront_e,  // 2: FLT (front-left-tip, low, eave-expanded)
      xFRT_e, topY,   zFront_e,  // 3: FRT (front-right-tip, low, eave-expanded)
      xFLT,   ridgeY, zBack,     // 4: RL  (ridge-left at wall, high — INSET, unchanged)
      xFRT,   ridgeY, zBack,     // 5: RR  (ridge-right at wall, high — INSET, unchanged)
    ]);
    // Face winding CCW viewed from outside. When the bay flips to the -Z side
    // (`zSign = -1`), the outside direction reverses, so reverse the winding.
    const base = [
      // Soffit (faces -Y): from below CCW
      1, 3, 2,  1, 2, 0,
      // Front slope rectangle (faces outward+up): FLT→FRT→RR→RL
      2, 3, 5,  2, 5, 4,
      // Left hip triangle (faces -X): BL→FLT→RL CCW from -X
      0, 2, 4,
      // Right hip triangle (faces +X): BR→RR→FRT CCW from +X
      1, 5, 3,
      // Back wall trapezoid (faces -outward into wall): BL→RL→RR→BR
      0, 4, 5,  0, 5, 1,
    ];
    const indices = zSign === 1 ? base : reverseWinding(base);
    return makeBufferGeometry(positions, indices);
  }, [xBL_e, xBR_e, xFLT_e, xFRT_e, xFLT, xFRT, zBack, zFront_e, topY, ridgeY, zSign]);

  // ── Flat trapezoidal sill prism (8 vertices: top trapezoid + bottom trapezoid)
  const sillGeom = useMemo(() => {
    const positions = new Float32Array([
      xBL,  sillBottomY, zBack,    // 0: bot BL
      xBR,  sillBottomY, zBack,    // 1: bot BR
      xFLT, sillBottomY, zFront,   // 2: bot FLT
      xFRT, sillBottomY, zFront,   // 3: bot FRT
      xBL,  bottomY,     zBack,    // 4: top BL
      xBR,  bottomY,     zBack,    // 5: top BR
      xFLT, bottomY,     zFront,   // 6: top FLT
      xFRT, bottomY,     zFront,   // 7: top FRT
    ]);
    const base = [
      // Top (faces +Y): 4→6→7→5 CCW from above
      4, 6, 7,  4, 7, 5,
      // Bottom (faces -Y): from below CCW
      0, 3, 2,  0, 1, 3,
      // Front slope (faces outward): 2→3→7→6
      2, 3, 7,  2, 7, 6,
      // Left slope (faces -X + outward): 0→4→6→2
      0, 4, 6,  0, 6, 2,
      // Right slope (faces +X + outward): 1→3→7→5
      1, 3, 7,  1, 7, 5,
      // Back face (faces -outward into wall): 0→1→5→4
      0, 1, 5,  0, 5, 4,
    ];
    const indices = zSign === 1 ? base : reverseWinding(base);
    return makeBufferGeometry(positions, indices);
  }, [xBL, xBR, xFLT, xFRT, zBack, zFront, sillBottomY, bottomY, zSign]);

  const mullionH = topY - bottomY;
  const mullionMidY = (bottomY + topY) / 2;

  return (
    <group position={[cx, 0, cy]} rotation={[0, -angle, 0]}>
      {/* Glass panes (shrunk vertically to leave room for chunky head and seat rails) */}
      {panes.map(p => (
        <mesh key={`pane-${p.label}`} position={[p.x, glassMidY, p.z]} rotation={[0, p.rotY, 0]} castShadow>
          <boxGeometry args={[p.len, glassH, PANE_T]} />
          <meshStandardMaterial color={WINDOW_GLASS_COLOR} transparent opacity={0.55} roughness={0.2} metalness={0.1} />
        </mesh>
      ))}

      {/* Head rails — chunky white band at the top of each pane */}
      {panes.map(p => (
        <mesh key={`head-${p.label}`} position={[p.x, topY - RAIL_H / 2, p.z]} rotation={[0, p.rotY, 0]} castShadow>
          <boxGeometry args={[p.len, RAIL_H, FRAME_W]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.7} />
        </mesh>
      ))}
      {/* Seat rails — chunky white band at the bottom of each pane */}
      {panes.map(p => (
        <mesh key={`seat-${p.label}`} position={[p.x, bottomY + RAIL_H / 2, p.z]} rotation={[0, p.rotY, 0]} castShadow>
          <boxGeometry args={[p.len, RAIL_H, FRAME_W]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.7} />
        </mesh>
      ))}

      {/* Vertical mullions at the 4 trapezoid corners */}
      {[
        [xBL,  zBack],
        [xBR,  zBack],
        [xFLT, zFront],
        [xFRT, zFront],
      ].map(([mx, mz], i) => (
        <mesh key={`mull-${i}`} position={[mx, mullionMidY, mz]} castShadow>
          <boxGeometry args={[FRAME_W, mullionH, FRAME_W]} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.7} />
        </mesh>
      ))}

      {/* Sloped roof wedge (hood that ties back into the house) */}
      <mesh geometry={roofGeom} castShadow receiveShadow>
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.75} />
      </mesh>

      {/* Flat trapezoidal sill prism */}
      <mesh geometry={sillGeom} castShadow receiveShadow>
        <meshStandardMaterial color={TRIM_COLOR} roughness={0.75} />
      </mesh>
    </group>
  );
}

// Reverse the winding of each triangle so face normals flip (used when the
// bay's outward axis points along local -Z instead of +Z).
function reverseWinding(indices: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    out.push(indices[i], indices[i + 2], indices[i + 1]);
  }
  return out;
}

function makeBufferGeometry(positions: Float32Array, indices: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ─── Roof ──────────────────────────────────────────────────────────────────────
// The 3D roof is sampled from the SAME topology the Roof Plan / elevations /
// sections use. `roofHeightAt(topology, p)` is the canonical roof height above
// the wall plate at any plan point (max over the drawn ridges, gable endpoints
// terminating the slope, hip endpoints continuing it past). We lift a grid over
// the eave polygon by that function to get the slope surface, and fill a
// triangular gable wall under each gable-type ridge end.

const ROOF_GRID_STEP = 6; // inches between height samples
const FASCIA_DEPTH = 8;   // inches the fascia board drops below the roof edge

type Poly = { x: number; y: number }[];

// Distance from a plan point to the nearest edge of a polygon.
function distToPolygon(p: { x: number; y: number }, poly: Poly): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const cx = a.x + t * dx, cy = a.y + t * dy;
    best = Math.min(best, Math.hypot(p.x - cx, p.y - cy));
  }
  return best;
}

// Force any ridge endpoint that sits on/at a higher tier's wall to be a GABLE
// end, so the lower roof terminates there (dies into the taller wall) instead
// of continuing past as a hip. Returns the topology unchanged when there are no
// higher tiers (top floor / single story) — protects the known-good cases.
function gableizeAgainstHigher(topology: RoofTopology, higherWalls: Poly[]): RoofTopology {
  if (!higherWalls.length) return topology;
  const TOL = 8; // inches — endpoint within this of a higher wall ⇒ gable
  const atHigherWall = (pt: { x: number; y: number }) =>
    higherWalls.some(poly => pointInPolygon(pt, poly) || distToPolygon(pt, poly) < TOL);
  return {
    ...topology,
    ridges: topology.ridges.map(r => ({
      ...r,
      endA: atHigherWall(r.a) ? 'gable' as const : r.endA,
      endB: atHigherWall(r.b) ? 'gable' as const : r.endB,
    })),
  };
}

function RoofTierMesh({ topology, baseY, coveredWall, coveredEave }: {
  topology: RoofTopology; baseY: number; coveredWall: Poly[]; coveredEave: Poly[];
}) {
  const geom = useMemo(
    () => buildRoofSurface(topology, baseY, coveredWall, coveredEave),
    [topology, baseY, coveredWall, coveredEave],
  );
  if (!geom) return null;
  return (
    <group>
      <mesh geometry={geom.slopes} castShadow receiveShadow>
        <meshStandardMaterial color={ROOF_COLOR} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {geom.gables && (
        <mesh geometry={geom.gables} castShadow receiveShadow>
          <meshStandardMaterial color={WALL_COLOR.exterior} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}
      {geom.trim && (
        <mesh geometry={geom.trim} castShadow receiveShadow>
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// Build the roof slope surface (a height-field over the eave polygon), the gable
// end walls, and the soffit + fascia trim along the eave. Returns null when
// there's no drawn roof. Plan X→3D x, plan Y→3D z, height→3D y.
//
// `coveredWall` / `coveredEave` are the wall-outer / eave polygons of HIGHER
// tiers. Area inside a higher WALL gets no lower roof (the lower roof dies into
// that wall). In the ring between a higher wall and its eave, the lower roof is
// kept only where it's genuinely high (a wing rising into the wall) and dropped
// where it's a low flat sliver (the stray band around the upper block). The eave
// height is clamped at the bottom so a point just outside a ridge's reach drips
// to the eave line instead of plunging.
function buildRoofSurface(topology: RoofTopology, baseY: number, coveredWall: Poly[], coveredEave: Poly[]):
  { slopes: THREE.BufferGeometry; gables: THREE.BufferGeometry | null; trim: THREE.BufferGeometry | null } | null {
  const eave = topology.eave;
  if (!topology.hasRoof || !eave || eave.length < 3) return null;

  const pitchRR = topology.pitch / 12;
  // Deepest the roof surface may dip (the eave drip + a margin for hip corners).
  const eaveFloorY = baseY - topology.overhang * pitchRR * 1.6 - 1;
  const inEave = (x: number, z: number) => coveredEave.some(poly => pointInPolygon({ x, y: z }, poly));
  // Under a higher tier's WALL — the lower roof stops here (dies into that wall)
  // rather than continuing under it. (No tuck-under: a tuck would poke out below
  // the taller wall at the first-floor eave, since the wall only exists above
  // the upper floor.)
  const inWall = (x: number, z: number) => coveredWall.some(poly => pointInPolygon({ x, y: z }, poly));
  // Skip the trim/gable edges that are buried under a higher tier's eave.
  const inCovered = inEave;

  // Height sampler that EXTENDS each ridge past its GABLE ends by the overhang,
  // so the rake-overhang strip (just outside the ridge tip, where the canonical
  // roofHeightAt returns null) still has a proper sloped height. Without this
  // the rake edge flattens — the gable wall gets draped over and the rake fascia
  // can't follow the slope. Hip ends are left as-is (they already continue past
  // via euclidean distance). Returns height above the plate, or null if no
  // ridge covers the point.
  const ext = topology.overhang + 6;
  const extRidges = topology.ridges.map(r => {
    const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    return {
      ax: r.endA === 'gable' ? r.a.x - ux * ext : r.a.x,
      ay: r.endA === 'gable' ? r.a.y - uy * ext : r.a.y,
      bx: r.endB === 'gable' ? r.b.x + ux * ext : r.b.x,
      by: r.endB === 'gable' ? r.b.y + uy * ext : r.b.y,
      endA: r.endA, endB: r.endB, h: r.heightAboveWalls,
    };
  });
  const heightAt = (x: number, z: number): number | null => {
    let best = -Infinity;
    for (const r of extRidges) {
      const dx = r.bx - r.ax, dy = r.by - r.ay, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const t = (x - r.ax) * ux + (z - r.ay) * uy;
      let d: number;
      if (t < 0) d = r.endA === 'gable' ? Infinity : Math.hypot(x - r.ax, z - r.ay);
      else if (t > L) d = r.endB === 'gable' ? Infinity : Math.hypot(x - r.bx, z - r.by);
      else d = Math.abs((x - r.ax) * -uy + (z - r.ay) * ux);
      if (!Number.isFinite(d)) continue;
      const h = r.h - d * pitchRR;
      if (h > best) best = h;
    }
    return Number.isFinite(best) ? best : null;
  };

  // Roof Y at a plan point. FINITE height (incl. the negative eave drip) is
  // clamped so it can't plunge; null (outside every ridge's reach) → plate.
  const yAtPlan = (x: number, z: number) => {
    const h = heightAt(x, z);
    if (h == null) return baseY;
    return Math.max(eaveFloorY, baseY + h);
  };

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of eave) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
  }
  const width = maxX - minX, depth = maxZ - minZ;
  if (width <= 0 || depth <= 0) return null;

  const nx = Math.max(1, Math.round(width / ROOF_GRID_STEP));
  const nz = Math.max(1, Math.round(depth / ROOF_GRID_STEP));
  const hx = width / nx, hz = depth / nz;

  // Vertex grid (some verts unused by skipped cells — harmless).
  const positions = new Float32Array((nx + 1) * (nz + 1) * 3);
  for (let gz = 0; gz <= nz; gz++) {
    for (let gx = 0; gx <= nx; gx++) {
      const i = (gz * (nx + 1) + gx) * 3;
      const x = minX + gx * hx, z = minZ + gz * hz;
      positions[i]     = x;
      positions[i + 1] = yAtPlan(x, z);
      positions[i + 2] = z;
    }
  }
  // Emit two triangles per cell that is: inside the eave polygon, NOT under a
  // higher wall, under a roof at all four corners (non-null — past a gable end
  // there's no roof, and skipping those keeps the roof from draping a cliff over
  // the gable wall), and — if it sits in a higher tier's eave-overhang ring —
  // genuinely high (so a wing dies into the taller wall but the low stray band
  // around the rest of the upper block is dropped).
  const hasRoofAt = (x: number, z: number) => heightAt(x, z) != null;
  const roofed = new Set<number>(); // gz*nx+gx for every emitted cell
  const indices: number[] = [];
  for (let gz = 0; gz < nz; gz++) {
    for (let gx = 0; gx < nx; gx++) {
      const cx = minX + (gx + 0.5) * hx, cz = minZ + (gz + 0.5) * hz;
      // Render where there's roof: inside the eave outline and NOT under a
      // higher tier's WALL. (Being under the higher tier's eave OVERHANG is
      // fine — the lower roof legitimately tucks under it.) The stray band that
      // used to appear around the far sides of the upper block is excluded for
      // free by the corner-null test below: it's past the ridge's reach.
      if (!pointInPolygon({ x: cx, y: cz }, eave) || inWall(cx, cz)) continue;
      const x0 = minX + gx * hx, x1 = minX + (gx + 1) * hx;
      const z0 = minZ + gz * hz, z1 = minZ + (gz + 1) * hz;
      if (!hasRoofAt(x0, z0) || !hasRoofAt(x1, z0) || !hasRoofAt(x0, z1) || !hasRoofAt(x1, z1)) continue;
      const a = gz * (nx + 1) + gx;
      const b = a + 1;
      const c = a + (nx + 1);
      const d = c + 1;
      indices.push(a, c, b,  b, c, d);
      roofed.add(gz * nx + gx);
    }
  }
  const slopes = makeBufferGeometry(positions, indices);

  const wo = topology.wallOuter;

  // Gable / end walls — vertical siding fill from the plate (baseY) up to the
  // roof underside, SAMPLED along each wall edge. Where the roof rises at the
  // wall (a gable end) this fills the gable triangle; along an eave or a hip the
  // roof meets the wall at ~plate height so nothing fills. Sampling the roof
  // height directly (instead of classifying ridge endpoints) is robust and
  // symmetric — every gable end gets its wall, both east and west.
  const wallTopAt = (x: number, z: number) => baseY + Math.max(0, heightAt(x, z) ?? 0);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const gablePos: number[] = [];
  if (wo && wo.length === eave.length) {
    const n = wo.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeLen = Math.hypot(wo[j].x - wo[i].x, wo[j].y - wo[i].y);
      const segs = Math.max(1, Math.round(edgeLen / ROOF_GRID_STEP));
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const p0x = lerp(wo[i].x, wo[j].x, t0), p0z = lerp(wo[i].y, wo[j].y, t0);
        const p1x = lerp(wo[i].x, wo[j].x, t1), p1z = lerp(wo[i].y, wo[j].y, t1);
        // Skip a segment only if THIS WALL is under a higher tier's WALL (truly
        // covered). Being under its eave OVERHANG must NOT skip it — that strip
        // is still a real gable face (the hole was here).
        if (inWall((p0x + p1x) / 2, (p0z + p1z) / 2)) continue;
        const h0 = wallTopAt(p0x, p0z), h1 = wallTopAt(p1x, p1z);
        if (h0 <= baseY + 0.5 && h1 <= baseY + 0.5) continue; // eave/hip: nothing to fill
        gablePos.push(
          p0x, baseY, p0z,  p1x, baseY, p1z,  p1x, h1, p1z,
          p0x, baseY, p0z,  p1x, h1, p1z,  p0x, h0, p0z,
        );
      }
    }
  }
  // Junction end walls — where this tier's roof dies into a HIGHER tier's wall,
  // its end is open (that wall isn't on this tier's own perimeter), leaving a
  // hole. Close it by filling along the higher tier's wall up to the lower roof
  // height. (Coincides with the taller wall — same siding color, so no seam.)
  for (const hw of coveredWall) {
    const n = hw.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const edgeLen = Math.hypot(hw[j].x - hw[i].x, hw[j].y - hw[i].y);
      const segs = Math.max(1, Math.round(edgeLen / ROOF_GRID_STEP));
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const p0x = lerp(hw[i].x, hw[j].x, t0), p0z = lerp(hw[i].y, hw[j].y, t0);
        const p1x = lerp(hw[i].x, hw[j].x, t1), p1z = lerp(hw[i].y, hw[j].y, t1);
        const h0 = wallTopAt(p0x, p0z), h1 = wallTopAt(p1x, p1z);
        if (h0 <= baseY + 0.5 && h1 <= baseY + 0.5) continue; // lower roof not here
        gablePos.push(
          p0x, baseY, p0z,  p1x, baseY, p1z,  p1x, h1, p1z,
          p0x, baseY, p0z,  p1x, h1, p1z,  p0x, h0, p0z,
        );
      }
    }
  }
  const gables = gablePos.length ? makeNonIndexedGeometry(gablePos) : null;

  // Soffit + fascia — derived from the RENDERED roof itself, not the footprint
  // polygon. Every roofed grid cell that borders OPEN AIR (a neighbour that is
  // neither roofed nor under/near a higher tier) has an eave/rake there, so we
  // hang a fascia board from the roof edge and run a soffit back to the wall.
  // A cell bordering the floor above (the roof dies into a taller wall) gets no
  // fascia. This follows wherever the roof genuinely ends — robust for any
  // footprint, setback, reflex corner, or L/T/U plan.
  const vY = (vx: number, vz: number) => positions[(vz * (nx + 1) + vx) * 3 + 1];
  // Is the cell (gx,gz) open air on the far side of a roof edge? Open unless the
  // roof there dies into a higher tier's WALL. Being merely under a higher
  // tier's eave OVERHANG does NOT suppress fascia — the lower eave is a real
  // roof edge with the upper overhang floating well above it.
  const isAir = (gx: number, gz: number) => {
    if (gx < 0 || gx >= nx || gz < 0 || gz >= nz) return true;   // off-grid = open
    if (roofed.has(gz * nx + gx)) return false;                  // roof continues
    const cx = minX + (gx + 0.5) * hx, cz = minZ + (gz + 0.5) * hz;
    return !inWall(cx, cz);                                      // air unless under a higher WALL
  };
  const trimPos: number[] = [];
  // Add fascia + soffit for one cell edge: roof-edge vertices A→B (grid indices)
  // with `inward` (unit, world) pointing back toward the wall.
  const addTrim = (vax: number, vaz: number, vbx: number, vbz: number, iwx: number, iwz: number) => {
    const ax = minX + vax * hx, az = minZ + vaz * hz, ay = vY(vax, vaz);
    const bx = minX + vbx * hx, bz = minZ + vbz * hz, by = vY(vbx, vbz);
    const aB = ay - FASCIA_DEPTH, bB = by - FASCIA_DEPTH;
    trimPos.push(
      ax, ay, az,  bx, by, bz,  bx, bB, bz,
      ax, ay, az,  bx, bB, bz,  ax, aB, az,
    );
    const sx = iwx * topology.overhang, sz = iwz * topology.overhang;
    trimPos.push(
      ax, aB, az,  bx, bB, bz,  bx + sx, bB, bz + sz,
      ax, aB, az,  bx + sx, bB, bz + sz,  ax + sx, aB, az + sz,
    );
  };
  for (const key of roofed) {
    const gx = key % nx, gz = (key - gx) / nx;
    if (isAir(gx - 1, gz)) addTrim(gx, gz, gx, gz + 1, 1, 0);       // west edge
    if (isAir(gx + 1, gz)) addTrim(gx + 1, gz, gx + 1, gz + 1, -1, 0); // east edge
    if (isAir(gx, gz - 1)) addTrim(gx, gz, gx + 1, gz, 0, 1);       // north edge
    if (isAir(gx, gz + 1)) addTrim(gx, gz + 1, gx + 1, gz + 1, 0, -1); // south edge
  }

  // Gable returns — a short horizontal cornice box at each gable end's bottom
  // corners, so the rake doesn't die to a sharp point (matches the elevations).
  // Built from the topology's gable ends, skipped where a gable dies into a
  // taller floor (it'd be hidden there).
  const RETURN_LEN = 18;
  const ohang = topology.overhang;
  for (const r of topology.ridges) {
    const dx = r.b.x - r.a.x, dy = r.b.y - r.a.y, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;     // along ridge a→b
    const px = -uy, py = ux;            // perpendicular
    for (const e of [{ pt: r.a, kind: r.endA, sgn: 1 }, { pt: r.b, kind: r.endB, sgn: -1 }]) {
      if (e.kind !== 'gable') continue;
      const ix = ux * e.sgn, iz = uy * e.sgn;        // inward, along the ridge
      for (const side of [r.spanLeft, -r.spanRight]) {
        if (Math.abs(side) < 1) continue;
        const ss = Math.sign(side);
        // Corner at the ROOF end (the eave, one overhang past the wall), not the
        // wall itself — so the return lines up with the edge of the roof.
        const sEave = side + ss * ohang;
        const cx = e.pt.x + px * sEave, cz = e.pt.y + py * sEave;
        // Every gable end gets a return — including the ones that butt into the
        // taller floor (they sit under its roof overhang and should still close off).
        const wx = -px * ss, wz = -py * ss;                       // perpendicular, toward the wall
        const yT = yAtPlan(cx, cz);                               // eave height at the corner
        const yB = yT - FASCIA_DEPTH;
        const ax = cx, az = cz;
        const bx = cx + ix * RETURN_LEN, bz = cz + iz * RETURN_LEN;
        const dxw = bx + wx * ohang, dzw = bz + wz * ohang;
        const exw = ax + wx * ohang, ezw = az + wz * ohang;
        trimPos.push(ax, yT, az, bx, yT, bz, dxw, yT, dzw,  ax, yT, az, dxw, yT, dzw, exw, yT, ezw); // top
        trimPos.push(ax, yB, az, bx, yB, bz, dxw, yB, dzw,  ax, yB, az, dxw, yB, dzw, exw, yB, ezw); // soffit
        trimPos.push(ax, yT, az, exw, yT, ezw, exw, yB, ezw,  ax, yT, az, exw, yB, ezw, ax, yB, az); // fascia (gable-end face)
      }
    }
  }
  const trim = trimPos.length ? makeNonIndexedGeometry(trimPos) : null;

  return { slopes, gables, trim };
}

function makeNonIndexedGeometry(positions: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  g.computeVertexNormals();
  return g;
}

// Trim casing around an opening — thin proud-of-wall band on BOTH wall faces.
// Doors get a 3-sided U (top + two legs); windows get a 4-sided frame (also
// includes the sill band). Sized from the opening CUT width so entry doors
// with sidelights are framed correctly across the full opening.
//
// `skipFace` (-1 or +1) skips one wall-face side — used for bay windows so the
// outside header doesn't poke past the bay's own roof soffit; the bay
// provides its own outside framing.
function OpeningTrim({ wall, positionAlong, cutWidth, bottomY, topY, angle, includeBottom, skipFace = 0 }: {
  wall: Wall;
  positionAlong: number;
  cutWidth: number;
  bottomY: number;
  topY: number;
  angle: number;
  includeBottom: boolean;
  skipFace?: -1 | 0 | 1;
}) {
  const TRIM_W = 3;      // casing band width, inches
  const TRIM_T = 0.75;   // casing depth proud of wall, inches

  const openingH = topY - bottomY;
  if (openingH <= 0.01 || cutWidth <= 0.01) return null;

  // Cut center in world plan coords.
  const cx = wall.start.x + Math.cos(angle) * positionAlong;
  const cy = wall.start.y + Math.sin(angle) * positionAlong;
  // Wall normal (perpendicular to wall direction, in plan).
  const nx = -Math.sin(angle);
  const ny =  Math.cos(angle);
  // Wall direction (for side-leg offset).
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  const headerW  = cutWidth + 2 * TRIM_W;
  const yMid     = (bottomY + topY) / 2;
  const headerY  = topY + TRIM_W / 2;
  const sillY    = bottomY - TRIM_W / 2;

  const pieces: { pos: [number, number, number]; size: [number, number, number] }[] = [];
  for (const sign of [-1, 1] as const) {
    if (sign === skipFace) continue;
    const faceOffset = sign * (wall.thickness / 2 + TRIM_T / 2);
    const fx = cx + nx * faceOffset;
    const fy = cy + ny * faceOffset;

    // Header
    pieces.push({ pos: [fx, headerY, fy], size: [headerW, TRIM_W, TRIM_T] });

    // Side legs
    for (const side of [-1, 1]) {
      const sideAlong = side * (cutWidth / 2 + TRIM_W / 2);
      pieces.push({
        pos: [fx + ux * sideAlong, yMid, fy + uy * sideAlong],
        size: [TRIM_W, openingH, TRIM_T],
      });
    }

    // Sill (windows only)
    if (includeBottom) {
      pieces.push({ pos: [fx, sillY, fy], size: [headerW, TRIM_W, TRIM_T] });
    }
  }

  return (
    <group>
      {pieces.map((p, i) => (
        <mesh key={i} position={p.pos} rotation={[0, -angle, 0]} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={TRIM_COLOR} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Furniture ───────────────────────────────────────────────────────────────

function FurnitureMesh({ item, elevation }: { item: FurnitureItem; elevation: number }) {
  // The model renders centered in XZ with its bottom at local Y=0. Upper
  // cabinets get lifted above the floor (typical mount height above the
  // countertop + backsplash) since they hang on the wall, not stand on it.
  // FURNITURE_HEIGHTS is informational — actual mesh heights are baked into
  // each per-kind model in ./Furniture3D.
  void FURNITURE_HEIGHTS;
  const baseY = elevation + (item.kind === 'cabinet-upper' ? CABINET_UPPER_FLOOR_OFFSET : 0);
  return (
    <group
      position={[item.position.x, baseY, item.position.y]}
      rotation={[0, -item.rotation, 0]}
    >
      <FurnitureModel
        kind={item.kind}
        width={item.width}
        depth={item.depth}
        cabinetColor={item.cabinetColor}
        countertopColor={item.countertopColor}
        sizeVariant={item.sizeVariant}
      />
    </group>
  );
}

// ─── Floor slab tile ───────────────────────────────────────────────────────────

// One rectangular piece of a floor slab (the slab is split into pieces around
// stairwell openings). Upper floors get a wood TOP face with exterior-colored
// sides; the ground slab is wood all around (foundation lip). Box material
// order is [+X, -X, +Y(top), -Y, +Z, -Z].
function SlabTile({ rect, y, thickness, isGround }: {
  rect: Rect; y: number; thickness: number; isGround: boolean;
}) {
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  if (w <= 0.1 || d <= 0.1) return null;
  return (
    <mesh position={[(rect.x0 + rect.x1) / 2, y, (rect.z0 + rect.z1) / 2]} receiveShadow>
      <boxGeometry args={[w, thickness, d]} />
      {isGround ? (
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} />
      ) : (
        [0, 1, 2, 3, 4, 5].map(i => (
          <meshStandardMaterial
            key={i}
            attach={`material-${i}`}
            color={i === 2 ? FLOOR_COLOR : WALL_COLOR.exterior}
            roughness={i === 2 ? 0.9 : 0.85}
          />
        ))
      )}
    </mesh>
  );
}

// ─── Stairs ──────────────────────────────────────────────────────────────────
// v1: straight stair renders as a stepped staircase climbing to the next floor
// up. L/U render as a single inclined slab (placeholder — we'll iterate).
function StairMesh({ stair, elevation, project }: { stair: Stair; elevation: number; project: Project }) {
  // Find the floor we're climbing TO. For 'up' stairs, the level immediately
  // above; for 'down', immediately below.
  const sorted = [...project.levels].sort((a, b) => a.elevation - b.elevation);
  const myIdx = sorted.findIndex(l => l.elevation === elevation);
  const targetIdx = stair.direction === 'up' ? myIdx + 1 : myIdx - 1;
  const targetElev = sorted[targetIdx]?.elevation ?? elevation + 108;
  const rise = Math.abs(targetElev - elevation);

  const shape = stair.shape ?? 'straight';
  const w = stair.width;
  const len = stair.length;

  if (shape === 'straight') {
    const treads = Math.max(2, Math.round(rise / 7.5)); // ~7.5" per riser
    const treadDepth = len / treads;
    const treadH = rise / treads;
    const climbDir = stair.direction === 'up' ? 1 : -1;
    return (
      <group position={[stair.position.x, elevation, stair.position.y]} rotation={[0, -stair.rotation, 0]}>
        {Array.from({ length: treads }, (_, i) => {
          const stepY = (i + 1) * treadH * climbDir;
          // The flight's HIGH end is at local -Z (= plan -Y, where the "UP"
          // arrow points), so the lowest step starts at +Z and the run climbs
          // toward -Z — matching the 2D plan orientation.
          const stepZ = len / 2 - (i + 0.5) * treadDepth;
          return (
            <mesh key={i} position={[0, stepY - treadH / 2, stepZ]} castShadow receiveShadow>
              <boxGeometry args={[w, treadH, treadDepth]} />
              <meshStandardMaterial color="#a8a08a" roughness={0.85} />
            </mesh>
          );
        })}
      </group>
    );
  }

  // L / U — simple inclined slab as placeholder
  const climbDir = stair.direction === 'up' ? 1 : -1;
  return (
    <group position={[stair.position.x, elevation, stair.position.y]} rotation={[0, -stair.rotation, 0]}>
      <mesh position={[0, (rise / 2) * climbDir, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, rise, len]} />
        <meshStandardMaterial color="#a8a08a" roughness={0.85} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// For each wall, compute how far each endpoint should extend past the
// centerline to fill the outside-corner wedge with neighboring walls. Walls
// extrude as length×thickness boxes ending at their centerline endpoints, so
// at an L-corner the outside corner of the room is missing a wedge unless we
// stretch each wall by `other.thickness / (2·|sin θ|)` where θ is the angle
// between the two walls at the joint (for right angles this simplifies to
// other.thickness / 2). T-junctions (endpoint lies mid-span of another wall)
// don't need extension and naturally aren't detected here.
function computeWallExtensions(walls: Wall[]): Map<string, { start: number; end: number }> {
  const EPS = 0.5; // inches — endpoints within this distance are "shared"
  const MIN_SIN = 0.05; // avoid huge extensions for near-collinear joints
  const out = new Map<string, { start: number; end: number }>();

  const dirFrom = (w: Wall, fromStart: boolean) => {
    const sx = fromStart ? w.start.x : w.end.x;
    const sy = fromStart ? w.start.y : w.end.y;
    const ex = fromStart ? w.end.x : w.start.x;
    const ey = fromStart ? w.end.y : w.start.y;
    const len = Math.hypot(ex - sx, ey - sy);
    return len === 0 ? null : { x: (ex - sx) / len, y: (ey - sy) / len };
  };

  for (const w of walls) {
    let startExt = 0, endExt = 0;
    const wDirFromStart = dirFrom(w, true);
    const wDirFromEnd   = dirFrom(w, false);
    if (!wDirFromStart || !wDirFromEnd) {
      out.set(w.id, { start: 0, end: 0 });
      continue;
    }

    for (const other of walls) {
      if (other.id === w.id) continue;
      // Check both of w's endpoints against both of other's endpoints.
      for (const wAtStart of [true, false]) {
        const wp = wAtStart ? w.start : w.end;
        for (const oAtStart of [true, false]) {
          const op = oAtStart ? other.start : other.end;
          if (Math.hypot(wp.x - op.x, wp.y - op.y) > EPS) continue;
          const oDir = dirFrom(other, oAtStart);
          if (!oDir) continue;
          const wDir = wAtStart ? wDirFromStart : wDirFromEnd;
          // |sin θ| between the two outgoing directions = |cross product|.
          const sinA = Math.abs(wDir.x * oDir.y - wDir.y * oDir.x);
          if (sinA < MIN_SIN) continue;
          const ext = other.thickness / (2 * sinA);
          if (wAtStart && ext > startExt) startExt = ext;
          if (!wAtStart && ext > endExt) endExt = ext;
        }
      }
    }
    out.set(w.id, { start: startExt, end: endExt });
  }
  return out;
}

// World-plan-space axis-aligned rectangle (X = 3D x, Z = 3D z / plan Y).
interface Rect { x0: number; x1: number; z0: number; z1: number }

// Axis-aligned world footprint of a (possibly rotated) stair, expanded by
// `clearance` so the slab opening clears the flight.
function stairHoleRect(s: Stair, clearance: number): Rect {
  const { hx, hy } = stairHalfExtents(s);
  const c = Math.cos(s.rotation), si = Math.sin(s.rotation);
  const corners: [number, number][] = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [lx, ly] of corners) {
    const wx = s.position.x + c * lx - si * ly;
    const wz = s.position.y + si * lx + c * ly;
    minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
  }
  return { x0: minX - clearance, x1: maxX + clearance, z0: minZ - clearance, z1: maxZ + clearance };
}

// Split `outer` into a grid of sub-rectangles using each hole's edges as cut
// lines, then drop the cells whose center falls inside any hole. Produces a
// rectangular slab perforated by rectangular stairwell openings.
function slabTiles(outer: Rect, holes: Rect[]): Rect[] {
  if (holes.length === 0) return [outer];
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const xs = new Set<number>([outer.x0, outer.x1]);
  const zs = new Set<number>([outer.z0, outer.z1]);
  for (const h of holes) {
    xs.add(clamp(h.x0, outer.x0, outer.x1));
    xs.add(clamp(h.x1, outer.x0, outer.x1));
    zs.add(clamp(h.z0, outer.z0, outer.z1));
    zs.add(clamp(h.z1, outer.z0, outer.z1));
  }
  const xa = [...xs].sort((a, b) => a - b);
  const za = [...zs].sort((a, b) => a - b);
  const tiles: Rect[] = [];
  for (let i = 0; i < xa.length - 1; i++) {
    for (let j = 0; j < za.length - 1; j++) {
      const x0 = xa[i], x1 = xa[i + 1], z0 = za[j], z1 = za[j + 1];
      if (x1 - x0 < 0.1 || z1 - z0 < 0.1) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (holes.some(h => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      tiles.push({ x0, x1, z0, z1 });
    }
  }
  return tiles;
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const cur = m.get(k);
    if (cur) cur.push(x); else m.set(k, [x]);
  }
  return m;
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number; size: number }
function computeLevelBounds(walls: Wall[]): Bounds | null {
  if (walls.length === 0) return null;
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  return { minX, minY, maxX, maxY, size: Math.max(maxX - minX, maxY - minY) };
}

function computeProjectBounds(p: Project): Bounds {
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const lvl of p.levels) {
    for (const w of lvl.walls) {
      minX = Math.min(minX, w.start.x, w.end.x);
      minY = Math.min(minY, w.start.y, w.end.y);
      maxX = Math.max(maxX, w.start.x, w.end.x);
      maxY = Math.max(maxY, w.start.y, w.end.y);
    }
  }
  if (!isFinite(minX)) {
    // Empty project: fall back to a friendly default extent.
    return { minX: -120, minY: -120, maxX: 120, maxY: 120, size: 240 };
  }
  return { minX, minY, maxX, maxY, size: Math.max(maxX - minX, maxY - minY) };
}

function computeMaxWallTop(p: Project): number {
  let top = 0;
  for (const lvl of p.levels) {
    for (const w of lvl.walls) {
      const t = lvl.elevation + w.height;
      if (t > top) top = t;
    }
  }
  return top || 96;
}

// ─── Fallback panel when WebGL isn't available ────────────────────────────────
function WebGLFallback() {
  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bg, padding: 40,
    }}>
      <div style={{
        maxWidth: 520, background: T.panel, border: `1px solid ${T.line}`,
        borderRadius: 10, padding: '26px 30px', boxShadow: T.shadow,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.8px',
          color: T.warm, textTransform: 'uppercase', marginBottom: 8,
        }}>3D view unavailable</div>
        <h2 style={{
          fontSize: 20, fontWeight: 700, color: T.ink,
          margin: '0 0 10px', fontFamily: 'ui-sans-serif, system-ui',
        }}>WebGL is disabled in this browser</h2>
        <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.6, margin: '0 0 16px' }}>
          The 3D view needs hardware-accelerated graphics. Your browser created a
          sandbox without GPU access, so Three.js can&apos;t open a rendering
          context here. The 2D Plan, Specs, and other views still work normally.
        </p>
        <div style={{ fontSize: 12, color: T.ink, fontWeight: 600, marginBottom: 6 }}>
          Things to try:
        </div>
        <ul style={{ paddingLeft: 18, margin: 0, color: T.inkSoft, fontSize: 12.5, lineHeight: 1.8 }}>
          <li>Chrome / Edge → Settings → System → <em>Use graphics acceleration when available</em> → ON, then fully restart the browser</li>
          <li>Check <code style={{ background: T.bg, padding: '1px 5px', borderRadius: 4 }}>chrome://gpu</code> (or <code style={{ background: T.bg, padding: '1px 5px', borderRadius: 4 }}>edge://gpu</code>) — WebGL should read &quot;Hardware accelerated&quot;</li>
          <li>Update graphics drivers if they&apos;re stale, then restart</li>
          <li>If you&apos;re on a remote desktop / VM, run the dev server locally instead</li>
        </ul>
      </div>
    </div>
  );
}

