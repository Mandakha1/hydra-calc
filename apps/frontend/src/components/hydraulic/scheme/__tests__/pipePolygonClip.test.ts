/**
 * Phase 13.1 — Pipe-endpoint polygon clip tests.
 */
import { describe, it, expect } from "vitest";
import {
  polygonSegmentIntersection,
  pointInPolygon,
  findTaggedBuilding,
  clipPipeEndpointAtBuilding,
} from "../pipePolygonClip";
import type { SchemeBuilding } from "../../hydraulicTypes";

const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("polygonSegmentIntersection", () => {
  it("returns null when segment doesn't cross any edge", () => {
    // Segment well outside the square
    expect(polygonSegmentIntersection({ x: 200, y: 50 }, { x: 300, y: 50 }, SQUARE)).toBeNull();
  });

  it("hits the right edge when going centre → right", () => {
    const hit = polygonSegmentIntersection({ x: 50, y: 50 }, { x: 200, y: 50 }, SQUARE);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(100, 1);
    expect(hit!.y).toBeCloseTo(50, 1);
  });

  it("returns the CLOSEST intersection when segment crosses twice", () => {
    // Segment crosses left edge then right edge — we want the LEFT (closer to A)
    const hit = polygonSegmentIntersection({ x: -50, y: 50 }, { x: 150, y: 50 }, SQUARE);
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(0, 1);
    expect(hit!.y).toBeCloseTo(50, 1);
  });

  it("handles diagonal segments", () => {
    // Centre → bottom-right corner area
    const hit = polygonSegmentIntersection({ x: 50, y: 50 }, { x: 200, y: 200 }, SQUARE);
    expect(hit).not.toBeNull();
    // Should hit the right OR bottom edge depending on slope
    // For 45° slope from (50, 50) → exits at (100, 100) corner
    expect(hit!.x).toBeCloseTo(100, 1);
    expect(hit!.y).toBeCloseTo(100, 1);
  });

  it("returns null for degenerate zero-length segment", () => {
    expect(polygonSegmentIntersection({ x: 50, y: 50 }, { x: 50, y: 50 }, SQUARE)).toBeNull();
  });

  it("returns null for malformed polygon (fewer than 3 vertices)", () => {
    expect(polygonSegmentIntersection({ x: 0, y: 0 }, { x: 100, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it("works on an irregular pentagon", () => {
    const pentagon = [
      { x: 50, y: 0 },
      { x: 100, y: 38 },
      { x: 80, y: 100 },
      { x: 20, y: 100 },
      { x: 0, y: 38 },
    ];
    const hit = polygonSegmentIntersection({ x: 50, y: 50 }, { x: 200, y: 50 }, pentagon);
    expect(hit).not.toBeNull();
    // Right edge between (100, 38) and (80, 100) at y=50
    expect(hit!.x).toBeGreaterThan(50);
    expect(hit!.x).toBeLessThan(120);
  });
});

describe("pointInPolygon", () => {
  it("centre of a square is inside", () => {
    expect(pointInPolygon({ x: 50, y: 50 }, SQUARE)).toBe(true);
  });

  it("point far outside is outside", () => {
    expect(pointInPolygon({ x: 200, y: 200 }, SQUARE)).toBe(false);
    expect(pointInPolygon({ x: -10, y: 50 }, SQUARE)).toBe(false);
  });

  it("returns false for malformed polygons", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
  });
});

describe("findTaggedBuilding", () => {
  it("returns the building whose taggedAsNodeId matches", () => {
    const buildings: SchemeBuilding[] = [
      { id: "b1", polygon: SQUARE, label: "B1", taggedAsNodeId: "n1" },
      { id: "b2", polygon: SQUARE, label: "B2", taggedAsNodeId: "n2" },
    ];
    expect(findTaggedBuilding("n1", buildings)?.id).toBe("b1");
    expect(findTaggedBuilding("n2", buildings)?.id).toBe("b2");
  });

  it("returns null when no building tags this node", () => {
    const buildings: SchemeBuilding[] = [
      { id: "b1", polygon: SQUARE, label: "B1", taggedAsNodeId: "n1" },
    ];
    expect(findTaggedBuilding("n_other", buildings)).toBeNull();
  });

  it("returns null when buildings list is empty/undefined", () => {
    expect(findTaggedBuilding("n1", [])).toBeNull();
    expect(findTaggedBuilding("n1", undefined)).toBeNull();
  });
});

describe("clipPipeEndpointAtBuilding", () => {
  function building(over: Partial<SchemeBuilding> = {}): SchemeBuilding {
    return {
      id: "b1",
      polygon: SQUARE,
      label: "Test",
      taggedAsNodeId: "n1",
      ...over,
    };
  }

  it("clips at the right edge when the other endpoint is to the right", () => {
    // Building centroid (50, 50), other endpoint (200, 50) → pipe goes right
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: { x: 50, y: 50 },
      otherEndpoint: { x: 200, y: 50 },
      building: building(),
    });
    expect(clipped.x).toBeCloseTo(100, 1);
    expect(clipped.y).toBeCloseTo(50, 1);
  });

  it("clips at the left edge when the other endpoint is to the left", () => {
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: { x: 50, y: 50 },
      otherEndpoint: { x: -100, y: 50 },
      building: building(),
    });
    expect(clipped.x).toBeCloseTo(0, 1);
    expect(clipped.y).toBeCloseTo(50, 1);
  });

  it("clips at the top edge when pipe goes up", () => {
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: { x: 50, y: 50 },
      otherEndpoint: { x: 50, y: -100 },
      building: building(),
    });
    expect(clipped.x).toBeCloseTo(50, 1);
    expect(clipped.y).toBeCloseTo(0, 1);
  });

  it("returns endpointAt unchanged when polygon is malformed", () => {
    const orig = { x: 50, y: 50 };
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: orig,
      otherEndpoint: { x: 200, y: 50 },
      building: building({ polygon: [] }),
    });
    expect(clipped).toEqual(orig);
  });

  it("returns endpointAt unchanged when segment doesn't cross perimeter", () => {
    // Both points inside the same polygon → no exit point in that direction
    const orig = { x: 50, y: 50 };
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: orig,
      otherEndpoint: { x: 60, y: 60 },
      building: building(),
    });
    expect(clipped).toEqual(orig);
  });

  it("respects an explicit displayPolygon override (map-anchored buildings)", () => {
    // Engineer panned the map so the visible polygon shifted 100 px right
    const displayPolygon = SQUARE.map((v) => ({ x: v.x + 100, y: v.y }));
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: { x: 150, y: 50 }, // visible centroid
      otherEndpoint: { x: 300, y: 50 },
      building: building(),
      displayPolygon,
    });
    expect(clipped.x).toBeCloseTo(200, 1);
    expect(clipped.y).toBeCloseTo(50, 1);
  });

  it("handles non-rectangular footprints (L-shape)", () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 40 },
      { x: 30, y: 40 },
      { x: 30, y: 100 },
      { x: 0, y: 100 },
    ];
    // From centroid-ish (15, 50) going right → should hit x=30 edge first
    const clipped = clipPipeEndpointAtBuilding({
      endpointAt: { x: 15, y: 50 },
      otherEndpoint: { x: 200, y: 50 },
      building: building({ polygon: lShape }),
    });
    expect(clipped.x).toBeCloseTo(30, 1);
    expect(clipped.y).toBeCloseTo(50, 1);
  });
});
