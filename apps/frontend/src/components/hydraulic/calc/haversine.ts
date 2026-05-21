/**
 * Phase 5B.1c — Haversine distance helper.
 *
 * Purpose:
 *   Bridge from map (lat/lon) to engineering (length_m). When both end-
 *   nodes of a pipe have geographic coordinates set, the pipe's hydraulic
 *   length should be the great-circle distance between them — not a
 *   manually-typed value that can drift as the engineer pans the map.
 *
 * Why Haversine specifically:
 *   At Mongolian residential / city-scale pipe segments (10–1000 m), the
 *   spherical-Earth Haversine and the flat-plane Pythagorean approximation
 *   agree to better than 10⁻⁹ relative error. Haversine still wins because
 *   it stays exact at any scale — Darkhan-Erdenet measurements and
 *   continental-scale validation both use the same code path with no
 *   special cases.
 *
 * Formula (1984 Sinnott):
 *   a   = sin²(Δφ/2) + cos(φ₁)·cos(φ₂)·sin²(Δλ/2)
 *   c   = 2 · atan2(√a, √(1−a))
 *   d   = R · c                                  [m]
 *
 * Earth radius:
 *   R = 6 371 000 m (mean radius, WGS-84 ≈ 6 371 008.8 — we use the round
 *   number so spec compliance is verifiable. The 8.8 m discrepancy is
 *   ~10⁻⁶ relative — well below any plausible engineering tolerance).
 *
 * NOT in scope (Phase 5D will wire these):
 *   - Mutating SchemePipe.length_m on node-position changes.
 *   - The "lock" icon UI in InspectorPanel that toggles between auto and
 *     manual modes. (See pipeLengthFromGeometry() below for the helper
 *     callers use; the wiring happens in 5D.)
 */

/** Mean Earth radius in metres (per WGS-84 round-down). */
export const EARTH_RADIUS_M = 6_371_000;

export interface LatLon {
  /** Degrees north of the equator. */
  lat: number;
  /** Degrees east of Greenwich. Accepts the synonym `lng` from Leaflet. */
  lng?: number;
  /** Synonym for lng used by some libraries (incl. SchemeNode.geo.lon). */
  lon?: number;
}

/** Degrees → radians. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Resolve a "lng-or-lon" object to a single number. Used so callers can
 *  pass Leaflet (`lng`), SchemeNode.geo (`lon`), or either freely. */
function pickLon(p: LatLon): number {
  if (typeof p.lng === "number") return p.lng;
  if (typeof p.lon === "number") return p.lon;
  throw new TypeError("haversine: point missing lng/lon field");
}

/**
 * Great-circle distance between two lat/lon points, in metres.
 *
 * @param a First point (must have .lat and .lng OR .lon).
 * @param b Second point.
 * @returns Distance in metres. Non-negative. Returns 0 for identical input.
 *
 * @example
 *   // Ulaanbaatar centre to Erdenet centre — about 330 km.
 *   haversineMeters(
 *     { lat: 47.9184, lng: 106.9176 },   // UB
 *     { lat: 49.0319, lng: 104.0814 },   // Erdenet
 *   );  // ≈ 273_000  (depends on which UB / Erdenet point — 270–330 km range)
 */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLon = toRad(pickLon(b) - pickLon(a));
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/**
 * Convenience for the SchemePipe → length_m wiring (Phase 5D).
 *
 * Phase 13.39 — engineer report: "Хоолой зураад эхлэх цэг нь
 * жишээлбэл УДДТ дараа нь шугам УДДТ ээс чигээрээ явж байгаад
 * Юм уу зүүн тийм булан эргэлээ үүнийг манай систем 90 градус 45
 * гэх мэтээр булан эргэсэн гэж ойлгоод гидравлик тооцоонд оруулж
 * байгаа юу". The legacy implementation was straight node-to-node
 * Haversine, ignoring intermediate bend points — so when an
 * engineer routed a pipe around a building (УДДТ → bend → bend →
 * УДДТ), the hydraulic length was UNDER-counted by the corner
 * detour. Phase 13.39 walks the full polyline: from → bend₁ → … →
 * bendₙ → to, summing Haversine on each segment.
 *
 * @param bendPoints Optional intermediate vertices (Phase 12.3
 *   SchemePipe.bendPoints). When provided, EACH bend must have
 *   `lat` AND `lon` for the polyline length to be computed.
 *   Missing geo on any bend → returns null (caller falls back to
 *   manual length_m). When omitted or empty, behaves like the
 *   legacy node-to-node Haversine.
 *
 * @returns The polyline Haversine length in metres when geo data
 *   is complete, OR null otherwise.
 */
export function pipeLengthFromGeometry(
  from: { geo?: { lat: number; lon: number } } | null | undefined,
  to: { geo?: { lat: number; lon: number } } | null | undefined,
  bendPoints?: ReadonlyArray<{ lat?: number; lon?: number }>,
): number | null {
  if (!from?.geo || !to?.geo) return null;
  if (!bendPoints || bendPoints.length === 0) {
    return haversineMeters(from.geo, to.geo);
  }
  // All bend points must carry geo for the polyline length to make
  // sense; otherwise we'd silently mix geo-anchored segments with
  // scheme-pixel ones and produce nonsense metres. Engineer falls
  // back to manual length_m via the null return.
  let prev: { lat: number; lon: number } = from.geo;
  let total = 0;
  for (const bp of bendPoints) {
    if (typeof bp.lat !== "number" || typeof bp.lon !== "number") {
      return null;
    }
    total += haversineMeters(prev, { lat: bp.lat, lon: bp.lon });
    prev = { lat: bp.lat, lon: bp.lon };
  }
  total += haversineMeters(prev, to.geo);
  return total;
}
