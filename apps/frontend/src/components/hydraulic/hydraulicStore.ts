import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { HydraulicState, SchemeNode, SchemePipe, ProjectSettings } from "./hydraulicTypes";
import { emptyState } from "./hydraulicTypes";
import {
  buildClipboardPayload,
  applyPaste,
  type ClipboardPayload,
} from "./scheme/clipboard";
// Phase 6.5.3 — pure transform helpers exist in ./scheme/transforms.ts
// (translateNodes / rotateNodes / mirrorNodes / centroidPx / centroidGeo)
// with 23 tests covering rotation + mirror + geo-coord behaviour.
// Store-level wiring (translateSelection / rotateSelectionAroundCentroid
// / mirrorSelectionHorizontal-Vertical) intentionally DEFERRED to a
// follow-on PR — adding these to StoreActions pushed TS's curried-
// generic inference past its complexity budget, breaking selector
// type inference across every consumer panel. The math is ready;
// the store wiring needs a careful selector-typing refactor (or a
// Zustand slice split) which is a separate-PR risk-isolated task.

/** Phase 6.5.1 — Multi-selection state.
 *
 *  Two parallel selection surfaces, kept in sync:
 *    1. `selection` (legacy, single-target) — what InspectorPanel
 *       renders, what right-click context menu treats as "the target",
 *       what existing Phase 5/6 consumers read. Stays a single
 *       `{ kind, id }` so 24+ existing call-sites don't need changes.
 *    2. `multiSelection` (new) — sets of all currently-selected node
 *       ids + pipe ids. Used by visual feedback (rings on each), batch
 *       context menu, and future 6.5.2 clipboard / 6.5.3 group
 *       transforms / 6.5.4 array operations.
 *
 *  Invariants:
 *    - On `select(target)`: replace BOTH legacy and multiSelection
 *      with the single target. (Click-without-modifier behavior.)
 *    - `selectToggle(target)`: mutate multiSelection only; legacy
 *      `selection` follows last-clicked.
 *    - `selectExtend(target)`: add to multiSelection (Shift+click);
 *      legacy `selection` follows last-clicked.
 *    - `selectMany({nodeIds, pipeIds})`: replace multiSelection with
 *      the given set (rubber-band drop / Ctrl+A). Legacy `selection`
 *      gets the first item (so InspectorPanel has something to show)
 *      or stays null when empty.
 *    - `clearSelection()`: both go null/empty.
 *
 *  Sets are stored as plain arrays here (Zustand doesn't deep-equal
 *  Set instances cleanly) and converted to Set on read at consumer
 *  sites — small perf cost, big stability win. */
export interface MultiSelection {
  nodeIds: string[];
  pipeIds: string[];
  /** Phase 6.6.1 — dimension selection set. Optional in interface
   *  for backward compatibility; readers should treat `undefined` as
   *  `[]`. The store always initialises it as `[]`. */
  dimensionIds?: string[];
  /** Phase 6.6.2 — construction-line selection set. Same optional
   *  semantics as dimensionIds. */
  constructionLineIds?: string[];
}

/** Phase 6.6.2 — central selection-kind union. Each phase that adds
 *  a new selectable entity extends this union. Pulled into a named
 *  alias so the four selection actions (select, selectToggle,
 *  selectExtend, selectMany) and the legacy `selection` field
 *  reference the same type — adding a future kind ("annotation",
 *  "leader", …) is a single-line edit. */
export type SelectionTarget = {
  kind: "node" | "pipe" | "dimension" | "constructionLine";
  id: string;
};

interface StoreActions {
  reset(state?: HydraulicState): void;
  addNode(node: SchemeNode): void;
  updateNode(id: string, patch: Partial<SchemeNode>): void;
  removeNode(id: string): void;
  addPipe(pipe: SchemePipe): void;
  updatePipe(id: string, patch: Partial<SchemePipe>): void;
  removePipe(id: string): void;
  updateSettings(patch: Partial<ProjectSettings>): void;
  setResults(results: HydraulicState["results"], violations: HydraulicState["violations"]): void;
  /** Select a single node, pipe, dimension (6.6.1) or construction
   *  line (6.6.2). Resets multiSelection to just this target. */
  select(target: SelectionTarget | null): void;
  /** Ctrl+click: toggle a target in multiSelection. If it was selected,
   *  remove it; if not, add it. Legacy `selection` becomes the toggled
   *  target (or null if it was the only one and got removed). */
  selectToggle(target: SelectionTarget): void;
  /** Shift+click: add a target to multiSelection without toggling
   *  (idempotent — re-adding is a no-op). */
  selectExtend(target: SelectionTarget): void;
  /** Rubber-band drop or Ctrl+A: replace multiSelection with the
   *  given set. Legacy `selection` follows the first item (or null
   *  for empty input). */
  selectMany(ms: MultiSelection): void;
  /** Esc: clear both legacy `selection` and `multiSelection`. */
  clearSelection(): void;
  selection: SelectionTarget | null;
  multiSelection: MultiSelection;

  /* ============== Clipboard (Phase 6.5.2) ==================== */

  /** In-memory clipboard payload from the last copy/cut, or null. */
  clipboard: ClipboardPayload | null;
  /** Ctrl+C: copy current multiSelection into clipboard. No-op when
   *  the selection is empty. Returns the count of items copied (so
   *  the UI can render a toast). */
  copySelection(): { nodes: number; pipes: number } | null;
  /** Ctrl+X: copy + delete the multiSelection in one step. Returns
   *  the count of items affected. */
  cutSelection(): { nodes: number; pipes: number } | null;
  /** Ctrl+V: paste the clipboard with default offset (or custom
   *  delta). Each paste produces fresh IDs and select the newly-
   *  pasted objects so the engineer can immediately drag them
   *  further. Returns the count of items inserted. */
  pasteClipboard(offset_m?: { x: number; y: number }): { nodes: number; pipes: number } | null;
}

/** Phase 6.5.3 — explicit combined store type so consumers can
 *  annotate selector parameters when TS's curried-generic inference
 *  collapses to `any` on the bare arrow form. */
export type HydraulicStoreState = HydraulicState & StoreActions;

/** Phase 6.6.2 — terse constructor for a MultiSelection with all
 *  four selection-set fields explicitly filled (defaults to empty).
 *  Centralising this means a future kind addition is a one-line edit
 *  here instead of 4-5 separate `{ nodeIds: [], pipeIds: [], … }`
 *  literals scattered across the file. */
function emptyMs(partial: Partial<MultiSelection>): MultiSelection {
  return {
    nodeIds: partial.nodeIds ?? [],
    pipeIds: partial.pipeIds ?? [],
    dimensionIds: partial.dimensionIds ?? [],
    constructionLineIds: partial.constructionLineIds ?? [],
  };
}

export const useHydraulicStore = create<HydraulicStoreState>()(
  subscribeWithSelector((set) => ({
    ...emptyState(),
    selection: null,
    multiSelection: { nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [] },

    reset: (state) =>
      set({
        ...(state ?? emptyState()),
        selection: null,
        multiSelection: { nodeIds: [], pipeIds: [], dimensionIds: [], constructionLineIds: [] },
        // Phase 6.5.2 — reset wipes the clipboard too. Engineers
        // switching projects don't want a stale paste from the
        // previous session to land in the new one.
        clipboard: null,
        // Phase 6.5.5 — same blank-slate rule for undo/redo history.
        undoStack: [],
        redoStack: [],
        // Phase 6.6.1 — same for dimensions (and future drafting aids).
        dimensions: [],
        // Phase 6.6.2 — same for construction lines.
        constructionLines: [],
      }),

    addNode: (node) =>
      set((s) => ({ nodes: [...s.nodes, node] })),

    updateNode: (id, patch) =>
      set((s) => ({
        nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      })),

    removeNode: (id) =>
      set((s) => ({
        nodes: s.nodes.filter((n) => n.id !== id),
        pipes: s.pipes.filter((p) => p.fromNodeId !== id && p.toNodeId !== id),
        selection: s.selection?.id === id ? null : s.selection,
        multiSelection: {
          nodeIds: s.multiSelection.nodeIds.filter((x) => x !== id),
          // Pipes referencing the removed node also dropped from cascade
          // delete above — sync the multiSelection.pipeIds with the
          // pipes that survive.
          pipeIds: s.multiSelection.pipeIds.filter((pid) =>
            s.pipes.find((p) => p.id === pid && p.fromNodeId !== id && p.toNodeId !== id),
          ),
          // Phase 6.6.1 — dimensions are NOT cascade-deleted when an
          // anchor node disappears; they go to "orphan state" via the
          // cached XY fallback. So the dimensionIds selection set is
          // preserved untouched here.
          dimensionIds: s.multiSelection.dimensionIds ?? [],
          // Phase 6.6.2 — construction lines are orthogonal entities
          // (no node anchor) so a node removal doesn't touch them at all.
          constructionLineIds: s.multiSelection.constructionLineIds ?? [],
        },
      })),

    addPipe: (pipe) =>
      set((s) => ({ pipes: [...s.pipes, pipe] })),

    updatePipe: (id, patch) =>
      set((s) => ({
        pipes: s.pipes.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),

    removePipe: (id) =>
      set((s) => ({
        pipes: s.pipes.filter((p) => p.id !== id),
        selection: s.selection?.id === id ? null : s.selection,
        multiSelection: {
          nodeIds: s.multiSelection.nodeIds,
          pipeIds: s.multiSelection.pipeIds.filter((x) => x !== id),
          dimensionIds: s.multiSelection.dimensionIds ?? [],
          // Phase 6.6.2 — construction lines untouched.
          constructionLineIds: s.multiSelection.constructionLineIds ?? [],
        },
      })),

    updateSettings: (patch) =>
      set((s) => ({ settings: { ...s.settings, ...patch } })),

    setResults: (results, violations) => set({ results, violations }),

    select: (target) =>
      set({
        selection: target,
        multiSelection: emptyMs(
          target
            ? target.kind === "node"
              ? { nodeIds: [target.id] }
              : target.kind === "pipe"
                ? { pipeIds: [target.id] }
                : target.kind === "dimension"
                  ? { dimensionIds: [target.id] }
                  : { constructionLineIds: [target.id] }
            : {},
        ),
      }),

    selectToggle: (target) =>
      set((s) => {
        // Phase 6.6.2 — unified toggle logic handling all 4 kinds.
        // Pull out the relevant list, toggle the target, then
        // figure out where the legacy `selection` should point.
        const ms = s.multiSelection;
        const dimIds = ms.dimensionIds ?? [];
        const clIds = ms.constructionLineIds ?? [];

        const kindToList = {
          node: ms.nodeIds,
          pipe: ms.pipeIds,
          dimension: dimIds,
          constructionLine: clIds,
        } as const;
        const currentList = kindToList[target.kind];
        const has = currentList.includes(target.id);
        const nextList = has
          ? currentList.filter((x) => x !== target.id)
          : [...currentList, target.id];

        const nextMs: MultiSelection = {
          nodeIds: target.kind === "node" ? nextList : ms.nodeIds,
          pipeIds: target.kind === "pipe" ? nextList : ms.pipeIds,
          dimensionIds: target.kind === "dimension" ? nextList : dimIds,
          constructionLineIds: target.kind === "constructionLine" ? nextList : clIds,
        };

        // Legacy selection priority on toggle-off: latest of (this kind
        // remaining → pipe → node → dimension → constructionLine → null).
        let nextSel: SelectionTarget | null;
        if (!has) {
          nextSel = { kind: target.kind, id: target.id };
        } else {
          // Walk priority list to find a fallback.
          if (nextList.length > 0) {
            nextSel = { kind: target.kind, id: nextList[nextList.length - 1]! };
          } else if (nextMs.pipeIds.length > 0) {
            nextSel = { kind: "pipe", id: nextMs.pipeIds[nextMs.pipeIds.length - 1]! };
          } else if (nextMs.nodeIds.length > 0) {
            nextSel = { kind: "node", id: nextMs.nodeIds[nextMs.nodeIds.length - 1]! };
          } else if ((nextMs.dimensionIds ?? []).length > 0) {
            const d = nextMs.dimensionIds!;
            nextSel = { kind: "dimension", id: d[d.length - 1]! };
          } else if ((nextMs.constructionLineIds ?? []).length > 0) {
            const c = nextMs.constructionLineIds!;
            nextSel = { kind: "constructionLine", id: c[c.length - 1]! };
          } else {
            nextSel = null;
          }
        }

        return { multiSelection: nextMs, selection: nextSel };
      }),

    selectExtend: (target) =>
      set((s) => {
        const ms = s.multiSelection;
        const dimIds = ms.dimensionIds ?? [];
        const clIds = ms.constructionLineIds ?? [];
        if (target.kind === "node") {
          if (ms.nodeIds.includes(target.id)) return {}; // idempotent
          return {
            multiSelection: {
              nodeIds: [...ms.nodeIds, target.id],
              pipeIds: ms.pipeIds,
              dimensionIds: dimIds,
              constructionLineIds: clIds,
            },
            selection: { kind: "node", id: target.id },
          };
        }
        if (target.kind === "pipe") {
          if (ms.pipeIds.includes(target.id)) return {};
          return {
            multiSelection: {
              nodeIds: ms.nodeIds,
              pipeIds: [...ms.pipeIds, target.id],
              dimensionIds: dimIds,
              constructionLineIds: clIds,
            },
            selection: { kind: "pipe", id: target.id },
          };
        }
        if (target.kind === "dimension") {
          if (dimIds.includes(target.id)) return {};
          return {
            multiSelection: {
              nodeIds: ms.nodeIds,
              pipeIds: ms.pipeIds,
              dimensionIds: [...dimIds, target.id],
              constructionLineIds: clIds,
            },
            selection: { kind: "dimension", id: target.id },
          };
        }
        // constructionLine branch
        if (clIds.includes(target.id)) return {};
        return {
          multiSelection: {
            nodeIds: ms.nodeIds,
            pipeIds: ms.pipeIds,
            dimensionIds: dimIds,
            constructionLineIds: [...clIds, target.id],
          },
          selection: { kind: "constructionLine", id: target.id },
        };
      }),

    selectMany: (ms) =>
      set(() => {
        const dimIds = ms.dimensionIds ?? [];
        const clIds = ms.constructionLineIds ?? [];
        const first: SelectionTarget | null =
          ms.nodeIds[0] !== undefined
            ? ({ kind: "node", id: ms.nodeIds[0]! })
            : ms.pipeIds[0] !== undefined
              ? ({ kind: "pipe", id: ms.pipeIds[0]! })
              : dimIds[0] !== undefined
                ? ({ kind: "dimension", id: dimIds[0]! })
                : clIds[0] !== undefined
                  ? ({ kind: "constructionLine", id: clIds[0]! })
                  : null;
        return {
          multiSelection: {
            nodeIds: [...ms.nodeIds],
            pipeIds: [...ms.pipeIds],
            dimensionIds: [...dimIds],
            constructionLineIds: [...clIds],
          },
          selection: first,
        };
      }),

    clearSelection: () =>
      set({
        selection: null,
        multiSelection: emptyMs({}),
      }),

    /* ============== Clipboard actions (Phase 6.5.2) ============== */

    clipboard: null,

    copySelection: () => {
      const s = useHydraulicStore.getState();
      const payload = buildClipboardPayload(
        s.nodes,
        s.pipes,
        s.multiSelection.nodeIds,
        s.multiSelection.pipeIds,
      );
      if (!payload) return null;
      set({ clipboard: payload });
      return { nodes: payload.nodes.length, pipes: payload.pipes.length };
    },

    cutSelection: () => {
      const s = useHydraulicStore.getState();
      const payload = buildClipboardPayload(
        s.nodes,
        s.pipes,
        s.multiSelection.nodeIds,
        s.multiSelection.pipeIds,
      );
      if (!payload) return null;
      // Phase 6.5.5 — snapshot BEFORE cascade-delete so Ctrl+Z
      // restores the cut nodes + pipes verbatim. Inlined here to
      // avoid a cyclic import (undoStack.ts imports from this file).
      _pushUndoSnapshotInline(
        "Бөгөмөөр зүссэн",
        payload.nodes.length + payload.pipes.length,
      );
      // Snapshot ids — removeNode cascades to touched pipes and would
      // mutate multiSelection mid-iteration otherwise.
      const pipeIds = [...s.multiSelection.pipeIds];
      const nodeIds = [...s.multiSelection.nodeIds];
      set({ clipboard: payload });
      for (const pid of pipeIds) useHydraulicStore.getState().removePipe(pid);
      for (const nid of nodeIds) useHydraulicStore.getState().removeNode(nid);
      // After cascade, multiSelection might still have stray pipe ids
      // that got swept by the cascade — clearSelection cleans up.
      useHydraulicStore.getState().clearSelection();
      return { nodes: payload.nodes.length, pipes: payload.pipes.length };
    },

    pasteClipboard: (offset_m) => {
      const s = useHydraulicStore.getState();
      if (!s.clipboard) return null;
      // Use the existing uid() generator so pasted IDs share the
      // same namespace as hand-placed nodes — no collision risk.
      const { nodes: pastedNodes, pipes: pastedPipes } = applyPaste(
        s.clipboard,
        uid,
        offset_m,
      );
      // Phase 6.5.5 — snapshot pre-insert so Ctrl+Z removes the
      // pasted cluster in one step.
      _pushUndoSnapshotInline(
        "Буулгасан",
        pastedNodes.length + pastedPipes.length,
      );
      // Insert each — addNode / addPipe push to the arrays atomically
      // per call. set() in a single shot would also work but is less
      // friendly for future undo-stack integration (6.5.5).
      set((cur) => ({
        nodes: [...cur.nodes, ...pastedNodes],
        pipes: [...cur.pipes, ...pastedPipes],
      }));
      // Auto-select the pasted cluster (UX expectation: paste = "now
      // I want to drag this further"). Replaces any prior selection.
      useHydraulicStore.getState().selectMany({
        nodeIds: pastedNodes.map((n) => n.id),
        pipeIds: pastedPipes.map((p) => p.id),
      });
      return { nodes: pastedNodes.length, pipes: pastedPipes.length };
    },
  })),
);

// Dev-only debug hook: expose store API for browser-console testing / scripting.
// In prod this is stripped via dead-code elimination once import.meta.env is "production".
if (typeof window !== "undefined" && import.meta.env.DEV) {
  (window as unknown as { __hydra: typeof useHydraulicStore }).__hydra = useHydraulicStore;
}

/** Stable shallow selector for the data subset that matters for persistence. */
export function snapshotForSave(s: HydraulicState): HydraulicState {
  return {
    nodes: s.nodes,
    pipes: s.pipes,
    settings: s.settings,
    results: s.results,
    violations: s.violations,
    schemaVersion: 5,
  };
}

let nextId = 0;
export function uid(prefix = "n"): string {
  nextId += 1;
  return `${prefix}_${Date.now().toString(36)}_${nextId}`;
}

/** Phase 6.5.5 — internal undo-snapshot push.
 *
 *  Inlined here (rather than imported from scheme/undoStack.ts) to
 *  avoid a cyclic dependency: undoStack.ts imports `useHydraulicStore`
 *  from this file, and clipboard's cut/paste actions in this file
 *  need to push a snapshot. We duplicate ~15 lines of snapshot logic
 *  instead of restructuring — clearer than introducing a third
 *  shared module for two consumers.
 *
 *  Outside callers (transformApplier, arrayApplier, SchemeEditor Del
 *  handler) all use the proper exported `pushUndoSnapshot` from
 *  scheme/undoStack.ts. */
const _MAX_UNDO_DEPTH = 50;
function _pushUndoSnapshotInline(label: string, affectedCount: number): void {
  const s = useHydraulicStore.getState();
  const snap = {
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
    // Phase 6.6.2 — drafting aids participate in undo so a paste /
    // cut snapshot taken AFTER a dimension or construction-line edit
    // restores them correctly on rollback.
    dimensions: JSON.parse(JSON.stringify(s.dimensions ?? [])) as NonNullable<typeof s.dimensions>,
    constructionLines: JSON.parse(JSON.stringify(s.constructionLines ?? [])) as NonNullable<typeof s.constructionLines>,
  };
  const existing = s.undoStack ?? [];
  const next = [...existing, snap];
  const capped =
    next.length > _MAX_UNDO_DEPTH ? next.slice(next.length - _MAX_UNDO_DEPTH) : next;
  useHydraulicStore.setState({ undoStack: capped, redoStack: [] });
}
