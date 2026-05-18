/**
 * Phase 13.7 — AutoCAD-style view-mode projection helpers.
 *
 * The engineer can pick between three orthographic / axonometric
 * views of the scheme:
 *
 *   "top"    — 2D plan (default). Identity projection; map tiles +
 *              polygons render unchanged.
 *   "bottom" — 2D plan flipped 180°. Identity in scheme-px, but the
 *              canvas wrapper gets a CSS `rotateZ(180deg)` so the
 *              engineer sees it upside-down (useful when matching
 *              a paper drawing whose North arrow points the wrong way).
 *   "iso"    — AutoCAD isometric: x-axis 30° below horizontal east,
 *              y-axis 30° below horizontal west, z-axis straight up.
 *              The canvas wrapper gets a CSS 3D rotateX(60deg) so
 *              the map tilts into the screen; buildings render
 *              their vertical extrusions on top.
 *
 * Pure module — no DOM, no React. Provides projection math + the CSS
 * transform string for the canvas wrapper.
 */
export type ViewMode = "top" | "bottom" | "iso";

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Project a scheme-px (x, y) point + an optional z-height to the
 * engineer-facing screen coords for the given view. Heights are in
 * scheme-px (caller multiplies real-world metres by pxPerMeter).
 *
 *   - Top    → identity (z ignored — engineer is looking straight down).
 *   - Bottom → identity (engineer looks straight up; the wrapper
 *              flips the whole canvas via CSS).
 *   - Iso    → classic axonometric:
 *                screen_x = (x - y) × cos(30°) = (x - y) × 0.866
 *                screen_y = (x + y) × sin(30°) - z = (x + y) × 0.5 - z
 *              Z is measured upward (positive z lifts toward the
 *              viewer); in SVG y-down space we negate so taller
 *              buildings appear visually higher.
 */
const COS_30 = 0.8660254037844387;
const SIN_30 = 0.5;

export function projectPoint(
  p: Point2D,
  z_px: number,
  mode: ViewMode,
): Point2D {
  if (mode === "top") return { x: p.x, y: p.y };
  if (mode === "bottom") return { x: p.x, y: p.y };
  // iso
  return {
    x: (p.x - p.y) * COS_30,
    y: (p.x + p.y) * SIN_30 - z_px,
  };
}

/**
 * Engineer-facing label for the view selector UI.
 */
export function viewModeLabel(mode: ViewMode): string {
  switch (mode) {
    case "top":
      return "📐 Дээрээс";
    case "bottom":
      return "🔄 Доороос";
    case "iso":
      return "📦 Isometric";
  }
}

/**
 * CSS transform applied to the canvas wrapper. The leaflet map +
 * SVG share one wrapper so they tilt together. The browser
 * compositor handles tile + path 3D rendering at the GPU level —
 * no per-frame projection of map tiles needed.
 *
 *   top    → none
 *   bottom → rotateZ(180deg)  (rotates around the wrapper centre)
 *   iso    → perspective + rotateX(60deg)  (60° tilt is the AutoCAD
 *            isometric viewing angle; perspective adds depth cue
 *            without distorting the near edges)
 */
export function viewModeWrapperTransform(mode: ViewMode): string {
  switch (mode) {
    case "top":
      return "none";
    case "bottom":
      return "rotateZ(180deg)";
    case "iso":
      return "perspective(2400px) rotateX(60deg)";
  }
}

/**
 * Resolve a building's effective height in scheme-px from the tagged
 * node's floors / floorHeight_m / buildingHeight_m fields.
 *
 *   1. Explicit buildingHeight_m wins.
 *   2. Else floors × floorHeight_m (default 3.0 m per floor).
 *   3. Else 9 m fallback (3-storey average — common UB residential
 *      assumption per БНбД 23-02-09 design defaults).
 */
export function buildingHeightPx(
  node: {
    buildingHeight_m?: number;
    floors?: number;
    floorHeight_m?: number;
  } | undefined,
  pxPerMeter: number,
): number {
  if (!node || pxPerMeter <= 0) return 0;
  if (typeof node.buildingHeight_m === "number" && node.buildingHeight_m > 0) {
    return node.buildingHeight_m * pxPerMeter;
  }
  const floors = typeof node.floors === "number" && node.floors > 0 ? node.floors : 0;
  const floorH = typeof node.floorHeight_m === "number" && node.floorHeight_m > 0
    ? node.floorHeight_m
    : 3.0;
  if (floors > 0) return floors * floorH * pxPerMeter;
  // Last-resort default: 3 floors × 3 m = 9 m (УБ residential typical)
  return 9 * pxPerMeter;
}

/**
 * Build the 4 trapezoidal side walls of a building polygon when
 * extruded upward by `height_px` in iso mode. Each wall is a
 * quadrilateral [base[i], base[i+1], top[i+1], top[i]] (already
 * projected to screen coords).
 *
 * Returns an array of polygon vertex strings (SVG-ready) so the
 * caller can `<polygon points={...} />` for each wall. Walls are
 * sorted so back walls render before front walls (engineer-visible
 * z-order without needing a full painter's-algo).
 */
export function isoWalls(
  polygon: ReadonlyArray<Point2D>,
  height_px: number,
): string[] {
  if (polygon.length < 3 || height_px <= 0) return [];
  const base = polygon.map((p) => projectPoint(p, 0, "iso"));
  const top = polygon.map((p) => projectPoint(p, height_px, "iso"));
  const walls: { points: string; minY: number }[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const j = (i + 1) % polygon.length;
    const quad = [base[i]!, base[j]!, top[j]!, top[i]!];
    const minY = Math.min(...quad.map((p) => p.y));
    walls.push({
      points: quad.map((p) => `${p.x},${p.y}`).join(" "),
      minY,
    });
  }
  // Sort: walls with HIGHER minY (closer to viewer in iso projection)
  // render LAST so they overdraw the back walls.
  walls.sort((a, b) => a.minY - b.minY);
  return walls.map((w) => w.points);
}
