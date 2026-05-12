/**
 * ИТП / ЦТП connection-scheme library.
 *
 * Compiled from:
 *  - СП 41-101-95 "Проектирование тепловых пунктов" (Прил. 4)
 *  - Politerm Zulu Thermo webhelp (32+ ЦТП schemes, 14+ ИТП schemes)
 *  - Альбом принципиальных схем БТП "Данфосс" v1.5.1
 *  - Ridan / Ridan-Danfoss БТП каталог (DS, DSR, DS-1st, DS-2st, DM)
 *  - АВОК Стандарт-9 ИТП designs
 *
 * Naming conventions:
 *   t1 = supply primary (магистраль подача)        e.g. 130 / 150 °C
 *   t2 = return primary (магистраль обратка)       e.g. 70  °C
 *   t3 = supply secondary (отопление подача)       e.g. 95 / 80 / 45 °C
 *   t4 = return secondary (отопление обратка)      e.g. 70 / 60 / 35 °C
 *   th = ГВС подача                                 e.g. 60 / 65 °C
 *   tc = ХВС cold feed                              e.g. 5  °C
 *   Q  = тепловая нагрузка (kW or Gcal/h)
 *   G  = массовый расход (т/ч or kg/s)
 *   H  = напор (м.в.ст or kPa)
 */

export type ConnectionType = "zavisimaya" | "nezavisimaya";
export type HeatingCircuit =
  | "direct"          // primary = secondary (no mixing)
  | "elevator"        // jet-pump elevator mixing
  | "elevator_with_regulator"
  | "mixing_pump"     // electric mixing pump
  | "heat_exchanger"; // через ХТС (plate)
export type DhwCircuit =
  | "none"
  | "open_4pipe"      // direct draw-off from primary
  | "closed_single_stage_parallel"
  | "closed_single_stage_preswitched"
  | "closed_two_stage_mixed"
  | "closed_two_stage_sequential"
  | "circulation_loop_only";

export type ComponentKind =
  | "elevator"
  | "mixing_pump"
  | "circulation_pump_heating"
  | "circulation_pump_dhw"
  | "booster_pump"
  | "makeup_pump"
  | "heat_exchanger_plate"
  | "expansion_tank_diaphragm"
  | "expansion_tank_open"
  | "valve_gate"
  | "valve_check"
  | "valve_balancing"
  | "valve_safety"
  | "valve_3way_mixing"
  | "valve_2way_control"
  | "throttle_washer"
  | "filter_mesh"
  | "filter_magnetic"
  | "mud_separator"
  | "regulator_temperature"   // РТ (ECL / РТЕ)
  | "regulator_pressure_diff" // РД / РПД
  | "regulator_flow"          // РР
  | "regulator_dhw_temp"      // РТ-ГВС
  | "thermometer"
  | "manometer"
  | "heat_meter"
  | "water_meter"
  | "condensate_tank"
  | "steam_trap"
  | "vapor_separator";

export interface ComponentSpec {
  kind: ComponentKind;
  role: string;               // role within scheme, MN-readable
  count?: number;
  /** Inputs the sizing UI must collect for this component. */
  inputs?: string[];
  /** Output values this component produces (for downstream display). */
  outputs?: string[];
  notes_mn?: string;
}

export interface ItpScheme {
  key: string;
  /** Politerm Zulu scheme number when present (1..32 for ЦТП). */
  zulu_no?: number;
  name_ru: string;
  name_mn: string;
  description_mn: string;
  connection: ConnectionType;
  heating: HeatingCircuit;
  dhw: DhwCircuit;
  source_temp_range_c: [number, number];   // typical t1 supply
  components: ComponentSpec[];
  use_case_mn: string;
  pros_mn: string[];
  cons_mn: string[];
  /** ASCII topology, monospace font, ~70 chars wide. */
  asciiTopology: string;
  references: string[];        // СП §, Альбом стр., Politerm scheme #
}

const COMMON_PROTECTION: ComponentSpec[] = [
  { kind: "valve_gate", role: "isolation", count: 4, inputs: ["DN"] },
  { kind: "filter_mesh", role: "механик хамгаалалт", count: 2, inputs: ["DN", "mesh_um"] },
  { kind: "thermometer", role: "T хяналт", count: 4 },
  { kind: "manometer", role: "P хяналт", count: 4 },
  { kind: "heat_meter", role: "дулааны хэмжүүр", count: 1, inputs: ["Gn", "Qn"] },
];

export const ITP_SCHEMES: ItpScheme[] = [
  // ─── 1 ────────────────────────────────────────────────────────
  {
    key: "scheme_01_zav_elevator",
    zulu_no: 4,
    name_ru: "Зависимая со смесительным элеватором",
    name_mn: "Хамаарал — элеватортой холболт",
    description_mn:
      "Магистралийн өндөр температурын ус (130/70 °C) элеваторын соплоор хучигдан, " +
      "буцах усны хэсгийг өөртөө сорж 95/70 °C-ийн халаалтын усыг бүрдүүлнэ. " +
      "Цахилгаангүй, насосгүй, хямд — Зөвлөлтийн үеэс хойш олон давхар орон сууцны default.",
    connection: "zavisimaya",
    heating: "elevator",
    dhw: "none",
    source_temp_range_c: [130, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "elevator",
        role: "холих зангилаа",
        inputs: [
          "t1_supply_c",     // 130
          "t2_return_c",     // 70
          "t3_blend_c",      // 95
          "Q_heating_kw",
          "delta_p_avail_kpa",
        ],
        outputs: ["nozzle_dn_mm", "throat_dn_mm", "u_mix_ratio", "h_required_m"],
        notes_mn: "u = (t1−t3)/(t3−t4), горловина d3 ≥ √(G²·(1+u)² / Δp), сопло d1 ≈ d3/√(1+u²)",
      },
      { kind: "throttle_washer", role: "илүү даралт хязгаарлалт", count: 1, inputs: ["d_mm"] },
    ],
    use_case_mn:
      "5–17 давхар орон сууц, t1=130–150 °C, элеваторын өмнөх илүү даралт ≥10 м.в.ст. " +
      "Авто-зохицуулалт шаардлагагүй, эзэмшилийн зардал хямд.",
    pros_mn: ["Цахилгаангүй", "Найдвартай", "Хямд", "Засвар бараг үгүй"],
    cons_mn: [
      "Тогтмол u-харьцаа — гадна температурт автоматаар тохирохгүй",
      "Илүү даралт хэрэгтэй (≥10 м)",
      "Шөнийн дулаан бууруулах боломжгүй",
    ],
    asciiTopology: [
      "  t1 ──[GV]─[F]─[T][P]──┐                                    ",
      "                        ▼                                    ",
      "                     ╔══╧══╗  nozzle d1                       ",
      "                     ║ ELE ║─────► t3=95°C ► to radiators    ",
      "                     ║ VAT ║                                  ",
      "                     ╚══╤══╝  throat d3                       ",
      "                        ▲                                    ",
      "  t2 ◄──[GV]─[F]────────┴──── t4=70°C ◄ from radiators       ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.16, Прил.7", "Politerm scheme #4", "АВОК Ст-9"],
  },

  // ─── 2 ────────────────────────────────────────────────────────
  {
    key: "scheme_02_zav_elevator_flowreg",
    zulu_no: 5,
    name_ru: "Зависимая, элеватор + регулятор расхода",
    name_mn: "Хамаарал — элеватор + урсгал зохицуулагч",
    description_mn:
      "Сонгодог элеваторын схем дээр буцах шугаманд РР (регулятор расхода) " +
      "нэмж тавьсан. Магистрал илүү даралттай үед G-г барих зориулалттай.",
    connection: "zavisimaya",
    heating: "elevator_with_regulator",
    dhw: "none",
    source_temp_range_c: [130, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "elevator",
        role: "холих зангилаа",
        inputs: ["t1_supply_c", "t2_return_c", "t3_blend_c", "Q_heating_kw"],
        outputs: ["nozzle_dn_mm", "throat_dn_mm"],
      },
      {
        kind: "regulator_flow",
        role: "G_max хязгаарлал",
        inputs: ["G_max_t_per_h", "DN", "kvs"],
      },
    ],
    use_case_mn:
      "Орон сууцны массив дотор магистралийн даралт хэлбэлзэлтэй, " +
      "тариф шударгын төлөө G-г лимит хийх шаардлагатай ТЭЦ-ийн бүсэд.",
    pros_mn: ["Тарифын дагуу нарийн хэрэглээ", "Magic-stral-ийн ачаалал тэнцвэртэй"],
    cons_mn: ["РР тохируулга шаардлагатай", "Тоосноос болж бөглөрнө"],
    asciiTopology: [
      "  t1 ──[GV]─[F]──┬───► [ELEVATOR] ──► to radiators           ",
      "                 │            ▲                              ",
      "                 │            │  return mix                  ",
      "  t2 ◄──[РР]─[GV]┴────────────┴──◄ from radiators            ",
      "         flow                                                ",
      "         limiter                                             ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.20", "Politerm scheme #5"],
  },

  // ─── 3 ────────────────────────────────────────────────────────
  {
    key: "scheme_03_zav_mixingpump",
    zulu_no: 7,
    name_ru: "Зависимая со смесительным насосом",
    name_mn: "Хамаарал — холих насос",
    description_mn:
      "Элеваторын оронд цахилгаан смесительный насос байрлуулсан. Гадна агаарын " +
      "температураар авто-зохицуулалт хийх боломжтой (РТ + 2-замт хавхлага), " +
      "элеваторын өмнөх 10 м даралт шаардахгүй.",
    connection: "zavisimaya",
    heating: "mixing_pump",
    dhw: "none",
    source_temp_range_c: [110, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "mixing_pump",
        role: "смешение",
        inputs: ["G_t_per_h", "H_m", "stages"],
        outputs: ["motor_kw"],
      },
      {
        kind: "valve_2way_control",
        role: "РТ-ийн биелүүлэгч",
        inputs: ["DN", "kvs", "P_max_bar"],
      },
      {
        kind: "regulator_temperature",
        role: "ECL / РТЕ — t3 авто",
        inputs: ["t3_setpoint_curve", "t_outdoor_sensor"],
      },
      { kind: "valve_check", role: "буцах урсгал хориглох", count: 1 },
    ],
    use_case_mn:
      "Шинэ хороолол, t1 ≤ 130 °C, элеваторт хүрэлцэхүйц илүү даралт байхгүй. " +
      "Шөнийн режимтэй (-3 °C night setback) ухаалаг хэрэглэгч шаардлагатай.",
    pros_mn: [
      "Гадна агаарт автоматаар дасна",
      "Шөнийн дулаан хэмнэлт 8–15 %",
      "Магистралийн даралтаас үл хамаарна",
    ],
    cons_mn: ["Цахилгаан хэрэгтэй", "Насос эвдэрвэл халаалт зогсоно", "Үнэтэй"],
    asciiTopology: [
      "  t1 ──[GV]─[F]──[ECL valve]──┐                              ",
      "                              ▼                              ",
      "         ┌────[ChV]──[NPump]──┴──► t3 ──► radiators          ",
      "         │                                                   ",
      "  t2 ◄──[GV]─[F]──────────────┐──◄ t4 ◄── radiators          ",
      "                              │                              ",
      "                outdoor T ──► [РТ] ──► sets t3 setpoint      ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.17, §3.22", "Альбом Данфосс v1.5.1 БТП-ОВ"],
  },

  // ─── 4 ────────────────────────────────────────────────────────
  {
    key: "scheme_04_zav_direct",
    name_ru: "Зависимая прямая (без подмеса)",
    name_mn: "Хамаарал — шууд (холилтгүй)",
    description_mn:
      "Магистралийн ус радиатор руу шууд орно (t1=t3). Зөвхөн доод температурын " +
      "график 95/70 ажилладаг бүсэд эсвэл ҮТП хоорондын дамжлагад тохиромжтой.",
    connection: "zavisimaya",
    heating: "direct",
    dhw: "none",
    source_temp_range_c: [80, 105],
    components: [
      ...COMMON_PROTECTION,
      { kind: "valve_check", role: "урвуу хориг", count: 1 },
      { kind: "throttle_washer", role: "G-н хязгаар", count: 1, inputs: ["d_mm"] },
      {
        kind: "regulator_pressure_diff",
        role: "Δp тогтворжуулагч",
        inputs: ["delta_p_setpoint_kpa", "DN"],
      },
    ],
    use_case_mn:
      "Хадгалах сан, агуулах, нам халаалттай үйлдвэрийн объектууд. " +
      "Магистрал t1 ≤ 105 °C байх шаардлагатай.",
    pros_mn: ["Хамгийн энгийн", "Бүрэлдэхүүн хэсэг хамгийн цөөн", "Цахилгаангүй"],
    cons_mn: ["Зөвхөн нам температурын графикт", "Ажилласан радиатор тогтоосон t-тэй"],
    asciiTopology: [
      "  t1 ──[GV]─[F]─[РД]─┬────────────► to radiators              ",
      "                     │                                        ",
      "  t2 ◄──[GV]─[F]─[Sh]┴────────────◄ from radiators            ",
      "                  ↑ throttle washer                           ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.14", "Politerm scheme #6"],
  },

  // ─── 5 ────────────────────────────────────────────────────────
  {
    key: "scheme_05_nez_hx_pump",
    zulu_no: 1,
    name_ru: "Независимая через ХТС с циркуляционным насосом",
    name_mn: "Хамааралгүй — ХТС + цирк. насос",
    description_mn:
      "Хоёрдогч контурт хавтгай дулаан солилцуур (ХТС) тусгаарлана. " +
      "Магистралийн усыг радиатор-ын усанд огт холиогүй, өөрийн гэсэн extension tank, " +
      "цирк. насостой. Орчин үеийн default.",
    connection: "nezavisimaya",
    heating: "heat_exchanger",
    dhw: "none",
    source_temp_range_c: [110, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "heat_exchanger_plate",
        role: "1° → 2° дулаан дамжуулалт",
        inputs: [
          "t1_in_c", "t2_out_c",     // primary 130/70
          "t3_in_c", "t4_out_c",     // secondary 95/70
          "Q_heating_kw",
          "fouling_factor",
        ],
        outputs: ["plate_count", "model_code", "delta_p_primary_kpa", "delta_p_secondary_kpa"],
      },
      {
        kind: "circulation_pump_heating",
        role: "хоёрдогч контур цирк.",
        count: 2,
        inputs: ["G_t_per_h", "H_m"],
        notes_mn: "1 ажиллах + 1 нөөц",
      },
      {
        kind: "expansion_tank_diaphragm",
        role: "температурын тэлэлт",
        inputs: ["V_system_l", "p_static_bar"],
        outputs: ["V_tank_l"],
      },
      { kind: "valve_safety", role: "ПК", count: 1, inputs: ["P_open_bar", "DN"] },
      { kind: "makeup_pump", role: "нөхөн дүүргэлт", count: 1, inputs: ["G_l_per_min", "H_m"] },
      {
        kind: "valve_2way_control",
        role: "РТ — t3 хяналт",
        inputs: ["DN", "kvs"],
      },
      {
        kind: "regulator_temperature",
        role: "ECL310 / РТЕ — гадна T-аар",
        inputs: ["t3_curve", "t_outdoor_c"],
      },
    ],
    use_case_mn:
      "Шинэ барилга, өндөр давхар орон сууц, оффис, эмнэлэг. " +
      "Магистралийн дотоод бохирдол өндөр, эсвэл барилга дотор халаалтын ус-тогтворгүй.",
    pros_mn: [
      "Магистралийн даралтаас бүрэн тусгаар",
      "Өөрийн гидро-горим",
      "Урсгал бохирдолгүй",
      "Магистрал тасарвал ороомог хөлдөхгүй",
    ],
    cons_mn: ["ХТС үнэтэй", "Цахилгаангүй ажиллахгүй", "Тэлэлтийн сан + ПК шаардана"],
    asciiTopology: [
      "  t1 ──[GV]─[F]──┐                                            ",
      "         primary │  ╔═══╗                                     ",
      "                 ▼  ║HX ║  ▲                                  ",
      "                 ──►║Pl ║──┘                                  ",
      "                    ║ate║                                     ",
      "  t2 ◄──[GV]─[F]────╝   ╚────  secondary                      ",
      "                       │   │                                   ",
      "    ┌──[CP×2]──────────┘   └──► t3 ──► radiators              ",
      "    │                                                         ",
      "    └──[ExpTank]──[ПК]──────◄ t4 ◄── radiators                ",
      "                                                              ",
      "  ECL310 ◄ outdoor T ──► РТ valve on primary                  ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.18, §3.23", "Politerm scheme #1", "Альбом Данфосс БТП-ОН"],
  },

  // ─── 6 ────────────────────────────────────────────────────────
  {
    key: "scheme_06_nez_hx_treg",
    name_ru: "Независимая, ХТС + автоматический регулятор температуры",
    name_mn: "Хамааралгүй — ХТС + температурын автомат",
    description_mn:
      "Schema 05-той ижил, гэхдээ РТ нь зөвхөн ECL биш, target-driven full PID. " +
      "Гарын авлагын режим (тогтмол t3) болон гадна-температурийн график хооронд шилжих.",
    connection: "nezavisimaya",
    heating: "heat_exchanger",
    dhw: "none",
    source_temp_range_c: [110, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "heat_exchanger_plate",
        role: "1° → 2°",
        inputs: ["t1_in_c", "t2_out_c", "t3_in_c", "t4_out_c", "Q_heating_kw"],
        outputs: ["plate_count", "model_code"],
      },
      { kind: "circulation_pump_heating", role: "цирк.", count: 2, inputs: ["G_t_per_h", "H_m"] },
      { kind: "expansion_tank_diaphragm", role: "тэлэлт", inputs: ["V_system_l"] },
      { kind: "valve_safety", role: "ПК", count: 1 },
      {
        kind: "regulator_temperature",
        role: "PID контроллер (ECL310 / Trovis)",
        inputs: ["t3_setpoint", "schedule", "t_outdoor"],
      },
      {
        kind: "valve_2way_control",
        role: "PID-ийн биелүүлэгч",
        inputs: ["DN", "kvs", "actuator"],
      },
    ],
    use_case_mn:
      "Эмнэлэг, цэцэрлэг, олон-режимтэй (өдөр/шөнө/амралт) обьект. ECL310 weekly scheduler.",
    pros_mn: ["Уян хатан хуваарь", "Уйлдвэрлэлийн шилэн дотуур", "Дистанцын хяналт"],
    cons_mn: ["Тохируулга нарийн", "ECL310 license-тай"],
    asciiTopology: [
      "  Same as scheme_05, but РТ replaced by:                     ",
      "                                                              ",
      "  ┌──ECL310/PID──◄ t3_sensor + t_outdoor + schedule           ",
      "  ▼                                                           ",
      "  [2-way actuator on primary supply] ──► HX ──►               ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.23", "Альбом Данфосс БТП-ОН-А"],
  },

  // ─── 7 ────────────────────────────────────────────────────────
  {
    key: "scheme_07_nez_hx_dhw_parallel",
    zulu_no: 3,
    name_ru: "Независимая ХТС + ГВС параллельная одноступенчатая",
    name_mn: "Хамааралгүй ХТС + ГВС параллел нэг шатлалт",
    description_mn:
      "Халаалт ба ГВС хоёр тус тусдаа ХТС-тэй, магистралд parallel хэлбэрээр " +
      "холбогдоно. Qгвс/Qсо < 0.2 эсвэл > 1 үед СП 41-101-95 зөвлөдөг.",
    connection: "nezavisimaya",
    heating: "heat_exchanger",
    dhw: "closed_single_stage_parallel",
    source_temp_range_c: [110, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "heat_exchanger_plate",
        role: "халаалт ХТС",
        inputs: ["t1", "t2", "t3", "t4", "Q_heating_kw"],
        outputs: ["plate_count_h"],
      },
      {
        kind: "heat_exchanger_plate",
        role: "ГВС ХТС",
        inputs: ["t1", "t2", "th_supply_c", "tc_cold_c", "Q_dhw_kw"],
        outputs: ["plate_count_dhw"],
      },
      { kind: "circulation_pump_heating", role: "халаалт цирк.", count: 2, inputs: ["G", "H"] },
      {
        kind: "circulation_pump_dhw",
        role: "ГВС цирк.",
        count: 2,
        inputs: ["G_l_per_s", "H_m"],
        notes_mn: "Cu/SS зэвэрдэггүй",
      },
      { kind: "expansion_tank_diaphragm", role: "тэлэлт халаалт", count: 1 },
      { kind: "valve_safety", role: "ПК", count: 2 },
      {
        kind: "regulator_dhw_temp",
        role: "ГВС t=60 °C хадгалах",
        inputs: ["th_setpoint_c", "DN"],
      },
      { kind: "regulator_temperature", role: "халаалт ECL", inputs: ["t3_curve"] },
    ],
    use_case_mn:
      "Зочид буудал, оффис, шар сан их хэрэглэдэг объект, эсвэл халаалт-аас " +
      "ГВС-ийн ачаалал маш бага (Qгвс < 0.2·Qсо).",
    pros_mn: [
      "Энгийн логик",
      "Зуны улиралд халаалт унтарсан ч ГВС ажиллана",
      "ГВС-ийн ХТС-ийг тусад нь засварлана",
    ],
    cons_mn: ["Илүү метал", "Магистралаас илүү ус татна (40% доош хэмнэлтгүй)"],
    asciiTopology: [
      "  t1 ──[GV]─┬─►[HX-heat]──[NPump]──► t3 radiators            ",
      "            │                                                 ",
      "            └─►[HX-DHW]──► th=60°C ──► to apartments          ",
      "                  ▲                                           ",
      "  t2 ◄────────────┴── primary return                          ",
      "                                                              ",
      "  Cold tc ──►[HX-DHW secondary] ──► hot th                    ",
      "  Circ ◄──[CPump-DHW]──── circulation loop                   ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.21, Прил.4", "Politerm scheme #3"],
  },

  // ─── 8 ────────────────────────────────────────────────────────
  {
    key: "scheme_08_nez_hx_dhw_2stage_mixed",
    zulu_no: 2,
    name_ru: "Независимая ХТС + ГВС двухступенчатая смешанная",
    name_mn: "Хамааралгүй ХТС + ГВС хоёр шатлалт холимог",
    description_mn:
      "Хамгийн үр ашигтай схем. ГВС-ийн I шатлал халаалтын буцах усаар хүйтэн усыг " +
      "урьдчилан халаана, II шатлал нь магистралийн гарсан ус. Магистралийн ус 40%-аар " +
      "багасна. Qгвс/Qсо ∈ [0.2, 1.0] үед заавал.",
    connection: "nezavisimaya",
    heating: "heat_exchanger",
    dhw: "closed_two_stage_mixed",
    source_temp_range_c: [110, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "heat_exchanger_plate",
        role: "халаалт ХТС",
        inputs: ["t1", "t2", "t3", "t4", "Q_heating_kw"],
        outputs: ["plates"],
      },
      {
        kind: "heat_exchanger_plate",
        role: "ГВС I шат (буцах усанд цуваагаар)",
        inputs: ["t2_return_after_heating_c", "tc_cold_c", "th_intermediate_c", "Q_dhw_stage1_kw"],
      },
      {
        kind: "heat_exchanger_plate",
        role: "ГВС II шат (магистралд параллел)",
        inputs: ["t1", "t2_after_stage2", "th_intermediate_c", "th_final_c", "Q_dhw_stage2_kw"],
      },
      { kind: "circulation_pump_heating", role: "халаалт цирк.", count: 2 },
      { kind: "circulation_pump_dhw", role: "ГВС цирк.", count: 2 },
      { kind: "expansion_tank_diaphragm", role: "тэлэлт", count: 1 },
      { kind: "valve_safety", role: "ПК", count: 2 },
      { kind: "regulator_dhw_temp", role: "II шатын РТ-ГВС", count: 1 },
      { kind: "regulator_temperature", role: "халаалт ECL", count: 1 },
    ],
    use_case_mn:
      "Орон сууцны массив, ГВС-ийн ачаалал тогтвортой. ТЭЦ-ийн магистралийн " +
      "ус-зарцуулалтыг 25–40 % хэмнэх — Москва, Казань стандарт.",
    pros_mn: ["40% магистрал ус хэмнэлт", "Тарифт хямд", "Ачаалал тэгшилнэ"],
    cons_mn: [
      "Тохиргоо нарийн (2 ХТС зэрэгцэх)",
      "ГВС-ийн зөвхөн I шат нь халаалтын буцахаас хамаарна — зун халаалт ажиллахгүй үед II шат бүгдийг нь даана",
      "Илүү метал",
    ],
    asciiTopology: [
      "  t1 ─[GV]─┬─►[HX-heat]─►(secondary heating loop)             ",
      "           │                                                   ",
      "           └─►[HX-DHW-II]──► th=60°C ──┬─► apartments         ",
      "                  ▲                    │                       ",
      "  primary return  │                  [Circ-pump]──────┐       ",
      "  from heat HX ───┴──►[HX-DHW-I]─►preheated──────────┘       ",
      "                          ▲    ▲                              ",
      "  t2 ◄──after stage I ────┘    │                              ",
      "                               │                              ",
      "  Cold tc ────────────────────┘                              ",
    ].join("\n"),
    references: [
      "СП 41-101-95 §3.21, Прил.4",
      "Politerm scheme #2",
      "Ridan Open: 'Двухступенчатая смешанная схема ГВС'",
      "АВОК Стандарт-9",
    ],
  },

  // ─── 9 ────────────────────────────────────────────────────────
  {
    key: "scheme_09_open_dhw_4pipe",
    zulu_no: 33,
    name_ru: "Открытая ГВС с непосредственным водоразбором",
    name_mn: "Нээлттэй ГВС — шууд ус татан",
    description_mn:
      "Магистралийн усыг шууд краанаас өгнө. ХВС-ийн усыг буцах ба өгөх шугамд " +
      "холих хэмжүүрээр t=60 °C-д тохируулна. ОХУ-ын хуучин 4-хоолой систем.",
    connection: "zavisimaya",
    heating: "elevator",
    dhw: "open_4pipe",
    source_temp_range_c: [70, 110],
    components: [
      ...COMMON_PROTECTION,
      { kind: "elevator", role: "халаалтын элеватор", count: 1 },
      {
        kind: "valve_3way_mixing",
        role: "ГВС t-тохируулга",
        inputs: ["DN", "kvs"],
        outputs: ["mix_ratio"],
      },
      {
        kind: "regulator_dhw_temp",
        role: "холих хавхлагын actuator",
        inputs: ["th_setpoint_c"],
      },
      { kind: "valve_check", role: "буцах урсгал хориглох", count: 2 },
      { kind: "water_meter", role: "ГВС хэмжих", count: 1 },
    ],
    use_case_mn:
      "Хуучин Зөвлөлтийн орон сууцны район, магистралийн усны чанар нэлээд цэвэр. " +
      "Шинэ объект руу СП 124.13330-р хориглодог болсон.",
    pros_mn: ["ХТС шаардлагагүй", "Цахилгаан бараг хэрэггүй"],
    cons_mn: [
      "Магистралийн ус DHW-д нийцэхгүй (ОХУ-д 2022 оноос хориглосон)",
      "ИТП-ийн ус бохирдвол арьс өвчин үүсгэнэ",
      "Зөвхөн хуучин барилгад үлдсэн",
    ],
    asciiTopology: [
      "  t1 ──┬──► elevator ──► heating                              ",
      "        │                                                     ",
      "        └──► [3-way mix valve] ──► hot DHW (60°C)            ",
      "                  ▲                                           ",
      "  t2 ◄──── return ─┴────────                                  ",
      "                                                              ",
      "  No HX. Water from t1/t2 mixed directly for DHW use.        ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.24", "Politerm schemes #33-37"],
  },

  // ─── 10 ───────────────────────────────────────────────────────
  {
    key: "scheme_10_closed_dhw_only",
    name_ru: "Закрытая ГВС только ХТС (отопления нет)",
    name_mn: "Зөвхөн ГВС хаалттай ХТС-ээр",
    description_mn:
      "Худалдаа, агуулах, зочид буудал — халаалт цахилгаан/боиле, " +
      "магистрал зөвхөн ГВС-ийг хангадаг.",
    connection: "nezavisimaya",
    heating: "direct",            // not used
    dhw: "closed_single_stage_parallel",
    source_temp_range_c: [80, 130],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "heat_exchanger_plate",
        role: "ГВС ХТС",
        inputs: ["t1", "t2", "th_c", "tc_c", "Q_dhw_kw"],
        outputs: ["plates"],
      },
      { kind: "circulation_pump_dhw", role: "ГВС цирк.", count: 2, inputs: ["G", "H"] },
      { kind: "regulator_dhw_temp", role: "th=60 °C", count: 1 },
      { kind: "valve_safety", role: "ПК-ГВС", count: 1 },
      { kind: "valve_check", role: "ХВС эсрэг", count: 1 },
    ],
    use_case_mn: "Зөвхөн ГВС хэрэглээтэй обьект — зочид буудал, угаалгын газар.",
    pros_mn: ["Энгийн схем", "Багц нэг ХТС"],
    cons_mn: ["Халаалт өөр эх үүсвэрээс"],
    asciiTopology: [
      "  t1 ──[GV]─[F]──►[HX-DHW]──► t2 ◄                            ",
      "                       │                                      ",
      "  Cold tc ──[ChV]──────┘──► hot th=60°C ─► apartments         ",
      "                              ▲                               ",
      "                       [CP-DHW]                               ",
      "                              │                               ",
      "  Circulation loop ───────────┘                               ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.25"],
  },

  // ─── 11 ───────────────────────────────────────────────────────
  {
    key: "scheme_11_dhw_circulation_only",
    name_ru: "Только циркуляционный контур ГВС",
    name_mn: "Зөвхөн ГВС эргэлтийн гогцоо",
    description_mn:
      "Том барилгын ГВС-ийн усыг tap-аас нь t=60 °C-д үлдээх. Цирк. насос буцаах " +
      "шугамаар тогтмол урсгана, өндөр давхрын ус хүйтэрсэнгүй.",
    connection: "nezavisimaya",
    heating: "direct",
    dhw: "circulation_loop_only",
    source_temp_range_c: [60, 75],
    components: [
      { kind: "circulation_pump_dhw", role: "loop pump", count: 2, inputs: ["G_l_per_s", "H_m"] },
      { kind: "valve_balancing", role: "stojakuud-d балансжуулагч", count: 4, inputs: ["kvs"] },
      { kind: "valve_check", role: "anti-backflow", count: 1 },
      { kind: "thermometer", role: "t-loop хяналт", count: 2 },
      { kind: "filter_mesh", role: "механик", count: 1 },
    ],
    use_case_mn:
      "Аль ч их давхар барилгын дотор ГВС-ийн нэмэлт. Үндсэн ХТС нь өөр схемд орно.",
    pros_mn: ["Краанаас тэр даруй халуун ус", "Өрсөлдөөнтэй stoj-уудыг тэгшилнэ"],
    cons_mn: ["Loop алдагдвал хүйтэн ус ирнэ", "Балансжуулалт шаардлагатай"],
    asciiTopology: [
      "  th hot ──┬─► risers ──► taps                                ",
      "           │                                                  ",
      "           └─[CP×2]─[BV×N]◄── circulation return              ",
    ].join("\n"),
    references: ["СП 30.13330", "Альбом Данфосс БТП-Ц"],
  },

  // ─── 12 ───────────────────────────────────────────────────────
  {
    key: "scheme_12_booster_only",
    name_ru: "Подкачивающая насосная станция (booster)",
    name_mn: "Даралт өсгөгч насос станц",
    description_mn:
      "Тусгаарлагдсан хороололд магистралын даралт хүрэлцэхгүй үед өсгөгч насос. " +
      "Halааlт болон ГВС-ийн өмнө байрлуулна.",
    connection: "zavisimaya",
    heating: "direct",
    dhw: "none",
    source_temp_range_c: [70, 130],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "booster_pump",
        role: "Δp нэмэгдүүлэх",
        count: 2,
        inputs: ["G_t_per_h", "H_added_m", "VFD"],
      },
      { kind: "valve_check", role: "анти-удар", count: 2 },
      { kind: "regulator_pressure_diff", role: "Δp setpoint", count: 1 },
      { kind: "expansion_tank_diaphragm", role: "усны цохилт сулруулагч", count: 1 },
    ],
    use_case_mn:
      "Дов толгод, хол зайтай хороолол, ҮТП хийх боломжгүй жижиг үсэрхэй ИТП-ийн өмнө.",
    pros_mn: ["Хямд", "VFD-аар auto-balanced"],
    cons_mn: ["Цахилгаан хэрэгтэй", "Зөвхөн даралт өсгөнө, t-д үл нөлөөлнө"],
    asciiTopology: [
      "  t1 ──[GV]─[F]──►[BoostPump×2 with VFD]──► to downstream ITP ",
      "                       ▲                                      ",
      "                       │  Δp sensor ──► VFD                   ",
      "  t2 ◄────[GV]─────────┴──── return                           ",
    ].join("\n"),
    references: ["СП 41-101-95 §4", "Wilo/Grundfos booster catalog"],
  },

  // ─── 13 ───────────────────────────────────────────────────────
  {
    key: "scheme_13_ctp_2stage_with_premix",
    name_ru: "ЦТП crossover: 2-ст. ГВС + смесительный насос отопления",
    name_mn: "ЦТП — хоёр шатлалт ГВС + холих насостой халаалт",
    description_mn:
      "Бүс хорооллын төв ИТП (ЦТП): магистрал нэг удаа орно, дотроо ХТС-халаалт + " +
      "хоёр шатлалт ГВС бүтэцтэй, гарч байгаа хоёрдогч контур олон ИТП-руу хуваагдана.",
    connection: "nezavisimaya",
    heating: "mixing_pump",
    dhw: "closed_two_stage_mixed",
    source_temp_range_c: [130, 150],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "heat_exchanger_plate",
        role: "халаалт ХТС (том)",
        inputs: ["t1", "t2", "t3", "t4", "Q_heating_kw"],
        outputs: ["plates"],
      },
      { kind: "heat_exchanger_plate", role: "ГВС I шат", inputs: ["Q_dhw_st1_kw"] },
      { kind: "heat_exchanger_plate", role: "ГВС II шат", inputs: ["Q_dhw_st2_kw"] },
      { kind: "mixing_pump", role: "хоёрдогч контур", count: 3, inputs: ["G", "H"], notes_mn: "2+1 нөөц" },
      { kind: "circulation_pump_dhw", role: "район loop", count: 3 },
      { kind: "expansion_tank_diaphragm", role: "том тэлэлт", count: 1, inputs: ["V_l"] },
      { kind: "makeup_pump", role: "auto refill", count: 2 },
      { kind: "regulator_temperature", role: "ECL310 (heat)", count: 1 },
      { kind: "regulator_dhw_temp", role: "ECL310 (DHW)", count: 1 },
      { kind: "regulator_pressure_diff", role: "secondary loop Δp", count: 1 },
    ],
    use_case_mn:
      "1500–10000 кВт, бүс хорооллыг үйлчлэх төв пункт. Хорооллын олон ИТП-руу " +
      "тусдаа хоёрдогч магистраль гаргана.",
    pros_mn: [
      "Магистралийн ус 40% хэмнэлт",
      "Хороолол доторх ИТП хямдрана (зөвхөн жижиг тарилгын зангилаа)",
      "Олон режим — daily / weekly / holiday",
    ],
    cons_mn: ["Анхны хөрөнгө оруулалт өндөр", "Үйл ажиллагааны тусгай мэргэжилтэн"],
    asciiTopology: [
      "  t1 ─[GV]─┬───►[HX-heat-XL]──┬─► secondary loop ──► sub-ITPs ",
      "           │                  │                                ",
      "           ├───►[HX-DHW-II]   │     [MixPump×3]                ",
      "           │       ▲          │          │                     ",
      "  return ──┴───►[HX-DHW-I]    │          ▼                     ",
      "                                          radiators            ",
      "  Cold tc ──►stage I ──►stage II ──► hot 60°C ──► loop ──┐     ",
      "  ECL310 (heat) + ECL310 (DHW) + Δp                     │     ",
      "  [CP-DHW×3] ◄──────────────── circ return ─────────────┘     ",
    ].join("\n"),
    references: ["СП 41-101-95 §1.4", "Politerm ЦТП schemes #1-9"],
  },

  // ─── 14 ───────────────────────────────────────────────────────
  {
    key: "scheme_14_industrial_steam",
    name_ru: "Промышленная: пар + конденсатоотведение",
    name_mn: "Үйлдвэрийн: уур + конденсат буцаах",
    description_mn:
      "Үйлдвэрийн обьектод магистралаас уур (110–180 °C, 6–10 атм) ирнэ. ХТС-ээр " +
      "тусгаарлаж, конденсатыг конденсат сан + конденсат-насосоор магистрал руу буцаана.",
    connection: "nezavisimaya",
    heating: "heat_exchanger",
    dhw: "closed_single_stage_parallel",
    source_temp_range_c: [120, 180],
    components: [
      ...COMMON_PROTECTION,
      {
        kind: "vapor_separator",
        role: "уурын тусгаарлагч",
        inputs: ["P_steam_bar", "G_steam_kg_per_h"],
      },
      {
        kind: "heat_exchanger_plate",
        role: "уур → ус ХТС",
        inputs: ["P_steam_bar", "t_steam_c", "t3", "t4", "Q_kw"],
        outputs: ["surface_m2"],
      },
      {
        kind: "steam_trap",
        role: "конденсатын тороо",
        count: 2,
        inputs: ["model", "P_max_bar"],
      },
      { kind: "condensate_tank", role: "конденсат сан", inputs: ["V_l", "P_atm"] },
      { kind: "circulation_pump_heating", role: "конденсат буцаагч", count: 2, inputs: ["G", "H"] },
      { kind: "valve_safety", role: "ПК уур", count: 1 },
      { kind: "regulator_pressure_diff", role: "уурын Δp", count: 1 },
    ],
    use_case_mn:
      "Цайны үйлдвэр, мах боловсруулах, авто-цех. Уурын магистраль зөвхөн томоохон " +
      "уурын зуухтай хорооллод үлдсэн, орон сууцанд хэрэглэхгүй.",
    pros_mn: [
      "Их хэмжээний дулаан нэг шугамаар",
      "Нягт удирдлага P, G",
      "Технологийн уур хэрэгцээтэй обьектод",
    ],
    cons_mn: ["Конденсат алдагдвал магистралд алдагдал", "Тусгай мэргэжил, эрсдэлтэй"],
    asciiTopology: [
      "  steam ──[VapSep]─[GV]─►[HX-steam]──► water side             ",
      "                            │                                 ",
      "                            ▼                                 ",
      "                       [SteamTrap]                            ",
      "                            │                                 ",
      "                       [Condensate Tank]                      ",
      "                            │                                 ",
      "  return ◄──[CondPump×2]────┘                                 ",
    ].join("\n"),
    references: ["СП 41-101-95 §3.27", "ПБ 10-573 (Котлонадзор)"],
  },

  // ─── 15 ───────────────────────────────────────────────────────
  {
    key: "scheme_15_floor_heating_lowtemp",
    name_ru: "Тёплый пол через миксер (низкотемпературный 45/35)",
    name_mn: "Шалны халаалт — миксераар (нам t° 45/35)",
    description_mn:
      "Радиатор халаалтаас (95/70) дараа нь миксер (3-замт хавхлага + thermostat) " +
      "ашиглан 45/35 °C-руу буулгана. Ил тоосгон шалны loop, манифольд (коллектор), " +
      "actuator-аар өрөө бүрийн t-г тус тусдаа хянана.",
    connection: "nezavisimaya",
    heating: "mixing_pump",
    dhw: "none",
    source_temp_range_c: [70, 95],
    components: [
      {
        kind: "valve_3way_mixing",
        role: "холих 3-замт",
        inputs: ["DN", "kvs", "actuator_type"],
        outputs: ["mix_ratio"],
      },
      {
        kind: "mixing_pump",
        role: "шалны loop",
        count: 1,
        inputs: ["G_t_per_h", "H_m"],
        notes_mn: "loop урт 80–100 м",
      },
      {
        kind: "regulator_temperature",
        role: "t_supply=45 °C хяналт",
        inputs: ["t_setpoint", "t_outdoor_optional"],
      },
      { kind: "valve_safety", role: "хязгаарлал t-max=55 °C", count: 1 },
      { kind: "thermometer", role: "supply + return", count: 2 },
      { kind: "valve_balancing", role: "loop тус бүрд", count: 4, inputs: ["kvs"] },
      { kind: "valve_check", role: "анти-эргэлт", count: 1 },
    ],
    use_case_mn:
      "Орчин үеийн орон сууцны угаалгын өрөө, гал тогоо, premium хороолол. " +
      "Ширмэн радиатортой хослуулж, hybrid-аар ажиллана.",
    pros_mn: ["Тав тух дээд", "Дулаан нам үүсгэж энерги хэмнэлт", "Тоос үлдэгдэл багатай"],
    cons_mn: [
      "Шалны материал тусгай (4 cm screed + insulation)",
      "Inertia — өглөө удаан халдаг",
      "Барилгын явцад л суулгана",
    ],
    asciiTopology: [
      "  Hot supply 80°C ──┐                                          ",
      "                     ▼                                         ",
      "                 [3-way mix]──► 45°C ──► [Pump] ──► manifold   ",
      "                     ▲                              │          ",
      "  Cool return 35°C ──┴────────────────────◄─────────┘          ",
      "                                                                ",
      "  manifold ─── loop1 ─── loop2 ─── loop3 ─── loopN              ",
      "                each loop has BV + actuator per room           ",
    ].join("\n"),
    references: ["СП 60.13330", "Uponor / Rehau / KAN handbook"],
  },
];

/** Lookup by key. */
export function getItpScheme(key: string): ItpScheme | undefined {
  return ITP_SCHEMES.find((s) => s.key === key);
}

/** Filter helper: filter by use-case features. */
export function filterItpSchemes(opts: {
  connection?: ConnectionType;
  heating?: HeatingCircuit;
  dhw?: DhwCircuit;
  t1_c?: number;
}): ItpScheme[] {
  return ITP_SCHEMES.filter((s) => {
    if (opts.connection && s.connection !== opts.connection) return false;
    if (opts.heating && s.heating !== opts.heating) return false;
    if (opts.dhw && s.dhw !== opts.dhw) return false;
    if (opts.t1_c != null) {
      const [lo, hi] = s.source_temp_range_c;
      if (opts.t1_c < lo || opts.t1_c > hi) return false;
    }
    return true;
  });
}

/** All distinct component kinds, useful for SVG icon registry. */
export function listComponentKinds(): ComponentKind[] {
  const set = new Set<ComponentKind>();
  for (const s of ITP_SCHEMES) for (const c of s.components) set.add(c.kind);
  return [...set].sort();
}
