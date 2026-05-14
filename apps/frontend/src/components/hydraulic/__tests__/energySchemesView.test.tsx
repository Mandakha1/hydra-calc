/**
 * Phase 8.2 — Energy schemes view + tab integration tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EnergySchemes } from "../panels/EnergySchemes";
import { HydraulicV5 } from "../HydraulicV5";
import { useHydraulicStore } from "../hydraulicStore";
import type { CalculationResults } from "../hydraulicTypes";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

function setupSeededProject(opts: { withHeatLoss?: boolean } = {}): void {
  const s = useHydraulicStore.getState();
  s.addNode({ id: "src", kind: "source_substation", label: "ЦТП-1", x: 0, y: 0 });
  s.addNode({ id: "c1", kind: "consumer_apartment", label: "АОС-1", x: 0, y: 0 });
  s.addNode({ id: "c2", kind: "consumer_school", label: "Сургууль", x: 0, y: 0 });
  s.addPipe({
    id: "p1", fromNodeId: "src", toNodeId: "c1",
    materialKey: "steel_aged", dn: 100, length_m: 100, circuit: "heating_supply",
  });
  s.addPipe({
    id: "p2", fromNodeId: "src", toNodeId: "c2",
    materialKey: "steel_aged", dn: 80, length_m: 200, circuit: "heating_supply",
  });
  const calc: CalculationResults = {
    nodes: [
      { nodeId: "src", pressureAtNode_mpa: 0.6, heatLoad_w: 0 },
      { nodeId: "c1", pressureAtNode_mpa: 0.4, heatLoad_w: 50_000, ...(opts.withHeatLoss ? { supplyTemp_C_at_inlet: 92 } : {}) },
      { nodeId: "c2", pressureAtNode_mpa: 0.4, heatLoad_w: 30_000, ...(opts.withHeatLoss ? { supplyTemp_C_at_inlet: 75 } : {}) },
    ],
    pipes: [
      { pipeId: "p1", G_kg_s: 1.5, v_m_s: 1, Re: 100000, lambda: 0.02, headlossPerMeter_pa: 100, totalPressureDrop_pa: 10000, iterations: 1, ...(opts.withHeatLoss ? { heatLossPerMeter_W: 30 } : {}) },
      { pipeId: "p2", G_kg_s: 1, v_m_s: 0.8, Re: 80000, lambda: 0.02, headlossPerMeter_pa: 80, totalPressureDrop_pa: 16000, iterations: 1, ...(opts.withHeatLoss ? { heatLossPerMeter_W: 25 } : {}) },
    ],
    totalLoad_w: 80_000,
    maxHeadlossPerMeter_pa: 100,
    maxVelocity_m_s: 1,
    minConsumerPressure_mpa: 0.4,
    ...(opts.withHeatLoss
      ? {
          heatLoss: {
            totalHeatLoss_W: 30 * 100 + 25 * 200,
            fractionOfLoad: 8000 / 80000,
            minConsumerSupplyTemp_C: 75,
            sourceSupplyTemp_C: 95,
          },
        }
      : {}),
    pump: { H_m: 25, Q_m3h: 12, P_kW: 0.85 },
    computedAt: new Date().toISOString(),
  };
  s.setResults(calc, []);
}

/* ─── Empty / error states ─────────────────────────────────── */

describe("EnergySchemes — error states (Phase 8.2)", () => {
  it("empty store (no results) → renders the run-calc banner", () => {
    render(<EnergySchemes />);
    const banner = screen.getByTestId("energy-error");
    expect(banner.textContent).toMatch(/Тооцоолох/);
  });
});

/* ─── Happy path render ───────────────────────────────────── */

describe("EnergySchemes — render (Phase 8.2)", () => {
  it("seeded project with heat loss renders the full view", () => {
    setupSeededProject({ withHeatLoss: true });
    render(<EnergySchemes />);

    // Balance bar svg present.
    expect(screen.getByTestId("energy-balance-svg")).toBeInTheDocument();

    // Summary boxes show source / consumer / losses.
    const summary = screen.getByTestId("energy-summary");
    expect(summary.textContent).toMatch(/88\.0 кВт/); // source output 50+30+8
    expect(summary.textContent).toMatch(/80\.0 кВт/); // consumer total
    expect(summary.textContent).toMatch(/8\.0 кВт/);  // losses

    // Phase 5D temperature stats.
    expect(summary.textContent).toMatch(/95\.0 °C/); // source supply temp
    expect(summary.textContent).toMatch(/75\.0 °C/); // min consumer
    // Min < 80 °C → the БНбД badge with red ⚠ <80 marker.
    expect(summary.textContent).toMatch(/<80/);

    // Pump power.
    expect(summary.textContent).toMatch(/0\.85 кВт/);

    // Consumer table.
    const consumers = screen.getByTestId("energy-consumers");
    expect(consumers.textContent).toMatch(/АОС-1/);
    expect(consumers.textContent).toMatch(/Сургууль/);
    // Sorted: АОС-1 (50 kW) first.
    const rows = consumers.querySelectorAll("tbody tr");
    expect(rows[0]!.textContent).toMatch(/АОС-1/);

    // Circuit table.
    const circuits = screen.getByTestId("energy-circuits");
    expect(circuits.textContent).toMatch(/Халаалт нийлүүлэх/);
  });

  it("no-heat-loss project still renders consumer rows but losses are 0", () => {
    setupSeededProject({ withHeatLoss: false });
    render(<EnergySchemes />);
    const summary = screen.getByTestId("energy-summary");
    expect(summary.textContent).toMatch(/80\.0 кВт/); // source = consumers only
    expect(summary.textContent).toMatch(/0\.0 кВт/);  // losses
    // No temperature badges when heat-loss disabled.
    expect(summary.textContent).not.toMatch(/<80/);
  });

  it("temperature OK (>= 80 °C) renders the success badge", () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "src", x: 0, y: 0 });
    s.addNode({ id: "c1", kind: "consumer_apartment", label: "c1", x: 0, y: 0 });
    s.addPipe({
      id: "p1", fromNodeId: "src", toNodeId: "c1",
      materialKey: "steel_aged", dn: 100, length_m: 100, circuit: "heating_supply",
    });
    s.setResults(
      {
        nodes: [
          { nodeId: "src", pressureAtNode_mpa: 0.6, heatLoad_w: 0 },
          { nodeId: "c1", pressureAtNode_mpa: 0.4, heatLoad_w: 50_000, supplyTemp_C_at_inlet: 89 },
        ],
        pipes: [
          { pipeId: "p1", G_kg_s: 1.5, v_m_s: 1, Re: 100000, lambda: 0.02, headlossPerMeter_pa: 100, totalPressureDrop_pa: 10000, iterations: 1, heatLossPerMeter_W: 10 },
        ],
        totalLoad_w: 50_000,
        maxHeadlossPerMeter_pa: 100,
        maxVelocity_m_s: 1,
        minConsumerPressure_mpa: 0.4,
        heatLoss: { totalHeatLoss_W: 1000, fractionOfLoad: 0.02, minConsumerSupplyTemp_C: 89, sourceSupplyTemp_C: 95 },
        computedAt: new Date().toISOString(),
      },
      [],
    );
    render(<EnergySchemes />);
    expect(screen.getByTestId("energy-summary").textContent).toMatch(/✓ ≥80/);
  });
});

/* ─── HydraulicV5 tab wiring ──────────────────────────────── */

describe("HydraulicV5 — ⚡ Энерги tab integration (Phase 8.2)", () => {
  it("renders the Энерги tab in the tab bar", () => {
    render(<HydraulicV5 />);
    expect(screen.getByText(/⚡ Энерги/)).toBeInTheDocument();
  });

  it("clicking the Энерги tab swaps the main panel to EnergySchemes", async () => {
    setupSeededProject({ withHeatLoss: true });
    render(<HydraulicV5 />);
    fireEvent.click(screen.getByText(/⚡ Энерги/));
    const view = await screen.findByTestId("energy-schemes");
    expect(view).toBeInTheDocument();
  });
});
