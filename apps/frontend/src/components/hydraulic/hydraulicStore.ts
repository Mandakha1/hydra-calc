import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { HydraulicState, SchemeNode, SchemePipe, ProjectSettings } from "./hydraulicTypes";
import { emptyState } from "./hydraulicTypes";

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
  /** Select a node or pipe for editing in the side panel. */
  select(target: { kind: "node" | "pipe"; id: string } | null): void;
  selection: { kind: "node" | "pipe"; id: string } | null;
}

export const useHydraulicStore = create<HydraulicState & StoreActions>()(
  subscribeWithSelector((set) => ({
    ...emptyState(),
    selection: null,

    reset: (state) => set(state ?? emptyState()),

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
      })),

    updateSettings: (patch) =>
      set((s) => ({ settings: { ...s.settings, ...patch } })),

    setResults: (results, violations) => set({ results, violations }),

    select: (target) => set({ selection: target }),
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
