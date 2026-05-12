/**
 * Vitest global setup — runs once before the test suite.
 *
 * Extends `expect` with @testing-library/jest-dom matchers (`toBeInTheDocument`,
 * `toHaveTextContent`, etc) and polyfills DOM APIs that jsdom lacks but the
 * SchemeEditor relies on (ResizeObserver, SVG getBBox).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver; the editor uses it for canvas sizing.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe(): void { /* noop */ }
    unobserve(): void { /* noop */ }
    disconnect(): void { /* noop */ }
  };
}

// SVGGraphicsElement.getBBox isn't implemented in jsdom — stub for the hydraulic canvas.
if (typeof SVGGraphicsElement !== "undefined" && !SVGGraphicsElement.prototype.getBBox) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (SVGGraphicsElement.prototype as any).getBBox = function () {
    return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
  };
}
