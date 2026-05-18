/**
 * Phase 13.2 — Building polygon translation helpers.
 *
 * Engineer drags a tagged building from any vertex/edge; the polygon
 * + its taggedAsNodeId companion node both translate by the same dx/dy
 * delta. Pure math lives here so it's unit-testable + composable with
 * the SchemeEditor drag handler.
 *
 * No DOM, no React. Geo re-stamping lives in the caller (it needs
 * leafletMapRef which is an opaque DOM ref).
 */
import type { SchemeBuilding, SchemeNode } from "../hydraulicTypes";

export interface Vector2D {
  dx: number;
  dy: number;
}

/**
 * Translate every polygon vertex by (dx, dy). Pixel coords are
 * rounded — engineering convention keeps the polygon on integer
 * coords so subsequent geometry math doesn't accumulate float drift.
 * Lat/lon vertices are PRESERVED — the caller (SchemeEditor) re-
 * stamps them via leaflet projection if the map is visible.
 */
export function translatePolygon(
  polygon: ReadonlyArray<{ x: number; y: number; lat?: number; lon?: number }>,
  delta: Vector2D,
): Array<{ x: number; y: number; lat?: number; lon?: number }> {
  return polygon.map((v) => ({
    ...v,
    x: Math.round(v.x + delta.dx),
    y: Math.round(v.y + delta.dy),
  }));
}

/**
 * Compute the translation delta between two cursor positions in
 * scheme-px space. The drag start mouse is `startMouse`; the current
 * mouse is `currentMouse`. Engineer-visible translation is the
 * difference.
 */
export function dragDelta(startMouse: { x: number; y: number }, currentMouse: { x: number; y: number }): Vector2D {
  return {
    dx: currentMouse.x - startMouse.x,
    dy: currentMouse.y - startMouse.y,
  };
}

/**
 * Apply a translation delta to the node tagged with the dragged
 * building. Mirrors translatePolygon's rounding. Returns a partial
 * patch ready for `updateNode(id, patch)`.
 */
export function translateNodePatch(
  startNodePos: { x: number; y: number },
  delta: Vector2D,
): { x: number; y: number } {
  return {
    x: Math.round(startNodePos.x + delta.dx),
    y: Math.round(startNodePos.y + delta.dy),
  };
}

/**
 * Find the building whose taggedAsNodeId matches a given node id.
 * Returns null when no building tags this node. Mirrors
 * `findTaggedBuilding` from pipePolygonClip but lives here so the
 * polygon-drag tests can stay focused on translation logic.
 */
export function buildingForTaggedNode(
  nodeId: string,
  buildings: ReadonlyArray<SchemeBuilding> | undefined,
): SchemeBuilding | null {
  if (!buildings || buildings.length === 0) return null;
  return buildings.find((b) => b.taggedAsNodeId === nodeId) ?? null;
}

/**
 * Whether the given building+node pair are linked (Phase 12.1 tag-as).
 * Convenience predicate for the drag handler's "should I also move the
 * other?" branching.
 */
export function isTaggedPair(
  building: Pick<SchemeBuilding, "taggedAsNodeId"> | undefined,
  node: Pick<SchemeNode, "id"> | undefined,
): boolean {
  if (!building || !node) return false;
  return building.taggedAsNodeId === node.id;
}
