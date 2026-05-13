/**
 * Reverse export: HydraulicState → Zulu Thermo .sqlite (10 standard tables).
 *
 * Engineers can:
 *   1. Import Zulu .sqlite into Hydra Calc
 *   2. Edit / re-compute / collaborate via web
 *   3. Export back as .sqlite that opens directly in Zulu Thermo 2021
 *
 * Cyrillic encoding: Zulu reads strings as Windows-1251. We re-encode any
 * Cyrillic node labels to cp1251 bytes before writing.
 */
import initSqlJs, { type Database } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { HydraulicState, SchemeNode, SchemePipe } from "../components/hydraulic/hydraulicTypes";
// Phase 7.1 — CP1251 encoder lifted to shared module.
import { encodeCP1251ToByteString } from "./encoding";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
async function getSql() {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  return SQL;
}

// Phase 7.1 — CP1251 encoder lives in `./encoding.ts`. The Zulu
// .sqlite path keeps using the byte-string variant since sql.js
// writes JS strings as raw bytes one-char-per-byte.
const encodeCp1251 = encodeCP1251ToByteString;

/* ---------------- table DDL ---------------- */
const DDL = {
  istok: `CREATE TABLE "{p}_istok" (
    Sys INTEGER PRIMARY KEY, Name_pred TEXT, Name TEXT,
    Nist REAL, H_geo REAL, T1_r REAL, Tnv_r REAL,
    Qsum REAL, Gsum_pod REAL, Hstat REAL,
    Cost_q REAL, Cost_w REAL, Period REAL,
    Tsg_pod REAL, Tsg_obr REAL, Tsg_grunt REAL, Tsg_nv REAL, Tsg_podval REAL,
    Pt_pod REAL, Pt_obr REAL, Mode REAL
  )`,
  kamera: `CREATE TABLE "{p}_kamera" (
    Sys INTEGER PRIMARY KEY, Name TEXT, Nist REAL, H_geo REAL,
    Gpod REAL, Gobr REAL,
    H_ras REAL, H_pod REAL, H_obr REAL,
    Tpod REAL, Tobr REAL, Ppod REAL, Pobr REAL,
    Time REAL, Dist REAL, Tb REAL, Hstat REAL, Hstat_out REAL
  )`,
  uch: `CREATE TABLE "{p}_uch" (
    Sys INTEGER PRIMARY KEY, Nist REAL, Owner TEXT,
    Begin_uch TEXT, End_uch TEXT, L REAL,
    Dpod REAL, Dobr REAL, Ke_pod REAL, Ke_obr REAL,
    Zarost_pod REAL, Zarost_obr REAL, Kz_pod REAL, Kz_obr REAL,
    Spod REAL, Sobr REAL, Proklad REAL, Norma REAL,
    Hzal REAL, Izol_pod REAL, Grunt REAL, StatZone REAL,
    Use_pod REAL, Use_obr REAL, Kpoprav REAL, Kpop_obr REAL
  )`,
  ctp: `CREATE TABLE "{p}_ctp" (
    Sys INTEGER PRIMARY KEY, Adres TEXT, Name TEXT, Nist REAL, H_geo REAL,
    N_schem REAL, T1_r REAL, T2_r REAL, T3_r REAL, Tnv_r REAL,
    Qo_t REAL, Qsv_t REAL, Qgv_t REAL, Qsum REAL, Gsum_pod REAL,
    Hzapas REAL, Kb REAL, Regul_G REAL, Regul_T REAL,
    Nsec_so REAL, Hsec_so REAL, Ngr_so REAL,
    Nel_r REAL, Dsop_r REAL, U_calc REAL, U_fakt REAL,
    Dshb_pod REAL, Nshb_pod REAL, Dshb_obr REAL, Nshb_obr REAL,
    Dshb_gvs REAL, Nshb_gvs REAL,
    H_pod REAL, H_obr REAL, Ppod REAL, Pobr REAL
  )`,
  uzvvod: `CREATE TABLE "{p}_uzvvod" (
    Sys INTEGER PRIMARY KEY, Adres TEXT, Name TEXT, Nist REAL, H_geo REAL,
    Hzdan REAL, N_schem REAL, T1_r REAL, T2_r REAL, T3_r REAL, Tnv_r REAL,
    Qo_r REAL, Qsv_r REAL, Qgv_r REAL, Qgv_sred REAL, Qgv_max REAL,
    Njil REAL, Kso REAL, Ksv REAL, Kgv REAL, Kb REAL,
    Regul_G REAL, Regul_T REAL, Klapan_sv REAL, Hzapas REAL,
    Nel_r REAL, Dsop_r REAL, U_calc REAL, U_fakt REAL,
    Nsec_so REAL, Hsec_so REAL, Ngr_so REAL,
    Dshb_pod REAL, Nshb_pod REAL, Dshb_obr REAL, Nshb_obr REAL
  )`,
  nasos: `CREATE TABLE "{p}_nasos" (
    Sys INTEGER PRIMARY KEY, Name TEXT, Nist REAL, H_geo REAL, H REAL, Q REAL
  )`,
  drossel: `CREATE TABLE "{p}_drossel" (
    Sys INTEGER PRIMARY KEY, Name TEXT, Nist REAL, H_geo REAL,
    Dshb_pod REAL, Nshb_pod REAL, Dshb_obr REAL, Nshb_obr REAL,
    Dbp_pod REAL, Lbp_pod REAL, Hzapas REAL, Regul_G REAL, H REAL,
    Kv_pod REAL, Kv_obr REAL
  )`,
  zadvigka: `CREATE TABLE "{p}_ZADVIGKA" (
    Sys INTEGER PRIMARY KEY, Name TEXT, Nist REAL, H_geo REAL,
    Mark_pod TEXT, Dpod REAL, Per_pod REAL,
    Mark_obr TEXT, Dobr REAL, Per_obr REAL
  )`,
  peremich: `CREATE TABLE "{p}_Peremich" (
    Sys INTEGER PRIMARY KEY, Name TEXT, Nist REAL, H_geo REAL,
    Lper REAL, Dper REAL, Zper REAL
  )`,
  op: `CREATE TABLE "{p}_op" (
    Sys INTEGER PRIMARY KEY, Name TEXT, Nist REAL, H_geo REAL
  )`,
} as const;

function makeTables(db: Database, prefix: string) {
  for (const ddl of Object.values(DDL)) {
    db.run(ddl.replaceAll("{p}", prefix));
  }
}

function txt(s: string | undefined | null): string | null {
  return s ? encodeCp1251(s) : null;
}

function nz(v: number | undefined | null): number | null {
  return v == null ? null : v;
}

/* ---------------- main exporter ---------------- */

export interface ExportOptions {
  /** Network prefix used in all 10 table names (e.g. "Teplo" → "Teplo_istok"). */
  prefix?: string;
}

export async function exportToZuluSqlite(
  state: HydraulicState,
  options: ExportOptions = {},
): Promise<Uint8Array> {
  const sql = await getSql();
  const db = new sql.Database();
  const prefix = options.prefix ?? "Teplo";
  makeTables(db, prefix);

  let sysCounter = 1;
  const labelById = new Map<string, string>();

  /* === Sources (_istok) === */
  const istokStmt = db.prepare(
    `INSERT INTO "${prefix}_istok" (Sys, Name_pred, Name, Nist, H_geo, T1_r, Tnv_r, Qsum, Gsum_pod, Hstat, Cost_q, Cost_w, Period, Tsg_pod, Tsg_obr, Tsg_grunt, Tsg_nv, Tsg_podval, Pt_pod, Mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind?.startsWith("source_") && n.kind !== "source_substation")) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    istokStmt.run([
      sys,
      txt(node.adres) as unknown as string,
      txt(node.label),
      1, node.elevation_m ?? 0,
      node.t1_r ?? null, node.tnv_r ?? null,
      node.heatLoad_w ? node.heatLoad_w / 1163 / 1000 : null,
      null, null,
      node.cost_q ?? state.settings.cost_q ?? null,
      node.cost_w ?? state.settings.cost_w ?? null,
      state.settings.period ?? 2,
      state.settings.tsg_pod_c ?? null,
      state.settings.tsg_obr_c ?? null,
      state.settings.tsg_grunt_c ?? null,
      state.settings.tsg_nv_c ?? null,
      state.settings.tsg_podval_c ?? null,
      (state.settings.sourcePressure_mpa ?? 0) * 102, // MPa → m
      0,
    ]);
  }
  istokStmt.free();

  /* === Cameras / chambers === */
  const kamStmt = db.prepare(
    `INSERT INTO "${prefix}_kamera" (Sys, Name, Nist, H_geo, Gpod, Gobr, H_pod, H_obr, Tpod, Tobr, Ppod, Pobr, Time, Dist, Hstat)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind === "junction" || n.kind === "chamber" || n.kind?.startsWith("well_"))) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    kamStmt.run([
      sys, txt(node.label), 1, node.elevation_m ?? 0,
      (node.result_g_pod_kg_s ?? 0) * 3.6,
      (node.result_g_obr_kg_s ?? 0) * 3.6,
      node.result_h_pod_m ?? null,
      node.result_h_obr_m ?? null,
      node.result_t_pod_c ?? null,
      node.result_t_obr_c ?? null,
      (node.result_p_pod_mpa ?? 0) * 102,
      (node.result_p_obr_mpa ?? 0) * 102,
      node.result_transit_time_s ?? null,
      node.result_dist_from_src_m ?? null,
      (state.settings.sourcePressure_mpa ?? 0.6) * 50,
    ]);
  }
  kamStmt.free();

  /* === ЦТП === */
  const ctpStmt = db.prepare(
    `INSERT INTO "${prefix}_ctp" (Sys, Adres, Name, Nist, H_geo, N_schem, T1_r, T2_r, T3_r, Tnv_r, Qo_t, Qgv_t, Qsum, Hzapas, Kb, Regul_G, Regul_T, Nsec_so, Hsec_so, Ngr_so, Nel_r, Dsop_r, U_calc, U_fakt, Dshb_pod, Nshb_pod, Dshb_obr, Nshb_obr, Dshb_gvs, Nshb_gvs, H_pod, H_obr, Ppod, Pobr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind === "source_substation")) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    ctpStmt.run([
      sys, txt(node.adres) as unknown as string, txt(node.label),
      1, node.elevation_m ?? 0,
      node.n_schem ?? null,
      node.t1_r ?? null, node.t2_r ?? null, node.t3_r ?? null, node.tnv_r ?? null,
      node.qo_r ?? null, node.qgv_sred ?? null,
      node.heatLoad_w ? node.heatLoad_w / 1163 / 1000 : null,
      node.hzapas ?? null, node.kb ?? null,
      node.regul_g ?? null, node.regul_t ?? null,
      node.nsec_so ?? null, node.hsec_so ?? null, node.ngr_so ?? null,
      node.nel ?? null, node.dsop_mm ?? null, node.u_calc ?? null, node.u_fakt ?? null,
      node.dshb_pod_mm ?? null, node.nshb_pod ?? null,
      node.dshb_obr_mm ?? null, node.nshb_obr ?? null,
      node.dshb_gvs_mm ?? null, node.nshb_gvs ?? null,
      node.result_h_pod_m ?? null, node.result_h_obr_m ?? null,
      (node.result_p_pod_mpa ?? 0) * 102,
      (node.result_p_obr_mpa ?? 0) * 102,
    ]);
  }
  ctpStmt.free();

  /* === Building inputs === */
  const uzvStmt = db.prepare(
    `INSERT INTO "${prefix}_uzvvod" (Sys, Adres, Name, Nist, H_geo, Hzdan, N_schem, T1_r, T2_r, T3_r, Tnv_r, Qo_r, Qsv_r, Qgv_r, Qgv_sred, Qgv_max, Njil, Kso, Ksv, Kgv, Kb, Regul_G, Regul_T, Klapan_sv, Hzapas, Nel_r, Dsop_r, U_calc, U_fakt, Nsec_so, Hsec_so, Ngr_so, Dshb_pod, Nshb_pod, Dshb_obr, Nshb_obr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind?.startsWith("consumer_"))) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    uzvStmt.run([
      sys, txt(node.adres) as unknown as string, txt(node.label),
      1, node.elevation_m ?? 0,
      node.hzdan ?? node.buildingHeight_m ?? null,
      node.n_schem ?? null,
      node.t1_r ?? null, node.t2_r ?? null, node.t3_r ?? null, node.tnv_r ?? null,
      node.qo_r ?? null, node.qsv_r ?? null, node.qgv_r ?? null,
      node.qgv_sred ?? null, node.qgv_max ?? null,
      node.njil ?? null,
      node.kso ?? null, node.ksv ?? null, node.kgv ?? null, node.kb ?? null,
      node.regul_g ?? null, node.regul_t ?? null, node.klapan_sv ?? null,
      node.hzapas ?? null,
      node.nel ?? null, node.dsop_mm ?? null, node.u_calc ?? null, node.u_fakt ?? null,
      node.nsec_so ?? null, node.hsec_so ?? null, node.ngr_so ?? null,
      node.dshb_pod_mm ?? null, node.nshb_pod ?? null,
      node.dshb_obr_mm ?? null, node.nshb_obr ?? null,
    ]);
  }
  uzvStmt.free();

  /* === Pumps === */
  const nasStmt = db.prepare(
    `INSERT INTO "${prefix}_nasos" (Sys, Name, Nist, H_geo, H, Q) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind?.startsWith("pump_"))) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    nasStmt.run([sys, txt(node.label), 1, node.elevation_m ?? 0, node.pump?.H_m ?? null, node.pump?.Q_m3h ?? null]);
  }
  nasStmt.free();

  /* === Throttle washers / regulators === */
  const drStmt = db.prepare(
    `INSERT INTO "${prefix}_drossel" (Sys, Name, Nist, H_geo, Dshb_pod, Nshb_pod, Dshb_obr, Nshb_obr, Dbp_pod, Lbp_pod, Hzapas, Regul_G, H, Kv_pod, Kv_obr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind === "valve_regulator")) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    drStmt.run([
      sys, txt(node.label), 1, node.elevation_m ?? 0,
      node.dshb_pod_mm ?? null, node.nshb_pod ?? null,
      node.dshb_obr_mm ?? null, node.nshb_obr ?? null,
      node.dbp_pod_mm ?? null, node.lbp_pod_m ?? null,
      node.hzapas ?? null, node.regul_g ?? null,
      null, // H — regulator setpoint
      node.kv_pod ?? null, node.kv_obr ?? null,
    ]);
  }
  drStmt.free();

  /* === Gate valves === */
  const zvStmt = db.prepare(
    `INSERT INTO "${prefix}_ZADVIGKA" (Sys, Name, Nist, H_geo, Mark_pod, Dpod, Per_pod, Mark_obr, Dobr, Per_obr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of state.nodes.filter((n) => n.kind?.startsWith("valve_") && n.kind !== "valve_regulator")) {
    const sys = sysCounter++;
    labelById.set(node.id, node.label);
    zvStmt.run([
      sys, txt(node.label), 1, node.elevation_m ?? 0,
      txt(node.mark_pod) as unknown as string,
      (node.dshb_pod_mm ?? 0) / 1000,
      node.per_pod ?? (node.isOpen ? 1.0 : 0),
      txt(node.mark_obr) as unknown as string,
      (node.dshb_obr_mm ?? 0) / 1000,
      node.per_obr ?? (node.isOpen ? 1.0 : 0),
    ]);
  }
  zvStmt.free();

  /* === Pipes (_uch) === */
  const uchStmt = db.prepare(
    `INSERT INTO "${prefix}_uch" (Sys, Nist, Owner, Begin_uch, End_uch, L, Dpod, Dobr, Ke_pod, Ke_obr, Zarost_pod, Zarost_obr, Kz_pod, Kz_obr, Spod, Sobr, Proklad, Hzal, Izol_pod, Grunt, StatZone, Use_pod, Use_obr)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let pipeSys = 1;
  for (const pipe of state.pipes) {
    const fromName = labelById.get(pipe.fromNodeId);
    const toName = labelById.get(pipe.toNodeId);
    if (!fromName || !toName) continue;
    const Dpod_m = (pipe.dpod_mm ?? pipe.dn) / 1000;
    const Dobr_m = (pipe.dobr_mm ?? pipe.dn) / 1000;
    uchStmt.run([
      pipeSys++, 1, "Hydra",
      txt(fromName), txt(toName), pipe.length_m,
      Dpod_m, Dobr_m,
      pipe.ke_pod_mm ?? pipe.roughness_mm ?? 0.5,
      pipe.ke_obr_mm ?? pipe.roughness_mm ?? 0.5,
      pipe.zarost_pod ?? 1.0, pipe.zarost_obr ?? 1.0,
      pipe.kz_pod ?? 1.0, pipe.kz_obr ?? 1.0,
      pipe.spod ?? null, pipe.sobr ?? null,
      pipe.proklad ?? 3,
      pipe.hzal_m ?? pipe.burialDepth_m ?? 1.0,
      pipe.izol_pod_code ?? 24,
      pipe.grunt ?? 1,
      pipe.statZone ?? 1,
      pipe.use_pod ?? 1, pipe.use_obr ?? 1,
    ]);
  }
  uchStmt.free();

  // Export binary
  const data = db.export();
  db.close();
  return data;
}

export function downloadAsBlob(data: Uint8Array, filename: string) {
  const blob = new Blob([data], { type: "application/x-sqlite3" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
