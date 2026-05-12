import type { SymbolProps } from "./types";

/**
 * CompensatorSymbol (К — Компенсатор / expansion compensator).
 *
 * Ω-shaped loop. The Greek letter omega is the universal symbol for
 * a pipe expansion loop across Russian, Mongolian, and Western
 * conventions (per ГОСТ 21.605 + ISO 14617-3).
 */
export function CompensatorSymbol({
  radius,
  color = "currentColor",
  selected,
}: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 2.0 : 1.4;
  return (
    <g data-symbol="compensator" aria-label="К compensator">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        {/* Ω path: enters from left, loops up over top, returns down right.
            Hand-drawn-feel curves so it reads as a compensator and not
            a generic squiggle. */}
        <path
          d="M -10 6 L -6 6 A 6 6 0 1 1 6 6 L 10 6"
          fill="none"
          stroke={color}
          strokeWidth={sw * (24 / size)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}
