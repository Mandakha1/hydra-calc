/**
 * Phase 8.3 — Well / chamber detail (pure helpers).
 *
 * Aggregates the data needed to render a Mongolian district-heating
 * ҮХТ ("Үндсэн худаг" / chamber) cross-section sheet:
 *
 *   - Pick the engineer-selected well (selection.kind === "node" AND
 *     the node is a chamber/well kind), or fall back to the first
 *     well in the scene.
 *   - Pull chamber dimensions with sensible defaults (3×2×2.5 m,
 *     700 mm cover) — the Phase 8 architectural decision was to
 *     extend the node interface, but legacy nodes that don't carry
 *     the fields still render a typical chamber so the engineer
 *     has a starting point.
 *   - Collect every pipe that touches the well + the side (LEFT /
 *     RIGHT / TOP / BOTTOM) at which it should be drawn, derived
 *     from the pipe's neighbour-node position relative to the well.
 *
 * Pure functions only — no DOM, no React.
 *
 * Standard references:
 *   - ГОСТ 21.605             (well chamber drawing sheet)
 *   - БНбД 41-01-2019 §6.2    (chamber siting + minimum cover)
 */
import { getNodeKind } from "../nodeCatalog";
import type {
  SchemeNode,
  SchemePipe,
} from "../hydraulicTypes";

/** Default chamber dimensions (Mongolian residential typical). */
export const DEFAULT_WELL_DIMS = {
  length_m: 3,
  width_m: 2,
  depth_m: 2.5,
  coverDiameter_mm: 700,
};

/** Whether a node kind belongs to the "well / chamber" family. */
export function isWellLikeKind(kind: string): boolean {
  const def = getNodeKind(kind);
  return def?.category === "chamber";
}

/** Which side of the chamber a pipe enters from, based on the
 *  position of the OTHER endpoint relative to the well node. */
export type PenetrationSide = "left" | "right" | "top" | "bottom";

/** Single pipe penetration. */
export interface WellPenetration {
  pipeId: string;
  /** DN diameter in mm (drives the stub thickness). */
  dn_mm: number;
  /** Circuit key (heating_supply / heating_return / dhw / …). */
  circuit?: string;
  /** Side of the chamber the pipe enters from. */
  side: PenetrationSide;
  /** Neighbour node's label (helps the engineer identify which
   *  end of the network the pipe leads to). */
  neighbourLabel: string;
}

/** View model for the chamber cross-section. */
export interface WellDetail {
  /** Node id of the selected well. */
  nodeId: string;
  /** Engineer-typed label (e.g. "ХУ-12"). */
  label: string;
  /** Resolved kind (chamber / well_supply / well_drain /
   *  expansion_tank). */
  kind: string;
  /** Chamber inside length (m). */
  length_m: number;
  /** Chamber inside width (m). */
  width_m: number;
  /** Chamber inside depth (m). */
  depth_m: number;
  /** Cover diameter (mm). */
  coverDiameter_mm: number;
  /** Whether ANY of the dimensions came from the stored node fields
   *  vs DEFAULT_WELL_DIMS fallback. The view layer uses this to
   *  surface an advisory when the engineer is looking at default
   *  values rather than measured ones. */
  hasExplicitDimensions: boolean;
  /** Pipe penetrations sorted by side then DN descending. */
  penetrations: WellPenetration[];
}

/** Friendly error. */
export interface WellDetailError {
  error: string;
}

/**
 * Pick the right well node for the detail view:
 *   1. Engineer's current single-selection if it's a well kind.
 *   2. Otherwise the first chamber-category node in the scene.
 *   3. Otherwise null.
 */
export function pickWell(
  nodes: SchemeNode[],
  selection: { kind: string; id: string } | null,
): SchemeNode | null {
  if (selection && selection.kind === "node") {
    const sel = nodes.find((n) => n.id === selection.id);
    if (sel && isWellLikeKind(sel.kind)) return sel;
  }
  return nodes.find((n) => isWellLikeKind(n.kind)) ?? null;
}

/**
 * Compute the side a pipe enters from based on the angle of the
 * vector from the well's pixel position to the neighbour's pixel
 * position. Vertical-axis convention matches SchemeEditor: y
 * increases DOWNWARD.
 */
export function penetrationSideOf(
  well: SchemeNode,
  neighbour: SchemeNode,
): PenetrationSide {
  const dx = neighbour.x - well.x;
  const dy = neighbour.y - well.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy >= 0 ? "bottom" : "top";
}

/** Sort penetrations: side-clockwise (top → right → bottom → left)
 *  then DN descending so trunk pipes draw first. */
const SIDE_ORDER: Record<PenetrationSide, number> = {
  top: 0,
  right: 1,
  bottom: 2,
  left: 3,
};
function comparePenetrations(a: WellPenetration, b: WellPenetration): number {
  if (SIDE_ORDER[a.side] !== SIDE_ORDER[b.side]) {
    return SIDE_ORDER[a.side] - SIDE_ORDER[b.side];
  }
  return b.dn_mm - a.dn_mm;
}

/**
 * Build the cross-section view model. Returns error when no well-
 * kind node exists in the scene.
 */
export function buildWellDetail(
  nodes: SchemeNode[],
  pipes: SchemePipe[],
  selection: { kind: string; id: string } | null,
): WellDetail | WellDetailError {
  const well = pickWell(nodes, selection);
  if (!well) {
    return {
      error: "Сүлжээнд камер / худаг (well_supply / well_drain / chamber / expansion_tank) байхгүй байна. Худагны зангилаа нэмж, түүнийг сонгоод энэ табыг ашиглана уу.",
    };
  }

  const length_m =
    typeof well.chamber_length_m === "number" && well.chamber_length_m > 0
      ? well.chamber_length_m
      : DEFAULT_WELL_DIMS.length_m;
  const width_m =
    typeof well.chamber_width_m === "number" && well.chamber_width_m > 0
      ? well.chamber_width_m
      : DEFAULT_WELL_DIMS.width_m;
  const depth_m =
    typeof well.chamber_depth_m === "number" && well.chamber_depth_m > 0
      ? well.chamber_depth_m
      : DEFAULT_WELL_DIMS.depth_m;
  const coverDiameter_mm =
    typeof well.coverDiameter_mm === "number" && well.coverDiameter_mm > 0
      ? well.coverDiameter_mm
      : DEFAULT_WELL_DIMS.coverDiameter_mm;

  const hasExplicitDimensions =
    typeof well.chamber_length_m === "number"
    || typeof well.chamber_width_m === "number"
    || typeof well.chamber_depth_m === "number"
    || typeof well.coverDiameter_mm === "number";

  // Collect penetrations: every pipe with one endpoint = well.id.
  const penetrations: WellPenetration[] = [];
  for (const p of pipes) {
    const otherId =
      p.fromNodeId === well.id
        ? p.toNodeId
        : p.toNodeId === well.id
          ? p.fromNodeId
          : null;
    if (!otherId) continue;
    const other = nodes.find((n) => n.id === otherId);
    if (!other) continue;
    penetrations.push({
      pipeId: p.id,
      dn_mm: p.dn,
      ...(p.circuit ? { circuit: p.circuit } : {}),
      side: penetrationSideOf(well, other),
      neighbourLabel: other.label,
    });
  }
  penetrations.sort(comparePenetrations);

  return {
    nodeId: well.id,
    label: well.label,
    kind: well.kind,
    length_m,
    width_m,
    depth_m,
    coverDiameter_mm,
    hasExplicitDimensions,
    penetrations,
  };
}

/** Engineer-facing label for a penetration side. */
export function sideLabel(side: PenetrationSide): string {
  switch (side) {
    case "top":
      return "Дээд";
    case "right":
      return "Баруун";
    case "bottom":
      return "Доод";
    case "left":
      return "Зүүн";
  }
}
