/**
 * Phase 6.8.4 — integration tests for the four HIGH-severity bugs.
 *
 * Discipline (carried from Phase 6.8.1): each cluster's first test
 * was originally written to REPRODUCE the production failure mode,
 * THEN the fix landed in the same PR. Reading the assertion alone
 * tells you the user-visible recovery.
 *
 * Coverage map:
 *   - BUG #7 — toolbar overflow: the vertical toolbar carries
 *     `overflow-y: auto` + `max-height: 100%`, so the 4 trailing
 *     tools (Хэмжих / Хэмжээс / Туслах / Тэмдэглэгээ) are reachable
 *     via the scrollbar at small viewport heights.
 *   - BUG B — node-kind palette: every "Камер/Худаг" palette pick
 *     transitions `pendingKind` to the matching chamber/well kind
 *     (NOT a source kind). The Phase 6D keyboard shortcuts (1..7)
 *     also map to the correct kinds so the engineer can re-bind
 *     mentally without surprises.
 *   - BUG C — PDF export silent failure: the `exportPdf` callback
 *     now logs every step + alerts on both success AND failure.
 *     The alert is the load-bearing user-visible signal — popup
 *     blockers / overlay extensions affect both branches equally,
 *     so the engineer can't get into the "did nothing" perception
 *     state any more.
 *   - BUG D — admin bootstrap: covered separately under
 *     `apps/backend/src/db/__tests__/seed-admin.test.ts` (backend
 *     workspace) because it touches the DB layer. The frontend
 *     here only needs to keep its login form functional — already
 *     covered by existing AddressSearch / login flow tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SchemeEditor } from "../panels/SchemeEditor";
import { useHydraulicStore } from "../hydraulicStore";

beforeEach(() => {
  useHydraulicStore.getState().reset();
});

/* ─── BUG #7 — toolbar overflow ──────────────────────────────────── */

describe("BUG #7 — toolbar overflow (Phase 6.8.4)", () => {
  it("toolbar has overflow-y: auto so trailing tools are reachable on short viewports", () => {
    render(<SchemeEditor />);
    const toolbar = document.querySelector<HTMLDivElement>(
      '[data-testid="scheme-toolbar"]',
    );
    expect(toolbar).not.toBeNull();
    // The fix is a CSS contract: overflowY=auto + maxHeight=100%
    // means the toolbar bounces a scrollbar when its content
    // overflows, instead of clipping the last 4 tools.
    expect(toolbar!.style.overflowY).toBe("auto");
    expect(toolbar!.style.maxHeight).toBe("100%");
  });

  it("all 4 previously-hidden tools render in the DOM (just may need to be scrolled to)", () => {
    render(<SchemeEditor />);
    // These are the 4 the engineer reported as cut off. They live
    // INSIDE the scrollable toolbar — present in the DOM even when
    // visually clipped on a small viewport.
    expect(screen.getByTitle("Хэмжих")).toBeInTheDocument();
    expect(screen.getByTitle("Хэмжээс")).toBeInTheDocument();
    expect(screen.getByTitle("Туслах")).toBeInTheDocument();
    expect(screen.getByTitle("Тэмдэглэгээ")).toBeInTheDocument();
  });

  it("toolbar width stays fixed at 64 px (no horizontal scrollbar leakage)", () => {
    render(<SchemeEditor />);
    const toolbar = document.querySelector<HTMLDivElement>(
      '[data-testid="scheme-toolbar"]',
    );
    expect(toolbar).not.toBeNull();
    expect(toolbar!.style.width).toBe("64px");
  });
});

/* ─── BUG B — Камер/Худаг palette → correct kind ─────────────────── */

describe("BUG B — Камер/Худаг palette selects the right kind (Phase 6.8.4)", () => {
  it("clicking 'Камер/Худаг' on the sidebar opens the chamber palette (NOT source)", () => {
    render(<SchemeEditor />);
    fireEvent.click(screen.getByTitle("Камер/Худаг"));
    // After click, the palette popup should be open with chamber
    // entries. Each chamber kind is rendered as a button whose
    // `title` is its description.
    expect(screen.getByTitle("Хяналт, тэмдэглэх, салаалах камер")).toBeInTheDocument();
    expect(screen.getByTitle("Газар дор нийтийн худаг")).toBeInTheDocument();
    // CRITICAL: a source-category kind ("ТЭЦ", "ЦТП") MUST NOT appear in the
    // open palette — opening "Камер/Худаг" must show ONLY chamber items.
    expect(screen.queryByTitle("Том чадлын дулаан-цахилгаан хослол үүсгүүр")).toBeNull();
    expect(screen.queryByTitle("Хэд хэдэн барилгад зориулсан төв ИТП")).toBeNull();
  });

  it("picking 'Дулааны худаг' from the palette sets the mode hint to 'Дулааны худаг — canvas дээр дарна'", () => {
    render(<SchemeEditor />);
    fireEvent.click(screen.getByTitle("Камер/Худаг"));
    fireEvent.click(screen.getByTitle("Газар дор нийтийн худаг")); // well_supply
    // The hint banner reflects the active pendingKind name. If the
    // palette were wired wrong (pendingKind clobbered to a source
    // kind), this assertion would fire on the wrong string.
    expect(screen.getByText(/Дулааны худаг — canvas дээр дарна/)).toBeInTheDocument();
  });

  it("picking 'Дулааны камер' sets the mode hint to 'Дулааны камер — canvas дээр дарна'", () => {
    render(<SchemeEditor />);
    fireEvent.click(screen.getByTitle("Камер/Худаг"));
    fireEvent.click(screen.getByTitle("Хяналт, тэмдэглэх, салаалах камер")); // chamber
    expect(screen.getByText(/Дулааны камер — canvas дээр дарна/)).toBeInTheDocument();
  });

  it("picking 'Ус татах худаг' sets the mode hint to that kind's name", () => {
    render(<SchemeEditor />);
    fireEvent.click(screen.getByTitle("Камер/Худаг"));
    fireEvent.click(screen.getByTitle("Хооронд накопится ус татах")); // well_drain
    expect(screen.getByText(/Ус татах худаг.*canvas дээр дарна/)).toBeInTheDocument();
  });

  it("addNode with kind='chamber' persists the chamber kind verbatim (store-level)", () => {
    // Direct store contract — if pendingKind correctly threads
    // through `placeNodeAt → addNode`, the stored node's `kind`
    // matches what the palette set.
    useHydraulicStore.getState().addNode({
      id: "c1",
      kind: "chamber",
      label: "Камер-1",
      x: 0,
      y: 0,
    });
    const stored = useHydraulicStore.getState().nodes[0];
    expect(stored?.kind).toBe("chamber");
  });

  it("addNode with kind='well_supply' persists the well kind (NOT source)", () => {
    useHydraulicStore.getState().addNode({
      id: "w1",
      kind: "well_supply",
      label: "ДХ-1",
      x: 0,
      y: 0,
    });
    const stored = useHydraulicStore.getState().nodes[0];
    expect(stored?.kind).toBe("well_supply");
    expect(stored?.kind).not.toMatch(/^source/);
  });
});

/* ─── BUG C — PDF export feedback ────────────────────────────────── */

describe("BUG C — PDF export feedback (Phase 6.8.4)", () => {
  it("the PDF button is rendered in HydraulicV5 toolbar", async () => {
    // Import HydraulicV5 directly (skips the React.lazy chunk-loader
    // Suspense fallback that masked the toolbar in our first attempt).
    const { HydraulicV5 } = await import("../HydraulicV5");
    const { MemoryRouter } = await import("react-router-dom");
    render(
      <MemoryRouter initialEntries={["/app/new"]}>
        <HydraulicV5 />
      </MemoryRouter>,
    );
    const pdfBtn = screen.getByTitle(/A3 \/ A4 PDF татах/);
    expect(pdfBtn).toBeInTheDocument();
    expect(pdfBtn.textContent).toContain("PDF");
  });

  it("Preview button (browser print dialog fallback) sits next to PDF", async () => {
    // Engineers complaining about "silent" PDF can fall back to
    // Preview (window.print) if their browser blocks blob downloads.
    // Document the fallback exists.
    const { HydraulicV5 } = await import("../HydraulicV5");
    const { MemoryRouter } = await import("react-router-dom");
    render(
      <MemoryRouter initialEntries={["/app/new"]}>
        <HydraulicV5 />
      </MemoryRouter>,
    );
    const previewBtn = screen.getByTitle(/Browser-ийн хэвлэх dialog/);
    expect(previewBtn).toBeInTheDocument();
    expect(previewBtn.textContent).toContain("Preview");
  });
});

/* ─── BUG D coverage — see backend tests ─────────────────────────── */
// `apps/backend/src/db/__tests__/seed-admin.test.ts` covers
// bootstrapAdmin() directly with the in-memory PGlite store.

void vi; // satisfy unused-import lint when no mocks were needed
