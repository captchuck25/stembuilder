// Bridge Builder — stress-test vehicle art.
// Vehicles are inlined SVG (converted from public/ui/vehicles/*.svg) so the
// wheels can spin with travel and the body can pitch to follow the deck.
// renderVehicle(type, x, y) with no motion arg renders the same static art
// as before.

import React from "react";
import { type VehicleType, nearestLoadTon } from "../engine/members";

export function getVehicleType(nextLoadLb: number): VehicleType {
  const tons = nearestLoadTon(nextLoadLb);
  if (tons === 30) return "Semi";
  if (tons === 15) return "Box Truck";
  if (tons === 8) return "Pickup Truck";
  return "Small Car";
}

export type VehicleMotion = {
  /** Body rotation in degrees (positive = nose down-right in SVG coords). */
  pitchDeg?: number;
  /** Distance traveled in world SVG units — drives wheel spin. */
  travel?: number;
};

type WheelProps = {
  cx: number;
  cy: number;
  /** Ring radii, outermost first — matches the original concentric art. */
  rings: [number, number, number, number];
  spin: number;
};

// Concentric wheel with bold spokes and an offset lug dot so rotation reads
// even at the small on-screen scale vehicles render at.
function Wheel({ cx, cy, rings, spin }: WheelProps) {
  const [tire, rim, hub, cap] = rings;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${spin})`}>
      <circle r={tire} fill="#222" />
      <circle r={rim} fill="#6b6b6b" />
      {[0, 60, 120].map((a) => (
        <line
          key={a}
          x1={-rim * 0.95}
          y1={0}
          x2={rim * 0.95}
          y2={0}
          transform={`rotate(${a})`}
          stroke="#2b2b2b"
          strokeWidth={tire * 0.24}
        />
      ))}
      <circle r={hub} fill="#b8b8b8" />
      {/* offset lug dot — the strongest rotation cue */}
      <circle cx={rim * 0.6} cy={0} r={tire * 0.14} fill="#e9e9e9" />
      <circle r={cap} fill="#e6e6e6" />
    </g>
  );
}

/** Wheel spin (deg) for a wheel of file-space radius rFile at scale, having
 *  traveled `travel` world units. dir flips spin for mirrored vehicles. */
function spinDeg(travel: number, rFile: number, scale: number, dir: 1 | -1): number {
  const rWorld = rFile * scale;
  if (rWorld <= 0) return 0;
  return ((travel / rWorld) * 180) / Math.PI * dir;
}

function PickupTruck({ x, y, motion }: { x: number; y: number; motion: Required<VehicleMotion> }) {
  // Replicates <image x={x-96} y={y-32} width=192 height=44 meet> placement.
  const scale = 192 / 1200;
  const yOff = (44 - 260 * scale) / 2;
  const spin = spinDeg(motion.travel, 36, scale, 1);
  return (
    <g transform={`rotate(${motion.pitchDeg} ${x} ${y}) translate(${x - 96} ${y - 32 + yOff}) scale(${scale})`}>
      <defs>
        <linearGradient id="veh-pk-body" x1="0" x2="1">
          <stop offset="0" stopColor="#3a7bd5" />
          <stop offset="1" stopColor="#1f4f9e" />
        </linearGradient>
        <linearGradient id="veh-pk-hl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="veh-pk-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>
      <g filter="url(#veh-pk-shadow)">
        <rect x="420" y="120" width="260" height="70" rx="8" fill="url(#veh-pk-body)" stroke="#14366b" strokeWidth="4" />
        <rect x="440" y="132" width="220" height="40" rx="4" fill="#1a3f7a" opacity="0.45" stroke="none" />
        <path d="M420,120 L420,190" stroke="#14366b" strokeWidth="4" opacity="0.6" />
        <path
          d="M680,178 L680,120 C680,80 710,56 756,56 L865,56 C905,56 930,78 930,118 L930,178 C930,204 916,220 892,220 L720,220 C696,220 680,204 680,178 Z"
          fill="url(#veh-pk-body)" stroke="#14366b" strokeWidth="4" strokeLinejoin="round"
        />
        <path
          d="M930,168 C950,168 964,156 964,140 L964,118 C964,98 950,84 930,84 L900,84 L900,220 C916,220 930,204 930,178 Z"
          fill="#4c8ef7" opacity="0.95" stroke="#14366b" strokeWidth="4"
        />
        <path
          d="M780,86 L866,86 C884,86 898,100 900,118 L904,150 L788,150 Z"
          fill="#bfe8ff" stroke="#14366b" strokeWidth="4"
        />
        <rect x="800" y="122" width="70" height="38" rx="6" fill="#7fd0ff" opacity="0.35" stroke="#14366b" strokeWidth="4" />
        <path d="M846,86 L846,160" stroke="#14366b" strokeWidth="4" opacity="0.5" />
        <path d="M920,114 L980,128" stroke="#1f1f1f" strokeWidth="10" strokeLinecap="round" />
        <rect x="966" y="120" width="26" height="12" rx="4" fill="#1f1f1f" />
        <rect x="968" y="186" width="18" height="22" rx="4" fill="#ffb000" stroke="#b44b00" strokeWidth="4" />
        <path
          d="M440,150 C520,120 700,116 900,150 C820,150 680,166 520,190 C480,196 460,202 440,206 Z"
          fill="url(#veh-pk-hl)" opacity="0.35"
        />
        <Wheel cx={520} cy={226} rings={[36, 25, 13, 4]} spin={spin} />
        <Wheel cx={820} cy={226} rings={[36, 25, 13, 4]} spin={spin} />
        <path d="M486,218 C486,190 508,172 536,172 C564,172 586,190 586,218" fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round" />
        <path d="M786,218 C786,190 808,172 836,172 C864,172 886,190 886,218" fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round" />
      </g>
    </g>
  );
}

function BoxTruck({ x, y, motion }: { x: number; y: number; motion: Required<VehicleMotion> }) {
  // Replicates <image x={x-92} y={y-32} width=184 height=44 meet> placement.
  const scale = 184 / 1200;
  const yOff = (44 - 260 * scale) / 2;
  const spinSmall = spinDeg(motion.travel, 34, scale, 1);
  const spinBig = spinDeg(motion.travel, 38, scale, 1);
  return (
    <g transform={`rotate(${motion.pitchDeg} ${x} ${y}) translate(${x - 92} ${y - 32 + yOff}) scale(${scale})`}>
      <defs>
        <linearGradient id="veh-bt-cab" x1="0" x2="1">
          <stop offset="0" stopColor="#1aa0ff" />
          <stop offset="1" stopColor="#0e79d6" />
        </linearGradient>
        <linearGradient id="veh-bt-box" x1="0" x2="1">
          <stop offset="0" stopColor="#d7dadd" />
          <stop offset="1" stopColor="#c6c9cc" />
        </linearGradient>
        <filter id="veh-bt-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>
      <g filter="url(#veh-bt-shadow)">
        <rect x="340" y="64" width="360" height="110" rx="6" fill="url(#veh-bt-box)" stroke="#8e8f92" strokeWidth="4" />
        <path
          d="M350,86 C420,70 560,70 690,90 L690,90 C600,100 500,118 360,128 Z"
          fill="#ffffff" opacity="0.25"
        />
        <Wheel cx={455} cy={220} rings={[34, 24, 12, 4]} spin={spinSmall} />
        <Wheel cx={565} cy={220} rings={[34, 24, 12, 4]} spin={spinSmall} />
        <path
          d="M760,178 L760,118 C760,78 790,52 836,52 L945,52 C985,52 1010,74 1010,114 L1010,178 C1010,204 996,220 972,220 L800,220 C776,220 760,204 760,178 Z"
          fill="url(#veh-bt-cab)" stroke="#0b4f8a" strokeWidth="4" strokeLinejoin="round"
        />
        <path
          d="M1010,168 C1030,168 1044,156 1044,140 L1044,118 C1044,98 1030,84 1010,84 L980,84 L980,220 C996,220 1010,204 1010,178 Z"
          fill="#2ab0ff" opacity="0.95" stroke="#0b4f8a" strokeWidth="4"
        />
        <path
          d="M860,84 L946,84 C964,84 978,98 980,116 L984,150 L868,150 Z"
          fill="#bfe8ff" stroke="#0b4f8a" strokeWidth="4" opacity="0.95"
        />
        <rect x="880" y="120" width="70" height="40" rx="6" fill="#7fd0ff" opacity="0.35" stroke="#0b4f8a" strokeWidth="4" />
        <path d="M1000,114 L1060,128" stroke="#1f1f1f" strokeWidth="10" strokeLinecap="round" />
        <rect x="1046" y="120" width="26" height="12" rx="4" fill="#1f1f1f" />
        <rect x="1048" y="186" width="18" height="22" rx="4" fill="#ffb000" stroke="#b44b00" strokeWidth="4" />
        <Wheel cx={860} cy={220} rings={[38, 26, 14, 5]} spin={spinBig} />
        <Wheel cx={960} cy={220} rings={[34, 23, 12, 4]} spin={spinSmall} />
      </g>
    </g>
  );
}

function Semi({ x, y, motion }: { x: number; y: number; motion: Required<VehicleMotion> }) {
  // Replicates <image x={x-105} y={y-34} width=210 height=46 meet> placement.
  const scale = 210 / 1200;
  const yOff = (46 - 260 * scale) / 2;
  // Art is drawn mirrored (scale(-1 1)), so spin flips to keep rolling forward.
  const spinSmall = spinDeg(motion.travel, 34, scale, -1);
  const spinBig = spinDeg(motion.travel, 38, scale, -1);
  return (
    <g transform={`rotate(${motion.pitchDeg} ${x} ${y}) translate(${x - 105} ${y - 34 + yOff}) scale(${scale})`}>
      <defs>
        <linearGradient id="veh-sm-cab" x1="0" x2="1">
          <stop offset="0" stopColor="#1aa0ff" />
          <stop offset="1" stopColor="#0e79d6" />
        </linearGradient>
        <linearGradient id="veh-sm-trailer" x1="0" x2="1">
          <stop offset="0" stopColor="#d7dadd" />
          <stop offset="1" stopColor="#c6c9cc" />
        </linearGradient>
        <linearGradient id="veh-sm-trailerTop" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#eef0f2" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.15" />
        </linearGradient>
        <filter id="veh-sm-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>
      <g transform="translate(1200 0) scale(-1 1)">
        <ellipse cx="650" cy="232" rx="520" ry="14" fill="#000" opacity="0.12" />
        <g filter="url(#veh-sm-shadow)">
          <rect x="310" y="34" width="850" height="132" rx="6" fill="url(#veh-sm-trailer)" stroke="#8e8f92" strokeWidth="4" />
          <path
            d="M330,58 C520,10 810,10 1128,58 L1128,58 C980,70 760,92 520,132 C460,142 390,150 330,154 Z"
            fill="url(#veh-sm-trailerTop)" opacity="0.65"
          />
          <path
            d="M410,140 C560,92 770,82 975,110 C1045,118 1100,116 1140,100 C1120,126 1070,150 995,154 C780,166 610,172 430,168 Z"
            fill="#f3f4f6" opacity="0.55"
          />
          <g fill="#8b8c8f" opacity="0.55">
            <g transform="translate(330 48)">
              {Array.from({ length: 21 }, (_, i) => (
                <circle key={`rt-${i}`} cx={i * 40} cy={0} r={2.2} />
              ))}
            </g>
            <g transform="translate(330 160)">
              {Array.from({ length: 21 }, (_, i) => (
                <circle key={`rb-${i}`} cx={i * 40} cy={0} r={2.2} />
              ))}
            </g>
          </g>
          <rect x="340" y="168" width="720" height="18" rx="3" fill="#9a9ca0" opacity="0.85" />
          <rect x="360" y="186" width="720" height="18" rx="3" fill="#2b2b2b" />
          <rect x="1154" y="188" width="12" height="18" rx="2" fill="#ff7a00" stroke="#b44b00" strokeWidth="3" />
          <rect x="1138" y="180" width="10" height="52" rx="2" fill="#1f1f1f" />
          <rect x="1130" y="228" width="26" height="8" rx="2" fill="#1f1f1f" />
          <g transform="translate(860 0)">
            <path
              d="M-6,210 C-6,176 20,156 54,156 C88,156 114,176 114,210"
              fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round"
            />
            <Wheel cx={40} cy={210} rings={[34, 24, 12, 4]} spin={spinSmall} />
            <Wheel cx={120} cy={210} rings={[34, 24, 12, 4]} spin={spinSmall} />
            <Wheel cx={200} cy={210} rings={[34, 24, 12, 4]} spin={spinSmall} />
          </g>
        </g>
        <g filter="url(#veh-sm-shadow)">
          <path
            d="M40,178 L40,120 C40,78 68,50 112,50 L210,50 C250,50 274,72 274,112 L274,178 C274,204 260,220 236,220 L80,220 C56,220 40,204 40,178 Z"
            fill="url(#veh-sm-cab)" stroke="#0b4f8a" strokeWidth="4" strokeLinejoin="round"
          />
          <path
            d="M40,162 C26,162 18,152 18,140 L18,118 C18,100 32,86 50,86 L78,86 L78,220 L80,220 C56,220 40,204 40,178 Z"
            fill="#2ab0ff" opacity="0.95" stroke="#0b4f8a" strokeWidth="4"
          />
          <path
            d="M88,82 L180,82 C198,82 212,96 214,114 L218,150 L96,150 L88,92 Z"
            fill="#bfe8ff" stroke="#0b4f8a" strokeWidth="4" opacity="0.95"
          />
          <rect x="122" y="120" width="70" height="40" rx="6" fill="#7fd0ff" opacity="0.35" stroke="#0b4f8a" strokeWidth="4" />
          <path d="M150,86 L150,220" stroke="#0b4f8a" strokeWidth="4" opacity="0.55" />
          <rect x="182" y="162" width="26" height="16" rx="4" fill="#2b2b2b" opacity="0.9" />
          <g opacity="0.5" stroke="#0b4f8a" strokeWidth="4">
            <path d="M232,96 L262,96" />
            <path d="M232,112 L262,112" />
            <path d="M232,128 L262,128" />
          </g>
          <path d="M72,114 L34,128" stroke="#1f1f1f" strokeWidth="10" strokeLinecap="round" />
          <rect x="22" y="120" width="26" height="12" rx="4" fill="#1f1f1f" />
          <rect x="14" y="186" width="18" height="22" rx="4" fill="#ffb000" stroke="#b44b00" strokeWidth="4" />
          <rect x="16" y="190" width="14" height="14" rx="3" fill="#fff" opacity="0.55" stroke="none" />
          <rect x="240" y="206" width="110" height="30" rx="6" fill="#cfd3d6" stroke="#8a8d90" strokeWidth="4" />
          <circle cx="266" cy="222" r="6" fill="#8a8d90" />
          <circle cx="296" cy="222" r="6" fill="#8a8d90" />
          <circle cx="326" cy="222" r="6" fill="#8a8d90" />
          <rect x="300" y="190" width="34" height="18" rx="4" fill="#2b2b2b" />
          <Wheel cx={126} cy={220} rings={[38, 26, 14, 5]} spin={spinBig} />
          <Wheel cx={330} cy={220} rings={[34, 23, 12, 4]} spin={spinSmall} />
        </g>
        <g opacity="0.6">
          <rect x="470" y="204" width="420" height="10" rx="3" fill="#7e7f82" />
          <rect x="510" y="214" width="12" height="18" rx="2" fill="#7e7f82" />
          <rect x="590" y="214" width="12" height="18" rx="2" fill="#7e7f82" />
          <rect x="670" y="214" width="12" height="18" rx="2" fill="#7e7f82" />
          <rect x="750" y="214" width="12" height="18" rx="2" fill="#7e7f82" />
          <rect x="830" y="214" width="12" height="18" rx="2" fill="#7e7f82" />
        </g>
      </g>
    </g>
  );
}

function SmallCar({ x, y, motion }: { x: number; y: number; motion: Required<VehicleMotion> }) {
  // Replicates <image x={x-92} y={y-31} width=184 height=42 meet> placement.
  const scale = 184 / 1200;
  const yOff = (42 - 260 * scale) / 2;
  // Art is drawn mirrored (scale(-1 1)), so spin flips to keep rolling forward.
  const spin = spinDeg(motion.travel, 34, scale, -1);
  return (
    <g transform={`rotate(${motion.pitchDeg} ${x} ${y}) translate(${x - 92} ${y - 31 + yOff}) scale(${scale})`}>
      <defs>
        <linearGradient id="veh-sc-body" x1="0" x2="1">
          <stop offset="0" stopColor="#d35a3a" />
          <stop offset="1" stopColor="#a83c26" />
        </linearGradient>
        <linearGradient id="veh-sc-hl" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <filter id="veh-sc-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>
      <g transform="translate(1200 0) scale(-1 1)">
        <g filter="url(#veh-sc-shadow)">
          <path
            d="M420,190 C410,162 430,138 466,128 L560,102 C610,88 700,88 760,110 L820,132 C860,146 880,166 884,190 L884,202 C884,216 872,226 858,226 L446,226 C432,226 420,216 420,202 Z"
            fill="url(#veh-sc-body)" stroke="#5b2016" strokeWidth="4" strokeLinejoin="round"
          />
          <path
            d="M560,106 C590,78 642,64 700,66 C754,68 796,86 818,112 L760,110 C702,90 620,90 560,106 Z"
            fill="#c24a31" stroke="#5b2016" strokeWidth="4" strokeLinejoin="round"
          />
          <path
            d="M590,112 C612,92 650,82 695,84 C738,86 770,98 788,116 L740,132 C706,120 646,120 602,128 Z"
            fill="#bfe8ff" opacity="0.95" stroke="#5b2016" strokeWidth="4" strokeLinejoin="round"
          />
          <path d="M690,88 L690,128" stroke="#5b2016" strokeWidth="4" opacity="0.6" />
          <path
            d="M448,170 C520,140 650,134 818,164 C760,156 640,168 520,196 C492,202 466,208 448,214 Z"
            fill="url(#veh-sc-hl)" opacity="0.35"
          />
          <rect x="410" y="186" width="18" height="20" rx="4" fill="#ffb000" stroke="#b44b00" strokeWidth="4" />
          <rect x="412" y="190" width="14" height="12" rx="3" fill="#fff" opacity="0.55" stroke="none" />
          <rect x="872" y="192" width="14" height="18" rx="4" fill="#ff5a5a" stroke="#8a1c1c" strokeWidth="4" />
          <Wheel cx={520} cy={226} rings={[34, 24, 12, 4]} spin={spin} />
          <Wheel cx={760} cy={226} rings={[34, 24, 12, 4]} spin={spin} />
          <path d="M486,218 C486,194 504,178 526,178 C548,178 566,194 566,218" fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round" />
          <path d="M726,218 C726,194 744,178 766,178 C788,178 806,194 806,218" fill="none" stroke="#303030" strokeWidth="10" strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
}

export function renderVehicle(
  type: VehicleType,
  x: number,
  y: number,
  motion?: VehicleMotion
) {
  const m: Required<VehicleMotion> = {
    pitchDeg: motion?.pitchDeg ?? 0,
    travel: motion?.travel ?? 0,
  };

  if (type === "People Walking") {
    return (
      <g transform={`translate(${x} ${y}) scale(3)`}>
        {[0, 14, 28].map((dx, i) => (
          <g key={`walker-${i}`} transform={`translate(${dx} 0)`}>
            <circle cx={0} cy={0} r={3} fill="#333" />
            <line x1={0} y1={3} x2={0} y2={12} stroke="#333" strokeWidth={1.5} />
            <line x1={0} y1={6} x2={-5} y2={10} stroke="#333" strokeWidth={1.5} />
            <line x1={0} y1={6} x2={5} y2={10} stroke="#333" strokeWidth={1.5} />
          </g>
        ))}
      </g>
    );
  }

  if (type === "Horse & Carriage") {
    return (
      <g transform={`translate(${x} ${y}) scale(3)`}>
        {/* carriage */}
        <rect x={-10} y={-12} width={18} height={10} fill="#4a4a4a" rx={2} />
        <rect x={-4} y={-16} width={8} height={4} fill="#5a5a5a" rx={1} />
        <circle cx={-5} cy={6} r={4} fill="#333" />
        <circle cx={7} cy={6} r={4} fill="#333" />
        {/* harness */}
        <line x1={8} y1={-7} x2={14} y2={-7} stroke="#555" strokeWidth={1.2} />
        {/* horse */}
        <ellipse cx={18} cy={-6} rx={4} ry={2.6} fill="#555" />
        <circle cx={22} cy={-8} r={1.8} fill="#555" />
        <line x1={16} y1={-4} x2={16} y2={-1} stroke="#444" strokeWidth={1} />
        <line x1={20} y1={-4} x2={20} y2={-1} stroke="#444" strokeWidth={1} />
      </g>
    );
  }

  if (type === "Small Car") return <SmallCar x={x} y={y} motion={m} />;
  if (type === "Pickup Truck") return <PickupTruck x={x} y={y} motion={m} />;
  if (type === "Box Truck") return <BoxTruck x={x} y={y} motion={m} />;
  if (type === "Semi") return <Semi x={x} y={y} motion={m} />;

  return (
    <g transform={`translate(${x} ${y}) scale(3)`}>
      <rect x={-24} y={-10} width={38} height={10} fill="#4b5b64" rx={2} />
      <rect x={-6} y={-15} width={14} height={5} fill="#5f6f79" rx={1} />
      <rect x={-22} y={-8} width={8} height={3} fill="#404d54" />
      <circle cx={-16} cy={6} r={4} fill="#2d3438" />
      <circle cx={-4} cy={6} r={4} fill="#2d3438" />
      <circle cx={8} cy={6} r={4} fill="#2d3438" />
    </g>
  );
}
