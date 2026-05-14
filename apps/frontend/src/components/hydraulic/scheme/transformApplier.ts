/**
 * Phase 6.5 batch-ops toolbar — transform applier.
 *
 * Mirror of `arrayApplier.ts` (Phase 6.5.4) but for in-place transforms
 * instead of cloning. Reads the current multiSelection, runs the pure
 * math from `transforms.ts` (Phase 6.5.3-A), writes the updated node
 * positions back via `updateNode()`.
 *
 * Key architectural point:
 *   No new methods added to `StoreActions` — the applier lives outside
 *   the store's type surface, so TypeScript's curried-generic
 *   inference stays intact across all panel selectors. The same
 *   pattern proven by Phase 6.5.4.
 *
 * UI contract (used by BatchOpsToolbar):
 *   - Each function returns the count of nodes affected, or 0 when
 *     the selection is empty.
 *   - Rotation centre / mirror axis defaults to the selection's
 *     pixel centroid (and geo centroid for map-anchored nodes).
 *   - Pipe topology is untouched (transforms.ts only mutates node
 *     positions; pipe from/to ids stay the same).
 */

import { useHydraulicStore } from "../hydraulicStore";
import {
  rotateNodes,
  mirrorNodes,
  centroidGeo,
  rotateBuildings,
  mirrorBuildings,
  buildingPolygonCentroidPx,
  buildingPolygonCentroidGeo,
} from "./transforms";
import { rotateAnnotations, mirrorAnnotations } from "./annotations";
import { pushUndoSnapshot } from "./undoStack";
import type { SchemeAnnotation, SchemeBuilding } from "../hydraulicTypes";

/** Internal: collect currently-selected nodes + annotations + buildings
 *  from the store. Phase 6.6.3 — annotations participate in rotate/
 *  mirror so drafting labels follow the geometry they describe.
 *  Phase 6.8.7 — buildings participate too so a polygon outline
 *  stays aligned with the network it contains. */
function collectTransformTargets(): {
  nodes: ReturnType<typeof useHydraulicStore.getState>["nodes"];
  annotations: SchemeAnnotation[];
  buildings: SchemeBuilding[];
} {
  const s = useHydraulicStore.getState();
  const nodeIds = new Set(s.multiSelection.nodeIds);
  const annIds = new Set(s.multiSelection.annotationIds ?? []);
  const bldIds = new Set(s.multiSelection.buildingIds ?? []);
  return {
    nodes: s.nodes.filter((n) => nodeIds.has(n.id)),
    annotations: (s.annotations ?? []).filter((a) => annIds.has(a.id)),
    buildings: (s.buildings ?? []).filter((b) => bldIds.has(b.id)),
  };
}

/** Combined centroid (in pixel space) over nodes + annotation anchors
 *  + building polygon centroids. Each building contributes ONCE
 *  (using its polygon centroid) so a single 4-vertex building
 *  doesn't outweigh a single node. */
function combinedCentroidPx(
  nodes: ReturnType<typeof useHydraulicStore.getState>["nodes"],
  annotations: SchemeAnnotation[],
  buildings: SchemeBuilding[] = [],
): { x: number; y: number } {
  const total = nodes.length + annotations.length + buildings.length;
  if (total === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const n of nodes) {
    sx += n.x;
    sy += n.y;
  }
  for (const a of annotations) {
    sx += a.x;
    sy += a.y;
  }
  for (const b of buildings) {
    const c = buildingPolygonCentroidPx(b);
    sx += c.x;
    sy += c.y;
  }
  return { x: sx / total, y: sy / total };
}

/** Combined geo centroid (nodes + building polygon vertices). Used
 *  to derive the rotation/mirror pivot's lat/lon when ANY of the
 *  selected entities carries geo. Returns null when none of them do. */
function combinedCentroidGeo(
  nodes: ReturnType<typeof useHydraulicStore.getState>["nodes"],
  buildings: SchemeBuilding[],
): { lat: number; lon: number } | null {
  const nodeGeo = centroidGeo(nodes);
  let n = nodeGeo ? 1 : 0;
  let sLat = nodeGeo ? nodeGeo.lat : 0;
  let sLon = nodeGeo ? nodeGeo.lon : 0;
  for (const b of buildings) {
    const c = buildingPolygonCentroidGeo(b);
    if (c) {
      sLat += c.lat;
      sLon += c.lon;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { lat: sLat / n, lon: sLon / n };
}

/** Rotate the current multi-selection by an arbitrary angle around
 *  the selection's centroid. Toolbar buttons call this with +90,
 *  -90, or 180. Phase 6.6.3 — annotations rotate with nodes. */
export function applyRotateAroundCentroid(angleDeg: number): number {
  const { nodes: nodeTargets, annotations: annTargets, buildings: bldTargets } =
    collectTransformTargets();
  const affected = nodeTargets.length + annTargets.length + bldTargets.length;
  if (affected === 0) return 0;
  // Phase 6.5.5 — snapshot pre-mutation so Ctrl+Z restores positions.
  // Label tailored per angle for engineer-readable toast.
  const label =
    angleDeg === 90 ? "Эргүүлэлт ↺ 90°"
    : angleDeg === -90 ? "Эргүүлэлт ↻ 90°"
    : angleDeg === 180 ? "Эргүүлэлт 180°"
    : `Эргүүлэлт ${angleDeg}°`;
  pushUndoSnapshot(label, affected);
  // Combined centroid spans nodes + annotations + buildings (each
  // building contributes its polygon centroid once). Geo centroid
  // includes building polygon vertex geo when present.
  const centerPx = combinedCentroidPx(nodeTargets, annTargets, bldTargets);
  const centerGeo = combinedCentroidGeo(nodeTargets, bldTargets);
  const s = useHydraulicStore.getState();
  if (nodeTargets.length > 0) {
    const rotated = rotateNodes(nodeTargets, centerPx, angleDeg, centerGeo ?? undefined);
    for (const n of rotated) {
      s.updateNode(n.id, {
        x: n.x,
        y: n.y,
        ...(n.geo ? { geo: n.geo } : {}),
      });
    }
  }
  if (annTargets.length > 0) {
    const rotated = rotateAnnotations(annTargets, centerPx, angleDeg);
    const existing = useHydraulicStore.getState().annotations ?? [];
    const updated = existing.map((a) => {
      const hit = rotated.find((r) => r.id === a.id);
      return hit ?? a;
    });
    useHydraulicStore.setState({ annotations: updated });
  }
  if (bldTargets.length > 0) {
    // Phase 6.8.7 — rotate building polygon vertices in pixel + geo
    // space. The shared centerPx ensures the building stays in the
    // same relative position to the rotating node cluster.
    const rotated = rotateBuildings(
      bldTargets,
      centerPx,
      angleDeg,
      centerGeo ?? undefined,
    );
    const existing = useHydraulicStore.getState().buildings ?? [];
    const updated = existing.map((b) => rotated.find((r) => r.id === b.id) ?? b);
    useHydraulicStore.setState({ buildings: updated });
  }
  return affected;
}

/** Convenience for the toolbar's three rotation buttons. */
export const applyRotateCCW = (): number => applyRotateAroundCentroid(90);
export const applyRotateCW = (): number => applyRotateAroundCentroid(-90);
export const applyRotate180 = (): number => applyRotateAroundCentroid(180);

/** Mirror the current multi-selection horizontally (flip top↔bottom)
 *  across the selection's centroid Y. Phase 6.6.3 — annotations
 *  mirror with nodes (text flips to the new orientation). */
export function applyMirrorHorizontal(): number {
  const { nodes: nodeTargets, annotations: annTargets, buildings: bldTargets } =
    collectTransformTargets();
  const affected = nodeTargets.length + annTargets.length + bldTargets.length;
  if (affected === 0) return 0;
  pushUndoSnapshot("Хэвтээ тусгал", affected);
  const cPx = combinedCentroidPx(nodeTargets, annTargets, bldTargets);
  const cGeo = combinedCentroidGeo(nodeTargets, bldTargets);
  const s = useHydraulicStore.getState();
  const axis = {
    kind: "horizontal" as const,
    y_px: cPx.y,
    ...(cGeo ? { y_geo_lat: cGeo.lat } : {}),
  };
  if (nodeTargets.length > 0) {
    const mirrored = mirrorNodes(nodeTargets, axis);
    for (const n of mirrored) {
      s.updateNode(n.id, {
        x: n.x,
        y: n.y,
        ...(n.geo ? { geo: n.geo } : {}),
      });
    }
  }
  if (annTargets.length > 0) {
    const mirrored = mirrorAnnotations(annTargets, { kind: "horizontal", y_px: cPx.y });
    const existing = useHydraulicStore.getState().annotations ?? [];
    const updated = existing.map((a) => mirrored.find((m) => m.id === a.id) ?? a);
    useHydraulicStore.setState({ annotations: updated });
  }
  if (bldTargets.length > 0) {
    const mirrored = mirrorBuildings(bldTargets, axis);
    const existing = useHydraulicStore.getState().buildings ?? [];
    const updated = existing.map((b) => mirrored.find((m) => m.id === b.id) ?? b);
    useHydraulicStore.setState({ buildings: updated });
  }
  return affected;
}

/** Mirror the current multi-selection vertically (flip left↔right)
 *  across the selection's centroid X. */
export function applyMirrorVertical(): number {
  const { nodes: nodeTargets, annotations: annTargets, buildings: bldTargets } =
    collectTransformTargets();
  const affected = nodeTargets.length + annTargets.length + bldTargets.length;
  if (affected === 0) return 0;
  pushUndoSnapshot("Босоо тусгал", affected);
  const cPx = combinedCentroidPx(nodeTargets, annTargets, bldTargets);
  const cGeo = combinedCentroidGeo(nodeTargets, bldTargets);
  const s = useHydraulicStore.getState();
  const axis = {
    kind: "vertical" as const,
    x_px: cPx.x,
    ...(cGeo ? { x_geo_lon: cGeo.lon } : {}),
  };
  if (nodeTargets.length > 0) {
    const mirrored = mirrorNodes(nodeTargets, axis);
    for (const n of mirrored) {
      s.updateNode(n.id, {
        x: n.x,
        y: n.y,
        ...(n.geo ? { geo: n.geo } : {}),
      });
    }
  }
  if (annTargets.length > 0) {
    const mirrored = mirrorAnnotations(annTargets, { kind: "vertical", x_px: cPx.x });
    const existing = useHydraulicStore.getState().annotations ?? [];
    const updated = existing.map((a) => mirrored.find((m) => m.id === a.id) ?? a);
    useHydraulicStore.setState({ annotations: updated });
  }
  if (bldTargets.length > 0) {
    const mirrored = mirrorBuildings(bldTargets, axis);
    const existing = useHydraulicStore.getState().buildings ?? [];
    const updated = existing.map((b) => mirrored.find((m) => m.id === b.id) ?? b);
    useHydraulicStore.setState({ buildings: updated });
  }
  return affected;
}
