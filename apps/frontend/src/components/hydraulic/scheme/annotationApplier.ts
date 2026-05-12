/**
 * Phase 6.6.3 — Text annotation store-bridge.
 *
 * Applier pattern (continues from Phase 6.5.4 / 6.5.5 / 6.6.1 /
 * 6.6.2): no new methods on StoreActions. Reads/writes the store
 * via setState() + getState().
 *
 * Exposed:
 *   - addAnnotation(annotation): insert + push undo
 *   - updateAnnotation(id, patch): partial update with NO undo
 *     (inspector edits are too frequent for the stack — same
 *     rationale as dimensions / construction lines)
 *   - removeAnnotation(id): remove + scrub selection + push undo
 *   - selectAnnotation(id | null): convenience selector
 */
import { useHydraulicStore } from "../hydraulicStore";
import type { SchemeAnnotation } from "../hydraulicTypes";
import { pushUndoSnapshot } from "./undoStack";

/** Insert a fresh annotation into the store and snapshot for undo. */
export function addAnnotation(annotation: SchemeAnnotation): void {
  pushUndoSnapshot("Тэмдэглэгээ нэмсэн", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.annotations ?? [];
  useHydraulicStore.setState({
    annotations: [...existing, annotation],
  });
}

/** Patch an existing annotation. Used by the inspector for text /
 *  font size / rotation / align / layer edits. NOT snapshot-wrapped. */
export function updateAnnotation(
  id: string,
  patch: Partial<SchemeAnnotation>,
): void {
  const cur = useHydraulicStore.getState();
  const existing = cur.annotations ?? [];
  useHydraulicStore.setState({
    annotations: existing.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  });
}

/** Remove an annotation, scrub through selection state, snapshot
 *  for undo. */
export function removeAnnotation(id: string): void {
  pushUndoSnapshot("Тэмдэглэгээ устгасан", 1);
  const cur = useHydraulicStore.getState();
  const existing = cur.annotations ?? [];
  const ms = cur.multiSelection;
  useHydraulicStore.setState({
    annotations: existing.filter((a) => a.id !== id),
    multiSelection: {
      nodeIds: ms.nodeIds,
      pipeIds: ms.pipeIds,
      dimensionIds: ms.dimensionIds ?? [],
      constructionLineIds: ms.constructionLineIds ?? [],
      annotationIds: (ms.annotationIds ?? []).filter((x) => x !== id),
    },
    selection: cur.selection?.id === id ? null : cur.selection,
  });
}

/** Convenience: single-select an annotation. */
export function selectAnnotation(id: string | null): void {
  if (id === null) {
    useHydraulicStore.getState().clearSelection();
    return;
  }
  useHydraulicStore.getState().select({ kind: "annotation", id });
}
