import type { SymbolProps } from "./types";

/**
 * JunctionSymbol — filled dot, the smallest entity.
 *
 * Used for unnamed узель — abstract hydraulic nodes (T-junction, Y,
 * cross) where the engineer is just connecting pipes without
 * dropping a physical chamber. Smaller than well/elbow/etc so it
 * doesn't compete visually with named objects.
 */
export function JunctionSymbol({ radius, color = "currentColor", selected }: SymbolProps) {
  const r = selected ? radius * 0.7 : radius * 0.55;
  return (
    <g data-symbol="junction" aria-label="junction">
      {selected && (
        <circle r={radius + 2} fill="none" stroke={color} strokeWidth={0.8} opacity={0.4} />
      )}
      <circle r={r} fill={color} />
    </g>
  );
}
