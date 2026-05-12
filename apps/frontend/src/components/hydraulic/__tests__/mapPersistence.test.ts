/**
 * Phase 5B.1a — Map style toggle persistence.
 *
 * Engineers picking between OSM, Satellite, and Topographic tiles
 * expect their choice to survive page reload (and to round-trip
 * through the backend's JSONB blob). The store contract is what
 * the SchemeEditor's MapControls component dispatches against, so
 * we lock it down here independently of the React render.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useHydraulicStore } from "../hydraulicStore";
import { MAP_PROVIDERS } from "../panels/MapBackground";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("Map persistence — Phase 5B.1a", () => {
  it("defaults to no provider key (caller falls back to 'osm')", () => {
    // Fresh project has no mapProviderKey — SchemeEditor falls back
    // to the OSM default. This is intentional so legacy projects
    // (saved before 5B.1) render the same way as before.
    const s = useHydraulicStore.getState().settings;
    expect(s.mapProviderKey).toBeUndefined();
    expect(s.mapOpacity).toBeUndefined();
  });

  it("updateSettings persists mapProviderKey", () => {
    useHydraulicStore.getState().updateSettings({ mapProviderKey: "satellite" });
    expect(useHydraulicStore.getState().settings.mapProviderKey).toBe("satellite");
  });

  it("updateSettings persists mapOpacity", () => {
    useHydraulicStore.getState().updateSettings({ mapOpacity: 0.65 });
    expect(useHydraulicStore.getState().settings.mapOpacity).toBe(0.65);
  });

  it("updateSettings persists map centre + zoom together", () => {
    useHydraulicStore.getState().updateSettings({
      mapCenterLat: 47.92,
      mapCenterLon: 106.92,
      mapZoom: 17,
    });
    const s = useHydraulicStore.getState().settings;
    expect(s.mapCenterLat).toBeCloseTo(47.92, 5);
    expect(s.mapCenterLon).toBeCloseTo(106.92, 5);
    expect(s.mapZoom).toBe(17);
  });

  it("provider key matches one of MAP_PROVIDERS", () => {
    // Sanity guard — any persisted key must come from MAP_PROVIDERS so
    // the tile layer can resolve. Catches typos in callers.
    const keys = MAP_PROVIDERS.map((p) => p.key);
    expect(keys).toContain("osm");
    expect(keys).toContain("satellite");
    expect(keys).toContain("topo");
    // The selector dispatches one of these; we verify the round-trip.
    for (const k of ["osm", "satellite", "topo"]) {
      useHydraulicStore.getState().updateSettings({ mapProviderKey: k });
      expect(useHydraulicStore.getState().settings.mapProviderKey).toBe(k);
    }
  });
});
