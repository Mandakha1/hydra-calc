/**
 * Phase 6.5.2 — clipboard helpers (copy / paste / cut with topology
 * preservation and ID rewriting).
 *
 * Strategy:
 *   - Pure functions that take the current graph + selection and
 *     return either a `ClipboardPayload` (copy) or `{ nodes, pipes }`
 *     with fresh IDs (paste). The store-level actions in
 *     hydraulicStore use these helpers under the hood.
 *   - Topology preservation: only pipes whose BOTH endpoints are in
 *     the selection get copied — external pipes would create dangling
 *     references on paste.
 *   - ID rewriting: every pasted node gets a fresh ID from the same
 *     generator the editor uses for hand-placed nodes (`uid`); pipe
 *     `fromNodeId` / `toNodeId` are rewritten via an oldID → newID map.
 *   - Translation offset: default +20 m in BOTH x and y so the pasted
 *     cluster lands visibly south-east of the original (engineering
 *     convention — pasted copies feel "next to" the originals, ready
 *     to be moved further). Caller may pass a custom offset (e.g. for
 *     paste-at-cursor).
 *   - Solver-computed fields are NOT preserved — caller invalidates
 *     `results` after a paste so the next compute regenerates them.
 *
 * NOT in scope:
 *   - System-clipboard interop (no `navigator.clipboard.writeText`).
 *   - Persistent clipboard across page reloads.
 *   - Undo coverage — wired into the store's undo stack in 6.5.5.
 */

import type { SchemeNode, SchemePipe } from "../hydraulicTypes";

/**
 * What lives in the in-memory clipboard after a `copy()` or `cut()`.
 * Stored as plain arrays; consumers re-clone on paste so the same
 * payload can be pasted multiple times without aliasing.
 */
export interface ClipboardPayload {
  /** Snapshot of the selected nodes at copy time. */
  nodes: SchemeNode[];
  /** Snapshot of the intra-selection pipes (both endpoints in the
   *  selected node set). */
  pipes: SchemePipe[];
  /** ms timestamp — useful for UI staleness checks ("pasted from
   *  clipboard 4 minutes ago"). */
  copiedAt: number;
}

/** Default paste offset in metres — applied to both x/y so the
 *  pasted cluster lands south-east of the original. */
export const PASTE_OFFSET_M = 20;

/**
 * Build a clipboard payload from the current network + selection.
 *
 * @param nodes      All nodes currently in the network.
 * @param pipes      All pipes currently in the network.
 * @param nodeIds    Selected node ids (from multiSelection.nodeIds).
 * @param pipeIds    Selected pipe ids (from multiSelection.pipeIds).
 *                   These are an OPTIONAL constraint; even when empty,
 *                   we auto-include every intra-selection pipe (where
 *                   both endpoints are in `nodeIds`) so a user who
 *                   rubber-banded "all nodes in this district" but
 *                   didn't explicitly select the pipes between them
 *                   still gets a complete sub-network on paste.
 * @returns          The payload, or `null` when the selection is empty.
 */
export function buildClipboardPayload(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  nodeIds: string[],
  pipeIds: string[],
): ClipboardPayload | null {
  if (nodeIds.length === 0 && pipeIds.length === 0) return null;

  const nodeIdSet = new Set(nodeIds);
  const copiedNodes: SchemeNode[] = [];
  for (const n of nodes) {
    if (nodeIdSet.has(n.id)) {
      // Deep clone — JSON round-trip avoids any nested-object aliasing.
      copiedNodes.push(JSON.parse(JSON.stringify(n)) as SchemeNode);
    }
  }

  // Intra-selection pipes: include if BOTH endpoints are in nodeIds.
  // Also include any explicitly-selected pipe (pipeIds), but ONLY if
  // its endpoints are also in nodeIds — otherwise paste would dangle.
  const copiedPipes: SchemePipe[] = [];
  const pipeIdSet = new Set(pipeIds);
  for (const p of pipes) {
    const bothEndpoints = nodeIdSet.has(p.fromNodeId) && nodeIdSet.has(p.toNodeId);
    if (!bothEndpoints) continue; // skip dangling
    if (nodeIdSet.size > 0 || pipeIdSet.has(p.id)) {
      copiedPipes.push(JSON.parse(JSON.stringify(p)) as SchemePipe);
    }
  }

  return {
    nodes: copiedNodes,
    pipes: copiedPipes,
    copiedAt: Date.now(),
  };
}

/**
 * Compute the result of pasting a clipboard payload — pure function,
 * caller inserts the returned nodes + pipes into the store.
 *
 * @param payload    The clipboard payload from a prior copy/cut.
 * @param uid        ID generator. Caller passes the editor's existing
 *                   `uid()` (from hydraulicStore) so generated IDs
 *                   share the same uniqueness namespace.
 * @param offset_m   Translation offset in metres. Defaults to
 *                   { x: PASTE_OFFSET_M, y: PASTE_OFFSET_M } so paste
 *                   lands south-east. Caller may pass a cursor-relative
 *                   delta for paste-at-cursor UX.
 * @param mapPxPerMeter  When the original nodes were geo-anchored,
 *                   the lat/lon offset is derived using Haversine-
 *                   consistent metres-per-degree. Pass `null` (the
 *                   default) when the project isn't on a map — only
 *                   x/y is shifted then.
 */
export function applyPaste(
  payload: ClipboardPayload,
  uid: (prefix?: string) => string,
  offset_m: { x: number; y: number } = { x: PASTE_OFFSET_M, y: PASTE_OFFSET_M },
  mapPxPerMeter: number | null = null,
): { nodes: SchemeNode[]; pipes: SchemePipe[]; oldToNewId: Map<string, string> } {
  const oldToNewId = new Map<string, string>();

  // Earth-consistent m → deg conversion (same Web-Mercator formula as
  // symbolSize.pxPerMeterAtZoom — kept inline so this module has no
  // cross-dep on the Phase 6A helper).
  const EARTH_R_M = 6_371_000;
  const M_PER_DEG_LAT = (Math.PI * EARTH_R_M) / 180;

  // For geo-offset: convert metres → lat/lon delta using the FIRST
  // geo-anchored node's latitude as the cosine reference. This is
  // accurate for clusters spanning < 1° — typical for hydraulic
  // networks (< 100 km).
  const firstGeoNode = payload.nodes.find((n) => n.geo !== undefined);
  const refLat = firstGeoNode?.geo?.lat ?? 47.92;
  const m_per_deg_lon = Math.cos((refLat * Math.PI) / 180) * M_PER_DEG_LAT;

  const newNodes: SchemeNode[] = payload.nodes.map((n) => {
    const newId = uid(n.kind.split("_")[0] ?? "n");
    oldToNewId.set(n.id, newId);
    const cloned: SchemeNode = {
      ...n,
      id: newId,
      x: Math.round(n.x + offset_m.x * (mapPxPerMeter ?? 1)),
      y: Math.round(n.y + offset_m.y * (mapPxPerMeter ?? 1)),
    };
    if (n.geo) {
      // Convert metre offset to lat/lon delta at the cluster's
      // reference latitude. y positive = south = lower lat (we use
      // +y → +lat convention to match SchemeEditor's screen mapping).
      cloned.geo = {
        lat: n.geo.lat + offset_m.y / M_PER_DEG_LAT,
        lon: n.geo.lon + offset_m.x / m_per_deg_lon,
      };
    }
    return cloned;
  });

  const newPipes: SchemePipe[] = [];
  for (const p of payload.pipes) {
    const fromMapped = oldToNewId.get(p.fromNodeId);
    const toMapped = oldToNewId.get(p.toNodeId);
    // Pure-function defensive check — buildClipboardPayload should
    // have already filtered dangling pipes, but a hand-crafted payload
    // (or a future feature that injects pipes from elsewhere) could
    // hit this path. Skip rather than throw — we don't want a paste to
    // half-fail.
    if (!fromMapped || !toMapped) continue;
    newPipes.push({
      ...p,
      id: uid(p.circuit?.split("_")[0] ?? "p"),
      fromNodeId: fromMapped,
      toNodeId: toMapped,
    });
  }

  return { nodes: newNodes, pipes: newPipes, oldToNewId };
}
