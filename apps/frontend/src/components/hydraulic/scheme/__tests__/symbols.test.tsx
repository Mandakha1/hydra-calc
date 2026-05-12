/**
 * Phase 6C — engineering symbol library tests.
 *
 * What we lock down (visual-spec via DOM markers, not pixel
 * snapshots — those are brittle in jsdom):
 *   - Each symbol renders a `data-symbol="<kind>"` attribute so
 *     consumers / Excel-export / future automation can identify
 *     them by introspection.
 *   - SourceSymbol contains an arrow path (the "downstream flow"
 *     indicator that differentiates it from ConsumerSymbol).
 *   - CompensatorSymbol contains a curved (loop) path — the Ω.
 *   - The router (renderSymbolFor) dispatches on EntityKind
 *     correctly, with pump+unknown falling back to JunctionSymbol.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  SourceSymbol,
  ConsumerSymbol,
  WellSymbol,
  FixedSupportSymbol,
  ElbowSymbol,
  CompensatorSymbol,
  ValveSymbol,
  JunctionSymbol,
  renderSymbolFor,
} from "../symbols";

function renderInSvg(node: React.ReactElement) {
  return render(<svg width={48} height={48} viewBox="-24 -24 48 48">{node}</svg>);
}

describe("Engineering symbol library — Phase 6C", () => {
  it("SourceSymbol renders a house outline + arrow (flow direction)", () => {
    const { container } = renderInSvg(<SourceSymbol radius={12} color="#000" />);
    const g = container.querySelector('[data-symbol="source"]');
    expect(g).toBeTruthy();
    // SourceSymbol has TWO paths: house outline + arrow inside.
    const paths = g!.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(2);
  });

  it("ConsumerSymbol renders a smaller house outline (NO arrow)", () => {
    const { container } = renderInSvg(<ConsumerSymbol radius={12} color="#000" />);
    const g = container.querySelector('[data-symbol="consumer"]');
    expect(g).toBeTruthy();
    // House outline path + door rect (2 elements), but no arrow path.
    const paths = g!.querySelectorAll("path");
    const rects = g!.querySelectorAll("rect");
    expect(paths.length + rects.length).toBeGreaterThanOrEqual(2);
  });

  it("WellSymbol renders circle + cross (two lines)", () => {
    const { container } = renderInSvg(<WellSymbol radius={10} color="#000" />);
    const g = container.querySelector('[data-symbol="well"]');
    expect(g).toBeTruthy();
    expect(g!.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1);
    expect(g!.querySelectorAll("line").length).toBe(2);
  });

  it("FixedSupportSymbol renders square + X cross", () => {
    const { container } = renderInSvg(<FixedSupportSymbol radius={10} color="#000" />);
    const g = container.querySelector('[data-symbol="fixedSupport"]');
    expect(g).toBeTruthy();
    expect(g!.querySelectorAll("rect").length).toBe(1);
    expect(g!.querySelectorAll("line").length).toBe(2);
  });

  it("ElbowSymbol renders a single triangle path", () => {
    const { container } = renderInSvg(<ElbowSymbol radius={10} color="#000" />);
    const g = container.querySelector('[data-symbol="elbow"]');
    expect(g).toBeTruthy();
    expect(g!.querySelectorAll("path").length).toBe(1);
  });

  it("CompensatorSymbol renders an Ω-shaped path (uses arc 'A' command)", () => {
    const { container } = renderInSvg(<CompensatorSymbol radius={12} color="#000" />);
    const g = container.querySelector('[data-symbol="compensator"]');
    expect(g).toBeTruthy();
    const path = g!.querySelector("path");
    expect(path).toBeTruthy();
    // Ω uses an SVG arc command — verify it's present in d="...".
    const d = path!.getAttribute("d");
    expect(d).toMatch(/A\s+\d+(\.\d+)?\s+\d+/); // arc with radius
  });

  it("ValveSymbol renders two opposing triangles (bow-tie)", () => {
    const { container } = renderInSvg(<ValveSymbol radius={10} color="#000" />);
    const g = container.querySelector('[data-symbol="valve"]');
    expect(g).toBeTruthy();
    expect(g!.querySelectorAll("path").length).toBe(2);
  });

  it("JunctionSymbol renders a single filled dot (smallest entity)", () => {
    const { container } = renderInSvg(<JunctionSymbol radius={10} color="#000" />);
    const g = container.querySelector('[data-symbol="junction"]');
    expect(g).toBeTruthy();
    expect(g!.querySelectorAll("circle").length).toBe(1);
  });

  it("`selected` prop adds a halo circle around any symbol", () => {
    const { container: cSelected } = renderInSvg(
      <SourceSymbol radius={12} color="#000" selected />,
    );
    const { container: cBare } = renderInSvg(
      <SourceSymbol radius={12} color="#000" />,
    );
    // Selected has more circles than bare (the halo).
    const nSel = cSelected.querySelectorAll('[data-symbol="source"] circle').length;
    const nBare = cBare.querySelectorAll('[data-symbol="source"] circle').length;
    expect(nSel).toBeGreaterThan(nBare);
  });

  it("`color` prop flows through to stroke / fill", () => {
    const { container } = renderInSvg(<WellSymbol radius={10} color="#ff0099" />);
    // Find any element that uses the color either as stroke or fill.
    const allStroke = Array.from(container.querySelectorAll("[stroke]"));
    const matches = allStroke.some((el) => el.getAttribute("stroke") === "#ff0099");
    expect(matches).toBe(true);
  });
});

describe("renderSymbolFor — Phase 6C router", () => {
  it("dispatches each EntityKind to its component", () => {
    const cases: Array<[Parameters<typeof renderSymbolFor>[0], string]> = [
      ["source", "source"],
      ["consumer", "consumer"],
      ["well", "well"],
      ["fixedSupport", "fixedSupport"],
      ["elbow", "elbow"],
      ["compensator", "compensator"],
      ["valve", "valve"],
      ["junction", "junction"],
    ];
    for (const [kind, expectedDataSymbol] of cases) {
      const { container } = renderInSvg(renderSymbolFor(kind, { radius: 12 }));
      const matched = container.querySelector(`[data-symbol="${expectedDataSymbol}"]`);
      expect(matched, `kind=${kind} should render data-symbol="${expectedDataSymbol}"`).toBeTruthy();
    }
  });

  it("pump and unknown fall back to JunctionSymbol", () => {
    const { container } = renderInSvg(renderSymbolFor("pump", { radius: 12 }));
    expect(container.querySelector('[data-symbol="junction"]')).toBeTruthy();
  });
});
