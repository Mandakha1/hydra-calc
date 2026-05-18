/**
 * Phase 13.14 — Map-aware pipe geometry resolution tests.
 *
 * Covers the bug from engineer report: pipe drawing across a panning
 * map lost track of from-node displayPos + saved bend lat/lon.
 */
import { describe, it, expect } from "vitest";
import {
  displayVertex,
  displayPipePolyline,
  polylineLengthPx,
} from "../displayPipeGeometry";

/** Projector that simulates a leaflet round-trip: lat/lon scaled into
 *  scheme pixel coords by a fixed factor. Lets us drive the helper
 *  without spinning up a Leaflet instance. */
function makeProjector(factor: number, dxPx: number, dyPx: number) {
  return (geo: { lat: number; lon: number }) => ({
    x: geo.lon * factor + dxPx,
    y: geo.lat * factor + dyPx,
  });
}

describe("displayVertex", () => {
  it("non-map mode returns stored x/y", () => {
    const v = { x: 100, y: 200, lat: 47.918, lon: 106.917 };
    expect(displayVertex(v, { showMap: false, projectGeo: () => null })).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("map mode + no geo returns stored x/y", () => {
    const v = { x: 100, y: 200 };
    expect(
      displayVertex(v, { showMap: true, projectGeo: makeProjector(10, 0, 0) }),
    ).toEqual({ x: 100, y: 200 });
  });

  it("map mode + geo returns projected x/y (ignores stale stored x/y)", () => {
    // Stored x/y is from a PREVIOUS pan/zoom (stale). Geo is the truth.
    const v = { x: 999, y: 999, lat: 47.918, lon: 106.917 };
    const projected = displayVertex(v, {
      showMap: true,
      projectGeo: makeProjector(10, 0, 0),
    });
    expect(projected.x).toBeCloseTo(1069.17, 2);
    expect(projected.y).toBeCloseTo(479.18, 2);
  });

  it("projector returning null falls back to stored x/y (map ref not ready)", () => {
    const v = { x: 100, y: 200, lat: 47.918, lon: 106.917 };
    expect(displayVertex(v, { showMap: true, projectGeo: () => null })).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("partial geo (lat only) falls back to stored x/y", () => {
    const v = { x: 100, y: 200, lat: 47.918 } as { x: number; y: number; lat?: number; lon?: number };
    expect(
      displayVertex(v, { showMap: true, projectGeo: makeProjector(10, 0, 0) }),
    ).toEqual({ x: 100, y: 200 });
  });
});

describe("displayPipePolyline", () => {
  it("no bends → [from, to]", () => {
    const out = displayPipePolyline(
      { x: 0, y: 0 },
      [],
      { x: 100, y: 0 },
      { showMap: false, projectGeo: () => null },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]).toEqual({ x: 100, y: 0 });
  });

  it("with bends → from → bends → to", () => {
    const out = displayPipePolyline(
      { x: 0, y: 0 },
      [{ x: 30, y: 0 }, { x: 30, y: 40 }],
      { x: 60, y: 40 },
      { showMap: false, projectGeo: () => null },
    );
    expect(out).toHaveLength(4);
    expect(out[1]).toEqual({ x: 30, y: 0 });
    expect(out[2]).toEqual({ x: 30, y: 40 });
  });

  it("map mode: geo on from + bend + to all project; stored x/y ignored", () => {
    // Three buildings + one bend between them, all geo-stamped.
    const projector = makeProjector(100, 0, 0);
    const out = displayPipePolyline(
      { x: 999, y: 999, lat: 0, lon: 1 }, // → (100, 0)
      [{ x: 999, y: 999, lat: 0.5, lon: 2 }], // → (200, 50)
      { x: 999, y: 999, lat: 1, lon: 3 }, // → (300, 100)
      { showMap: true, projectGeo: projector },
    );
    expect(out[0]).toEqual({ x: 100, y: 0 });
    expect(out[1]).toEqual({ x: 200, y: 50 });
    expect(out[2]).toEqual({ x: 300, y: 100 });
  });

  it("map mode: mixed (legacy node without geo + new bend with geo)", () => {
    // Legacy from-node from pre-Phase-6.8.2 days has no geo. New bend
    // does. Helper should NOT crash — falls back to stored x/y for the
    // legacy node, projects the new bend.
    const out = displayPipePolyline(
      { x: 10, y: 20 }, // no geo → fallback
      [{ x: 999, y: 999, lat: 0, lon: 5 }], // geo → projects to (50, 0)
      { x: 80, y: 90 }, // no geo → fallback
      { showMap: true, projectGeo: makeProjector(10, 0, 0) },
    );
    expect(out[0]).toEqual({ x: 10, y: 20 });
    expect(out[1]).toEqual({ x: 50, y: 0 });
    expect(out[2]).toEqual({ x: 80, y: 90 });
  });

  it("map pan simulation: same geo, different projector → different display XY", () => {
    const from = { x: 0, y: 0, lat: 0, lon: 0 };
    const to = { x: 100, y: 0, lat: 0, lon: 1 };

    // Pre-pan view.
    const pre = displayPipePolyline(from, [], to, {
      showMap: true,
      projectGeo: makeProjector(100, 0, 0),
    });
    expect(pre[0]).toEqual({ x: 0, y: 0 });
    expect(pre[1]).toEqual({ x: 100, y: 0 });

    // After the engineer pans 50px right + 30px down — geo unchanged,
    // projector now offsets by (-50, -30) in scheme space.
    const post = displayPipePolyline(from, [], to, {
      showMap: true,
      projectGeo: makeProjector(100, -50, -30),
    });
    expect(post[0]).toEqual({ x: -50, y: -30 });
    expect(post[1]).toEqual({ x: 50, y: -30 });
  });
});

describe("polylineLengthPx", () => {
  it("returns 0 for empty / single-point input", () => {
    expect(polylineLengthPx([])).toBe(0);
    expect(polylineLengthPx([{ x: 0, y: 0 }])).toBe(0);
  });

  it("straight line — Manhattan distance", () => {
    expect(polylineLengthPx([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(100);
    expect(polylineLengthPx([{ x: 0, y: 0 }, { x: 0, y: 50 }])).toBe(50);
  });

  it("L-shape — sums segments", () => {
    expect(
      polylineLengthPx([
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 40 },
      ]),
    ).toBe(70);
  });

  it("diagonal — hypotenuse", () => {
    expect(
      polylineLengthPx([
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ]),
    ).toBe(50);
  });

  it("3-bend zigzag — sum of all 4 segments", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
    ];
    expect(polylineLengthPx(pts)).toBe(40);
  });
});

describe("integration — engineer's reported scenario", () => {
  it("Building A → bend → Building B with map pan between clicks", () => {
    // Engineer reported: "Хоолойг нэг барилгаас нөгөөрүү холбох булан
    // эргүүлэх үйлдэл хийхэд шугам арилж байна".
    //
    // Repro: A is geo-stamped at (lat=0, lon=0). User clicks bend at
    // current screen → bend stamped at (lat=0, lon=0.5). B is at
    // (lat=0, lon=1). Now user pans map.
    //
    // Before fix: live preview drew from A.x=0,A.y=0 (stale!) →
    // bend.x → B.x (stale!). Line jumped to weird positions.
    //
    // After fix: every vertex's lat/lon is re-projected per current
    // pan/zoom — line stays glued to the engineer's intended path.
    const a = { x: 999, y: 999, lat: 0, lon: 0 };
    const bend = { x: 999, y: 999, lat: 0, lon: 0.5 };
    const b = { x: 999, y: 999, lat: 0, lon: 1 };

    // View 1: pan = (0, 0)
    const v1 = displayPipePolyline(a, [bend], b, {
      showMap: true,
      projectGeo: makeProjector(200, 0, 0),
    });
    expect(v1[0]).toEqual({ x: 0, y: 0 });
    expect(v1[1]).toEqual({ x: 100, y: 0 });
    expect(v1[2]).toEqual({ x: 200, y: 0 });

    // View 2: pan = (-50px) (engineer scrolled map left)
    const v2 = displayPipePolyline(a, [bend], b, {
      showMap: true,
      projectGeo: makeProjector(200, -50, 0),
    });
    expect(v2[0]).toEqual({ x: -50, y: 0 });
    expect(v2[1]).toEqual({ x: 50, y: 0 });
    expect(v2[2]).toEqual({ x: 150, y: 0 });

    // Critical: relative shape preserved. Length math against the
    // CURRENT view stays correct (200 px in both views).
    expect(polylineLengthPx(v1)).toBe(200);
    expect(polylineLengthPx(v2)).toBe(200);
  });

  it("non-map session works as before — stored x/y still authoritative", () => {
    // Regression guard: legacy scheme-only projects must NOT change
    // behaviour. No geo anywhere → all stored x/y used.
    const v = displayPipePolyline(
      { x: 0, y: 0 },
      [{ x: 50, y: 0 }, { x: 50, y: 50 }],
      { x: 100, y: 50 },
      { showMap: false, projectGeo: () => null },
    );
    expect(v).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
    ]);
    expect(polylineLengthPx(v)).toBe(150);
  });
});
