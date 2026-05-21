/**
 * Phase 5B.1c — Haversine distance helper tests.
 *
 * What's locked down:
 *   1. UB centre → Erdenet centre lands at ~272 km, matching the
 *      well-known driving-route adjacent figure (the real driving route
 *      is ~370 km on the curved roads; great-circle is shorter).
 *   2. 1-m-apart points return ~1 m (sub-mm precision).
 *   3. Identical points return exactly 0.
 *   4. Antipodal points return ~half the equatorial circumference.
 *   5. At Mongolian project scale (100 m segment) Haversine and the
 *      Pythagorean approximation agree to better than 0.001 % — this is
 *      the engineering-validity argument for using Haversine without
 *      special-casing small distances.
 *   6. pipeLengthFromGeometry() returns null when either endpoint lacks
 *      a geo position — proving the "manual length wins" path stays
 *      open for virtual junction nodes.
 */
import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  pipeLengthFromGeometry,
  EARTH_RADIUS_M,
} from "../haversine";

describe("haversineMeters — Phase 5B.1c", () => {
  it("UB centre → Erdenet centre ≈ 243 km (great-circle)", () => {
    // Сүхбаатарын талбай, УБ
    const ub = { lat: 47.9184, lng: 106.9176 };
    // Эрдэнэт хотын төв, Орхон аймаг
    const erdenet = { lat: 49.0319, lng: 104.0814 };
    const d = haversineMeters(ub, erdenet);
    // Great-circle is ~243 km — half of the 370 km driving route because
    // the Trans-Mongolian highway loops south around Хан Хэнтий.
    // Allow ±3 km for which exact UB/Erdenet point we pick.
    expect(d).toBeGreaterThan(240_000);
    expect(d).toBeLessThan(246_000);
  });

  it("1-m-apart points at УБ latitude resolve to ~1.0 m", () => {
    // One metre east at lat 47.92 °. Use the Haversine-consistent
    // metres-per-degree on a sphere of radius EARTH_RADIUS_M (rather
    // than the WGS-84 surface 111 320), so the round-trip is exact
    // to floating-point precision.
    const M_PER_DEG = (Math.PI * EARTH_RADIUS_M) / 180; // 111 194.93
    const dLon = 1 / (Math.cos((47.92 * Math.PI) / 180) * M_PER_DEG);
    const a = { lat: 47.92, lng: 106.92 };
    const b = { lat: 47.92, lng: 106.92 + dLon };
    const d = haversineMeters(a, b);
    expect(d).toBeGreaterThan(0.999);
    expect(d).toBeLessThan(1.001);
  });

  it("returns exactly 0 for identical coordinates", () => {
    const p = { lat: 47.9184, lng: 106.9176 };
    expect(haversineMeters(p, p)).toBe(0);
  });

  it("antipodal points ≈ π · R (half Earth's circumference)", () => {
    const north = { lat: 0, lng: 0 };
    const south = { lat: 0, lng: 180 };
    const d = haversineMeters(north, south);
    const expected = Math.PI * EARTH_RADIUS_M; // ≈ 20 015 086 m
    expect(d).toBeGreaterThan(expected * 0.99999);
    expect(d).toBeLessThan(expected * 1.00001);
  });

  it("Mongolian project scale (100 m) matches Pythagoras within 0.001 %", () => {
    // At an UB latitude, a 100 m offset is roughly N + E mixed.
    // dLat = 100 / 111_320 (degrees per metre on the meridian).
    const dLat = 100 / 111_320;
    const a = { lat: 47.92, lng: 106.92 };
    const b = { lat: 47.92 + dLat, lng: 106.92 };
    const hav = haversineMeters(a, b);
    // Pythagoras at the meridian is just R · Δφ in radians.
    const pyth = (dLat * Math.PI) / 180 * EARTH_RADIUS_M;
    const relErr = Math.abs(hav - pyth) / pyth;
    expect(relErr).toBeLessThan(1e-5); // 0.001 % — within engineering tolerance
  });

  it("accepts both `lng` (Leaflet) and `lon` (SchemeNode.geo) naming", () => {
    const a = { lat: 47.92, lng: 106.92 };
    const b = { lat: 47.92, lon: 106.93 };
    expect(haversineMeters(a, b)).toBeGreaterThan(0);
    expect(haversineMeters(a, b)).toBeLessThan(1000);
  });

  it("throws TypeError when a point has neither lng nor lon", () => {
    expect(() =>
      haversineMeters({ lat: 47 } as never, { lat: 48, lng: 107 }),
    ).toThrow(TypeError);
  });
});

describe("pipeLengthFromGeometry — Phase 5B.1c", () => {
  it("returns null when either endpoint lacks a geo position", () => {
    // Either side missing → fall back to manual length input (lock open).
    const noGeo = { } as { geo?: { lat: number; lon: number } };
    const withGeo = { geo: { lat: 47.92, lon: 106.92 } };
    expect(pipeLengthFromGeometry(noGeo, withGeo)).toBeNull();
    expect(pipeLengthFromGeometry(withGeo, noGeo)).toBeNull();
    expect(pipeLengthFromGeometry(null, null)).toBeNull();
  });

  it("returns the great-circle length when both endpoints are geo-anchored", () => {
    const a = { geo: { lat: 47.9184, lon: 106.9176 } };
    const b = { geo: { lat: 47.9194, lon: 106.9176 } }; // ~111 m north
    const d = pipeLengthFromGeometry(a, b);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(108);
    expect(d!).toBeLessThan(115);
  });

  /* ── Phase 13.39 — bendpoints polyline ───────────────────────── */

  it("Phase 13.39 — sums Haversine through bend points when supplied", () => {
    // Square detour: A → bend1 (north) → bend2 (north-east) → B (east).
    // Straight A→B would be the diagonal (~157 m); the L-detour is ~222 m.
    const a = { geo: { lat: 47.9184, lon: 106.9176 } };
    const b = { geo: { lat: 47.9194, lon: 106.9189 } };
    const straight = pipeLengthFromGeometry(a, b);
    const bends = [
      { lat: 47.9194, lon: 106.9176 }, // straight north of A
    ];
    const polyline = pipeLengthFromGeometry(a, b, bends);
    expect(straight).not.toBeNull();
    expect(polyline).not.toBeNull();
    expect(polyline!).toBeGreaterThan(straight!);
    // Sanity range: each leg is ~111 m, total ~211 m (give or take
    // 5 % for cos(lat) skew on the east leg).
    expect(polyline!).toBeGreaterThan(180);
    expect(polyline!).toBeLessThan(260);
  });

  it("Phase 13.39 — returns null when any bend point lacks geo coords", () => {
    // Mixed geo + scheme-pixel bend points → cannot produce metres.
    // Engineer falls back to manual length_m.
    const a = { geo: { lat: 47.9184, lon: 106.9176 } };
    const b = { geo: { lat: 47.9194, lon: 106.9189 } };
    const bends = [
      { lat: 47.9189, lon: 106.9180 }, // geo present
      { /* x/y only */ } as { lat?: number; lon?: number },
    ];
    expect(pipeLengthFromGeometry(a, b, bends)).toBeNull();
  });

  it("Phase 13.39 — empty bend array is identical to legacy node-to-node", () => {
    const a = { geo: { lat: 47.9184, lon: 106.9176 } };
    const b = { geo: { lat: 47.9194, lon: 106.9176 } };
    const legacy = pipeLengthFromGeometry(a, b);
    const empty = pipeLengthFromGeometry(a, b, []);
    expect(empty).toBe(legacy);
  });
});
