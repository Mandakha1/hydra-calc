/**
 * Phase 6.5.3 — Group transformations (pure math).
 *
 * Three transformation primitives applied to a set of nodes:
 *   - translate(nodes, delta): shift every node by the same vector.
 *   - rotate(nodes, center, angleDeg): rotate around a chosen point.
 *   - mirror(nodes, axis): reflect across a horizontal / vertical
 *     axis at a chosen line OR across an arbitrary 2-point line.
 *
 * Engineering invariants preserved by all three:
 *   - Pipe topology — pipe.fromNodeId / toNodeId are NEVER rewritten
 *     here. The transform only touches node positions, so any pipe
 *     that connected A→B before still connects A→B after; only the
 *     drawn coordinates change.
 *   - Pipe role / DN / insulation / layer — never touched. Engineer's
 *     mirror of a heating-supply trunk still produces a heating-supply
 *     trunk (just visually flipped). The layer-color signage from
 *     Phase 6E continues to indicate flow direction.
 *
 * Coordinate handling:
 *   - x / y are always transformed in pixel space.
 *   - When a node carries `geo: {lat, lon}`, the same transformation
 *     is also applied in geographic space using Haversine-consistent
 *     metres-per-degree (cos(refLat) for longitude). The reference
 *     latitude is the transformation centre (translation) or the
 *     rotation/mirror centre — picked so the small-cluster
 *     approximation cos(lat) ≈ const stays accurate.
 *
 * Used by:
 *   - SchemeEditor's group-drag handler (translate)
 *   - Toolbar rotate-90 / rotate-180 / mirror-H / mirror-V buttons
 *   - Future free-rotate / 2-point mirror tools (6.5.3 follow-on)
 *
 * NOT in scope here:
 *   - Live ghost preview (the consumer handles UI separately).
 *   - Undo / redo (wired into the store stack in 6.5.5).
 *   - Snap engine integration — caller applies snap before calling
 *     these helpers.
 */
import type { SchemeBuilding, SchemeNode } from "../hydraulicTypes";

/** Haversine-consistent metres per degree of latitude. */
const M_PER_DEG_LAT = (Math.PI * 6_371_000) / 180;

/** Convert metres → longitude degrees at a given reference latitude. */
function mPerDegLon(refLat: number): number {
  return Math.cos((refLat * Math.PI) / 180) * M_PER_DEG_LAT;
}

/* ─── Translate ──────────────────────────────────────────────────── */

/**
 * Shift every node by the same (dx, dy) delta in pixel space.
 *
 * @param nodes      Nodes to move (won't be mutated; returns a fresh
 *                   array of cloned nodes).
 * @param delta_px   Pixel-space offset.
 * @param delta_m    Optional metre-space offset for geo nodes. When
 *                   omitted, the geo update is skipped — useful when
 *                   the caller knows the project isn't on a map.
 *                   When the caller has both, pass both so the geo
 *                   update tracks the pixel one exactly.
 */
export function translateNodes(
  nodes: SchemeNode[],
  delta_px: { x: number; y: number },
  delta_m?: { x: number; y: number },
): SchemeNode[] {
  return nodes.map((n) => {
    const cloned: SchemeNode = {
      ...n,
      x: Math.round(n.x + delta_px.x),
      y: Math.round(n.y + delta_px.y),
    };
    if (n.geo && delta_m) {
      const m_per_lon = mPerDegLon(n.geo.lat);
      cloned.geo = {
        lat: n.geo.lat + delta_m.y / M_PER_DEG_LAT,
        lon: n.geo.lon + delta_m.x / m_per_lon,
      };
    }
    return cloned;
  });
}

/* ─── Rotate ─────────────────────────────────────────────────────── */

/**
 * Rotate every node around a chosen pixel-space centre by `angleDeg`.
 * Positive angle = counter-clockwise (mathematics convention).
 * Quick buttons in the UI pass:
 *   +90 = "90° CCW", -90 = "90° CW", 180 = "180°".
 *
 *   new_x = cx + (x - cx) · cos(θ) - (y - cy) · sin(θ)
 *   new_y = cy + (x - cx) · sin(θ) + (y - cy) · cos(θ)
 *
 * @param nodes        Nodes to rotate.
 * @param center_px    Rotation centre in pixel space.
 * @param angleDeg     Rotation angle in degrees.
 * @param center_geo   Optional geo centre. When provided, geo
 *                     coordinates are also rotated in local metres
 *                     about this point (longitude scaled by
 *                     cos(refLat) — same Haversine-consistent
 *                     mapping as the symbolSize module).
 */
export function rotateNodes(
  nodes: SchemeNode[],
  center_px: { x: number; y: number },
  angleDeg: number,
  center_geo?: { lat: number; lon: number },
): SchemeNode[] {
  const theta = (angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const m_per_lon_at_center = center_geo ? mPerDegLon(center_geo.lat) : null;

  return nodes.map((n) => {
    const cloned: SchemeNode = { ...n };
    // Pixel-space rotation.
    const dx = n.x - center_px.x;
    const dy = n.y - center_px.y;
    cloned.x = Math.round(center_px.x + dx * cosT - dy * sinT);
    cloned.y = Math.round(center_px.y + dx * sinT + dy * cosT);

    // Geo-space rotation — convert lat/lon delta to metres about the
    // geo centre, rotate, convert back. cos(refLat) factor stays
    // constant across the cluster (valid for <1° clusters).
    if (n.geo && center_geo && m_per_lon_at_center) {
      const dLat_m = (n.geo.lat - center_geo.lat) * M_PER_DEG_LAT;
      const dLon_m = (n.geo.lon - center_geo.lon) * m_per_lon_at_center;
      // Rotate the (dLon_m, dLat_m) metre vector by θ.
      // Note: SCHEMA coordinate convention has y increasing downward
      // on screen but here we treat geo dLat_m as "north positive".
      // Engineering rotation on the map preserves north-up visual
      // (counter-intuitive sign in dy below — we flip it).
      const newLon_m = dLon_m * cosT - dLat_m * sinT;
      const newLat_m = dLon_m * sinT + dLat_m * cosT;
      cloned.geo = {
        lat: center_geo.lat + newLat_m / M_PER_DEG_LAT,
        lon: center_geo.lon + newLon_m / m_per_lon_at_center,
      };
    }
    return cloned;
  });
}

/* ─── Mirror ─────────────────────────────────────────────────────── */

/** Mirror axes — three engineering-common cases. */
export type MirrorAxis =
  | { kind: "horizontal"; y_px: number; y_geo_lat?: number }
  | { kind: "vertical"; x_px: number; x_geo_lon?: number; refLat?: number }
  | { kind: "line"; a_px: { x: number; y: number }; b_px: { x: number; y: number } };

/**
 * Reflect every node across a chosen axis.
 *   - horizontal: flip across a horizontal line at y=y_px (flips top↔bottom)
 *   - vertical:   flip across a vertical line at x=x_px (flips left↔right)
 *   - line:       reflect across an arbitrary 2-point line A-B
 *
 * Geographic coords flip similarly when the axis carries optional
 * lat/lon centre + reference latitude.
 *
 * Math for the line case (point P reflected across line A→B):
 *   d = B - A
 *   t = (P - A) · d / d · d
 *   foot = A + t · d
 *   P' = 2 · foot - P
 */
export function mirrorNodes(
  nodes: SchemeNode[],
  axis: MirrorAxis,
): SchemeNode[] {
  return nodes.map((n) => {
    const cloned: SchemeNode = { ...n };
    if (axis.kind === "horizontal") {
      cloned.y = Math.round(2 * axis.y_px - n.y);
      if (n.geo && axis.y_geo_lat !== undefined) {
        cloned.geo = {
          lat: 2 * axis.y_geo_lat - n.geo.lat,
          lon: n.geo.lon,
        };
      }
    } else if (axis.kind === "vertical") {
      cloned.x = Math.round(2 * axis.x_px - n.x);
      if (n.geo && axis.x_geo_lon !== undefined) {
        cloned.geo = {
          lat: n.geo.lat,
          lon: 2 * axis.x_geo_lon - n.geo.lon,
        };
      }
    } else {
      // 2-point line reflection in pixel space.
      const dx = axis.b_px.x - axis.a_px.x;
      const dy = axis.b_px.y - axis.a_px.y;
      const denom = dx * dx + dy * dy;
      if (denom < 1e-9) {
        // Degenerate — a == b. Skip (return original).
        return cloned;
      }
      const px = n.x - axis.a_px.x;
      const py = n.y - axis.a_px.y;
      const t = (px * dx + py * dy) / denom;
      const footX = axis.a_px.x + t * dx;
      const footY = axis.a_px.y + t * dy;
      cloned.x = Math.round(2 * footX - n.x);
      cloned.y = Math.round(2 * footY - n.y);
      // Geo update for the line case is deferred — would need an
      // analogous reflection in local metres. Caller can skip the
      // map for now; geo nodes will track once they're re-snapped
      // to the map's pixel coords.
    }
    return cloned;
  });
}

/* ─── Centroid helper ────────────────────────────────────────────── */

/**
 * Compute the centroid of a set of nodes in pixel space (for use as
 * the default rotation centre when the engineer presses a 90° button
 * without picking a centre manually).
 */
export function centroidPx(nodes: SchemeNode[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const n of nodes) {
    sx += n.x;
    sy += n.y;
  }
  return { x: sx / nodes.length, y: sy / nodes.length };
}

/** Geo centroid using the same averaging strategy (lat / lon means).
 *  Returns null when no node carries geo. */
export function centroidGeo(
  nodes: SchemeNode[],
): { lat: number; lon: number } | null {
  let n = 0;
  let sLat = 0;
  let sLon = 0;
  for (const node of nodes) {
    if (node.geo) {
      sLat += node.geo.lat;
      sLon += node.geo.lon;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { lat: sLat / n, lon: sLon / n };
}

/* ─── Phase 6.8.7 — Building polygon transforms ──────────────────── */

/** Per-building polygon centroid in pixel space. Sums all vertices'
 *  (x, y) and divides by count. Used internally when combining
 *  building centroids with node centroids for a multi-select rotate
 *  pivot. */
export function buildingPolygonCentroidPx(
  b: SchemeBuilding,
): { x: number; y: number } {
  if (b.polygon.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const v of b.polygon) {
    sx += v.x;
    sy += v.y;
  }
  return { x: sx / b.polygon.length, y: sy / b.polygon.length };
}

/** Per-building polygon centroid in geo space. Returns null when no
 *  vertex carries geo. Same averaging strategy as `centroidGeo`. */
export function buildingPolygonCentroidGeo(
  b: SchemeBuilding,
): { lat: number; lon: number } | null {
  let n = 0;
  let sLat = 0;
  let sLon = 0;
  for (const v of b.polygon) {
    if (typeof v.lat === "number" && typeof v.lon === "number") {
      sLat += v.lat;
      sLon += v.lon;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { lat: sLat / n, lon: sLon / n };
}

/**
 * Rotate building polygon vertices by `angleDeg` around `center_px`
 * (and optionally `center_geo`). Phase 6.8.6 originally shipped the
 * SchemeBuilding entity but left transforms unwired — building
 * polygons stayed put when a multi-select rotated nodes around them.
 * This helper closes that gap by applying the SAME rotation math
 * (`rotateNodes` formula) to every polygon vertex.
 *
 * Returns a fresh array of cloned buildings; input untouched.
 */
export function rotateBuildings(
  buildings: SchemeBuilding[],
  center_px: { x: number; y: number },
  angleDeg: number,
  center_geo?: { lat: number; lon: number },
): SchemeBuilding[] {
  if (buildings.length === 0) return [];
  const theta = (angleDeg * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const m_per_lon_at_center = center_geo ? mPerDegLon(center_geo.lat) : null;
  return buildings.map((b) => ({
    ...b,
    polygon: b.polygon.map((v) => {
      // Pixel-space rotation.
      const dx = v.x - center_px.x;
      const dy = v.y - center_px.y;
      const nx = Math.round(center_px.x + dx * cosT - dy * sinT);
      const ny = Math.round(center_px.y + dx * sinT + dy * cosT);
      // Geo rotation only when the vertex AND the pivot both carry geo.
      if (
        typeof v.lat === "number"
        && typeof v.lon === "number"
        && center_geo
        && m_per_lon_at_center
      ) {
        const dLat_m = (v.lat - center_geo.lat) * M_PER_DEG_LAT;
        const dLon_m = (v.lon - center_geo.lon) * m_per_lon_at_center;
        const newLon_m = dLon_m * cosT - dLat_m * sinT;
        const newLat_m = dLon_m * sinT + dLat_m * cosT;
        return {
          x: nx,
          y: ny,
          lat: center_geo.lat + newLat_m / M_PER_DEG_LAT,
          lon: center_geo.lon + newLon_m / m_per_lon_at_center,
        };
      }
      return { x: nx, y: ny };
    }),
  }));
}

/**
 * Mirror building polygon vertices across a `MirrorAxis` (same axis
 * shape as `mirrorNodes`). Each vertex's pixel coords are reflected;
 * geo coords are reflected for horizontal / vertical axes that
 * carry a geo reference.
 */
export function mirrorBuildings(
  buildings: SchemeBuilding[],
  axis: MirrorAxis,
): SchemeBuilding[] {
  if (buildings.length === 0) return [];
  return buildings.map((b) => ({
    ...b,
    polygon: b.polygon.map((v) => {
      if (axis.kind === "horizontal") {
        return {
          ...v,
          x: v.x,
          y: Math.round(2 * axis.y_px - v.y),
          ...(typeof v.lat === "number" && axis.y_geo_lat !== undefined
            ? { lat: 2 * axis.y_geo_lat - v.lat }
            : typeof v.lat === "number"
              ? { lat: v.lat }
              : {}),
          ...(typeof v.lon === "number" ? { lon: v.lon } : {}),
        };
      }
      if (axis.kind === "vertical") {
        return {
          ...v,
          x: Math.round(2 * axis.x_px - v.x),
          y: v.y,
          ...(typeof v.lat === "number" ? { lat: v.lat } : {}),
          ...(typeof v.lon === "number" && axis.x_geo_lon !== undefined
            ? { lon: 2 * axis.x_geo_lon - v.lon }
            : typeof v.lon === "number"
              ? { lon: v.lon }
              : {}),
        };
      }
      // Arbitrary 2-point line — same math as mirrorNodes. Geo
      // deferred (same caveat as the node path).
      const dx = axis.b_px.x - axis.a_px.x;
      const dy = axis.b_px.y - axis.a_px.y;
      const denom = dx * dx + dy * dy;
      if (denom < 1e-9) return { ...v };
      const px = v.x - axis.a_px.x;
      const py = v.y - axis.a_px.y;
      const t = (px * dx + py * dy) / denom;
      const footX = axis.a_px.x + t * dx;
      const footY = axis.a_px.y + t * dy;
      return {
        ...v,
        x: Math.round(2 * footX - v.x),
        y: Math.round(2 * footY - v.y),
      };
    }),
  }));
}
