/**
 * Phase 12.6 — Channel cross-section view-model.
 *
 * Pure helpers that turn a SchemeChannel + its contained SchemePipe
 * entities into a layout description: the concrete channel rectangle
 * + each pipe's centre position, radius, label, and temperature
 * colour. Engineer's eye recognises the layout immediately because
 * the bottom-row arrangement matches ГК-23/02 СЕРИЯ Г-991-1:
 *
 *   Л-4 (600×450)  — D2.1 + D2.2
 *   Л-7 (1200×580) — D2.1 + D2.2 + D3 + D4 (+ optional У1)
 *   Л-9 (1500×610) — D2.1 + D2.2 + D3 + D4 + У1
 *
 * No DOM, no React. Caller (ChannelDetail.tsx) renders the SVG.
 *
 * Standard references:
 *   - ГК-23/02 СЕРИЯ Г-991-1 (Mongolian district-heating channel sections)
 *   - БНбД 41-02-13 §6 (insulation + clearance minimums)
 */
import type { SchemeChannel, SchemePipe } from "../hydraulicTypes";
import type { PipeCircuit } from "../nodeCatalog";
import {
  CHANNEL_TYPE_REGISTRY,
  CIRCUIT_DEFAULTS,
  circuitDefault,
  type ChannelTypeKey,
} from "./channelTypes";
import { containedPipes } from "./channelOperations";

/** Per-circuit fill colour for the cross-section. Matches the existing
 *  PIPE_CIRCUITS palette (nodeCatalog) but with the engineer's mental
 *  model: red = supply (95 °C hot), blue = return (70 °C cooler),
 *  orange = DHW (60 °C), green = control / cold. */
export const CIRCUIT_FILLS: Record<PipeCircuit, string> = {
  heating_supply: "#C0392B",   // D2.1 — supply
  heating_return: "#2980B9",   // D2.2 — return
  dhw_supply: "#E67E22",       // D3 — DHW supply
  dhw_recirc: "#D68910",       // D4 — DHW recirc
  cold_water: "#27AE60",       // У1 — cold / control
};

/** One pipe positioned inside the cross-section. Coordinates are in
 *  millimetres relative to the channel's bottom-left corner, with Y
 *  increasing UPWARD (so the engineer's "bottom row" is at low Y).
 *  The view layer converts to SVG pixel coords (Y-down) at render. */
export interface ChannelCrossSectionPipe {
  pipeId: string;
  /** Pipe centre, in millimetres from the channel's bottom-left.
   *  X is along the channel width (left → right), Y is height from floor. */
  centerX_mm: number;
  centerY_mm: number;
  /** Outer pipe radius in mm (DN treated as outside diameter — close
   *  enough for steel up to DN 200 per Mongolian engineering practice). */
  radius_mm: number;
  /** Engineer-facing circuit code (D2.1 / D2.2 / D3 / D4 / У1). */
  code: string;
  /** Engineer-facing Mongolian label ("Дулаан нийлүүлэх" / …). */
  label: string;
  /** Operating temperature in °C, or null for the control / cold line. */
  tempC: number | null;
  /** SVG fill colour per the CIRCUIT_FILLS palette. */
  fill: string;
  /** Pipe DN in mm (for the engineer-facing badge "Φ100"). */
  dn_mm: number;
  /** Material key (for the engineer-facing material chip).
   *  Example values: "steel_aged" / "ppr_fr". */
  materialKey: string;
}

/** Full cross-section view model. */
export interface ChannelCrossSection {
  channelId: string;
  /** Concrete channel inside width in mm. */
  width_mm: number;
  /** Concrete channel inside height in mm. */
  height_mm: number;
  /** Engineer-facing channel-type label ("Л-9 (1500×610)" / "Сонголтоор"). */
  typeLabel: string;
  /** Channel-type series key (or 'custom'). */
  channelType: ChannelTypeKey | undefined;
  /** Number of pipes inside. Mirrors channel.pipeIds.length but
   *  capped at the count actually found in the pipes array
   *  (defensive against project corruption). */
  pipeCount: number;
  /** Pipes positioned inside the channel, in canonical CIRCUIT_DEFAULTS
   *  order. Empty when channel has no contained pipes. */
  pipes: ChannelCrossSectionPipe[];
}

/** Friendly error returned when no channel is available. */
export interface ChannelCrossSectionError {
  error: string;
}

/**
 * Pick the channel to render. Engineer's current pipe selection wins
 * when the selected pipe belongs to a channel; otherwise we fall back
 * to the first channel in the project.
 */
export function pickChannel(
  channels: ReadonlyArray<SchemeChannel>,
  pipes: ReadonlyArray<SchemePipe>,
  selection: { kind: string; id: string } | null,
): SchemeChannel | null {
  if (selection?.kind === "pipe") {
    const pipe = pipes.find((p) => p.id === selection.id);
    if (pipe?.channelId) {
      const ch = channels.find((c) => c.id === pipe.channelId);
      if (ch) return ch;
    }
  }
  return channels[0] ?? null;
}

/**
 * Compute pipe centre positions inside the channel. The Mongolian
 * convention per ГК-23/02 is a single bottom row: pipes sit on
 * concrete sleepers ~50 mm above the floor with equal horizontal
 * spacing. Y position is the same for every pipe.
 *
 * The X spacing splits the channel width into (n + 1) equal gutters
 * with pipes centred between them, so a 4-pipe Л-7 (1200 mm) gets
 * pipes at X = 240 / 480 / 720 / 960 mm (each 240 mm from neighbour).
 * This matches the drafting standard's "even spacing" rule without
 * the engineer having to specify each X-offset by hand.
 *
 * The radius is derived from DN treated as outside diameter. DN is
 * the calibrated SteelPipeOD for DN ≤ 200 (Mongolian-practice
 * approximation; real ODs differ by ~5-10 mm which is invisible at
 * cross-section scale).
 *
 * Bottom-row Y position is `BOTTOM_CLEARANCE_MM` above the channel
 * floor. This leaves room for the concrete sleeper drawing layer
 * (Phase 12.7 may add it explicitly).
 */
export const BOTTOM_CLEARANCE_MM = 80;

export function layoutPipes(
  width_mm: number,
  _height_mm: number,
  pipes: SchemePipe[],
): ChannelCrossSectionPipe[] {
  if (pipes.length === 0 || width_mm <= 0) return [];

  // Order pipes canonically: D2.1 / D2.2 / D3 / D4 / У1
  const circuitOrder = CIRCUIT_DEFAULTS.map((c) => c.circuit);
  const ordered = [...pipes].sort((a, b) => {
    const ai = circuitOrder.indexOf(a.circuit as PipeCircuit);
    const bi = circuitOrder.indexOf(b.circuit as PipeCircuit);
    // Pipes without a recognised circuit go to the end (preserves
    // backward compat with Phase 6 legacy projects).
    const aOrder = ai === -1 ? 999 : ai;
    const bOrder = bi === -1 ? 999 : bi;
    return aOrder - bOrder;
  });

  const n = ordered.length;
  // Even gutters: divide width into (n + 1) gaps with pipes centred
  // between them.
  const gutter_mm = width_mm / (n + 1);

  return ordered.map((p, i) => {
    const def = circuitDefault(p.circuit);
    return {
      pipeId: p.id,
      centerX_mm: gutter_mm * (i + 1),
      centerY_mm: BOTTOM_CLEARANCE_MM,
      // DN-as-OD approximation; halve for radius.
      radius_mm: p.dn / 2,
      code: def?.code ?? "?",
      label: def?.label ?? p.circuit ?? "Тодорхойгүй",
      tempC: def?.tempC ?? null,
      fill: p.circuit != null && p.circuit in CIRCUIT_FILLS
        ? CIRCUIT_FILLS[p.circuit as PipeCircuit]
        : "#7F8C8D",
      dn_mm: p.dn,
      materialKey: p.materialKey,
    };
  });
}

/**
 * Build the full cross-section view-model for engineer rendering. The
 * caller picks the channel; this assembles the layout + labels.
 */
export function buildChannelCrossSection(
  channel: SchemeChannel,
  allPipes: ReadonlyArray<SchemePipe>,
): ChannelCrossSection {
  const pipes = containedPipes(channel, allPipes);
  // Resolve dimensions: prefer stored crossSection* fields, fall back
  // to the registry, else 0×0 (engineer sees empty rectangle prompting
  // them to set dimensions).
  let width_mm = channel.crossSectionWidth_mm ?? 0;
  let height_mm = channel.crossSectionHeight_mm ?? 0;
  if ((!width_mm || !height_mm) && channel.channelType && channel.channelType !== "custom") {
    const spec = CHANNEL_TYPE_REGISTRY[channel.channelType];
    if (spec) {
      width_mm = width_mm || spec.widthMm;
      height_mm = height_mm || spec.heightMm;
    }
  }

  const typeLabel = channel.channelType
    ? channel.channelType === "custom"
      ? `Сонголтоор (${width_mm}×${height_mm})`
      : `${channel.channelType} (${width_mm}×${height_mm})`
    : "Тодорхойгүй";

  return {
    channelId: channel.id,
    width_mm,
    height_mm,
    typeLabel,
    channelType: channel.channelType,
    pipeCount: pipes.length,
    pipes: layoutPipes(width_mm, height_mm, pipes),
  };
}

/**
 * Top-level helper used by the React panel. Picks the right channel
 * (selection-driven) and builds the cross-section, or returns an
 * error explaining how the engineer can summon a channel onto the
 * scene.
 */
export function buildChannelDetail(
  channels: ReadonlyArray<SchemeChannel> | undefined,
  pipes: ReadonlyArray<SchemePipe>,
  selection: { kind: string; id: string } | null,
): ChannelCrossSection | ChannelCrossSectionError {
  if (!channels || channels.length === 0) {
    return {
      error:
        "Сүлжээнд суваг (Л-4 / Л-7 / Л-9) байхгүй байна. Хоолой нэмэх товч дээр дарж эсвэл схем дээр Суваг товчоор зураад энэ табыг ашиглана уу.",
    };
  }
  const channel = pickChannel(channels, pipes, selection);
  if (!channel) {
    return {
      error: "Сонгосон суваг олдсонгүй.",
    };
  }
  return buildChannelCrossSection(channel, pipes);
}

/** Convert a millimetre quantity to a viewport SVG pixel offset using
 *  the supplied `scale` (pixels per mm). Helper kept here so the
 *  React renderer + the PDF page can use the same math. */
export function mmToPx(value_mm: number, pxPerMm: number): number {
  return value_mm * pxPerMm;
}

/** Engineer-facing temperature badge text. Returns null for circuits
 *  without a defined steady-state temperature (e.g. У1 control). */
export function tempBadge(tempC: number | null): string | null {
  if (tempC == null) return null;
  return `${tempC} °C`;
}
