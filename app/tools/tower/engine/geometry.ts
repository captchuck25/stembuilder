// Tower Builder — pure 2D geometry helpers shared by the editor (hit
// testing, drag-snap) and the design inspection. Verbatim from the Bridge
// Builder's inline helpers.

export function distancePointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

export function segmentIntersectionPoint(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): { x: number; y: number } | null {
  const rX = bx - ax;
  const rY = by - ay;
  const sX = dx - cx;
  const sY = dy - cy;
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-6) return null;
  const u = ((cx - ax) * rY - (cy - ay) * rX) / denom;
  const t = ((cx - ax) * sY - (cy - ay) * sX) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: ax + t * rX, y: ay + t * rY };
}

export function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rx1: number,
  ry1: number,
  rx2: number,
  ry2: number
): boolean {
  const minX = Math.min(rx1, rx2);
  const maxX = Math.max(rx1, rx2);
  const minY = Math.min(ry1, ry2);
  const maxY = Math.max(ry1, ry2);

  const aInside = ax >= minX && ax <= maxX && ay >= minY && ay <= maxY;
  const bInside = bx >= minX && bx <= maxX && by >= minY && by <= maxY;
  if (aInside || bInside) return true;

  function intersects(x1: number, y1: number, x2: number, y2: number) {
    const d1 = (ax - x1) * (y2 - y1) - (ay - y1) * (x2 - x1);
    const d2 = (bx - x1) * (y2 - y1) - (by - y1) * (x2 - x1);
    const d3 = (x1 - ax) * (by - ay) - (y1 - ay) * (bx - ax);
    const d4 = (x2 - ax) * (by - ay) - (y2 - ay) * (bx - ax);
    return d1 * d2 <= 0 && d3 * d4 <= 0;
  }

  return (
    intersects(minX, minY, maxX, minY) ||
    intersects(maxX, minY, maxX, maxY) ||
    intersects(maxX, maxY, minX, maxY) ||
    intersects(minX, maxY, minX, minY)
  );
}
