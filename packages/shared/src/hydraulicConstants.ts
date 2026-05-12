/**
 * Hydraulic engineering constants for heat networks in Mongolia.
 *
 * Sources (БНбД 41-01-2019 / СП 124.13330.2012 "Тепловые сети"):
 *   - https://docs.cntd.ru/document/1200095545
 *   - https://meganorm.ru/mega_doc/norm/normy/0/sp_124_13330_2012_svod_pravil_teplovye_seti.html
 *   - https://studfile.net/preview/10071578/page:9/  (Δp_consumer ≥ 0.15 MPa)
 *   - https://gidrotgv.ru/spravka-po-ekvivalentnoj-sheroxovatosti-materiala-stenki-kanala-truby/ (k_e)
 *
 * DO NOT modify these numbers without a matching BNbD/СП reference — engineers
 * compare results against printed norm tables.
 */

/** Water physical properties at design temperatures (closed 2-pipe network). */
export const WATER_PROPS = {
  density_kg_m3: {
    at_5c: 1000,
    at_20c: 998,
    at_40c: 992,
    at_70c: 978,
    at_80c: 972,
    at_95c: 962,
    at_115c: 947,
    at_130c: 935,
    at_150c: 917,
  },
  specific_heat_j_kg_k: 4187,
  /** Kinematic viscosity ν (m²/s) — used in Re = v·d/ν. */
  kinematic_viscosity_m2_s: {
    at_20c: 1.004e-6,
    at_40c: 0.658e-6,
    at_70c: 0.415e-6,
    at_80c: 0.365e-6,
    at_95c: 0.306e-6,
    at_130c: 0.217e-6,
  },
} as const;

/**
 * Pipe material database — equivalent roughness k_e (mm), thermal & pressure limits.
 */
export const PIPE_MATERIALS = [
  {
    key: "steel_new",
    name: "Ган хоолой (ГОСТ 10704-91) — шинэ",
    roughness_mm: 0.1,
    max_temp_c: 200,
    max_pressure_mpa: 2.5,
    dn_min: 15,
    dn_max: 1400,
  },
  {
    key: "steel_aged",
    name: "Ган хоолой (ГОСТ 10704-91) — ашиглагдсан",
    roughness_mm: 0.5,
    max_temp_c: 200,
    max_pressure_mpa: 2.5,
    dn_min: 15,
    dn_max: 1400,
  },
  {
    key: "steel_galv",
    name: "Цайрдсан ган хоолой (ГОСТ 3262-75)",
    roughness_mm: 0.2,
    max_temp_c: 150,
    max_pressure_mpa: 1.6,
    dn_min: 15,
    dn_max: 150,
  },
  {
    key: "preinsulated",
    name: "Урьдчилан дулаалсан ПИ-труба (ГОСТ 30732-2020)",
    roughness_mm: 0.5,
    max_temp_c: 140,
    max_pressure_mpa: 1.6,
    dn_min: 25,
    dn_max: 1000,
  },
  {
    key: "pe_xa",
    name: "PE-Xa (сшитый полиэтилен, EN 15632)",
    roughness_mm: 0.007,
    max_temp_c: 95,
    max_pressure_mpa: 0.6,
    dn_min: 20,
    dn_max: 160,
  },
  {
    key: "pe_rt",
    name: "PE-RT Type II",
    roughness_mm: 0.007,
    max_temp_c: 90,
    max_pressure_mpa: 0.6,
    dn_min: 16,
    dn_max: 110,
  },
  {
    key: "ppr_fr",
    name: "PPR-FR (Fiber-Random, stabi)",
    roughness_mm: 0.01,
    max_temp_c: 95,
    max_pressure_mpa: 1.0,
    dn_min: 20,
    dn_max: 160,
  },
] as const;

export type PipeMaterialKey = (typeof PIPE_MATERIALS)[number]["key"];

/**
 * Normative thresholds — BNbD 41-01-2019 / СП 124.13330.2012.
 * Calculator flags results outside these bounds.
 */
export const NORM_THRESHOLDS = {
  velocity_min_ms: 0.2,
  velocity_max_main_ms: 3.5,
  velocity_max_branch_ms: 2.0,

  dp_consumer_min_mpa: 0.15,
  dp_consumer_elevator_mpa: 0.10,
  dp_consumer_absolute_min_mpa: 0.08,

  headloss_max_main_pa_per_m: 80,
  headloss_max_branch_pa_per_m: 300,
  headloss_economic_range_pa_per_m: [30, 80] as const,

  local_losses_fraction: 0.3,

  static_pressure_min_mpa: 0.05,
} as const;

/** Temperature schedules used in Mongolia. */
export const TEMP_SCHEDULES = [
  {
    key: "130_70",
    supply_c: 130,
    return_c: 70,
    description: "УБ ТЭЦ магистраль — БНбД 41-01 үндсэн график",
    is_default_primary: true,
  },
  {
    key: "115_70",
    supply_c: 115,
    return_c: 70,
    description: "Том магистраль / хоёрдогч",
    is_default_primary: false,
  },
  {
    key: "105_70",
    supply_c: 105,
    return_c: 70,
    description: "Олон давхар орон сууцны дотоод сүлжээ",
    is_default_primary: false,
  },
  {
    key: "95_70",
    supply_c: 95,
    return_c: 70,
    description: "ИТП-ийн дараах барилгын дотоод (PPR/PEX-д тохиромжтой)",
    is_default_primary: false,
  },
  {
    key: "150_70",
    supply_c: 150,
    return_c: 70,
    description: "Орос магистраль (УБ-д бараг ашиглагддаггүй)",
    is_default_primary: false,
  },
] as const;

/** Typical local resistance coefficients (ζ) — quick reference. */
export const LOCAL_RESISTANCE = {
  elbow_90_sharp: 1.5,
  elbow_90_smooth: 0.4,
  elbow_45: 0.35,
  tee_pass: 0.5,
  tee_branch_out: 1.5,
  tee_branch_in: 1.0,
  gate_valve_open: 0.15,
  globe_valve_open: 6.0,
  ball_valve_open: 0.1,
  check_valve: 2.5,
  sudden_expansion: 1.0,
  sudden_contraction: 0.5,
  entry_sharp: 0.5,
  exit: 1.0,
  strainer: 2.5,
  radiator: 2.0,
} as const;

/** Network type — Mongolian default per BNbD 41-01. */
export const NETWORK_TYPES = [
  { key: "two_pipe_closed", label: "2-шугамтай битүү (standard)", is_default: true },
  { key: "two_pipe_open", label: "2-шугамтай нээлттэй", is_default: false },
  { key: "four_pipe", label: "4-шугамтай (ХЦУ-тай)", is_default: false },
] as const;

/* -------------------------------------------------------------------------- */
/*  PIPE DIMENSION DATABASE                                                    */
/* -------------------------------------------------------------------------- */

export interface PipeSize {
  dn: number;
  od_mm: number;
  wall_mm: number;
  id_mm: number;
  mass_kg_per_m: number;
}

/** Steel, ГОСТ 10704-91 electric-welded straight-seam. */
export const PIPE_DB_STEEL: PipeSize[] = [
  { dn: 15, od_mm: 21.3, wall_mm: 2.8, id_mm: 15.7, mass_kg_per_m: 1.28 },
  { dn: 20, od_mm: 26.8, wall_mm: 2.8, id_mm: 21.2, mass_kg_per_m: 1.66 },
  { dn: 25, od_mm: 33.5, wall_mm: 3.2, id_mm: 27.1, mass_kg_per_m: 2.39 },
  { dn: 32, od_mm: 42.3, wall_mm: 3.2, id_mm: 35.9, mass_kg_per_m: 3.09 },
  { dn: 40, od_mm: 48.0, wall_mm: 3.5, id_mm: 41.0, mass_kg_per_m: 3.84 },
  { dn: 50, od_mm: 60.0, wall_mm: 3.5, id_mm: 53.0, mass_kg_per_m: 4.88 },
  { dn: 65, od_mm: 76.0, wall_mm: 4.0, id_mm: 68.0, mass_kg_per_m: 7.1 },
  { dn: 80, od_mm: 89.0, wall_mm: 4.0, id_mm: 81.0, mass_kg_per_m: 8.38 },
  { dn: 100, od_mm: 108.0, wall_mm: 4.0, id_mm: 100.0, mass_kg_per_m: 10.26 },
  { dn: 125, od_mm: 133.0, wall_mm: 4.5, id_mm: 124.0, mass_kg_per_m: 14.26 },
  { dn: 150, od_mm: 159.0, wall_mm: 4.5, id_mm: 150.0, mass_kg_per_m: 17.15 },
  { dn: 200, od_mm: 219.0, wall_mm: 6.0, id_mm: 207.0, mass_kg_per_m: 31.52 },
  { dn: 250, od_mm: 273.0, wall_mm: 7.0, id_mm: 259.0, mass_kg_per_m: 45.92 },
  { dn: 300, od_mm: 325.0, wall_mm: 8.0, id_mm: 309.0, mass_kg_per_m: 62.54 },
  { dn: 350, od_mm: 377.0, wall_mm: 9.0, id_mm: 359.0, mass_kg_per_m: 81.68 },
  { dn: 400, od_mm: 426.0, wall_mm: 9.0, id_mm: 408.0, mass_kg_per_m: 92.55 },
  { dn: 500, od_mm: 530.0, wall_mm: 9.0, id_mm: 512.0, mass_kg_per_m: 115.65 },
  // Том магистраль — Дархан/УБ ТЭЦ-ийн магистраль шугамд хэрэглэгддэг (ГОСТ 10704-91 max DN 1400)
  { dn: 600, od_mm: 630.0, wall_mm: 10.0, id_mm: 610.0, mass_kg_per_m: 152.8 },
  { dn: 700, od_mm: 720.0, wall_mm: 10.0, id_mm: 700.0, mass_kg_per_m: 175.0 },
  { dn: 800, od_mm: 820.0, wall_mm: 11.0, id_mm: 798.0, mass_kg_per_m: 219.5 },
  { dn: 900, od_mm: 920.0, wall_mm: 11.0, id_mm: 898.0, mass_kg_per_m: 247.0 },
  { dn: 1000, od_mm: 1020.0, wall_mm: 12.0, id_mm: 996.0, mass_kg_per_m: 298.4 },
  { dn: 1200, od_mm: 1220.0, wall_mm: 14.0, id_mm: 1192.0, mass_kg_per_m: 416.3 },
  { dn: 1400, od_mm: 1420.0, wall_mm: 15.0, id_mm: 1390.0, mass_kg_per_m: 519.8 },
];

/** PPR PN20 / SDR6 (ГОСТ 32415-2013, ISO 15874), ρ = 0.905 g/cm³. */
export const PIPE_DB_PPR: PipeSize[] = [
  { dn: 20, od_mm: 20, wall_mm: 3.4, id_mm: 13.2, mass_kg_per_m: 0.172 },
  { dn: 25, od_mm: 25, wall_mm: 4.2, id_mm: 16.6, mass_kg_per_m: 0.266 },
  { dn: 32, od_mm: 32, wall_mm: 5.4, id_mm: 21.2, mass_kg_per_m: 0.434 },
  { dn: 40, od_mm: 40, wall_mm: 6.7, id_mm: 26.6, mass_kg_per_m: 0.67 },
  { dn: 50, od_mm: 50, wall_mm: 8.3, id_mm: 33.4, mass_kg_per_m: 1.04 },
  { dn: 63, od_mm: 63, wall_mm: 10.5, id_mm: 42.0, mass_kg_per_m: 1.65 },
  { dn: 75, od_mm: 75, wall_mm: 12.5, id_mm: 50.0, mass_kg_per_m: 2.34 },
  { dn: 90, od_mm: 90, wall_mm: 15.0, id_mm: 60.0, mass_kg_per_m: 3.37 },
  { dn: 110, od_mm: 110, wall_mm: 18.3, id_mm: 73.4, mass_kg_per_m: 5.02 },
];

/** PE-HD PE100 SDR11 PN16 (ГОСТ 18599-2001 / ISO 4427), ρ = 0.96 g/cm³. */
export const PIPE_DB_PEHD: PipeSize[] = [
  { dn: 20, od_mm: 20, wall_mm: 2.0, id_mm: 16.0, mass_kg_per_m: 0.116 },
  { dn: 25, od_mm: 25, wall_mm: 2.3, id_mm: 20.4, mass_kg_per_m: 0.167 },
  { dn: 32, od_mm: 32, wall_mm: 3.0, id_mm: 26.0, mass_kg_per_m: 0.277 },
  { dn: 40, od_mm: 40, wall_mm: 3.7, id_mm: 32.6, mass_kg_per_m: 0.427 },
  { dn: 50, od_mm: 50, wall_mm: 4.6, id_mm: 40.8, mass_kg_per_m: 0.662 },
  { dn: 63, od_mm: 63, wall_mm: 5.8, id_mm: 51.4, mass_kg_per_m: 1.05 },
  { dn: 75, od_mm: 75, wall_mm: 6.8, id_mm: 61.4, mass_kg_per_m: 1.46 },
  { dn: 90, od_mm: 90, wall_mm: 8.2, id_mm: 73.6, mass_kg_per_m: 2.11 },
  { dn: 110, od_mm: 110, wall_mm: 10.0, id_mm: 90.0, mass_kg_per_m: 3.14 },
  { dn: 125, od_mm: 125, wall_mm: 11.4, id_mm: 102.2, mass_kg_per_m: 4.07 },
  { dn: 160, od_mm: 160, wall_mm: 14.6, id_mm: 130.8, mass_kg_per_m: 6.67 },
  { dn: 200, od_mm: 200, wall_mm: 18.2, id_mm: 163.6, mass_kg_per_m: 10.4 },
];

export const PIPE_DB = {
  steel: PIPE_DB_STEEL,
  ppr: PIPE_DB_PPR,
  pehd: PIPE_DB_PEHD,
} as const;

/**
 * Улаанбаатар retail prices 2026 Q1 — MNT/m.
 * Эх сурвалж: Зэвсэгт-их, Монгол-Хятад худалдаа, Ган Кад ХХК прайс
 * (2026.01 mid-month avg, ОУХ дотоодын зах зээл, USD/MNT ≈ 3520).
 *
 * Steel: ГОСТ 10704-91 (Хятад/ОУ-ын импорт + дотоодын Ган Кад прокат)
 * PPR:  Wefatherm/AsiaPipes/Cosmoplast PN20 SDR6
 * PE-HD: Wavin/PE100 SDR11 + Ариункан-Ус ХХК
 *
 * Үнэд НӨАТ ороогүй — bom.ts-д дараа нэмнэ.
 */
export const PIPE_PRICES_MNT_PER_M: Record<string, number> = {
  // Ган хоолой 2026 (steel inflation +15% vs 2024)
  steel_15: 6_800, steel_20: 8_900, steel_25: 12_500, steel_32: 16_500,
  steel_40: 20_500, steel_50: 26_000, steel_65: 35_000, steel_80: 47_000,
  steel_100: 64_000, steel_125: 86_000, steel_150: 112_000, steel_200: 168_000,
  steel_250: 225_000, steel_300: 295_000, steel_350: 385_000, steel_400: 475_000,
  steel_500: 685_000,
  // Том магистраль — Дархан/УБ ТЭЦ ашигладаг
  steel_600: 985_000, steel_700: 1_240_000, steel_800: 1_580_000,
  steel_900: 1_865_000, steel_1000: 2_250_000, steel_1200: 3_180_000, steel_1400: 4_350_000,
  // PPR 2026 (Wefatherm / Cosmoplast)
  ppr_20: 2_400, ppr_25: 3_500, ppr_32: 5_200, ppr_40: 8_900, ppr_50: 14_500,
  ppr_63: 23_500, ppr_75: 33_000, ppr_90: 44_000, ppr_110: 65_000,
  // PE-HD 2026 (Wavin/Ариункан-Ус)
  pehd_20: 1_650, pehd_25: 2_350, pehd_32: 3_700, pehd_40: 5_500, pehd_50: 8_000,
  pehd_63: 12_500, pehd_75: 17_500, pehd_90: 24_000, pehd_110: 36_000,
  pehd_125: 44_500, pehd_160: 69_000, pehd_200: 108_000,
  // Урьдчилан дулаалсан (PI-труба) — 2026, дулаалга + кожух өртөг
  preinsulated_50: 95_000, preinsulated_80: 145_000, preinsulated_100: 185_000,
  preinsulated_150: 285_000, preinsulated_200: 425_000, preinsulated_250: 595_000,
  preinsulated_300: 785_000, preinsulated_400: 1_150_000, preinsulated_500: 1_650_000,
};

/** Typical pumps used in УБ heat networks. */
export const TYPICAL_PUMPS = [
  { brand: "WILO", series: "NL / IL / CronoLine", role: "Network circulation" },
  { brand: "WILO", series: "Stratos / Yonos PICO", role: "Small building / house-branch" },
  { brand: "Grundfos", series: "NB / NK / TP", role: "Network circulation + make-up" },
  { brand: "Grundfos", series: "MAGNA3 / UPS", role: "Small building / house-branch" },
  { brand: "Pedrollo", series: "F / F4 end-suction", role: "Small boiler rooms" },
] as const;

/**
 * Mongolian well / ИТП equipment presets.
 * Used in scheme drawing for typical consumer-side installations.
 */
export const WELL_EQUIPMENT = [
  { key: "itp_elevator", label: "ИТП — элеваторт зангилаа", resistance_zeta: 8.0, notes: "Сокс, шугам 130/70°С" },
  { key: "itp_plate_he", label: "ИТП — ялтсан дулаан солилцуур", resistance_zeta: 12.0, notes: "Орчин үеийн ХТС" },
  { key: "itp_mix_pump", label: "ИТП — холих насос бүхий", resistance_zeta: 10.0, notes: "Автомат тохируулга" },
  { key: "radiator_block", label: "Радиатор блок (шууд холболт)", resistance_zeta: 2.5, notes: "4-5 радиатор зэрэгцээ" },
  { key: "underfloor", label: "Шалны дулаацуулга (PE-Xa)", resistance_zeta: 3.0, notes: "Low-temp 45/35°С" },
] as const;
