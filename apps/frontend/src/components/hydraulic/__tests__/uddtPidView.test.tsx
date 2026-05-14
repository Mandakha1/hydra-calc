/**
 * Phase 8.5 — УДДТ P&ID view + tab integration tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UddtPid } from "../panels/UddtPid";
import { HydraulicV5 } from "../HydraulicV5";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("UddtPid — error states", () => {
  it("no source → error banner", () => {
    useHydraulicStore.getState().addNode({
      id: "c", kind: "consumer_apartment", label: "АОС", x: 0, y: 0,
    });
    render(<UddtPid />);
    expect(screen.getByTestId("pid-error")).toBeInTheDocument();
  });
});

describe("UddtPid — render", () => {
  function setup() {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "ЦТП-1", x: 0, y: 0 });
    s.addNode({ id: "p1", kind: "pump_circ", label: "ЦН-1", x: 0, y: 0 });
    s.addNode({ id: "v1", kind: "valve_gate", label: "ЗД-1", x: 0, y: 0 });
    s.addNode({ id: "tt", kind: "sensor_temperature", label: "TT-1", x: 0, y: 0 });
    s.addNode({ id: "pt", kind: "sensor_pressure", label: "PT-1", x: 0, y: 0 });
    s.addNode({ id: "aos", kind: "consumer_apartment", label: "АОС-1", x: 0, y: 0 });
    s.addPipe({ id: "e1", fromNodeId: "src", toNodeId: "p1", materialKey: "steel_aged", dn: 100, length_m: 5, circuit: "heating_supply" });
    s.addPipe({ id: "e2", fromNodeId: "p1", toNodeId: "v1", materialKey: "steel_aged", dn: 100, length_m: 5, circuit: "heating_supply" });
    s.addPipe({ id: "e3", fromNodeId: "v1", toNodeId: "aos", materialKey: "steel_aged", dn: 80, length_m: 100, circuit: "heating_supply" });
    s.addPipe({ id: "e4", fromNodeId: "p1", toNodeId: "tt", materialKey: "steel_aged", dn: 25, length_m: 1 });
    s.addPipe({ id: "e5", fromNodeId: "v1", toNodeId: "pt", materialKey: "steel_aged", dn: 25, length_m: 1 });
  }

  it("renders stats + svg + legend", () => {
    setup();
    render(<UddtPid />);
    expect(screen.getByTestId("pid-stats")).toBeInTheDocument();
    expect(screen.getByTestId("pid-svg")).toBeInTheDocument();
    expect(screen.getByTestId("pid-legend")).toBeInTheDocument();
  });

  it("stats counts each role correctly", () => {
    setup();
    render(<UddtPid />);
    const stats = screen.getByTestId("pid-stats").textContent ?? "";
    // 1 source, 1 pump, 1 valve, 2 sensors, 1 consumer.
    expect(stats).toMatch(/Эх үүсвэр1/);
    expect(stats).toMatch(/Насос1/);
    expect(stats).toMatch(/Арматура1/);
    expect(stats).toMatch(/Мэдрэгч2/);
    expect(stats).toMatch(/Хэрэглэгч1/);
  });

  it("renders an element group per placed node", () => {
    setup();
    render(<UddtPid />);
    expect(screen.getByTestId("pid-src")).toBeInTheDocument();
    expect(screen.getByTestId("pid-p1")).toBeInTheDocument();
    expect(screen.getByTestId("pid-tt")).toBeInTheDocument();
  });
});

describe("HydraulicV5 — 🛠 P&ID tab integration", () => {
  it("tab renders + opens on click", async () => {
    const s = useHydraulicStore.getState();
    s.addNode({ id: "src", kind: "source_substation", label: "ЦТП", x: 0, y: 0 });
    render(<HydraulicV5 />);
    const tab = screen.getByText(/P&ID/);
    expect(tab).toBeInTheDocument();
    fireEvent.click(tab);
    const view = await screen.findByTestId("uddt-pid");
    expect(view).toBeInTheDocument();
  });
});
