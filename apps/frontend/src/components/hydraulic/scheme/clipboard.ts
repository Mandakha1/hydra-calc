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

import type {
  SchemeAnnotation,
  SchemeBuilding,
  SchemeNode,
  SchemePipe,
} from "../hydraulicTypes";

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
  /** Phase 6.6.3 — snapshot of selected annotations at copy time.
   *  Free-coord entities so no topology preservation needed. */
  annotations?: SchemeAnnotation[];
  /** Phase 6.8.6 — snapshot of selected reference buildings. Same
   *  free-coord semantics as annotations — no topology constraint;
   *  each polygon clones with its own fresh id on paste. */
  buildings?: SchemeBuilding[];
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
  /** Phase 6.6.3 — extra free-coord entities. Both arguments optional
   *  for callers that haven't been threaded through yet (backward
   *  compat with Phase 6.5.2 store cut/copy/paste signatures). */
  annotations?: SchemeAnnotation[],
  annotationIds?: string[],
  /** Phase 6.8.6 — reference buildings. Same optional-args pattern. */
  buildings?: SchemeBuilding[],
  buildingIds?: string[],
): ClipboardPayload | null {
  const annIds = annotationIds ?? [];
  const bldIds = buildingIds ?? [];
  if (
    nodeIds.length === 0
    && pipeIds.length === 0
    && annIds.length === 0
    && bldIds.length === 0
  ) {
    return null;
  }

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

  // Phase 6.6.3 — free-coord annotations. No topology constraint,
  // just clone the selected ones verbatim.
  const annIdSet = new Set(annIds);
  const copiedAnnotations: SchemeAnnotation[] = [];
  if (annotations && annIdSet.size > 0) {
    for (const a of annotations) {
      if (annIdSet.has(a.id)) {
        copiedAnnotations.push(JSON.parse(JSON.stringify(a)) as SchemeAnnotation);
      }
    }
  }

  // Phase 6.8.6 — reference buildings. Same free-coord pattern as
  // annotations — no topology dependency on nodes/pipes, just deep-
  // clone the selected polygons.
  const bldIdSet = new Set(bldIds);
  const copiedBuildings: SchemeBuilding[] = [];
  if (buildings && bldIdSet.size > 0) {
    for (const b of buildings) {
      if (bldIdSet.has(b.id)) {
        copiedBuildings.push(JSON.parse(JSON.stringify(b)) as SchemeBuilding);
      }
    }
  }

  return {
    nodes: copiedNodes,
    pipes: copiedPipes,
    annotations: copiedAnnotations,
    buildings: copiedBuildings,
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
): {
  nodes: SchemeNode[];
  pipes: SchemePipe[];
  /** Phase 6.6.3 — free-coord annotations cloned with fresh ids and
   *  the same px offset as nodes. Always present (possibly empty)
   *  so consumers don't need a null check. */
  annotations: SchemeAnnotation[];
  /** Phase 6.8.6 — reference buildings cloned with fresh ids,
   *  polygon vertices shifted by the same px + geo offset as the
   *  nodes. */
  buildings: SchemeBuilding[];
  oldToNewId: Map<string, string>;
} {
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

  // Phase 6.6.3 — annotations clone with fresh ids and a px-space
  // offset that mirrors the node shift (no geo math — annotations
  // aren't geo-anchored).
  const px_offset_x = offset_m.x * (mapPxPerMeter ?? 1);
  const px_offset_y = offset_m.y * (mapPxPerMeter ?? 1);
  const newAnnotations: SchemeAnnotation[] = (payload.annotations ?? []).map((a) => ({
    ...a,
    id: uid("note"),
    x: Math.round(a.x + px_offset_x),
    y: Math.round(a.y + px_offset_y),
    // Geo offset (only applied when the original annotation carries geo).
    ...(a.geo
      ? {
          geo: {
            lat: a.geo.lat + offset_m.y / M_PER_DEG_LAT,
            lon: a.geo.lon + offset_m.x / m_per_deg_lon,
          },
        }
      : {}),
  }));

  // Phase 6.8.6 — reference buildings. Polygon vertices each get
  // the same px offset; vertices with geo also get the same
  // lat/lon delta as the nodes, so a copied building on a map
  // tracks the map view at its NEW position.
  const newBuildings: SchemeBuilding[] = (payload.buildings ?? []).map((b) => ({
    ...b,
    id: uid("bld"),
    polygon: b.polygon.map((v) => ({
      x: Math.round(v.x + px_offset_x),
      y: Math.round(v.y + px_offset_y),
      ...(typeof v.lat === "number"
        ? { lat: v.lat + offset_m.y / M_PER_DEG_LAT }
        : {}),
      ...(typeof v.lon === "number"
        ? { lon: v.lon + offset_m.x / m_per_deg_lon }
        : {}),
    })),
  }));

  return {
    nodes: newNodes,
    pipes: newPipes,
    annotations: newAnnotations,
    buildings: newBuildings,
    oldToNewId,
  };
}
