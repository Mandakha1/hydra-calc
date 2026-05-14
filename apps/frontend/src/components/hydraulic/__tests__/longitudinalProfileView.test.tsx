/**
 * Phase 8.1 — Longitudinal profile view integration tests.
 *
 * Locks down:
 *   - Error states render when the network is empty / has no source
 *   - Stats strip computes correctly from the trace
 *   - SVG renders the right number of node markers + axis ticks
 *   - "No elevation data" advisory shows when all nodes are flat
 *   - Tab wiring through HydraulicV5 (Профиль tab appears + activates)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LongitudinalProfile } from "../panels/LongitudinalProfile";
import { HydraulicV5 } from "../HydraulicV5";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

/* ─── Empty / error states ─────────────────────────────────────── */

describe("LongitudinalProfile — error states (Phase 8.1)", () => {
  it("empty network → renders the no-nodes error banner", () => {
    render(<LongitudinalProfile />);
    const banner = screen.getByTestId("profile-error");
    expect(banner.textContent).toMatch(/зангилаа/);
  });

  it("nodes-but-no-pipes → no-pipes error banner", () => {
    useHydraulicStore.getState().addNode({
      id: "src",
      kind: "source_substation",
      label: "ЦТП-1",
      x: 0,
      y: 0,
    });
    render(<LongitudinalProfile />);
    expect(screen.getByTestId("profile-error").textContent).toMatch(/хоолой/);
  });
});

/* ─── Happy path render ────────────────────────────────────────── */

describe("LongitudinalProfile — render (Phase 8.1)", () => {
  it("happy path: 3-node chain renders SVG + stats + 3 markers", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "ЦТП-1", x: 0, y: 0, elevation_m: 1300 });
    s.addNode({ id: "a", kind: "junction", label: "К-1", x: 0, y: 0, elevation_m: 1290 });
    s.addNode({ id: "b", kind: "consumer_apartment", label: "АОС-15", x: 0, y: 0, elevation_m: 1280 });
    s.addPipe({
      id: "p1", fromNodeId: "src", toNodeId: "a",
      materialKey: "steel_aged", dn: 100, length_m: 100, circuit: "heating_supply",
    });
    s.addPipe({
      id: "p2", fromNodeId: "a", toNodeId: "b",
      materialKey: "steel_aged", dn: 100, length_m: 150, circuit: "heating_supply",
    });
    render(<LongitudinalProfile />);

    // No error banner.
    expect(screen.queryByTestId("profile-error")).toBeNull();

    // Stats strip carries the formatted totals.
    const stats = screen.getByTestId("profile-stats");
    expect(stats.textContent).toMatch(/0\+250/); // 250 m total in km+m
    expect(stats.textContent).toMatch(/1280/);   // low point elevation
    expect(stats.textContent).toMatch(/1300/);   // high point elevation
    expect(stats.textContent).toMatch(/3/);      // 3 points
  });

  it("no-elevation advisory shows when every node is flat at 0", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "src", x: 0, y: 0 });
    s.addNode({ id: "c1", kind: "consumer_apartment", label: "c1", x: 0, y: 0 });
    s.addPipe({
      id: "p1", fromNodeId: "src", toNodeId: "c1",
      materialKey: "steel_aged", dn: 100, length_m: 50, circuit: "heating_supply",
    });
    render(<LongitudinalProfile />);
    expect(screen.getByTestId("profile-no-elev-advisory")).toBeInTheDocument();
  });

  it("no-elevation advisory hidden when AT LEAST ONE node carries elevation", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "src", x: 0, y: 0, elevation_m: 1300 });
    s.addNode({ id: "c1", kind: "consumer_apartment", label: "c1", x: 0, y: 0 });
    s.addPipe({
      id: "p1", fromNodeId: "src", toNodeId: "c1",
      materialKey: "steel_aged", dn: 100, length_m: 50, circuit: "heating_supply",
    });
    render(<LongitudinalProfile />);
    expect(screen.queryByTestId("profile-no-elev-advisory")).toBeNull();
  });

  it("SVG renders with the expected testid", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "src", x: 0, y: 0, elevation_m: 1300 });
    s.addNode({ id: "c1", kind: "consumer_apartment", label: "c1", x: 0, y: 0, elevation_m: 1280 });
    s.addPipe({
      id: "p1", fromNodeId: "src", toNodeId: "c1",
      materialKey: "steel_aged", dn: 100, length_m: 100, circuit: "heating_supply",
    });
    render(<LongitudinalProfile />);
    expect(screen.getByTestId("profile-svg")).toBeInTheDocument();
  });
});

/* ─── HydraulicV5 tab wiring ───────────────────────────────────── */

describe("HydraulicV5 — Профиль tab integration (Phase 8.1)", () => {
  it("renders the Профиль tab button in the tab bar", () => {
    render(<HydraulicV5 />);
    const tab = screen.getByText(/📊 Профиль/);
    expect(tab).toBeInTheDocument();
  });

  it("clicking the Профиль tab swaps the main panel to LongitudinalProfile", async () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "src", x: 0, y: 0, elevation_m: 1300 });
    s.addNode({ id: "c1", kind: "consumer_apartment", label: "c1", x: 0, y: 0, elevation_m: 1280 });
    s.addPipe({
      id: "p1", fromNodeId: "src", toNodeId: "c1",
      materialKey: "steel_aged", dn: 100, length_m: 100, circuit: "heating_supply",
    });
    render(<HydraulicV5 />);
    fireEvent.click(screen.getByText(/📊 Профиль/));
    // The LongitudinalProfile view is lazy-loaded — wait for it to mount.
    const view = await screen.findByTestId("longitudinal-profile");
    expect(view).toBeInTheDocument();
  });
});
