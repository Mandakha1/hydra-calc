/**
 * Phase 12.5 — Standard Mongolian channel type registry.
 *
 * Per ГК-23/02 СЕРИЯ Г-991-1 — pre-fabricated concrete underground
 * channel sections used by Mongolian district heating projects. Three
 * standard sizes cover ~95% of real-world deployments; "custom" is the
 * escape hatch for retrofits / non-standard installs.
 *
 * Dimensions match the GK_DATA.json reference exactly:
 *   Л-4: 600 × 450 mm   (2 pipes — small branch)
 *   Л-7: 1200 × 580 mm  (4-5 pipes — medium branch)
 *   Л-9: 1500 × 610 mm  (5 pipes — main trunk)
 *
 * Circuit codes (Mongolian engineering convention):
 *   D2.1 — heating supply (95 °C)
 *   D2.2 — heating return (70 °C)
 *   D3   — DHW supply (60 °C)
 *   D4   — DHW recirculation (60 °C)
 *   У1   — control / cold water line (ambient)
 */
import type { PipeCircuit } from "../nodeCatalog";

export type ChannelTypeKey = "Л-4" | "Л-7" | "Л-9" | "custom";

export interface ChannelTypeSpec {
  /** Engineer-facing key (matches ГК-23/02 PDF + GK_DATA.json). */
  key: ChannelTypeKey;
  /** Concrete channel inside width in mm. */
  widthMm: number;
  /** Concrete channel inside height in mm. */
  heightMm: number;
  /** Number of pipes the channel can comfortably contain. Engineer
   *  can still add fewer pipes; this is the design max. */
  defaultPipeCount: number;
  /** Engineer-facing label for UI rendering. */
  label: string;
  /** Human-readable arrangement description (matches GK_DATA). */
  pipeArrangement: string;
  /** GK-23/02 use-case description. */
  useCase: string;
  /** ГОСТ / СЕРИЯ reference. */
  series: string;
}

/**
 * Standard channel registry. Custom is intentionally NOT here — the
 * channel UI offers "custom" as a fourth option where engineer types
 * own dimensions; this registry contains only the pre-fabricated
 * standards.
 */
export const CHANNEL_TYPE_REGISTRY: Record<Exclude<ChannelTypeKey, "custom">, ChannelTypeSpec> = {
  "Л-4": {
    key: "Л-4",
    widthMm: 600,
    heightMm: 450,
    defaultPipeCount: 2,
    label: "Л-4 (600×450)",
    pipeArrangement: "Д2.1 + Д2.2 side-by-side",
    useCase: "Small branch (heating only)",
    series: "СЕРИЯ Г-991-1",
  },
  "Л-7": {
    key: "Л-7",
    widthMm: 1200,
    heightMm: 580,
    defaultPipeCount: 4,
    label: "Л-7 (1200×580)",
    pipeArrangement: "Д2.1 + Д2.2 + Д3 + Д4 (+ optional У1) single row",
    useCase: "Medium branch with DHW",
    series: "СЕРИЯ Г-991-1",
  },
  "Л-9": {
    key: "Л-9",
    widthMm: 1500,
    heightMm: 610,
    defaultPipeCount: 5,
    label: "Л-9 (1500×610)",
    pipeArrangement: "Д2.1 + Д2.2 + Д3 + Д4 + У1 single row at bottom",
    useCase: "Main trunk (5-pipe magistral)",
    series: "СЕРИЯ Г-991-1",
  },
};

/** Engineer-facing circuit code + Mongolian label per ГК-23/02
 *  convention. Used by the channel-creation modal + Phase 12.7 label
 *  panels for consistent labelling. */
export interface CircuitDefault {
  circuit: PipeCircuit;
  code: string;       // D2.1 / D2.2 / D3 / D4 / У1
  label: string;      // Дулаан нийлүүлэх
  /** Operating temperature (°C) for the Mongolian 95/70 schedule.
   *  Null when no defined steady-state temp (control line). */
  tempC: number | null;
}

export const CIRCUIT_DEFAULTS: ReadonlyArray<CircuitDefault> = [
  { circuit: "heating_supply", code: "D2.1", label: "Дулаан нийлүүлэх", tempC: 95 },
  { circuit: "heating_return", code: "D2.2", label: "Дулаан буцах", tempC: 70 },
  { circuit: "dhw_supply",     code: "D3",   label: "Халуун ус нийлүүлэх", tempC: 60 },
  { circuit: "dhw_recirc",     code: "D4",   label: "Халуун ус эргэх", tempC: 60 },
  { circuit: "cold_water",     code: "У1",   label: "Удирдлагын / хүйтэн ус", tempC: null },
];

/** Engineer-facing lookup: PipeCircuit → CircuitDefault. Returns null
 *  for unknown circuits (Phase 6 legacy projects may have other values). */
export function circuitDefault(circuit: PipeCircuit | undefined): CircuitDefault | null {
  if (!circuit) return null;
  return CIRCUIT_DEFAULTS.find((c) => c.circuit === circuit) ?? null;
}

/** Engineer-facing label like "Л-9 (1500×610)" or "Сонголтоор" for
 *  custom channels. */
export function channelTypeLabel(
  channelType: ChannelTypeKey | undefined,
  customWidth_mm?: number,
  customHeight_mm?: number,
): string {
  if (!channelType || channelType === "custom") {
    if (customWidth_mm && customHeight_mm) {
      return `Сонголтоор (${customWidth_mm}×${customHeight_mm})`;
    }
    return "Сонголтоор";
  }
  return CHANNEL_TYPE_REGISTRY[channelType].label;
}

/** Resolve the dimensions for a given channel type. Custom returns
 *  the caller-supplied values. */
export function channelDimensions(
  channelType: ChannelTypeKey | undefined,
  customWidth_mm?: number,
  customHeight_mm?: number,
): { widthMm: number; heightMm: number } {
  if (channelType && channelType !== "custom") {
    const spec = CHANNEL_TYPE_REGISTRY[channelType];
    return { widthMm: spec.widthMm, heightMm: spec.heightMm };
  }
  return {
    widthMm: customWidth_mm ?? 0,
    heightMm: customHeight_mm ?? 0,
  };
}
