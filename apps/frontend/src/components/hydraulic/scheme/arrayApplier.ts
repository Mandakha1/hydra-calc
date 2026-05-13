/**
 * Phase 6.5.4 — Thin store-bridge for array operations.
 *
 * Why a separate module instead of a new store action:
 *   Adding more methods to StoreActions risks tipping TypeScript's
 *   curried-generic inference over the threshold that broke Phase
 *   6.5.3-B (panel-wide `(s) => s.foo` collapsing to `any`). Until
 *   the planned slice-split refactor lands, NEW Phase 6.5.4 entry
 *   points live as plain functions that read/write the store via
 *   `useHydraulicStore.getState()` — no impact on the store's type
 *   surface.
 *
 *   This pattern stays consistent with how clipboard.ts's helpers
 *   work (`buildClipboardPayload` + `applyPaste` are pure; the
 *   store actions just call them). The difference here: we skip
 *   the store action entirely.
 *
 * UI integration:
 *   The toolbar's "Massив" button opens a dialog. On confirm, the
 *   dialog imports applyLinearArrayToSelection / applyPolarArrayToSelection
 *   from here and calls it. Selection state mutation + node/pipe
 *   inserts go through the existing addNode/addPipe + selectMany
 *   store actions.
 */

import { useHydraulicStore, uid } from "../hydraulicStore";
import {
  buildClipboardPayload,
} from "./clipboard";
import {
  linearArray,
  polarArray,
  type LinearArrayParams,
  type PolarArrayParams,
} from "./arrayOps";
import { pushUndoSnapshot } from "./undoStack";

/**
 * Build a linear array from the current multi-selection, insert
 * every clone into the store, and auto-select the new copies (so
 * the engineer can immediately drag the whole grid further if
 * needed).
 *
 * @returns Counts inserted, or null when the selection was empty.
 */
export function applyLinearArrayToSelection(
  params: LinearArrayParams,
  mapPxPerMeter: number | null = null,
): { nodes: number; pipes: number } | null {
  const s = useHydraulicStore.getState();
  const payload = buildClipboardPayload(
    s.nodes,
    s.pipes,
    s.multiSelection.nodeIds,
    s.multiSelection.pipeIds,
  );
  if (!payload) return null;
  const copies = linearArray(payload, params, uid, mapPxPerMeter);
  // Phase 6.5.5 — snapshot pre-insert so Ctrl+Z removes the whole
  // generated grid in a single step.
  const total = copies.reduce(
    (acc, c) => acc + c.nodes.length + c.pipes.length,
    0,
  );
  pushUndoSnapshot("Шугаман массив", total);
  return insertCopies(copies);
}

/**
 * Build a polar array from the current multi-selection, insert
 * every clone, and auto-select the new copies.
 *
 * @returns Counts inserted, or null when the selection was empty.
 */
export function applyPolarArrayToSelection(
  params: PolarArrayParams,
  mapPxPerMeter: number | null = null,
): { nodes: number; pipes: number } | null {
  const s = useHydraulicStore.getState();
  const payload = buildClipboardPayload(
    s.nodes,
    s.pipes,
    s.multiSelection.nodeIds,
    s.multiSelection.pipeIds,
  );
  if (!payload) return null;
  const copies = polarArray(payload, params, uid, mapPxPerMeter);
  // Phase 6.5.5 — snapshot pre-insert.
  const total = copies.reduce(
    (acc, c) => acc + c.nodes.length + c.pipes.length,
    0,
  );
  pushUndoSnapshot("Радиал массив", total);
  return insertCopies(copies);
}

/* ─── Internals ─────────────────────────────────────────────────── */

/**
 * Helper to insert an array of cloned payloads into the store
 * atomically. Pulls the uid generator from the store via the
 * exported `uid` function (same namespace as hand-placed nodes).
 */
function insertCopies(
  copies: Array<{
    nodes: Array<import("../hydraulicTypes").SchemeNode>;
    pipes: Array<import("../hydraulicTypes").SchemePipe>;
  }>,
): { nodes: number; pipes: number } {
  if (copies.length === 0) return { nodes: 0, pipes: 0 };
  // Phase 6.8.1 — use a single batched setState instead of N
  // addNode/addPipe calls. The wrapping action (applyLinearArrayTo*
  // / applyRadialArrayTo*) already pushed ONE undo snapshot
  // labelled "Шугаман массив" / "Радиал массив"; calling addNode/
  // addPipe in a loop would push N+1 snapshots and bury the batch
  // label under "Цэг нэмсэн" entries. Same idea as pasteClipboard.
  const allNewNodes: Array<import("../hydraulicTypes").SchemeNode> = [];
  const allNewPipes: Array<import("../hydraulicTypes").SchemePipe> = [];
  const newNodeIds: string[] = [];
  const newPipeIds: string[] = [];
  for (const c of copies) {
    for (const n of c.nodes) {
      allNewNodes.push(n);
      newNodeIds.push(n.id);
    }
    for (const p of c.pipes) {
      allNewPipes.push(p);
      newPipeIds.push(p.id);
    }
  }
  useHydraulicStore.setState((s) => ({
    nodes: [...s.nodes, ...allNewNodes],
    pipes: [...s.pipes, ...allNewPipes],
  }));
  const st = useHydraulicStore.getState();
  const nodeCount = allNewNodes.length;
  const pipeCount = allNewPipes.length;
  // Auto-select the newly-inserted clones so the engineer can keep
  // working with them (drag, copy, delete, etc).
  st.selectMany({ nodeIds: newNodeIds, pipeIds: newPipeIds });
  return { nodes: nodeCount, pipes: pipeCount };
}

