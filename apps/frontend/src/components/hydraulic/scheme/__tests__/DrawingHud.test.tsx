/**
 * Phase 12.2 — DrawingHud component tests.
 *
 * Asserts HUD renders correctly + edge-aware placement applies via
 * the dimensionFormat helpers. Cursor / viewport / data are passed
 * in as props — pure presentational component.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DrawingHud } from "../DrawingHud";

const VIEWPORT = { width: 1280, height: 800 };

describe("DrawingHud — render", () => {
  it("renders the floating HUD container with testid", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
      />,
    );
    expect(screen.getByTestId("drawing-hud")).toBeInTheDocument();
  });

  it("shows the length row with formatted distance", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
      />,
    );
    expect(screen.getByTestId("drawing-hud-length").textContent).toMatch(/12\.34 м/);
  });

  it("shows the angle row when angleRad provided", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={(45 * Math.PI) / 180}
      />,
    );
    expect(screen.getByTestId("drawing-hud-angle")).toBeInTheDocument();
    expect(screen.getByTestId("drawing-hud-angle").textContent).toMatch(/45\.0°/);
  });

  it("hides angle row when angleRad omitted (first polygon vertex case)", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={0}
      />,
    );
    expect(screen.queryByTestId("drawing-hud-angle")).not.toBeInTheDocument();
  });

  it("shows the cardinal direction badge", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={50}
        angleRad={(-90 * Math.PI) / 180}
      />,
    );
    expect(screen.getByTestId("drawing-hud-cardinal").textContent).toBe("Х");
  });

  it("shows the mode label when provided", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
        modeLabel="Хоолой зурж байна"
      />,
    );
    expect(screen.getByTestId("drawing-hud-mode").textContent).toBe("Хоолой зурж байна");
  });

  it("hides mode label section when omitted", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
      />,
    );
    expect(screen.queryByTestId("drawing-hud-mode")).not.toBeInTheDocument();
  });

  it("integer-formats lengths above 100m", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={234.56}
        angleRad={0}
      />,
    );
    expect(screen.getByTestId("drawing-hud-length").textContent).toMatch(/235 м/);
  });

  it("2-decimal format below 1m", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={0.85}
        angleRad={0}
      />,
    );
    expect(screen.getByTestId("drawing-hud-length").textContent).toMatch(/0\.85 м/);
  });
});

describe("DrawingHud — edge-aware positioning", () => {
  it("defaults to down-right of cursor", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
      />,
    );
    const hud = screen.getByTestId("drawing-hud") as HTMLElement;
    // 600 + 12 = 612 default offset
    expect(hud.style.left).toBe("612px");
    expect(hud.style.top).toBe("412px");
  });

  it("flips to up-left when near right edge", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 1200, y: 400 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
      />,
    );
    const hud = screen.getByTestId("drawing-hud") as HTMLElement;
    const leftPx = parseInt(hud.style.left, 10);
    expect(leftPx).toBeLessThan(1200);
  });

  it("flips to up-left when near bottom edge", () => {
    render(
      <DrawingHud
        cursorViewport={{ x: 600, y: 750 }}
        viewport={VIEWPORT}
        distance_m={12.34}
        angleRad={0}
      />,
    );
    const hud = screen.getByTestId("drawing-hud") as HTMLElement;
    const topPx = parseInt(hud.style.top, 10);
    expect(topPx).toBeLessThan(750);
  });
});

describe("DrawingHud — cardinal direction across 8 wedges", () => {
  const CARDINAL_CASES: Array<{ angleDeg: number; expected: string; label: string }> = [
    { angleDeg: 0,    expected: "З",  label: "East" },
    { angleDeg: 45,   expected: "УЗ", label: "SE" },
    { angleDeg: 90,   expected: "У",  label: "South" },
    { angleDeg: 135,  expected: "УБ", label: "SW" },
    { angleDeg: 180,  expected: "Б",  label: "West" },
    { angleDeg: -135, expected: "ХБ", label: "NW" },
    { angleDeg: -90,  expected: "Х",  label: "North" },
    { angleDeg: -45,  expected: "ХЗ", label: "NE" },
  ];

  CARDINAL_CASES.forEach(({ angleDeg, expected, label }) => {
    it(`${label} (${angleDeg}°) → ${expected}`, () => {
      render(
        <DrawingHud
          cursorViewport={{ x: 600, y: 400 }}
          viewport={VIEWPORT}
          distance_m={50}
          angleRad={(angleDeg * Math.PI) / 180}
        />,
      );
      expect(screen.getByTestId("drawing-hud-cardinal").textContent).toBe(expected);
    });
  });
});
