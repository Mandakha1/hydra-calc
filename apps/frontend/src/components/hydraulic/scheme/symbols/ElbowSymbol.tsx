import type { SymbolProps } from "./types";

/**
 * ElbowSymbol (ЭӨ — Эргэлтийн Өнцөг / pipe elbow).
 *
 * Small triangle pointing toward the downstream pipe (default east).
 * The triangle is enough to mark "direction change here"; the actual
 * angle is drawn by the connecting pipe paths.
 */
export function ElbowSymbol({ radius, color = "currentColor", selected }: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 1.8 : 1.2;
  return (
    <g data-symbol="elbow" aria-label="ЭӨ elbow">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        <path
          d="M -8 -7 L 8 0 L -8 7 Z"
          fill={color}
          fillOpacity={0.25}
          stroke={color}
          strokeWidth={sw * (24 / size)}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}
