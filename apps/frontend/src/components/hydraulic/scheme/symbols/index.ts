/**
 * Phase 6C — engineering symbol library entry point.
 *
 * Eight standard hydraulic schema symbols rendered as inline SVG.
 * Each is a pure React component accepting:
 *   - radius (number, px)  — half-width; symbol scales to fit
 *   - color  (string)      — stroke + light fill tint
 *   - selected? (boolean)  — adds a halo when true
 *
 * They all use a 24×24 viewBox so the consumer can `<g transform=
 * "scale(r/12)">` to scale uniformly. Symbol authors should keep
 * geometry inside [-12, 12] × [-12, 12] (the centred coordinate
 * system) so rotation about (0,0) works without translation.
 *
 * Reference: ГОСТ 21.605-82 graphical conventions for heat networks,
 * with simplifications matching the Mongolian residential field
 * practice (no shaded fills, single-line strokes).
 */
export { SourceSymbol } from "./SourceSymbol";
export { ConsumerSymbol } from "./ConsumerSymbol";
export { WellSymbol } from "./WellSymbol";
export { FixedSupportSymbol } from "./FixedSupportSymbol";
export { ElbowSymbol } from "./ElbowSymbol";
export { CompensatorSymbol } from "./CompensatorSymbol";
export { ValveSymbol } from "./ValveSymbol";
export { JunctionSymbol } from "./JunctionSymbol";
export type { SymbolProps } from "./types";
export { renderSymbolFor } from "./renderSymbolFor";
