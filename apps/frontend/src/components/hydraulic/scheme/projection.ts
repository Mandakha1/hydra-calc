/**
 * Phase 6.8.2 — Geo-anchoring projection helpers.
 *
 * Pure helpers extracted from SchemeEditor's inline `displayPos` /
 * `svgToLatLon` math so we can:
 *
 *   1. Unit-test the math directly with synthetic fixtures (no DOM,
 *      no Leaflet instance required) — `containerPointToSchemeXY`
 *      and `schemeXYToContainerPoint`.
 *   2. Reuse the same projection across THREE display call sites
 *      (nodes, annotations, construction-line endpoints) so all
 *      four geo-anchored entity kinds track the map view
 *      identically. Previously only nodes followed the map; this
 *      module is the foundation that lets annotations + construction
 *      lines join the party.
 *
 * Coordinate spaces:
 *
 *   geo         lat / lon (codebase convention: `lon`, not `lng`).
 *
 *   container   pixel offset relative to the Leaflet map div's
 *               bounding rect. `map.latLngToContainerPoint()` and
 *               `map.containerPointToLatLng()` are Leaflet's
 *               canonical projection API.
 *
 *   screen      pixel offset relative to the viewport origin
 *               (clientX / clientY). Used only as an intermediate.
 *
 *   scheme      pixel offset relative to the SVG canvas's logical
 *               (0, 0) — AFTER subtracting the ruler band and
 *               undoing pan/zoom. This is what `SchemeNode.x` /
 *               `SchemeNode.y` (and the future
 *               `SchemeAnnotation.x` / `SchemeConstructionLine.from.x`)
 *               live in.
 *
 * The two pure math helpers handle the screen ↔ scheme leg of the
 * chain. The geo helpers add a thin Leaflet-API wrapper on top so
 * production code stays a single call.
 *
 * NOTE on `lon` vs `lng`: codebase uses `lon` on stored geo fields
 * (40+ call sites across SchemeNode, footprint vertices, etc).
 * Leaflet's API uses the `[lat, lng]` tuple convention. The wrappers
 * translate at the boundary so callers never see `lng`.
 */

import type * as L from "leaflet";

/** Scheme-space pixel coordinate. */
export interface SchemeXY {
  x: number;
  y: number;
}

/** Container-space pixel coordinate (Leaflet origin). */
export interface ContainerXY {
  x: number;
  y: number;
}

/** Geographic coordinate. Note: `lon`, not `lng` — codebase convention. */
export interface Geo {
  lat: number;
  lon: number;
}

/** Pan offset in scheme-space units. */
export interface Pan {
  x: number;
  y: number;
}

/** Minimal bounding-rect shape — accepts DOMRect or any `{ left, top }`. */
export interface Rect {
  left: number;
  top: number;
}

/**
 * Container px → scheme px.
 *
 * Inverts the chain
 *   scheme_x = (screen_x - svg.left - ruler) / zoom - pan.x
 * with `screen_x = mapRect.left + container.x` (the Leaflet container
 * sits at mapRect.left in screen coords).
 *
 * Pure math — no DOM access, no Leaflet calls. Trivially testable.
 *
 * The math matches the inline body of `displayPos` in
 * `SchemeEditor.tsx` (the one place that previously knew about all
 * these axes). Don't change the formula here without changing it
 * there too — `projectGeoToSchemeXY` calls this helper and the
 * old inline math has to keep agreeing during the refactor period.
 */
export function containerPointToSchemeXY(
  container: ContainerXY,
  mapRect: Rect,
  svgRect: Rect,
  rulerPx: number,
  zoom: number,
  pan: Pan,
): SchemeXY {
  const screenX = mapRect.left + container.x;
  const screenY = mapRect.top + container.y;
  return {
    x: (screenX - svgRect.left - rulerPx) / zoom - pan.x,
    y: (screenY - svgRect.top - rulerPx) / zoom - pan.y,
  };
}

/**
 * Scheme px → container px (exact inverse of the above).
 *
 * Pure math, no DOM access. Used by `unprojectSchemeXYToGeo` so the
 * drawing handlers can stamp a stable lat/lon on annotations +
 * construction lines at create time.
 */
export function schemeXYToContainerPoint(
  scheme: SchemeXY,
  mapRect: Rect,
  svgRect: Rect,
  rulerPx: number,
  zoom: number,
  pan: Pan,
): ContainerXY {
  const screenX = (scheme.x + pan.x) * zoom + rulerPx + svgRect.left;
  const screenY = (scheme.y + pan.y) * zoom + rulerPx + svgRect.top;
  return {
    x: screenX - mapRect.left,
    y: screenY - mapRect.top,
  };
}

/**
 * Project a geo coordinate to scheme-space pixels by routing through
 * Leaflet's projection API. Returns `null` when the map ref / svg
 * isn't ready (the caller falls back to the entity's stored XY —
 * e.g. legacy projects without a `.geo` field, or before map mount).
 *
 * Codebase uses `lon`; Leaflet uses `lng`. The wrapper translates at
 * the boundary so callers stay in the codebase convention.
 */
export function projectGeoToSchemeXY(
  geo: Geo,
  map: L.Map | null,
  svg: SVGSVGElement | null,
  rulerPx: number,
  zoom: number,
  pan: Pan,
): SchemeXY | null {
  if (!map || !svg) return null;
  const container = map.latLngToContainerPoint([geo.lat, geo.lon]);
  const mapRect = map.getContainer().getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  return containerPointToSchemeXY(
    { x: container.x, y: container.y },
    mapRect,
    svgRect,
    rulerPx,
    zoom,
    pan,
  );
}

/**
 * Inverse — scheme-space pixel back to geo. Used by drawing handlers
 * (annotation place, construction-line endpoint commit) so the
 * entity persists a stable lat/lon alongside its scheme XY. When the
 * map then pans/zooms, `projectGeoToSchemeXY` recomputes the display
 * XY so the entity tracks the map.
 *
 * Returns `null` when map / svg aren't ready — the caller should
 * skip the geo capture in that case (the entity just lives in
 * scheme-space, same as a pre-Phase-6.8.2 project).
 */
export function unprojectSchemeXYToGeo(
  scheme: SchemeXY,
  map: L.Map | null,
  svg: SVGSVGElement | null,
  rulerPx: number,
  zoom: number,
  pan: Pan,
): Geo | null {
  if (!map || !svg) return null;
  const mapRect = map.getContainer().getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const container = schemeXYToContainerPoint(
    scheme,
    mapRect,
    svgRect,
    rulerPx,
    zoom,
    pan,
  );
  const ll = map.containerPointToLatLng([container.x, container.y]);
  return { lat: ll.lat, lon: ll.lng };
}
