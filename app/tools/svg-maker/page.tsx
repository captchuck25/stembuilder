"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Units = "mm" | "in";
type Tool = "select" | "line" | "pan" | "erase";

type LineEntity = {
  id: string;
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
};

type Viewport = { width: number; height: number };

export default function SvgMakerPage() {
  const [units, setUnits] = useState<Units>("in");
  const [tool, setTool] = useState<Tool>("pan");
  const [entities, setEntities] = useState<LineEntity[]>([]);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const MAX_ZOOM = 800;
  const [snapToGrid, setSnapToGrid] = useState<boolean>(false);
  const [showCrosshair, setShowCrosshair] = useState<boolean>(false);
  const [gridStepIn, setGridStepIn] = useState<number>(1);
  const [gridStepMm, setGridStepMm] = useState<number>(1);
  const [lineColor, setLineColor] = useState<string>("#111");
  const [spaceDown, setSpaceDown] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionAdditive, setSelectionAdditive] = useState<boolean>(false);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEndRef = useRef<{ x: number; y: number } | null>(null);
  const isSelectingRef = useRef<boolean>(false);
  const selectionAdditiveRef = useRef<boolean>(false);
  const isDraggingSelectionRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartLinesRef = useRef<Map<string, LineEntity>>(new Map());
  const dragEndpointRef = useRef<{ lineId: string; endpoint: "start" | "end" } | null>(
    null
  );
  const dragEndpointStartRef = useRef<LineEntity | null>(null);
  const dragEndpointAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const dragEndpointLinksRef = useRef<Array<{ lineId: string; endpoint: "start" | "end" }>>(
    []
  );
  const [viewport, setViewport] = useState<Viewport>({ width: 1000, height: 700 });
  const [gridWidth, setGridWidth] = useState<number>(12);
  const [gridHeight, setGridHeight] = useState<number>(12);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hasInitView = useRef(false);
  function clampGridSize(value: number, nextUnits: Units) {
    const max = nextUnits === "in" ? 96 : 96 * 25.4;
    return Math.max(1, Math.min(max, value));
  }

  function nearestStep(value: number, options: number[]) {
    return options.reduce((closest, option) =>
      Math.abs(option - value) < Math.abs(closest - value) ? option : closest
    );
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
      }
      if (e.code === "Escape") {
        setLineStart(null);
        setCursorWorld(null);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        setSpaceDown(false);
        setIsPanning(false);
        setLastPanPoint(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  useEffect(() => {
    function onResize() {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (hasInitView.current) return;
    if (viewport.width <= 0 || viewport.height <= 0) return;
    const fitScale = 0.85;
    const zx = (viewport.width * fitScale) / gridWidth;
    const zy = (viewport.height * fitScale) / gridHeight;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(0.2, Math.min(zx, zy)));
    const nextPanX = (viewport.width - gridWidth * nextZoom) / 2;
    const nextPanY = (viewport.height - gridHeight * nextZoom) / 2;
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
    hasInitView.current = true;
  }, [viewport, gridWidth, gridHeight]);

  function screenToWorld(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }

  function snapPoint(point: { x: number; y: number }) {
    if (!snapToGrid) return point;
    return {
      x: Math.round(point.x / gridStep) * gridStep,
      y: Math.round(point.y / gridStep) * gridStep,
    };
  }

  function distancePointToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ) {
    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    return Math.hypot(px - cx, py - cy);
  }

  function distancePointToPoint(px: number, py: number, ax: number, ay: number) {
    return Math.hypot(px - ax, py - ay);
  }

  function findClosestEndpoint(point: { x: number; y: number }, threshold: number) {
    let closest: { x: number; y: number } | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const line of entities) {
      const d1 = distancePointToPoint(point.x, point.y, line.x1, line.y1);
      if (d1 < closestDist) {
        closestDist = d1;
        closest = { x: line.x1, y: line.y1 };
      }
      const d2 = distancePointToPoint(point.x, point.y, line.x2, line.y2);
      if (d2 < closestDist) {
        closestDist = d2;
        closest = { x: line.x2, y: line.y2 };
      }
    }
    if (closest && closestDist <= threshold) return closest;
    return null;
  }

  function isSamePoint(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    epsilon: number
  ) {
    return Math.abs(ax - bx) <= epsilon && Math.abs(ay - by) <= epsilon;
  }

  function isPointInRect(
    x: number,
    y: number,
    rect: { minX: number; minY: number; maxX: number; maxY: number }
  ) {
    return x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY;
  }

  function segmentsIntersect(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number
  ) {
    const abx = bx - ax;
    const aby = by - ay;
    const cdx = dx - cx;
    const cdy = dy - cy;
    const denom = abx * cdy - aby * cdx;
    if (denom === 0) return false;
    const acx = cx - ax;
    const acy = cy - ay;
    const t = (acx * cdy - acy * cdx) / denom;
    const u = (acx * aby - acy * abx) / denom;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function lineIntersectsRect(
    line: LineEntity,
    rect: { minX: number; minY: number; maxX: number; maxY: number }
  ) {
    if (isPointInRect(line.x1, line.y1, rect) || isPointInRect(line.x2, line.y2, rect)) {
      return true;
    }
    const { minX, minY, maxX, maxY } = rect;
    return (
      segmentsIntersect(line.x1, line.y1, line.x2, line.y2, minX, minY, maxX, minY) ||
      segmentsIntersect(line.x1, line.y1, line.x2, line.y2, maxX, minY, maxX, maxY) ||
      segmentsIntersect(line.x1, line.y1, line.x2, line.y2, maxX, maxY, minX, maxY) ||
      segmentsIntersect(line.x1, line.y1, line.x2, line.y2, minX, maxY, minX, minY)
    );
  }

  function findClosestLineId(point: { x: number; y: number }, threshold: number) {
    let closestId: string | null = null;
    let closestDist = Number.POSITIVE_INFINITY;
    for (const line of entities) {
      const dist = distancePointToSegment(
        point.x,
        point.y,
        line.x1,
        line.y1,
        line.x2,
        line.y2
      );
      if (dist < closestDist) {
        closestDist = dist;
        closestId = line.id;
      }
    }
    if (closestId && closestDist <= threshold) return closestId;
    return null;
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (spaceDown || tool === "pan") {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (tool === "erase") {
      if (selectedLineIds.length > 0) {
        setEntities((prev) => prev.filter((line) => !selectedLineIds.includes(line.id)));
        setSelectedLineIds([]);
        return;
      }
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      const threshold = 6 / zoom;
      const closestId = findClosestLineId(world, threshold);
      if (closestId) {
        setEntities((prev) => prev.filter((line) => line.id !== closestId));
      }
      return;
    }

    if (tool === "select") {
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      const threshold = 6 / zoom;
      const closestId = findClosestLineId(world, threshold);
      if (closestId) {
        if (e.shiftKey) {
          setSelectedLineIds((prev) =>
            prev.includes(closestId)
              ? prev.filter((id) => id !== closestId)
              : [...prev, closestId]
          );
          return;
        }

        if (!selectedLineIds.includes(closestId)) {
          setSelectedLineIds([closestId]);
          return;
        }

        const line = entities.find((l) => l.id === closestId);
        if (!line) return;
        const handleThreshold = 8 / zoom;
        const startDist = distancePointToPoint(world.x, world.y, line.x1, line.y1);
        const endDist = distancePointToPoint(world.x, world.y, line.x2, line.y2);

        if (startDist <= handleThreshold) {
          dragEndpointRef.current = { lineId: line.id, endpoint: "start" };
          dragEndpointStartRef.current = { ...line };
          dragEndpointAnchorRef.current = { x: line.x1, y: line.y1 };
          const epsilon = 20 / zoom;
          dragEndpointLinksRef.current = entities.flatMap((lineItem) => {
            const links: Array<{ lineId: string; endpoint: "start" | "end" }> = [];
            if (isSamePoint(lineItem.x1, lineItem.y1, line.x1, line.y1, epsilon)) {
              links.push({ lineId: lineItem.id, endpoint: "start" });
            }
            if (isSamePoint(lineItem.x2, lineItem.y2, line.x1, line.y1, epsilon)) {
              links.push({ lineId: lineItem.id, endpoint: "end" });
            }
            return links;
          });
          return;
        }
        if (endDist <= handleThreshold) {
          dragEndpointRef.current = { lineId: line.id, endpoint: "end" };
          dragEndpointStartRef.current = { ...line };
          dragEndpointAnchorRef.current = { x: line.x2, y: line.y2 };
          const epsilon = 20 / zoom;
          dragEndpointLinksRef.current = entities.flatMap((lineItem) => {
            const links: Array<{ lineId: string; endpoint: "start" | "end" }> = [];
            if (isSamePoint(lineItem.x1, lineItem.y1, line.x2, line.y2, epsilon)) {
              links.push({ lineId: lineItem.id, endpoint: "start" });
            }
            if (isSamePoint(lineItem.x2, lineItem.y2, line.x2, line.y2, epsilon)) {
              links.push({ lineId: lineItem.id, endpoint: "end" });
            }
            return links;
          });
          return;
        }

        dragStartRef.current = world;
        dragStartLinesRef.current = new Map(
          entities
            .filter((lineItem) => selectedLineIds.includes(lineItem.id))
            .map((lineItem) => [lineItem.id, { ...lineItem }])
        );
        isDraggingSelectionRef.current = true;
        return;
      }

      setSelectionStart(world);
      setSelectionEnd(world);
      setIsSelecting(true);
      setSelectionAdditive(e.shiftKey);
      selectionStartRef.current = world;
      selectionEndRef.current = world;
      isSelectingRef.current = true;
      selectionAdditiveRef.current = e.shiftKey;
      return;
    }

    if (tool === "line") {
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      const endpointSnap = findClosestEndpoint(
        world,
        units === "in" ? 0.125 : 0.125 * 25.4
      );
      const snapped = endpointSnap ?? snapPoint(world);
      if (!lineStart) {
        setLineStart(snapped);
      } else {
        const newLine: LineEntity = {
          id: crypto.randomUUID(),
          type: "line",
          x1: lineStart.x,
          y1: lineStart.y,
          x2: snapped.x,
          y2: snapped.y,
          stroke: lineColor,
          strokeWidth: 2.2,
        };
        setEntities((prev) => [...prev, newLine]);
        setLineStart(snapped);
      }
    }
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const world = screenToWorld(e.clientX, e.clientY);
    if (world) setCursorWorld(snapToGrid ? snapPoint(world) : world);

    if (isDraggingSelectionRef.current && dragStartRef.current && world) {
      const anchor = dragStartRef.current;
      const target = snapToGrid ? snapPoint(world) : world;
      const dx = target.x - anchor.x;
      const dy = target.y - anchor.y;
      const startLines = dragStartLinesRef.current;
      setEntities((prev) =>
        prev.map((line) => {
          const start = startLines.get(line.id);
          if (!start) return line;
          return {
            ...line,
            x1: start.x1 + dx,
            y1: start.y1 + dy,
            x2: start.x2 + dx,
            y2: start.y2 + dy,
          };
        })
      );
    }

    if (dragEndpointRef.current && dragEndpointAnchorRef.current && world) {
      const target = snapToGrid ? snapPoint(world) : world;
      setEntities((prev) =>
        prev.map((line) => {
          const links = dragEndpointLinksRef.current;
          const hasStart = links.some(
            (link) => link.lineId === line.id && link.endpoint === "start"
          );
          const hasEnd = links.some(
            (link) => link.lineId === line.id && link.endpoint === "end"
          );
          if (!hasStart && !hasEnd) return line;
          return {
            ...line,
            x1: hasStart ? target.x : line.x1,
            y1: hasStart ? target.y : line.y1,
            x2: hasEnd ? target.x : line.x2,
            y2: hasEnd ? target.y : line.y2,
          };
        })
      );
    }

    if (isSelectingRef.current && selectionStartRef.current && world) {
      selectionEndRef.current = world;
      setSelectionEnd(world);
    }

    if (isPanning && lastPanPoint) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }

  function onMouseUp() {
    setIsPanning(false);
    setLastPanPoint(null);

    if (isDraggingSelectionRef.current) {
      isDraggingSelectionRef.current = false;
      dragStartRef.current = null;
      dragStartLinesRef.current.clear();
      return;
    }

    if (dragEndpointRef.current) {
      dragEndpointRef.current = null;
      dragEndpointStartRef.current = null;
      dragEndpointAnchorRef.current = null;
      dragEndpointLinksRef.current = [];
      return;
    }

    if (isSelectingRef.current && selectionStartRef.current && selectionEndRef.current) {
      const start = selectionStartRef.current;
      const end = selectionEndRef.current;
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      const rect = { minX, maxX, minY, maxY };
      const boxSize = Math.max(maxX - minX, maxY - minY);
      const clickThreshold = 4 / zoom;
      const nextSet = new Set(selectionAdditiveRef.current ? selectedLineIds : []);

      if (boxSize <= clickThreshold) {
        const world = end;
        const threshold = 6 / zoom;
        let closestId: string | null = null;
        let closestDist = Number.POSITIVE_INFINITY;
        for (const line of entities) {
          const dist = distancePointToSegment(
            world.x,
            world.y,
            line.x1,
            line.y1,
            line.x2,
            line.y2
          );
          if (dist < closestDist) {
            closestDist = dist;
            closestId = line.id;
          }
        }
        if (closestId && closestDist <= threshold) {
          if (selectionAdditiveRef.current && nextSet.has(closestId)) {
            nextSet.delete(closestId);
          } else {
            nextSet.add(closestId);
          }
        } else if (!selectionAdditiveRef.current) {
          nextSet.clear();
        }
      } else {
        for (const line of entities) {
          if (lineIntersectsRect(line, rect)) {
            nextSet.add(line.id);
          }
        }
      }

      setSelectedLineIds(Array.from(nextSet));
      setSelectionStart(null);
      setSelectionEnd(null);
      setIsSelecting(false);
      setSelectionAdditive(false);
      selectionStartRef.current = null;
      selectionEndRef.current = null;
      isSelectingRef.current = false;
      selectionAdditiveRef.current = false;
    }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(0.2, zoom * zoomFactor));

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const nextPanX = sx - world.x * nextZoom;
    const nextPanY = sy - world.y * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }

  function computeGridStep() {
    return units === "in" ? gridStepIn : gridStepMm;
  }

  const gridStep = computeGridStep();
  const majorStep = units === "in" ? 1 : 10;
  const labelStep = units === "in" ? 6 : 10;

  const gridBounds = useMemo(() => {
    const max = units === "in" ? 96 : 96 * 25.4;
    const width = Math.min(max, gridWidth);
    const height = Math.min(max, gridHeight);
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }, [gridWidth, gridHeight, units]);

  const worldBounds = useMemo(() => {
    const left = (-pan.x) / zoom;
    const top = (-pan.y) / zoom;
    const right = (viewport.width - pan.x) / zoom;
    const bottom = (viewport.height - pan.y) / zoom;
    return { left, right, top, bottom };
  }, [pan, zoom, viewport]);

  function exportSvg() {
    const margin = 10;
    const bounds = entities.reduce(
      (acc, e) => {
        acc.minX = Math.min(acc.minX, e.x1, e.x2);
        acc.minY = Math.min(acc.minY, e.y1, e.y2);
        acc.maxX = Math.max(acc.maxX, e.x1, e.x2);
        acc.maxY = Math.max(acc.maxY, e.y1, e.y2);
        return acc;
      },
      { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    );
    const minX = bounds.minX - margin;
    const minY = bounds.minY - margin;
    const width = bounds.maxX - bounds.minX + margin * 2;
    const height = bounds.maxY - bounds.minY + margin * 2;

    const lines = entities
      .map(
        (l) =>
          `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="${l.stroke}" stroke-width="${l.strokeWidth}" />`
      )
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" data-units="${units}">${lines}</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing.svg";
    a.click();
    URL.revokeObjectURL(url);
  }

  const gridLines = useMemo(() => {
    const lines: React.ReactElement[] = [];
    const startX = Math.max(
      gridBounds.minX,
      Math.floor(worldBounds.left / gridStep) * gridStep
    );
    const endX = Math.min(
      gridBounds.maxX,
      Math.ceil(worldBounds.right / gridStep) * gridStep
    );
    const startY = Math.max(
      gridBounds.minY,
      Math.floor(worldBounds.top / gridStep) * gridStep
    );
    const endY = Math.min(
      gridBounds.maxY,
      Math.ceil(worldBounds.bottom / gridStep) * gridStep
    );

    for (let x = startX; x <= endX; x += gridStep) {
      const isMajor = Math.abs(x % majorStep) < 0.0001;
      const minorStroke =
        units === "mm" ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.12)";
      const majorStroke =
        units === "mm" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.85)";
      lines.push(
        <line
          key={`gx-${x}`}
          x1={x}
          y1={startY}
          x2={x}
          y2={endY}
          stroke={isMajor ? majorStroke : minorStroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    for (let y = startY; y <= endY; y += gridStep) {
      const isMajor = Math.abs(y % majorStep) < 0.0001;
      const minorStroke =
        units === "mm" ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.12)";
      const majorStroke =
        units === "mm" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.85)";
      lines.push(
        <line
          key={`gy-${y}`}
          x1={startX}
          y1={y}
          x2={endX}
          y2={y}
          stroke={isMajor ? majorStroke : minorStroke}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    return lines;
  }, [gridStep, majorStep, worldBounds, gridBounds]);

  const rulers = useMemo(() => {
    const elements: React.ReactElement[] = [];
    const startX = Math.max(
      gridBounds.minX,
      Math.floor(worldBounds.left / gridStep) * gridStep
    );
    const endX = Math.min(
      gridBounds.maxX,
      Math.ceil(worldBounds.right / gridStep) * gridStep
    );
    const startY = Math.max(
      gridBounds.minY,
      Math.floor(worldBounds.top / gridStep) * gridStep
    );
    const endY = Math.min(
      gridBounds.maxY,
      Math.ceil(worldBounds.bottom / gridStep) * gridStep
    );
    const topY = 0;
    const leftX = 0;

    function formatLabel(value: number) {
      if (units === "in") return Math.round(value).toString();
      return Math.round(value).toString();
    }

    for (let x = startX; x <= endX; x += gridStep) {
      const isMajor = Math.abs(x / majorStep - Math.round(x / majorStep)) < 1e-6;
      const tick = isMajor ? 8 : 4;
      const sx = x * zoom + pan.x;
      if (sx < 0 || sx > viewport.width) continue;
      elements.push(
        <line
          key={`rx-${x}`}
          x1={sx}
          y1={topY}
          x2={sx}
          y2={topY + tick}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={1}
        />
      );
    }

    const visibleWidth = viewport.width / zoom;
    const visibleHeight = viewport.height / zoom;
    const labelStepX =
      units === "in" ? (visibleWidth <= 12 ? 1 : 3) : labelStep;
    const labelStepY =
      units === "in" ? (visibleHeight <= 12 ? 1 : 3) : labelStep;

    const labelStartX = Math.ceil(gridBounds.minX / labelStepX) * labelStepX;
    const labelEndX = Math.floor(gridBounds.maxX / labelStepX) * labelStepX;
    for (let x = labelStartX; x <= labelEndX; x += labelStepX) {
      const sx = x * zoom + pan.x;
      if (sx < 0 || sx > viewport.width) continue;
      elements.push(
        <text
          key={`rx-label-${x}`}
          x={sx + 2}
          y={topY + 16}
          fontSize={10}
          fill="#333"
        >
          {formatLabel(x)}
        </text>
      );
    }

    for (let y = startY; y <= endY; y += gridStep) {
      const isMajor = Math.abs(y / majorStep - Math.round(y / majorStep)) < 1e-6;
      const tick = isMajor ? 8 : 4;
      const sy = y * zoom + pan.y;
      if (sy < 0 || sy > viewport.height) continue;
      elements.push(
        <line
          key={`ry-${y}`}
          x1={leftX}
          y1={sy}
          x2={leftX + tick}
          y2={sy}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={1}
        />
      );
    }

    const labelStartY = Math.ceil(gridBounds.minY / labelStepY) * labelStepY;
    const labelEndY = Math.floor(gridBounds.maxY / labelStepY) * labelStepY;
    for (let y = labelStartY; y <= labelEndY; y += labelStepY) {
      const sy = y * zoom + pan.y;
      if (sy < 0 || sy > viewport.height) continue;
      elements.push(
        <text
          key={`ry-label-${y}`}
          x={leftX + 10}
          y={sy + 3}
          fontSize={10}
          fill="#333"
        >
          {formatLabel(y)}
        </text>
      );
    }

    return elements;
  }, [gridStep, majorStep, worldBounds, gridBounds, units, zoom, pan, viewport]);

  return (
    <main
      style={{
        height: "100vh",
        margin: 0,
        background: "#f3f3f3",
        display: "grid",
        gridTemplateColumns: "64px 1fr",
        gridTemplateRows: "72px 1fr",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          gridColumn: "1 / span 2",
          gridRow: "1",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          gap: 6,
          padding: "6px 12px",
          background: "#c9c9c9",
          borderBottom: "1px solid #9c9c9c",
          fontSize: 12,
          position: "relative",
          zIndex: 2,
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontSize: 14,
            fontWeight: 700,
            color: "#000",
          }}
        >
          SVG Maker
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={() => {
              const nextUnits = units === "mm" ? "in" : "mm";
              const conversion = nextUnits === "in" ? 1 / 25.4 : 25.4;
              const nextWidth = clampGridSize(gridWidth * conversion, nextUnits);
              const nextHeight = clampGridSize(gridHeight * conversion, nextUnits);
              const nextZoom = zoom / conversion;
              const nextEntities = entities.map((line) => ({
                ...line,
                x1: line.x1 * conversion,
                y1: line.y1 * conversion,
                x2: line.x2 * conversion,
                y2: line.y2 * conversion,
              }));
              const nextLineStart = lineStart
                ? { x: lineStart.x * conversion, y: lineStart.y * conversion }
                : null;
              const nextCursorWorld = cursorWorld
                ? { x: cursorWorld.x * conversion, y: cursorWorld.y * conversion }
                : null;
              const nextSelectionStart = selectionStart
                ? { x: selectionStart.x * conversion, y: selectionStart.y * conversion }
                : null;
              const nextSelectionEnd = selectionEnd
                ? { x: selectionEnd.x * conversion, y: selectionEnd.y * conversion }
                : null;
              setUnits(nextUnits);
              setGridWidth(nextWidth);
              setGridHeight(nextHeight);
              setZoom(nextZoom);
              setEntities(nextEntities);
              setLineStart(nextLineStart);
              setCursorWorld(nextCursorWorld);
              setSelectionStart(nextSelectionStart);
              setSelectionEnd(nextSelectionEnd);
              if (nextUnits === "mm") {
                const nextStep = nearestStep(gridStepIn * 25.4, [0.5, 1, 5, 10]);
                setGridStepMm(nextStep);
              } else {
                const nextStep = nearestStep(gridStepMm / 25.4, [
                  1,
                  0.5,
                  0.25,
                  0.125,
                  0.0625,
                ]);
                setGridStepIn(nextStep);
              }
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #8f8f8f",
              background: "#bdbdbd",
              cursor: "pointer",
              color: "#000",
            }}
          >
            Units: {units}
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #8f8f8f",
              background: "#bdbdbd",
              cursor: "pointer",
              color: "#000",
            }}
          >
            Zoom In
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #8f8f8f",
              background: "#bdbdbd",
              cursor: "pointer",
              color: "#000",
            }}
          >
            Zoom Out
          </button>
          <button
            onClick={exportSvg}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #8f8f8f",
              background: "#bdbdbd",
              cursor: "pointer",
              color: "#000",
            }}
          >
            Export SVG
          </button>
          <button
            onClick={() => setSnapToGrid((prev) => !prev)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #8f8f8f",
              background: snapToGrid ? "#8f8f8f" : "#bdbdbd",
              cursor: "pointer",
              color: "#000",
            }}
          >
            Snap: {snapToGrid ? "On" : "Off"}
          </button>
          <button
            onClick={() => setShowCrosshair((prev) => !prev)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #8f8f8f",
              background: showCrosshair ? "#8f8f8f" : "#bdbdbd",
              cursor: "pointer",
              color: "#000",
            }}
          >
            Crosshair: {showCrosshair ? "On" : "Off"}
          </button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#333" }}>Grid size ({units}):</span>
            <input
              type="number"
              min={1}
              max={units === "in" ? 96 : 96 * 25.4}
              step={1}
              value={Math.round(gridWidth)}
              onChange={(e) => setGridWidth(clampGridSize(Number(e.target.value), units))}
              style={{
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #8f8f8f",
                background: "#bdbdbd",
                color: "#000",
                width: 64,
              }}
            />
            <span style={{ fontSize: 11, color: "#333" }}>x</span>
            <input
              type="number"
              min={1}
              max={units === "in" ? 96 : 96 * 25.4}
              step={1}
              value={Math.round(gridHeight)}
              onChange={(e) => setGridHeight(clampGridSize(Number(e.target.value), units))}
              style={{
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #8f8f8f",
                background: "#bdbdbd",
                color: "#000",
                width: 64,
              }}
            />
            <span style={{ fontSize: 11, color: "#333" }}>Step:</span>
            <select
              value={units === "in" ? gridStepIn : gridStepMm}
              onChange={(e) =>
                units === "in"
                  ? setGridStepIn(Number(e.target.value))
                  : setGridStepMm(Number(e.target.value))
              }
              style={{
                padding: "4px 6px",
                borderRadius: 6,
                border: "1px solid #8f8f8f",
                background: "#bdbdbd",
                color: "#000",
              }}
            >
              {units === "in"
                ? [1, 0.5, 0.25, 0.125, 0.0625].map((v) => (
                    <option key={`step-${v}`} value={v}>
                      {v === 1 ? '1"' : `1/${Math.round(1 / v)}"`}
                    </option>
                  ))
                : [0.5, 1, 5, 10].map((v) => (
                    <option key={`step-mm-${v}`} value={v}>
                      {v} mm
                    </option>
                  ))}
            </select>
          </div>
        </div>
      </div>

      {/* Left toolbar */}
      <div
        style={{
          gridColumn: "1",
          gridRow: "2",
          background: "#d2d2d2",
          borderRight: "1px solid #9c9c9c",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 8,
          position: "relative",
          zIndex: 2,
        }}
      >
        <button
          onClick={() => setTool("pan")}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #8f8f8f",
            background: tool === "pan" ? "#8f8f8f" : "#bdbdbd",
            cursor: "pointer",
            fontSize: 13,
            color: "#000",
          }}
        >
          Pan
        </button>
        <button
          onClick={() => setTool("select")}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #8f8f8f",
            background: tool === "select" ? "#8f8f8f" : "#bdbdbd",
            cursor: "pointer",
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1,
            color: "#000",
          }}
          aria-label="Select"
          title="Select"
        >
          ^
        </button>
        <button
          onClick={() => {
            if (selectedLineIds.length > 0) {
              setEntities((prev) => prev.filter((line) => !selectedLineIds.includes(line.id)));
              setSelectedLineIds([]);
            }
            setTool("erase");
          }}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #8f8f8f",
            background: tool === "erase" ? "#8f8f8f" : "#bdbdbd",
            cursor: "pointer",
            fontSize: 13,
            color: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Erase
        </button>
        <button
          onClick={() => setTool("line")}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #8f8f8f",
            background: tool === "line" ? "#8f8f8f" : "#bdbdbd",
            cursor: "pointer",
            fontSize: 13,
            color: "#000",
          }}
        >
          Line
        </button>
      </div>

      {/* Canvas */}
      <div
        style={{
          gridColumn: "2",
          gridRow: "2",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 8,
            bottom: 8,
            display: "flex",
            gap: 6,
            padding: "6px 8px",
            background: "rgba(200,200,200,0.9)",
            border: "1px solid #9c9c9c",
            borderRadius: 6,
            zIndex: 3,
          }}
        >
          {[
            { label: "black", value: "#111" },
            { label: "red", value: "#c92a2a" },
            { label: "blue", value: "#1c5fd4" },
            { label: "green", value: "#2f9e44" },
            { label: "magenta", value: "#b516a3" },
          ].map((color) => (
            <button
              key={color.label}
              onClick={() => {
                setLineColor(color.value);
                if (selectedLineIds.length > 0) {
                  setEntities((prev) =>
                    prev.map((line) =>
                      selectedLineIds.includes(line.id)
                        ? { ...line, stroke: color.value }
                        : line
                    )
                  );
                }
              }}
              title={color.label}
              style={{
                width: 18,
                height: 18,
                padding: 0,
                borderRadius: 3,
                border:
                  lineColor === color.value ? "2px solid #333" : "1px solid #777",
                background: color.value,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onWheel={onWheel}
          style={{
            cursor:
              spaceDown || tool === "pan"
                ? "grab"
                : tool === "line"
                  ? "crosshair"
                  : "default",
          }}
        >
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {gridLines}
            <rect
              x={gridBounds.minX}
              y={gridBounds.minY}
              width={gridBounds.maxX - gridBounds.minX}
              height={gridBounds.maxY - gridBounds.minY}
              fill="none"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1 / zoom}
            />
            {entities.map((l) => (
              <line
                key={l.id}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={l.stroke}
                strokeWidth={l.strokeWidth}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {tool === "line" && lineStart && cursorWorld ? (
              <line
                x1={lineStart.x}
                y1={lineStart.y}
                x2={cursorWorld.x}
                y2={cursorWorld.y}
                stroke={lineColor}
                strokeWidth={2.2}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {selectedLineIds.length > 0
              ? entities
                  .filter((l) => selectedLineIds.includes(l.id))
                  .map((l) => (
                    <g key={`sel-${l.id}`}>
                      <line
                        x1={l.x1}
                        y1={l.y1}
                        x2={l.x2}
                        y2={l.y2}
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth={4}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <line
                        x1={l.x1}
                        y1={l.y1}
                        x2={l.x2}
                        y2={l.y2}
                        stroke="rgba(0,90,255,0.95)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={l.x1}
                        cy={l.y1}
                        r={4 / zoom}
                        fill="#fff"
                        stroke="rgba(0,90,255,0.9)"
                        strokeWidth={0.5}
                        vectorEffect="non-scaling-stroke"
                      />
                      <circle
                        cx={l.x2}
                        cy={l.y2}
                        r={4 / zoom}
                        fill="#fff"
                        stroke="rgba(0,90,255,0.9)"
                        strokeWidth={0.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  ))
              : null}
          </g>
          {showCrosshair && cursorWorld ? (
            <g pointerEvents="none">
              <line
                x1={cursorWorld.x * zoom + pan.x}
                y1={0}
                x2={cursorWorld.x * zoom + pan.x}
                y2={viewport.height}
                stroke="rgba(128,0,128,0.6)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                x1={0}
                y1={cursorWorld.y * zoom + pan.y}
                x2={viewport.width}
                y2={cursorWorld.y * zoom + pan.y}
                stroke="rgba(128,0,128,0.6)"
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}
          {isSelecting && selectionStart && selectionEnd ? (
            <rect
              x={Math.min(selectionStart.x, selectionEnd.x) * zoom + pan.x}
              y={Math.min(selectionStart.y, selectionEnd.y) * zoom + pan.y}
              width={Math.abs(selectionEnd.x - selectionStart.x) * zoom}
              height={Math.abs(selectionEnd.y - selectionStart.y) * zoom}
              fill="rgba(0,120,255,0.08)"
              stroke="rgba(0,120,255,0.6)"
              strokeWidth={1}
              strokeDasharray="4 4"
              pointerEvents="none"
            />
          ) : null}
          <g>{rulers}</g>
        </svg>
      </div>
    </main>
  );
}
