/**
 * Phase 12.5 — Pure helpers for SchemeChannel CRUD.
 *
 * Build / add pipe / remove pipe operations expressed as immutable
 * transformations. The caller (SchemeEditor + store actions) wraps
 * these in pushUndoSnapshot for atomic undo/redo.
 *
 * No DOM, no React, no store coupling.
 */
import type { SchemeChannel, SchemePipe } from "../hydraulicTypes";
import type { PipeCircuit } from "../nodeCatalog";
import {
  CHANNEL_TYPE_REGISTRY,
  CIRCUIT_DEFAULTS,
  type ChannelTypeKey,
} from "./channelTypes";

/** Generate a UUID-ish ID for new entities. Mirrors uid() from store. */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Build a new SchemeChannel + its contained SchemePipe entities from
 * an engineer's draw action. Returns the channel + pipes that the
 * caller dispatches atomically to the store.
 *
 * Pipe order matches CIRCUIT_DEFAULTS so the cross-section detail view
 * (Phase 12.6) lays out pipes left-to-right in canonical order
 * (D2.1 | D2.2 | D3 | D4 | У1).
 */
export function buildChannelFromDraw(args: {
  fromNodeId: string;
  toNodeId: string;
  bendPoints?: Array<{ x: number; y: number; lat?: number; lon?: number }>;
  anglePolicy?: "free" | "snap_45" | "snap_90";
  channelType: ChannelTypeKey;
  /** Custom dimensions (only used when channelType === 'custom'). */
  customWidth_mm?: number;
  customHeight_mm?: number;
  /** Circuits to include. Order doesn't matter — the result orders
   *  pipes per CIRCUIT_DEFAULTS for canonical cross-section layout. */
  pipeCircuits: PipeCircuit[];
  /** Default DN to assign to every pipe. Engineer adjusts per-pipe
   *  later via Inspector. */
  defaultDn?: number;
  /** Default material key. */
  defaultMaterialKey?: string;
  /** Auto-computed pipe length in metres (used for length_m on all
   *  contained pipes — they share the channel's geometry). */
  length_m: number;
}): { channel: SchemeChannel; pipes: SchemePipe[] } {
  const {
    fromNodeId,
    toNodeId,
    bendPoints,
    anglePolicy,
    channelType,
    customWidth_mm,
    customHeight_mm,
    pipeCircuits,
    defaultDn = 100,
    defaultMaterialKey = "steel_aged",
    length_m,
  } = args;

  // Order circuits per CIRCUIT_DEFAULTS canonical sequence
  const orderedCircuits: PipeCircuit[] = CIRCUIT_DEFAULTS
    .map((c) => c.circuit)
    .filter((c) => pipeCircuits.includes(c));

  const channelId = genId("ch");
  const pipes: SchemePipe[] = orderedCircuits.map((circuit) => ({
    id: genId("p"),
    fromNodeId,
    toNodeId,
    materialKey: defaultMaterialKey,
    dn: defaultDn,
    length_m,
    circuit,
    channelId,
    ...(bendPoints ? { bendPoints } : {}),
    ...(anglePolicy ? { anglePolicy } : {}),
  }));

  // Resolve channel cross-section dimensions
  let crossSectionWidth_mm: number;
  let crossSectionHeight_mm: number;
  if (channelType === "custom") {
    crossSectionWidth_mm = customWidth_mm ?? 0;
    crossSectionHeight_mm = customHeight_mm ?? 0;
  } else {
    const spec = CHANNEL_TYPE_REGISTRY[channelType];
    crossSectionWidth_mm = spec.widthMm;
    crossSectionHeight_mm = spec.heightMm;
  }

  const channel: SchemeChannel = {
    id: channelId,
    type: "channel",
    fromNodeId,
    toNodeId,
    channelType,
    crossSectionWidth_mm,
    crossSectionHeight_mm,
    pipeIds: pipes.map((p) => p.id),
    ...(bendPoints ? { bendPoints } : {}),
    ...(anglePolicy ? { anglePolicy } : {}),
  };

  return { channel, pipes };
}

/**
 * Convert an existing SchemePipe into a SchemeChannel. The existing
 * pipe becomes the first contained pipe; additional circuits are
 * created. The pipe's geometry (bendPoints / fromNodeId / toNodeId /
 * length_m) is preserved.
 *
 * Returns: { channel, additionalPipes, pipePatch } where:
 *   - channel: new SchemeChannel to insert
 *   - additionalPipes: new SchemePipe entities (for circuits other
 *     than the existing pipe's circuit)
 *   - pipePatch: { id, channelId } to update the existing pipe with
 *     a back-reference to the new channel
 */
export function convertPipeToChannel(args: {
  existingPipe: SchemePipe;
  channelType: ChannelTypeKey;
  customWidth_mm?: number;
  customHeight_mm?: number;
  /** Circuits to include IN ADDITION to the existing pipe's circuit.
   *  If existing pipe has heating_supply, additionalCircuits might be
   *  [heating_return, dhw_supply]. */
  additionalCircuits: PipeCircuit[];
  defaultDn?: number;
  defaultMaterialKey?: string;
}): {
  channel: SchemeChannel;
  additionalPipes: SchemePipe[];
  pipePatch: { id: string; channelId: string };
} {
  const {
    existingPipe,
    channelType,
    customWidth_mm,
    customHeight_mm,
    additionalCircuits,
    defaultDn = existingPipe.dn,
    defaultMaterialKey = existingPipe.materialKey,
  } = args;

  const channelId = genId("ch");

  // Determine dimensions
  let crossSectionWidth_mm: number;
  let crossSectionHeight_mm: number;
  if (channelType === "custom") {
    crossSectionWidth_mm = customWidth_mm ?? 0;
    crossSectionHeight_mm = customHeight_mm ?? 0;
  } else {
    const spec = CHANNEL_TYPE_REGISTRY[channelType];
    crossSectionWidth_mm = spec.widthMm;
    crossSectionHeight_mm = spec.heightMm;
  }

  // Create additional pipes (skip any duplicating the existing pipe's circuit)
  const existingCircuit = existingPipe.circuit;
  const additionalPipes: SchemePipe[] = additionalCircuits
    .filter((c) => c !== existingCircuit)
    .map((circuit) => ({
      id: genId("p"),
      fromNodeId: existingPipe.fromNodeId,
      toNodeId: existingPipe.toNodeId,
      materialKey: defaultMaterialKey,
      dn: defaultDn,
      length_m: existingPipe.length_m,
      circuit,
      channelId,
      ...(existingPipe.bendPoints ? { bendPoints: existingPipe.bendPoints } : {}),
      ...(existingPipe.anglePolicy ? { anglePolicy: existingPipe.anglePolicy } : {}),
    }));

  // pipeIds order: existing first, then additional in CIRCUIT_DEFAULTS order
  const allCircuitsInOrder = CIRCUIT_DEFAULTS.map((c) => c.circuit);
  const allPipes = [existingPipe, ...additionalPipes];
  const orderedPipeIds = allCircuitsInOrder
    .map((c) => allPipes.find((p) => p.circuit === c)?.id)
    .filter((id): id is string => typeof id === "string");

  const channel: SchemeChannel = {
    id: channelId,
    type: "channel",
    fromNodeId: existingPipe.fromNodeId,
    toNodeId: existingPipe.toNodeId,
    channelType,
    crossSectionWidth_mm,
    crossSectionHeight_mm,
    pipeIds: orderedPipeIds,
    ...(existingPipe.bendPoints ? { bendPoints: existingPipe.bendPoints } : {}),
    ...(existingPipe.anglePolicy ? { anglePolicy: existingPipe.anglePolicy } : {}),
  };

  return {
    channel,
    additionalPipes,
    pipePatch: { id: existingPipe.id, channelId },
  };
}

/**
 * Add a pipe (one new circuit) to an existing channel. Returns the
 * channel patch + new SchemePipe to insert.
 *
 * Engineer use case: existing Л-7 channel has D2.1+D2.2; engineer adds
 * D3 via context menu → this builds the new pipe + updated pipeIds.
 */
export function addPipeToChannel(args: {
  channel: SchemeChannel;
  existingPipes: SchemePipe[];
  newCircuit: PipeCircuit;
  defaultDn?: number;
  defaultMaterialKey?: string;
  length_m: number;
}): {
  channelPatch: { id: string; pipeIds: string[] };
  newPipe: SchemePipe;
} {
  const {
    channel,
    existingPipes,
    newCircuit,
    defaultDn = 100,
    defaultMaterialKey = "steel_aged",
    length_m,
  } = args;

  // Build the new pipe
  const newPipe: SchemePipe = {
    id: genId("p"),
    fromNodeId: channel.fromNodeId,
    toNodeId: channel.toNodeId,
    materialKey: defaultMaterialKey,
    dn: defaultDn,
    length_m,
    circuit: newCircuit,
    channelId: channel.id,
    ...(channel.bendPoints ? { bendPoints: channel.bendPoints } : {}),
    ...(channel.anglePolicy ? { anglePolicy: channel.anglePolicy } : {}),
  };

  // Insert into pipeIds in canonical CIRCUIT_DEFAULTS order. The match
  // predicate keeps `p.circuit === c` outside the OR so the new pipe
  // doesn't match every empty slot just because `p.id === newPipe.id`.
  const allCircuitsInOrder = CIRCUIT_DEFAULTS.map((c) => c.circuit);
  const allPipesAfter = [...existingPipes, newPipe];
  const orderedIds = allCircuitsInOrder
    .map((c) =>
      allPipesAfter.find(
        (p) =>
          p.circuit === c &&
          (channel.pipeIds.includes(p.id) || p.id === newPipe.id),
      ),
    )
    .filter((p): p is SchemePipe => p != null)
    .map((p) => p.id);

  // Fallback if filter logic missed something (e.g. existingPipes carries
  // a circuit not present in CIRCUIT_DEFAULTS) — append at the tail.
  const finalPipeIds =
    orderedIds.length === channel.pipeIds.length + 1
      ? orderedIds
      : [...channel.pipeIds, newPipe.id];

  return {
    channelPatch: { id: channel.id, pipeIds: finalPipeIds },
    newPipe,
  };
}

/**
 * Remove a pipe from a channel. Returns the channel patch (updated
 * pipeIds) — caller separately deletes the SchemePipe from the store.
 */
export function removePipeFromChannel(args: {
  channel: SchemeChannel;
  pipeIdToRemove: string;
}): { channelPatch: { id: string; pipeIds: string[] } } {
  const { channel, pipeIdToRemove } = args;
  return {
    channelPatch: {
      id: channel.id,
      pipeIds: channel.pipeIds.filter((id) => id !== pipeIdToRemove),
    },
  };
}

/**
 * Engineer-facing pipe count for the badge rendered next to the
 * channel polyline midpoint ("4п" = 4 pipes inside).
 */
export function channelPipeCountBadge(channel: SchemeChannel): string {
  return `${channel.pipeIds.length}п`;
}

/**
 * Look up the contained pipes of a channel, in canonical CIRCUIT_DEFAULTS
 * order. Useful for cross-section + label panel rendering.
 */
export function containedPipes(
  channel: SchemeChannel,
  allPipes: ReadonlyArray<SchemePipe>,
): SchemePipe[] {
  const byId = new Map(allPipes.map((p) => [p.id, p]));
  const collected: SchemePipe[] = [];
  // Walk channel.pipeIds in stored order (canonical from
  // buildChannelFromDraw / convertPipeToChannel / addPipeToChannel).
  for (const pid of channel.pipeIds) {
    const pipe = byId.get(pid);
    if (pipe) collected.push(pipe);
  }
  return collected;
}
