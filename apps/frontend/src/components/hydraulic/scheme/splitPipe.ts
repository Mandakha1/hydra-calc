/**
 * Phase 13.21 — Pure helpers to split a pipe at an interior point
 * (chamber / well / inspection-camera placement workflow).
 *
 * Engineer report: "Шугам хоолойг зурахаас өмнө болон дараа дулааны
 * худаг, ХХУ болон хүйтэн усны шугам дээр Худаг буюу Шалгах
 * камерийг байрлуулах төлөвлөх боломжтой байхаар тохируулна уу."
 *
 * Standards backing chamber placement on heat / DHW / cold pipes:
 *
 *   • СНиП 41-02-2003 §9.6.10 — Камеры на тепловых сетях устанавливаются
 *     в местах размещения арматуры (задвижки, спускные/воздушные
 *     краны), на ответвлениях, и при изменении направления.
 *     Расстояние между камерами на магистрали ≤ 100 м, на ответвлениях
 *     ≤ 50 м.
 *   • БНбД 41-02-13 §6.3 — Mongolian equivalent. Same 100 m magistral /
 *     50 m service spacing for inspection wells (шалгах худаг).
 *   • БНбД 40-05-12 §7 — Cold-water inspection wells (хүйтэн усны
 *     шалгах худаг) at every direction-change + branch + valve.
 *
 * The helper here is geometric only (split point + new pipe lengths
 * along the polyline). The caller in SchemeEditor wires the new
 * chamber-node creation + atomic addPipe × 2 + removePipe × 1 op.
 */

import type { SchemePipe } from "../hydraulicTypes";

/** Bend-point shape — shared with displayPipeGeometry.ts. */
export interface XYG {
  x: number;
  y: number;
  lat?: number;
  lon?: number;
}

/**
 * Walk the pipe's polyline (`from → bends → to`) at a parametric
 * position `t ∈ [0, 1]` of total path length, returning:
 *
 *   - `point`: the interpolated XY (and lat/lon when both endpoints
 *     of the containing segment carry geo)
 *   - `lengthFirst_m` / `lengthSecond_m`: piece lengths in metres
 *     (computed by proportional scaling of `pipe.length_m` — the
 *     Phase 12.3 authoritative-length invariant)
 *   - `bendsBefore` / `bendsAfter`: bend lists for the two new pipes
 *     (excluding the split point itself; that becomes a junction node
 *     so it's NOT a bend anymore)
 *
 * Designed so the caller can do:
 *   const split = splitPipeAtFraction({ pipe, from, to, t: 0.5 });
 *   // create new chamber node at split.point
 *   // addPipe({ from→chamber, length_m: split.lengthFirst_m, bendPoints: split.bendsBefore })
 *   // addPipe({ chamber→to, length_m: split.lengthSecond_m, bendPoints: split.bendsAfter })
 *   // removePipe(pipe.id)
 */
export function splitPipeAtFraction(args: {
  pipe: SchemePipe;
  from: XYG;
  to: XYG;
  /** Parameter along total polyline length. Clamped to [0.01, 0.99]
   *  so the split never collapses a sub-pipe to zero length (the
   *  hydraulic solver requires positive length on every pipe). */
  t: number;
}): {
  point: XYG;
  lengthFirst_m: number;
  lengthSecond_m: number;
  bendsBefore: XYG[];
  bendsAfter: XYG[];
} {
  const tClamped = Math.max(0.01, Math.min(0.99, args.t));
  const polyline: XYG[] = [args.from];
  if (args.pipe.bendPoints?.length) {
    for (const bp of args.pipe.bendPoints) polyline.push({ ...bp });
  } else if (args.pipe.waypoints?.length) {
    for (const wp of args.pipe.waypoints) polyline.push({ x: wp.x, y: wp.y });
  }
  polyline.push(args.to);

  // Compute total polyline length in PIXELS so we can walk by px and
  // then map the proportional split back to the authoritative length_m.
  const segLenPx: number[] = [];
  let totalPx = 0;
  for (let i = 1; i < polyline.length; i += 1) {
    const a = polyline[i - 1]!;
    const b = polyline[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segLenPx.push(len);
    totalPx += len;
  }
  if (totalPx < 1e-6) {
    // Degenerate — return the from-point as the split, lengths split
    // evenly so the calc engine doesn't choke.
    const half = (args.pipe.length_m ?? 0) / 2;
    return {
      point: { x: args.from.x, y: args.from.y },
      lengthFirst_m: Math.max(0.5, half),
      lengthSecond_m: Math.max(0.5, half),
      bendsBefore: [],
      bendsAfter: [],
    };
  }
  const targetPx = totalPx * tClamped;

  // Walk segments, find the one containing targetPx, interpolate.
  let acc = 0;
  let segIndex = 0;
  let withinSeg_t = 0;
  for (let i = 0; i < segLenPx.length; i += 1) {
    if (acc + segLenPx[i]! >= targetPx) {
      segIndex = i;
      withinSeg_t = segLenPx[i]! > 0 ? (targetPx - acc) / segLenPx[i]! : 0;
      break;
    }
    acc += segLenPx[i]!;
  }
  const a = polyline[segIndex]!;
  const b = polyline[segIndex + 1]!;
  const px = a.x + (b.x - a.x) * withinSeg_t;
  const py = a.y + (b.y - a.y) * withinSeg_t;
  // Geo interpolation — only when BOTH endpoints carry lat/lon. For
  // short segments at typical urban zoom levels the linear average is
  // within sub-pixel of the great-circle interpolant; we accept that.
  const splitPoint: XYG = { x: px, y: py };
  if (typeof a.lat === "number" && typeof a.lon === "number" &&
      typeof b.lat === "number" && typeof b.lon === "number") {
    splitPoint.lat = a.lat + (b.lat - a.lat) * withinSeg_t;
    splitPoint.lon = a.lon + (b.lon - a.lon) * withinSeg_t;
  }

  // Bends BEFORE the split — all polyline interior points up to splitPoint.
  // bendsAfter — all interior points after splitPoint.
  // Indices 0 and (polyline.length - 1) are the from/to nodes; they're
  // not bends. The interior bends are indices 1..length-2.
  //
  // Edge case: when the split lands EXACTLY on a polyline vertex
  // (withinSeg_t ≈ 0 or ≈ 1), that vertex becomes the new chamber
  // junction and must NOT appear in either bendsBefore or bendsAfter.
  const ON_VERTEX_EPSILON = 0.001;
  const landsOnNextVertex = withinSeg_t > 1 - ON_VERTEX_EPSILON;
  const landsOnThisVertex = withinSeg_t < ON_VERTEX_EPSILON;
  const beforeEnd = landsOnThisVertex ? segIndex - 1 : segIndex;
  const afterStart = landsOnNextVertex ? segIndex + 2 : segIndex + 1;
  const bendsBefore: XYG[] = [];
  for (let i = 1; i <= beforeEnd; i += 1) {
    if (i >= polyline.length - 1) break; // don't include `to`
    bendsBefore.push({ ...polyline[i]! });
  }
  const bendsAfter: XYG[] = [];
  for (let i = afterStart; i < polyline.length - 1; i += 1) {
    bendsAfter.push({ ...polyline[i]! });
  }

  // Map the px-proportional split back to the authoritative length_m
  // (Phase 12.3 invariant). Floor at 0.5 m so the calc engine never
  // sees a zero-length pipe.
  const total_m = args.pipe.length_m ?? 0;
  const first = Math.max(0.5, total_m * tClamped);
  const second = Math.max(0.5, total_m * (1 - tClamped));

  return {
    point: splitPoint,
    lengthFirst_m: roundLength(first),
    lengthSecond_m: roundLength(second),
    bendsBefore,
    bendsAfter,
  };
}

/**
 * Choose a default chamber kind based on the pipe's circuit. Heat
 * circuits get the generic "chamber" (БНбД 41-02-13 камер), DHW
 * gets the same (warm-circuit chamber per Mongolian standard), cold
 * water gets "well_supply" (хүйтэн усны шалгах худаг per БНбД 40-05).
 */
export function defaultChamberKindForCircuit(circuit: string | undefined): string {
  if (circuit === "cold_water") return "well_supply";
  return "chamber";
}

function roundLength(m: number): number {
  return Math.round(m * 10) / 10;
}
