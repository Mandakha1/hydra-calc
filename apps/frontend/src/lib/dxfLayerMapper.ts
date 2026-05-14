/**
 * Phase 7.3 — DXF CAD-layer → pipe circuit mapper.
 *
 * Multi-signal voting for pipe-role classification when importing a
 * DXF file. The legacy importer hard-coded every imported pipe as
 * `heating_supply`, which means engineers had to manually re-tag
 * every return line on every project. This module replaces that
 * blanket default with a 3-tier resolver:
 *
 *   Tier 1: layer name regex (highest weight; Cyrillic + Latin)
 *   Tier 2: AutoCAD color 62 (1=red supply, 5=blue return, 6=DHW, 4=cold)
 *   Tier 3: line style (continuous=supply, dashed=return)
 *   None  : `unknown` (caller pushes warning + falls back to supply)
 *
 * Pure functions only — no DOM, no React, no DXF parser dependency.
 * Unit-testable with synthetic LayerHint fixtures.
 *
 * Standards / conventions cited:
 *   - AutoCAD ACI (AutoCAD Color Index 1-255). The 5-colour subset
 *     (1 red, 5 blue, 6 magenta, 4 cyan) is the convention used by
 *     Mongolian / Russian district heating drafting offices (ГК-23/02,
 *     Ган-Кад, Зулу-Гидро exports).
 *   - Layer names follow Mongolian convention: "Нийлүүлэх"
 *     (supply), "Эргэх" / "Буцах" (return), "Халуун ус" (DHW),
 *     "Хүйтэн ус" (cold water).
 *   - Russian cognates: "Подача" (supply), "Обр" (return), supported
 *     verbatim because most Mongolian engineers reuse Soviet-era
 *     layer-name templates.
 *
 * Conflict detection: when two signals disagree (e.g. layer name
 * says "supply" but color index 5 says blue/return), the resolver
 * returns the higher-tier match BUT also flags the conflict via
 * `detectCircuitConflict()` so the import pipeline can push a
 * warning that the engineer can review in the Phase 7.4 pane.
 */

/* ─── Type contract ─────────────────────────────────────────────── */

/**
 * Pipe circuit — narrowed to the 6 values the import pipeline can
 * confidently identify. The 5 SchemePipe-compatible values
 * (heating_supply / heating_return / dhw_supply / dhw_recirc /
 * cold_water) align with the `PipeCircuit` union in `nodeCatalog.ts`;
 * `"unknown"` is a transient mapper state that the import pipeline
 * resolves to a fallback (heating_supply) + a warning before writing
 * to `SchemePipe.circuit`.
 *
 * Note: we use `dhw_recirc` (not `dhw_recirc`) to match the existing
 * codebase convention — Mongolian engineers call the DHW return line
 * "ХУ-ийн эргэлт" (DHW recirculation), not "буцах" (return).
 */
export type PipeCircuit =
  | "heating_supply"
  | "heating_return"
  | "dhw_supply"
  | "dhw_recirc"
  | "cold_water"
  | "unknown";

/** SchemePipe-compatible subset (no `"unknown"`). */
export type PipeCircuitFinal = Exclude<PipeCircuit, "unknown">;

/**
 * Per-pipe layer / styling metadata gathered from the DXF entity.
 * Caller (dxfImport.ts) populates these from the dxf-parser entity
 * fields. Every field except `name` is optional — the mapper
 * gracefully falls through to lower-tier signals or returns
 * `"unknown"` if nothing matches.
 */
export interface LayerHint {
  /** AutoCAD layer name as it appears in the DXF (LAYER table entry,
   *  may be Cyrillic, Latin, or mixed-case). */
  name: string;
  /**
   * AutoCAD Color Index (ACI, 1-255). dxf-parser exposes this as
   * `entity.color` on LINE / LWPOLYLINE entities when explicitly
   * set, OR `undefined` when the entity inherits BYLAYER. We accept
   * `undefined` to mean "no explicit color override".
   */
  colorIndex?: number;
  /**
   * AutoCAD linetype name. dxf-parser exposes this as
   * `entity.lineType` (string, e.g. "CONTINUOUS", "DASHED",
   * "CENTER"). Some old files leave it `undefined` (BYLAYER).
   */
  lineStyle?: string;
}

/* ─── Tier 1: layer-name regex ──────────────────────────────────── */

/**
 * Layer-name → circuit lookup table. Patterns are matched
 * case-insensitively against the LayerHint.name. First match wins.
 *
 * Notes on the regexes:
 *   - We match anywhere in the layer name (no `^` anchor) because
 *     engineers commonly prefix layers with project codes like
 *     "ГК-2022-ШУГАМ-Нийлүүлэх".
 *   - The Latin "supply" / "return" patterns are loose enough to
 *     catch "Heat Supply Layer 01", "Reverse Pipe", etc.
 *   - Cyrillic stems intentionally start with the unique 3-4
 *     character prefix so "нийлүү" matches "Нийлүүлэх", "нийлүүлэлт",
 *     "нийлүүлэх_DN100", etc.
 *   - "очих" is a Mongolian variant of "supply line" used in
 *     Khovd / Govi-Altai projects.
 *   - Order matters: DHW / cold-water patterns BEFORE the generic
 *     "supply" / "return" matches, otherwise "халуун ус нийлүүлэх"
 *     would resolve to heating_supply instead of dhw_supply.
 */
const LAYER_NAME_PATTERNS: ReadonlyArray<readonly [RegExp, PipeCircuit]> = [
  // DHW (must come BEFORE heating_supply since they share "нийлүү")
  [/халуун.*ус|hot.*water|dhw/i, "dhw_supply"],
  // Cold water (must come BEFORE heating_supply for same reason)
  [/хүйтэн.*ус|cold.*water|cw[-_]?supply/i, "cold_water"],
  // Heating return
  [/обр|эргэх|буцах|return|reverse/i, "heating_return"],
  // Heating supply (last so it doesn't shadow DHW)
  [/подача|нийлүү|очих|supply|forward/i, "heating_supply"],
];

function tier1ByName(name: string): PipeCircuit | null {
  const trimmed = name.trim();
  for (const [pat, circuit] of LAYER_NAME_PATTERNS) {
    if (pat.test(trimmed)) return circuit;
  }
  return null;
}

/* ─── Tier 2: AutoCAD color index ───────────────────────────────── */

/**
 * Map an AutoCAD Color Index (ACI 1-255) → circuit using the
 * 5-colour convention adopted by Mongolian/Russian heating
 * drafting offices.
 *
 * Reference: AutoCAD ACI standard color chart.
 *   1 = pure red    → heating supply (Т1)
 *   5 = pure blue   → heating return (Т2)
 *   6 = magenta     → DHW supply (Т3) — engineer convention
 *   4 = cyan        → cold water — engineer convention
 *   3 = green       → DHW return (Т4) — engineer convention
 *
 * Other indices return null (don't claim authority on them; let the
 * lower tiers handle it).
 */
function tier2ByColor(colorIndex: number | undefined): PipeCircuit | null {
  if (colorIndex === undefined) return null;
  switch (colorIndex) {
    case 1: return "heating_supply";
    case 5: return "heating_return";
    case 6: return "dhw_supply";
    case 3: return "dhw_recirc";
    case 4: return "cold_water";
    default: return null;
  }
}

/* ─── Tier 3: line style ────────────────────────────────────────── */

/**
 * Map an AutoCAD linetype string → circuit. Drafting convention:
 *   - CONTINUOUS → supply line (solid)
 *   - DASHED / HIDDEN → return line
 *   - DOT-DASH / CENTER → secondary / auxiliary (we don't claim)
 *
 * Falls back to null if not a recognised pattern.
 */
function tier3ByLineStyle(lineStyle: string | undefined): PipeCircuit | null {
  if (!lineStyle) return null;
  const ls = lineStyle.toUpperCase();
  if (ls === "CONTINUOUS" || ls === "BYLAYER" || ls === "BYBLOCK") {
    return "heating_supply";
  }
  if (ls.startsWith("DASHED") || ls.startsWith("HIDDEN") || ls === "DASH") {
    return "heating_return";
  }
  return null;
}

/* ─── Main resolver ─────────────────────────────────────────────── */

/**
 * Resolve a LayerHint to a PipeCircuit using the 3-tier voting.
 *
 * Resolution order (highest weight wins):
 *   1. Layer-name regex (Tier 1) — most reliable, engineer-typed
 *   2. AutoCAD color index (Tier 2) — drafting-office convention
 *   3. Line style (Tier 3) — weakest signal, often defaulted BYLAYER
 *   4. Fallback: `"unknown"` — caller decides what to do (typically
 *      push warning + default to heating_supply)
 *
 * Pure / deterministic. Calling with the same hint always returns
 * the same circuit.
 */
export function mapCadLayerToCircuit(hint: LayerHint): PipeCircuit {
  const byName = tier1ByName(hint.name);
  if (byName !== null) return byName;

  const byColor = tier2ByColor(hint.colorIndex);
  if (byColor !== null) return byColor;

  const byStyle = tier3ByLineStyle(hint.lineStyle);
  if (byStyle !== null) return byStyle;

  return "unknown";
}

/* ─── Conflict detection ────────────────────────────────────────── */

/**
 * Return `true` when two or more signals disagree on the circuit.
 * Used by the import pipeline to flag engineer-attention-needed
 * pipes in the warnings list.
 *
 * Examples:
 *   - Layer "Supply" + color 5 (blue/return) → conflict
 *   - Color 1 (red) + linetype DASHED (return) → conflict
 *   - Layer "Supply" + color 1 (red) → NO conflict (both agree)
 *   - Single signal (only name) → NO conflict (nothing to disagree)
 */
export function detectCircuitConflict(hint: LayerHint): boolean {
  const byName = tier1ByName(hint.name);
  const byColor = tier2ByColor(hint.colorIndex);
  const byStyle = tier3ByLineStyle(hint.lineStyle);

  const signals = [byName, byColor, byStyle].filter((s): s is PipeCircuit => s !== null);
  if (signals.length < 2) return false;

  // Compare every pair — if any two differ, it's a conflict.
  for (let i = 0; i < signals.length; i += 1) {
    for (let j = i + 1; j < signals.length; j += 1) {
      if (signals[i] !== signals[j]) return true;
    }
  }
  return false;
}

/**
 * Engineer-facing label for a circuit. Used by the Phase 7.4 review
 * pane + warnings list.
 */
export function circuitLabelShort(circuit: PipeCircuit): string {
  switch (circuit) {
    case "heating_supply": return "Халаалт нийлүүлэх (Т1)";
    case "heating_return": return "Халаалт буцах (Т2)";
    case "dhw_supply": return "Халуун ус (Т3)";
    case "dhw_recirc": return "ХУ буцах (Т4)";
    case "cold_water": return "Хүйтэн ус";
    case "unknown": return "Тодорхойгүй";
  }
}
