import type { SymbolProps } from "./types";

/**
 * ConsumerSymbol (АОС — Амины Орон Сууцны хэрэглэгч).
 *
 * Smaller house outline, no arrow inside. Visually paired with
 * SourceSymbol but a step less prominent so engineer's eye finds the
 * УДДТ first.
 */
export function ConsumerSymbol({ radius, color = "currentColor", selected }: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 2.0 : 1.4;
  return (
    <g data-symbol="consumer" aria-label="АОС consumer">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        {/* Slimmer house */}
        <path
          d="M -7 8 L -7 -2 L 0 -8 L 7 -2 L 7 8 Z"
          fill="white"
          stroke={color}
          strokeWidth={sw * (24 / size)}
          strokeLinejoin="round"
        />
        {/* A simple door so the house "reads" as occupied */}
        <rect
          x={-2}
          y={2}
          width={4}
          height={6}
          fill="none"
          stroke={color}
          strokeWidth={sw * 0.75 * (24 / size)}
        />
      </g>
    </g>
  );
}
