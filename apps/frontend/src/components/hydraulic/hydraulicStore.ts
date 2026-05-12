import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { HydraulicState, SchemeNode, SchemePipe, ProjectSettings } from "./hydraulicTypes";
import { emptyState } from "./hydraulicTypes";
import {
  buildClipboardPayload,
  applyPaste,
  type ClipboardPayload,
} from "./scheme/clipboard";

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
}

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
  /** Select a single node or pipe (replaces any existing selection).
   *  Resets multiSelection to just this target. */
  select(target: { kind: "node" | "pipe"; id: string } | null): void;
  /** Ctrl+click: toggle a target in multiSelection. If it was selected,
   *  remove it; if not, add it. Legacy `selection` becomes the toggled
   *  target (or null if it was the only one and got removed). */
  selectToggle(target: { kind: "node" | "pipe"; id: string }): void;
  /** Shift+click: add a target to multiSelection without toggling
   *  (idempotent — re-adding is a no-op). */
  selectExtend(target: { kind: "node" | "pipe"; id: string }): void;
  /** Rubber-band drop or Ctrl+A: replace multiSelection with the
   *  given set. Legacy `selection` follows the first item (or null
   *  for empty input). */
  selectMany(ms: MultiSelection): void;
  /** Esc: clear both legacy `selection` and `multiSelection`. */
  clearSelection(): void;
  selection: { kind: "node" | "pipe"; id: string } | null;
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

export const useHydraulicStore = create<HydraulicState & StoreActions>()(
  subscribeWithSelector((set) => ({
    ...emptyState(),
    selection: null,
    multiSelection: { nodeIds: [], pipeIds: [] },

    reset: (state) =>
      set({
        ...(state ?? emptyState()),
        selection: null,
        multiSelection: { nodeIds: [], pipeIds: [] },
        // Phase 6.5.2 — reset wipes the clipboard too. Engineers
        // switching projects don't want a stale paste from the
        // previous session to land in the new one.
        clipboard: null,
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
        },
      })),

    updateSettings: (patch) =>
      set((s) => ({ settings: { ...s.settings, ...patch } })),

    setResults: (results, violations) => set({ results, violations }),

    select: (target) =>
      set({
        selection: target,
        multiSelection: target
          ? target.kind === "node"
            ? { nodeIds: [target.id], pipeIds: [] }
            : { nodeIds: [], pipeIds: [target.id] }
          : { nodeIds: [], pipeIds: [] },
      }),

    selectToggle: (target) =>
      set((s) => {
        const ms = s.multiSelection;
        if (target.kind === "node") {
          const has = ms.nodeIds.includes(target.id);
          const nextNodeIds = has
            ? ms.nodeIds.filter((x) => x !== target.id)
            : [...ms.nodeIds, target.id];
          // After toggle off, fall back legacy `selection` to the last
          // remaining item (priority: pipes if any, else first node, else null).
          const wasOnly = has && nextNodeIds.length === 0 && ms.pipeIds.length === 0;
          return {
            multiSelection: { nodeIds: nextNodeIds, pipeIds: ms.pipeIds },
            selection: wasOnly
              ? null
              : has
                ? ms.pipeIds.length > 0
                  ? { kind: "pipe", id: ms.pipeIds[ms.pipeIds.length - 1]! }
                  : nextNodeIds.length > 0
                    ? { kind: "node", id: nextNodeIds[nextNodeIds.length - 1]! }
                    : null
                : { kind: "node", id: target.id },
          };
        }
        // pipe branch (symmetric)
        const has = ms.pipeIds.includes(target.id);
        const nextPipeIds = has
          ? ms.pipeIds.filter((x) => x !== target.id)
          : [...ms.pipeIds, target.id];
        const wasOnly = has && nextPipeIds.length === 0 && ms.nodeIds.length === 0;
        return {
          multiSelection: { nodeIds: ms.nodeIds, pipeIds: nextPipeIds },
          selection: wasOnly
            ? null
            : has
              ? nextPipeIds.length > 0
                ? { kind: "pipe", id: nextPipeIds[nextPipeIds.length - 1]! }
                : ms.nodeIds.length > 0
                  ? { kind: "node", id: ms.nodeIds[ms.nodeIds.length - 1]! }
                  : null
              : { kind: "pipe", id: target.id },
        };
      }),

    selectExtend: (target) =>
      set((s) => {
        const ms = s.multiSelection;
        if (target.kind === "node") {
          if (ms.nodeIds.includes(target.id)) return {}; // idempotent
          return {
            multiSelection: {
              nodeIds: [...ms.nodeIds, target.id],
              pipeIds: ms.pipeIds,
            },
            selection: { kind: "node", id: target.id },
          };
        }
        if (ms.pipeIds.includes(target.id)) return {};
        return {
          multiSelection: {
            nodeIds: ms.nodeIds,
            pipeIds: [...ms.pipeIds, target.id],
          },
          selection: { kind: "pipe", id: target.id },
        };
      }),

    selectMany: (ms) =>
      set(() => {
        const first =
          ms.nodeIds[0] !== undefined
            ? ({ kind: "node", id: ms.nodeIds[0] } as const)
            : ms.pipeIds[0] !== undefined
              ? ({ kind: "pipe", id: ms.pipeIds[0] } as const)
              : null;
        return {
          multiSelection: { nodeIds: [...ms.nodeIds], pipeIds: [...ms.pipeIds] },
          selection: first,
        };
      }),

    clearSelection: () =>
      set({ selection: null, multiSelection: { nodeIds: [], pipeIds: [] } }),

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
