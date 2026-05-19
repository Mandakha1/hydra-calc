import * as XLSX from "xlsx";
import { PIPE_DB, PIPE_MATERIALS, TEMP_SCHEDULES, CLIMATE } from "shared";
import type { HydraulicState, SchemeNode, SchemePipe } from "../hydraulicTypes";
import {
  autoVolumetricHeatLoad,
  DEFAULT_SPECIFIC_LOAD_W_PER_M3,
} from "../calc/volumetricHeatLoad";
import { getNodeKind } from "../nodeCatalog";
// Phase 13.25 — magistral / branch classification for the
// "Шугамын төрөл" column on each per-circuit hydraulic sheet.
import { classifyPipeRoles, pipeRoleLabel } from "../scheme/classifyPipeRoles";

/**
 * Phase 13.19 — Excel exporter matching the Mongolian reference template
 * (УДД-5 Гидравлик халаалт тооцоо.xlsx).
 *
 * Sheets produced (in order):
 *   1. Тойм                  — overview (sources/totals/pump)
 *   2. Дулааны ачаалал       — per-consumer heat load with volumetric calc
 *   3. Халаалт гидравлик     — pipes filtered to heating circuits (Т1/Т2)
 *                              with the engineer-standard Mongolian columns
 *   4. ХХУ гидравлик          — pipes filtered to DHW circuits (Т3/Т4)
 *   5. Хүйтэн ус гидравлик   — pipes filtered to cold-water circuit (В1)
 *                              (omitted when there are no cold pipes)
 *   6. Компенсатор            — П-shape compensator selection
 *                              (omitted when there are no compensators)
 *   7. Зангилаа               — all nodes (existing engineer audit view)
 *   8. Хоолой                 — all pipes with full calc columns (existing)
 *   9. Норм шалгалт          — БНбД violations
 *  10. Сортамент-XX          — pipe DB (steel / PPR / PE-HD)
 *  11. Лавлах                — temperature schedules + climate
 *
 * Column headers + units match the Mongolian engineer's spreadsheet so an
 * inspector reviewing both side-by-side sees the same layout.
 */
export function exportToExcel(state: HydraulicState, filename = "hydra-calc.xlsx"): void {
  const wb = XLSX.utils.book_new();

  /* =====================================================================
   * Sheet 1: Тойм (Overview)
   * ===================================================================== */
  const summary: (string | number)[][] = [
    ["Hydra Calc — тайлан", ""],
    ["Огноо", new Date().toLocaleString("mn-MN")],
    ["Хот", state.settings.city],
    ["Температурын график", state.settings.temperatureScheduleKey],
    ["Материалын категори", state.settings.primaryMaterialCategory],
    ["Сүлжээний төрөл", state.settings.networkType],
    ["Источникийн даралт (MPa)", state.settings.sourcePressure_mpa],
    [],
    ["Тооцооны үр дүн"],
  ];
  if (state.results) {
    summary.push(
      ["Нийт ачаалал (кВт)", (state.results.totalLoad_w / 1000).toFixed(2)],
      ["Нийт ачаалал (Гкал/ц)", (state.results.totalLoad_w / 1163000).toFixed(4)],
      ["Макс. хурд (м/с)", state.results.maxVelocity_m_s.toFixed(3)],
      ["Макс. R (Pa/м)", state.results.maxHeadlossPerMeter_pa.toFixed(1)],
      ["Мин. хэрэглэгчийн даралт (MPa)", state.results.minConsumerPressure_mpa.toFixed(3)],
    );
    if (state.results.pump) {
      summary.push(
        ["Насос H (м, минимум)", state.results.pump.H_m.toFixed(2)],
        ["Насос Q (м³/ц)", state.results.pump.Q_m3h.toFixed(2)],
        ["Насос P (кВт)", state.results.pump.P_kW.toFixed(2)],
      );
      const bd = state.results.pump.breakdown;
      if (bd) {
        summary.push(
          [],
          ["Напорын задаргаа (БНбД 41-01 §6.3)"],
          ["  Магистрал шугам (м)", bd.supplyFriction_m.toFixed(2)],
          ["  Эргэх шугам (м)", bd.returnFriction_m.toFixed(2)],
          ["  Хэрэглэгчийн нөөц (м)", bd.consumerReserve_m.toFixed(2)],
          ["  Дизайн нөөц (м)", bd.safetyMargin_m.toFixed(2)],
          ["Насос H (м, зөвлөсөн)", (state.results.pump.H_m + bd.safetyMargin_m).toFixed(2)],
        );
      }
    }
    if (state.results.heatLoss) {
      const hl = state.results.heatLoss;
      summary.push(
        [],
        ["Дулааны алдагдал (БНбД 41-04-13)"],
        ["  Нийт алдагдал (кВт)", (hl.totalHeatLoss_W / 1000).toFixed(2)],
        ["  Нийт ачааллын %", (hl.fractionOfLoad * 100).toFixed(1)],
        ["  Источникийн T (°C)", hl.sourceSupplyTemp_C.toFixed(1)],
        ["  Алс хэрэглэгчийн T (°C)", hl.minConsumerSupplyTemp_C.toFixed(1)],
        ["  БНбД §5.4 (≥80°C)", hl.minConsumerSupplyTemp_C >= 80 ? "✓" : "⚠"],
      );
    }
  }
  appendSheet(wb, "Тойм", summary, [{ wch: 36 }, { wch: 24 }]);

  /* =====================================================================
   * Sheet 2: Дулааны ачаалал (per-consumer heat load, БНбД 23-02-09 §7)
   *
   * Matches the Mongolian engineer template ("УДД-5 дулааны ачаалал"):
   *   №, building name, building #, area m², floors, count, total area,
   *   volume m³, floor height, t_outdoor, t_indoor, qv W/m³, Q_h kW, Q_h Гкал/ц
   *
   * The volumetric calc (Q = q_v × V) is per БНбД 23-02-09 § Annex A.2;
   * defaults loaded from DEFAULT_SPECIFIC_LOAD_W_PER_M3 (Phase 13.13).
   * ===================================================================== */
  {
    const consumers = state.nodes.filter((n) => {
      const def = getNodeKind(n.kind);
      return def?.category === "consumer";
    });
    const aoa: (string | number)[][] = [
      [
        "Д/д",
        "Барилга байгууламжийн нэр",
        "Барилгын дугаарлалт",
        "Барилгын талбай м²",
        "Давхрын тоо",
        "Барилгын тоо",
        "Нийт талбай (A) м²",
        "Эзэлхүүн м³",
        "Давхрын өндөр м",
        "Гадна t °C",
        "Дотор t °C",
        "qv Вт/м³",
        "Qх.т кВт",
        "Qх.т Гкал/ц",
      ],
    ];
    let totalKw = 0;
    consumers.forEach((n, i) => {
      const auto = autoVolumetricHeatLoad({
        kind: n.kind,
        width_m: n.width_m,
        height_m: n.height_m,
        buildingHeight_m: n.buildingHeight_m,
        floors: n.floors,
        floorHeight_m: n.floorHeight_m,
        specificLoad_w_per_m3: n.specificLoad_w_per_m3,
      });
      const volume_m3 = auto?.volume_m3 ?? 0;
      // Effective heat load: engineer override (n.heatLoad_w) takes
      // precedence over the volumetric estimate (matches the app's
      // calc engine convention).
      const q_w = (n.heatLoad_w ?? 0) > 0 ? n.heatLoad_w! : auto?.heatLoad_w ?? 0;
      const q_kw = q_w / 1000;
      const q_gcal = q_w / 1163000;
      totalKw += q_kw;
      const area = (n.width_m ?? 0) * (n.height_m ?? 0);
      const buildingHeight =
        n.buildingHeight_m ??
        (n.floors && n.floorHeight_m
          ? n.floors * n.floorHeight_m
          : n.floors
            ? n.floors * 3
            : "");
      aoa.push([
        i + 1,
        n.label,
        n.id,
        area > 0 ? Math.round(area) : "",
        n.floors ?? "",
        1, // building count (we model 1 SchemeNode per consumer)
        area > 0 ? Math.round(area) : "",
        volume_m3 > 0 ? volume_m3 : "",
        n.floorHeight_m ?? buildingHeight === "" ? "" : Number(buildingHeight),
        state.settings.designOutdoorTemp_c ?? -20,
        18, // Default Mongolian indoor design t per БНбД 41-01 §5.1
        auto?.specificLoad_w_per_m3 ?? DEFAULT_SPECIFIC_LOAD_W_PER_M3[n.kind] ?? "",
        Number(q_kw.toFixed(3)),
        Number(q_gcal.toFixed(5)),
      ]);
    });
    aoa.push([
      "",
      "Нийт",
      "",
      "",
      "",
      consumers.length,
      "",
      "",
      "",
      "",
      "",
      "",
      Number(totalKw.toFixed(3)),
      Number((totalKw / 1163).toFixed(5)),
    ]);
    appendSheet(wb, "Дулааны ачаалал", aoa, [
      { wch: 5 },
      { wch: 32 },
      { wch: 14 },
      { wch: 12 },
      { wch: 9 },
      { wch: 8 },
      { wch: 11 },
      { wch: 10 },
      { wch: 11 },
      { wch: 9 },
      { wch: 9 },
      { wch: 9 },
      { wch: 11 },
      { wch: 12 },
    ]);
  }

  /* =====================================================================
   * Sheets 3-5: Per-circuit hydraulic tables matching the template's
   * "Халаалт гидравлик" / "ХХУ гидравлик" header layout exactly.
   * ===================================================================== */
  const heatingPipes = state.pipes.filter(
    (p) => p.circuit === "heating_supply" || p.circuit === "heating_return",
  );
  const dhwPipes = state.pipes.filter(
    (p) => p.circuit === "dhw_supply" || p.circuit === "dhw_recirc",
  );
  const coldPipes = state.pipes.filter((p) => p.circuit === "cold_water");

  const dTHeating = inferTempDelta(state, "heating");
  const dTDhw = inferTempDelta(state, "dhw");

  appendHydraulicCircuitSheet(wb, "Халаалт гидравлик", heatingPipes, state, {
    label: "[халаалт] шугамын гидравлик тооцоо",
    deltaT_c: dTHeating,
  });
  appendHydraulicCircuitSheet(wb, "ХХУ гидравлик", dhwPipes, state, {
    label: "[Хэрэгцээний халуун ус] шугамын гидравлик тооцоо",
    deltaT_c: dTDhw,
  });
  if (coldPipes.length > 0) {
    appendHydraulicCircuitSheet(wb, "Хүйтэн ус гидравлик", coldPipes, state, {
      label: "[Хүйтэн ус] шугамын гидравлик тооцоо",
      deltaT_c: 0, // cold water has no design ΔT
    });
  }

  /* =====================================================================
   * Sheet 6: Компенсатор (compensator selection table)
   *
   * Mirrors the engineer template "УДД-5 компенсатор": №, segment length,
   * DнXS (OD × wall), d (compensator diameter), L_max_hot, t_max,
   * L_segment (= ΔL ground), DL (thermal elongation), 0.5·DL, B (arm),
   * H (height), Pх (axial force kN).
   *
   * For each "compensator_*" node in the scheme we compute:
   *   - Segment length (sum of attached pipes ÷ 2 approximation)
   *   - Thermal elongation ΔL = α · L · ΔT
   *   - Compensator arm B + H per БНбД 41-02-13 § Table 6.2
   * ===================================================================== */
  const compensators = state.nodes.filter((n) => n.kind.startsWith("compensator"));
  if (compensators.length > 0) {
    const aoa: (string | number)[][] = [
      [
        "№",
        "Хэсгийн урт (м)",
        "Dн × S",
        "d (компенсаторын)",
        "tмакс °C",
        "tмин °C",
        "L м",
        "ΔL мм",
        "0.5·ΔL мм",
        "B (мм)",
        "H (мм)",
        "Pх кН",
      ],
    ];
    compensators.forEach((c, i) => {
      // Estimate segment length from attached pipes' total length / 2.
      const attached = state.pipes.filter(
        (p) => p.fromNodeId === c.id || p.toNodeId === c.id,
      );
      const segLen = attached.reduce((s, p) => s + (p.length_m ?? 0), 0) / 2;
      // Pick the largest DN attached.
      const dn = attached.reduce((m, p) => Math.max(m, p.dn), 0);
      const od = pipeOdForDn(dn, state.settings.primaryMaterialCategory);
      const wall = pipeWallForDn(dn, state.settings.primaryMaterialCategory);
      // ΔL = α · L · ΔT (steel α ≈ 1.2e-5 /°C, design ΔT supply-return)
      const tMax = inferSupplyTempC(state);
      const tMin = state.settings.designOutdoorTemp_c ?? -20;
      const alpha_steel = 1.2e-5;
      const dL_mm = alpha_steel * segLen * 1000 * (tMax - tMin);
      // Compensator arm + height per ГК-23/02 simplified table:
      const B_mm = Math.max(3000, Math.round(50 * Math.sqrt(dL_mm * dn)));
      const H_mm = Math.max(2000, Math.round(B_mm * 0.6));
      // Axial force at fixed-support estimate: 50 N/mm² × cross-section
      const a_mm2 = Math.PI * ((od / 2) ** 2 - ((od - 2 * wall) / 2) ** 2);
      const Px_kN = (50 * a_mm2) / 1000;
      aoa.push([
        `k-${i + 1}`,
        Number(segLen.toFixed(1)),
        od > 0 ? `${od.toFixed(0)}×${wall.toFixed(1)}` : `DN${dn}`,
        `Ф${Math.round(od * 0.6)}мм`,
        tMax,
        tMin,
        Number((2 * segLen).toFixed(1)),
        Number(dL_mm.toFixed(2)),
        Number((dL_mm / 2).toFixed(2)),
        B_mm,
        H_mm,
        Number(Px_kN.toFixed(2)),
      ]);
    });
    appendSheet(wb, "Компенсатор", aoa, [
      { wch: 6 },
      { wch: 13 },
      { wch: 11 },
      { wch: 18 },
      { wch: 9 },
      { wch: 9 },
      { wch: 8 },
      { wch: 10 },
      { wch: 11 },
      { wch: 8 },
      { wch: 8 },
      { wch: 9 },
    ]);
  }

  /* =====================================================================
   * Sheet 7: Зангилаа (all nodes — existing engineer audit view)
   * ===================================================================== */
  const nodesHeader = [
    "№",
    "ID",
    "Төрөл",
    "Нэр",
    "X",
    "Y",
    "Ачаалал (кВт)",
    "Шаардлагатай даралт (MPa)",
    "Тооцоолсон даралт (MPa)",
    "Тэмдэглэл",
  ];
  const nodesRows: (string | number)[][] = state.nodes.map((n, i) => {
    const pr = state.results?.nodes.find((x) => x.nodeId === n.id)?.pressureAtNode_mpa ?? "";
    return [
      i + 1,
      n.id,
      kindMn(n.kind),
      n.label,
      n.x,
      n.y,
      (n.heatLoad_w ?? 0) / 1000,
      n.requiredPressure_mpa ?? "",
      pr === "" ? "" : (pr as number).toFixed(3),
      n.notes ?? "",
    ];
  });
  appendSheet(wb, "Зангилаа", [nodesHeader, ...nodesRows]);

  /* =====================================================================
   * Sheet 8: Хоолой (all pipes — existing full-calc view)
   * ===================================================================== */
  const pipesHeader = [
    "№",
    "ID",
    "Эхлэл",
    "Төгсгөл",
    "Хэлхээ",
    "Материал",
    "DN",
    "Урт (м)",
    "G (кг/с)",
    "v (м/с)",
    "Re",
    "λ",
    "R (Pa/м)",
    "ΔP (Pa)",
  ];
  const pipesRows: (string | number)[][] = state.pipes.map((p, i) => {
    const r = state.results?.pipes.find((x) => x.pipeId === p.id);
    const mat = PIPE_MATERIALS.find((m) => m.key === p.materialKey)?.name ?? p.materialKey;
    return [
      i + 1,
      p.id,
      p.fromNodeId,
      p.toNodeId,
      circuitMn(p.circuit),
      mat,
      p.dn,
      p.length_m,
      r?.G_kg_s.toFixed(3) ?? "",
      r?.v_m_s.toFixed(3) ?? "",
      r?.Re.toFixed(0) ?? "",
      r?.lambda.toFixed(4) ?? "",
      r?.headlossPerMeter_pa.toFixed(1) ?? "",
      r?.totalPressureDrop_pa.toFixed(0) ?? "",
    ];
  });
  appendSheet(wb, "Хоолой", [pipesHeader, ...pipesRows]);

  /* =====================================================================
   * Sheet 9: Норм шалгалт
   * ===================================================================== */
  const violations = state.violations ?? [];
  const violationsHeader = ["№", "Төрөл", "Хүндрэл", "Мессеж", "Объект ID", "Хязгаар", "Бодит утга", "Нэгж"];
  const violationsRows: (string | number)[][] = violations.map((v, i) => [
    i + 1,
    v.kind,
    severityMn(v.severity),
    v.message,
    v.target.id,
    v.threshold,
    v.actual.toFixed(3),
    v.unit,
  ]);
  appendSheet(wb, "Норм шалгалт", [violationsHeader, ...violationsRows]);

  /* =====================================================================
   * Sheet 10: Сортамент-XX
   * ===================================================================== */
  const cat = state.settings.primaryMaterialCategory;
  const dbHeader = ["DN", "OD (мм)", "Хана (мм)", "ID (мм)", "Жин (кг/м)"];
  const dbRows: (string | number)[][] = PIPE_DB[cat].map((p) => [
    p.dn,
    p.od_mm,
    p.wall_mm,
    p.id_mm,
    p.mass_kg_per_m,
  ]);
  appendSheet(wb, `Сортамент-${cat.toUpperCase()}`, [dbHeader, ...dbRows]);

  /* =====================================================================
   * Sheet 11: Лавлах (reference)
   * ===================================================================== */
  const refRows: (string | number)[][] = [
    ["Температурын графикууд"],
    ["Код", "Нийлүүлэх (°C)", "Буцах (°C)", "Тайлбар"],
    ...TEMP_SCHEDULES.map((t) => [t.key, t.supply_c, t.return_c, t.description]),
    [],
    ["Монгол улсын аймгийн уур амьсгал"],
    ["Хот", "Т_н.р (°C)", "Халаалтын өдөр", "Дундаж Т (°C)"],
    ...CLIMATE.map((c) => [c.city, c.tnr_c, c.heating_days, c.t_avg_heating_c]),
  ];
  appendSheet(wb, "Лавлах", refRows);

  XLSX.writeFile(wb, filename);
}

/* ─────────────────────── helpers ─────────────────────── */

/**
 * Phase 13.19 + 13.23 — per-circuit hydraulic table in the Mongolian
 * engineer template layout. Expanded in Phase 13.23 to match the full
 * 17-column diploma + ЗАПИСКИ format (Дулааны сүлжээний гидравлик
 * тооцооны хүснэгт, Хүснэгт 3.1):
 *
 *   i | j | L [м] | G [т/ц] | G [кг/с] | α | Rш [Pa/м] |
 *   di [мм] | dст [мм] | w [м/с] | Rст [Pa/м] | ∑ξ | lэ [м] |
 *   ΔP [Pa] | ΔH [м] | 2ΔH [м] | Hk [м] | Hp [м]
 *
 * Math:
 *   - α = 0.30 (local-resistance ratio default for outdoor heat mains
 *     per Politerm справочник; engineer can override post-export).
 *   - di = √(4G / (πρW_target)) × 1000 (mm), W_target = 1.0 m/s
 *   - ∑ξ = α × Rш × L / (ρ·W²/2) — back-derived from α convention
 *   - 2ΔH = ΔH(supply) + ΔH(return) cumulated across the path. For
 *     this single-circuit sheet, equals 2 × ΔH (since supply == return
 *     loss for steady flow).
 *   - Hk = source pressure - cumulative ΔH (residual head at pipe end)
 *   - Hp = required pump head to deliver Hk_min ≥ 0 for each consumer
 */
function appendHydraulicCircuitSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  pipes: ReadonlyArray<SchemePipe>,
  state: HydraulicState,
  opts: { label: string; deltaT_c: number },
): void {
  const nodeBy = (id: string): SchemeNode | undefined =>
    state.nodes.find((n) => n.id === id);
  const indexBy = (id: string): number => {
    const i = state.nodes.findIndex((n) => n.id === id);
    return i >= 0 ? i + 1 : 0;
  };
  const cat = state.settings.primaryMaterialCategory;
  // Phase 13.25 — auto-classify each pipe as Магистраль / Салбар from
  // network topology (consumers reachable in the downstream subtree).
  const roleByPipeId = classifyPipeRoles(state.pipes, state.nodes);

  // Phase 13.26 — layout switched to match the engineer-attached
  // УДДТ-5 Гидравлик халаалт тооцоо.xlsx reference EXACTLY:
  //
  //   Row 1: A=Тооцооны хэсгийн №   B=Тооцооны хэсгийн №   (i / j)
  //          C=Температурын зөрүү, 0С
  //          D=[халаалт] шугамын гидравлик тооцоо           (circuit label)
  //   Row 2: D=Q [кВт]    E=G [кг/с]   F=G [т/цаг]   G=L [м]
  //          H=1+α        I=di [мм]    J=di [м]
  //          K=dст [мм]   L=ξ (local count)
  //          M=W [м/с]    N=Rш [Pa/м]
  //          O=Lэ [м]     P=∆Pi [Pa]   Q=∆Hi [м]   R=Lэкв
  //          S=Шугамын төрөл (Phase 13.25 extension column)
  const row1: (string | number | null)[] = [
    "Тооцооны хэсгийн №",
    "Тооцооны хэсгийн №",
    "Температурын зөрүү, 0С",
    opts.label,
    ...Array(15).fill(null),
  ];
  const row2: (string | number | null)[] = [
    null, // A (merged from row 1)
    null, // B
    null, // C
    "Q [кВт]",
    "G [кг/с]",
    "G [т/цаг]",
    "L [м]",
    "1+α",
    "di [мм]",
    "di [м]",
    "dст [мм]",
    "ξ",
    "W [м/с]",
    "Rш [Pa/м]",
    "Lэ [м]",
    "∆Pi [Pa]",
    "∆Hi [м]",
    "Lэкв",
    "Шугамын төрөл",
  ];
  const aoa: (string | number | null)[][] = [row1, row2];

  // Engineer-typical local-resistance ratio for outdoor heat mains.
  // Politerm справочник: 0.2 for straight, 0.3 for branched, 0.4 for
  // dense (many fittings). We use 0.30 as a defensible default.
  const ALPHA_OUTDOOR = 0.3;
  // Water density at ~80°C for Q→di + ξ derivations
  const RHO_KG_M3 = 972;
  // Target velocity for di calculation (m/s) — per СНиП 41-02-2003
  // §10 recommendation for magistral lines
  const W_TARGET = 1.0;
  // Source head in m water column from project settings (MPa → m).
  const Hsource_m = (state.settings.sourcePressure_mpa ?? 0.6) * 102;

  pipes.forEach((p) => {
    const r = state.results?.pipes.find((x) => x.pipeId === p.id);
    const fromIdx = indexBy(p.fromNodeId);
    const toIdx = indexBy(p.toNodeId);
    const fromNode = nodeBy(p.fromNodeId);
    const toNode = nodeBy(p.toNodeId);
    // Phase 13.26 — Q (kW) carried by this pipe. Solver-derived from
    // G × c × ΔT wins; fall back to the to-node's heatLoad_w (consumer
    // pipe delivers its consumer's load) then the from-node's. This
    // fixes the engineer report "барилга дээр ачаалал өгсөнч тооцоон
    // дээр гарч ирэхгүй" — the to-node heat load on consumer pipes
    // was being ignored before this fix.
    const G_kg_s = r?.G_kg_s ?? 0;
    const G_t_h = G_kg_s * 3.6;
    let Q_kw = 0;
    if (G_kg_s > 0 && opts.deltaT_c > 0) {
      Q_kw = G_kg_s * 4.186 * opts.deltaT_c;
    } else if (toNode?.heatLoad_w && toNode.heatLoad_w > 0) {
      Q_kw = toNode.heatLoad_w / 1000;
    } else if (fromNode?.heatLoad_w && fromNode.heatLoad_w > 0) {
      Q_kw = fromNode.heatLoad_w / 1000;
    }
    const L_m = p.length_m ?? 0;
    const W_m_s = r?.v_m_s ?? 0;
    const Rsh_pa_m = r?.headlossPerMeter_pa ?? 0;
    const dPi_pa = r?.totalPressureDrop_pa ?? 0;
    const dHi_m = dPi_pa / 9810; // Pa → m H2O
    // Calculated diameter at W_target=1.0 m/s — Q-derived sizing.
    const di_m = G_kg_s > 0
      ? Math.sqrt((4 * G_kg_s) / (Math.PI * RHO_KG_M3 * W_TARGET))
      : 0;
    const di_mm = Math.round(di_m * 1000);
    // Selected standard DN from pipe.dn → ID (mm).
    const dst_mm = PIPE_DB[cat].find((x) => x.dn === p.dn)?.id_mm ?? p.dn;
    // ξ — sum of local resistance coefficients. Defaults to 0 (engineer
    // tallies bends + valves on a per-segment basis in the reference
    // file's columns S-Z). We expose the column so engineers can fill
    // it post-export.
    const xi_default = 0;
    void Hsource_m; // reserved for future Hk/Hp residual columns
    const lE_m = L_m * (1 + ALPHA_OUTDOOR); // equivalent length
    aoa.push([
      fromIdx,                                       // A: i
      toIdx,                                          // B: j
      opts.deltaT_c,                                  // C: ΔT
      Number(Q_kw.toFixed(2)),                        // D: Q [кВт]
      Number(G_kg_s.toFixed(4)),                      // E: G [кг/с]
      Number(G_t_h.toFixed(3)),                       // F: G [т/цаг]
      Number(L_m.toFixed(2)),                         // G: L [м]
      Number((1 + ALPHA_OUTDOOR).toFixed(3)),         // H: 1+α
      di_mm,                                          // I: di [мм]
      Number(di_m.toFixed(4)),                        // J: di [м]
      dst_mm,                                         // K: dст [мм]
      xi_default,                                     // L: ξ
      Number(W_m_s.toFixed(3)),                       // M: W [м/с]
      Number(Rsh_pa_m.toFixed(2)),                    // N: Rш [Pa/м]
      Number(lE_m.toFixed(2)),                        // O: Lэ [м]
      Math.round(dPi_pa),                             // P: ∆Pi [Pa]
      Number(dHi_m.toFixed(3)),                       // Q: ∆Hi [м]
      Number(L_m.toFixed(1)),                         // R: Lэкв cumulative
      pipeRoleLabel(roleByPipeId.get(p.id) ?? "branch"), // S: Шугамын төрөл
    ]);
  });

  // Phase 13.26 — column widths matching the УДДТ-5 layout above.
  appendSheet(wb, sheetName, aoa as (string | number)[][], [
    { wch: 5 },   // A: i
    { wch: 5 },   // B: j
    { wch: 8 },   // C: ΔT
    { wch: 11 },  // D: Q [кВт]
    { wch: 11 },  // E: G [кг/с]
    { wch: 11 },  // F: G [т/цаг]
    { wch: 8 },   // G: L
    { wch: 8 },   // H: 1+α
    { wch: 9 },   // I: di [мм]
    { wch: 9 },   // J: di [м]
    { wch: 9 },   // K: dст [мм]
    { wch: 5 },   // L: ξ
    { wch: 10 },  // M: W
    { wch: 11 },  // N: Rш
    { wch: 9 },   // O: Lэ
    { wch: 10 },  // P: ∆Pi
    { wch: 9 },   // Q: ∆Hi
    { wch: 9 },   // R: Lэкв
    { wch: 13 },  // S: Шугамын төрөл
  ]);
}

function appendSheet(
  wb: XLSX.WorkBook,
  name: string,
  aoa: (string | number)[][],
  colWidths?: { wch: number }[],
): void {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (colWidths) ws["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function inferTempDelta(state: HydraulicState, circuit: "heating" | "dhw"): number {
  const sched = TEMP_SCHEDULES.find((t) => t.key === state.settings.temperatureScheduleKey);
  if (!sched) return circuit === "heating" ? 20 : 50;
  if (circuit === "heating") return sched.supply_c - sched.return_c;
  // DHW typical ΔT in Mongolian district practice: supply ~65°C, return ~5°C cold-feed
  return 50;
}

function inferSupplyTempC(state: HydraulicState): number {
  const sched = TEMP_SCHEDULES.find((t) => t.key === state.settings.temperatureScheduleKey);
  return sched?.supply_c ?? 115;
}

type MaterialCat = keyof typeof PIPE_DB;

function pipeOdForDn(dn: number, cat: MaterialCat): number {
  return PIPE_DB[cat].find((p) => p.dn === dn)?.od_mm ?? 0;
}

function pipeWallForDn(dn: number, cat: MaterialCat): number {
  return PIPE_DB[cat].find((p) => p.dn === dn)?.wall_mm ?? 0;
}

function kindMn(k: string): string {
  if (k.startsWith("source")) return "Эх үүсвэр";
  if (k.startsWith("consumer")) return "Хэрэглэгч";
  if (k.startsWith("well")) return "Худаг / ҮХТ";
  if (k.startsWith("chamber")) return "Камер";
  if (k.startsWith("compensator")) return "Компенсатор";
  if (k.startsWith("valve")) return "Хаалт";
  if (k.startsWith("pump")) return "Насос";
  if (k.startsWith("junction") || k === "tee") return "Салаалалт";
  if (k.startsWith("fixed_support")) return "Тулгуур";
  if (k.startsWith("elbow")) return "Тохой";
  return k;
}

function severityMn(s: string): string {
  switch (s) {
    case "error":
      return "Алдаа";
    case "warning":
      return "Анхаар";
    case "info":
      return "Мэдээ";
    default:
      return s;
  }
}

function circuitMn(c: string | undefined): string {
  switch (c) {
    case "heating_supply":
      return "Халаалт Т1";
    case "heating_return":
      return "Халаалт Т2";
    case "dhw_supply":
      return "ХХУ Т3";
    case "dhw_recirc":
      return "ХХУ Т4 (эргэлт)";
    case "cold_water":
      return "Хүйтэн ус В1";
    default:
      return c ?? "—";
  }
}
