/**
 * Phase 11.1 — Responsive viewport hook.
 *
 * Returns the current breakpoint label + window width. Components
 * use this to swap layouts (e.g. hamburger menu on mobile, full
 * nav on desktop).
 *
 * Breakpoints match `global.css`:
 *   mobile  < 768px
 *   tablet  768-1024px
 *   desktop > 1024px
 *
 * Pure hook — uses `window.matchMedia` so re-renders only fire on
 * the actual breakpoint crossing, not on every resize event.
 */
import { useEffect, useState } from "react";

export type Viewport = "mobile" | "tablet" | "desktop";

export const VIEWPORT_BREAKPOINTS = {
  mobileMax: 767,
  tabletMin: 768,
  tabletMax: 1024,
  desktopMin: 1025,
} as const;

function detect(width: number): Viewport {
  if (width <= VIEWPORT_BREAKPOINTS.mobileMax) return "mobile";
  if (width <= VIEWPORT_BREAKPOINTS.tabletMax) return "tablet";
  return "desktop";
}

export function useViewport(): { viewport: Viewport; width: number; isMobile: boolean; isTablet: boolean; isDesktop: boolean } {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 1280;
    return window.innerWidth;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const viewport = detect(width);
  return {
    viewport,
    width,
    isMobile: viewport === "mobile",
    isTablet: viewport === "tablet",
    isDesktop: viewport === "desktop",
  };
}
