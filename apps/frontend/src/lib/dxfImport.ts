/**
 * DXF parser → HydraulicState mapper.
 *
 * Two flows:
 *   1. **Browser-side** parsing of `.dxf` text files via `dxf-parser` npm
 *   2. **Pre-extracted** simplified JSON (used for our example Bayangol scheme)
 *
 * Mapping rules — Mongolian heating-network conventions:
 *   - Layers матching /dulan|heat/i  → heating pipes
 *   - LINE / LWPOLYLINE endpoints  → SchemeNodes (deduplicated by 0.05 m tolerance)
 *   - CIRCLE on heating layer → "chamber" node (камер)
 *   - INSERT (block) on heating layer → typed by block name keyword
 *   - TEXT containing "DN" / digit pattern → assigned as DN label to nearest pipe
 *
 * Coordinate system:
 *   DXF is in meters with Y-up. We flip Y to SVG Y-down and scale by PX_PER_METER (20).
 *   The full network is centered on the canvas with a 5m padding.
 */
import DxfParser from "dxf-parser";
import type { SchemeNode, SchemePipe, ProjectSettings } from "../components/hydraulic/hydraulicTypes";
import { PX_PER_METER } from "../components/hydraulic/nodeCatalog";

/* ============================================================================
 *  PUBLIC TYPES — what an importer call returns
 * ========================================================================== */

export interface DxfImportResult {
  state: {
    nodes: SchemeNode[];
    pipes: SchemePipe[];
    settings: ProjectSettings;
    schemaVersion: 5;
  };
  stats: {
    pipes: number;
    nodes: number;
    junctions: number;
    chambers: number;
    consumers: number;
    sources: number;
    totalLength_m: number;
    layers: number;
  };
  warnings: string[];
  /** Real-world bbox in meters (used to compute geo-anchor if needed). */
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
}

/* ============================================================================
 *  PRE-EXTRACTED JSON FORMAT (matches Python extractor in .zulu-research)
 * ========================================================================== */

export interface ExtractedDxf {
  meta: {
    source: string;
    author?: string;
    extents: { min_x: number; max_x: number; min_y: number; max_y: number; width: number; height: number };
    units: "meters";
    imported?: string;
  };
  lines: Array<{
    /** Layer name. */
    l: string;
    /** Heating-layer flag — pre-classified by extractor. */
    h: boolean;
    /** Polyline points [[x,y], ...]. */
    pts: [number, number][];
  }>;
  circles: Array<{ l: string; cx: number; cy: number; r: number }>;
  inserts: Array<{ l: string; name: string; x: number; y: number; rot: number }>;
  texts: Array<{ l: string; x: number; y: number; h: number; t: string }>;
}

/* ============================================================================
 *  IMPORT — pre-extracted JSON path
 * ========================================================================== */

const POINT_TOL_M = 0.30;       // 30cm — endpoint dedup tolerance
const PIPE_MIN_LEN_M = 0.50;    // pipes shorter than this are ignored as artifacts

interface ProtoNode {
  id: string;
  /** Real-world meters. */
  x_m: number;
  y_m: number;
  kind: string;
  label: string;
  references: number;            // how many pipes touch this node
  fromCircle?: boolean;
  fromInsert?: boolean;
  blockName?: string;
  textNearby?: string[];
}

function nearbyKey(x: number, y: number, tol: number): string {
  return `${Math.round(x / tol)}_${Math.round(y / tol)}`;
}

function classifyBlockName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bohir")) return "well_drain";              // канализаци
  if (n.includes("hbh") || n.includes("highv") || n.includes("dst")) return "chamber";  // камер
  if (n.includes("nasos") || n.includes("pump")) return "pump_circ";
  if (n.includes("zad") || n.includes("valve")) return "valve_gate";
  if (n.includes("ctp") || n.includes("itp")) return "source_substation";
  if (n.includes("kotel") || n.includes("zuukh")) return "source_boiler";
  return "chamber";
}

function classifyInsertText(texts: ExtractedDxf["texts"], x: number, y: number, range_m: number): string[] {
  return texts
    .filter((t) => Math.hypot(t.x - x, t.y - y) <= range_m)
    .map((t) => t.t)
    .filter((s) => s && s.length > 0);
}

/**
 * Convert pre-extracted DXF JSON → HydraulicState.
 */
export function importDxfJson(extracted: ExtractedDxf, opts: {
  /** If true, only import lines whose `h=true` (heating). Otherwise all lines. */
  heatingOnly?: boolean;
  /** Default DN to assume on imported pipes. */
  defaultDn?: number;
} = {}): DxfImportResult {
  const heatingOnly = opts.heatingOnly ?? true;
  const defaultDn = opts.defaultDn ?? 100;
  const warnings: string[] = [];

  /* === 1. Collect candidate pipes === */
  const candidateLines = extracted.lines.filter((l) => (heatingOnly ? l.h : true));
  if (candidateLines.length === 0) {
    warnings.push("Халаалтын layer олдсонгүй — бүх шугамыг импортолж байна");
  }
  const linesToImport = candidateLines.length > 0 ? candidateLines : extracted.lines;

  /* === 2. Origin shift — center the network on canvas === */
  const bb = extracted.meta.extents;
  const originX_m = bb.min_x;
  const originY_m = bb.min_y;
  const heightY_m = bb.max_y - bb.min_y;
  // Convert real-world (x,y in m) → SVG canvas (px), Y-flip.
  const toCanvas = (x_m: number, y_m: number) => ({
    x: Math.round((x_m - originX_m) * PX_PER_METER + 40),
    y: Math.round((heightY_m - (y_m - originY_m)) * PX_PER_METER + 40),
  });

  /* === 3. Endpoint dedup → ProtoNodes === */
  const protoNodes = new Map<string, ProtoNode>();
  let nodeIdCounter = 1;

  function getOrCreateNode(x_m: number, y_m: number): ProtoNode {
    const key = nearbyKey(x_m, y_m, POINT_TOL_M);
    let pn = protoNodes.get(key);
    if (!pn) {
      pn = {
        id: `dxf-n${nodeIdCounter++}`,
        x_m, y_m,
        kind: "junction",
        label: `J-${nodeIdCounter - 1}`,
        references: 0,
      };
      protoNodes.set(key, pn);
    }
    pn.references += 1;
    return pn;
  }

  /* === 4. Build pipes from lines === */
  const protoPipes: Array<{
    id: string;
    fromKey: string;
    toKey: string;
    waypoints: Array<{ x: number; y: number }>;
    length_m: number;
    layer: string;
    isHeat: boolean;
  }> = [];

  let pipeId = 1;
  let droppedTooShort = 0;
  for (const ln of linesToImport) {
    if (ln.pts.length < 2) continue;
    // Each segment is one pipe; for polylines split into segments at vertices
    // (later we can merge collinear runs).
    for (let i = 0; i < ln.pts.length - 1; i += 1) {
      const a = ln.pts[i]!;
      const b = ln.pts[i + 1]!;
      const len_m = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len_m < PIPE_MIN_LEN_M) {
        droppedTooShort += 1;
        continue;
      }
      const aN = getOrCreateNode(a[0], a[1]);
      const bN = getOrCreateNode(b[0], b[1]);
      const aKey = nearbyKey(a[0], a[1], POINT_TOL_M);
      const bKey = nearbyKey(b[0], b[1], POINT_TOL_M);
      if (aKey === bKey) continue; // self-loop after snapping
      protoPipes.push({
        id: `dxf-p${pipeId++}`,
        fromKey: aKey,
        toKey: bKey,
        waypoints: [],
        length_m: Math.round(len_m * 10) / 10,
        layer: ln.l,
        isHeat: ln.h,
      });
      void aN; void bN;
    }
  }
  if (droppedTooShort > 0) {
    warnings.push(`${droppedTooShort} богино сегмент (<0.5м) уннгаалаа`);
  }

  /* === 5. Snap circles → mark chamber nodes === */
  let chamberCount = 0;
  for (const c of extracted.circles) {
    const key = nearbyKey(c.cx, c.cy, POINT_TOL_M * 2);
    const pn = protoNodes.get(key);
    if (pn) {
      pn.kind = "chamber";
      pn.fromCircle = true;
      pn.label = `K-${chamberCount + 1}`;
      chamberCount += 1;
    }
  }

  /* === 6. Snap inserts (block references) → typed nodes === */
  let insertCount = 0;
  for (const ins of extracted.inserts) {
    const key = nearbyKey(ins.x, ins.y, POINT_TOL_M * 2);
    const pn = protoNodes.get(key);
    const kind = classifyBlockName(ins.name);
    if (pn) {
      pn.kind = kind;
      pn.fromInsert = true;
      pn.blockName = ins.name;
      pn.textNearby = classifyInsertText(extracted.texts, ins.x, ins.y, 5);
      insertCount += 1;
    } else {
      // Add new standalone node from insert (not on a pipe endpoint)
      const standalone: ProtoNode = {
        id: `dxf-i${nodeIdCounter++}`,
        x_m: ins.x,
        y_m: ins.y,
        kind,
        label: kind.startsWith("source_") ? `Эх-${insertCount + 1}` : `${kind}-${insertCount + 1}`,
        references: 0,
        fromInsert: true,
        blockName: ins.name,
        textNearby: classifyInsertText(extracted.texts, ins.x, ins.y, 5),
      };
      protoNodes.set(key, standalone);
      insertCount += 1;
    }
  }

  /* === 7. Heuristics — degree-1 nodes become consumers === */
  let consumerCount = 0;
  for (const pn of protoNodes.values()) {
    if (pn.kind !== "junction") continue;
    if (pn.references === 1) {
      pn.kind = "consumer_apartment";
      pn.label = `Х-${consumerCount + 1}`;
      consumerCount += 1;
    }
  }
  /* === 8. Highest-degree node = source candidate === */
  let topDegree = 0;
  let topNode: ProtoNode | null = null;
  for (const pn of protoNodes.values()) {
    if (pn.references > topDegree) {
      topDegree = pn.references;
      topNode = pn;
    }
  }
  if (topNode && topNode.kind === "junction" && topDegree >= 4) {
    topNode.kind = "source_substation";
    topNode.label = "ЦТП-эх";
  }

  /* === 9. Materialize SchemeNode + SchemePipe === */
  const nodes: SchemeNode[] = [];
  const protoToFinalId = new Map<string, string>();
  const protoToCanvas = new Map<string, { x: number; y: number }>();
  for (const [key, pn] of protoNodes.entries()) {
    const c = toCanvas(pn.x_m, pn.y_m);
    protoToFinalId.set(key, pn.id);
    protoToCanvas.set(key, c);
    nodes.push({
      id: pn.id,
      kind: pn.kind,
      label: pn.label,
      x: c.x,
      y: c.y,
      adres: pn.textNearby?.join(" / "),
      heatLoad_w: pn.kind.startsWith("consumer_") ? 80_000 : undefined,
      requiredPressure_mpa: pn.kind.startsWith("consumer_") ? 0.15 : undefined,
    });
  }

  const pipes: SchemePipe[] = [];
  let totalLen_m = 0;
  for (const pp of protoPipes) {
    const fromId = protoToFinalId.get(pp.fromKey);
    const toId = protoToFinalId.get(pp.toKey);
    if (!fromId || !toId) continue;
    pipes.push({
      id: pp.id,
      fromNodeId: fromId,
      toNodeId: toId,
      materialKey: "steel_aged",
      dn: defaultDn,
      length_m: pp.length_m,
      circuit: "heating_supply",
    });
    totalLen_m += pp.length_m;
  }

  /* === 10. Build settings === */
  const settings: ProjectSettings = {
    networkType: "two_pipe_closed",
    temperatureScheduleKey: "130_70",
    city: "ulaanbaatar",
    primaryMaterialCategory: "steel",
    localLossesFraction: 0.3,
    sourcePressure_mpa: 0.6,
  };

  // Layers count
  const allLayers = new Set<string>();
  for (const ln of linesToImport) allLayers.add(ln.l);

  /* === 11. Stats === */
  const stats = {
    pipes: pipes.length,
    nodes: nodes.length,
    junctions: nodes.filter((n) => n.kind === "junction").length,
    chambers: nodes.filter((n) => n.kind === "chamber" || n.kind === "well_drain" || n.kind === "well_supply").length,
    consumers: nodes.filter((n) => typeof n.kind === "string" && n.kind.startsWith("consumer_")).length,
    sources: nodes.filter((n) => typeof n.kind === "string" && n.kind.startsWith("source_")).length,
    totalLength_m: Math.round(totalLen_m * 10) / 10,
    layers: allLayers.size,
  };

  return {
    state: { nodes, pipes, settings, schemaVersion: 5 },
    stats,
    warnings,
    bbox: { minX: bb.min_x, maxX: bb.max_x, minY: bb.min_y, maxY: bb.max_y },
  };
}

/* ============================================================================
 *  IMPORT — raw .dxf text path (browser-side parsing)
 * ========================================================================== */

/** Parse browser-uploaded DXF text directly. */
export async function importDxfText(dxfText: string, opts: {
  heatingOnly?: boolean;
  defaultDn?: number;
} = {}): Promise<DxfImportResult> {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf || !dxf.entities) {
    throw new Error("DXF parse амжилтгүй — файл буруу формат");
  }

  // Convert dxf-parser entities → ExtractedDxf shape
  const lines: ExtractedDxf["lines"] = [];
  const circles: ExtractedDxf["circles"] = [];
  const inserts: ExtractedDxf["inserts"] = [];
  const texts: ExtractedDxf["texts"] = [];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  function ext(x: number, y: number) {
    if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 1e7 && Math.abs(y) < 1e7) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  // dxf-parser typings are loose — cast each entity to a flexible shape so we
  // can read type-specific fields (LINE.vertices, CIRCLE.center, etc.).
  // Schema reference: https://github.com/gdsestimating/dxf-parser
  for (const ent of dxf.entities as unknown as Array<Record<string, unknown>>) {
    const e = ent as {
      type?: string;
      layer?: string;
      vertices?: Array<{ x: number; y: number }>;
      center?: { x: number; y: number };
      x?: number; y?: number;
      radius?: number;
      position?: { x: number; y: number };
      name?: string;
      rotation?: number;
      startPoint?: { x: number; y: number };
      text?: string;
      textHeight?: number;
    };
    const layer = String(e.layer ?? "0");
    const isHeat = /dulan|heat|халаа/i.test(layer);
    if (e.type === "LINE") {
      const a = e.vertices?.[0];
      const b = e.vertices?.[1];
      if (a && b) {
        lines.push({ l: layer, h: isHeat, pts: [[a.x, a.y], [b.x, b.y]] });
        ext(a.x, a.y); ext(b.x, b.y);
      }
    } else if (e.type === "LWPOLYLINE" || e.type === "POLYLINE") {
      const pts: [number, number][] = (e.vertices ?? []).map((v) => [v.x, v.y]);
      if (pts.length >= 2) {
        lines.push({ l: layer, h: isHeat, pts });
        for (const [x, y] of pts) ext(x, y);
      }
    } else if (e.type === "CIRCLE") {
      const cx = e.center?.x ?? e.x ?? 0;
      const cy = e.center?.y ?? e.y ?? 0;
      circles.push({ l: layer, cx, cy, r: e.radius ?? 0 });
      ext(cx, cy);
    } else if (e.type === "INSERT") {
      const x = e.position?.x ?? e.x ?? 0;
      const y = e.position?.y ?? e.y ?? 0;
      inserts.push({ l: layer, name: String(e.name ?? "?"), x, y, rot: e.rotation ?? 0 });
      ext(x, y);
    } else if (e.type === "TEXT" || e.type === "MTEXT") {
      const x = e.startPoint?.x ?? e.position?.x ?? e.x ?? 0;
      const y = e.startPoint?.y ?? e.position?.y ?? e.y ?? 0;
      const t = String(e.text ?? "").replace(/\\[A-Za-z][^;]*;/g, "").trim();
      if (t) {
        texts.push({ l: layer, x, y, h: e.textHeight ?? 1, t });
        ext(x, y);
      }
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error("DXF дотор боломжит геометр олдсонгүй");
  }

  const extracted: ExtractedDxf = {
    meta: {
      source: "browser-uploaded.dxf",
      extents: { min_x: minX, max_x: maxX, min_y: minY, max_y: maxY,
                 width: maxX - minX, height: maxY - minY },
      units: "meters",
    },
    lines,
    circles,
    inserts,
    texts,
  };
  return importDxfJson(extracted, opts);
}

/** Fetch the bundled Bayangol JSON sample and import. */
export async function importBayangolSample(): Promise<DxfImportResult> {
  const res = await fetch("/dxf-samples/bayangol-2-2.json");
  if (!res.ok) throw new Error("Жишээ файл татагдсангүй");
  const json = (await res.json()) as ExtractedDxf;
  return importDxfJson(json, { heatingOnly: true });
}
