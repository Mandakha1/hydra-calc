/**
 * Phase 8.3 — Well detail view + tab integration tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WellDetail } from "../panels/WellDetail";
import { HydraulicV5 } from "../HydraulicV5";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("WellDetail — error states (Phase 8.3)", () => {
  it("renders no-chamber error when scene has no well/chamber nodes", () => {
    useHydraulicStore.getState().addNode({
      id: "c", kind: "consumer_apartment", label: "АОС", x: 0, y: 0,
    });
    render(<WellDetail />);
    expect(screen.getByTestId("well-error").textContent).toMatch(/худаг/i);
  });
});

describe("WellDetail — render (Phase 8.3)", () => {
  function setup() {
    const s = useHydraulicStore.getState();
    s.addNode({
      id: "w1", kind: "chamber", label: "К-12", x: 100, y: 100,
      chamber_length_m: 4, chamber_width_m: 2.5, chamber_depth_m: 3,
      coverDiameter_mm: 800,
    });
    s.addNode({ id: "east", kind: "consumer_apartment", label: "АОС-1", x: 200, y: 100 });
    s.addNode({ id: "west", kind: "source_substation", label: "ЦТП", x: 0, y: 100 });
    s.addPipe({ id: "p1", fromNodeId: "w1", toNodeId: "east", materialKey: "steel_aged", dn: 100, length_m: 50, circuit: "heating_supply" });
    s.addPipe({ id: "p2", fromNodeId: "west", toNodeId: "w1", materialKey: "steel_aged", dn: 100, length_m: 50, circuit: "heating_supply" });
    s.select({ kind: "node", id: "w1" });
  }

  it("renders header + dimensions form + cross-section svg + penetrations table", () => {
    setup();
    render(<WellDetail />);
    expect(screen.getByTestId("well-header").textContent).toMatch(/К-12/);
    expect(screen.getByTestId("well-dimensions-form")).toBeInTheDocument();
    expect(screen.getByTestId("well-svg")).toBeInTheDocument();
    expect(screen.getByTestId("well-penetrations")).toBeInTheDocument();
  });

  it("editing the L (м) input writes the new dimension to the store", () => {
    setup();
    render(<WellDetail />);
    const inputs = screen.getByTestId("well-dimensions-form").querySelectorAll("input");
    const lInput = inputs[0]! as HTMLInputElement;
    fireEvent.change(lInput, { target: { value: "6" } });
    const stored = useHydraulicStore.getState().nodes.find((n) => n.id === "w1");
    expect(stored?.chamber_length_m).toBe(6);
  });

  it("shows default-advisory when no chamber dimensions are stored", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "w_default", kind: "chamber", label: "К-Default", x: 0, y: 0 });
    s.select({ kind: "node", id: "w_default" });
    render(<WellDetail />);
    expect(screen.getByTestId("well-default-advisory")).toBeInTheDocument();
  });

  it("penetrations table lists each pipe + its side", () => {
    setup();
    render(<WellDetail />);
    const rows = screen.getByTestId("well-penetrations").querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
    const text = screen.getByTestId("well-penetrations").textContent ?? "";
    expect(text).toMatch(/Баруун/); // east
    expect(text).toMatch(/Зүүн/);   // west
  });

  it("falls back to first chamber when selection isn't a well", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "w_first", kind: "chamber", label: "К-first", x: 0, y: 0 });
    s.addNode({ id: "c", kind: "consumer_apartment", label: "АОС", x: 0, y: 0 });
    s.select({ kind: "node", id: "c" });
    render(<WellDetail />);
    expect(screen.getByTestId("well-header").textContent).toMatch(/К-first/);
  });
});

describe("HydraulicV5 — 🛢 Худаг tab integration (Phase 8.3)", () => {
  it("renders the Худаг tab + opens it on click", async () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "w", kind: "chamber", label: "К-1", x: 0, y: 0 });
    render(<HydraulicV5 />);
    const tab = screen.getByText(/🛢 Худаг/);
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab);
    const view = await screen.findByTestId("well-detail");
    expect(view).toBeInTheDocument();
  });
});
