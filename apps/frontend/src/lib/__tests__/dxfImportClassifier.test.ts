/**
 * Phase 7.2 — Cyrillic block classifier tests.
 *
 * Direct tests on `classifyBlockName` covering the new Cyrillic
 * alias table + engineer override path + the legacy Latin fall-
 * through. Plus an integration test that the synthetic-heating.dxf
 * fixture's "АОС-1" block now flows through to a final
 * SchemeNode whose `kind` is `consumer_apartment` — closing the
 * deferral from Phase 7.1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  classifyBlockName,
  CYRILLIC_BLOCK_ALIASES,
  importDxfBytes,
} from "../dxfImport";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, "fixtures", "synthetic-heating.dxf");

/* ─── Direct classifier — Cyrillic patterns ─────────────────────── */

describe("classifyBlockName — Cyrillic aliases (Phase 7.2)", () => {
  it("АОС-1 → consumer_apartment", () => {
    expect(classifyBlockName("АОС-1")).toBe("consumer_apartment");
    expect(classifyBlockName("АОС-Bld-5")).toBe("consumer_apartment");
    expect(classifyBlockName("аос-2")).toBe("consumer_apartment"); // lowercase
  });

  it("АОЭ → consumer_school (education facility)", () => {
    expect(classifyBlockName("АОЭ-2")).toBe("consumer_school");
    expect(classifyBlockName("АОЭ")).toBe("consumer_school");
  });

  it("АОБ → consumer_industrial", () => {
    expect(classifyBlockName("АОБ-1")).toBe("consumer_industrial");
  });

  it("УДДТ / ЦТП → source_substation", () => {
    expect(classifyBlockName("УДДТ-А")).toBe("source_substation");
    expect(classifyBlockName("ЦТП-3")).toBe("source_substation");
  });

  it("Зуух / Котёл → source_boiler", () => {
    expect(classifyBlockName("Зуух-1")).toBe("source_boiler");
    expect(classifyBlockName("Котёл-2")).toBe("source_boiler");
    expect(classifyBlockName("Котел-2")).toBe("source_boiler"); // without ё
  });

  it("ҮХТ → well_supply", () => {
    expect(classifyBlockName("ҮХТ-15")).toBe("well_supply");
    expect(classifyBlockName("ҮХТ")).toBe("well_supply");
  });

  it("ҮДТ → chamber (no well_return NodeKind)", () => {
    expect(classifyBlockName("ҮДТ-7")).toBe("chamber");
  });

  it("ЭӨ → compensator_u", () => {
    expect(classifyBlockName("ЭӨ-3")).toBe("compensator_u");
  });

  it("Valve aliases — К-хаа / Кб / КШ", () => {
    expect(classifyBlockName("К-хаа-7")).toBe("valve_gate");
    expect(classifyBlockName("К-ЗАС-3")).toBe("valve_gate");
    expect(classifyBlockName("Кб-2")).toBe("valve_ball");
    expect(classifyBlockName("КШ-1")).toBe("valve_ball");
  });

  it("БВЭ / Бух → pump_circ", () => {
    expect(classifyBlockName("БВЭ-1")).toBe("pump_circ");
    expect(classifyBlockName("Бух-2")).toBe("pump_circ");
  });
});

/* ─── Engineer override priority ────────────────────────────────── */

describe("classifyBlockName — engineer overrides (Phase 7.2)", () => {
  it("exact override wins over Cyrillic pattern", () => {
    // АОС would normally → consumer_apartment, override forces consumer_office
    expect(
      classifyBlockName("АОС-1", { "АОС-1": "consumer_office" }),
    ).toBe("consumer_office");
  });

  it("exact override wins over Latin pattern", () => {
    // nasos would normally → pump_circ, override forces source_boiler
    expect(
      classifyBlockName("nasos-7", { "nasos-7": "source_boiler" }),
    ).toBe("source_boiler");
  });

  it("override is case-insensitive on the lookup key", () => {
    expect(
      classifyBlockName("АОС-1", { "аос-1": "consumer_warehouse" }),
    ).toBe("consumer_warehouse");
  });

  it("override miss falls through to pattern table", () => {
    // override doesn't match → "АОС-99" still classifies via Cyrillic
    expect(
      classifyBlockName("АОС-99", { "OTHER-BLOCK": "valve_gate" }),
    ).toBe("consumer_apartment");
  });

  it("empty / undefined overrides have no effect", () => {
    expect(classifyBlockName("АОС-1", undefined)).toBe("consumer_apartment");
    expect(classifyBlockName("АОС-1", {})).toBe("consumer_apartment");
  });
});

/* ─── Legacy Latin classifier — backward-compat regression ──────── */

describe("classifyBlockName — Latin fall-through (regression)", () => {
  it("bohir → well_drain (unchanged)", () => {
    expect(classifyBlockName("bohir-1")).toBe("well_drain");
  });

  it("hbh / highv / dst → chamber (unchanged)", () => {
    expect(classifyBlockName("hbh-room-3")).toBe("chamber");
    expect(classifyBlockName("highv-1")).toBe("chamber");
    expect(classifyBlockName("dst-2")).toBe("chamber");
  });

  it("nasos / pump → pump_circ (unchanged)", () => {
    expect(classifyBlockName("nasos-1")).toBe("pump_circ");
    expect(classifyBlockName("pump-A")).toBe("pump_circ");
  });

  it("zad / valve → valve_gate (unchanged)", () => {
    expect(classifyBlockName("zad-3")).toBe("valve_gate");
    expect(classifyBlockName("valve-shut")).toBe("valve_gate");
  });

  it("ctp / itp → source_substation (unchanged)", () => {
    expect(classifyBlockName("ctp-A")).toBe("source_substation");
    expect(classifyBlockName("itp-7")).toBe("source_substation");
  });

  it("kotel / zuukh (Latin transliteration) → source_boiler", () => {
    expect(classifyBlockName("kotel-1")).toBe("source_boiler");
    expect(classifyBlockName("zuukh-2")).toBe("source_boiler");
  });

  it("unknown name defaults to chamber", () => {
    expect(classifyBlockName("RandomBlock123")).toBe("chamber");
    expect(classifyBlockName("")).toBe("chamber");
  });
});

/* ─── Alias table shape sanity ──────────────────────────────────── */

describe("CYRILLIC_BLOCK_ALIASES table — Phase 7.2", () => {
  it("table is non-empty and immutable", () => {
    expect(CYRILLIC_BLOCK_ALIASES.length).toBeGreaterThanOrEqual(11);
    // Reading is allowed; the readonly type prevents mutation at compile time.
    for (const entry of CYRILLIC_BLOCK_ALIASES) {
      expect(entry).toHaveLength(2);
      expect(entry[0]).toBeInstanceOf(RegExp);
      expect(typeof entry[1]).toBe("string");
    }
  });

  it("every alias kind resolves to a NodeKind catalog value", () => {
    // Spot-check: every value should be a known kind string.
    const knownKinds = new Set([
      "consumer_apartment", "consumer_school", "consumer_industrial",
      "consumer_hospital", "consumer_house", "consumer_office",
      "consumer_retail", "consumer_warehouse",
      "source_substation", "source_boiler", "source_geothermal", "source_tec",
      "well_supply", "well_drain", "chamber",
      "compensator_u", "compensator_bellow",
      "valve_gate", "valve_ball", "valve_globe", "valve_check", "valve_regulator",
      "pump_circ", "pump_booster", "pump_makeup",
    ]);
    for (const [, kind] of CYRILLIC_BLOCK_ALIASES) {
      expect(knownKinds.has(kind)).toBe(true);
    }
  });
});

/* ─── Integration: synthetic fixture (closes 7.1 deferral) ──────── */

describe("Synthetic fixture — АОС-1 classifies end-to-end (Phase 7.2)", () => {
  it("imports synthetic-heating.dxf and produces a consumer_apartment node", async () => {
    const raw = readFileSync(FIXTURE_PATH);
    const result = await importDxfBytes(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    const consumers = result.state.nodes.filter(
      (n) => n.kind === "consumer_apartment",
    );
    expect(consumers.length).toBeGreaterThan(0);
  });

  it("engineer override on a block name from the fixture flows through to final kind", async () => {
    const raw = readFileSync(FIXTURE_PATH);
    // Baseline (no override) — the INSERT block becomes consumer_apartment
    // via the new Cyrillic alias. Degree-1 LINE endpoints ALSO get
    // promoted to consumer_apartment via an unrelated existing
    // heuristic in importDxfJson, so we count those separately.
    const baseline = await importDxfBytes(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    const baselineApartments = baseline.state.nodes.filter(
      (n) => n.kind === "consumer_apartment",
    ).length;

    // With override — the INSERT's classification flips to warehouse,
    // but the degree-1 heuristic still promotes line endpoints. So
    // we expect: apartments decreases by exactly 1 (the INSERT) and
    // warehouses increases by 1.
    const overridden = await importDxfBytes(
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      { blockAliasOverrides: { "АОС-1": "consumer_warehouse" } },
    );
    const warehouses = overridden.state.nodes.filter(
      (n) => n.kind === "consumer_warehouse",
    );
    const overriddenApartments = overridden.state.nodes.filter(
      (n) => n.kind === "consumer_apartment",
    ).length;
    expect(warehouses.length).toBe(1);
    expect(overriddenApartments).toBe(baselineApartments - 1);
  });
});
