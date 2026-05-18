/**
 * Phase 13.3 — Building polygon vertex editing.
 *
 * Pure helpers for moving / inserting / removing individual polygon
 * vertices on a SchemeBuilding. Used by SchemeEditor's vertex-handle
 * UI: when a building is selected, small square handles render at
 * each vertex; engineer mousedowns + drags one to reshape the polygon.
 *
 * Engineer use cases:
 *   - Real building isn't a perfect rectangle (Phase 13.3 feedback:
 *     "Бодит барилга хазгай байж болно шүү дээ").
 *   - Engineer drew a rough box first then wants to refine each
 *     corner to match a satellite image / cadastral survey.
 *   - L-shape / T-shape / curved-corner buildings need 5+ vertices
 *     and per-vertex tweaks are the cleanest editing path.
 *
 * No DOM, no React. SchemeEditor handles the SVG handle rendering +
 * drag state + geo re-stamping (which depends on leafletMapRef).
 */

export interface PolygonVertex {
  x: number;
  y: number;
  lat?: number;
  lon?: number;
}

/**
 * Replace ONE vertex at `index` with `next` (typically the engineer-
 * dragged position). Returns a fresh polygon array so callers can
 * dispatch via updateBuilding(id, { polygon }).
 *
 * Out-of-range indices return the original polygon unchanged
 * (defensive — engineer might click a stale handle after a polygon
 * resize / vertex removal).
 */
export function setVertex(
  polygon: ReadonlyArray<PolygonVertex>,
  index: number,
  next: PolygonVertex,
): PolygonVertex[] {
  if (index < 0 || index >= polygon.length) return polygon.map((v) => ({ ...v }));
  return polygon.map((v, i) =>
    i === index
      ? {
          x: Math.round(next.x * 10) / 10, // 0.1 m precision per Phase 13.3 fine-snap
          y: Math.round(next.y * 10) / 10,
          ...(typeof next.lat === "number" ? { lat: next.lat } : {}),
          ...(typeof next.lon === "number" ? { lon: next.lon } : {}),
        }
      : { ...v },
  );
}

/**
 * Insert a new vertex BETWEEN existing vertices `index` and `index+1`.
 * Index wraps at the polygon length so engineer can insert on the
 * "closing" edge (last vertex back to first). Used by the future
 * Phase 13.4 double-click-on-edge gesture.
 */
export function insertVertex(
  polygon: ReadonlyArray<PolygonVertex>,
  afterIndex: number,
  vertex: PolygonVertex,
): PolygonVertex[] {
  const out = polygon.map((v) => ({ ...v }));
  const at = ((afterIndex % polygon.length) + polygon.length) % polygon.length + 1;
  out.splice(at, 0, {
    x: Math.round(vertex.x * 10) / 10,
    y: Math.round(vertex.y * 10) / 10,
    ...(typeof vertex.lat === "number" ? { lat: vertex.lat } : {}),
    ...(typeof vertex.lon === "number" ? { lon: vertex.lon } : {}),
  });
  return out;
}

/**
 * Remove vertex at `index`. Refuses to drop below 3 vertices (a
 * polygon needs ≥3 to render) — engineer should delete the whole
 * building instead.
 */
export function removeVertex(
  polygon: ReadonlyArray<PolygonVertex>,
  index: number,
): PolygonVertex[] {
  if (polygon.length <= 3) return polygon.map((v) => ({ ...v }));
  if (index < 0 || index >= polygon.length) return polygon.map((v) => ({ ...v }));
  return polygon.filter((_, i) => i !== index).map((v) => ({ ...v }));
}

/**
 * Compute the bounding-box dimensions of a polygon in metres given
 * the engineer's PX_PER_METER conversion. Useful for keeping the
 * building's width_m / height_m in sync after a vertex edit so
 * Inspector + downstream calc reads stay accurate.
 */
export function polygonBboxMetres(
  polygon: ReadonlyArray<PolygonVertex>,
  pxPerMeter: number,
): { width_m: number; height_m: number } {
  if (polygon.length === 0 || pxPerMeter <= 0) return { width_m: 0, height_m: 0 };
  const xs = polygon.map((v) => v.x);
  const ys = polygon.map((v) => v.y);
  const w_px = Math.max(...xs) - Math.min(...xs);
  const h_px = Math.max(...ys) - Math.min(...ys);
  return {
    // Phase 13.3 — 0.1 m precision matches the fine-snap grid + the
    // Inspector dimension input's `step=0.1`.
    width_m: Math.round((w_px / pxPerMeter) * 10) / 10,
    height_m: Math.round((h_px / pxPerMeter) * 10) / 10,
  };
}
