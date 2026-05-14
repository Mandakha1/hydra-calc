/**
 * Catalog of all node types — Zulu-style classification.
 * Drives the toolbar palette, inspector form selection, and scheme rendering.
 */

export type NodeCategory = "source" | "consumer" | "valve" | "fitting" | "chamber" | "pump" | "sensor";

export interface NodeKindDef {
  key: string;
  category: NodeCategory;
  name: string;
  shortLabel: string; // For canvas marker (1-3 chars)
  icon: string; // Emoji or unicode glyph for toolbar
  description: string;
  /** Default props applied when creating this node. */
  defaults?: {
    heatLoad_w?: number;
    requiredPressure_mpa?: number;
    /** Local resistance ζ for valves/fittings. */
    zeta?: number;
    /** Building footprint width in meters (for rendering rectangles). */
    width_m?: number;
    /** Building footprint height in meters. */
    height_m?: number;
    /** Number of floors (for apartments/offices/etc.). */
    floors?: number;
  };
  /** Inspector form variant key. */
  formKey: "source" | "consumerBuilding" | "consumerEquipment" | "valve" | "fitting" | "chamber" | "pump";
}

export const NODE_KINDS: NodeKindDef[] = [
  // ========== SOURCES (Дулааны эх үүсвэр) ==========
  {
    key: "source_tec",
    category: "source",
    name: "ТЭЦ / Дулааны цахилгаан станц",
    shortLabel: "ТЭЦ",
    icon: "🏭",
    description: "Том чадлын дулаан-цахилгаан хослол үүсгүүр",
    defaults: { width_m: 80, height_m: 50 },
    formKey: "source",
  },
  {
    key: "source_boiler",
    category: "source",
    name: "Уурын зуух / Котельная",
    shortLabel: "Кот",
    icon: "🔥",
    description: "Локалын уурын зуухны байгууламж",
    defaults: { width_m: 25, height_m: 15 },
    formKey: "source",
  },
  {
    key: "source_substation",
    category: "source",
    name: "ЦТП — Дулааны төв станц",
    shortLabel: "ЦТП",
    icon: "⊕",
    description: "Хэд хэдэн барилгад зориулсан төв ИТП",
    defaults: { width_m: 12, height_m: 8 },
    formKey: "source",
  },
  {
    key: "source_geothermal",
    category: "source",
    name: "Газрын халаалт (геотермал)",
    shortLabel: "ГТ",
    icon: "♨",
    description: "Газрын болон сэргээгдэх эх үүсвэр",
    defaults: { width_m: 8, height_m: 8 },
    formKey: "source",
  },

  // ========== CONSUMERS — BUILDINGS ==========
  {
    key: "consumer_apartment",
    category: "consumer",
    name: "Орон сууц",
    shortLabel: "ОС",
    icon: "🏢",
    description: "Олон давхар орон сууцны барилга",
    defaults: { heatLoad_w: 80_000, requiredPressure_mpa: 0.15, width_m: 30, height_m: 12, floors: 9 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_house",
    category: "consumer",
    name: "Хувийн сууц",
    shortLabel: "ХС",
    icon: "🏠",
    description: "Бие даасан гэр сууц",
    defaults: { heatLoad_w: 25_000, requiredPressure_mpa: 0.12, width_m: 12, height_m: 10, floors: 2 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_office",
    category: "consumer",
    name: "Оффис барилга",
    shortLabel: "Оф",
    icon: "🏬",
    description: "Засаг захиргаа, ажлын байр",
    defaults: { heatLoad_w: 100_000, requiredPressure_mpa: 0.15, width_m: 35, height_m: 20, floors: 7 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_school",
    category: "consumer",
    name: "Сургууль / Цэцэрлэг",
    shortLabel: "Сур",
    icon: "🏫",
    description: "Боловсролын байгууллага",
    defaults: { heatLoad_w: 150_000, requiredPressure_mpa: 0.15, width_m: 45, height_m: 22, floors: 3 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_hospital",
    category: "consumer",
    name: "Эмнэлэг",
    shortLabel: "Эм",
    icon: "🏥",
    description: "Эмнэлэгийн байгууламж (24/7)",
    defaults: { heatLoad_w: 200_000, requiredPressure_mpa: 0.15, width_m: 50, height_m: 28, floors: 5 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_retail",
    category: "consumer",
    name: "Дэлгүүр / Үйлчилгээ",
    shortLabel: "Дэл",
    icon: "🏪",
    description: "Худалдаа, үйлчилгээний барилга",
    defaults: { heatLoad_w: 60_000, requiredPressure_mpa: 0.12, width_m: 25, height_m: 15, floors: 1 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_industrial",
    category: "consumer",
    name: "Үйлдвэр",
    shortLabel: "Үй",
    icon: "🏗",
    description: "Үйлдвэрийн цех (технологийн дулаан)",
    defaults: { heatLoad_w: 500_000, requiredPressure_mpa: 0.15, width_m: 60, height_m: 30, floors: 1 },
    formKey: "consumerBuilding",
  },
  {
    key: "consumer_warehouse",
    category: "consumer",
    name: "Агуулах",
    shortLabel: "Аг",
    icon: "📦",
    description: "Хүйтэн / халуун агуулах",
    defaults: { heatLoad_w: 30_000, requiredPressure_mpa: 0.10, width_m: 40, height_m: 25, floors: 1 },
    formKey: "consumerBuilding",
  },

  // ========== CONSUMER EQUIPMENT (ИТП-н элементүүд) ==========
  {
    key: "itp_elevator",
    category: "consumer",
    name: "ИТП — Элеватор",
    shortLabel: "Эл",
    icon: "🛢",
    description: "Элеваторт зангилаа (130/70 → 95/70)",
    defaults: { heatLoad_w: 50_000, requiredPressure_mpa: 0.10 },
    formKey: "consumerEquipment",
  },
  {
    key: "itp_heatex",
    category: "consumer",
    name: "ИТП — Дулаан солилцуур",
    shortLabel: "ДС",
    icon: "▦",
    description: "Ялтсан дулаан солилцуур (ХТС)",
    defaults: { heatLoad_w: 100_000, requiredPressure_mpa: 0.15 },
    formKey: "consumerEquipment",
  },
  {
    key: "itp_mixing",
    category: "consumer",
    name: "ИТП — Холих насос",
    shortLabel: "ХН",
    icon: "⊕",
    description: "Холих насос бүхий зангилаа",
    defaults: { heatLoad_w: 80_000, requiredPressure_mpa: 0.15 },
    formKey: "consumerEquipment",
  },
  {
    key: "underfloor",
    category: "consumer",
    name: "Шалны халаалт",
    shortLabel: "Шл",
    icon: "▭",
    description: "Бага температурын шалны систем (45/35°С)",
    defaults: { heatLoad_w: 8_000, requiredPressure_mpa: 0.05 },
    formKey: "consumerEquipment",
  },

  // ========== VALVES (Арматура) ==========
  {
    key: "valve_gate",
    category: "valve",
    name: "Гацуу хаалт (задвижка)",
    shortLabel: "Гц",
    icon: "▷◁",
    description: "Бүрэн нээх / хаах хаалт",
    defaults: { zeta: 0.15 },
    formKey: "valve",
  },
  {
    key: "valve_ball",
    category: "valve",
    name: "Бөмбөлөг хаалт",
    shortLabel: "Бх",
    icon: "◯",
    description: "Бөмбөлөг механизм бүхий хаалт",
    defaults: { zeta: 0.10 },
    formKey: "valve",
  },
  {
    key: "valve_globe",
    category: "valve",
    name: "Бүрхүүл хаалт (вентиль)",
    shortLabel: "Вн",
    icon: "▽",
    description: "Тохируулагдах урсгалын хаалт",
    defaults: { zeta: 6.0 },
    formKey: "valve",
  },
  {
    key: "valve_check",
    category: "valve",
    name: "Эргэх хаалт (обратный клапан)",
    shortLabel: "Об",
    icon: "▶|",
    description: "Урвуу урсгалаас хамгаалах",
    defaults: { zeta: 2.5 },
    formKey: "valve",
  },
  {
    key: "valve_regulator",
    category: "valve",
    name: "Даралтын регулятор",
    shortLabel: "ДР",
    icon: "▣",
    description: "Даралтыг автомат тохируулах",
    defaults: { zeta: 4.0 },
    formKey: "valve",
  },

  // ========== FITTINGS (Холбоосын хэсэг) ==========
  {
    key: "elbow_90",
    category: "fitting",
    name: "Тохой 90°",
    shortLabel: "└",
    icon: "└",
    description: "90 градус эргэлт",
    defaults: { zeta: 1.0 },
    formKey: "fitting",
  },
  {
    key: "elbow_45",
    category: "fitting",
    name: "Тохой 45°",
    shortLabel: "⌐",
    icon: "⌐",
    description: "45 градус эргэлт",
    defaults: { zeta: 0.5 },
    formKey: "fitting",
  },
  {
    key: "tee",
    category: "fitting",
    name: "Гурвалжин салаалалт (тройник)",
    shortLabel: "T",
    icon: "T",
    description: "Гурван талт салаалалт",
    defaults: { zeta: 1.5 },
    formKey: "fitting",
  },
  {
    key: "reducer",
    category: "fitting",
    name: "Багасгагч (reducer)",
    shortLabel: "><",
    icon: "▷◁",
    description: "Диаметр багасгах хэсэг",
    defaults: { zeta: 0.3 },
    formKey: "fitting",
  },
  {
    key: "compensator_u",
    category: "fitting",
    name: "П-маягийн компенсатор",
    shortLabel: "П",
    icon: "Π",
    description: "П-хэлбэртэй температурын компенсатор",
    defaults: { zeta: 2.0 },
    formKey: "fitting",
  },
  {
    key: "compensator_bellow",
    category: "fitting",
    name: "Сильфон компенсатор",
    shortLabel: "СФ",
    icon: "≋",
    description: "Сильфонт хошуу компенсатор",
    defaults: { zeta: 0.5 },
    formKey: "fitting",
  },

  // ========== CHAMBERS / WELLS (Худаг, камера, лотки) ==========
  {
    key: "chamber",
    category: "chamber",
    name: "Дулааны камер",
    shortLabel: "К",
    icon: "▢",
    description: "Хяналт, тэмдэглэх, салаалах камер",
    formKey: "chamber",
  },
  {
    key: "well_supply",
    category: "chamber",
    name: "Дулааны худаг",
    shortLabel: "ДХ",
    icon: "◉",
    description: "Газар дор нийтийн худаг",
    formKey: "chamber",
  },
  {
    key: "well_drain",
    category: "chamber",
    name: "Ус татах худаг (drainage)",
    shortLabel: "УХ",
    icon: "↓◯",
    description: "Хооронд накопится ус татах",
    formKey: "chamber",
  },
  {
    key: "expansion_tank",
    category: "chamber",
    name: "Тэлэх сав",
    shortLabel: "ТС",
    icon: "▭",
    description: "Бөглөөтэй / нээлттэй тэлэх сав",
    formKey: "chamber",
  },

  // ========== PUMPS ==========
  {
    key: "pump_circ",
    category: "pump",
    name: "Циркуляцийн насос",
    shortLabel: "ЦН",
    icon: "⊗",
    description: "Гол сүлжээний эргэлтийн насос",
    formKey: "pump",
  },
  {
    key: "pump_booster",
    category: "pump",
    name: "Дамжуулагч насос (booster)",
    shortLabel: "БС",
    icon: "⇧",
    description: "Дамжуулах насос станц — даралт нэмэгдүүлэх",
    formKey: "pump",
  },
  {
    key: "pump_makeup",
    category: "pump",
    name: "Нөхөн дүүргэгч насос",
    shortLabel: "НН",
    icon: "⊕",
    description: "Сүлжээний усыг нөхөн дүүргэх насос (make-up pump)",
    formKey: "pump",
  },

  // ========== SENSORS / INSTRUMENTS (Хэмжих хэрэгсэл) — Phase 8.5 ==========
  {
    key: "sensor_pressure",
    category: "sensor",
    name: "Даралтын мэдрэгч (PI)",
    shortLabel: "P",
    icon: "🅿",
    description: "ISA / ГОСТ 21.404 даралт хэмжих хэрэгсэл (pressure indicator)",
    formKey: "fitting",
  },
  {
    key: "sensor_temperature",
    category: "sensor",
    name: "Температурын мэдрэгч (TI)",
    shortLabel: "T",
    icon: "🌡",
    description: "Температур хэмжих хэрэгсэл (temperature indicator)",
    formKey: "fitting",
  },
  {
    key: "sensor_flow",
    category: "sensor",
    name: "Урсгал хэмжигч (FI)",
    shortLabel: "F",
    icon: "F",
    description: "Усны урсгал хэмжих хэрэгсэл (flow indicator)",
    formKey: "fitting",
  },
  {
    key: "sensor_multipoint",
    category: "sensor",
    name: "Олон цэгийн термометр",
    shortLabel: "MT",
    icon: "🌡",
    description: "Олон цэгийн температурын хяналт (multi-point thermometer)",
    formKey: "fitting",
  },
];

export const NODE_BY_KIND = new Map(NODE_KINDS.map((n) => [n.key, n]));

export function getNodeKind(key: string): NodeKindDef | undefined {
  return NODE_BY_KIND.get(key);
}

export const CATEGORIES: { key: NodeCategory; label: string; color: string }[] = [
  { key: "source", label: "Эх үүсвэр", color: "var(--danger)" },
  { key: "consumer", label: "Хэрэглэгч", color: "var(--accent)" },
  { key: "valve", label: "Арматура", color: "var(--warning)" },
  { key: "fitting", label: "Холбоос", color: "var(--fg-muted)" },
  { key: "chamber", label: "Камер/Худаг", color: "var(--success)" },
  { key: "pump", label: "Насос", color: "var(--accent-soft)" },
  // Phase 8.5 — Хэмжих хэрэгсэл (sensors / instruments) for P&ID
  { key: "sensor", label: "Хэмжих хэрэгсэл", color: "var(--bp-blue, #1F5FAA)" },
];

/* -------------------------------------------------------------------------- */
/*  PIPE — circuit type & laying                                               */
/* -------------------------------------------------------------------------- */

export type PipeCircuit = "heating_supply" | "heating_return" | "dhw_supply" | "dhw_recirc" | "cold_water";
export type PipeLaying = "above_ground" | "underground_channelless" | "underground_channel" | "indoor" | "lotok";

export const PIPE_CIRCUITS: { key: PipeCircuit; label: string; color: string; dash?: string }[] = [
  { key: "heating_supply", label: "Халаалт нийлүүлэх (Т1)", color: "#e26b6b" }, // red
  { key: "heating_return", label: "Халаалт буцах (Т2)", color: "#5ba4cf" }, // blue
  { key: "dhw_supply", label: "ХУС — Халуун ус нийлүүлэх (Т3)", color: "#d7a54a" }, // amber
  { key: "dhw_recirc", label: "ХУС — Эргэлт (Т4)", color: "#d7a54a", dash: "6 3" }, // dashed amber
  { key: "cold_water", label: "Хүйтэн ус (В1)", color: "#7eb8da", dash: "2 4" }, // light blue dotted
];

export const PIPE_LAYINGS: { key: PipeLaying; label: string }[] = [
  { key: "above_ground", label: "Газар дээр (агаарт)" },
  { key: "underground_channelless", label: "Газар дор — сувгуй" },
  { key: "underground_channel", label: "Газар дор — суваг дотор" },
  { key: "lotok", label: "Лоток (тагт суваг)" },
  { key: "indoor", label: "Барилгын дотор / зоор" },
];

/* -------------------------------------------------------------------------- */
/*  WORLD SCALE — pixel ↔ meter conversions                                    */
/* -------------------------------------------------------------------------- */

/**
 * 1 meter = 20 SVG pixels at zoom level 1.
 * AutoCAD-style: every coord on the canvas is real-world meters; pixel scaling
 * is purely a viewport concern.
 *
 * Grid step is 1 meter (20px). Major grid every 5 meters.
 */
export const PX_PER_METER = 20;

export function pxToM(px: number): number {
  return px / PX_PER_METER;
}

export function mToPx(m: number): number {
  return m * PX_PER_METER;
}

export function distancePx(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceM(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return pxToM(distancePx(a, b));
}

export function angleDeg(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}
