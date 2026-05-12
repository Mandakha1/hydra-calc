/**
 * Phase 6E — layer system.
 *
 * Five logical "layers" map onto the existing PipeCircuit role enum.
 * Each layer carries visibility + lock + colour, and the editor
 * renders pipes accordingly.
 *
 *   Layer  | Pipe role         | БНбД designation | Default colour
 *   D2.1   | heating_supply    | Магистрал нийлүү | Red    (#A32D2D)
 *   D2.2   | heating_return    | Магистрал эргэх  | Blue   (#185FA5)
 *   D3     | dhw_supply        | Халуун ус нийлүү | Orange (#E6914F)
 *   D4     | dhw_recirc        | Халуун ус эргэх  | Cyan   (#378ADD)
 *   U1     | cold_water        | Хүйтэн ус        | Green  (#5A8C3F)
 *
 * Visibility OFF → pipes of that role hidden from canvas + Excel.
 * Locked      ON → pipes can't be selected / dragged / deleted.
 *
 * The module is pure data + small helpers. SchemeEditor wires the
 * colour into pipe rendering; SettingsPanel exposes the UI toggle.
 */

import type { PipeCircuit } from "../nodeCatalog";

/** Layer ID — short name matching engineering drafting convention
 *  (D2 / D3 / U1 are the standard "discipline + index" labels). */
export type LayerKey = "D2.1" | "D2.2" | "D3" | "D4" | "U1";

export interface LayerConfig {
  /** Hidden when false. */
  visible: boolean;
  /** Read-only when true (no selection / drag / delete). */
  locked: boolean;
  /** Stroke colour for pipes on this layer. */
  color: string;
  /** Human-readable Mongolian label for the LayerPanel. */
  label: string;
}

/** Default configuration — visibility on, lock off, professional
 *  drafting colour palette (matches ResultsPanel.tsx PALETTE so the
 *  user sees consistent colours across all views). */
export const DEFAULT_LAYERS: Record<LayerKey, LayerConfig> = {
  "D2.1": {
    visible: true,
    locked: false,
    color: "#A32D2D",
    label: "Дулаан нийлүүлэх (магистрал)",
  },
  "D2.2": {
    visible: true,
    locked: false,
    color: "#185FA5",
    label: "Дулаан эргэх (магистрал)",
  },
  D3: {
    visible: true,
    locked: false,
    color: "#E6914F",
    label: "Халуун ус нийлүүлэх",
  },
  D4: {
    visible: true,
    locked: false,
    color: "#378ADD",
    label: "Халуун ус эргэх",
  },
  U1: {
    visible: true,
    locked: false,
    color: "#5A8C3F",
    label: "Хүйтэн ус",
  },
};

/** Map a PipeCircuit role to its layer key. */
export function layerKeyFor(circuit: PipeCircuit | undefined): LayerKey {
  switch (circuit) {
    case "heating_supply":
      return "D2.1";
    case "heating_return":
      return "D2.2";
    case "dhw_supply":
      return "D3";
    case "dhw_recirc":
      return "D4";
    case "cold_water":
      return "U1";
    default:
      return "D2.1"; // unknown circuit → treat as supply
  }
}

/** Look up the layer config for a pipe's circuit, merging the user's
 *  per-project overrides with the defaults. */
export function resolveLayer(
  circuit: PipeCircuit | undefined,
  overrides: Partial<Record<LayerKey, Partial<LayerConfig>>> | undefined,
): LayerConfig {
  const key = layerKeyFor(circuit);
  const base = DEFAULT_LAYERS[key];
  const override = overrides?.[key];
  return {
    visible: override?.visible ?? base.visible,
    locked: override?.locked ?? base.locked,
    color: override?.color ?? base.color,
    label: override?.label ?? base.label,
  };
}

/** Return the ordered list of layer keys for UI rendering — keeps
 *  the order stable across re-renders. */
export const LAYER_ORDER: LayerKey[] = ["D2.1", "D2.2", "D3", "D4", "U1"];
