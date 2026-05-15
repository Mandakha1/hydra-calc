/**
 * Phase 12.6 — Channel cross-section detail view tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChannelDetail } from "../panels/ChannelDetail";
import { useHydraulicStore } from "../hydraulicStore";
import { buildChannelFromDraw } from "../scheme/channelOperations";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

describe("ChannelDetail — error state", () => {
  it("shows guidance when project has no channels", () => {
    render(<ChannelDetail />);
    expect(screen.getByTestId("channel-error").textContent).toMatch(/суваг/);
  });
});

describe("ChannelDetail — render", () => {
  function setup({
    channelType = "Л-9",
    circuits,
  }: {
    channelType?: "Л-4" | "Л-7" | "Л-9";
    circuits?: ("heating_supply" | "heating_return" | "dhw_supply" | "dhw_recirc" | "cold_water")[];
  } = {}) {
    const s = useHydraulicStore.getState();
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType,
      pipeCircuits: circuits ?? [
        "heating_supply",
        "heating_return",
        "dhw_supply",
        "dhw_recirc",
        "cold_water",
      ],
      length_m: 50,
    });
    s.addChannel(channel, pipes);
    return { channel, pipes };
  }

  it("renders header with channel type + dimensions + pipe count", () => {
    setup({ channelType: "Л-9" });
    render(<ChannelDetail />);
    const header = screen.getByTestId("channel-header");
    expect(header.textContent).toMatch(/Л-9/);
    expect(header.textContent).toMatch(/1500/);
    expect(header.textContent).toMatch(/610/);
    expect(header.textContent).toMatch(/5/);
  });

  it("renders SVG canvas with one circle per pipe", () => {
    const { pipes } = setup({ channelType: "Л-9" });
    render(<ChannelDetail />);
    for (const p of pipes) {
      expect(screen.getByTestId(`channel-pipe-${p.id}`)).toBeInTheDocument();
    }
  });

  it("renders pipe table with all 5 circuits in canonical order", () => {
    setup({ channelType: "Л-9" });
    render(<ChannelDetail />);
    const table = screen.getByTestId("channel-pipe-table");
    const rows = table.querySelectorAll("tbody tr");
    expect(rows.length).toBe(5);
    expect(rows[0]!.textContent).toMatch(/D2\.1/);
    expect(rows[1]!.textContent).toMatch(/D2\.2/);
    expect(rows[2]!.textContent).toMatch(/D3/);
    expect(rows[3]!.textContent).toMatch(/D4/);
    expect(rows[4]!.textContent).toMatch(/У1/);
  });

  it("Л-4 channel renders correct dimensions (600×450)", () => {
    setup({ channelType: "Л-4", circuits: ["heating_supply", "heating_return"] });
    render(<ChannelDetail />);
    expect(screen.getByTestId("channel-header").textContent).toMatch(/600.*450/);
  });

  it("Л-7 channel renders correct dimensions (1200×580)", () => {
    setup({
      channelType: "Л-7",
      circuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"],
    });
    render(<ChannelDetail />);
    expect(screen.getByTestId("channel-header").textContent).toMatch(/1200.*580/);
  });

  it("shows temperature badge for circuits with defined °C", () => {
    setup({ channelType: "Л-9" });
    render(<ChannelDetail />);
    const table = screen.getByTestId("channel-pipe-table");
    // heating_supply at 95 °C should appear in the temperature column
    expect(table.textContent).toMatch(/95 °C/);
    expect(table.textContent).toMatch(/70 °C/);
    expect(table.textContent).toMatch(/60 °C/);
  });

  it("picks channel containing the selected pipe (multi-channel scene)", () => {
    const s = useHydraulicStore.getState();
    const draw1 = buildChannelFromDraw({
      fromNodeId: "n1", toNodeId: "n2", channelType: "Л-4",
      pipeCircuits: ["heating_supply", "heating_return"], length_m: 20,
    });
    const draw2 = buildChannelFromDraw({
      fromNodeId: "n2", toNodeId: "n3", channelType: "Л-9",
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
      length_m: 50,
    });
    s.addChannel(draw1.channel, draw1.pipes);
    s.addChannel(draw2.channel, draw2.pipes);
    // Select a pipe inside the second (Л-9) channel
    s.select({ kind: "pipe", id: draw2.pipes[0]!.id });
    render(<ChannelDetail />);
    // Header should reflect the Л-9 channel, not Л-4
    expect(screen.getByTestId("channel-header").textContent).toMatch(/Л-9/);
  });

  it("custom channel with engineer-set dimensions renders fine", () => {
    const s = useHydraulicStore.getState();
    const { channel, pipes } = buildChannelFromDraw({
      fromNodeId: "n1",
      toNodeId: "n2",
      channelType: "custom",
      customWidth_mm: 900,
      customHeight_mm: 500,
      pipeCircuits: ["heating_supply", "heating_return", "dhw_supply"],
      length_m: 30,
    });
    s.addChannel(channel, pipes);
    render(<ChannelDetail />);
    const header = screen.getByTestId("channel-header");
    expect(header.textContent).toMatch(/Сонголтоор/);
    expect(header.textContent).toMatch(/900.*500/);
  });
});
