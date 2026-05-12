import type { SymbolProps } from "./types";

/**
 * SourceSymbol (УДДТ — Узловой Диспетчерский Тепловой пункт).
 *
 * House outline + horizontal flow arrow pointing right (downstream).
 * Engineers identify it on the schematic as "the larger house with
 * the arrow" — twice the visual weight of АОС consumer house so the
 * source pops at first glance.
 */
export function SourceSymbol({ radius, color = "currentColor", selected }: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 2.2 : 1.6;
  return (
    <g data-symbol="source" aria-label="УДДТ source">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        {/* Centred house outline: [-9, -9] roof apex to [9, 8] base */}
        <path
          d="M -9 8 L -9 -3 L 0 -9 L 9 -3 L 9 8 Z"
          fill="white"
          stroke={color}
          strokeWidth={sw * (24 / size)}
          strokeLinejoin="round"
        />
        {/* Flow arrow inside (left to right) */}
        <path
          d="M -5 2 L 4 2 M 4 2 L 1 -1 M 4 2 L 1 5"
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
