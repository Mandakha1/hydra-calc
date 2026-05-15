/**
 * Phase 11.1 — useViewport hook tests.
 *
 * Asserts the breakpoint detection logic + resize subscription.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewport, VIEWPORT_BREAKPOINTS } from "../useViewport";

function setInnerWidth(w: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
  window.dispatchEvent(new Event("resize"));
}

beforeEach(() => {
  setInnerWidth(1280);
});

describe("useViewport — breakpoint detection", () => {
  it("desktop width → viewport='desktop'", () => {
    setInnerWidth(1280);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("desktop");
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isMobile).toBe(false);
  });

  it("tablet width → viewport='tablet'", () => {
    setInnerWidth(900);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("tablet");
    expect(result.current.isTablet).toBe(true);
  });

  it("mobile width → viewport='mobile'", () => {
    setInnerWidth(400);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("mobile");
    expect(result.current.isMobile).toBe(true);
  });

  it("exact 768 → tablet (boundary)", () => {
    setInnerWidth(VIEWPORT_BREAKPOINTS.tabletMin);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("tablet");
  });

  it("exact 767 → mobile (boundary)", () => {
    setInnerWidth(VIEWPORT_BREAKPOINTS.mobileMax);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("mobile");
  });

  it("exact 1024 → tablet (upper boundary)", () => {
    setInnerWidth(VIEWPORT_BREAKPOINTS.tabletMax);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("tablet");
  });

  it("exact 1025 → desktop (upper boundary)", () => {
    setInnerWidth(VIEWPORT_BREAKPOINTS.desktopMin);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("desktop");
  });
});

describe("useViewport — resize subscription", () => {
  it("updates viewport when window resizes", () => {
    setInnerWidth(1280);
    const { result } = renderHook(() => useViewport());
    expect(result.current.viewport).toBe("desktop");
    act(() => setInnerWidth(400));
    expect(result.current.viewport).toBe("mobile");
    act(() => setInnerWidth(900));
    expect(result.current.viewport).toBe("tablet");
  });

  it("returns numeric width along with viewport label", () => {
    setInnerWidth(900);
    const { result } = renderHook(() => useViewport());
    expect(result.current.width).toBe(900);
  });
});
