import type { SymbolProps } from "./types";

/**
 * FixedSupportSymbol (ҮХТ — Үндэс Хатуу Тулгуур).
 *
 * Small square with an X inside — the X reads as "rigid restraint,
 * no movement here" per ГОСТ 21.605 fixed-support convention.
 */
export function FixedSupportSymbol({
  radius,
  color = "currentColor",
  selected,
}: SymbolProps) {
  const size = radius * 2;
  const sw = selected ? 2.0 : 1.4;
  return (
    <g data-symbol="fixedSupport" aria-label="ҮХТ fixed support">
      {selected && (
        <circle r={radius + 3} fill="none" stroke={color} strokeWidth={0.8} opacity={0.35} />
      )}
      <g transform={`scale(${size / 24})`}>
        <rect
          x={-9}
          y={-9}
          width={18}
          height={18}
          fill="white"
          stroke={color}
          strokeWidth={sw * (24 / size)}
        />
        <line x1={-7} y1={-7} x2={7} y2={7} stroke={color} strokeWidth={sw * (24 / size)} />
        <line x1={7} y1={-7} x2={-7} y2={7} stroke={color} strokeWidth={sw * (24 / size)} />
      </g>
    </g>
  );
}
