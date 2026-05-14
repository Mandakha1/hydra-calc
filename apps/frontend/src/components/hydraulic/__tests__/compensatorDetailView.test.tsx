/**
 * Phase 8.4 — Compensator detail view + tab integration.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompensatorDetail } from "../panels/CompensatorDetail";
import { HydraulicV5 } from "../HydraulicV5";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("CompensatorDetail — error states", () => {
  it("renders error banner when no compensator in scene", () => {
    useHydraulicStore.getState().addNode({
      id: "c", kind: "consumer_apartment", label: "АОС", x: 0, y: 0,
    });
    render(<CompensatorDetail />);
    expect(screen.getByTestId("compensator-error").textContent).toMatch(/компенсатор/i);
  });
});

describe("CompensatorDetail — render", () => {
  function setup(kind: string = "compensator_u") {
    const s = useHydraulicStore.getState();
    s.addNode({
      id: "k", kind, label: "К-7", x: 0, y: 0,
      bendRadius_mm: 600, armHeight_m: 1.5, span_m: 2.8,
    });
    s.select({ kind: "node", id: "k" });
  }

  it("renders header + dimensions form + svg + expansion table", () => {
    setup();
    render(<CompensatorDetail />);
    expect(screen.getByTestId("compensator-header").textContent).toMatch(/К-7/);
    expect(screen.getByTestId("compensator-dimensions-form")).toBeInTheDocument();
    expect(screen.getByTestId("compensator-svg")).toBeInTheDocument();
    expect(screen.getByTestId("compensator-expansion")).toBeInTheDocument();
  });

  it("editing R input writes to the store", () => {
    setup();
    render(<CompensatorDetail />);
    const inputs = screen.getByTestId("compensator-dimensions-form").querySelectorAll("input");
    fireEvent.change(inputs[0]!, { target: { value: "1000" } });
    const stored = useHydraulicStore.getState().nodes.find((n) => n.id === "k");
    expect(stored?.bendRadius_mm).toBe(1000);
  });

  it("renders default advisory when no explicit dimensions stored", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "k_d", kind: "compensator_u", label: "К-Default", x: 0, y: 0 });
    s.select({ kind: "node", id: "k_d" });
    render(<CompensatorDetail />);
    expect(screen.getByTestId("compensator-default-advisory")).toBeInTheDocument();
  });

  it("expansion table shows ΔL computed from span", () => {
    setup();
    render(<CompensatorDetail />);
    // α=1.2e-5, ΔT=75, L=2.8 → 2.52 mm
    expect(screen.getByTestId("compensator-expansion").textContent).toMatch(/2\.5/);
  });

  it("bellow variant renders the accordion path instead of u-arms", () => {
    setup("compensator_bellow");
    render(<CompensatorDetail />);
    const svg = screen.getByTestId("compensator-svg");
    // Bellow variant uses a path with L-segments; u-bend uses A (arc) command.
    const paths = svg.querySelectorAll("path");
    const dStrings = Array.from(paths).map((p) => p.getAttribute("d") ?? "");
    expect(dStrings.some((d) => /A /.test(d))).toBe(false);
    expect(dStrings.some((d) => /L /.test(d))).toBe(true);
  });
});

describe("HydraulicV5 — 🔄 Компенсатор tab integration", () => {
  it("tab renders + opens on click", async () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "k", kind: "compensator_u", label: "К-1", x: 0, y: 0 });
    render(<HydraulicV5 />);
    const tab = screen.getByText(/🔄 Компенсатор/);
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab);
    const view = await screen.findByTestId("compensator-detail");
    expect(view).toBeInTheDocument();
  });
});
