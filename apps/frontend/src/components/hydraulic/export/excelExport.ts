import * as XLSX from "xlsx";
import { PIPE_DB, PIPE_MATERIALS, TEMP_SCHEDULES, CLIMATE } from "shared";
import type { HydraulicState } from "../hydraulicTypes";

export function exportToExcel(state: HydraulicState, filename = "hydra-calc.xlsx"): void {
  const wb = XLSX.utils.book_new();

  /* ---- Sheet: Тойм ---- */
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
      ["Макс. хурд (м/с)", state.results.maxVelocity_m_s.toFixed(3)],
      ["Макс. R (Pa/м)", state.results.maxHeadlossPerMeter_pa.toFixed(1)],
      ["Мин. хэрэглэгчийн даралт (MPa)", state.results.minConsumerPressure_mpa.toFixed(3)],
    );
    if (state.results.pump) {
      summary.push(
        ["Насос H (м)", state.results.pump.H_m.toFixed(2)],
        ["Насос Q (м³/ц)", state.results.pump.Q_m3h.toFixed(2)],
        ["Насос P (кВт)", state.results.pump.P_kW.toFixed(2)],
      );
    }
  }
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Тойм");

  /* ---- Sheet: Зангилаа ---- */
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
  const nodesRows = state.nodes.map((n, i) => {
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
  const wsNodes = XLSX.utils.aoa_to_sheet([nodesHeader, ...nodesRows]);
  XLSX.utils.book_append_sheet(wb, wsNodes, "Зангилаа");

  /* ---- Sheet: Хоолой ---- */
  const pipesHeader = [
    "№",
    "ID",
    "Эхлэл",
    "Төгсгөл",
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
  const pipesRows = state.pipes.map((p, i) => {
    const r = state.results?.pipes.find((x) => x.pipeId === p.id);
    const mat = PIPE_MATERIALS.find((m) => m.key === p.materialKey)?.name ?? p.materialKey;
    return [
      i + 1,
      p.id,
      p.fromNodeId,
      p.toNodeId,
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
  const wsPipes = XLSX.utils.aoa_to_sheet([pipesHeader, ...pipesRows]);
  XLSX.utils.book_append_sheet(wb, wsPipes, "Хоолой");

  /* ---- Sheet: Норм шалгалт ---- */
  const violations = state.violations ?? [];
  const violationsHeader = ["№", "Төрөл", "Хүндрэл", "Мессеж", "Объект ID", "Хязгаар", "Бодит утга", "Нэгж"];
  const violationsRows = violations.map((v, i) => [
    i + 1,
    v.kind,
    severityMn(v.severity),
    v.message,
    v.target.id,
    v.threshold,
    v.actual.toFixed(3),
    v.unit,
  ]);
  const wsV = XLSX.utils.aoa_to_sheet([violationsHeader, ...violationsRows]);
  XLSX.utils.book_append_sheet(wb, wsV, "Норм шалгалт");

  /* ---- Sheet: Сортамент ---- */
  const cat = state.settings.primaryMaterialCategory;
  const dbHeader = ["DN", "OD (мм)", "Хана (мм)", "ID (мм)", "Жин (кг/м)"];
  const dbRows = PIPE_DB[cat].map((p) => [p.dn, p.od_mm, p.wall_mm, p.id_mm, p.mass_kg_per_m]);
  const wsDb = XLSX.utils.aoa_to_sheet([dbHeader, ...dbRows]);
  XLSX.utils.book_append_sheet(wb, wsDb, `Сортамент-${cat.toUpperCase()}`);

  /* ---- Sheet: Лавлах ---- */
  const refRows: (string | number)[][] = [
    ["Температурын графикууд"],
    ["Код", "Нийлүүлэх (°C)", "Буцах (°C)", "Тайлбар"],
    ...TEMP_SCHEDULES.map((t) => [t.key, t.supply_c, t.return_c, t.description]),
    [],
    ["Монгол улсын аймгийн уур амьсгал"],
    ["Хот", "Т_н.р (°C)", "Халаалтын өдөр", "Дундаж Т (°C)"],
    ...CLIMATE.map((c) => [c.city, c.tnr_c, c.heating_days, c.t_avg_heating_c]),
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(refRows);
  XLSX.utils.book_append_sheet(wb, wsRef, "Лавлах");

  XLSX.writeFile(wb, filename);
}

function kindMn(k: string): string {
  switch (k) {
    case "source": return "Источник";
    case "consumer": return "Хэрэглэгч";
    case "junction": return "Салаалалт";
    case "pump": return "Насос";
    case "well": return "Худаг / ИТП";
    default: return k;
  }
}

function severityMn(s: string): string {
  switch (s) {
    case "error": return "Алдаа";
    case "warning": return "Анхаар";
    case "info": return "Мэдээ";
    default: return s;
  }
}
