/**
 * Phase 6.5.5 — Undo / Redo stack for batch operations.
 *
 * Architectural choice (continuing the applier pattern):
 *   Stack state lives ON the store (HydraulicState.undoStack /
 *   redoStack — see hydraulicTypes.ts), but the push / undo / redo
 *   ACTIONS live here as plain functions that call
 *   useHydraulicStore.setState() / .getState() from outside the
 *   StoreActions type. No new methods added to the interface =
 *   TypeScript inference threshold stays clear, panel selectors
 *   keep working.
 *
 * What's snapshot per operation:
 *   - nodes / pipes (the drawing primitives that change)
 *   - selection / multiSelection (so undo also restores what was
 *     selected — engineers expect "Ctrl+Z brings me back to where
 *     I was" including selection)
 *   - settings / results are NOT in the snapshot. Settings rarely
 *     change in batch ops; results are recomputed on next solve.
 *
 * Stack depth: MAX_UNDO_DEPTH = 50. Older entries dropped FIFO when
 * the 51st snapshot is pushed. Tuned to fit comfortable workflow
 * memory (~10-20 ops per session typically) without unbounded
 * memory growth on long sessions.
 *
 * Toast feedback flow:
 *   pushUndoSnapshot saves the label so undo() can return it.
 *   SchemeEditor's Ctrl+Z handler raises a toast like:
 *     "Буцаалаа: Эргүүлэлт (3 цэг)"
 *
 * Snapshot weight:
 *   Each snapshot is a JSON-deep-clone of the nodes + pipes arrays
 *   (typically 10s-100s of objects on a residential network).
 *   Memory is dominated by node/pipe counts, not metadata. A 500-
 *   object project gives ~500 KB per snapshot; 50 deep = ~25 MB
 *   peak. Acceptable for engineering desktop usage.
 */

import { useHydraulicStore } from "../hydraulicStore";
import type { UndoSnapshot } from "../hydraulicTypes";

/** Maximum number of operations remembered. The 51st push evicts the
 *  oldest entry FIFO so the stack never grows past this. */
export const MAX_UNDO_DEPTH = 50;

/**
 * Capture the current state as a snapshot and push it onto the undo
 * stack. Caller invokes this BEFORE the mutation (so undo() restores
 * the pre-mutation state).
 *
 * Also CLEARS the redo stack — any new operation invalidates a
 * pending redo (standard CAD / IDE undo semantics).
 *
 * @param label           Mongolian short label ("Эргүүлэлт",
 *                        "Шугаман массив", "Бөгөмөөр устгасан",
 *                        "Хуулга устгасан", "Буулгасан", …).
 * @param affectedCount   How many items the upcoming operation
 *                        affects. Surfaced in toast feedback.
 */
export function pushUndoSnapshot(label: string, affectedCount: number): void {
  const s = useHydraulicStore.getState();
  // Deep-clone the arrays so future mutations don't leak into our
  // snapshot. JSON round-trip is fine — nodes/pipes/dimensions/
  // constructionLines are pure data.
  const snap: UndoSnapshot = {
    label,
    affectedCount,
    nodes: JSON.parse(JSON.stringify(s.nodes)) as typeof s.nodes,
    pipes: JSON.parse(JSON.stringify(s.pipes)) as typeof s.pipes,
    selection: s.selection ? { ...s.selection } : null,
    multiSelection: {
      nodeIds: [...s.multiSelection.nodeIds],
      pipeIds: [...s.multiSelection.pipeIds],
      dimensionIds: [...(s.multiSelection.dimensionIds ?? [])],
      constructionLineIds: [...(s.multiSelection.constructionLineIds ?? [])],
    },
    // Phase 6.6.1 declared `dimensions?` on UndoSnapshot but didn't
    // wire the read/write paths, so Ctrl+Z after addDimension was a
    // silent no-op (the stack entry existed but undoing only touched
    // nodes/pipes). Phase 6.6.2 fixes both at once — drafting aids
    // now round-trip through undo/redo as expected.
    dimensions: JSON.parse(JSON.stringify(s.dimensions ?? [])) as NonNullable<UndoSnapshot["dimensions"]>,
    constructionLines: JSON.parse(JSON.stringify(s.constructionLines ?? [])) as NonNullable<UndoSnapshot["constructionLines"]>,
  };
  const existing = s.undoStack ?? [];
  const next = [...existing, snap];
  // FIFO eviction at the cap.
  const capped = next.length > MAX_UNDO_DEPTH ? next.slice(next.length - MAX_UNDO_DEPTH) : next;
  useHydraulicStore.setState({
    undoStack: capped,
    redoStack: [], // any new op invalidates the redo buffer
  });
}

/**
 * Pop the most recent undo snapshot, push the current state to the
 * redo stack, and restore the snapshot.
 *
 * @returns The label + affectedCount of the operation that was
 *   undone (so the caller can raise a toast), or null when the
 *   undo stack is empty.
 */
export function undo(): { label: string; affectedCount: number } | null {
  const s = useHydraulicStore.getState();
  const stack = s.undoStack ?? [];
  if (stack.length === 0) return null;

  const top = stack[stack.length - 1]!;

  // Capture CURRENT state as a redo snapshot — uses the same label
  // so the redo toast reads "Дахин гүйцэтгэв: <label>".
  const currentSnap: UndoSnapshot = {
    label: top.label,
    affectedCount: top.affectedCount,
    nodes: JSON.parse(JSON.stringify(s.nodes)) as typeof s.nodes,
    pipes: JSON.parse(JSON.stringify(s.pipes)) as typeof s.pipes,
    selection: s.selection ? { ...s.selection } : null,
    multiSelection: {
      nodeIds: [...s.multiSelection.nodeIds],
      pipeIds: [...s.multiSelection.pipeIds],
      dimensionIds: [...(s.multiSelection.dimensionIds ?? [])],
      constructionLineIds: [...(s.multiSelection.constructionLineIds ?? [])],
    },
    dimensions: JSON.parse(JSON.stringify(s.dimensions ?? [])) as NonNullable<UndoSnapshot["dimensions"]>,
    constructionLines: JSON.parse(JSON.stringify(s.constructionLines ?? [])) as NonNullable<UndoSnapshot["constructionLines"]>,
  };

  // Apply the snapshot. Drafting aids restored only when the
  // snapshot has them (older snapshots from pre-6.6.2 sessions
  // that somehow leaked in would be `undefined` — leave current
  // dimensions/constructionLines alone in that case).
  useHydraulicStore.setState({
    nodes: top.nodes,
    pipes: top.pipes,
    selection: top.selection,
    multiSelection: top.multiSelection,
    ...(top.dimensions !== undefined ? { dimensions: top.dimensions } : {}),
    ...(top.constructionLines !== undefined ? { constructionLines: top.constructionLines } : {}),
    undoStack: stack.slice(0, stack.length - 1),
    redoStack: [...(s.redoStack ?? []), currentSnap],
  });
  return { label: top.label, affectedCount: top.affectedCount };
}

/**
 * Pop the most recent redo snapshot, push the current state to the
 * undo stack, and restore the snapshot.
 *
 * @returns The label + affectedCount of the operation that was
 *   redone, or null when the redo stack is empty.
 */
export function redo(): { label: string; affectedCount: number } | null {
  const s = useHydraulicStore.getState();
  const stack = s.redoStack ?? [];
  if (stack.length === 0) return null;

  const top = stack[stack.length - 1]!;

  const currentSnap: UndoSnapshot = {
    label: top.label,
    affectedCount: top.affectedCount,
    nodes: JSON.parse(JSON.stringify(s.nodes)) as typeof s.nodes,
    pipes: JSON.parse(JSON.stringify(s.pipes)) as typeof s.pipes,
    selection: s.selection ? { ...s.selection } : null,
    multiSelection: {
      nodeIds: [...s.multiSelection.nodeIds],
      pipeIds: [...s.multiSelection.pipeIds],
      dimensionIds: [...(s.multiSelection.dimensionIds ?? [])],
      constructionLineIds: [...(s.multiSelection.constructionLineIds ?? [])],
    },
    dimensions: JSON.parse(JSON.stringify(s.dimensions ?? [])) as NonNullable<UndoSnapshot["dimensions"]>,
    constructionLines: JSON.parse(JSON.stringify(s.constructionLines ?? [])) as NonNullable<UndoSnapshot["constructionLines"]>,
  };

  useHydraulicStore.setState({
    nodes: top.nodes,
    pipes: top.pipes,
    selection: top.selection,
    multiSelection: top.multiSelection,
    ...(top.dimensions !== undefined ? { dimensions: top.dimensions } : {}),
    ...(top.constructionLines !== undefined ? { constructionLines: top.constructionLines } : {}),
    undoStack: [...(s.undoStack ?? []), currentSnap],
    redoStack: stack.slice(0, stack.length - 1),
  });
  return { label: top.label, affectedCount: top.affectedCount };
}

/** Diagnostic: depths of both stacks, for HUD / debug overlays. */
export function getStackDepths(): { undo: number; redo: number } {
  const s = useHydraulicStore.getState();
  return {
    undo: (s.undoStack ?? []).length,
    redo: (s.redoStack ?? []).length,
  };
}

/** Reset both stacks — called on project switch / explicit reset. */
export function clearUndoHistory(): void {
  useHydraulicStore.setState({ undoStack: [], redoStack: [] });
}
