/**
 * Phase 13.10 — Tagged node geo-stamp invariant.
 *
 * Engineer report: "Барилгын зураг газрын зургыг дагаж хөдөлж байгаа
 * ч үүсгэсэн автомат tag нь тусдаа салж хөдөлж байна."
 *
 * Root cause: buildTagAsParams returned a node with only x/y. When
 * the map pans / zooms, polygon vertices project via leaflet (each
 * vertex carries lat/lon), but the tagged node had no geo so it
 * stayed glued to its original scheme-px coords → drift.
 *
 * Fix: SchemeEditor commit handler now computes the tagged node's
 * lat/lon as the centroid of the polygon's vertex lat/lon values.
 * This test locks that math.
 */
import { describe, it, expect } from "vitest";

/** Mirror of SchemeEditor's Phase 13.10 inline centroid math. */
function centroidLatLon(
  polygon: ReadonlyArray<{ lat?: number; lon?: number }>,
): { lat: number; lon: number } | null {
  const withGeo = polygon.filter(
    (v): v is { lat: number; lon: number } =>
      typeof v.lat === "number" && typeof v.lon === "number",
  );
  if (withGeo.length === 0) return null;
  const lat = withGeo.reduce((s, v) => s + v.lat, 0) / withGeo.length;
  const lon = withGeo.reduce((s, v) => s + v.lon, 0) / withGeo.length;
  return { lat, lon };
}

describe("Phase 13.10 — tagged node geo-centroid math", () => {
  it("4-vertex square centroid is the geometric centre", () => {
    const poly = [
      { lat: 47.918, lon: 106.917 },
      { lat: 47.918, lon: 106.918 },
      { lat: 47.919, lon: 106.918 },
      { lat: 47.919, lon: 106.917 },
    ];
    const c = centroidLatLon(poly);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(47.9185, 4);
    expect(c!.lon).toBeCloseTo(106.9175, 4);
  });

  it("returns null when no vertex carries lat/lon", () => {
    const poly = [
      { lat: undefined, lon: undefined },
      { lat: undefined, lon: undefined },
    ];
    expect(centroidLatLon(poly)).toBeNull();
  });

  it("returns null on empty polygon", () => {
    expect(centroidLatLon([])).toBeNull();
  });

  it("uses ONLY geo-stamped vertices (mixed polygon)", () => {
    // Engineer drew on map then toggled map off mid-draw — only some
    // vertices have geo. Centroid should still be defined and use
    // only the geo-carrying ones.
    const poly = [
      { lat: 47.918, lon: 106.917 },
      { /* no lat/lon */ },
      { lat: 47.920, lon: 106.917 },
    ];
    const c = centroidLatLon(poly);
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(47.919, 4);
    expect(c!.lon).toBeCloseTo(106.917, 4);
  });

  it("triangle centroid is the average of 3 vertices", () => {
    const poly = [
      { lat: 47.918, lon: 106.917 },
      { lat: 47.919, lon: 106.918 },
      { lat: 47.917, lon: 106.919 },
    ];
    const c = centroidLatLon(poly);
    expect(c!.lat).toBeCloseTo(47.918, 4);
    expect(c!.lon).toBeCloseTo(106.918, 4);
  });
});
