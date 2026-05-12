/**
 * Geometry helpers — works in pixel space; convert via PX_PER_METER for real units.
 */
import { PX_PER_METER, pxToM } from "./nodeCatalog";

export interface Point {
  x: number;
  y: number;
}

/**
 * Shoelace formula — polygon area (signed; abs value gives unsigned area).
 * Result in pixels² — convert to m² via dividing by PX_PER_METER².
 */
export function polygonAreaPx(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonAreaM2(points: Point[]): number {
  return polygonAreaPx(points) / (PX_PER_METER * PX_PER_METER);
}

/** Polyline length (sum of segment lengths) in meters. Doesn't close to first point. */
export function polylineLengthM(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i += 1) {
    len += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  return pxToM(len);
}

/** Polygon perimeter in meters (closes to first point). */
export function polygonPerimeterM(points: Point[]): number {
  if (points.length < 2) return 0;
  return polylineLengthM([...points, points[0]!]);
}

/** Centroid of polygon (pixel coords). For label placement. */
export function polygonCentroid(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  let cx = 0;
  let cy = 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-6) {
    // Degenerate — use bounding box center
    return bboxCenter(points);
  }
  return { x: cx / (6 * area), y: cy / (6 * area) };
}

export function bboxCenter(points: Point[]): Point {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

export function bbox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Returns true if `pt` is within `tolerancePx` of `target`. Used for polygon close detection.
 */
export function nearPoint(pt: Point, target: Point, tolerancePx = 12): boolean {
  return Math.hypot(pt.x - target.x, pt.y - target.y) <= tolerancePx;
}

/** Constrain a destination point so the line from `from` is at 0/45/90/...° */
export function constrainToAngle(
  from: Point,
  to: Point,
  step_deg: number,
): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return to;
  const cur = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(cur / step_deg) * step_deg;
  const rad = (snapped * Math.PI) / 180;
  return { x: from.x + Math.cos(rad) * len, y: from.y + Math.sin(rad) * len };
}
