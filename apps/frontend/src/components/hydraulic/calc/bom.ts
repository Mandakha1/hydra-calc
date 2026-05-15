/**
 * Bill of Materials (BoM) — Өртгийн смет.
 *
 * Engineers must produce smetа for project bidding. Manual = days. Automated = seconds.
 * Aggregates pipes + valves + ИТП equipment with Mongolian retail prices (2026).
 */
import { PIPE_PRICES_MNT_PER_M, PIPE_DB } from "shared";
import type { HydraulicState, SchemeChannel, SchemeNode, SchemePipe } from "../hydraulicTypes";
import { getNodeKind } from "../nodeCatalog";
import {
  CHANNEL_TYPE_REGISTRY,
  type ChannelTypeKey,
} from "../scheme/channelTypes";

export interface BomLineItem {
  /** Phase 12.10 — "material" added for composite-channel concrete /
   *  sleepers / insulation that fall outside the pipe/valve/equipment
   *  buckets. Engineer sees a separate "Бетон + дулаалга" subtotal in
   *  the BoM panel grouped by this category. */
  category: "pipe" | "valve" | "fitting" | "equipment" | "labor" | "transport" | "material";
  name: string;
  quantity: number;
  unit: string;
  unitPrice_mnt: number;
  totalPrice_mnt: number;
  source?: string;  // e.g. "16 шугам, 50м үргэлжлэл"
}

export interface BomReport {
  lines: BomLineItem[];
  subtotal_mnt: number;
  vat_mnt: number;            // 10% Mongolian VAT
  laborMarkup_mnt: number;    // 25% installation labor markup
  transportMarkup_mnt: number; // 5% transport
  total_mnt: number;
  /** Per-category breakdown. */
  byCategory: Record<string, number>;
  /** Per-DN pipe breakdown. */
  pipesByDn: Array<{ dn: number; totalLength_m: number; total_mnt: number }>;
}

/**
 * Арматурын үнэ (МНТ) — Улаанбаатар 2026 Q1 retail.
 * Эх сурвалж: Тоосгон төв, Монгол-Хайнан, Ган Кад прайс (DN50 жишиг).
 * Хайнаны хаалт (Mongolian "Сансар", "Ариункан-Ус") + Danfoss/Honeywell ТМЗТ.
 */
const VALVE_PRICES_MNT: Record<string, number> = {
  valve_gate: 125_000,           // Чугунная задвижка 30ч6бр DN50 (Хятад/ОУ)
  valve_ball: 65_000,            // Бөмбөлөгт хаалт DN50 (Bonomi/Itap эсвэл LD)
  valve_globe: 145_000,          // Вентиль 15кч18п DN50
  valve_check: 95_000,           // Эргэх хаалт 19ч21бр DN50
  valve_regulator: 1_250_000,    // Danfoss AVD/AHQM даралтын регулятор DN50
  valve_safety: 185_000,         // Аюулгүйн хавхлага 17ч12бр PN16
};

/**
 * Тоног төхөөрөмжийн үнэ — Улаанбаатар 2026 Q1.
 * Жинхэнэ зах зээлийн дундаж: Tianjin Beifang, Wilo Mongolia, Grundfos дилер,
 * "Сүүн Цагаан Ган" ХХК-ийн ЦТП үйлдвэрлэл, Ган Кад ХХК ИТП багц.
 */
const EQUIPMENT_PRICES_MNT: Record<string, number> = {
  source_tec: 0,                          // CAPEX scope-аас гадуур
  source_boiler: 68_000_000,              // 8 МВт уурын зуух Energotex/Bosch UT-L 80
  source_substation: 18_500_000,          // ЦТП багц (PHEX + насос + автоматжуулалт + хаалт)
  pump_circ: 3_400_000,                   // WILO Stratos 50/1-12 PN16
  pump_booster: 6_500_000,                // Grundfos NB 50-200/210 (132кВт)
  pump_makeup: 2_350_000,                 // Pedrollo CRm5 (small)
  itp_elevator: 520_000,                  // ВТИ-001 элеватор + соплон 6
  itp_heatex: 7_800_000,                  // Alfa Laval CB60 plate HX 250кВт
  itp_mixing: 2_650_000,                  // Холих насос Wilo + Y-strainer + хаалт
  underfloor: 125_000,                    // 1м² шалны халаалт (PE-Xa Rehau)
  chamber: 1_150_000,                     // Стандарт камер ж/б 1500×1500×1800
  well_supply: 1_850_000,                 // Дулааны худаг + крышка ж/б
  expansion_tank: 850_000,                // 200L Reflex N + redress
};

/** Монголын зах зээлийн үнэт хувь нэмэлт (BNbD сметийн стандарт + 2026 практик). */
const VAT_RATE = 0.10;          // 10% НӨАТ (НТХАХ хууль 2.6 + Татварын хууль)
const LABOR_RATE = 0.32;        // 32% угсралт + туршилт + халаалтын систем баталгаажуулалт (БНбД 12-12-2018)
const TRANSPORT_RATE = 0.07;    // 7% тээвэр + ачааны логистик 2026 (диз. шатахуун ↑20%)

/**
 * Phase 12.10 — Composite-channel (ГК-23/02) BoM pricing.
 *
 * Concrete-section per metre (precast Г-991-1 panels delivered cut-
 * to-length) + concrete sleepers (precast spacing blocks resting the
 * contained pipes ~80 mm above the trench floor) + mineral wool
 * insulation (URSA / ROCKWOOL 50 mm thickness blanket — standard
 * Mongolian district-heating spec per БНбД 41-02-13 §6).
 *
 * Prices are Улаанбаатар 2026 Q1 retail averages from "Сүүн Цагаан
 * Ган" precast yard + URSA/Knauf distributor + Ган Кад catalog.
 * Custom channels priced at the engineer-typical midpoint (between
 * Л-4 and Л-7).
 */
const CHANNEL_CONCRETE_PRICE_MNT_PER_M: Record<ChannelTypeKey, number> = {
  "Л-4": 85_000,
  "Л-7": 140_000,
  "Л-9": 180_000,
  "custom": 120_000,
};
/** Concrete sleeper price per piece (стандарт ж/б тулгуур блок). */
const CHANNEL_SLEEPER_PRICE_MNT = 15_000;
/** Sleeper spacing along the channel (ГК-23/02 typical 2.5 m). */
const CHANNEL_SLEEPER_SPACING_M = 2.5;
/** Mineral wool insulation (URSA / ROCKWOOL 50 mm) per m² surface. */
const CHANNEL_INSULATION_PRICE_MNT_PER_M2 = 45_000;

/** Engineer-facing channel type label for BoM line names. */
function channelDisplayLabel(channelType: ChannelTypeKey | undefined): string {
  if (!channelType) return "Тодорхойгүй";
  if (channelType === "custom") return "Сонголтоор";
  return channelType;
}

/**
 * Pull the channel's effective inside dimensions (mm). Explicit
 * crossSection* fields win; standard types fall back to the registry.
 */
function channelDimsMm(channel: SchemeChannel): { width_mm: number; height_mm: number } {
  let width_mm = channel.crossSectionWidth_mm ?? 0;
  let height_mm = channel.crossSectionHeight_mm ?? 0;
  if ((!width_mm || !height_mm) && channel.channelType && channel.channelType !== "custom") {
    const spec = CHANNEL_TYPE_REGISTRY[channel.channelType as Exclude<ChannelTypeKey, "custom">];
    if (spec) {
      width_mm = width_mm || spec.widthMm;
      height_mm = height_mm || spec.heightMm;
    }
  }
  return { width_mm, height_mm };
}

/**
 * Build the engineer-facing BoM line items for a single channel.
 *
 *   - Бетон суваг Л-X (м):    length × concrete-per-m
 *   - Бетон тулгуур блок (ш): ceil(length / 2.5)
 *   - Эрдэс ноосон дулаалга (м²): perimeter × length / 1000
 *
 * Channel `length_m` comes from the FIRST contained pipe (all
 * contained pipes share geometry per Phase 12.5 invariant). When no
 * pipes are contained (engineer drew an empty channel), returns the
 * concrete-section line only with the channel's logical length zero.
 */
export function channelBoMLines(
  channel: SchemeChannel,
  containedPipes: SchemePipe[],
): BomLineItem[] {
  const length_m = containedPipes[0]?.length_m ?? 0;
  if (length_m <= 0) return [];

  const dims = channelDimsMm(channel);
  const typeKey: ChannelTypeKey = channel.channelType ?? "custom";
  const concretePerM =
    CHANNEL_CONCRETE_PRICE_MNT_PER_M[typeKey] ?? CHANNEL_CONCRETE_PRICE_MNT_PER_M.custom;
  const concreteTotal = concretePerM * length_m;

  const sleeperCount = Math.max(2, Math.ceil(length_m / CHANNEL_SLEEPER_SPACING_M));
  const sleeperTotal = sleeperCount * CHANNEL_SLEEPER_PRICE_MNT;

  // Inside surface area to insulate: perimeter (2W + 2H mm) × length / 1000 (m²).
  const perimeter_m = ((dims.width_mm + dims.height_mm) * 2) / 1000;
  const insulationArea_m2 = perimeter_m * length_m;
  const insulationTotal = insulationArea_m2 * CHANNEL_INSULATION_PRICE_MNT_PER_M2;

  const lines: BomLineItem[] = [];
  const dimsLabel = dims.width_mm > 0 && dims.height_mm > 0
    ? ` ${dims.width_mm}×${dims.height_mm}мм`
    : "";
  lines.push({
    category: "material",
    name: `Бетон суваг ${channelDisplayLabel(typeKey)}${dimsLabel}`,
    quantity: Math.round(length_m * 10) / 10,
    unit: "м",
    unitPrice_mnt: concretePerM,
    totalPrice_mnt: Math.round(concreteTotal),
    source: `ГК-23/02 СЕРИЯ Г-991-1, ${containedPipes.length}п суваг`,
  });
  lines.push({
    category: "material",
    name: "Бетон тулгуур блок",
    quantity: sleeperCount,
    unit: "ш",
    unitPrice_mnt: CHANNEL_SLEEPER_PRICE_MNT,
    totalPrice_mnt: Math.round(sleeperTotal),
    source: `${CHANNEL_SLEEPER_SPACING_M} м-ийн зайтай`,
  });
  if (insulationArea_m2 > 0) {
    lines.push({
      category: "material",
      name: "Эрдэс ноосон дулаалга (URSA / ROCKWOOL 50мм)",
      quantity: Math.round(insulationArea_m2 * 10) / 10,
      unit: "м²",
      unitPrice_mnt: CHANNEL_INSULATION_PRICE_MNT_PER_M2,
      totalPrice_mnt: Math.round(insulationTotal),
      source: `${dims.width_mm}+${dims.height_mm} мм периметр × ${length_m.toFixed(1)} м`,
    });
  }
  return lines;
}

export function generateBom(state: HydraulicState): BomReport {
  const lines: BomLineItem[] = [];

  /* === Pipes by material × DN === */
  const pipesByMat = new Map<string, SchemePipe[]>();
  for (const p of state.pipes) {
    const key = state.settings.primaryMaterialCategory + "_" + p.dn;
    if (!pipesByMat.has(key)) pipesByMat.set(key, []);
    pipesByMat.get(key)!.push(p);
  }
  const pipesByDn: BomReport["pipesByDn"] = [];
  for (const [key, pipes] of pipesByMat) {
    const totalLength = pipes.reduce((sum, p) => sum + p.length_m, 0);
    const dn = pipes[0]!.dn;
    const unitPrice = PIPE_PRICES_MNT_PER_M[key] ?? PIPE_PRICES_MNT_PER_M[`steel_${dn}`] ?? 0;
    const totalPrice = unitPrice * totalLength;
    const matName = key.startsWith("steel") ? "Ган хоолой ГОСТ 10704"
                  : key.startsWith("ppr") ? "PPR хоолой ГОСТ 32415"
                  : "PE-HD ГОСТ 18599";
    lines.push({
      category: "pipe",
      name: `${matName} DN${dn}`,
      quantity: Math.round(totalLength * 10) / 10,
      unit: "м",
      unitPrice_mnt: unitPrice,
      totalPrice_mnt: totalPrice,
      source: `${pipes.length} сегмент`,
    });
    pipesByDn.push({ dn, totalLength_m: totalLength, total_mnt: totalPrice });
  }
  pipesByDn.sort((a, b) => b.dn - a.dn);

  /* === Valves & equipment === */
  const valveCounts = new Map<string, { count: number; def: ReturnType<typeof getNodeKind> }>();
  for (const node of state.nodes) {
    if (!node.kind) continue;
    const def = getNodeKind(node.kind);
    if (!def) continue;
    if (def.category === "valve" || def.category === "fitting" || def.category === "pump" || def.category === "source" || def.category === "chamber") {
      const k = node.kind;
      if (!valveCounts.has(k)) valveCounts.set(k, { count: 0, def });
      valveCounts.get(k)!.count += 1;
    }
    // Special handling for ИТП consumer equipment
    if (node.kind.startsWith("itp_") || node.kind === "underfloor") {
      const k = node.kind;
      if (!valveCounts.has(k)) valveCounts.set(k, { count: 0, def });
      valveCounts.get(k)!.count += 1;
    }
  }
  for (const [kind, { count, def }] of valveCounts) {
    const unitPrice = VALVE_PRICES_MNT[kind] ?? EQUIPMENT_PRICES_MNT[kind] ?? 0;
    if (unitPrice === 0) continue;
    const cat: BomLineItem["category"] =
      def?.category === "valve" ? "valve" :
      def?.category === "fitting" ? "fitting" :
      "equipment";
    lines.push({
      category: cat,
      name: def?.name ?? kind,
      quantity: count,
      unit: "ш",
      unitPrice_mnt: unitPrice,
      totalPrice_mnt: unitPrice * count,
    });
  }

  /* === Phase 12.10 — Composite channels (ГК-23/02) ===
   * Concrete sections + sleepers + insulation per channel. Skipped
   * when state.channels is undefined (pre-12.5 projects load cleanly). */
  if (state.channels && state.channels.length > 0) {
    for (const channel of state.channels) {
      const contained = state.pipes.filter((p) => channel.pipeIds.includes(p.id));
      for (const line of channelBoMLines(channel, contained)) {
        lines.push(line);
      }
    }
  }

  /* === Throttle washers / орmasch (per ИТП scheme) === */
  const totalWashers = state.nodes.reduce(
    (sum, n) => sum + ((n.nshb_pod ?? 0) + (n.nshb_obr ?? 0) + (n.nshb_gvs ?? 0)),
    0,
  );
  if (totalWashers > 0) {
    lines.push({
      category: "fitting",
      name: "Регуляторын шайба ст3 (throttle washer)",
      quantity: totalWashers,
      unit: "ш",
      unitPrice_mnt: 12_000,
      totalPrice_mnt: 12_000 * totalWashers,
    });
  }

  /* === Aggregate === */
  const subtotal = lines.reduce((sum, l) => sum + l.totalPrice_mnt, 0);
  const vat = Math.round(subtotal * VAT_RATE);
  const labor = Math.round(subtotal * LABOR_RATE);
  const transport = Math.round(subtotal * TRANSPORT_RATE);
  const total = subtotal + vat + labor + transport;

  const byCategory: Record<string, number> = {};
  for (const l of lines) {
    byCategory[l.category] = (byCategory[l.category] ?? 0) + l.totalPrice_mnt;
  }

  return {
    lines: lines.sort((a, b) => b.totalPrice_mnt - a.totalPrice_mnt),
    subtotal_mnt: subtotal,
    vat_mnt: vat,
    laborMarkup_mnt: labor,
    transportMarkup_mnt: transport,
    total_mnt: total,
    byCategory,
    pipesByDn,
  };
}

export function formatMnt(amount: number): string {
  return new Intl.NumberFormat("mn-MN", { maximumFractionDigits: 0 }).format(Math.round(amount));
}
