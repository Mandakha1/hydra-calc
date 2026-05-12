/**
 * Phase 6.6.1 — Dimension store-bridge.
 *
 * Applier pattern (continues from Phase 6.5.4 / 6.5.5): no new methods
 * on StoreActions. Reads/writes the store via setState() + getState().
 *
 * Exposed:
 *   - addDimension(dim): inserts into store, snapshots for undo
 *   - updateDimension(id, patch): partial update with undo
 *   - removeDimension(id): removes + cleans up selection refs
 *   - selectDimension(id | null): convenience for InspectorPanel
 */
import { useHydraulicStore } from "../hydraulicStore";
import type { SchemeDimension } from "../hydraulicTypes";
import { pushUndoSnapshot } from "./undoStack";

/** Insert a fresh dimension into the store and snapshot for undo. */
export function addDimension(dim: SchemeDimension): void {
  pushUndoSnapshot("Хэмжээс нэмсэн", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.dimensions ?? [];
  useHydraulicStore.setState({
    dimensions: [...existing, dim],
  });
}

/** Patch an existing dimension. Used by the inspector (offset slider,
 *  label override edit, layer dropdown). NOT snapshot-wrapped — small
 *  edits are too frequent for the undo stack; engineers expect them
 *  to "just stick". Major destructive edits go via removeDimension
 *  which IS snapshot-wrapped. */
export function updateDimension(id: string, patch: Partial<SchemeDimension>): void {
  const cur = useHydraulicStore.getState();
  const existing = cur.dimensions ?? [];
  useHydraulicStore.setState({
    dimensions: existing.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  });
}

/** Remove a dimension, cascade through selection state, snapshot
 *  for undo. */
export function removeDimension(id: string): void {
  pushUndoSnapshot("Хэмжээс устгасан", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.dimensions ?? [];
  const ms = cur.multiSelection;
  useHydraulicStore.setState({
    dimensions: existing.filter((d) => d.id !== id),
    multiSelection: {
      nodeIds: ms.nodeIds,
      pipeIds: ms.pipeIds,
      dimensionIds: (ms.dimensionIds ?? []).filter((x) => x !== id),
    },
    selection: cur.selection?.id === id ? null : cur.selection,
  });
}

/** Convenience: single-select a dimension (mirrors the existing
 *  `select({kind:"node",id})` pattern but routed via setState). */
export function selectDimension(id: string | null): void {
  if (id === null) {
    useHydraulicStore.getState().clearSelection();
    return;
  }
  useHydraulicStore.getState().select({ kind: "dimension", id });
}
