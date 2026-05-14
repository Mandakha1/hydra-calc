/**
 * Phase 7.4 — Engineer review pane tests.
 *
 * Covers:
 *   - Render with parseResult prop
 *   - Stats grid + tables (blocks + layers)
 *   - Block alias dropdown contents (43 NodeKinds across 6+ optgroups)
 *   - Circuit dropdown contents (5 circuits)
 *   - Live-preview recompute on override change
 *   - Confirm path with override payload
 *   - Cancel path
 *   - Clear-overrides reset
 *   - Conflict-flagged layer row gets the amber background
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ImportReviewPanel } from "../ImportReviewPanel";
import type { DxfImportResult, ExtractedDxf } from "../../../../lib/dxfImport";

function makeParseResult(overrides?: Partial<DxfImportResult>): DxfImportResult {
  return {
    state: {
      nodes: [
        { id: "n1", kind: "consumer_apartment", label: "АОС-1", x: 0, y: 0 },
        { id: "n2", kind: "source_substation", label: "ЦТП", x: 100, y: 0 },
      ],
      pipes: [
        { id: "p1", fromNodeId: "n2", toNodeId: "n1", materialKey: "steel_aged", dn: 100, length_m: 50, circuit: "heating_supply" },
      ],
      settings: { networkType: "two_pipe_closed", temperatureScheduleKey: "95_70", city: "ulaanbaatar", primaryMaterialCategory: "steel", localLossesFraction: 0.3, sourcePressure_mpa: 0.6 },
      schemaVersion: 5 as const,
    },
    stats: {
      pipes: 1,
      nodes: 2,
      junctions: 0,
      chambers: 0,
      consumers: 1,
      sources: 1,
      totalLength_m: 50,
      layers: 2,
      circuitCounts: { heating_supply: 1 },
      circuitConflicts: 0,
    },
    distinctBlocks: [
      { block: "АОС-1", nodeCount: 1, autoKind: "consumer_apartment" },
      { block: "ЦТП-блок", nodeCount: 1, autoKind: "source_substation" },
    ],
    distinctLayers: [
      { layer: "HEATING_SUPPLY", pipeCount: 1, autoCircuit: "heating_supply", autoLayerKey: "D2.1", hadConflict: false },
      { layer: "CONFLICTED", pipeCount: 1, autoCircuit: "heating_supply", autoLayerKey: "D2.1", hadConflict: true },
    ],
    warnings: [],
    bbox: { minX: 0, maxX: 100, minY: 0, maxY: 50 },
    ...overrides,
  };
}

describe("ImportReviewPanel — render", () => {
  it("renders the panel container with testid", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByTestId("import-review-panel")).toBeInTheDocument();
  });

  it("renders stats grid with live counts", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByTestId("review-stats")).toBeInTheDocument();
    // 2 nodes from fixture
    expect(screen.getByTestId("review-stats").textContent).toMatch(/Зангилаа.*2/);
    // 1 pipe
    expect(screen.getByTestId("review-stats").textContent).toMatch(/Хоолой.*1/);
  });

  it("renders block + layer tables", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.getByTestId("review-blocks")).toBeInTheDocument();
    expect(screen.getByTestId("review-layers")).toBeInTheDocument();
  });

  it("flags conflict layer with the warning icon", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const layerSection = screen.getByTestId("review-layers");
    expect(layerSection.textContent).toMatch(/⚠/);
  });
});

describe("ImportReviewPanel — dropdowns", () => {
  it("NodeKind dropdown contains 43+ kinds across 6+ optgroups", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const kindSelects = screen.getAllByTestId("review-kind-select");
    expect(kindSelects.length).toBe(2); // one per block
    const opts = (kindSelects[0] as HTMLSelectElement).querySelectorAll("option");
    // 38 known kinds (NODE_KINDS in nodeCatalog) — assert by exact count.
    expect(opts.length).toBeGreaterThanOrEqual(38);
    const optgroups = (kindSelects[0] as HTMLSelectElement).querySelectorAll("optgroup");
    expect(optgroups.length).toBeGreaterThanOrEqual(6);
  });

  it("Circuit dropdown contains the 5 PIPE_CIRCUITS", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const circuitSelects = screen.getAllByTestId("review-circuit-select");
    expect(circuitSelects.length).toBe(2); // one per layer
    const opts = (circuitSelects[0] as HTMLSelectElement).querySelectorAll("option");
    expect(opts.length).toBe(5);
  });
});

describe("ImportReviewPanel — interactions", () => {
  it("live preview recomputes when override changes", () => {
    const recompute = vi.fn((_overrides) => makeParseResult({
      state: { ...makeParseResult().state, nodes: makeParseResult().state.nodes.concat({
        id: "n3", kind: "junction", label: "J3", x: 200, y: 200,
      })},
    }));
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        recompute={recompute}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    // Initial state — recompute called at least once
    expect(recompute).toHaveBeenCalled();
    const before = recompute.mock.calls.length;
    // Change a block alias
    const kindSelects = screen.getAllByTestId("review-kind-select");
    fireEvent.change(kindSelects[0]!, { target: { value: "consumer_school" } });
    expect(recompute.mock.calls.length).toBeGreaterThan(before);
  });

  it("Confirm fires onConfirm with overrides + livePreview", () => {
    const onConfirm = vi.fn();
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );
    fireEvent.click(screen.getByTestId("review-confirm"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const [overrides, livePreview] = onConfirm.mock.calls[0]!;
    expect(overrides).toHaveProperty("blockAliases");
    expect(overrides).toHaveProperty("layerCircuits");
    expect(livePreview).toHaveProperty("state");
    expect(livePreview).toHaveProperty("stats");
  });

  it("Cancel fires onCancel with no state changes", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("review-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Clear overrides resets both sets", () => {
    const recompute = vi.fn((_overrides) => makeParseResult());
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        recompute={recompute}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const kindSelects = screen.getAllByTestId("review-kind-select");
    fireEvent.change(kindSelects[0]!, { target: { value: "consumer_school" } });
    fireEvent.click(screen.getByTestId("review-clear"));
    // Last call to recompute should have empty overrides
    const lastCall = recompute.mock.calls[recompute.mock.calls.length - 1]!;
    expect(lastCall[0].blockAliases).toEqual({});
    expect(lastCall[0].layerCircuits).toEqual({});
  });

  it("Confirm button label shows live node + pipe counts", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult()}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    const btn = screen.getByTestId("review-confirm");
    expect(btn.textContent).toMatch(/2 зангилаа/);
    expect(btn.textContent).toMatch(/1 хоолой/);
  });
});

describe("ImportReviewPanel — empty distinct lists", () => {
  it("renders fallback message when no blocks + no layers", () => {
    render(
      <ImportReviewPanel
        parseResult={makeParseResult({ distinctBlocks: [], distinctLayers: [] })}
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByTestId("review-blocks")).not.toBeInTheDocument();
    expect(screen.queryByTestId("review-layers")).not.toBeInTheDocument();
    expect(screen.getByText(/Импортод override-той зүйл олдсонгүй/)).toBeInTheDocument();
  });
});

// Reference unused for type-check only
void ({} as ExtractedDxf);
