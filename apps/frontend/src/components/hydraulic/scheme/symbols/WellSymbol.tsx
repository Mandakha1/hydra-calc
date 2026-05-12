import type { SymbolProps } from "./types";

/**
 * WellSymbol (ДХ — Дулааны Худаг / underground chamber).
 *
 * Open circle with a + inside. The cross marks "below grade" in
 * Russian/Mongolian engineering convention.
 */
export function WellSymbol({ radius, color = "currentColor", selected }: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 2.0 : 1.4;
  return (
    <g data-symbol="well" aria-label="ДХ well/chamber">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        <circle r={10} fill="white" stroke={color} strokeWidth={sw * (24 / size)} />
        <line x1={-7} y1={0} x2={7} y2={0} stroke={color} strokeWidth={sw * (24 / size)} />
        <line x1={0} y1={-7} x2={0} y2={7} stroke={color} strokeWidth={sw * (24 / size)} />
      </g>
    </g>
  );
}
