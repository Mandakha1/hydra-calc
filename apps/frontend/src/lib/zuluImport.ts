/**
 * Zulu Thermo .sqlite project importer.
 *
 * Reads any of the 10 standard Zulu Thermo tables (suffixes:
 *   _istok, _kamera, _ctp, _uzvvod, _nasos, _drossel, _ZADVIGKA, _Peremich, _uch, _op
 * ) and constructs a HydraulicState we can render in our editor.
 *
 * Geometry note: SQLite holds NO x/y coords (those live in proprietary .b00-.b10
 * spatial layers). We auto-layout via a topology-aware grid so engineers can
 * inspect the imported network immediately, then drag nodes to align if needed.
 *
 * Cyrillic note: Zulu writes Cyrillic strings as Windows-1251 bytes stored as
 * SQLite TEXT. In the browser, sql.js exposes raw bytes — we re-decode cp1251
 * to proper Unicode.
 */
import initSqlJs, { type Database, type SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import type { HydraulicState, SchemeNode, SchemePipe } from "../components/hydraulic/hydraulicTypes";
import { PX_PER_METER } from "../components/hydraulic/nodeCatalog";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSqlJs() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return SQL;
}

/* ---------------- cp1251 decoder ---------------- */
const CP1251_TABLE = [
  ...Array.from({ length: 0x80 }, (_, i) => String.fromCharCode(i)),
  // 0x80-0xFF subset for Cyrillic
  "\u0402","\u0403","\u201A","\u0453","\u201E","\u2026","\u2020","\u2021",
  "\u20AC","\u2030","\u0409","\u2039","\u040A","\u040C","\u040B","\u040F",
  "\u0452","\u2018","\u2019","\u201C","\u201D","\u2022","\u2013","\u2014",
  "?","\u2122","\u0459","\u203A","\u045A","\u045C","\u045B","\u045F",
  "\u00A0","\u040E","\u045E","\u0408","\u00A4","\u0490","\u00A6","\u00A7",
  "\u0401","\u00A9","\u0404","\u00AB","\u00AC","\u00AD","\u00AE","\u0407",
  "\u00B0","\u00B1","\u0406","\u0456","\u0491","\u00B5","\u00B6","\u00B7",
  "\u0451","\u2116","\u0454","\u00BB","\u0458","\u0405","\u0455","\u0457",
  "\u0410","\u0411","\u0412","\u0413","\u0414","\u0415","\u0416","\u0417",
  "\u0418","\u0419","\u041A","\u041B","\u041C","\u041D","\u041E","\u041F",
  "\u0420","\u0421","\u0422","\u0423","\u0424","\u0425","\u0426","\u0427",
  "\u0428","\u0429","\u042A","\u042B","\u042C","\u042D","\u042E","\u042F",
  "\u0430","\u0431","\u0432","\u0433","\u0434","\u0435","\u0436","\u0437",
  "\u0438","\u0439","\u043A","\u043B","\u043C","\u043D","\u043E","\u043F",
  "\u0440","\u0441","\u0442","\u0443","\u0444","\u0445","\u0446","\u0447",
  "\u0448","\u0449","\u044A","\u044B","\u044C","\u044D","\u044E","\u044F",
];

function decodeCp1251(s: string): string {
  // sql.js returns TEXT as JS strings where each char-code = original byte.
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    out += c < 0x100 ? CP1251_TABLE[c] ?? "?" : s[i]!;
  }
  return out;
}

function decodeIfString(v: SqlValue | undefined): SqlValue {
  if (v == null) return null;
  return typeof v === "string" ? decodeCp1251(v) : v;
}

/* ---------------- table discovery ---------------- */

interface ZuluTables {
  istok?: string;
  kamera?: string;
  ctp?: string;
  uzvvod?: string;
  nasos?: string;
  drossel?: string;
  zadvigka?: string;
  peremich?: string;
  uch?: string;
  op?: string;
  /** Network prefix (e.g. "Teplo" from "Teplo_istok"). */
  prefix?: string;
}

function discoverTables(db: Database): ZuluTables {
  const r = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  if (!r[0]) return {};
  const names = r[0].values.map((v) => v[0] as string);
  const out: ZuluTables = {};
  for (const n of names) {
    const lower = n.toLowerCase();
    if (lower.endsWith("_istok")) { out.istok = n; out.prefix = n.slice(0, -6); }
    else if (lower.endsWith("_kamera")) out.kamera = n;
    else if (lower.endsWith("_ctp")) out.ctp = n;
    else if (lower.endsWith("_uzvvod")) out.uzvvod = n;
    else if (lower.endsWith("_nasos")) out.nasos = n;
    else if (lower.endsWith("_drossel")) out.drossel = n;
    else if (lower.endsWith("_zadvigka")) out.zadvigka = n;
    else if (lower.endsWith("_peremich")) out.peremich = n;
    else if (lower.endsWith("_uch")) out.uch = n;
    else if (lower.endsWith("_op")) out.op = n;
  }
  return out;
}

function rows(db: Database, table: string): Record<string, SqlValue>[] {
  if (!table) return [];
  try {
    const r = db.exec(`SELECT * FROM "${table}"`);
    if (!r[0]) return [];
    const cols = r[0].columns;
    return r[0].values.map((v) => {
      const obj: Record<string, SqlValue> = {};
      cols.forEach((c, i) => (obj[c] = decodeIfString(v[i] as SqlValue)));
      return obj;
    });
  } catch {
    return [];
  }
}

/* ---------------- field mappers ---------------- */

const M = (m: number) => Math.round(m * PX_PER_METER);

function s(v: SqlValue | undefined): string | undefined {
  return typeof v === "string" ? v : v != null ? String(v) : undefined;
}
function n(v: SqlValue | undefined): number | undefined {
  return typeof v === "number" ? v : v != null && !isNaN(Number(v)) ? Number(v) : undefined;
}
const num = (v: SqlValue | undefined, fallback = 0) => n(v) ?? fallback;

function pickSourceKind(name: string | undefined): string {
  const t = (name ?? "").toLowerCase();
  if (t.includes("тэц") || t.includes("tec")) return "source_tec";
  if (t.includes("котельн") || t.includes("kotel")) return "source_boiler";
  if (t.includes("цтп") || t.includes("ctp") || t.includes("ттп")) return "source_substation";
  return "source_tec";
}

function pickConsumerKind(N_schem: number | undefined, hzdan: number | undefined, adres: string | undefined): string {
  const a = (adres ?? "").toLowerCase();
  if (a.includes("школ") || a.includes("сургуул")) return "consumer_school";
  if (a.includes("больниц") || a.includes("эмнэлэг")) return "consumer_hospital";
  if (a.includes("офис") || a.includes("админ")) return "consumer_office";
  if (a.includes("магаз") || a.includes("дэлгүүр")) return "consumer_retail";
  if (a.includes("завод") || a.includes("цех") || a.includes("үйлдвэр")) return "consumer_industrial";
  // ИТП scheme № lookup (rough): low N + low height = house
  if ((hzdan ?? 0) <= 10) return "consumer_house";
  return "consumer_apartment";
}

function pickValveKind(name: string | undefined): string {
  const t = (name ?? "").toLowerCase();
  if (t.includes("регулятор давлен")) return "valve_regulator";
  if (t.includes("обратн")) return "valve_check";
  if (t.includes("вентил") || t.includes("globe")) return "valve_globe";
  if (t.includes("шар") || t.includes("ball")) return "valve_ball";
  return "valve_gate";
}

/* ---------------- auto-layout (BFS grid) ---------------- */

function autoLayout(
  nodes: Map<string, { id: string; depth: number }>,
  pipes: { fromId: string; toId: string }[],
  rootKey: string,
  cellSpacing_m = 60,
): Map<string, { x_m: number; y_m: number }> {
  const layout = new Map<string, { x_m: number; y_m: number }>();
  // BFS layers from root
  const adj = new Map<string, string[]>();
  for (const p of pipes) {
    if (!adj.has(p.fromId)) adj.set(p.fromId, []);
    adj.get(p.fromId)!.push(p.toId);
    if (!adj.has(p.toId)) adj.set(p.toId, []);
    adj.get(p.toId)!.push(p.fromId);
  }
  const depth = new Map<string, number>();
  depth.set(rootKey, 0);
  const queue = [rootKey];
  while (queue.length > 0) {
    const u = queue.shift()!;
    const d = depth.get(u)!;
    for (const v of adj.get(u) ?? []) {
      if (!depth.has(v)) {
        depth.set(v, d + 1);
        queue.push(v);
      }
    }
  }
  // Group by depth
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depth) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  // Place — col = depth × cellSpacing, row distributed
  for (const [d, ids] of byDepth) {
    const x = 30 + d * cellSpacing_m;
    const totalH = (ids.length - 1) * (cellSpacing_m * 0.6);
    ids.forEach((id, i) => {
      const y = 200 - totalH / 2 + i * cellSpacing_m * 0.6;
      layout.set(id, { x_m: x, y_m: y });
    });
  }
  // Orphans (no path to root)
  let orphanX = 30;
  for (const id of nodes.keys()) {
    if (!layout.has(id)) {
      layout.set(id, { x_m: orphanX, y_m: 600 });
      orphanX += 30;
    }
  }
  return layout;
}

/* ---------------- main importer ---------------- */

export interface ZuluImportResult {
  state: HydraulicState;
  stats: {
    sources: number;
    junctions: number;
    consumers: number;
    substations: number;
    pumps: number;
    valves: number;
    pipes: number;
    totalLoad_kW: number;
  };
  warnings: string[];
}

export async function importZuluSqlite(arrayBuffer: ArrayBuffer): Promise<ZuluImportResult> {
  const sqlJs = await getSqlJs();
  const db = new sqlJs.Database(new Uint8Array(arrayBuffer));
  const tables = discoverTables(db);
  if (!tables.istok && !tables.kamera) {
    db.close();
    throw new Error("Энэ файл Zulu Thermo SQLite биш бололтой (istok/kamera хүснэгт олдсонгүй)");
  }

  const warnings: string[] = [];
  const nodeMap = new Map<string, SchemeNode>();
  const idByName = new Map<string, string>();
  const stats = { sources: 0, junctions: 0, consumers: 0, substations: 0, pumps: 0, valves: 0, pipes: 0, totalLoad_kW: 0 };

  const slug = (name: string) => name.replace(/[^\w\dА-Яа-я]+/g, "_");

  function register(node: SchemeNode, originalName: string) {
    nodeMap.set(node.id, node);
    idByName.set(originalName, node.id);
  }

  /* --- Sources (_istok) — populate structured Zulu fields --- */
  let firstSourceMeta: Record<string, number | string | undefined> = {};
  for (const r of rows(db, tables.istok ?? "")) {
    const name = s(r.Name) ?? `Источник-${r.Sys}`;
    const id = `src_${slug(name)}_${r.Sys}`;
    const kind = pickSourceKind(s(r.Name));
    register({
      id, kind, label: name, x: 0, y: 0,
      elevation_m: n(r.H_geo),
      heatLoad_w: num(r.Qsum) * 1163 * 1000,
      adres: s(r.Name_pred),
      t1_r: n(r.T1_r), tnv_r: n(r.Tnv_r),
      qo_r: n(r.Qo_r), qsv_r: n(r.Qsv_r), qgv_r: n(r.Qgv_r),
      cost_q: n(r.Cost_q), cost_w: n(r.Cost_w),
    }, name);
    stats.sources += 1;
    if (Object.keys(firstSourceMeta).length === 0) {
      firstSourceMeta = {
        tsg_pod_c: n(r.Tsg_pod), tsg_obr_c: n(r.Tsg_obr),
        tsg_grunt_c: n(r.Tsg_grunt), tsg_nv_c: n(r.Tsg_nv),
        tsg_podval_c: n(r.Tsg_podval),
        cost_q: n(r.Cost_q), cost_w: n(r.Cost_w),
        period: n(r.Period), nist: n(r.Nist),
        sourcePressure_mpa: n(r.Pt_pod) ? n(r.Pt_pod)! / 102 : undefined,
        T1: n(r.T1_r), Tnv: n(r.Tnv_r),
      };
    }
  }

  /* --- Cameras (_kamera) → chambers — keep computed results --- */
  for (const r of rows(db, tables.kamera ?? "")) {
    const name = s(r.Name) ?? `Камер-${r.Sys}`;
    const id = `cam_${slug(name)}_${r.Sys}`;
    register({
      id, kind: "chamber", label: name, x: 0, y: 0,
      elevation_m: n(r.H_geo),
      result_h_pod_m: n(r.H_pod),
      result_h_obr_m: n(r.H_obr),
      result_p_pod_mpa: n(r.Ppod) != null ? n(r.Ppod)! / 102 : undefined,
      result_p_obr_mpa: n(r.Pobr) != null ? n(r.Pobr)! / 102 : undefined,
      result_t_pod_c: n(r.Tpod),
      result_t_obr_c: n(r.Tobr),
      result_g_pod_kg_s: n(r.Gpod) != null ? n(r.Gpod)! / 3.6 : undefined,
      result_g_obr_kg_s: n(r.Gobr) != null ? n(r.Gobr)! / 3.6 : undefined,
      result_dist_from_src_m: n(r.Dist),
      result_transit_time_s: n(r.Time),
    }, name);
    stats.junctions += 1;
  }

  /* --- ЦТП (_ctp) → substations — populate 50+ Zulu fields structurally --- */
  for (const r of rows(db, tables.ctp ?? "")) {
    const name = s(r.Name) ?? `ЦТП-${r.Sys}`;
    const id = `ctp_${slug(name)}_${r.Sys}`;
    const Q_kW = num(r.Qsum) * 1163;
    stats.totalLoad_kW += Q_kW;
    register({
      id, kind: "source_substation", label: name, x: 0, y: 0,
      elevation_m: n(r.H_geo),
      heatLoad_w: Q_kW * 1000,
      requiredPressure_mpa: 0.15,
      adres: s(r.Adres),
      n_schem: n(r.N_schem),
      kb: n(r.Kb),
      regul_g: n(r.Regul_G),
      regul_t: n(r.Regul_T),
      hzapas: n(r.Hzapas),
      t1_r: n(r.T1_r), t2_r: n(r.T2_r), t3_r: n(r.T3_r), tnv_r: n(r.Tnv_r),
      qo_r: n(r.Qo_t), qgv_sred: n(r.Qgv_t),
      qpot_ts: n(r.Qpot_ts), qut_pod: n(r.Qut_pod), qut_obr: n(r.Qut_obr), qut_potr: n(r.Qut_potr),
      nsec_so: n(r.Nsec_so), ngr_so: n(r.Ngr_so), hsec_so: n(r.Hsec_so),
      t11_niz: n(r.T11_niz), t12_niz: n(r.T12_niz), t21_niz: n(r.T21_niz), t22_niz: n(r.T22_niz),
      q_niz: n(r.Q_niz), gniz: n(r.Gniz), g2_niz: n(r.G2_niz),
      t11_verh: n(r.T11_verh), t12_verh: n(r.T12_verh), t21_verh: n(r.T21_verh), t22_verh: n(r.T22_verh),
      q_verh: n(r.Q_verh), gverh: n(r.Gverh), g2_verh: n(r.G2_verh),
      dshb_pod_mm: n(r.Dshb_pod), nshb_pod: n(r.Nshb_pod),
      dshb_obr_mm: n(r.Dshb_obr), nshb_obr: n(r.Nshb_obr),
      dshb_gvs_mm: n(r.Dshb_gvs), nshb_gvs: n(r.Nshb_gvs),
      nel: n(r.Nel_r), dsop_mm: n(r.Dsop_r),
      u_calc: n(r.U_calc), u_fakt: n(r.U_fakt),
      result_h_pod_m: n(r.H_pod), result_h_obr_m: n(r.H_obr),
      result_p_pod_mpa: n(r.Ppod) != null ? n(r.Ppod)! / 102 : undefined,
      result_p_obr_mpa: n(r.Pobr) != null ? n(r.Pobr)! / 102 : undefined,
    }, name);
    stats.substations += 1;
  }

  /* --- Building inputs (_uzvvod) → consumers — 147 Zulu fields → structured --- */
  for (const r of rows(db, tables.uzvvod ?? "")) {
    const name = s(r.Name) ?? `Узел-${r.Sys}`;
    const id = `bld_${slug(name)}_${r.Sys}`;
    const Qo = num(r.Qo_r);
    const Qgv = num(r.Qgv_sred ?? r.Qgv_r);
    const Q_kW = (Qo + Qgv) * 1163;
    stats.totalLoad_kW += Q_kW;
    const Hzdan = n(r.Hzdan);
    const adres = s(r.Adres);
    const kind = pickConsumerKind(n(r.N_schem), Hzdan, adres);
    register({
      id, kind, label: name, x: 0, y: 0,
      elevation_m: n(r.H_geo),
      buildingHeight_m: Hzdan, hzdan: Hzdan,
      floors: Hzdan ? Math.round(Hzdan / 3) : undefined,
      heatLoad_w: Q_kW * 1000,
      requiredPressure_mpa: 0.15,
      adres,
      n_schem: n(r.N_schem),
      njil: n(r.Njil),
      kso: n(r.Kso), ksv: n(r.Ksv), kgv: n(r.Kgv), kb: n(r.Kb),
      t1_r: n(r.T1_r), t2_r: n(r.T2_r), t3_r: n(r.T3_r), tnv_r: n(r.Tnv_r),
      qo_r: Qo, qsv_r: n(r.Qsv_r), qgv_r: n(r.Qgv_r),
      qgv_sred: n(r.Qgv_sred), qgv_max: n(r.Qgv_max),
      regul_g: n(r.Regul_G), regul_t: n(r.Regul_T), klapan_sv: n(r.Klapan_sv),
      hzapas: n(r.Hzapas),
      nel: n(r.Nel_r), dsop_mm: n(r.Dsop_r),
      u_calc: n(r.U_calc), u_fakt: n(r.U_fakt),
      nsec_so: n(r.Nsec_so), ngr_so: n(r.Ngr_so), hsec_so: n(r.Hsec_so),
      t11_niz: n(r.T11_niz), t12_niz: n(r.T12_niz), t21_niz: n(r.T21_niz), t22_niz: n(r.T22_niz),
      q_niz: n(r.Q_niz), gniz: n(r.Gniz), g2_niz: n(r.G2_niz),
      t11_verh: n(r.T11_verh), t12_verh: n(r.T12_verh), t21_verh: n(r.T21_verh), t22_verh: n(r.T22_verh),
      q_verh: n(r.Q_verh), gverh: n(r.Gverh), g2_verh: n(r.G2_verh),
      dshb_pod_mm: n(r.Dshb_pod), nshb_pod: n(r.Nshb_pod),
      dshb_obr_mm: n(r.Dshb_obr), nshb_obr: n(r.Nshb_obr),
      dshb_gvs_mm: n(r.Dshb_gvs), nshb_gvs: n(r.Nshb_gvs),
      qpot_ts: n(r.Qpot_ts),
      qut_pod: n(r.Qut_pod), qut_obr: n(r.Qut_obr), qut_potr: n(r.Qut_potr),
    }, name);
    stats.consumers += 1;
  }

  /* --- Pumps (_nasos) --- */
  for (const r of rows(db, tables.nasos ?? "")) {
    const name = s(r.Name) ?? `Насос-${r.Sys}`;
    const id = `pump_${slug(name)}_${r.Sys}`;
    register({
      id,
      kind: "pump_circ",
      label: name,
      x: 0,
      y: 0,
      elevation_m: n(r.H_geo),
      pump: {
        H_m: num(r.H ?? r.Hras ?? r.Hnom),
        Q_m3h: num(r.Q ?? r.Gnom ?? 0),
      },
    }, name);
    stats.pumps += 1;
  }

  /* --- Throttle washers / regulators (_drossel) --- */
  for (const r of rows(db, tables.drossel ?? "")) {
    const name = s(r.Name) ?? `Дроссель-${r.Sys}`;
    const id = `dr_${slug(name)}_${r.Sys}`;
    register({
      id, kind: "valve_regulator", label: name, x: 0, y: 0,
      elevation_m: n(r.H_geo),
      dshb_pod_mm: n(r.Dshb_pod), nshb_pod: n(r.Nshb_pod),
      dshb_obr_mm: n(r.Dshb_obr), nshb_obr: n(r.Nshb_obr),
      dbp_pod_mm: n(r.Dbp_pod), lbp_pod_m: n(r.Lbp_pod),
      hzapas: n(r.Hzapas),
      regul_g: n(r.Regul_G),
      kv_pod: n(r.Kv_pod), kv_obr: n(r.Kv_obr),
      result_h_pod_m: n(r.Hin_pod),
      result_h_obr_m: n(r.Hin_obr),
      result_p_pod_mpa: n(r.Pin_pod) != null ? n(r.Pin_pod)! / 102 : undefined,
      result_p_obr_mpa: n(r.Pin_obr) != null ? n(r.Pin_obr)! / 102 : undefined,
      result_t_pod_c: n(r.Tpod),
      result_t_obr_c: n(r.Tobr),
    }, name);
    stats.valves += 1;
  }

  /* --- Gate valves (_ZADVIGKA) — manufacturer mark, % open per circuit --- */
  for (const r of rows(db, tables.zadvigka ?? "")) {
    const name = s(r.Name) ?? `Задвижка-${r.Sys}`;
    const id = `zv_${slug(name)}_${r.Sys}`;
    register({
      id, kind: pickValveKind(name), label: name, x: 0, y: 0,
      elevation_m: n(r.H_geo),
      isOpen: num(r.Per_pod, 1) >= 0.99,
      mark_pod: s(r.Mark_pod), mark_obr: s(r.Mark_obr),
      per_pod: n(r.Per_pod), per_obr: n(r.Per_obr),
      dshb_pod_mm: n(r.Dpod) != null ? n(r.Dpod)! * 1000 : undefined,
      dshb_obr_mm: n(r.Dobr) != null ? n(r.Dobr)! * 1000 : undefined,
      result_h_pod_m: n(r.H_pod),
      result_h_obr_m: n(r.H_obr),
      result_p_pod_mpa: n(r.Ppod) != null ? n(r.Ppod)! / 102 : undefined,
      result_p_obr_mpa: n(r.Pobr) != null ? n(r.Pobr)! / 102 : undefined,
      result_t_pod_c: n(r.Tpod),
      result_t_obr_c: n(r.Tobr),
    }, name);
    stats.valves += 1;
  }

  /* --- Pipe segments (_uch) --- */
  const pipeList: SchemePipe[] = [];
  for (const r of rows(db, tables.uch ?? "")) {
    const beginName = s(r.Begin_uch);
    const endName = s(r.End_uch);
    if (!beginName || !endName) continue;
    const fromId = idByName.get(beginName);
    const toId = idByName.get(endName);
    if (!fromId || !toId) {
      warnings.push(`Хоолой ${beginName} → ${endName}: зангилаа олдсонгүй (skip)`);
      continue;
    }
    const Dpod_m = num(r.Dpod);
    const Dobr_m = num(r.Dobr);
    const Dpod_mm = Dpod_m * 1000;
    const Dobr_mm = Dobr_m * 1000;
    const dn = Math.round(Dpod_mm || Dobr_mm);
    pipeList.push({
      id: `pipe_${r.Sys}`,
      fromNodeId: fromId,
      toNodeId: toId,
      materialKey: num(r.Ke_pod) > 0.3 ? "steel_aged" : "preinsulated",
      dn, length_m: num(r.L),
      circuit: "heating_supply",
      laying: ["above_ground","underground_channel","underground_channelless","lotok","indoor"][Math.min(4, num(r.Proklad, 2)) - 1] as SchemePipe["laying"],
      burialDepth_m: n(r.Hzal),
      roughness_mm: n(r.Ke_pod),
      dpod_mm: Dpod_mm || undefined,
      dobr_mm: Dobr_mm || undefined,
      ke_pod_mm: n(r.Ke_pod), ke_obr_mm: n(r.Ke_obr),
      zarost_pod: n(r.Zarost_pod), zarost_obr: n(r.Zarost_obr),
      kz_pod: n(r.Kz_pod), kz_obr: n(r.Kz_obr),
      spod: n(r.Spod), sobr: n(r.Sobr),
      proklad: n(r.Proklad),
      norma: s(r.Norma),
      hzal_m: n(r.Hzal),
      izol_pod_code: n(r.Izol_pod),
      grunt: n(r.Grunt),
      statZone: n(r.StatZone),
      use_pod: n(r.Use_pod), use_obr: n(r.Use_obr),
      kpoprav: n(r.Kpoprav), kpop_obr: n(r.Kpop_obr),
    });
    stats.pipes += 1;
  }

  /* --- Auto-layout --- */
  const rootId = nodeMap.values().next().value?.id ?? "";
  const lay = autoLayout(
    new Map([...nodeMap].map(([k]) => [k, { id: k, depth: 0 }])),
    pipeList.map((p) => ({ fromId: p.fromNodeId, toId: p.toNodeId })),
    rootId,
  );
  for (const node of nodeMap.values()) {
    const pos = lay.get(node.id) ?? { x_m: 50, y_m: 50 };
    node.x = M(pos.x_m);
    node.y = M(pos.y_m);
  }

  db.close();

  // Detect temperature schedule from primary source's T1
  const T1 = (firstSourceMeta.T1 as number | undefined) ?? 130;
  const firstSourceT1 =
    T1 >= 140 ? "150_70" :
    T1 >= 125 ? "130_70" :
    T1 >= 110 ? "115_70" :
    T1 >= 100 ? "105_70" :
    "95_70";

  return {
    state: {
      nodes: Array.from(nodeMap.values()),
      pipes: pipeList,
      schemaVersion: 5,
      settings: {
        networkType: "two_pipe_closed",
        temperatureScheduleKey: firstSourceT1,
        city: "Улаанбаатар",
        designOutdoorTemp_c: firstSourceMeta.Tnv as number | undefined,
        primaryMaterialCategory: "steel",
        localLossesFraction: 0.3,
        sourcePressure_mpa: (firstSourceMeta.sourcePressure_mpa as number) ?? 0.6,
        tsg_pod_c: firstSourceMeta.tsg_pod_c as number | undefined,
        tsg_obr_c: firstSourceMeta.tsg_obr_c as number | undefined,
        tsg_grunt_c: firstSourceMeta.tsg_grunt_c as number | undefined,
        tsg_nv_c: firstSourceMeta.tsg_nv_c as number | undefined,
        tsg_podval_c: firstSourceMeta.tsg_podval_c as number | undefined,
        cost_q: firstSourceMeta.cost_q as number | undefined,
        cost_w: firstSourceMeta.cost_w as number | undefined,
        period: firstSourceMeta.period as number | undefined,
        nist: firstSourceMeta.nist as number | undefined,
      },
    },
    stats,
    warnings,
  };
}
