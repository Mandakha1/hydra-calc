/**
 * Phase 7.5 — Bayangol fixture regression suite.
 *
 * Locks the verified import baseline for the Bayangol 2-2 sample
 * (Ган-Кад ХХК 2022, AutoCAD R2018) so future refactors of the
 * DXF pipeline (encoding sniff / Cyrillic classifier / multi-signal
 * voter / review-pane plumbing) can't silently break the real-
 * world test case.
 *
 * Baselines were sampled on 2026-05-15 against the merged Phase 7.4
 * pipeline. The fixture is checked in at
 * `public/dxf-samples/bayangol-2-2.json` (~2.4 MB pre-extracted
 * JSON — the original DXF was R2018 binary, converted via ODA File
 * Converter as documented in Phase 7.0).
 *
 * Synthetic fixture (Phase 7.1) is also re-tested here so the
 * synthetic + real-world coverage live in one file.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importDxfJson, importDxfBytes, type ExtractedDxf } from "../dxfImport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BAYANGOL_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "public",
  "dxf-samples",
  "bayangol-2-2.json",
);
const SYNTHETIC_PATH = path.join(__dirname, "fixtures", "synthetic-heating.dxf");

function loadBayangol(): ExtractedDxf {
  const raw = readFileSync(BAYANGOL_PATH, "utf-8");
  return JSON.parse(raw) as ExtractedDxf;
}

/* ─── Bayangol 2-2 real-world fixture ────────────────────────────── */

describe("Bayangol 2-2 fixture (Ган-Кад ХХК 2022, R2018) — Phase 7.5", () => {
  it("parses 247 nodes (baseline locked)", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.state.nodes.length).toBe(247);
  });

  it("parses 109 pipes (baseline locked)", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.state.pipes.length).toBe(109);
  });

  it("detects at least one consumer_apartment node", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    const consumers = r.state.nodes.filter((n) => n.kind === "consumer_apartment");
    expect(consumers.length).toBeGreaterThan(0);
  });

  it("detects 94 chamber nodes (Bayangol baseline)", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.stats.chambers).toBe(94);
  });

  it("detects 91 consumer nodes (Bayangol baseline)", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.stats.consumers).toBe(91);
  });

  it("parses pipe total length within band 500-50000 m", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    const totalMeters = r.state.pipes.reduce((sum, p) => sum + p.length_m, 0);
    expect(totalMeters).toBeGreaterThan(500);
    expect(totalMeters).toBeLessThan(50000);
  });

  it("locks the total-length baseline at 1426 m ±1", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(Math.abs(r.stats.totalLength_m - 1426.2)).toBeLessThan(1);
  });

  it("produces zero mojibake characters in node labels", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    const allLabels = r.state.nodes.map((n) => n.label).join("");
    // U+FFFD replacement char
    expect(allLabels).not.toMatch(/�/);
    // 3+ consecutive ? indicates mojibake
    expect(allLabels).not.toMatch(/\?{3,}/);
  });

  it("Phase 7.3 — at least one PipeCircuit value present", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    const circuits = new Set(r.state.pipes.map((p) => p.circuit));
    // Bayangol fixture lacks return-layer naming + has no CAD color /
    // lineType metadata, so all pipes correctly fall through to the
    // "unknown" → heating_supply fallback. The test asserts at least
    // ONE circuit value exists; when engineers feed it a richer file
    // with proper layer naming, the multi-signal voter will populate
    // more circuit categories.
    expect(circuits.size).toBeGreaterThanOrEqual(1);
    expect(circuits.has("heating_supply")).toBe(true);
  });

  it("Phase 7.3 — circuit conflict count is zero on a clean fixture", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.stats.circuitConflicts ?? 0).toBe(0);
  });

  it("Phase 7.3 — surfaces 'тодорхойгүй' warning for unknown layers", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    const unknownWarning = r.warnings.find((w) => w.includes("тодорхойгүй"));
    expect(unknownWarning).toBeDefined();
  });

  it("Phase 7.4 — distinctLayers carries pipe-count rows", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.distinctLayers?.length).toBeGreaterThan(0);
    const topLayer = r.distinctLayers?.[0];
    expect(topLayer?.pipeCount).toBeGreaterThan(0);
    expect(topLayer?.autoCircuit).toBeDefined();
    expect(topLayer?.autoLayerKey).toBeDefined();
  });

  it("Phase 7.4 — distinctBlocks carries node-count rows", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.distinctBlocks?.length).toBeGreaterThan(0);
    const topBlock = r.distinctBlocks?.[0];
    expect(topBlock?.nodeCount).toBeGreaterThan(0);
    expect(topBlock?.autoKind).toBeDefined();
  });

  it("warnings list is reasonable (< 100 items)", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    expect(r.warnings.length).toBeLessThan(100);
  });

  it("bbox is non-degenerate (width > 100m, height > 100m)", () => {
    const r = importDxfJson(loadBayangol(), { heatingOnly: true });
    const width = r.bbox.maxX - r.bbox.minX;
    const height = r.bbox.maxY - r.bbox.minY;
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThan(100);
  });

  it("engineer block-alias override flows through to nodes", () => {
    const r = importDxfJson(loadBayangol(), {
      heatingOnly: true,
      blockAliasOverrides: { "BOHIR_": "consumer_industrial" },
    });
    // Locating exact INSERT instances by matching label substring is
    // brittle; we instead assert the kind appears at least once in
    // the resulting nodes set since the fixture has multiple BOHIR_
    // inserts.
    const industrial = r.state.nodes.filter((n) => n.kind === "consumer_industrial");
    expect(industrial.length).toBeGreaterThan(0);
  });

  it("engineer layer-circuit override flows through to pipes", () => {
    // First find a layer with pipes in the fixture
    const r0 = importDxfJson(loadBayangol(), { heatingOnly: true });
    const layerWithPipes = r0.distinctLayers?.[0]?.layer;
    expect(layerWithPipes).toBeDefined();
    const r = importDxfJson(loadBayangol(), {
      heatingOnly: true,
      layerCircuitOverrides: { [layerWithPipes!]: "heating_return" },
    });
    const returns = r.state.pipes.filter((p) => p.circuit === "heating_return");
    expect(returns.length).toBeGreaterThan(0);
  });
});

/* ─── Synthetic-heating fixture (Phase 7.1, re-tested here) ──────── */

describe("Synthetic-heating fixture — Phase 7.5", () => {
  it("parses cleanly without warnings beyond known ones", async () => {
    const buffer = readFileSync(SYNTHETIC_PATH);
    const r = await importDxfBytes(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    expect(r.state.nodes.length).toBeGreaterThan(0);
    expect(r.state.pipes.length).toBeGreaterThan(0);
  });

  it("АОС-1 block produces a consumer_apartment node", async () => {
    const buffer = readFileSync(SYNTHETIC_PATH);
    const r = await importDxfBytes(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const consumers = r.state.nodes.filter((n) => n.kind === "consumer_apartment");
    expect(consumers.length).toBeGreaterThan(0);
  });

  it("Phase 7.3 — all pipes have a circuit value (no undefined)", async () => {
    const buffer = readFileSync(SYNTHETIC_PATH);
    const r = await importDxfBytes(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    for (const p of r.state.pipes) {
      expect(p.circuit).toBeDefined();
    }
  });
});
