/**
 * Phase 8.4 — Compensator detail (pure helpers).
 *
 * Picks the engineer-selected compensator (Ω-bend / sильfон) and
 * resolves its geometry fields with sensible defaults for the
 * detail-sheet view.
 *
 * Standards:
 *   - ГОСТ 21.605          (compensator detail drawing sheet)
 *   - СП 124.13330 §11.3   (thermal expansion / compensator siting)
 *   - БНбД 41-01-2019 §8   (pipe support spacing — referenced for
 *                           the engineer's anchor placement context).
 */
import { getNodeKind } from "../nodeCatalog";
import type { SchemeNode } from "../hydraulicTypes";

export const DEFAULT_COMPENSATOR_DIMS = {
  bendRadius_mm: 500,
  armHeight_m: 1.2,
  span_m: 2.0,
};

export type CompensatorVariant = "u" | "bellow" | "axial" | "other";

/** Map a node kind to a compensator variant. The general `other`
 *  bucket catches future compensator_* kinds we haven't enumerated. */
export function compensatorVariantOf(kind: string): CompensatorVariant | null {
  if (kind === "compensator_u") return "u";
  if (kind === "compensator_bellow") return "bellow";
  if (kind === "compensator_axial") return "axial";
  if (/^compensator/i.test(kind)) return "other";
  return null;
}

export function isCompensatorKind(kind: string): boolean {
  return compensatorVariantOf(kind) !== null;
}

/** View model. */
export interface CompensatorDetail {
  nodeId: string;
  label: string;
  kind: string;
  variant: CompensatorVariant;
  bendRadius_mm: number;
  armHeight_m: number;
  span_m: number;
  /** Whether ANY geometry field came from the stored node. */
  hasExplicitDimensions: boolean;
  /** Engineer-relevant expansion math:
   *  Thermal expansion ΔL = α · L · ΔT, where:
   *    α (steel) = 1.2e-5 1/°C,
   *    L = pipe distance between anchors (m) — assumed equal to span,
   *    ΔT = 95 - 20 = 75 °C (residential heating supply, БНбД 41-01 §5).
   *  This is a back-of-envelope number to help the engineer
   *  cross-check that the compensator's geometry can absorb it. */
  estimatedExpansion_mm: number;
}

export interface CompensatorDetailError {
  error: string;
}

/** Pick the right compensator node — selection first, fallback first. */
export function pickCompensator(
  nodes: SchemeNode[],
  selection: { kind: string; id: string } | null,
): SchemeNode | null {
  if (selection && selection.kind === "node") {
    const sel = nodes.find((n) => n.id === selection.id);
    if (sel && isCompensatorKind(sel.kind)) return sel;
  }
  return nodes.find((n) => isCompensatorKind(n.kind)) ?? null;
}

/** Build the view model. */
export function buildCompensatorDetail(
  nodes: SchemeNode[],
  selection: { kind: string; id: string } | null,
): CompensatorDetail | CompensatorDetailError {
  const comp = pickCompensator(nodes, selection);
  if (!comp) {
    return {
      error:
        "Сүлжээнд компенсатор (compensator_u / compensator_bellow) олдсонгүй. Компенсатор зангилаа нэмж энэ табыг ашиглана уу.",
    };
  }
  const variant = compensatorVariantOf(comp.kind) ?? "other";
  const bendRadius_mm =
    typeof comp.bendRadius_mm === "number" && comp.bendRadius_mm > 0
      ? comp.bendRadius_mm
      : DEFAULT_COMPENSATOR_DIMS.bendRadius_mm;
  const armHeight_m =
    typeof comp.armHeight_m === "number" && comp.armHeight_m > 0
      ? comp.armHeight_m
      : DEFAULT_COMPENSATOR_DIMS.armHeight_m;
  const span_m =
    typeof comp.span_m === "number" && comp.span_m > 0
      ? comp.span_m
      : DEFAULT_COMPENSATOR_DIMS.span_m;
  const hasExplicitDimensions =
    typeof comp.bendRadius_mm === "number"
    || typeof comp.armHeight_m === "number"
    || typeof comp.span_m === "number";

  // ΔL = α · L · ΔT  →  L in metres → expansion in metres → ×1000 mm.
  const alpha = 1.2e-5;
  const deltaT = 75;
  const estimatedExpansion_mm = alpha * span_m * deltaT * 1000;

  return {
    nodeId: comp.id,
    label: comp.label,
    kind: comp.kind,
    variant,
    bendRadius_mm,
    armHeight_m,
    span_m,
    hasExplicitDimensions,
    estimatedExpansion_mm,
  };
}

/** Engineer-facing variant label. */
export function variantLabel(v: CompensatorVariant): string {
  switch (v) {
    case "u":
      return "Ω / П-маягийн (loop)";
    case "bellow":
      return "Сильфон (bellow)";
    case "axial":
      return "Тэнхлэгийн (axial)";
    case "other":
      return "Бусад";
  }
}
