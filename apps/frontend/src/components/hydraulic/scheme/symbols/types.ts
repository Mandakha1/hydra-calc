/**
 * Shared symbol-component prop shape.
 *
 * Each symbol renders inside an SVG <g> at its parent's origin. The
 * `radius` is the half-width of the symbol in SVG-pixel units; the
 * symbol internally maps a 24×24 viewBox to [-radius, radius].
 */
export interface SymbolProps {
  /** Half-width in SVG-pixel units. Caller passes the clamped
   *  radius from computeSymbolRadiusPx (Phase 6A). */
  radius: number;
  /** Stroke colour. Caller passes the layer colour (Phase 6E) OR a
   *  state colour (selected/violating/etc.). Pure-black fallback if
   *  caller has nothing better — but black-on-light is the engineering
   *  drafting convention so it's a safe default. */
  color?: string;
  /** Adds a halo behind the symbol when true (~2 px wider stroke). */
  selected?: boolean;
  /** Optional className for CSS theming hooks (e.g. flow-animation
   *  classes on pipes). Not used by the symbols themselves but kept
   *  here so the type matches the renderSymbolFor router below. */
  className?: string;
}
