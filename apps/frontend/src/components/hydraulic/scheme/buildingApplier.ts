/**
 * Phase 6.8.6 — Reference building store-bridge.
 *
 * Applier pattern (continues from Phase 6.5.4 / 6.5.5 / 6.6.x): no
 * new methods on StoreActions. Reads/writes the store via
 * setState() + getState() so this module's surface stays decoupled
 * from the curried-generic store types.
 *
 * Exposed:
 *   - addBuilding(b): inserts into store, snapshots for undo
 *   - updateBuilding(id, patch): partial update (no undo — small
 *     inspector edits are too frequent for the stack; engineers
 *     expect them to "just stick")
 *   - removeBuilding(id): removes + scrubs selection refs +
 *     snapshots for undo
 *   - selectBuilding(id | null): convenience for SchemeEditor click
 *     handler + InspectorPanel
 */
import { useHydraulicStore } from "../hydraulicStore";
import type { SchemeBuilding } from "../hydraulicTypes";
import { pushUndoSnapshot } from "./undoStack";

/** Insert a fresh reference building into the store + snapshot for undo. */
export function addBuilding(b: SchemeBuilding): void {
  pushUndoSnapshot("Барилга нэмсэн", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.buildings ?? [];
  useHydraulicStore.setState({
    buildings: [...existing, b],
  });
}

/** Patch an existing building. Used by the inspector for
 *  label / floors / type / heat load / layer edits. NOT snapshot-
 *  wrapped — small edits are too frequent for the undo stack;
 *  engineers expect them to "just stick" (same rationale as
 *  dimensions / construction lines / annotations). Destructive
 *  ops go via removeBuilding which IS snapshot-wrapped. */
export function updateBuilding(
  id: string,
  patch: Partial<SchemeBuilding>,
): void {
  const cur = useHydraulicStore.getState();
  const existing = cur.buildings ?? [];
  useHydraulicStore.setState({
    buildings: existing.map((b) => (b.id === id ? { ...b, ...patch } : b)),
  });
}

/** Remove a building, scrub through selection state, snapshot for undo. */
export function removeBuilding(id: string): void {
  pushUndoSnapshot("Барилга устгасан", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.buildings ?? [];
  const ms = cur.multiSelection;
  useHydraulicStore.setState({
    buildings: existing.filter((b) => b.id !== id),
    multiSelection: {
      nodeIds: ms.nodeIds,
      pipeIds: ms.pipeIds,
      dimensionIds: ms.dimensionIds ?? [],
      constructionLineIds: ms.constructionLineIds ?? [],
      annotationIds: ms.annotationIds ?? [],
      buildingIds: (ms.buildingIds ?? []).filter((x) => x !== id),
    },
    selection: cur.selection?.id === id ? null : cur.selection,
  });
}

/** Convenience: single-select a building (mirrors the existing
 *  selectAnnotation / selectConstructionLine pattern). */
export function selectBuilding(id: string | null): void {
  if (id === null) {
    useHydraulicStore.getState().clearSelection();
    return;
  }
  useHydraulicStore.getState().select({ kind: "building", id });
}
