/**
 * Speed / pressure color bands — ported verbatim from Zulu's voda.ini defaults.
 * Engineers expect these exact thresholds + colors when reviewing computed networks.
 *
 * Source: C:\Program Files\ZuluGIS\Preset\hydro\voda.ini
 */

export interface ColorBand {
  /** Upper limit of this band (exclusive). Use Infinity for the last band. */
  ltMax: number;
  /** CSS hex color (without #). */
  hex: string;
  /** Optional human-readable label for legend. */
  label?: string;
}

/** Velocity (m/s) bands — Zulu voda.ini [SpeedColors]. */
export const SPEED_BANDS: ColorBand[] = [
  { ltMax: 0.10, hex: "#FF8000", label: "Хэт удаан (хагралал, агаар хуримтлал)" },
  { ltMax: 0.80, hex: "#FFE000", label: "Бага" },
  { ltMax: 1.50, hex: "#40FF00", label: "Хэвийн" },
  { ltMax: 2.00, hex: "#0080FF", label: "Сайн" },
  { ltMax: Infinity, hex: "#FF0000", label: "Хязгаарт хэтэрсэн (>2.0)" },
];

/** Pressure (m water column) bands — Zulu voda.ini [PressureColors]. */
export const PRESSURE_BANDS: ColorBand[] = [
  { ltMax: 10, hex: "#906060", label: "Маш бага (<10м)" },
  { ltMax: 20, hex: "#FF8000", label: "Бага (10-20м)" },
  { ltMax: 30, hex: "#9999FF", label: "Хэвийн (20-30м)" },
  { ltMax: Infinity, hex: "#60FF60", label: "Сайн (>30м)" },
];

/** Pipe capacity (Гкал/ч) bands — Zulu voda.ini [CapacityColors]. */
export const CAPACITY_BANDS: ColorBand[] = [
  { ltMax: 10, hex: "#8080FF", label: "Бага хүчин чадал" },
  { ltMax: 500, hex: "#80FFFF", label: "Дунд" },
  { ltMax: Infinity, hex: "#80FF80", label: "Их" },
];

/** Look up the color for a value within a band set. */
export function colorForValue(value: number, bands: ColorBand[]): string {
  for (const b of bands) {
    if (value < b.ltMax) return `#${b.hex.replace(/^#/, "")}`;
  }
  return `#${bands[bands.length - 1]!.hex}`;
}

/** Quick legend description (used in UI). */
export function bandLabel(value: number, bands: ColorBand[]): string {
  for (const b of bands) {
    if (value < b.ltMax) return b.label ?? "";
  }
  return bands[bands.length - 1]!.label ?? "";
}
