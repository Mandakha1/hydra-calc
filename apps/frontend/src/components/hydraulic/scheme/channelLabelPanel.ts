/**
 * Phase 12.7 — Per-channel engineering label panel.
 *
 * Renders a small AutoCAD-style callout next to each channel midpoint
 * with the engineer's most-needed at-a-glance facts:
 *
 *   ┌────────────────────────────┐
 *   │ Л-9 1500×610               │
 *   │ Д2.1 Φ150 · Д2.2 Φ150 · Д3 Φ100 · Д4 Φ80 · У1 Φ50 │
 *   │ L=85.0 м · h=1.2 м         │
 *   └────────────────────────────┘
 *
 * Three lines:
 *   1. Channel type + nominal dimensions (suppressed for "custom")
 *   2. Contained pipes in canonical order, code + Φ
 *   3. Total length + burial depth (when set)
 *
 * Pure helpers — no React. The view layer (SchemeEditor channel-render
 * block) consumes these strings + the computed anchor + offset and
 * renders the SVG textbox.
 */
import type { SchemeChannel, SchemeNode, SchemePipe } from "../hydraulicTypes";
import {
  CHANNEL_TYPE_REGISTRY,
  CIRCUIT_DEFAULTS,
  circuitDefault,
  type ChannelTypeKey,
} from "./channelTypes";
import { containedPipes } from "./channelOperations";
import type { PipeCircuit } from "../nodeCatalog";

/** Resolved label content for a single channel. */
export interface ChannelLabelContent {
  channelId: string;
  /** Line 1: e.g. "Л-9 1500×610" or "Сонголтоор 850×500" or "" when
   *  channel type is undefined. */
  typeLine: string;
  /** Line 2: pipes separated by " · ", e.g. "Д2.1 Φ150 · Д2.2 Φ150".
   *  Empty when the channel has no contained pipes. */
  pipesLine: string;
  /** Line 3: e.g. "L=85.0 м · h=1.2 м". Empty when length + depth are
   *  both undefined. */
  metaLine: string;
  /** Channel midpoint in scheme-space pixels (anchor for the leader line). */
  anchorX: number;
  anchorY: number;
  /** Engineer-applied label offset in pixels (relative to anchor).
   *  Falls back to DEFAULT_LABEL_OFFSET when undefined on the channel. */
  offsetDx: number;
  offsetDy: number;
}

/** Default offset (px) for a freshly-drawn channel — 20px perpendicular
 *  to the channel direction. Engineer can drag to reposition (writes
 *  to channel.labelOffset via updateChannel — see SchemeEditor). */
export const DEFAULT_LABEL_OFFSET = { dx: 30, dy: -30 };

/** Compute the channel midpoint in scheme-space pixel coords. Mirrors
 *  the same midpoint calculation as the rendering layer in
 *  SchemeEditor / ChannelDetail so engineer-visible positions stay
 *  aligned. */
export function channelMidpoint(
  channel: SchemeChannel,
  nodes: ReadonlyArray<SchemeNode>,
): { x: number; y: number } | null {
  const a = nodes.find((n) => n.id === channel.fromNodeId);
  const b = nodes.find((n) => n.id === channel.toNodeId);
  if (!a || !b) return null;

  const points: { x: number; y: number }[] = [{ x: a.x, y: a.y }];
  if (channel.bendPoints?.length) {
    for (const bp of channel.bendPoints) points.push({ x: bp.x, y: bp.y });
  }
  points.push({ x: b.x, y: b.y });

  // Midpoint of the central segment (matches SchemeEditor's badge math).
  const midIdx = Math.max(1, Math.floor(points.length / 2));
  return {
    x: (points[midIdx - 1]!.x + points[midIdx]!.x) / 2,
    y: (points[midIdx - 1]!.y + points[midIdx]!.y) / 2,
  };
}

/** Build the engineer-facing type-line string. */
export function buildTypeLine(channel: SchemeChannel): string {
  if (!channel.channelType) return "";
  const w =
    channel.crossSectionWidth_mm ??
    (channel.channelType !== "custom"
      ? CHANNEL_TYPE_REGISTRY[channel.channelType as Exclude<ChannelTypeKey, "custom">]?.widthMm
      : undefined);
  const h =
    channel.crossSectionHeight_mm ??
    (channel.channelType !== "custom"
      ? CHANNEL_TYPE_REGISTRY[channel.channelType as Exclude<ChannelTypeKey, "custom">]?.heightMm
      : undefined);
  if (channel.channelType === "custom") {
    if (w && h) return `Сонголтоор ${w}×${h}`;
    return "Сонголтоор";
  }
  if (w && h) return `${channel.channelType} ${w}×${h}`;
  return channel.channelType;
}

/** Build the engineer-facing pipes-line string. Pipes in canonical
 *  CIRCUIT_DEFAULTS order, each rendered as "Д<code> Φ<DN>". */
export function buildPipesLine(pipes: ReadonlyArray<SchemePipe>): string {
  if (pipes.length === 0) return "";
  // The pipes parameter is already canonically ordered when caller
  // uses `containedPipes(channel, allPipes)`. Defensive sort here
  // ensures correct order even if called with a raw array.
  const circuitOrder = CIRCUIT_DEFAULTS.map((c) => c.circuit);
  const sorted = [...pipes].sort((a, b) => {
    const ai = circuitOrder.indexOf(a.circuit as PipeCircuit);
    const bi = circuitOrder.indexOf(b.circuit as PipeCircuit);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return sorted
    .map((p) => {
      const def = circuitDefault(p.circuit);
      const code = def?.code ?? p.circuit ?? "?";
      // Mongolian engineer convention: "Д2.1" with cyrillic Д when
      // labelling on plan-view. The cross-section uses Latin "D2.1"
      // for international compatibility — both are equivalent.
      const displayCode = code.replace(/^D/, "Д");
      return `${displayCode} Φ${p.dn}`;
    })
    .join(" · ");
}

/** Build the engineer-facing meta-line (length + burial depth). */
export function buildMetaLine(
  pipes: ReadonlyArray<SchemePipe>,
  channel: SchemeChannel,
): string {
  const parts: string[] = [];
  // Use the first pipe's length_m as the canonical channel length
  // — all contained pipes share geometry, so they all have the same
  // length_m (verified by Phase 12.5 tests).
  const len = pipes[0]?.length_m;
  if (typeof len === "number" && len > 0) {
    parts.push(`L=${len.toFixed(1)} м`);
  }
  if (typeof channel.burialDepth_m === "number" && channel.burialDepth_m > 0) {
    parts.push(`h=${channel.burialDepth_m.toFixed(1)} м`);
  }
  return parts.join(" · ");
}

/**
 * Build the full label content for a single channel. Returns null
 * when the channel can't be anchored (endpoint nodes missing —
 * project corruption tolerance).
 */
export function buildChannelLabel(
  channel: SchemeChannel,
  nodes: ReadonlyArray<SchemeNode>,
  allPipes: ReadonlyArray<SchemePipe>,
): ChannelLabelContent | null {
  const mid = channelMidpoint(channel, nodes);
  if (!mid) return null;
  const pipes = containedPipes(channel, allPipes);
  return {
    channelId: channel.id,
    typeLine: buildTypeLine(channel),
    pipesLine: buildPipesLine(pipes),
    metaLine: buildMetaLine(pipes, channel),
    anchorX: mid.x,
    anchorY: mid.y,
    offsetDx: channel.labelOffset?.dx ?? DEFAULT_LABEL_OFFSET.dx,
    offsetDy: channel.labelOffset?.dy ?? DEFAULT_LABEL_OFFSET.dy,
  };
}

/**
 * Whether the label panel should be drawn for the given channel.
 * Per-channel toggle (labelVisible) overrides the project-wide
 * setting. Default visible when both are undefined.
 */
export function isLabelVisible(
  channel: SchemeChannel,
  projectShowsLabels: boolean | undefined,
): boolean {
  if (typeof channel.labelVisible === "boolean") return channel.labelVisible;
  return projectShowsLabels !== false;
}

/** Compute the bounding-box dimensions (px) of the label panel given
 *  its content. Used by the renderer to size the background rectangle
 *  consistently across labels regardless of pipe count.
 *
 *  Heuristic: 7px per character + 12px padding per side per line,
 *  height = 14px per non-empty line + 6px top/bottom padding. */
export function labelDimensions(content: ChannelLabelContent): {
  width: number;
  height: number;
} {
  const lines = [content.typeLine, content.pipesLine, content.metaLine].filter(
    (l) => l.length > 0,
  );
  if (lines.length === 0) return { width: 0, height: 0 };
  const longest = Math.max(...lines.map((l) => l.length));
  const width = Math.min(380, Math.max(80, longest * 6.5 + 16));
  const height = lines.length * 14 + 8;
  return { width, height };
}
