import { describe, expect, it } from "vitest";
import { type Member, type Node } from "../app/tools/bridge/engine/members";
import { inspectTower } from "../app/tools/tower/engine/inspection";
import { runCrushStressTest } from "../app/tools/tower/engine/solver";
import {
  FOOTPRINT_OPTIONS,
  GROUND_Y,
  HEIGHT_OPTIONS,
  TOP_Y,
  getFootprintBounds,
  getPxPerFt,
  isGroundNode,
  isTopNode,
} from "../app/tools/tower/engine/tower";
import {
  TOWER_STYLE_INFO,
  generateTower,
  type TowerStyle,
} from "../app/tools/tower/engine/towerTemplates";

// The tube the editor defaults to; every guide must pass inspection with it.
const DEFAULT_TUBE: Member["type"] = "box_5";
const STYLES = Object.keys(TOWER_STYLE_INFO) as TowerStyle[];

function build(style: TowerStyle, heightFt: number, footprintFt: number) {
  const tpl = generateTower(style, heightFt, footprintFt);
  const px = getPxPerFt(heightFt);
  const { left } = getFootprintBounds(heightFt, footprintFt);
  const nodes: Node[] = tpl.nodes.map((n, i) => ({
    id: `n${i}`,
    x: left + n.x * px,
    y: GROUND_Y - n.y * px,
  }));
  const members: Member[] = tpl.members.map(([a, b], i) => ({
    id: `m${i}`,
    a: `n${a}`,
    b: `n${b}`,
    type: DEFAULT_TUBE,
    grade: "mild",
  }));
  return { tpl, nodes, members, feetPerUnit: 1 / px };
}

describe("every wizard template, at every height × footprint", () => {
  for (const style of STYLES) {
    for (const heightFt of HEIGHT_OPTIONS) {
      for (const footprintFt of FOOTPRINT_OPTIONS) {
        it(`${style} ${heightFt} ft × ${footprintFt} ft: on-grid, passes inspection, solves`, () => {
          const { tpl, nodes, members, feetPerUnit } = build(style, heightFt, footprintFt);

          // Traceable: every joint sits on the style's snap grid inside the box.
          const snap = TOWER_STYLE_INFO[style].snapFeet;
          for (const n of tpl.nodes) {
            expect(Math.abs(n.x / snap - Math.round(n.x / snap))).toBeLessThan(1e-9);
            expect(Math.abs(n.y / snap - Math.round(n.y / snap))).toBeLessThan(1e-9);
            expect(n.x).toBeGreaterThanOrEqual(0);
            expect(n.x).toBeLessThanOrEqual(footprintFt);
            expect(n.y).toBeGreaterThanOrEqual(0);
            expect(n.y).toBeLessThanOrEqual(heightFt);
          }
          // No duplicate joints, no duplicate members.
          const nodeKeys = new Set(tpl.nodes.map((n) => `${n.x},${n.y}`));
          expect(nodeKeys.size).toBe(tpl.nodes.length);
          const memberKeys = new Set(
            tpl.members.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`))
          );
          expect(memberKeys.size).toBe(tpl.members.length);

          expect(nodes.filter(isGroundNode).length).toBeGreaterThanOrEqual(2);
          expect(nodes.filter(isTopNode).length).toBeGreaterThanOrEqual(2);
          expect(Math.min(...nodes.map((n) => n.y))).toBeCloseTo(TOP_Y, 6);

          const insp = inspectTower({ nodes, members, feetPerUnit, heightFeet: heightFt });
          expect(insp.failReasons).toEqual([]);
          expect(insp.pass).toBe(true);

          const out = runCrushStressTest({
            nodes,
            members,
            supportIds: insp.footingIds,
            loadNodeIds: insp.topNodeIds,
            loadLb: 16000,
            feetPerUnit,
            unstableJointIds: insp.unstableJointIds,
            longMemberIds: insp.longMemberIds,
          });
          expect(out.ok).toBe(true);
          if (out.ok) {
            expect(Number.isFinite(out.envelope.maxUtilization)).toBe(true);
            expect(out.envelope.maxUtilization).toBeGreaterThan(0);
          }
        });
      }
    }
  }
});
