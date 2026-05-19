/**
 * Phase 13.19 — Excel export format tests.
 *
 * Locks the new Mongolian-template sheet structure (БНбД-style headers,
 * per-circuit hydraulic tables, heat-load + compensator sheets) so a
 * future refactor can't silently drift away from the engineer's
 * reference spreadsheet (УДД-5 Гидравлик халаалт тооцоо.xlsx).
 *
 * We exercise the export by writing to a temp file (jsdom can't host
 * the browser-native Blob path, but Node's fs is fine for xlsx), then
 * read the workbook back and assert on sheet names + key cells.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as XLSX from "xlsx";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { exportToExcel } from "../excelExport";
import type { HydraulicState } from "../../hydraulicTypes";
import { emptyState } from "../../hydraulicTypes";

function makeStateWithFixture(): HydraulicState {
  const s = emptyState();
  // Source — small ТЭЦ
  s.nodes.push({
    id: "s1",
    kind: "source_substation",
    label: "ЦТП-1",
    x: 0,
    y: 0,
    width_m: 12,
    height_m: 8,
    floors: 1,
  });
  // Two consumers — different kinds for the heat-load sheet
  s.nodes.push({
    id: "c1",
    kind: "consumer_apartment",
    label: "АОС-1",
    x: 100,
    y: 100,
    width_m: 20,
    height_m: 30,
    floors: 5,
    heatLoad_w: 405000,
  });
  s.nodes.push({
    id: "c2",
    kind: "consumer_hospital",
    label: "Эмнэлэг",
    x: 200,
    y: 100,
    width_m: 15,
    height_m: 20,
    floors: 3,
    // No explicit heatLoad_w — exporter should fall back to volumetric.
  });
  // Compensator on the trunk
  s.nodes.push({
    id: "k1",
    kind: "compensator_u",
    label: "K-1",
    x: 50,
    y: 0,
  });
  // Pipes spanning all 3 circuits — heating supply + return, DHW supply,
  // cold water — so we hit every per-circuit sheet branch. The first
  // pipe terminates at the compensator k1 so the compensator sheet has
  // attached-pipe length to drive its ΔL calc.
  s.pipes.push(
    {
      id: "p0",
      fromNodeId: "s1",
      toNodeId: "k1",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 30,
      circuit: "heating_supply",
    },
    {
      id: "p1",
      fromNodeId: "k1",
      toNodeId: "c1",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 50,
      circuit: "heating_supply",
    },
    {
      id: "p2",
      fromNodeId: "c1",
      toNodeId: "s1",
      materialKey: "steel_aged",
      dn: 100,
      length_m: 50,
      circuit: "heating_return",
    },
    {
      id: "p3",
      fromNodeId: "s1",
      toNodeId: "c2",
      materialKey: "steel_aged",
      dn: 50,
      length_m: 30,
      circuit: "dhw_supply",
    },
    {
      id: "p4",
      fromNodeId: "s1",
      toNodeId: "c1",
      materialKey: "steel_aged",
      dn: 32,
      length_m: 50,
      circuit: "cold_water",
    },
  );
  return s;
}

let tmpFile: string;
beforeEach(() => {
  tmpFile = path.join(
    os.tmpdir(),
    `hydra-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.xlsx`,
  );
});
afterEach(() => {
  if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
});

function exportAndRead(s: HydraulicState): XLSX.WorkBook {
  exportToExcel(s, tmpFile);
  expect(fs.existsSync(tmpFile)).toBe(true);
  return XLSX.readFile(tmpFile);
}

describe("Phase 13.19 — excelExport sheet structure", () => {
  it("emits the template's sheet order with all 5 mandatory sheets", () => {
    const wb = exportAndRead(makeStateWithFixture());
    // Must include in this order so engineer reading both side-by-side
    // sees a 1-to-1 layout with the УДД-5 reference workbook.
    const required = [
      "Тойм",
      "Дулааны ачаалал",
      "Халаалт гидравлик",
      "ХХУ гидравлик",
      "Хүйтэн ус гидравлик",
      "Компенсатор",
      "Зангилаа",
      "Хоолой",
      "Норм шалгалт",
    ];
    for (const name of required) {
      expect(wb.SheetNames).toContain(name);
    }
    // Order matters — Тойм must be first.
    expect(wb.SheetNames[0]).toBe("Тойм");
  });

  it("omits cold-water + compensator sheets when there is no data for them", () => {
    const s = emptyState();
    s.nodes.push({
      id: "c1",
      kind: "consumer_apartment",
      label: "АОС-1",
      x: 0,
      y: 0,
      heatLoad_w: 1000,
    });
    const wb = exportAndRead(s);
    expect(wb.SheetNames).not.toContain("Хүйтэн ус гидравлик");
    expect(wb.SheetNames).not.toContain("Компенсатор");
  });
});

describe("Phase 13.19 — heat-load sheet (Дулааны ачаалал)", () => {
  it("emits Mongolian-template header columns in the right order", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Дулааны ачаалал"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const header = rows[0] as string[];
    expect(header).toEqual([
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
    ]);
  });

  it("rows include only consumer nodes (sources / compensators excluded)", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Дулааны ачаалал"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const names = rows.slice(1, -1).map((r) => r[1] as string);
    expect(names).toContain("АОС-1");
    expect(names).toContain("Эмнэлэг");
    expect(names).not.toContain("ЦТП-1");
    expect(names).not.toContain("K-1");
  });

  it("falls back to volumetric Q (БНбД 23-02-09) when heatLoad_w is missing", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Дулааны ачаалал"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    // Hospital row — no heatLoad_w set, so the volumetric calc should
    // populate Qх.т kW. Hospital default q_v = 60 W/m³.
    //   V = 15 × 20 × (3 × 3 m default) = 2700 m³
    //   Q = 60 × 2700 = 162 kW
    const hospitalRow = rows.find((r) => r[1] === "Эмнэлэг") as unknown[];
    expect(hospitalRow).toBeDefined();
    const q_kw = hospitalRow[12] as number;
    expect(q_kw).toBeGreaterThan(100);
    expect(q_kw).toBeLessThan(220);
  });

  it("totals row sums all consumer kW + Gcal/h", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Дулааны ачаалал"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const totalRow = rows[rows.length - 1] as unknown[];
    expect(totalRow[1]).toBe("Нийт");
    // АОС 405 kW + hospital ~162 kW = ~567 kW
    expect(totalRow[12] as number).toBeGreaterThan(560);
    expect(totalRow[12] as number).toBeLessThan(600);
  });
});

describe("Phase 13.19 — hydraulic per-circuit sheet (Халаалт гидравлик)", () => {
  it("emits the two-row Mongolian-template header (Row 1 group + Row 2 columns)", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Халаалт гидравлик"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const row1 = rows[0] as (string | null)[];
    const row2 = rows[1] as (string | null)[];
    expect(row1[0]).toBe("Тооцооны хэсгийн №");
    expect(row1[1]).toBe("Тооцооны хэсгийн №");
    expect(row1[2]).toBe("Температурын зөрүү, 0С");
    expect(row1[3]).toMatch(/халаалт.*шугамын гидравлик тооцоо/);
    // Row 2 column headers at the template positions
    expect(row2[3]).toBe("Q [кВт]");
    expect(row2[4]).toBe("G [кг/с]");
    expect(row2[5]).toBe("G [т/ц]");
    expect(row2[6]).toBe("L [м]");
    expect(row2[9]).toBe("d [мм]");
    expect(row2[10]).toBe("Rш [Pa/м]");
    expect(row2[12]).toBe("W [м/с]");
    expect(row2[14]).toBe("Lэ [м]");
    expect(row2[15]).toBe("∆Pi [Pa]");
    expect(row2[16]).toBe("∆Hi [м]");
    expect(row2[17]).toBe("Lэкв");
  });

  it("contains only heating pipes (Т1 + Т2) — DHW + cold-water excluded", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Халаалт гидравлик"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    // 2 header rows + 3 data rows (heating_supply ×2 + heating_return)
    expect(rows.length).toBe(5);
  });

  it("ХХУ гидравлик sheet contains only DHW circuits (Т3 + Т4)", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["ХХУ гидравлик"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    expect(rows.length).toBe(3); // 2 headers + 1 DHW pipe
    // Row label confirms the circuit tagging
    const row1 = rows[0] as (string | null)[];
    expect(row1[3]).toMatch(/Хэрэгцээний халуун ус/);
  });

  it("Хүйтэн ус гидравлик sheet contains only cold-water (В1)", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Хүйтэн ус гидравлик"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    expect(rows.length).toBe(3); // 2 headers + 1 cold pipe
    const row1 = rows[0] as (string | null)[];
    expect(row1[3]).toMatch(/Хүйтэн ус/);
  });
});

describe("Phase 13.19 — compensator sheet (Компенсатор)", () => {
  it("emits the П-shape design columns matching the reference template", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Компенсатор"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const header = rows[0] as string[];
    expect(header).toEqual([
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
    ]);
  });

  it("rows include each compensator node with computed ΔL > 0", () => {
    const wb = exportAndRead(makeStateWithFixture());
    const ws = wb.Sheets["Компенсатор"]!;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    expect(rows.length).toBe(2); // 1 header + 1 compensator
    const data = rows[1] as unknown[];
    expect(data[0]).toBe("k-1");
    expect(data[7] as number).toBeGreaterThan(0); // ΔL mm
  });
});
