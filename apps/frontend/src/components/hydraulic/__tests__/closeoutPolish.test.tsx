/**
 * Phase 6.8.7 — closeout polish integration tests.
 *
 * Three feature clusters covered:
 *
 *   - Building transforms (closes the documented PR #24 gap):
 *     building polygon vertices rotate + mirror with the multi-
 *     selection cluster instead of staying put.
 *
 *   - BatchOpsToolbar subLabels (BUG #6 fix): each transform button
 *     now renders a short text label under the glyph so engineers
 *     can't confuse rotate ↺ with undo ↺.
 *
 *   - SchemeBuilding template preset (workflow polish): clicking
 *     "🏠 Темплейт" on the sidebar drops a 5-storey 20×30 m polygon
 *     at the viewport centre with default metadata.
 *
 * CL ray/circle variants from the original Phase 6.8.7 scope are
 * DEFERRED to a future polish phase (data model surface for
 * rendering + hit-testing is non-trivial). Tracked in PR body.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchemeEditor } from "../panels/SchemeEditor";
import { BatchOpsToolbar } from "../scheme/BatchOpsToolbar";
import { useHydraulicStore } from "../hydraulicStore";
import {
  rotateBuildings,
  mirrorBuildings,
  buildingPolygonCentroidPx,
  buildingPolygonCentroidGeo,
} from "../scheme/transforms";
import {
  applyRotateAroundCentroid,
  applyRotateCCW,
  applyMirrorHorizontal,
  applyMirrorVertical,
} from "../scheme/transformApplier";
import { addBuilding } from "../scheme/buildingApplier";
import type { SchemeBuilding } from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function makeBuilding(id: string, overrides: Partial<SchemeBuilding> = {}): SchemeBuilding {
  return {
    id,
    polygon: [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 200 },
      { x: 100, y: 200 },
    ],
    label: id,
    layerKey: "D",
    ...overrides,
  };
}

/* ─── Topic 2 — Building transforms (pure math + applier) ──────── */

describe("rotateBuildings — pure math (Phase 6.8.7)", () => {
  it("rotates polygon vertices 90° CCW around the polygon centroid", () => {
    const b = makeBuilding("b1"); // centroid (200, 150)
    const center = buildingPolygonCentroidPx(b);
    const rotated = rotateBuildings([b], center, 90);
    // Top-left (100, 100) → after +90° (CCW math convention):
    //   dx=-100 dy=-50 → new_x=cx + dx·cos(90) - dy·sin(90) = 200 + 0 - (-50)·1 = 250
    //                    new_y=cy + dx·sin(90) + dy·cos(90) = 150 + (-100)·1 + 0 = 50
    expect(rotated[0]!.polygon[0]).toEqual({ x: 250, y: 50 });
    // Centroid invariant: rotated polygon centroid equals original centroid.
    const rc = buildingPolygonCentroidPx(rotated[0]!);
    expect(rc.x).toBeCloseTo(center.x, 0);
    expect(rc.y).toBeCloseTo(center.y, 0);
  });

  it("preserves polygon shape (vertex distances stay constant)", () => {
    const b = makeBuilding("b1");
    const center = buildingPolygonCentroidPx(b);
    const rotated = rotateBuildings([b], center, 45);
    const distOrig = Math.hypot(b.polygon[1]!.x - b.polygon[0]!.x, b.polygon[1]!.y - b.polygon[0]!.y);
    const distRotated = Math.hypot(
      rotated[0]!.polygon[1]!.x - rotated[0]!.polygon[0]!.x,
      rotated[0]!.polygon[1]!.y - rotated[0]!.polygon[0]!.y,
    );
    // Each vertex Math.round() introduces up to 0.5 px error per axis;
    // a 1 px envelope covers the compound rounding on a 200 px segment.
    expect(Math.abs(distRotated - distOrig)).toBeLessThan(1);
  });

  it("rotates geo coords on geo-anchored vertices", () => {
    const b: SchemeBuilding = {
      id: "b1",
      polygon: [
        { x: 100, y: 100, lat: 47.918, lon: 106.917 },
        { x: 300, y: 100, lat: 47.918, lon: 106.918 },
      ],
      label: "Geo Bld",
    };
    const rotated = rotateBuildings(
      [b],
      { x: 200, y: 100 },
      180,
      { lat: 47.918, lon: 106.9175 },
    );
    // 180° about the geo centre flips lon → 2·centerLon − lon
    expect(rotated[0]!.polygon[0]!.lon!).toBeCloseTo(106.918, 4);
    expect(rotated[0]!.polygon[1]!.lon!).toBeCloseTo(106.917, 4);
  });
});

describe("mirrorBuildings — pure math (Phase 6.8.7)", () => {
  it("horizontal mirror flips Y around the axis y_px", () => {
    const b = makeBuilding("b1"); // y range 100..200
    const mirrored = mirrorBuildings([b], { kind: "horizontal", y_px: 150 });
    // y=100 → 2·150 - 100 = 200; y=200 → 2·150 - 200 = 100
    expect(mirrored[0]!.polygon[0]!.y).toBe(200);
    expect(mirrored[0]!.polygon[2]!.y).toBe(100);
  });

  it("vertical mirror flips X around the axis x_px", () => {
    const b = makeBuilding("b1"); // x range 100..300
    const mirrored = mirrorBuildings([b], { kind: "vertical", x_px: 200 });
    expect(mirrored[0]!.polygon[0]!.x).toBe(300);
    expect(mirrored[0]!.polygon[1]!.x).toBe(100);
  });
});

describe("transformApplier — buildings participate (Phase 6.8.7)", () => {
  it("multi-select node + building, rotate CCW: building polygon vertices move with the cluster", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "n1", kind: "consumer_apartment", label: "АОС", x: 100, y: 100 });
    addBuilding(makeBuilding("b1"));
    s.selectMany({ nodeIds: ["n1"], pipeIds: [], buildingIds: ["b1"] });
    const beforeBldV0 = useHydraulicStore.getState().buildings![0]!.polygon[0]!;
    const affected = applyRotateCCW();
    expect(affected).toBe(2); // node + building
    const afterBldV0 = useHydraulicStore.getState().buildings![0]!.polygon[0]!;
    // Building vertex MUST have moved (this is the regression we're closing).
    expect(afterBldV0.x === beforeBldV0.x && afterBldV0.y === beforeBldV0.y).toBe(false);
  });

  it("rotate 180° applied to a building alone preserves the polygon centroid", () => {
    addBuilding(makeBuilding("b1"));
    useHydraulicStore.getState().selectMany({
      nodeIds: [],
      pipeIds: [],
      buildingIds: ["b1"],
    });
    const before = useHydraulicStore.getState().buildings![0]!;
    const beforeCentroid = buildingPolygonCentroidPx(before);
    applyRotateAroundCentroid(180);
    const after = useHydraulicStore.getState().buildings![0]!;
    const afterCentroid = buildingPolygonCentroidPx(after);
    expect(afterCentroid.x).toBeCloseTo(beforeCentroid.x, 0);
    expect(afterCentroid.y).toBeCloseTo(beforeCentroid.y, 0);
    // 180° flips every vertex through the centroid.
    expect(after.polygon[0]!.x).toBe(2 * beforeCentroid.x - before.polygon[0]!.x);
    expect(after.polygon[0]!.y).toBe(2 * beforeCentroid.y - before.polygon[0]!.y);
  });

  it("applyMirrorHorizontal flips a building's polygon vertices around the multi-select centroid", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "n1", kind: "consumer_apartment", label: "АОС", x: 200, y: 0 });
    addBuilding(makeBuilding("b1")); // y range 100..200, centroid y 150
    s.selectMany({ nodeIds: ["n1"], pipeIds: [], buildingIds: ["b1"] });
    applyMirrorHorizontal();
    // Combined centroid Y = ((0) + (150)) / 2 = 75.
    // Building y=100 → 2·75 - 100 = 50.
    expect(useHydraulicStore.getState().buildings![0]!.polygon[0]!.y).toBe(50);
  });

  it("applyMirrorVertical flips building polygon vertices around the multi-select centroid", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "n1", kind: "consumer_apartment", label: "АОС", x: 0, y: 150 });
    addBuilding(makeBuilding("b1")); // x range 100..300, centroid x 200
    s.selectMany({ nodeIds: ["n1"], pipeIds: [], buildingIds: ["b1"] });
    applyMirrorVertical();
    // Combined centroid X = (0 + 200) / 2 = 100.
    // Building x=100 → 2·100 - 100 = 100 (unchanged because on axis).
    // Building x=300 → 2·100 - 300 = -100.
    const polygon = useHydraulicStore.getState().buildings![0]!.polygon;
    expect(polygon[1]!.x).toBe(-100);
  });

  it("no-op when nothing selected — applyRotateCCW returns 0 + state untouched", () => {
    addBuilding(makeBuilding("b1"));
    const before = useHydraulicStore.getState().buildings![0]!.polygon[0]!;
    const r = applyRotateCCW();
    expect(r).toBe(0);
    const after = useHydraulicStore.getState().buildings![0]!.polygon[0]!;
    expect(after).toEqual(before);
  });
});

describe("buildingPolygonCentroidGeo — pure helper", () => {
  it("averages lat/lon across vertices that carry geo", () => {
    const b: SchemeBuilding = {
      id: "b1",
      polygon: [
        { x: 0, y: 0, lat: 47.92, lon: 106.91 },
        { x: 1, y: 0, lat: 47.92, lon: 106.93 },
        { x: 1, y: 1, lat: 47.93, lon: 106.93 },
        { x: 0, y: 1, lat: 47.93, lon: 106.91 },
      ],
    };
    const c = buildingPolygonCentroidGeo(b)!;
    expect(c.lat).toBeCloseTo(47.925, 4);
    expect(c.lon).toBeCloseTo(106.92, 4);
  });

  it("returns null when no vertex carries geo", () => {
    const b = makeBuilding("b1"); // all vertices without lat/lon
    expect(buildingPolygonCentroidGeo(b)).toBeNull();
  });
});

/* ─── Topic 1 — BatchOpsToolbar subLabels (BUG #6) ─────────────── */

describe("BatchOpsToolbar — disambiguating subLabels (Phase 6.8.7)", () => {
  it("rotate buttons render the short text label under the glyph", () => {
    render(<BatchOpsToolbar />);
    const rotCCW = screen.getByTitle(/Цагийн зүүний эсрэг 90/);
    const rotCW = screen.getByTitle(/Цагийн зүүгээр 90/);
    const rot180 = screen.getByTitle(/180° эргүүлэх/);
    // Each button contains BOTH the glyph and the disambiguating subLabel.
    expect(rotCCW.textContent).toContain("↺");
    expect(rotCCW.textContent).toContain("90");
    expect(rotCW.textContent).toContain("↻");
    expect(rotCW.textContent).toContain("90");
    expect(rot180.textContent).toContain("180");
  });

  it("mirror buttons carry direction-arrow subLabels", () => {
    render(<BatchOpsToolbar />);
    const mirrorH = screen.getByTitle(/Хэвтээ тэнхлэгээр/);
    const mirrorV = screen.getByTitle(/Босоо тэнхлэгээр/);
    expect(mirrorH.textContent).toContain("⏥");
    expect(mirrorH.textContent).toMatch(/↕/);
    expect(mirrorV.textContent).toContain("⏤");
    expect(mirrorV.textContent).toMatch(/↔/);
  });

  it("array buttons carry their format hints (N×M / rad)", () => {
    render(<BatchOpsToolbar />);
    const linear = screen.getByTitle(/Шугаман массив/);
    const polar = screen.getByTitle(/Радиал массив/);
    expect(linear.textContent).toContain("N×M");
    expect(polar.textContent).toContain("rad");
  });
});

/* ─── Topic 4 — Template preset button ─────────────────────────── */

describe("Building template preset (Phase 6.8.7)", () => {
  it("toolbar shows the 'Темплейт' button next to 'Барилга'", () => {
    render(<SchemeEditor />);
    const tmplBtn = screen.getByTitle(/5-давхар 20×30м блок/);
    expect(tmplBtn).toBeInTheDocument();
    // Sits in the same vertical toolbar — querySelector confirms it's
    // a child of the scheme-toolbar element.
    const toolbar = document.querySelector('[data-testid="scheme-toolbar"]');
    expect(toolbar?.contains(tmplBtn)).toBe(true);
  });
});
