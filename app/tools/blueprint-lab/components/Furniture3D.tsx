'use client';

// Per-kind 3D models for furniture items. Each model is built from primitives
// (boxes, cylinders, etc.) and renders centered at the local origin, with:
//   local +X = along catalog `width`
//   local +Y = up (the bottom of the piece sits at Y=0)
//   local +Z = along catalog `depth`
//
// The wrapping <group> in Scene3D handles world position + Y-rotation. The
// catalog also specifies a per-kind overall height (FURNITURE_HEIGHTS); each
// model's tallest point should roughly match that so the piece doesn't punch
// through ceilings or sit floating above the floor.

import {
  CABINET_COLOR_DEFAULT, COUNTERTOP_COLOR_DEFAULT,
  FRIDGE_WIDTHS, FridgeSize, FurnitureKind,
  STOVE_BURNERS, StoveSize,
} from '../engine/types';

// ── Color palette ──────────────────────────────────────────────────────────
const COL = {
  // Soft furnishings
  mattress:       '#ece4d3',
  pillow:         '#f3ecdb',
  blanket:        '#9aa6bc',
  fabricBeige:    '#a89684',
  fabricDark:     '#5e5448',
  fabricBlack:    '#2a2c32',
  // Wood
  woodLight:      '#c9a878',
  woodMed:        '#9b7a51',
  woodDark:       '#6a4a30',
  woodBlack:      '#3a2d22',
  // Metals and fixtures
  metalLight:     '#cdd2d8',
  metalDark:      '#4a525c',
  chrome:         '#d7dadf',
  porcelain:      '#f6f3ec',
  glass:          '#a8c7e3',
  appliance:      '#d8dde3',
  applianceDark:  '#2c2e34',
  // Misc
  screen:         '#1a1c22',
  paper:          '#f0e9d4',
};

// Standing-height constants now live in engine/heights.ts so 2D consumers
// (Specs cross-section, Elevations) can use them without importing three.js.
// Re-exported here for back-compat with existing callers.
export { FURNITURE_HEIGHTS, CABINET_UPPER_FLOOR_OFFSET } from '../engine/heights';

interface ModelProps { width: number; depth: number }

// ── Dispatcher ────────────────────────────────────────────────────────────
export function FurnitureModel({ kind, width, depth, cabinetColor, countertopColor, sizeVariant }: {
  kind: FurnitureKind;
  width: number;
  depth: number;
  cabinetColor?: string;
  countertopColor?: string;
  sizeVariant?: string;
}) {
  const cabCol = cabinetColor    ?? CABINET_COLOR_DEFAULT;
  const topCol = countertopColor ?? COUNTERTOP_COLOR_DEFAULT;
  switch (kind) {
    case 'bed-twin': case 'bed-full': case 'bed-queen': case 'bed-king':
      return <BedModel width={width} depth={depth} kind={kind} />;
    case 'crib':           return <CribModel width={width} depth={depth} />;
    case 'nightstand':     return <NightstandModel width={width} depth={depth} />;
    case 'dresser':        return <DresserModel width={width} depth={depth} />;
    case 'wardrobe':       return <WardrobeModel width={width} depth={depth} />;
    case 'toilet':         return <ToiletModel width={width} depth={depth} />;
    case 'sink-vanity':    return <VanityModel width={width} depth={depth} />;
    case 'sink-pedestal':  return <PedestalSinkModel width={width} depth={depth} />;
    case 'bathtub':        return <BathtubModel width={width} depth={depth} />;
    case 'shower-stall':   return <ShowerStallModel width={width} depth={depth} />;
    case 'cabinet-base':   return <CabinetBaseModel width={width} depth={depth} cabinetColor={cabCol} countertopColor={topCol} />;
    case 'cabinet-upper':  return <CabinetUpperModel width={width} depth={depth} cabinetColor={cabCol} />;
    case 'fridge':         return <FridgeModel width={width} depth={depth} sizeVariant={(sizeVariant as FridgeSize) ?? '36'} />;
    case 'stove-range':    return <StoveModel width={width} depth={depth} sizeVariant={(sizeVariant as StoveSize) ?? '30'} />;
    case 'sink-kitchen':   return <KitchenSinkModel width={width} depth={depth} cabinetColor={cabCol} countertopColor={topCol} />;
    case 'dishwasher':     return <DishwasherModel width={width} depth={depth} />;
    case 'island':         return <IslandModel width={width} depth={depth} cabinetColor={cabCol} countertopColor={topCol} />;
    case 'sofa-3':         return <UpholsteredSofa width={width} depth={depth} cushions={3} />;
    case 'loveseat':       return <UpholsteredSofa width={width} depth={depth} cushions={2} />;
    case 'armchair':       return <ArmchairModel width={width} depth={depth} />;
    case 'coffee-table': case 'end-table':
      return <SimpleTableModel width={width} depth={depth} kind={kind} />;
    case 'tv-console':     return <TvConsoleModel width={width} depth={depth} />;
    case 'bookshelf':      return <BookshelfModel width={width} depth={depth} />;
    case 'dining-table-4': case 'dining-table-6': case 'dining-table-8':
      return <DiningTableModel width={width} depth={depth} />;
    case 'dining-chair':   return <DiningChairModel width={width} depth={depth} />;
    case 'buffet':         return <BuffetModel width={width} depth={depth} />;
    case 'desk':           return <DeskModel width={width} depth={depth} />;
    case 'office-chair':   return <OfficeChairModel width={width} depth={depth} />;
    case 'filing-cabinet': return <FilingCabinetModel width={width} depth={depth} />;
  }
}

// ── Beds ──────────────────────────────────────────────────────────────────
function BedModel({ width: w, depth: d, kind }: ModelProps & { kind: FurnitureKind }) {
  const matH = 10, bsH = 8, legH = 6, legR = 1.2;
  const platformY = legH + bsH;
  const matY = platformY + matH / 2;
  const hbH = kind === 'bed-king' || kind === 'bed-queen' ? 44 : 38;
  const fbH = 14;
  const pillowH = 3.5;
  const pillowW = w * 0.42;
  const pillowD = 12;
  const pillowY = matY + matH / 2 + pillowH / 2;
  return (
    <group>
      {/* Wooden corner posts */}
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - legR - 0.5), legH / 2, sz * (d / 2 - legR - 0.5)]} castShadow>
          <cylinderGeometry args={[legR, legR, legH, 12]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.85} />
        </mesh>
      ))}
      {/* Boxspring */}
      <mesh position={[0, legH + bsH / 2, 0]} castShadow>
        <boxGeometry args={[w - 1.5, bsH, d - 1.5]} />
        <meshStandardMaterial color={COL.fabricDark} roughness={0.9} />
      </mesh>
      {/* Mattress */}
      <mesh position={[0, matY, 0]} castShadow>
        <boxGeometry args={[w - 0.5, matH, d - 0.5]} />
        <meshStandardMaterial color={COL.mattress} roughness={0.95} />
      </mesh>
      {/* Headboard at -Z end (taller) */}
      <mesh position={[0, hbH / 2, -(d / 2 + 1.5)]} castShadow>
        <boxGeometry args={[w + 1, hbH, 3]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.75} />
      </mesh>
      {/* Footboard at +Z end (shorter) */}
      <mesh position={[0, fbH / 2, d / 2 + 1.5]} castShadow>
        <boxGeometry args={[w + 1, fbH, 3]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.75} />
      </mesh>
      {/* Two pillows side-by-side at -Z (head) end */}
      {[-1, 1].map(sx => (
        <mesh key={sx} position={[sx * (pillowW / 2 + 1), pillowY, -(d / 2) + pillowD / 2 + 2]} castShadow>
          <boxGeometry args={[pillowW, pillowH, pillowD]} />
          <meshStandardMaterial color={COL.pillow} roughness={0.95} />
        </mesh>
      ))}
      {/* Blanket overlay covering bottom ~half */}
      <mesh position={[0, matY + matH / 2 + 0.4, d / 4 + 2]} castShadow>
        <boxGeometry args={[w + 0.4, 0.7, d * 0.55]} />
        <meshStandardMaterial color={COL.blanket} roughness={0.95} />
      </mesh>
    </group>
  );
}

function CribModel({ width: w, depth: d }: ModelProps) {
  const railH = 36;
  const platformY = 8;
  const platformH = 6;
  const slatW = 0.6;
  const slatGap = 2.2;
  // Frame posts at 4 corners
  return (
    <group>
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - 0.75), railH / 2, sz * (d / 2 - 0.75)]} castShadow>
          <boxGeometry args={[1.5, railH + 2, 1.5]} />
          <meshStandardMaterial color={COL.woodLight} roughness={0.8} />
        </mesh>
      ))}
      {/* Mattress platform */}
      <mesh position={[0, platformY + platformH / 2, 0]} castShadow>
        <boxGeometry args={[w - 3, platformH, d - 3]} />
        <meshStandardMaterial color={COL.mattress} roughness={0.95} />
      </mesh>
      {/* Top rails on all 4 sides */}
      <mesh position={[0, railH - 1, -d / 2 + 0.75]} castShadow>
        <boxGeometry args={[w, 2, 1.5]} /><meshStandardMaterial color={COL.woodLight} roughness={0.8} />
      </mesh>
      <mesh position={[0, railH - 1, d / 2 - 0.75]} castShadow>
        <boxGeometry args={[w, 2, 1.5]} /><meshStandardMaterial color={COL.woodLight} roughness={0.8} />
      </mesh>
      <mesh position={[-w / 2 + 0.75, railH - 1, 0]} castShadow>
        <boxGeometry args={[1.5, 2, d]} /><meshStandardMaterial color={COL.woodLight} roughness={0.8} />
      </mesh>
      <mesh position={[w / 2 - 0.75, railH - 1, 0]} castShadow>
        <boxGeometry args={[1.5, 2, d]} /><meshStandardMaterial color={COL.woodLight} roughness={0.8} />
      </mesh>
      {/* Slats — front and back */}
      {(() => {
        const n = Math.floor((w - 4) / slatGap);
        const start = -((n - 1) * slatGap) / 2;
        return Array.from({ length: n }, (_, i) => {
          const x = start + i * slatGap;
          return (
            <group key={`s${i}`}>
              <mesh position={[x, platformY + platformH + (railH - platformY - platformH - 2) / 2 + 1, -d / 2 + 0.75]} castShadow>
                <boxGeometry args={[slatW, railH - platformY - platformH - 2, slatW]} />
                <meshStandardMaterial color={COL.woodLight} roughness={0.8} />
              </mesh>
              <mesh position={[x, platformY + platformH + (railH - platformY - platformH - 2) / 2 + 1, d / 2 - 0.75]} castShadow>
                <boxGeometry args={[slatW, railH - platformY - platformH - 2, slatW]} />
                <meshStandardMaterial color={COL.woodLight} roughness={0.8} />
              </mesh>
            </group>
          );
        });
      })()}
    </group>
  );
}

// ── Casegoods (cabinets, dressers, etc.) ─────────────────────────────────
function NightstandModel({ width: w, depth: d }: ModelProps) {
  const h = 24;
  const drawerH = 6;
  return (
    <group>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
      {/* Top surface (slightly larger, lighter) */}
      <mesh position={[0, h + 0.3, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.6, d + 0.5]} />
        <meshStandardMaterial color={COL.woodLight} roughness={0.7} />
      </mesh>
      {/* Top drawer */}
      <mesh position={[0, h - drawerH / 2 - 1, d / 2 + 0.1]}>
        <boxGeometry args={[w - 1.5, drawerH, 0.4]} />
        <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
      </mesh>
      {/* Drawer pull */}
      <mesh position={[0, h - drawerH / 2 - 1, d / 2 + 0.5]}>
        <cylinderGeometry args={[0.5, 0.5, 1.2, 12]} />
        <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Lower cabinet door */}
      <mesh position={[0, (h - drawerH - 2) / 2 + 1, d / 2 + 0.1]}>
        <boxGeometry args={[w - 1.5, h - drawerH - 3, 0.4]} />
        <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
      </mesh>
    </group>
  );
}

function DresserModel({ width: w, depth: d }: ModelProps) {
  const h = 32;
  const drawers = 3;
  const drawerH = (h - 4) / drawers;
  return (
    <group>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
      {/* Top */}
      <mesh position={[0, h + 0.3, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.6, d + 0.5]} />
        <meshStandardMaterial color={COL.woodLight} roughness={0.7} />
      </mesh>
      {/* Drawer fronts */}
      {Array.from({ length: drawers }, (_, i) => {
        const y = 2 + drawerH / 2 + i * drawerH;
        return (
          <group key={i}>
            {[-1, 1].map(sx => (
              <mesh key={sx} position={[sx * w / 4, y, d / 2 + 0.1]}>
                <boxGeometry args={[w / 2 - 1.5, drawerH - 0.6, 0.4]} />
                <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
              </mesh>
            ))}
            {/* Pulls */}
            {[-1, 1].map(sx => (
              <mesh key={`p${sx}`} position={[sx * w / 4, y, d / 2 + 0.5]}>
                <boxGeometry args={[4, 0.6, 0.6]} />
                <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function WardrobeModel({ width: w, depth: d }: ModelProps) {
  const h = 72;
  return (
    <group>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
      {/* Two doors with vertical groove */}
      {[-1, 1].map(sx => (
        <mesh key={sx} position={[sx * w / 4, h / 2, d / 2 + 0.1]} castShadow>
          <boxGeometry args={[w / 2 - 0.5, h - 2, 0.4]} />
          <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
        </mesh>
      ))}
      {/* Vertical door pulls */}
      {[-1, 1].map(sx => (
        <mesh key={`p${sx}`} position={[sx * 1.2, h / 2, d / 2 + 0.5]}>
          <boxGeometry args={[0.5, 14, 0.5]} />
          <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Base plinth */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[w + 0.2, 2, d + 0.2]} />
        <meshStandardMaterial color={COL.woodDark} roughness={0.85} />
      </mesh>
    </group>
  );
}

// ── Bathroom ─────────────────────────────────────────────────────────────
function ToiletModel({ width: w, depth: d }: ModelProps) {
  const tankW = w * 0.95;
  const tankH = 16;
  const tankD = 6;
  const tankY = 12;
  const bowlY = 11;
  const bowlH = 12;
  const seatH = 1.2;
  // Bowl ellipse: cylinder scaled in Z
  const bowlR = w * 0.42;
  const bowlZScale = (d - tankD) / (bowlR * 2);
  return (
    <group>
      {/* Bowl base — ellipse via scaled cylinder */}
      <mesh position={[0, bowlY / 2, d / 2 - (d - tankD) / 2 - tankD / 2]} scale={[1, 1, bowlZScale]} castShadow receiveShadow>
        <cylinderGeometry args={[bowlR * 0.65, bowlR * 0.8, bowlY, 20]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      {/* Bowl rim/top — taller cylinder forming the bowl opening */}
      <mesh position={[0, bowlY + bowlH / 2, d / 2 - (d - tankD) / 2 - tankD / 2]} scale={[1, 1, bowlZScale]} castShadow>
        <cylinderGeometry args={[bowlR, bowlR * 0.65, bowlH, 20]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      {/* Seat ring */}
      <mesh position={[0, bowlY + bowlH + seatH / 2, d / 2 - (d - tankD) / 2 - tankD / 2]} scale={[1, 1, bowlZScale]}>
        <cylinderGeometry args={[bowlR + 0.4, bowlR + 0.4, seatH, 24]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.4} />
      </mesh>
      {/* Tank */}
      <mesh position={[0, tankY + tankH / 2, -d / 2 + tankD / 2]} castShadow receiveShadow>
        <boxGeometry args={[tankW, tankH, tankD]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.4} />
      </mesh>
      {/* Tank lid */}
      <mesh position={[0, tankY + tankH + 0.3, -d / 2 + tankD / 2]}>
        <boxGeometry args={[tankW + 0.4, 0.6, tankD + 0.4]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.4} />
      </mesh>
      {/* Flush handle */}
      <mesh position={[tankW / 2 - 1, tankY + tankH - 2, -d / 2 + tankD + 0.3]}>
        <boxGeometry args={[1.5, 0.6, 0.8]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.2} metalness={0.85} />
      </mesh>
    </group>
  );
}

function VanityModel({ width: w, depth: d }: ModelProps) {
  const h = 34;
  const counterT = 1.5;
  const cabH = h - counterT;
  const basinW = w * 0.5;
  const basinD = d * 0.5;
  const basinH = 4;
  return (
    <group>
      {/* Cabinet body */}
      <mesh position={[0, cabH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, cabH, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
      {/* Doors */}
      {[-1, 1].map(sx => (
        <mesh key={sx} position={[sx * w / 4, cabH / 2, d / 2 + 0.1]} castShadow>
          <boxGeometry args={[w / 2 - 1, cabH - 2, 0.4]} />
          <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
        </mesh>
      ))}
      {/* Door pulls */}
      {[-1, 1].map(sx => (
        <mesh key={`p${sx}`} position={[sx * 1.5, cabH / 2 + cabH / 4, d / 2 + 0.5]}>
          <cylinderGeometry args={[0.4, 0.4, 1.2, 10]} />
          <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Counter top */}
      <mesh position={[0, cabH + counterT / 2, 0]} castShadow>
        <boxGeometry args={[w + 0.4, counterT, d + 0.4]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.3} />
      </mesh>
      {/* Sink basin (oval — cylinder slightly recessed) */}
      <mesh position={[0, cabH + counterT - 0.1, 0]} scale={[basinW / 10, 1, basinD / 10]}>
        <cylinderGeometry args={[5, 4, basinH, 18]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.3} />
      </mesh>
      {/* Faucet */}
      <mesh position={[0, cabH + counterT + 3, -d * 0.18]}>
        <cylinderGeometry args={[0.4, 0.4, 6, 10]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
      <mesh position={[0, cabH + counterT + 5.5, -d * 0.18 + 1.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 3, 10]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
    </group>
  );
}

function PedestalSinkModel({ width: w, depth: d }: ModelProps) {
  const pedH = 28;
  const basinH = 6;
  return (
    <group>
      {/* Pedestal — tapered cylinder */}
      <mesh position={[0, pedH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.5, 4, pedH, 18]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.3} />
      </mesh>
      {/* Basin — wider oval bowl on top */}
      <mesh position={[0, pedH + basinH / 2, 0]} scale={[w / 18, 1, d / 16]} castShadow>
        <cylinderGeometry args={[9, 7, basinH, 24]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.3} />
      </mesh>
      {/* Faucet */}
      <mesh position={[0, pedH + basinH + 3, -d * 0.32]}>
        <cylinderGeometry args={[0.4, 0.4, 6, 10]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
      <mesh position={[0, pedH + basinH + 5.5, -d * 0.32 + 1.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 3, 10]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
    </group>
  );
}

function BathtubModel({ width: w, depth: d }: ModelProps) {
  const h = 22;
  const wallT = 2;
  // Outer shell as 4 walls + floor (open top)
  return (
    <group>
      {/* Floor (interior bottom) */}
      <mesh position={[0, 2, 0]} receiveShadow>
        <boxGeometry args={[w - wallT * 2, 2, d - wallT * 2]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      {/* 4 walls of the tub */}
      <mesh position={[0, h / 2, -d / 2 + wallT / 2]} castShadow>
        <boxGeometry args={[w, h, wallT]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      <mesh position={[0, h / 2, d / 2 - wallT / 2]} castShadow>
        <boxGeometry args={[w, h, wallT]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      <mesh position={[-w / 2 + wallT / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[wallT, h, d]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      <mesh position={[w / 2 - wallT / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[wallT, h, d]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.35} />
      </mesh>
      {/* Faucet at -X end */}
      <mesh position={[-w / 2 + 3, h + 1, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 2, 10]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
      <mesh position={[-w / 2 + 5, h + 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.4, 0.4, 3, 10]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
    </group>
  );
}

function ShowerStallModel({ width: w, depth: d }: ModelProps) {
  const h = 80;
  const wallT = 1;
  // Two opaque walls (corner placement) + two glass walls + base tray
  return (
    <group>
      {/* Base tray */}
      <mesh position={[0, 1, 0]} receiveShadow>
        <boxGeometry args={[w, 2, d]} />
        <meshStandardMaterial color={COL.porcelain} roughness={0.4} />
      </mesh>
      {/* Back wall (-Z) — opaque tile */}
      <mesh position={[0, h / 2, -d / 2 + wallT / 2]} castShadow>
        <boxGeometry args={[w, h, wallT]} />
        <meshStandardMaterial color={COL.metalLight} roughness={0.6} />
      </mesh>
      {/* Left wall — opaque */}
      <mesh position={[-w / 2 + wallT / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[wallT, h, d]} />
        <meshStandardMaterial color={COL.metalLight} roughness={0.6} />
      </mesh>
      {/* Right wall — glass door */}
      <mesh position={[w / 2 - wallT / 2, h / 2, 0]} castShadow>
        <boxGeometry args={[wallT, h, d - 2]} />
        <meshStandardMaterial color={COL.glass} transparent opacity={0.35} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* Front wall (+Z) — glass door */}
      <mesh position={[0, h / 2, d / 2 - wallT / 2]} castShadow>
        <boxGeometry args={[w - 2, h, wallT]} />
        <meshStandardMaterial color={COL.glass} transparent opacity={0.35} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* Shower head */}
      <mesh position={[0, h - 8, -d / 2 + wallT + 1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2, 2, 1, 16]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.2} metalness={0.85} />
      </mesh>
    </group>
  );
}

// ── Kitchen ──────────────────────────────────────────────────────────────
function FridgeModel({ width: w, depth: d, sizeVariant }: ModelProps & { sizeVariant: FridgeSize }) {
  const h = 70;
  const actualW = FRIDGE_WIDTHS[sizeVariant];
  // If width prop doesn't match variant, prefer prop (user may have nudged).
  // But default behavior: width === FRIDGE_WIDTHS[variant] from PropertiesPanel.
  void actualW;
  // Layout: 36" = French-door (2 doors top + freezer drawer); 30" = single
  // door top + freezer drawer (top-bottom fridge).
  const freezerH = h * 0.32;
  const fridgeH = h - freezerH;
  const isFrench = sizeVariant === '36';
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.appliance} roughness={0.4} metalness={0.3} />
      </mesh>
      {isFrench ? (
        <>
          {/* Two French doors */}
          {[-1, 1].map(sx => (
            <mesh key={sx} position={[sx * w / 4, freezerH + fridgeH / 2, d / 2 + 0.1]} castShadow>
              <boxGeometry args={[w / 2 - 0.3, fridgeH - 1, 0.3]} />
              <meshStandardMaterial color={COL.metalLight} roughness={0.4} metalness={0.5} />
            </mesh>
          ))}
          {[-1, 1].map(sx => (
            <mesh key={`uh${sx}`} position={[sx * 1.5, freezerH + fridgeH / 2, d / 2 + 0.45]}>
              <cylinderGeometry args={[0.3, 0.3, fridgeH - 8, 10]} />
              <meshStandardMaterial color={COL.metalDark} roughness={0.2} metalness={0.85} />
            </mesh>
          ))}
        </>
      ) : (
        <>
          {/* Single fridge door */}
          <mesh position={[0, freezerH + fridgeH / 2, d / 2 + 0.1]} castShadow>
            <boxGeometry args={[w - 0.5, fridgeH - 1, 0.3]} />
            <meshStandardMaterial color={COL.metalLight} roughness={0.4} metalness={0.5} />
          </mesh>
          {/* Single vertical handle on the right */}
          <mesh position={[w / 2 - 2, freezerH + fridgeH / 2, d / 2 + 0.45]}>
            <cylinderGeometry args={[0.3, 0.3, fridgeH - 8, 10]} />
            <meshStandardMaterial color={COL.metalDark} roughness={0.2} metalness={0.85} />
          </mesh>
        </>
      )}
      {/* Freezer drawer */}
      <mesh position={[0, freezerH / 2, d / 2 + 0.1]} castShadow>
        <boxGeometry args={[w - 0.5, freezerH - 1, 0.3]} />
        <meshStandardMaterial color={COL.metalLight} roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, freezerH - 2.5, d / 2 + 0.45]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, w - 8, 10]} />
        <meshStandardMaterial color={COL.metalDark} roughness={0.2} metalness={0.85} />
      </mesh>
    </group>
  );
}

function StoveModel({ width: w, depth: d, sizeVariant }: ModelProps & { sizeVariant: StoveSize }) {
  const h = 36;
  const cookH = 2;
  const burners = STOVE_BURNERS[sizeVariant];
  // Burner layout per size:
  //   4 burners (30") → 2×2 grid
  //   5 burners (36") → 2×2 + 1 center
  //   6 burners (48") → 2×3 grid
  const burnerR = Math.min(w, d) * 0.085;
  const burnerPositions: [number, number][] = (() => {
    if (burners === 4) {
      return [[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz]) => [sx * w * 0.22, sz * d * 0.22] as [number, number]);
    }
    if (burners === 5) {
      return [
        [-w * 0.30, -d * 0.22], [w * 0.30, -d * 0.22],
        [-w * 0.30,  d * 0.22], [w * 0.30,  d * 0.22],
        [0, 0],
      ];
    }
    // 6 → 2 rows × 3 cols
    const xs = [-w * 0.32, 0, w * 0.32];
    const zs = [-d * 0.22, d * 0.22];
    const ps: [number, number][] = [];
    for (const x of xs) for (const z of zs) ps.push([x, z]);
    return ps;
  })();
  return (
    <group>
      {/* Body (lower half is oven) */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.applianceDark} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Cooktop */}
      <mesh position={[0, h + cookH / 2, 0]} castShadow>
        <boxGeometry args={[w, cookH, d]} />
        <meshStandardMaterial color={'#1a1a1a'} roughness={0.3} metalness={0.6} />
      </mesh>
      {/* Burners */}
      {burnerPositions.map(([bx, bz], i) => (
        <mesh key={i} position={[bx, h + cookH + 0.05, bz]}>
          <cylinderGeometry args={[burnerR, burnerR, 0.2, 18]} />
          <meshStandardMaterial color={'#3a3a3a'} roughness={0.5} metalness={0.7} />
        </mesh>
      ))}
      {/* Oven door — single for 30/36, double-French for 48 */}
      {sizeVariant === '48' ? (
        [-1, 1].map(sx => (
          <mesh key={sx} position={[sx * w / 4, h * 0.35, d / 2 + 0.1]} castShadow>
            <boxGeometry args={[w / 2 - 1, h * 0.55, 0.4]} />
            <meshStandardMaterial color={COL.metalLight} roughness={0.4} metalness={0.5} />
          </mesh>
        ))
      ) : (
        <mesh position={[0, h * 0.35, d / 2 + 0.1]} castShadow>
          <boxGeometry args={[w - 2, h * 0.55, 0.4]} />
          <meshStandardMaterial color={COL.metalLight} roughness={0.4} metalness={0.5} />
        </mesh>
      )}
      {/* Oven door window */}
      <mesh position={[0, h * 0.32, d / 2 + 0.35]}>
        <boxGeometry args={[w - 6, h * 0.32, 0.1]} />
        <meshStandardMaterial color={COL.screen} roughness={0.1} metalness={0.2} />
      </mesh>
      {/* Oven handle (full-width) */}
      <mesh position={[0, h * 0.65, d / 2 + 0.7]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.4, 0.4, w - 4, 12]} />
        <meshStandardMaterial color={COL.metalDark} roughness={0.2} metalness={0.85} />
      </mesh>
      {/* Control panel (back of cooktop) */}
      <mesh position={[0, h + cookH + 2, -d / 2 + 1]} castShadow>
        <boxGeometry args={[w, 4, 1.5]} />
        <meshStandardMaterial color={COL.applianceDark} roughness={0.5} metalness={0.4} />
      </mesh>
      {/* One knob per burner — line them up along the front of the control panel */}
      {Array.from({ length: burners }, (_, i) => {
        const t = burners === 1 ? 0 : (i - (burners - 1) / 2) / (burners - 1);
        const kx = t * (w - 6);
        return (
          <mesh key={i} position={[kx, h + cookH + 2, -d / 2 + 0.5]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 0.6, 14]} />
            <meshStandardMaterial color={COL.metalDark} roughness={0.3} metalness={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

// Base + upper cabinet primitives shared by the sink/island/cabinet kinds.
// Renders a simple shaker-style face: cabinet body + 1 or 2 doors + pulls.
function CabinetBody({ width: w, height: h, depth: d, color, doors = 2 }: {
  width: number; height: number; depth: number; color: string; doors?: number;
}) {
  return (
    <group>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {/* Door faces */}
      {Array.from({ length: doors }, (_, i) => {
        const dw = (w - 0.6) / doors;
        const dx = -w / 2 + 0.3 + dw / 2 + i * dw;
        return (
          <group key={`door${i}`}>
            <mesh position={[dx, h / 2, d / 2 + 0.15]} castShadow>
              <boxGeometry args={[dw - 0.3, h - 1.5, 0.4]} />
              <meshStandardMaterial color={color} roughness={0.65} />
            </mesh>
            {/* Pull — small vertical bar near the inside edge */}
            <mesh position={[dx + (i === 0 && doors > 1 ? dw / 2 - 1 : -dw / 2 + 1), h / 2, d / 2 + 0.55]}>
              <boxGeometry args={[0.4, h * 0.18, 0.4]} />
              <meshStandardMaterial color={COL.metalDark} roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        );
      })}
      {/* Toe kick */}
      <mesh position={[0, 1.5, d / 2 - 1]}>
        <boxGeometry args={[w - 0.5, 3, 0.2]} />
        <meshStandardMaterial color={COL.fabricDark} roughness={0.9} />
      </mesh>
    </group>
  );
}

function CabinetBaseModel({ width: w, depth: d, cabinetColor, countertopColor }: ModelProps & {
  cabinetColor: string; countertopColor: string;
}) {
  const cabH = 34.5;
  const counterT = 1.5;
  const doors = w >= 30 ? 2 : 1;
  return (
    <group>
      <CabinetBody width={w} height={cabH} depth={d} color={cabinetColor} doors={doors} />
      {/* Countertop — slight overhang front + ends */}
      <mesh position={[0, cabH + counterT / 2, 0.5]} castShadow>
        <boxGeometry args={[w + 0.5, counterT, d + 1]} />
        <meshStandardMaterial color={countertopColor} roughness={0.35} />
      </mesh>
    </group>
  );
}

function CabinetUpperModel({ width: w, depth: d, cabinetColor }: ModelProps & { cabinetColor: string }) {
  const h = 30;
  const doors = w >= 30 ? 2 : 1;
  return (
    <group>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={cabinetColor} roughness={0.7} />
      </mesh>
      {/* Doors */}
      {Array.from({ length: doors }, (_, i) => {
        const dw = (w - 0.6) / doors;
        const dx = -w / 2 + 0.3 + dw / 2 + i * dw;
        return (
          <group key={`door${i}`}>
            <mesh position={[dx, h / 2, d / 2 + 0.15]} castShadow>
              <boxGeometry args={[dw - 0.3, h - 1.5, 0.4]} />
              <meshStandardMaterial color={cabinetColor} roughness={0.65} />
            </mesh>
            <mesh position={[dx + (i === 0 && doors > 1 ? dw / 2 - 1 : -dw / 2 + 1), h * 0.25, d / 2 + 0.55]}>
              <boxGeometry args={[0.4, h * 0.18, 0.4]} />
              <meshStandardMaterial color={COL.metalDark} roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function KitchenSinkModel({ width: w, depth: d, cabinetColor, countertopColor }: ModelProps & {
  cabinetColor: string; countertopColor: string;
}) {
  // A base cabinet with a double-bowl sink cut into the counter + faucet.
  const cabH = 34.5;
  const counterT = 1.5;
  const counterY = cabH + counterT / 2;
  const basinW = w * 0.78;
  const basinD = Math.min(d * 0.62, 18);
  const basinDepth = 7;
  return (
    <group>
      <CabinetBody width={w} height={cabH} depth={d} color={cabinetColor} doors={2} />
      {/* Countertop */}
      <mesh position={[0, counterY, 0.5]} castShadow>
        <boxGeometry args={[w + 0.5, counterT, d + 1]} />
        <meshStandardMaterial color={countertopColor} roughness={0.35} />
      </mesh>
      {/* Double-bowl sink recessed into the counter — render the inside walls */}
      {[-1, 1].map(sx => (
        <mesh key={sx} position={[sx * basinW / 4, counterY + counterT / 2 - basinDepth / 2, 0]}>
          <boxGeometry args={[basinW / 2 - 0.5, basinDepth, basinD]} />
          <meshStandardMaterial color={COL.metalDark} roughness={0.25} metalness={0.7} />
        </mesh>
      ))}
      {/* Faucet base */}
      <mesh position={[0, counterY + counterT / 2 + 0.5, -d * 0.32]}>
        <cylinderGeometry args={[0.5, 0.5, 1.5, 12]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
      {/* Faucet riser */}
      <mesh position={[0, counterY + 4.5, -d * 0.32]}>
        <cylinderGeometry args={[0.4, 0.4, 6, 12]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
      {/* Faucet spout */}
      <mesh position={[0, counterY + 7.5, -d * 0.18]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 4, 12]} />
        <meshStandardMaterial color={COL.chrome} roughness={0.15} metalness={0.9} />
      </mesh>
    </group>
  );
}

function DishwasherModel({ width: w, depth: d }: ModelProps) {
  const h = 34;
  return (
    <group>
      {/* Body */}
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.appliance} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Door face */}
      <mesh position={[0, h / 2 - 1.5, d / 2 + 0.1]} castShadow>
        <boxGeometry args={[w - 0.4, h - 5, 0.3]} />
        <meshStandardMaterial color={COL.metalLight} roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Control panel at top */}
      <mesh position={[0, h - 1.5, d / 2 + 0.1]} castShadow>
        <boxGeometry args={[w - 0.4, 3, 0.3]} />
        <meshStandardMaterial color={COL.applianceDark} roughness={0.4} metalness={0.4} />
      </mesh>
      {/* Handle */}
      <mesh position={[0, h - 5, d / 2 + 0.55]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.4, 0.4, w - 4, 10]} />
        <meshStandardMaterial color={COL.metalDark} roughness={0.2} metalness={0.85} />
      </mesh>
    </group>
  );
}

function IslandModel({ width: w, depth: d, cabinetColor, countertopColor }: ModelProps & {
  cabinetColor: string; countertopColor: string;
}) {
  const h = 36;
  const counterT = 2;
  const cabH = h - counterT;
  // Doors per ~30" of width.
  const doors = Math.max(2, Math.round(w / 30));
  return (
    <group>
      {/* Cabinet body */}
      <mesh position={[0, cabH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, cabH, d]} />
        <meshStandardMaterial color={cabinetColor} roughness={0.7} />
      </mesh>
      {/* Door faces */}
      {Array.from({ length: doors }, (_, i) => {
        const dw = (w - 0.6) / doors;
        const dx = -w / 2 + 0.3 + dw / 2 + i * dw;
        return (
          <mesh key={i} position={[dx, cabH / 2, d / 2 + 0.15]} castShadow>
            <boxGeometry args={[dw - 0.3, cabH - 2, 0.4]} />
            <meshStandardMaterial color={cabinetColor} roughness={0.65} />
          </mesh>
        );
      })}
      {/* Toe kick */}
      <mesh position={[0, 1.5, d / 2 - 1]}>
        <boxGeometry args={[w - 0.5, 3, 0.2]} />
        <meshStandardMaterial color={COL.fabricDark} roughness={0.9} />
      </mesh>
      {/* Counter top — overhang for seating on one side */}
      <mesh position={[0, cabH + counterT / 2, 3]} castShadow>
        <boxGeometry args={[w + 1, counterT, d + 6]} />
        <meshStandardMaterial color={countertopColor} roughness={0.35} />
      </mesh>
    </group>
  );
}

// ── Seating ──────────────────────────────────────────────────────────────
function UpholsteredSofa({ width: w, depth: d, cushions }: ModelProps & { cushions: number }) {
  const armW = 6;
  const armH = 28;
  const backH = 32;
  const baseH = 16;
  const seatY = baseH + 2;
  const cushionW = (w - armW * 2) / cushions;
  return (
    <group>
      {/* Base block (the platform that holds cushions) */}
      <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, baseH, d]} />
        <meshStandardMaterial color={COL.fabricDark} roughness={0.9} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, baseH + backH / 2, -d / 2 + 4]} castShadow>
        <boxGeometry args={[w, backH, 8]} />
        <meshStandardMaterial color={COL.fabricBeige} roughness={0.9} />
      </mesh>
      {/* Arms */}
      {[-1, 1].map(sx => (
        <mesh key={sx} position={[sx * (w / 2 - armW / 2), armH / 2, 0]} castShadow>
          <boxGeometry args={[armW, armH, d]} />
          <meshStandardMaterial color={COL.fabricBeige} roughness={0.9} />
        </mesh>
      ))}
      {/* Seat cushions */}
      {Array.from({ length: cushions }, (_, i) => {
        const cx = -((cushions - 1) * cushionW) / 2 + i * cushionW;
        return (
          <mesh key={`s${i}`} position={[cx, seatY + 2, 1]} castShadow>
            <boxGeometry args={[cushionW - 0.5, 4, d - 10]} />
            <meshStandardMaterial color={COL.fabricBeige} roughness={0.95} />
          </mesh>
        );
      })}
      {/* Back pillows */}
      {Array.from({ length: cushions }, (_, i) => {
        const cx = -((cushions - 1) * cushionW) / 2 + i * cushionW;
        return (
          <mesh key={`b${i}`} position={[cx, seatY + 12, -d / 2 + 10]} castShadow>
            <boxGeometry args={[cushionW - 0.5, 14, 5]} />
            <meshStandardMaterial color={COL.fabricBeige} roughness={0.95} />
          </mesh>
        );
      })}
      {/* Wooden legs */}
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - 2), 1.5, sz * (d / 2 - 2)]}>
          <boxGeometry args={[1.5, 3, 1.5]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function ArmchairModel({ width: w, depth: d }: ModelProps) {
  // Same shape as sofa but 1 cushion
  return <UpholsteredSofa width={w} depth={d} cushions={1} />;
}

// ── Tables ───────────────────────────────────────────────────────────────
function SimpleTableModel({ width: w, depth: d, kind }: ModelProps & { kind: FurnitureKind }) {
  const h = kind === 'coffee-table' ? 17 : 24;
  const topT = 1.2;
  const legR = 1;
  const inset = 2.5;
  return (
    <group>
      {/* Top */}
      <mesh position={[0, h - topT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.7} />
      </mesh>
      {/* 4 cylindrical legs */}
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - inset), (h - topT) / 2, sz * (d / 2 - inset)]} castShadow>
          <cylinderGeometry args={[legR, legR * 0.8, h - topT, 12]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function TvConsoleModel({ width: w, depth: d }: ModelProps) {
  const h = 24;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
      </mesh>
      {/* Top */}
      <mesh position={[0, h + 0.3, 0]} castShadow>
        <boxGeometry args={[w + 0.4, 0.6, d + 0.4]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.7} />
      </mesh>
      {/* 3 sliding doors */}
      {[-1, 0, 1].map(sx => (
        <mesh key={sx} position={[sx * w / 3, h / 2 + 2, d / 2 + 0.1]}>
          <boxGeometry args={[w / 3 - 0.6, h - 6, 0.3]} />
          <meshStandardMaterial color={COL.woodMed} roughness={0.75} />
        </mesh>
      ))}
      {/* Open shelf at bottom */}
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[w - 1, 0.5, d - 1]} />
        <meshStandardMaterial color={COL.woodLight} roughness={0.7} />
      </mesh>
    </group>
  );
}

function BookshelfModel({ width: w, depth: d }: ModelProps) {
  const h = 72;
  const shelves = 5;
  const shelfT = 0.8;
  return (
    <group>
      {/* Back panel */}
      <mesh position={[0, h / 2, -d / 2 + 0.2]} receiveShadow>
        <boxGeometry args={[w, h, 0.4]} />
        <meshStandardMaterial color={COL.woodDark} roughness={0.85} />
      </mesh>
      {/* Sides */}
      {[-1, 1].map(sx => (
        <mesh key={sx} position={[sx * (w / 2 - 0.5), h / 2, 0]} castShadow>
          <boxGeometry args={[1, h, d]} />
          <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
        </mesh>
      ))}
      {/* Shelves */}
      {Array.from({ length: shelves + 1 }, (_, i) => {
        const y = (h / shelves) * i;
        return (
          <mesh key={i} position={[0, y, 0]} castShadow>
            <boxGeometry args={[w - 2, shelfT, d - 0.5]} />
            <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
          </mesh>
        );
      })}
      {/* Books (decorative): random colored boxes on a few shelves */}
      {Array.from({ length: shelves }, (_, si) => {
        const y = (h / shelves) * si + shelfT / 2 + 4;
        const bookColors = ['#7a3a3a', '#5a6a4a', '#3a4a6a', '#7a5a3a', '#5a4a6a'];
        return (
          <group key={`row${si}`}>
            {Array.from({ length: 6 }, (_, bi) => {
              const x = -w / 2 + 2 + (w - 4) * (bi + 0.5) / 6;
              const bookH = 7 + (bi % 3);
              return (
                <mesh key={bi} position={[x, y + bookH / 2 - 4, 0]} castShadow>
                  <boxGeometry args={[(w - 4) / 6 - 0.4, bookH, d - 2]} />
                  <meshStandardMaterial color={bookColors[(si + bi) % bookColors.length]} roughness={0.85} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

// ── Dining ───────────────────────────────────────────────────────────────
function DiningTableModel({ width: w, depth: d }: ModelProps) {
  const h = 30;
  const topT = 1.5;
  const legR = 1.5;
  const inset = 3;
  return (
    <group>
      <mesh position={[0, h - topT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.7} />
      </mesh>
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - inset), (h - topT) / 2, sz * (d / 2 - inset)]} castShadow>
          <cylinderGeometry args={[legR, legR * 0.9, h - topT, 12]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
        </mesh>
      ))}
      {/* Apron (stretcher under the top connecting legs) */}
      {[-1, 1].map(sz => (
        <mesh key={`a${sz}`} position={[0, h - topT - 1.5, sz * (d / 2 - inset)]}>
          <boxGeometry args={[w - inset * 2.5, 2, 1]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function DiningChairModel({ width: w, depth: d }: ModelProps) {
  const seatH = 18;
  const seatT = 1.5;
  const backH = 16;
  const legR = 0.5;
  return (
    <group>
      {/* Seat */}
      <mesh position={[0, seatH, 0]} castShadow>
        <boxGeometry args={[w, seatT, d]} />
        <meshStandardMaterial color={COL.fabricBeige} roughness={0.9} />
      </mesh>
      {/* 4 legs */}
      {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - 0.8), seatH / 2, sz * (d / 2 - 0.8)]} castShadow>
          <cylinderGeometry args={[legR, legR, seatH, 10]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
        </mesh>
      ))}
      {/* Back rest — two vertical posts + horizontal slat */}
      {[-1, 1].map(sx => (
        <mesh key={`bp${sx}`} position={[sx * (w / 2 - 0.8), seatH + backH / 2, -d / 2 + 0.8]} castShadow>
          <cylinderGeometry args={[legR, legR, backH, 10]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, seatH + backH - 2, -d / 2 + 0.8]} castShadow>
        <boxGeometry args={[w - 2, 4, 0.8]} />
        <meshStandardMaterial color={COL.woodDark} roughness={0.8} />
      </mesh>
    </group>
  );
}

function BuffetModel({ width: w, depth: d }: ModelProps) {
  const h = 36;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
      {/* Top */}
      <mesh position={[0, h + 0.3, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.6, d + 0.5]} />
        <meshStandardMaterial color={COL.woodLight} roughness={0.7} />
      </mesh>
      {/* Top drawer row (3 drawers) */}
      {[-1, 0, 1].map(sx => (
        <mesh key={sx} position={[sx * w / 3, h - 4, d / 2 + 0.1]}>
          <boxGeometry args={[w / 3 - 0.8, 6, 0.4]} />
          <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
        </mesh>
      ))}
      {/* Lower door row (3 doors) */}
      {[-1, 0, 1].map(sx => (
        <mesh key={`d${sx}`} position={[sx * w / 3, (h - 10) / 2, d / 2 + 0.1]}>
          <boxGeometry args={[w / 3 - 0.8, h - 12, 0.4]} />
          <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
        </mesh>
      ))}
    </group>
  );
}

// ── Office ───────────────────────────────────────────────────────────────
function DeskModel({ width: w, depth: d }: ModelProps) {
  const h = 30;
  const topT = 1.5;
  const pedW = 18;
  // Top + 1 cabinet pedestal on the right + 2 legs on the left
  return (
    <group>
      <mesh position={[0, h - topT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.7} />
      </mesh>
      {/* Pedestal cabinet on +X side */}
      <mesh position={[w / 2 - pedW / 2 - 1, (h - topT) / 2, 0]} castShadow>
        <boxGeometry args={[pedW, h - topT, d - 2]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
      {/* Drawer fronts */}
      {[0, 1, 2].map(i => (
        <mesh key={i} position={[w / 2 - pedW / 2 - 1, 4 + i * 7, (d - 2) / 2 + 0.1]}>
          <boxGeometry args={[pedW - 1, 6, 0.4]} />
          <meshStandardMaterial color={COL.woodLight} roughness={0.75} />
        </mesh>
      ))}
      {/* Two legs on -X side */}
      {[-1, 1].map(sz => (
        <mesh key={sz} position={[-w / 2 + 1.5, (h - topT) / 2, sz * (d / 2 - 1.5)]} castShadow>
          <boxGeometry args={[1.5, h - topT, 1.5]} />
          <meshStandardMaterial color={COL.woodDark} roughness={0.85} />
        </mesh>
      ))}
      {/* Modesty panel between the legs */}
      <mesh position={[-w / 2 + 1.5, h - topT - 4, 0]}>
        <boxGeometry args={[0.5, h - topT - 8, d - 5]} />
        <meshStandardMaterial color={COL.woodMed} roughness={0.8} />
      </mesh>
    </group>
  );
}

function OfficeChairModel({ width: w, depth: d }: ModelProps) {
  const seatY = 18;
  const seatT = 3;
  const armRadius = w / 2 + 1;
  const wheels = 5;
  // 5-star base of cylinders + 5 wheels + post + seat + back
  return (
    <group>
      {/* Wheels and spokes */}
      {Array.from({ length: wheels }, (_, i) => {
        const a = (i / wheels) * Math.PI * 2;
        const ex = Math.cos(a) * armRadius;
        const ez = Math.sin(a) * armRadius;
        return (
          <group key={i}>
            {/* Spoke from origin to wheel */}
            <mesh position={[ex / 2, 1.5, ez / 2]} rotation={[0, -a, 0]}>
              <boxGeometry args={[armRadius, 1.5, 1.5]} />
              <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
            </mesh>
            {/* Wheel — small sphere */}
            <mesh position={[ex, 1, ez]} castShadow>
              <sphereGeometry args={[1, 12, 8]} />
              <meshStandardMaterial color={COL.fabricBlack} roughness={0.7} />
            </mesh>
          </group>
        );
      })}
      {/* Center post */}
      <mesh position={[0, seatY / 2 + 2, 0]} castShadow>
        <cylinderGeometry args={[1, 1, seatY - 2, 14]} />
        <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
      </mesh>
      {/* Seat */}
      <mesh position={[0, seatY + seatT / 2, 0]} castShadow>
        <boxGeometry args={[w, seatT, d]} />
        <meshStandardMaterial color={COL.fabricBlack} roughness={0.9} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, seatY + seatT + 11, -d / 2 + 1.5]} castShadow>
        <boxGeometry args={[w - 2, 22, 2]} />
        <meshStandardMaterial color={COL.fabricBlack} roughness={0.9} />
      </mesh>
      {/* Armrests */}
      {[-1, 1].map(sx => (
        <group key={sx}>
          <mesh position={[sx * (w / 2 - 0.5), seatY + 5, 0]} castShadow>
            <boxGeometry args={[1, 6, d - 4]} />
            <meshStandardMaterial color={COL.metalDark} roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[sx * (w / 2 - 0.5), seatY + 8.5, 0]}>
            <boxGeometry args={[2, 1.2, d - 6]} />
            <meshStandardMaterial color={COL.fabricBlack} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FilingCabinetModel({ width: w, depth: d }: ModelProps) {
  const h = 52;
  const drawers = 4;
  const drawerH = h / drawers;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={COL.metalLight} roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Drawer fronts and pulls */}
      {Array.from({ length: drawers }, (_, i) => {
        const y = drawerH / 2 + i * drawerH;
        return (
          <group key={i}>
            <mesh position={[0, y, d / 2 + 0.1]}>
              <boxGeometry args={[w - 0.6, drawerH - 0.6, 0.3]} />
              <meshStandardMaterial color={COL.metalLight} roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0, y, d / 2 + 0.4]}>
              <boxGeometry args={[w * 0.4, 0.8, 0.6]} />
              <meshStandardMaterial color={COL.metalDark} roughness={0.3} metalness={0.7} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
