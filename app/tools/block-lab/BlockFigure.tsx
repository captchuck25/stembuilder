"use client";

// Standalone real-Blockly figure renderer for quiz questions OUTSIDE the lab
// (teacher quiz builder previews, student quiz taking page). Same DSL and
// rendering approach as the in-lab notes/quiz figures (BlockStack in
// page.tsx) — duplicated rather than extracted so the known-good lab page
// stays untouched; keep the two in sync if the DSL grows.

import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly";
import { registerBlockDefs, getDarkTheme } from "./engine/blocklyDefs";

interface StackNode { type: string; fields: Record<string, string>; container: boolean; children: StackNode[] }

function noteBlockFor(spec: string): Omit<StackNode, "children"> | null {
  const s = spec.trim().toLowerCase();
  let m = s.match(/^repeat (\d+)$/);
  if (m) return { type: "repeat", fields: { TIMES: m[1] }, container: true };
  m = s.match(/^define (\d)$/);
  if (m) return { type: "define_trick", fields: { NAME: m[1] }, container: true };
  m = s.match(/^call (\d)$/);
  if (m) return { type: "do_trick", fields: { NAME: m[1] }, container: false };
  const map: Record<string, [string, boolean]> = {
    "move": ["move_forward", false], "turn left": ["turn_left", false], "turn right": ["turn_right", false],
    "collect": ["collect", false], "while ahead": ["while_path_ahead", true], "while goal": ["while_not_at_goal", true],
    "if ahead": ["if_path_ahead", true], "if left": ["if_path_left", true], "if right": ["if_path_right", true],
    "if crystal": ["if_on_item", true], "if acorn": ["if_on_item", true], "if chip": ["if_on_item", true], "if data chip": ["if_on_item", true],
  };
  const hit = map[s];
  return hit ? { type: hit[0], fields: {}, container: hit[1] } : null;
}

function parseStack(lines: string[]): StackNode[] {
  const roots: StackNode[] = [];
  const path: { depth: number; node: StackNode }[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const depth = Math.floor((raw.length - raw.trimStart().length) / 2);
    const def = noteBlockFor(raw);
    if (!def) continue;
    const node: StackNode = { ...def, children: [] };
    while (path.length && path[path.length - 1].depth >= depth) path.pop();
    if (path.length === 0) roots.push(node);
    else path[path.length - 1].node.children.push(node);
    if (def.container) path.push({ depth, node });
  }
  return roots;
}

function stackXml(nodes: StackNode[]): string {
  const one = (n: StackNode, next: string): string => {
    const fields = Object.entries(n.fields).map(([f, v]) => `<field name="${f}">${v}</field>`).join("");
    const body = n.children.length ? `<statement name="BODY">${chain(n.children)}</statement>` : "";
    return `<block type="${n.type}">${fields}${body}${next ? `<next>${next}</next>` : ""}</block>`;
  };
  const chain = (ns: StackNode[]): string =>
    ns.reduceRight<string>((next, n) => one(n, next), "");
  // Definitions have no connectors — they must be their own top-level stacks
  const tops: string[] = [];
  let run: StackNode[] = [];
  for (const n of nodes) {
    if (n.type === "define_trick") {
      if (run.length) { tops.push(chain(run)); run = []; }
      tops.push(one(n, ""));
    } else run.push(n);
  }
  if (run.length) tops.push(chain(run));
  const placed = tops.map((t, i) => t.replace("<block ", `<block x="8" y="${i * 120}" `));
  return `<xml xmlns="https://developers.google.com/blockly/xml">${placed.join("")}</xml>`;
}

export default function BlockFigure({ dsl, itemName }: { dsl: string; itemName?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(140);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    registerBlockDefs(itemName);
    // NOT readOnly: readOnly workspaces refuse block moves, which silently
    // breaks layout. Interaction is blocked with pointer-events instead.
    const ws = Blockly.inject(el, {
      renderer: "zelos",
      theme: getDarkTheme(),
      scrollbars: false,
      zoom: { startScale: 0.75 },
    });
    try {
      Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(stackXml(parseStack(dsl.split("\n")))), ws);
      let colY = 8;
      for (const b of ws.getTopBlocks(true)) {
        const xy = b.getRelativeToSurfaceXY();
        b.moveBy(8 - xy.x, colY - xy.y);
        colY += b.getHeightWidth().height + 14;
      }
      const bb = ws.getBlocksBoundingBox();
      setH(Math.max(48, Math.ceil((bb.bottom - bb.top) * 0.75) + 28));
      requestAnimationFrame(() => { try { Blockly.svgResize(ws as Blockly.WorkspaceSvg); } catch { /* disposed */ } });
    } catch { /* bad snippet — leave the box empty rather than crash */ }
    return () => ws.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsl, h, itemName]);
  return (
    <div style={{ border: "1px solid rgba(99,179,237,0.35)", borderRadius: 12, margin: "10px 0",
      overflow: "hidden", background: "#1e293b" }}>
      <div ref={ref} style={{ height: h, width: "100%", pointerEvents: "none" }} />
    </div>
  );
}
