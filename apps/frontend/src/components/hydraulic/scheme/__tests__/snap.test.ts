/**
 * Phase 6B — snap engine tests.
 *
 * Engineering invariants we lock down:
 *   - Grid snap rounds toward the nearest cell (not floor); negative
 *     values handle symmetrically; disabled = identity.
 *   - Angle snap preserves distance from source (only direction snaps).
 *     Anchored 90° + click slightly off ortho → snapped to exact
 *     horizontal/vertical.
 *   - Endpoint snap returns the SAME node ID twice for the same
 *     near-click (idempotent), and `null` when no node in range.
 *   - applyPlacementSnap chains endpoint-first → grid-fallback, so
 *     clicking on an existing chamber never moves you to a nearby
 *     grid cell.
 */
import { describe, it, expect } from "vitest";
import {
  snapGridM,
  snapPointToGridM,
  snapAngle,
  findEndpointSnap,
  applyPlacementSnap,
  DEFAULT_SNAP,
  type SnapSettings,
} from "../snap";

describe("Grid snap — Phase 6B", () => {
  it("rounds toward nearest cell on a 5 m grid", () => {
    // The user click at (3, 7) m on a 5-m grid should land at (5, 5).
    expect(snapGridM(3, 5)).toBe(5);
    expect(snapGridM(7, 5)).toBe(5);
    expect(snapGridM(2, 5)).toBe(0);
    expect(snapGridM(2.5, 5)).toBe(5); // tie-break toward larger (Math.round rule)
  });

  it("handles negative coordinates symmetrically", () => {
    expect(snapGridM(-3, 5)).toBe(-5);
    expect(snapGridM(-7, 5)).toBe(-5);
    // -2 rounds toward 0 — but the IEEE-754 result is -0 (negative
    // zero), which fails toBe(0) under Object.is. Use toBeCloseTo
    // so the test reads "mathematically zero" rather than caring
    // about the sign bit.
    expect(snapGridM(-2, 5)).toBeCloseTo(0, 5);
  });

  it("identity when disabled (engineer toggled grid off)", () => {
    expect(snapGridM(3.14159, 5, false)).toBe(3.14159);
    expect(snapGridM(3.14159, 0)).toBe(3.14159);
  });

  it("snapPointToGridM applies independently to x and y", () => {
    const r = snapPointToGridM({ x: 3, y: 7 }, 5);
    expect(r).toEqual({ x: 5, y: 5 });
  });

  it("1 m grid is essentially a rounding helper (tight precision)", () => {
    expect(snapGridM(3.4, 1)).toBe(3);
    expect(snapGridM(3.6, 1)).toBe(4);
  });

  it("10 m grid for magistral planning at city scale", () => {
    expect(snapGridM(14, 10)).toBe(10);
    expect(snapGridM(16, 10)).toBe(20);
  });
});

describe("Angle snap — Phase 6B", () => {
  it("90° increment from origin, click slightly above-right → snapped horizontal", () => {
    // Cursor at (100, -5) is 2.9° above pure east. With 90° snap
    // it should land on pure east (y=0) at the same distance.
    const r = snapAngle({ x: 0, y: 0 }, { x: 100, y: -5 }, 90);
    // snappedAngleDeg may come out as -0 from Math.round(-0.0318)*90;
    // mathematically that's still 0° east. toBeCloseTo ignores sign-bit.
    expect(r.snappedAngleDeg).toBeCloseTo(0, 5);
    expect(r.y).toBeCloseTo(0, 4);
    expect(r.x).toBeCloseTo(100.12, 1); // sqrt(100^2 + 5^2)
  });

  it("45° increment from origin, click at 70° → snapped to 45° on that ray", () => {
    const src = { x: 0, y: 0 };
    const dist = 100;
    const theta_orig_rad = (70 * Math.PI) / 180;
    const tgt = { x: dist * Math.cos(theta_orig_rad), y: dist * Math.sin(theta_orig_rad) };
    const r = snapAngle(src, tgt, 45);
    // Closest 45-multiple to 70 is 45 itself (15° away from 90, 25° from 45).
    // Wait — 70 is 25° from 45 and 20° from 90. So closest is 90. Let me re-check.
    // Actually: 70 - 45 = 25; 90 - 70 = 20. Closer to 90.
    expect(r.snappedAngleDeg).toBe(90);
    // Snapped point on the 90° ray at distance 100: (0, 100).
    expect(r.x).toBeCloseTo(0, 4);
    expect(r.y).toBeCloseTo(100, 4);
  });

  it("45° increment, click at 50° → closer to 45° (only 5° away)", () => {
    const src = { x: 0, y: 0 };
    const dist = 100;
    const t = (50 * Math.PI) / 180;
    const tgt = { x: dist * Math.cos(t), y: dist * Math.sin(t) };
    const r = snapAngle(src, tgt, 45);
    expect(r.snappedAngleDeg).toBe(45);
  });

  it("preserves distance from source (only direction snaps)", () => {
    const src = { x: 50, y: 50 };
    const tgt = { x: 250, y: 130 };
    const dist_orig = Math.hypot(tgt.x - src.x, tgt.y - src.y);
    const r = snapAngle(src, tgt, 90);
    const dist_snapped = Math.hypot(r.x - src.x, r.y - src.y);
    expect(dist_snapped).toBeCloseTo(dist_orig, 5);
  });

  it("identity when disabled (engineer toggled angle off)", () => {
    const r = snapAngle({ x: 0, y: 0 }, { x: 100, y: 75 }, 90, false);
    expect(r.x).toBe(100);
    expect(r.y).toBe(75);
  });

  it("returns target unchanged when source = target (zero distance edge case)", () => {
    const r = snapAngle({ x: 50, y: 50 }, { x: 50, y: 50 }, 90);
    expect(r.x).toBe(50);
    expect(r.y).toBe(50);
  });

  it("15° increment for fine work (slightly off-axis branch lines)", () => {
    const src = { x: 0, y: 0 };
    const dist = 100;
    const t = (37 * Math.PI) / 180;
    const tgt = { x: dist * Math.cos(t), y: dist * Math.sin(t) };
    const r = snapAngle(src, tgt, 15);
    // Closest 15-multiple to 37 is 30 (37-30=7) or 45 (45-37=8). So 30.
    expect(r.snappedAngleDeg).toBe(30);
  });
});

describe("Endpoint snap — Phase 6B", () => {
  const nodes = [
    { id: "n1", x: 100, y: 100 },
    { id: "n2", x: 250, y: 100 },
    { id: "n3", x: 100, y: 250 },
  ];

  it("click within 10 px of n1 → reuses n1, snaps to its exact coords", () => {
    const r = findEndpointSnap({ x: 108, y: 96 }, nodes, 12);
    expect(r.nodeId).toBe("n1");
    expect(r.snapped).toEqual({ x: 100, y: 100 });
  });

  it("click 30 px away from any node → no snap, no id", () => {
    const r = findEndpointSnap({ x: 175, y: 175 }, nodes, 12);
    expect(r.nodeId).toBeNull();
    expect(r.snapped).toEqual({ x: 175, y: 175 });
  });

  it("picks the NEAREST node when two are in range (deterministic tie-break)", () => {
    const tight = [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 105, y: 100 },
    ];
    // Click at (101, 100) — distance 1 from a, 4 from b. Should pick a.
    const r = findEndpointSnap({ x: 101, y: 100 }, tight, 20);
    expect(r.nodeId).toBe("a");
  });

  it("idempotent — same click → same result", () => {
    const r1 = findEndpointSnap({ x: 108, y: 96 }, nodes, 12);
    const r2 = findEndpointSnap({ x: 108, y: 96 }, nodes, 12);
    expect(r1.nodeId).toBe(r2.nodeId);
    expect(r1.snapped).toEqual(r2.snapped);
  });

  it("identity when disabled", () => {
    const r = findEndpointSnap({ x: 108, y: 96 }, nodes, 12, false);
    expect(r.nodeId).toBeNull();
    expect(r.snapped).toEqual({ x: 108, y: 96 });
  });

  it("empty node list → no snap, regardless of threshold", () => {
    const r = findEndpointSnap({ x: 50, y: 50 }, [], 100);
    expect(r.nodeId).toBeNull();
  });
});

describe("applyPlacementSnap — chained behavior", () => {
  const nodes = [
    { id: "existing", x: 100, y: 100 },
  ];
  const settings: SnapSettings = {
    grid: { enabled: true, sizeM: 5 },
    angle: { enabled: false, incrementDeg: 90 }, // irrelevant for placement
    endpoint: { enabled: true, pixelThreshold: 12 },
  };

  it("clicking near an existing node → endpoint wins, no grid override", () => {
    // Click at (108, 96) is 8.9 px from existing. Within 12 → snap to it.
    // The grid (5 m, with identity px↔m) would have rounded to (110, 95)
    // — we MUST NOT pick that.
    const r = applyPlacementSnap({ x: 108, y: 96 }, nodes, settings);
    expect(r.nodeId).toBe("existing");
    expect(r.snapped).toEqual({ x: 100, y: 100 });
  });

  it("clicking in empty grid space → grid wins", () => {
    // Click at (53, 47) — 60+ px from existing. No endpoint snap.
    // Grid (5-m, identity px↔m): rounds to (55, 45).
    const r = applyPlacementSnap({ x: 53, y: 47 }, nodes, settings);
    expect(r.nodeId).toBeNull();
    expect(r.snapped).toEqual({ x: 55, y: 45 });
  });

  it("both snaps off → identity", () => {
    const off: SnapSettings = {
      grid: { enabled: false, sizeM: 5 },
      angle: { enabled: false, incrementDeg: 90 },
      endpoint: { enabled: false, pixelThreshold: 12 },
    };
    const r = applyPlacementSnap({ x: 53, y: 47 }, nodes, off);
    expect(r.nodeId).toBeNull();
    expect(r.snapped).toEqual({ x: 53, y: 47 });
  });

  it("honours pxToM / mToPx conversion (real scale-aware grid)", () => {
    // Simulate "20 px per metre" scale: a 5-m grid is 100 px.
    // Click at (147, 247) → in metres (7.35, 12.35) → grid-round
    // (5, 10) → back to px (100, 200).
    const pxToM = (px: number) => px / 20;
    const mToPx = (m: number) => m * 20;
    const r = applyPlacementSnap(
      { x: 147, y: 247 },
      [], // no nodes — bypass endpoint check
      settings,
      pxToM,
      mToPx,
    );
    expect(r.snapped).toEqual({ x: 100, y: 200 });
  });
});

describe("DEFAULT_SNAP — sane defaults", () => {
  it("has grid on at 5 m, angle on at 90°, endpoint on at 12 px", () => {
    expect(DEFAULT_SNAP.grid.enabled).toBe(true);
    expect(DEFAULT_SNAP.grid.sizeM).toBe(5);
    expect(DEFAULT_SNAP.angle.enabled).toBe(true);
    expect(DEFAULT_SNAP.angle.incrementDeg).toBe(90);
    expect(DEFAULT_SNAP.endpoint.enabled).toBe(true);
    expect(DEFAULT_SNAP.endpoint.pixelThreshold).toBe(12);
  });
});
