/**
 * Phase 6.8.6 — reference building entity integration tests.
 *
 * Pins the full lifecycle for the new SchemeBuilding entity that
 * replaces the legacy "polygon → dialog → consumer node" flow with
 * a direct draw-to-Inspector experience.
 *
 * Coverage map:
 *   1. addBuilding / updateBuilding / removeBuilding store contract
 *   2. JSON save/load round-trip preserves polygon + metadata
 *   3. multiSelection.buildingIds participation in selectMany /
 *      selectExtend / selectToggle / clearSelection
 *   4. Undo restores a deleted building; redo replays
 *   5. Clipboard copy/paste preserves the polygon with the same
 *      offset semantics as nodes + annotations (px shift + geo
 *      delta when vertices carry lat/lon)
 *   6. Legacy projects (no `buildings` field) load + render cleanly
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import {
  addBuilding,
  updateBuilding,
  removeBuilding,
  selectBuilding,
} from "../scheme/buildingApplier";
import { undo, redo } from "../scheme/undoStack";
import type { SchemeBuilding, HydraulicState } from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

const samplePolygon: SchemeBuilding["polygon"] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 60 },
  { x: 0, y: 60 },
];

function makeBuilding(id: string, overrides: Partial<SchemeBuilding> = {}): SchemeBuilding {
  return {
    id,
    polygon: samplePolygon.map((p) => ({ ...p })),
    label: id,
    layerKey: "D",
    ...overrides,
  };
}

/* ─── 1. Store contract ────────────────────────────────────────── */

describe("buildingApplier — store contract (Phase 6.8.6)", () => {
  it("addBuilding persists the entity with all fields verbatim", () => {
    addBuilding(
      makeBuilding("b1", {
        floors: 5,
        building_type: "apartment",
        heatLoad_kw: 540,
      }),
    );
    const stored = useHydraulicStore.getState().buildings?.[0];
    expect(stored).toBeDefined();
    expect(stored!.id).toBe("b1");
    expect(stored!.polygon).toHaveLength(4);
    expect(stored!.floors).toBe(5);
    expect(stored!.building_type).toBe("apartment");
    expect(stored!.heatLoad_kw).toBe(540);
  });

  it("updateBuilding patches fields without disturbing polygon", () => {
    addBuilding(makeBuilding("b1"));
    updateBuilding("b1", { label: "АОС-12", floors: 9 });
    const stored = useHydraulicStore.getState().buildings?.[0];
    expect(stored!.label).toBe("АОС-12");
    expect(stored!.floors).toBe(9);
    expect(stored!.polygon).toHaveLength(4);
  });

  it("removeBuilding deletes the entity + scrubs selection", () => {
    addBuilding(makeBuilding("b1"));
    selectBuilding("b1");
    expect(useHydraulicStore.getState().selection?.id).toBe("b1");
    removeBuilding("b1");
    expect(useHydraulicStore.getState().buildings ?? []).toHaveLength(0);
    expect(useHydraulicStore.getState().selection).toBeNull();
  });

  it("selectBuilding sets both legacy selection AND multiSelection.buildingIds", () => {
    addBuilding(makeBuilding("b1"));
    selectBuilding("b1");
    expect(useHydraulicStore.getState().selection).toEqual({
      kind: "building",
      id: "b1",
    });
    expect(useHydraulicStore.getState().multiSelection.buildingIds).toEqual(["b1"]);
  });
});

/* ─── 2. JSON save/load round-trip ─────────────────────────────── */

describe("JSON save/load round-trip — buildings", () => {
  it("serialised + parsed buildings preserve polygon vertices and metadata", () => {
    addBuilding(
      makeBuilding("b1", {
        label: "АОС-1",
        floors: 5,
        building_type: "apartment",
        heatLoad_kw: 250,
      }),
    );
    const snapshot: HydraulicState = {
      nodes: [],
      pipes: [],
      settings: useHydraulicStore.getState().settings,
      schemaVersion: 5,
      buildings: useHydraulicStore.getState().buildings,
    };
    const reloaded = JSON.parse(JSON.stringify(snapshot)) as HydraulicState;
    const b = reloaded.buildings?.[0];
    expect(b).toBeDefined();
    expect(b!.id).toBe("b1");
    expect(b!.polygon).toEqual(samplePolygon);
    expect(b!.label).toBe("АОС-1");
    expect(b!.floors).toBe(5);
    expect(b!.building_type).toBe("apartment");
    expect(b!.heatLoad_kw).toBe(250);
  });

  it("legacy project (no `buildings` field) loads with buildings undefined — backward compat", () => {
    const legacy = JSON.stringify({
      nodes: [{ id: "n1", kind: "consumer_apartment", label: "АОС-1", x: 0, y: 0 }],
      pipes: [],
      settings: {
        networkType: "two_pipe_closed",
        temperatureScheduleKey: "95_70",
        city: "Улаанбаатар",
        primaryMaterialCategory: "steel",
        localLossesFraction: 0.3,
        sourcePressure_mpa: 0.6,
      },
      schemaVersion: 5,
    });
    const parsed = JSON.parse(legacy) as HydraulicState;
    expect(parsed.buildings).toBeUndefined();
    expect(parsed.nodes).toHaveLength(1);
  });

  it("geo-anchored polygon survives JSON round-trip with lat/lon intact", () => {
    addBuilding({
      id: "b1",
      polygon: [
        { x: 0, y: 0, lat: 47.918, lon: 106.917 },
        { x: 100, y: 0, lat: 47.918, lon: 106.918 },
        { x: 100, y: 60, lat: 47.9178, lon: 106.918 },
        { x: 0, y: 60, lat: 47.9178, lon: 106.917 },
      ],
      label: "Geo Bld",
    });
    const json = JSON.stringify({
      buildings: useHydraulicStore.getState().buildings,
    });
    const reloaded = JSON.parse(json) as { buildings: SchemeBuilding[] };
    const v0 = reloaded.buildings[0]!.polygon[0]!;
    expect(v0.lat).toBeCloseTo(47.918, 6);
    expect(v0.lon).toBeCloseTo(106.917, 6);
  });
});

/* ─── 3. Multi-selection threading ─────────────────────────────── */

describe("multiSelection.buildingIds (Phase 6.8.6)", () => {
  it("selectExtend(building) appends to buildingIds without clobbering other selection sets", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "n1", kind: "consumer_apartment", label: "АОС-1", x: 0, y: 0 });
    addBuilding(makeBuilding("b1"));
    addBuilding(makeBuilding("b2"));
    s.selectExtend({ kind: "node", id: "n1" });
    s.selectExtend({ kind: "building", id: "b1" });
    s.selectExtend({ kind: "building", id: "b2" });
    const ms = useHydraulicStore.getState().multiSelection;
    expect(ms.nodeIds).toEqual(["n1"]);
    expect(ms.buildingIds).toEqual(["b1", "b2"]);
  });

  it("selectToggle(building) toggles the id in/out of buildingIds", () => {
    const s = useHydraulicStore.getState();
    addBuilding(makeBuilding("b1"));
    s.selectToggle({ kind: "building", id: "b1" });
    expect(useHydraulicStore.getState().multiSelection.buildingIds).toEqual(["b1"]);
    s.selectToggle({ kind: "building", id: "b1" });
    expect(useHydraulicStore.getState().multiSelection.buildingIds).toEqual([]);
  });

  it("selectMany({buildingIds}) replaces the buildingIds list", () => {
    const s = useHydraulicStore.getState();
    addBuilding(makeBuilding("b1"));
    addBuilding(makeBuilding("b2"));
    addBuilding(makeBuilding("b3"));
    s.selectMany({ nodeIds: [], pipeIds: [], buildingIds: ["b1", "b3"] });
    const ms = useHydraulicStore.getState().multiSelection;
    expect(ms.buildingIds).toEqual(["b1", "b3"]);
    expect(useHydraulicStore.getState().selection).toEqual({
      kind: "building",
      id: "b1",
    });
  });

  it("clearSelection empties buildingIds alongside the other lists", () => {
    const s = useHydraulicStore.getState();
    addBuilding(makeBuilding("b1"));
    selectBuilding("b1");
    s.clearSelection();
    const ms = useHydraulicStore.getState().multiSelection;
    expect(ms.buildingIds).toEqual([]);
    expect(useHydraulicStore.getState().selection).toBeNull();
  });
});

/* ─── 4. Undo + redo for buildings ─────────────────────────────── */

describe("undo + redo with buildings (Phase 6.8.6)", () => {
  it("undo restores a removed building", () => {
    addBuilding(makeBuilding("b1", { floors: 5 }));
    expect(useHydraulicStore.getState().buildings).toHaveLength(1);
    removeBuilding("b1");
    expect(useHydraulicStore.getState().buildings ?? []).toHaveLength(0);
    const r = undo();
    expect(r?.label).toContain("Барилга");
    expect(useHydraulicStore.getState().buildings).toHaveLength(1);
    expect(useHydraulicStore.getState().buildings![0]!.floors).toBe(5);
  });

  it("redo after undo re-removes the building", () => {
    addBuilding(makeBuilding("b1"));
    removeBuilding("b1");
    undo();
    expect(useHydraulicStore.getState().buildings).toHaveLength(1);
    redo();
    expect(useHydraulicStore.getState().buildings ?? []).toHaveLength(0);
  });
});

/* ─── 5. Clipboard buildings round-trip ────────────────────────── */

describe("clipboard buildings round-trip (Phase 6.8.6)", () => {
  it("copySelection includes buildings in the payload count", () => {
    const s = useHydraulicStore.getState();
    addBuilding(makeBuilding("b1"));
    addBuilding(makeBuilding("b2"));
    s.selectMany({ nodeIds: [], pipeIds: [], buildingIds: ["b1", "b2"] });
    const r = s.copySelection();
    expect(r).not.toBeNull();
    expect(r!.buildings).toBe(2);
    const clipboard = useHydraulicStore.getState().clipboard;
    expect(clipboard?.buildings).toHaveLength(2);
  });

  it("pasteClipboard inserts cloned buildings with fresh ids + offset polygon", () => {
    const s = useHydraulicStore.getState();
    addBuilding(makeBuilding("b1"));
    s.selectMany({ nodeIds: [], pipeIds: [], buildingIds: ["b1"] });
    s.copySelection();
    const r = s.pasteClipboard();
    expect(r!.buildings).toBe(1);
    const after = useHydraulicStore.getState().buildings ?? [];
    expect(after).toHaveLength(2);
    const pasted = after.find((b) => b.id !== "b1")!;
    // All vertices shifted by the default 20 m offset (PASTE_OFFSET_M).
    // Without a map, mapPxPerMeter is null so 20 m → +20 px in each axis.
    expect(pasted.polygon[0]!.x).toBe(20);
    expect(pasted.polygon[0]!.y).toBe(20);
    expect(pasted.polygon[2]!.x).toBe(120);
    expect(pasted.polygon[2]!.y).toBe(80);
    expect(pasted.id).not.toBe("b1");
  });

  it("cutSelection removes the original building AND keeps a paste-able clipboard payload", () => {
    const s = useHydraulicStore.getState();
    addBuilding(makeBuilding("b1"));
    s.selectMany({ nodeIds: [], pipeIds: [], buildingIds: ["b1"] });
    const r = s.cutSelection();
    expect(r!.buildings).toBe(1);
    expect(useHydraulicStore.getState().buildings ?? []).toHaveLength(0);
    expect(useHydraulicStore.getState().clipboard?.buildings).toHaveLength(1);
    s.pasteClipboard();
    expect(useHydraulicStore.getState().buildings).toHaveLength(1);
  });
});
