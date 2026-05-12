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
  centroidPx,
  centroidGeo,
} from "./transforms";
import { pushUndoSnapshot } from "./undoStack";

/** Rotate the current multi-selection by an arbitrary angle around
 *  the selection's centroid. Toolbar buttons call this with +90,
 *  -90, or 180. */
export function applyRotateAroundCentroid(angleDeg: number): number {
  const s = useHydraulicStore.getState();
  const ids = new Set(s.multiSelection.nodeIds);
  if (ids.size === 0) return 0;
  const targets = s.nodes.filter((n) => ids.has(n.id));
  // Phase 6.5.5 — snapshot pre-mutation so Ctrl+Z restores positions.
  // Label tailored per angle for engineer-readable toast.
  const label =
    angleDeg === 90 ? "Эргүүлэлт ↺ 90°"
    : angleDeg === -90 ? "Эргүүлэлт ↻ 90°"
    : angleDeg === 180 ? "Эргүүлэлт 180°"
    : `Эргүүлэлт ${angleDeg}°`;
  pushUndoSnapshot(label, targets.length);
  const centerPx = centroidPx(targets);
  const centerGeo = centroidGeo(targets);
  const rotated = rotateNodes(targets, centerPx, angleDeg, centerGeo ?? undefined);
  for (const n of rotated) {
    s.updateNode(n.id, {
      x: n.x,
      y: n.y,
      ...(n.geo ? { geo: n.geo } : {}),
    });
  }
  return targets.length;
}

/** Convenience for the toolbar's three rotation buttons. */
export const applyRotateCCW = (): number => applyRotateAroundCentroid(90);
export const applyRotateCW = (): number => applyRotateAroundCentroid(-90);
export const applyRotate180 = (): number => applyRotateAroundCentroid(180);

/** Mirror the current multi-selection horizontally (flip top↔bottom)
 *  across the selection's centroid Y. */
export function applyMirrorHorizontal(): number {
  const s = useHydraulicStore.getState();
  const ids = new Set(s.multiSelection.nodeIds);
  if (ids.size === 0) return 0;
  const targets = s.nodes.filter((n) => ids.has(n.id));
  pushUndoSnapshot("Хэвтээ тусгал", targets.length);
  const cPx = centroidPx(targets);
  const cGeo = centroidGeo(targets);
  const mirrored = mirrorNodes(targets, {
    kind: "horizontal",
    y_px: cPx.y,
    ...(cGeo ? { y_geo_lat: cGeo.lat } : {}),
  });
  for (const n of mirrored) {
    s.updateNode(n.id, {
      x: n.x,
      y: n.y,
      ...(n.geo ? { geo: n.geo } : {}),
    });
  }
  return targets.length;
}

/** Mirror the current multi-selection vertically (flip left↔right)
 *  across the selection's centroid X. */
export function applyMirrorVertical(): number {
  const s = useHydraulicStore.getState();
  const ids = new Set(s.multiSelection.nodeIds);
  if (ids.size === 0) return 0;
  const targets = s.nodes.filter((n) => ids.has(n.id));
  pushUndoSnapshot("Босоо тусгал", targets.length);
  const cPx = centroidPx(targets);
  const cGeo = centroidGeo(targets);
  const mirrored = mirrorNodes(targets, {
    kind: "vertical",
    x_px: cPx.x,
    ...(cGeo ? { x_geo_lon: cGeo.lon } : {}),
  });
  for (const n of mirrored) {
    s.updateNode(n.id, {
      x: n.x,
      y: n.y,
      ...(n.geo ? { geo: n.geo } : {}),
    });
  }
  return targets.length;
}
