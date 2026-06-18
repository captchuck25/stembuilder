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
  doorOpeningCut, windowOpeningCuts, wallSegmentsWithCuts,
} from '../engine/geometry';
import { deriveExteriorWallIds } from '../engine/roof';
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
          <LevelGroup key={level.id} level={level} project={project} />
        ))}

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

function LevelGroup({ level, project }: { level: Pick<Project['levels'][number], 'id' | 'elevation' | 'walls' | 'doors' | 'windows' | 'stairs' | 'furniture'>; project: Project }) {
  const elev = level.elevation;

  // Pre-index openings by wallId so each wall knows its cuts.
  const doorsByWall = useMemo(() => groupBy(level.doors, d => d.wallId), [level.doors]);
  const windowsByWall = useMemo(() => groupBy(level.windows, w => w.wallId), [level.windows]);

  // Endpoint extensions to fill the outside-corner wedge where walls meet.
  const wallExtensions = useMemo(() => computeWallExtensions(level.walls), [level.walls]);

  // Walls on the building perimeter render with the exterior tone (derived from
  // geometry — exterior is no longer a stored wall type).
  const exteriorIds = useMemo(() => deriveExteriorWallIds(level), [level]);

  // Floor slab — sized to the level's wall bounding box.
  const slab = useMemo(() => computeLevelBounds(level.walls), [level.walls]);

  return (
    <group>
      {slab && (
        <mesh
          position={[(slab.minX + slab.maxX) / 2, elev - FLOOR_SLAB_THICKNESS / 2, (slab.minY + slab.maxY) / 2]}
          receiveShadow
        >
          <boxGeometry args={[slab.maxX - slab.minX + 24, FLOOR_SLAB_THICKNESS, slab.maxY - slab.minY + 24]} />
          <meshStandardMaterial color={FLOOR_COLOR} roughness={0.9} />
        </mesh>
      )}

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

      {level.stairs.map(s => (
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
          const stepZ = (i + 0.5) * treadDepth - len / 2;
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

