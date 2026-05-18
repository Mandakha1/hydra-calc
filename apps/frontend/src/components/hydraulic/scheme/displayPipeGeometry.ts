/**
 * Phase 13.14 — Map-aware pipe geometry resolution.
 *
 * Engineer report: "Хоосон газар буюу Maps дээрх барилга дээр хоолой
 * зурах үед ажиллахгүй байна. Хоолойг нэг барилгаас нөгөөрүү холбох,
 * булан эргүүлэх үйлдэл хийхэд шугам арилж байна мөн хадгалагдахгүй
 * байна."
 *
 * Root cause: while drawing a pipe on the visible map, the live preview
 * + bend-constrain + commit-length-math all used the from-node's stored
 * `n.x` / `n.y` (which Phase 6.8.2 geo-anchoring leaves STALE once the
 * map has panned/zoomed). The on-screen position of a geo-node lives at
 * `displayPos(n)`, not `n.x / n.y` — so the live preview line started
 * from "where the node USED to be", appearing to fly off-screen and
 * "disappear". Saved pipes had the same problem with their bendPoints:
 * raw `bp.x` / `bp.y` rendered at original-pan/zoom coords instead of
 * tracking the bend's stamped `bp.lat` / `bp.lon` through map pan.
 *
 * Fix: this helper resolves the polyline path in CURRENT scheme-space
 * coords by:
 *
 *   1. Routing each geo-anchored vertex (node OR bend) through the
 *      provided `projectGeo` projector, falling back to stored x/y
 *      when no geo / no map / map ref not ready.
 *   2. Caller passes `projectGeo` as a closure over the live Leaflet
 *      ref + svg ref + pan/zoom — this module stays pure (no DOM, no
 *      React, no Leaflet types).
 *
 * Same shape as `projection.ts` — small, focused, testable. The
 * SchemeEditor component owns the closure capture; this file owns the
 * geometry resolution.
 */

/** Scheme-space pixel coordinate. */
export interface XY {
  x: number;
  y: number;
}

/** A vertex that may carry geo. Accepts SchemeNode, BendPoint, or any
 *  `{x, y, lat?, lon?}` shape. */
export interface MaybeGeoVertex {
  x: number;
  y: number;
  lat?: number;
  lon?: number;
}

/** Per-render context — caller closes over live refs + pan/zoom. */
export interface ProjectorCtx {
  /** Map is visible right now. `false` short-circuits to stored x/y. */
  showMap: boolean;
  /** Returns `null` when refs / map aren't ready — caller falls back. */
  projectGeo: (geo: { lat: number; lon: number }) => XY | null;
}

/**
 * Resolve a single vertex's display position.
 *
 * Order of preference:
 *   1. If `showMap` AND vertex carries lat/lon AND projector returns
 *      non-null → use the projected XY (tracks map pan/zoom).
 *   2. Else → use stored `v.x, v.y` (legacy / non-map / unready map).
 *
 * Pure. No DOM. No Leaflet.
 */
export function displayVertex(v: MaybeGeoVertex, ctx: ProjectorCtx): XY {
  if (ctx.showMap && typeof v.lat === "number" && typeof v.lon === "number") {
    const projected = ctx.projectGeo({ lat: v.lat, lon: v.lon });
    if (projected) return projected;
  }
  return { x: v.x, y: v.y };
}

/**
 * Resolve the full pipe polyline in display coords.
 *
 * Returns `[fromXY, ...bendXYs, toXY]` — exactly the points the SVG
 * `<path d="M … L …"/>` consumer expects. Each vertex is run through
 * `displayVertex` so geo-anchored ones track the map.
 *
 * The empty-bend case is handled: returns `[from, to]` directly. The
 * `from === to` edge case is left to the caller (renderer skips
 * zero-length paths anyway).
 */
export function displayPipePolyline(
  from: MaybeGeoVertex,
  bends: ReadonlyArray<MaybeGeoVertex>,
  to: MaybeGeoVertex,
  ctx: ProjectorCtx,
): XY[] {
  const out: XY[] = [displayVertex(from, ctx)];
  for (const b of bends) out.push(displayVertex(b, ctx));
  out.push(displayVertex(to, ctx));
  return out;
}

/**
 * Polyline length sum in scheme-pixel units.
 *
 * Caller converts to metres via `pxToM` if needed. Used by the
 * pipe-commit handler to compute `length_m` from the user's clicked
 * polyline — by routing through `displayVertex` first, the length math
 * stays correct even when the user pans the map mid-draw (a real
 * Mongolian-engineer workflow on a large district network).
 *
 * Returns 0 for < 2 points (defensive — geometry-incomplete pipe).
 */
export function polylineLengthPx(points: ReadonlyArray<XY>): number {
  if (points.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}
