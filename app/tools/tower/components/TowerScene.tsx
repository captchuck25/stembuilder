"use client";

import { CANVAS_HEIGHT, CANVAS_WIDTH, GROUND_Y } from "../engine/tower";

// Static backdrop behind the tower canvas: sky, distant hills, and the ground
// the footings sit on. Pure SVG so it needs no image asset and stays crisp at
// any canvas scale.
export default function TowerScene() {
  const W = CANVAS_WIDTH;
  const H = CANVAS_HEIGHT;
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="towerSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bfe0f7" />
            <stop offset="0.7" stopColor="#e6f3fb" />
            <stop offset="1" stopColor="#f4f8f3" />
          </linearGradient>
          <linearGradient id="towerDirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8a6d4d" />
            <stop offset="1" stopColor="#6d543a" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#towerSky)" />
        {/* Distant hills */}
        <path
          d={`M 0 ${GROUND_Y - 40} Q 180 ${GROUND_Y - 120} 360 ${GROUND_Y - 50} T 720 ${
            GROUND_Y - 70
          } T ${W} ${GROUND_Y - 45} L ${W} ${GROUND_Y} L 0 ${GROUND_Y} Z`}
          fill="#b9d3b0"
          opacity={0.75}
        />
        <path
          d={`M 0 ${GROUND_Y - 22} Q 260 ${GROUND_Y - 70} 520 ${GROUND_Y - 30} T 900 ${
            GROUND_Y - 40
          } T ${W} ${GROUND_Y - 20} L ${W} ${GROUND_Y} L 0 ${GROUND_Y} Z`}
          fill="#9fc296"
          opacity={0.85}
        />
        {/* Ground */}
        <rect x={0} y={GROUND_Y} width={W} height={H - GROUND_Y} fill="url(#towerDirt)" />
        <rect x={0} y={GROUND_Y} width={W} height={10} fill="#6f9a5a" />
        <line
          x1={0}
          y1={GROUND_Y}
          x2={W}
          y2={GROUND_Y}
          stroke="#4f7a3f"
          strokeWidth={2}
        />
        {Array.from({ length: 18 }).map((_, i) => {
          const x = 30 + i * 62;
          const y = GROUND_Y + 26 + (i % 3) * 18;
          return (
            <line
              key={`pebble-${i}`}
              x1={x}
              y1={y}
              x2={x + 14}
              y2={y}
              stroke="#5e4732"
              strokeWidth={2}
              strokeLinecap="round"
              opacity={0.5}
            />
          );
        })}
      </svg>
    </div>
  );
}
