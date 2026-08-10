// Bridge Builder — stress-test vehicle art. Extracted verbatim from page.tsx
// (no behavior change).

import React from "react";
import { type VehicleType, nearestLoadTon } from "../engine/members";

export function getVehicleType(nextLoadLb: number): VehicleType {
  const tons = nearestLoadTon(nextLoadLb);
  if (tons === 30) return "Semi";
  if (tons === 15) return "Box Truck";
  if (tons === 8) return "Pickup Truck";
  return "Small Car";
}

export function renderVehicle(type: VehicleType, x: number, y: number) {
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

  if (type === "Small Car") {
    return (
      <g>
        <image
          href="/ui/vehicles/small-car.svg"
          x={x - 92}
          y={y - 31}
          width={184}
          height={42}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    );
  }

  if (type === "Pickup Truck") {
    return (
      <g>
        <image
          href="/ui/vehicles/pickup-truck.svg"
          x={x - 96}
          y={y - 32}
          width={192}
          height={44}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    );
  }

  if (type === "Box Truck") {
    return (
      <g>
        <image
          href="/ui/vehicles/box-truck.svg"
          x={x - 92}
          y={y - 32}
          width={184}
          height={44}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    );
  }

  if (type === "Semi") {
    return (
      <g>
        <image
          href="/ui/vehicles/semi.svg"
          x={x - 105}
          y={y - 34}
          width={210}
          height={46}
          preserveAspectRatio="xMidYMid meet"
        />
      </g>
    );
  }

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
