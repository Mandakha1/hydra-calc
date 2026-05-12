/**
 * Pre-built scheme templates — based on **real Ulaanbaatar district heating data**
 * verified from World Bank, EBRD, IRENA, NewClimate, energy.gov.mn sources.
 *
 * Real УБ numbers used:
 *  - ТЭЦ-3: 585 Гкал/ч (1968) — Small Ring feed
 *  - ТЭЦ-4: 1373 Гкал/ч (1983) — Big Ring feed, 2×Φ1000 trunk
 *  - Амгалан ДС: 237+100 Гкал/ч (2014/2022) — БЗД, Улиастай хороолол
 *  - Total UB system: 3785 Гкал/ч generation, 370 km magistral, 17-19% loss
 *  - Temperature graph: 130/70°C (legacy 150/70 design only)
 *  - Building loads at -32°C: 9-storey panelka 0.55-0.68 МВт, school 0.55-0.65 МВт,
 *    kindergarten 0.20-0.22 МВт, hospital 0.22-0.50 МВт, 4-5★ hotel 2.7-3.2 МВт
 */
import type { HydraulicState, SchemeNode, SchemePipe } from "./hydraulicTypes";
import { PX_PER_METER } from "./nodeCatalog";

const M = (m: number) => Math.round(m * PX_PER_METER);

export interface SchemeTemplate {
  key: string;
  name: string;
  description: string;
  category: "small" | "medium" | "large" | "specialty";
  scope: string;
  source?: string;
  build(): HydraulicState;
}

/* ---------- helpers ---------- */
function building(
  id: string,
  label: string,
  kind: string,
  x_m: number,
  y_m: number,
  width_m: number,
  depth_m: number,
  floors: number,
  heatLoad_kw: number,
): SchemeNode {
  return {
    id,
    kind,
    label,
    x: M(x_m),
    y: M(y_m),
    width_m,
    height_m: depth_m,
    floors,
    floorHeight_m: 3.0,
    buildingHeight_m: floors * 3,
    floor_area_m2: width_m * depth_m,
    footprintArea_m2: width_m * depth_m,
    volume_m3: width_m * depth_m * floors * 3,
    footprint: [
      { x: M(x_m - width_m / 2), y: M(y_m - depth_m / 2) },
      { x: M(x_m + width_m / 2), y: M(y_m - depth_m / 2) },
      { x: M(x_m + width_m / 2), y: M(y_m + depth_m / 2) },
      { x: M(x_m - width_m / 2), y: M(y_m + depth_m / 2) },
    ],
    heatLoad_w: heatLoad_kw * 1000,
    requiredPressure_mpa: 0.15,
    specificLoad_w_per_m3: Math.round(
      (heatLoad_kw * 1000) / (width_m * depth_m * floors * 3),
    ),
  };
}

function source(
  id: string,
  label: string,
  kind: string,
  x_m: number,
  y_m: number,
): SchemeNode {
  return { id, kind, label, x: M(x_m), y: M(y_m) };
}

function pipe(
  id: string,
  fromId: string,
  toId: string,
  dn: number,
  length_m: number,
  circuit: SchemePipe["circuit"] = "heating_supply",
  insulationThickness_mm = 50,
): SchemePipe {
  return {
    id,
    fromNodeId: fromId,
    toNodeId: toId,
    materialKey: "preinsulated",
    dn,
    length_m,
    circuit,
    laying: "underground_channelless",
    burialDepth_m: 1.0,
    insulationKey: "pur_pi",
    insulationThickness_mm,
  };
}

/* ============================================================ */
/*  TEMPLATE 1: УБ ТЭЦ-4 → 16-р хороолол (real radial)          */
/* ============================================================ */
function tec4_district16(): HydraulicState {
  // Source: ТЭЦ-4 → 2×Φ1000 trunk → CH-1 junction → 2×Φ700 to ЦТП-16A → distribution
  // 8×9-storey + 2 schools + 3 kindergartens; total ≈ 6.6 МВт
  const nodes: SchemeNode[] = [
    source("tec4", "ТЭЦ-4 (1373 Гкал/ц)", "source_tec", 0, 80),
    source("ch1", "Магистраль зангилаа CH-1", "junction", 90, 80),
    source("ctp16", "ЦТП-16А", "source_substation", 150, 80),
    // Distribution backbone
    source("j1", "Зангилаа №1", "junction", 195, 50),
    source("j2", "Зангилаа №2", "junction", 195, 110),
    // 8 9-storey panelkas
    building("p1", "16-р хороолол №1 (9 эт)", "consumer_apartment", 230, 25, 36, 14, 9, 600),
    building("p2", "16-р хороолол №2 (9 эт)", "consumer_apartment", 230, 50, 36, 14, 9, 600),
    building("p3", "16-р хороолол №3 (9 эт)", "consumer_apartment", 280, 25, 36, 14, 9, 600),
    building("p4", "16-р хороолол №4 (9 эт)", "consumer_apartment", 280, 50, 36, 14, 9, 600),
    building("p5", "16-р хороолол №5 (9 эт)", "consumer_apartment", 230, 110, 36, 14, 9, 600),
    building("p6", "16-р хороолол №6 (9 эт)", "consumer_apartment", 230, 135, 36, 14, 9, 600),
    building("p7", "16-р хороолол №7 (9 эт)", "consumer_apartment", 280, 110, 36, 14, 9, 600),
    building("p8", "16-р хороолол №8 (9 эт)", "consumer_apartment", 280, 135, 36, 14, 9, 600),
    // Schools + kindergartens
    building("sch1", "65-р сургууль", "consumer_school", 340, 40, 60, 24, 4, 600),
    building("sch2", "16-р хор. дунд сургууль", "consumer_school", 340, 120, 60, 24, 4, 600),
    building("kg1", "Цэцэрлэг 117", "consumer_school", 340, 80, 36, 18, 2, 200),
    building("kg2", "Цэцэрлэг 118", "consumer_school", 195, 0, 36, 18, 2, 200),
    building("kg3", "Цэцэрлэг 119", "consumer_school", 195, 165, 36, 18, 2, 200),
  ];
  const pipes: SchemePipe[] = [
    pipe("m1", "tec4", "ch1", 1000, 8200, "heating_supply", 100),
    pipe("m2", "ch1", "ctp16", 700, 1300, "heating_supply", 80),
    pipe("d1", "ctp16", "j1", 400, 30, "heating_supply"),
    pipe("d2", "ctp16", "j2", 400, 30, "heating_supply"),
    // Branches to apartments
    pipe("b1", "j1", "p1", 200, 35),
    pipe("b2", "p1", "p3", 150, 50),
    pipe("b3", "p3", "p4", 100, 25),
    pipe("b4", "p1", "p2", 100, 25),
    pipe("b5", "j2", "p5", 200, 30),
    pipe("b6", "p5", "p7", 150, 50),
    pipe("b7", "p7", "p8", 100, 25),
    pipe("b8", "p5", "p6", 100, 25),
    // Schools / kg
    pipe("s1", "p3", "sch1", 200, 60),
    pipe("s2", "p7", "sch2", 200, 60),
    pipe("s3", "p4", "kg1", 150, 50),
    pipe("s4", "j1", "kg2", 150, 50),
    pipe("s5", "j2", "kg3", 150, 55),
  ];
  return {
    nodes,
    pipes,
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "130_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.95,
    },
  };
}

/* ============================================================ */
/*  TEMPLATE 2: УБ ТЭЦ-3 → Small Ring (looped network)         */
/* ============================================================ */
function tec3_smallRing(): HydraulicState {
  // ТЭЦ-3 → outbound 2×Φ700 → Small Ring loop Φ500 with 4 ЦТП corners
  // Total ring load ~24 МВт mixing hotels/offices/ministries
  const nodes: SchemeNode[] = [
    source("tec3", "ТЭЦ-3 (585 Гкал/ц)", "source_tec", 0, 100),
    source("n1", "Магистраль ороолт N1", "junction", 65, 100),
    // 4 ЦТП corners of small ring
    source("ctpA", "ЦТП-A (Сүхбаатар)", "source_substation", 130, 50),
    source("ctpB", "ЦТП-B (Чингэлтэй)", "source_substation", 200, 100),
    source("ctpC", "ЦТП-C (Хан-Уул)", "source_substation", 130, 150),
    source("ctpD", "ЦТП-D (Баянзүрх)", "source_substation", 65, 150),
    // Each ЦТП feeds heavy loads (commercial center)
    building("hotel1", "Туушин зочид буудал", "consumer_office", 165, 30, 50, 35, 22, 2900),
    building("office1", "Засгийн газрын III байр", "consumer_office", 240, 80, 60, 40, 7, 1100),
    building("mall", "Шангри-Ла Mall", "consumer_retail", 240, 120, 80, 60, 6, 3500),
    building("apt1", "13-р хороолол ОС", "consumer_apartment", 165, 170, 36, 14, 12, 600),
    building("apt2", "11-р хороолол ОС", "consumer_apartment", 95, 170, 36, 14, 12, 600),
    building("hospital", "Улсын III эмнэлэг", "consumer_hospital", 30, 170, 60, 40, 7, 1500),
    building("school", "1-р дунд сургууль", "consumer_school", 30, 30, 50, 24, 4, 600),
  ];
  const pipes: SchemePipe[] = [
    // ТЭЦ outbound
    pipe("m1", "tec3", "n1", 700, 1300, "heating_supply", 80),
    // Looped ring (CRUCIAL — Hardy-Cross)
    pipe("r1", "n1", "ctpA", 500, 1100, "heating_supply", 80),
    pipe("r2", "ctpA", "ctpB", 500, 1050, "heating_supply", 80),
    pipe("r3", "ctpB", "ctpC", 500, 1050, "heating_supply", 80),
    pipe("r4", "ctpC", "ctpD", 500, 1050, "heating_supply", 80),
    pipe("r5", "ctpD", "n1", 500, 1050, "heating_supply", 80), // closes loop
    // Branches
    pipe("b1", "ctpA", "hotel1", 200, 50),
    pipe("b2", "ctpA", "school", 150, 60),
    pipe("b3", "ctpB", "office1", 250, 50),
    pipe("b4", "ctpC", "mall", 300, 50),
    pipe("b5", "ctpC", "apt1", 200, 50),
    pipe("b6", "ctpD", "apt2", 200, 40),
    pipe("b7", "ctpD", "hospital", 250, 50),
  ];
  return {
    nodes,
    pipes,
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "130_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.85,
    },
  };
}

/* ============================================================ */
/*  TEMPLATE 3: Амгалан ДС → БЗД шинэ хороолол                  */
/* ============================================================ */
function amgalan_bzd(): HydraulicState {
  // Амгалан 116×3 МВт expansion → БЗД greenfield: 24×12-storey + 1 school + 2 kg
  // Total ~15.4 МВт
  const nodes: SchemeNode[] = [
    source("amgalan", "Амгалан ДС (337 Гкал/ц)", "source_tec", 0, 60),
    source("ctpBzd", "ЦТП-БЗД-Н", "source_substation", 230, 60),
    // 6 spurs feeding 4 buildings each (24 total)
    source("br1", "Салаа №1", "junction", 270, 30),
    source("br2", "Салаа №2", "junction", 320, 30),
    source("br3", "Салаа №3", "junction", 370, 30),
    source("br4", "Салаа №4", "junction", 270, 90),
    source("br5", "Салаа №5", "junction", 320, 90),
    source("br6", "Салаа №6", "junction", 370, 90),
    // 24 12-storey monolith blocks (4 per spur)
    ...range(6).flatMap((s) =>
      range(4).map((b) =>
        building(
          `b${s}_${b}`,
          `Блок ${s + 1}.${b + 1}`,
          "consumer_apartment",
          270 + s * 25,
          5 + (b * 8) + (s < 3 ? 0 : 60),
          24,
          16,
          12,
          600,
        ),
      ),
    ),
    // Public
    building("school", "32-р сургууль", "consumer_school", 230, 110, 60, 28, 4, 700),
    building("kg1", "Цэцэрлэг A", "consumer_school", 200, 25, 36, 18, 2, 200),
    building("kg2", "Цэцэрлэг B", "consumer_school", 200, 95, 36, 18, 2, 200),
  ];
  const pipes: SchemePipe[] = [
    pipe("m1", "amgalan", "ctpBzd", 800, 4600, "heating_supply", 100),
    pipe("d1", "ctpBzd", "br1", 250, 50),
    pipe("d2", "ctpBzd", "br4", 250, 50),
    pipe("d3", "br1", "br2", 250, 50),
    pipe("d4", "br2", "br3", 250, 50),
    pipe("d5", "br4", "br5", 250, 50),
    pipe("d6", "br5", "br6", 250, 50),
    // 4 buildings per spur
    ...range(6).flatMap((s) =>
      range(4).map((b) =>
        pipe(`bp${s}_${b}`, `br${s + 1}`, `b${s}_${b}`, 100, 30),
      ),
    ),
    pipe("sp1", "ctpBzd", "school", 200, 60),
    pipe("sp2", "br1", "kg1", 100, 30),
    pipe("sp3", "br4", "kg2", 100, 30),
  ];
  return {
    nodes,
    pipes,
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "130_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.7,
    },
  };
}

/* ============================================================ */
/*  TEMPLATE 4: Хороолол local boiler → 3 ЦТП → 15 buildings    */
/* ============================================================ */
function district_boiler_15(): HydraulicState {
  const nodes: SchemeNode[] = [
    source("kotel", "Локал котельная (8 МВт)", "source_boiler", 0, 50),
    source("ctp1", "ЦТП-1", "source_substation", 60, 25),
    source("ctp2", "ЦТП-2", "source_substation", 60, 50),
    source("ctp3", "ЦТП-3", "source_substation", 60, 75),
    // 5 buildings per ЦТП
    ...range(3).flatMap((c) =>
      range(5).map((b) => {
        const isSchool = b === 3;
        const isKg = b === 4;
        const x = 90 + b * 25;
        const y = 25 + c * 25 + (b % 2) * 8;
        if (isSchool)
          return building(
            `c${c + 1}_sch`,
            `${c + 1}-р хор. сургууль`,
            "consumer_school",
            x,
            y,
            45,
            22,
            3,
            550,
          );
        if (isKg)
          return building(
            `c${c + 1}_kg`,
            `${c + 1}-р хор. цэцэрлэг`,
            "consumer_school",
            x,
            y,
            30,
            18,
            2,
            200,
          );
        return building(
          `c${c + 1}_${b + 1}`,
          `ОС ${c + 1}.${b + 1}`,
          "consumer_apartment",
          x,
          y,
          30,
          14,
          9,
          550,
        );
      }),
    ),
  ];
  const pipes: SchemePipe[] = [
    pipe("m1", "kotel", "ctp1", 250, 600, "heating_supply", 50),
    pipe("m2", "ctp1", "ctp2", 250, 250, "heating_supply", 50),
    pipe("m3", "ctp2", "ctp3", 200, 250, "heating_supply", 50),
    ...range(3).flatMap((c) =>
      range(5).map((b) => {
        const id = b === 3 ? `c${c + 1}_sch` : b === 4 ? `c${c + 1}_kg` : `c${c + 1}_${b + 1}`;
        return pipe(`pipe_c${c}_${b}`, `ctp${c + 1}`, id, 100, 40 + b * 8);
      }),
    ),
  ];
  return {
    nodes,
    pipes,
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "115_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.6,
    },
  };
}

/* ============================================================ */
/*  TEMPLATE 5: Эрдэнэт ДЦС town network                        */
/* ============================================================ */
function erdenet_town(): HydraulicState {
  const nodes: SchemeNode[] = [
    source("dts", "Эрдэнэт ДЦС (120 Гкал/ц)", "source_tec", 0, 100),
    source("jt", "Хотын зангилаа", "junction", 175, 100),
    // North residential branch
    source("ctpN1", "Хойд ЦТП-1", "source_substation", 220, 50),
    source("ctpN2", "Хойд ЦТП-2", "source_substation", 280, 50),
    source("ctpN3", "Хойд ЦТП-3", "source_substation", 340, 50),
    // South industrial branch
    source("ctpS1", "Үйлдвэр ЦТП-1", "source_substation", 220, 150),
    source("ctpS2", "Үйлдвэр ЦТП-2", "source_substation", 280, 150),
    // Northern apartments
    building("n_apt1", "Эрдэнэт хороолол A", "consumer_apartment", 250, 25, 60, 16, 9, 700),
    building("n_apt2", "Эрдэнэт хороолол Б", "consumer_apartment", 310, 25, 60, 16, 9, 700),
    building("n_apt3", "Эрдэнэт хороолол В", "consumer_apartment", 370, 25, 60, 16, 9, 700),
    building("n_school", "Эрдэнэт сургууль", "consumer_school", 305, 75, 60, 24, 4, 600),
    // Industrial
    building("ind1", "Эрдэнэт уулын баяжуулах", "consumer_industrial", 250, 175, 80, 40, 1, 12000),
    building("ind2", "Зэс-молибденийн цех", "consumer_industrial", 310, 175, 80, 40, 1, 8000),
    building("hospital", "Эрдэнэт эмнэлэг", "consumer_hospital", 250, 105, 50, 30, 5, 800),
  ];
  const pipes: SchemePipe[] = [
    pipe("m1", "dts", "jt", 500, 3500, "heating_supply", 80),
    // North branch
    pipe("n1", "jt", "ctpN1", 400, 80, "heating_supply", 80),
    pipe("n2", "ctpN1", "ctpN2", 300, 60, "heating_supply", 80),
    pipe("n3", "ctpN2", "ctpN3", 250, 60, "heating_supply", 80),
    pipe("n_b1", "ctpN1", "n_apt1", 150, 30),
    pipe("n_b2", "ctpN2", "n_apt2", 150, 30),
    pipe("n_b3", "ctpN3", "n_apt3", 150, 30),
    pipe("n_b4", "ctpN2", "n_school", 200, 30),
    pipe("n_b5", "ctpN1", "hospital", 150, 60),
    // South branch
    pipe("s1", "jt", "ctpS1", 400, 80, "heating_supply", 80),
    pipe("s2", "ctpS1", "ctpS2", 400, 60, "heating_supply", 80),
    pipe("s_b1", "ctpS1", "ind1", 300, 30),
    pipe("s_b2", "ctpS2", "ind2", 300, 30),
  ];
  return {
    nodes,
    pipes,
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "130_70",
      city: "Эрдэнэт",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.8,
    },
  };
}

/* ============================================================ */
/*  TEMPLATE 6: Жижиг хороолол (apartment only — for testing)   */
/* ============================================================ */
function smallNeighborhood(): HydraulicState {
  const nodes: SchemeNode[] = [
    source("kotel", "Локал котельная", "source_boiler", 5, 30),
    building("os1", "Орон сууц-1", "consumer_apartment", 35, 15, 25, 12, 5, 350),
    building("os2", "Орон сууц-2", "consumer_apartment", 35, 35, 25, 12, 5, 350),
    building("os3", "Орон сууц-3", "consumer_apartment", 35, 55, 25, 12, 5, 350),
    building("kg", "Цэцэрлэг", "consumer_school", 70, 25, 30, 18, 2, 200),
    building("del", "Дэлгүүр", "consumer_retail", 70, 50, 20, 14, 1, 35),
  ];
  const pipes: SchemePipe[] = [
    pipe("p1", "kotel", "os1", 100, 30),
    pipe("p2", "os1", "os2", 80, 25),
    pipe("p3", "os2", "os3", 65, 25),
    pipe("p4", "os1", "kg", 80, 35),
    pipe("p5", "kg", "del", 50, 28),
  ];
  return {
    nodes,
    pipes,
    schemaVersion: 5,
    settings: {
      networkType: "two_pipe_closed",
      temperatureScheduleKey: "95_70",
      city: "Улаанбаатар",
      primaryMaterialCategory: "steel",
      localLossesFraction: 0.3,
      sourcePressure_mpa: 0.45,
    },
  };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

export const SCHEME_TEMPLATES: SchemeTemplate[] = [
  {
    key: "tec4_district16",
    name: "ТЭЦ-4 → 16-р хороолол",
    description:
      "ТЭЦ-4 (1373 Гкал/ц) — 2×Φ1000 магистраль 8.2 км → ЦТП-16А → 8 9-давхар орон сууц + 2 сургууль + 3 цэцэрлэг. Bодит УБ-н Big Ring зүүн салаа.",
    category: "large",
    scope: "6.6 МВт · 18 зангилаа · 17 хоолой",
    source: "World Bank P170676 + IRENA 2022",
    build: tec4_district16,
  },
  {
    key: "tec3_smallRing",
    name: "ТЭЦ-3 → Small Ring (битүү)",
    description:
      "ТЭЦ-3 (585 Гкал/ц) — Φ700 outbound + Small Ring loop Φ500 4.2 км. 4 ЦТП - Сүхбаатар/Чингэлтэй/Хан-Уул/БЗД. Туушин зочид буудал, ШЛ Mall, Засгийн газар. Hardy-Cross loop solver-т зориулсан.",
    category: "large",
    scope: "10.4 МВт · 13 зангилаа · 12 хоолой · LOOP",
    source: "World Bank P170676 SEP",
    build: tec3_smallRing,
  },
  {
    key: "amgalan_bzd",
    name: "Амгалан ДС → БЗД шинэ хороолол",
    description:
      "Амгалан 337 Гкал/ц (2014+2022 expansion) — Φ800 4.6 км → 24×12-давхар monolith + сургууль + 2 цэцэрлэг. Greenfield шинэ хороолол.",
    category: "large",
    scope: "15.4 МВт · 33 зангилаа · 33 хоолой",
    source: "energy.gov.mn/c/1343",
    build: amgalan_bzd,
  },
  {
    key: "district_boiler_15",
    name: "Хороолол котельная → 3 ЦТП",
    description:
      "8 МВт локал котельная + 3 ЦТП + 15 хэрэглэгч (9 ОС + 3 сургууль + 3 цэцэрлэг). Сатellite суурин газрын стандарт зохион байгуулалт.",
    category: "medium",
    scope: "8.0 МВт · 19 зангилаа · 18 хоолой",
    build: district_boiler_15,
  },
  {
    key: "erdenet_town",
    name: "Эрдэнэт ДЦС хотын сүлжээ",
    description:
      "Эрдэнэт ТЭЦ 120 Гкал/ц + Хойд орон сууц (3 ЦТП) + Урд үйлдвэр (зэс-молибдены цех). Жижиг хотын benchmark.",
    category: "large",
    scope: "27 МВт · 14 зангилаа · 14 хоолой",
    source: "Mongrid + energy.gov.mn",
    build: erdenet_town,
  },
  {
    key: "small_neighborhood",
    name: "Жижиг хороолол (туршилт)",
    description:
      "1 котельная + 5 барилга — энгийн схем туршилт болон сургалт.",
    category: "small",
    scope: "1.3 МВт · 6 зангилаа · 5 хоолой",
    build: smallNeighborhood,
  },
];
