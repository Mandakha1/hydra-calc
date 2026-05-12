/**
 * Building thermal protection constants — БНбД 23-02-09 "Барилгын дулаан хамгаалалт".
 * Climate annex — БНбД 23-01-09 "Барилгад хэрэглэх уур амьсгал ба геофизикийн үзүүлэлт".
 *
 * Sources:
 *   - https://legalinfo.mn/mn/detail?lawId=211242  (БНбД 23-02-09)
 *   - https://mcis.gov.mn/mn/norm  (official norm index)
 *   - СП 50.13330 parent standard for cross-reference
 */

export interface AimagClimate {
  city: string;
  /** Design outdoor temperature (cold 5-day 0.92 percentile), °C. */
  tnr_c: number;
  /** Heating season days (Tavg ≤ +8 °C). */
  heating_days: number;
  /** Mean outdoor temperature during heating season, °C. */
  t_avg_heating_c: number;
}

/** Mongolian aimag design climate — БНбД 23-01-09 Хавсралт А. */
export const CLIMATE: AimagClimate[] = [
  { city: "Улаанбаатар", tnr_c: -32, heating_days: 232, t_avg_heating_c: -9.5 },
  { city: "Эрдэнэт", tnr_c: -36, heating_days: 230, t_avg_heating_c: -10.0 },
  { city: "Дархан", tnr_c: -36, heating_days: 228, t_avg_heating_c: -10.1 },
  { city: "Сүхбаатар", tnr_c: -38, heating_days: 229, t_avg_heating_c: -10.8 },
  { city: "Чойбалсан", tnr_c: -34, heating_days: 223, t_avg_heating_c: -9.8 },
  { city: "Ховд", tnr_c: -36, heating_days: 224, t_avg_heating_c: -11.2 },
  { city: "Өлгий", tnr_c: -34, heating_days: 228, t_avg_heating_c: -10.6 },
  { city: "Мөрөн", tnr_c: -38, heating_days: 235, t_avg_heating_c: -11.0 },
  { city: "Баянхонгор", tnr_c: -32, heating_days: 225, t_avg_heating_c: -8.9 },
  { city: "Сайншанд", tnr_c: -28, heating_days: 210, t_avg_heating_c: -7.3 },
  { city: "Алтай", tnr_c: -34, heating_days: 236, t_avg_heating_c: -10.4 },
  { city: "Улиастай", tnr_c: -38, heating_days: 240, t_avg_heating_c: -12.1 },
  { city: "Арвайхээр", tnr_c: -30, heating_days: 224, t_avg_heating_c: -8.6 },
  { city: "Чойр", tnr_c: -30, heating_days: 220, t_avg_heating_c: -8.5 },
  { city: "Зуунмод", tnr_c: -33, heating_days: 230, t_avg_heating_c: -9.6 },
  { city: "Мандалгоби", tnr_c: -29, heating_days: 218, t_avg_heating_c: -7.9 },
  { city: "Булган", tnr_c: -37, heating_days: 233, t_avg_heating_c: -10.7 },
  { city: "Өндөрхаан", tnr_c: -33, heating_days: 226, t_avg_heating_c: -9.7 },
  { city: "Барун-Урт", tnr_c: -32, heating_days: 222, t_avg_heating_c: -9.1 },
  { city: "Даланзадгад", tnr_c: -26, heating_days: 205, t_avg_heating_c: -6.8 },
];

export interface WallType {
  key: string;
  name: string;
  /** Thermal resistance R (m²·°C/W). */
  r_value: number;
  /** U-value (W/m²·K) = 1 / R. */
  u_value: number;
  category: "wall" | "roof" | "floor";
}

export const WALL_TYPES: WallType[] = [
  { key: "brick_510", name: "Тоосгон хана 510мм (2 тоосго)", r_value: 1.06, u_value: 0.94, category: "wall" },
  { key: "brick_380", name: "Тоосгон хана 380мм (1.5 тоосго)", r_value: 0.82, u_value: 1.22, category: "wall" },
  { key: "brick_250", name: "Тоосгон хана 250мм (1 тоосго)", r_value: 0.56, u_value: 1.79, category: "wall" },
  { key: "aac_200", name: "Хөнгөн блок 200мм", r_value: 1.25, u_value: 0.8, category: "wall" },
  { key: "aac_300", name: "Хөнгөн блок 300мм", r_value: 1.85, u_value: 0.54, category: "wall" },
  { key: "aac_400", name: "Хөнгөн блок 400мм", r_value: 2.45, u_value: 0.41, category: "wall" },
  { key: "sandwich_100", name: "Сэндвич панел 100мм", r_value: 2.22, u_value: 0.45, category: "wall" },
  { key: "sandwich_150", name: "Сэндвич панел 150мм", r_value: 3.33, u_value: 0.3, category: "wall" },
  { key: "sandwich_200", name: "Сэндвич панел 200мм", r_value: 4.44, u_value: 0.23, category: "wall" },
  { key: "log_200", name: "Модон гуалин хана 200мм", r_value: 1.33, u_value: 0.75, category: "wall" },
  { key: "panel_160", name: "Хавтгай панел барилга 160мм", r_value: 0.72, u_value: 1.39, category: "wall" },
  { key: "roof_standard", name: "Дээврийн хучилт (стандарт)", r_value: 3.2, u_value: 0.31, category: "roof" },
  { key: "attic", name: "Оройн хучилт (чардак)", r_value: 4.15, u_value: 0.24, category: "roof" },
  { key: "floor_ground", name: "Шалны хучилт (газар дээр)", r_value: 2.5, u_value: 0.4, category: "floor" },
];

export interface GlazingType {
  key: string;
  name: string;
  u: number;
  r: number;
}

export const GLAZING: GlazingType[] = [
  { key: "wood_2pane", name: "2 давхар модон цонх", u: 2.7, r: 0.37 },
  { key: "pvc_2pane", name: "2 давхар ПВЦ цонх", u: 2.3, r: 0.43 },
  { key: "pvc_3pane_lowe", name: "3 давхар ПВЦ (Low-E, Ar)", u: 1.4, r: 0.72 },
  { key: "door_wood", name: "Гадна модон хаалга", u: 2.0, r: 0.5 },
  { key: "door_insulated", name: "Дулаалгатай металл хаалга", u: 1.6, r: 0.63 },
];

/** Correction factors β applied to Q_transmission (БНбД 23-02-09 §6). */
export const CORRECTION_FACTORS = {
  orientation: {
    N: 0.1,
    NE: 0.1,
    E: 0.05,
    SE: 0.0,
    S: 0.0,
    SW: 0.0,
    W: 0.05,
    NW: 0.05,
  },
  two_outside_walls_corner: 0.05,
  height_above_4m_per_m: 0.02,
  ground_floor: 0.03,
  unheated_staircase: 0.15,
} as const;

/** Air change rates per hour by occupancy. */
export const ACH_BY_USE = {
  residential: 1.0,
  office: 1.5,
  retail: 2.0,
  industrial: 3.0,
  school: 2.5,
  hospital: 2.5,
} as const;

/** Design indoor temperature by occupancy (°C). */
export const INDOOR_TEMP_BY_USE = {
  residential: 20,
  office: 18,
  retail: 16,
  industrial: 15,
  staircase: 16,
  school: 18,
  hospital: 22,
  bathroom: 25,
} as const;

/** Air physical constants (dry air at 0 °C, 1 atm). */
export const AIR_PROPS = {
  specific_heat_kJ_kgK: 1.005,
  density_kg_m3: 1.292,
} as const;

/** Typical internal heat gains for residential (W/m² of floor area). */
export const INTERNAL_GAINS_W_PER_M2 = {
  residential: 10,
  office: 25,
  retail: 30,
  industrial: 15,
  school: 20,
} as const;
