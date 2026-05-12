import type { SymbolProps } from "./types";

/**
 * ValveSymbol — bow-tie (two triangles meeting at apex).
 *
 * The bow-tie is the universal gate-valve symbol on hydraulic
 * schematics — ИСО 14617-2 / ГОСТ 21.205. Engineers see it and
 * immediately know "flow-control device, mechanically actuated".
 */
export function ValveSymbol({ radius, color = "currentColor", selected }: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 2.0 : 1.4;
  return (
    <g data-symbol="valve" aria-label="valve">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        {/* Two triangles meeting at (0,0) */}
        <path
          d="M -9 -7 L 0 0 L -9 7 Z"
          fill="white"
          stroke={color}
          strokeWidth={sw * (24 / size)}
          strokeLinejoin="round"
        />
        <path
          d="M 9 -7 L 0 0 L 9 7 Z"
          fill="white"
          stroke={color}
          strokeWidth={sw * (24 / size)}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}
