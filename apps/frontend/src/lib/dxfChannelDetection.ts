/**
 * Phase 12.9 — DXF channel auto-detection.
 *
 * After the multi-signal voter (Phase 7.3) has classified each line
 * into a PipeCircuit, this pass looks for ГК-23/02 СЕРИЯ Г-991-1
 * channel-type annotations in the DXF's TEXT/MTEXT entities and
 * groups nearby pipes into SchemeChannel entities.
 *
 * Patterns recognised (case-insensitive, ASCII or Cyrillic):
 *   - "Л-9", "Л-7", "Л-4"               (channel type only)
 *   - "Л-9 1500", "Л-7 1200"            (type + width)
 *   - "Л-9 1500×610", "Л-7 1200x580"    (type + W×H)
 *   - "L-9 / L9 / L_9"                  (Latin transliteration)
 *
 * Grouping logic:
 *   1. For every text-annotation match, find pipes whose CENTRE point
 *      sits within `RANGE_M` metres of the annotation.
 *   2. If 2+ pipes match the same annotation, instantiate a
 *      SchemeChannel + write `channelId` back-references on each pipe.
 *   3. A pipe matched by multiple annotations keeps the nearest one
 *      (deterministic — closest by Euclidean distance in metres).
 *
 * Pure module — no DOM, no React, no store. Tested via plain unit
 * tests with synthetic ExtractedDxf-style input.
 */
import type { SchemeChannel, SchemePipe, SchemeNode } from "../components/hydraulic/hydraulicTypes";
import {
  CHANNEL_TYPE_REGISTRY,
  type ChannelTypeKey,
} from "../components/hydraulic/scheme/channelTypes";

/** Radius (m) around a channel-type annotation in which pipes are
 *  candidates for the channel. Tuned wide enough to catch the
 *  ГК-23/02 paperwork convention of placing the label 5-8 m off
 *  the channel midpoint, narrow enough not to scoop in adjacent
 *  branches. */
export const CHANNEL_ANNOTATION_RANGE_M = 8;

/** Recognised channel-type token → registry key. The detector is
 *  forgiving on whitespace, dash style, and Cyrillic/Latin glyphs.
 *  Note: JS `\b` only triggers on ASCII word characters, so we anchor
 *  on (start-of-string | non-word) before [ЛLl] instead of `\b`. The
 *  trailing `\b` works because the captured digit is ASCII. */
const TYPE_PATTERN = /(?:^|[^A-Za-zА-я])([ЛLl])[\s_-]?([4-9])\b/u;

interface AnnotationMatch {
  channelType: ChannelTypeKey;
  /** Text-anchor in real-world metres (matches DXF native units). */
  x: number;
  y: number;
  /** Explicit width × height parsed from the annotation, or undefined
   *  to fall back to CHANNEL_TYPE_REGISTRY defaults. */
  width_mm?: number;
  height_mm?: number;
}

/**
 * Extract every channel-annotation match from the DXF text pool.
 * Exported for unit-testing the regex layer in isolation.
 */
export function findChannelAnnotations(
  texts: ReadonlyArray<{ x: number; y: number; t: string }>,
): AnnotationMatch[] {
  const out: AnnotationMatch[] = [];
  for (const text of texts) {
    const raw = text.t;
    const m = TYPE_PATTERN.exec(raw);
    if (!m) continue;
    // m[1] = letter ([ЛLl]), m[2] = digit ([4-9])
    const digit = m[2];
    const typeKey: ChannelTypeKey | null =
      digit === "4" ? "Л-4" : digit === "7" ? "Л-7" : digit === "9" ? "Л-9" : null;
    if (!typeKey) continue;

    // Optional dimensions: "1500×610" / "1200x580" / "600 x 450".
    const dim = /(\d{3,4})\s*[×xX]\s*(\d{3,4})/.exec(raw);
    if (dim) {
      const w = parseInt(dim[1]!, 10);
      const h = parseInt(dim[2]!, 10);
      out.push({ channelType: typeKey, x: text.x, y: text.y, width_mm: w, height_mm: h });
      continue;
    }
    // Width-only fallback ("Л-9 1500").
    const single = /\b(\d{3,4})\b/.exec(raw.slice(m.index + m[0].length));
    if (single) {
      const w = parseInt(single[1]!, 10);
      out.push({ channelType: typeKey, x: text.x, y: text.y, width_mm: w });
      continue;
    }
    out.push({ channelType: typeKey, x: text.x, y: text.y });
  }
  return out;
}

/** Compute pipe midpoint in REAL-WORLD metres (DXF native units),
 *  using the matching from/to nodes' real-world coords. The DXF
 *  importer keeps the original (x_m, y_m) on proto-nodes; once the
 *  scheme converts to canvas pixels the relationship is lost, so the
 *  detector consumes the un-transformed pipe + node coordinates. */
interface PipeWithRealCoords {
  pipeId: string;
  ax_m: number;
  ay_m: number;
  bx_m: number;
  by_m: number;
}

function pipeCentre(p: PipeWithRealCoords): { x: number; y: number } {
  return { x: (p.ax_m + p.bx_m) / 2, y: (p.ay_m + p.by_m) / 2 };
}

/** UUID-ish id matching the rest of the codebase. */
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ChannelDetectionResult {
  channels: SchemeChannel[];
  /** Patches to apply: { pipeId → channelId }. The caller iterates
   *  this map and mutates each SchemePipe.channelId so the result
   *  composes cleanly with the importer's existing pipe assembly. */
  pipePatches: Map<string, string>;
  /** Engineer-facing warnings (e.g. "5 pipes found but channel type
   *  not annotated"). The DXF import warnings array absorbs these. */
  warnings: string[];
}

/**
 * Match annotations to pipes and emit SchemeChannel entities.
 *
 * Multi-annotation contention is resolved by NEAREST anchor — a pipe
 * sitting between two channel labels joins the one whose centre is
 * closest. This gives the engineer a deterministic result that's
 * easy to override via the Phase 7.4 review pane.
 */
export function detectChannelsFromDxf(args: {
  texts: ReadonlyArray<{ x: number; y: number; t: string }>;
  pipes: ReadonlyArray<PipeWithRealCoords>;
  /** Override the default 8 m search radius. */
  range_m?: number;
}): ChannelDetectionResult {
  const range = args.range_m ?? CHANNEL_ANNOTATION_RANGE_M;
  const annotations = findChannelAnnotations(args.texts);
  const warnings: string[] = [];

  if (annotations.length === 0) {
    return { channels: [], pipePatches: new Map(), warnings };
  }

  // For each pipe, find the CLOSEST matching annotation within range.
  const bestByPipe = new Map<
    string,
    { annotation: AnnotationMatch; dist: number }
  >();
  for (const pipe of args.pipes) {
    const c = pipeCentre(pipe);
    let best: { annotation: AnnotationMatch; dist: number } | null = null;
    for (const ann of annotations) {
      const d = Math.hypot(c.x - ann.x, c.y - ann.y);
      if (d > range) continue;
      if (!best || d < best.dist) best = { annotation: ann, dist: d };
    }
    if (best) bestByPipe.set(pipe.pipeId, best);
  }

  // Group pipes by their winning annotation. Annotations referenced by
  // <2 pipes don't constitute a channel (engineer probably meant a
  // standalone callout / legend entry).
  const pipesByAnnotation = new Map<AnnotationMatch, string[]>();
  for (const [pipeId, best] of bestByPipe.entries()) {
    let bucket = pipesByAnnotation.get(best.annotation);
    if (!bucket) {
      bucket = [];
      pipesByAnnotation.set(best.annotation, bucket);
    }
    bucket.push(pipeId);
  }

  const channels: SchemeChannel[] = [];
  const pipePatches = new Map<string, string>();
  // Find a representative pipe per group → use its endpoints as the
  // channel's fromNodeId/toNodeId (mirrors the engineer's drawing
  // gesture). When the group has mixed endpoints, we pick the trunk
  // pipe (lowest pipeId — DXF order is roughly topological).
  for (const [ann, pipeIds] of pipesByAnnotation.entries()) {
    if (pipeIds.length < 2) {
      warnings.push(
        `Channel annotation "${ann.channelType}" нь зөвхөн ${pipeIds.length} хоолой барисан — sgroup-аас алгасав.`,
      );
      continue;
    }
    // Channel dimensions: explicit annotation wins, else registry.
    const spec = CHANNEL_TYPE_REGISTRY[ann.channelType as Exclude<ChannelTypeKey, "custom">];
    const width_mm = ann.width_mm ?? spec.widthMm;
    const height_mm = ann.height_mm ?? spec.heightMm;

    const channelId = genId("ch");
    const trunkPipeId = [...pipeIds].sort()[0]!;
    const trunkPipe = args.pipes.find((p) => p.pipeId === trunkPipeId)!;
    // Anchor channel to trunk pipe's endpoints — close enough for the
    // engineer's review-pane sanity check; they can drag bend points
    // afterwards. The channel render uses these to position the
    // polyline.
    const channel: SchemeChannel = {
      id: channelId,
      type: "channel",
      // Endpoints are NODE IDs in the imported state. We can't resolve
      // them here without nodes — caller resolves via pipe.fromNodeId
      // /toNodeId before assembling the channel. We expose a
      // resolveChannelEndpoints helper for that.
      fromNodeId: trunkPipe.pipeId, // placeholder, caller patches
      toNodeId: trunkPipe.pipeId,   // placeholder, caller patches
      channelType: ann.channelType,
      crossSectionWidth_mm: width_mm,
      crossSectionHeight_mm: height_mm,
      pipeIds: [...pipeIds],
    };
    channels.push(channel);
    for (const pid of pipeIds) {
      pipePatches.set(pid, channelId);
    }
  }
  return { channels, pipePatches, warnings };
}

/**
 * Resolve the channel's fromNodeId/toNodeId from the contained pipes.
 *
 * Two cases:
 *   - If all contained pipes share the same fromNodeId or toNodeId,
 *     that's the channel endpoint.
 *   - Otherwise, find the two endpoints with degree-1 in the channel's
 *     pipe sub-graph (i.e. nodes that appear in only one pipe).
 *
 * The caller maps each channel to the proper endpoints once the
 * pipe records exist with concrete fromNodeId/toNodeId.
 */
export function resolveChannelEndpoints(
  channelPipeIds: string[],
  pipes: ReadonlyArray<SchemePipe>,
): { fromNodeId: string; toNodeId: string } | null {
  const contained = pipes.filter((p) => channelPipeIds.includes(p.id));
  if (contained.length === 0) return null;
  // Degree count across the sub-graph
  const degree = new Map<string, number>();
  for (const p of contained) {
    degree.set(p.fromNodeId, (degree.get(p.fromNodeId) ?? 0) + 1);
    degree.set(p.toNodeId, (degree.get(p.toNodeId) ?? 0) + 1);
  }
  const endpoints = [...degree.entries()].filter(([, d]) => d === 1).map(([n]) => n);
  if (endpoints.length >= 2) {
    return { fromNodeId: endpoints[0]!, toNodeId: endpoints[1]! };
  }
  // Fallback: pick first pipe's endpoints.
  const first = contained[0]!;
  return { fromNodeId: first.fromNodeId, toNodeId: first.toNodeId };
}

/**
 * Top-level helper called by the DXF importer after pipe assembly.
 * Returns the SchemeChannel array (endpoints resolved) + a side-effect
 * mutation map for pipe.channelId back-references.
 */
export function buildChannelsFromDxfImport(args: {
  texts: ReadonlyArray<{ x: number; y: number; t: string }>;
  pipes: ReadonlyArray<SchemePipe>;
  nodes: ReadonlyArray<SchemeNode>;
  /** Override the default 8 m search radius. */
  range_m?: number;
  /** Conversion factor pipe coords use — the importer converts to
   *  canvas pixels via PX_PER_METER; the detector wants real metres.
   *  Pass the same factor used by the importer (default 1). */
  pxPerMeter?: number;
}): { channels: SchemeChannel[]; pipePatches: Map<string, string>; warnings: string[] } {
  const pxPerMeter = args.pxPerMeter ?? 1;
  // Build pipe centre coordinates in METRES (texts are in metres;
  // pipes' fromNode/toNode coords are in canvas pixels post-import).
  const nodeById = new Map(args.nodes.map((n) => [n.id, n] as const));
  const pipeCoords: PipeWithRealCoords[] = [];
  for (const p of args.pipes) {
    const a = nodeById.get(p.fromNodeId);
    const b = nodeById.get(p.toNodeId);
    if (!a || !b) continue;
    pipeCoords.push({
      pipeId: p.id,
      ax_m: a.x / pxPerMeter,
      ay_m: a.y / pxPerMeter,
      bx_m: b.x / pxPerMeter,
      by_m: b.y / pxPerMeter,
    });
  }

  const detection = detectChannelsFromDxf({
    texts: args.texts,
    pipes: pipeCoords,
    range_m: args.range_m,
  });

  // Resolve endpoint NODE IDs for each detected channel.
  const channels: SchemeChannel[] = [];
  for (const ch of detection.channels) {
    const endpoints = resolveChannelEndpoints(ch.pipeIds, args.pipes);
    if (!endpoints) continue;
    channels.push({
      ...ch,
      fromNodeId: endpoints.fromNodeId,
      toNodeId: endpoints.toNodeId,
    });
  }
  return {
    channels,
    pipePatches: detection.pipePatches,
    warnings: detection.warnings,
  };
}
