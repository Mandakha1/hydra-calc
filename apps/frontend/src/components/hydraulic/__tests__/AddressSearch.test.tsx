/**
 * Phase 5B.1b — AddressSearch / Nominatim integration tests.
 *
 * What we lock down:
 *  1. URL builder bakes in the Mongolia bias + Mongolian language +
 *     UTF-8 Cyrillic encoding correctly (regression: a Latin-only
 *     `URLSearchParams` regression would silently re-encode Cyrillic
 *     to "?????" — the same class of bug from the Zernio honey-bot
 *     PowerShell migration).
 *  2. A Cyrillic query (Хан-Уул) resolves to the expected coordinates
 *     when fetch is mocked. Confirms the parse path → onPick contract.
 *  3. Empty / whitespace queries DO NOT hit the API — Nominatim's
 *     1 req/sec rate limit is real, and we don't want to spend any
 *     of that budget on no-op input.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AddressSearch, buildNominatimUrl, NOMINATIM_URL } from "../panels/AddressSearch";

describe("AddressSearch — Nominatim URL builder", () => {
  it("Mongolian-biased URL has the right parameters in the right order", () => {
    const u = new URL(buildNominatimUrl("Хан-Уул"));
    expect(u.origin + u.pathname).toBe(NOMINATIM_URL);
    expect(u.searchParams.get("format")).toBe("json");
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("accept-language")).toBe("mn");
    expect(u.searchParams.get("countrycodes")).toBe("mn");
    // The Cyrillic query must round-trip through URLSearchParams' UTF-8
    // encoder — Хан-Уул in the URL is %D0%A5%D0%B0%D0%BD-%D0%A3%D1%83%D0%BB.
    expect(u.searchParams.get("q")).toBe("Хан-Уул");
    expect(u.href).toContain("q=%D0%A5%D0%B0%D0%BD");
  });

  it("does not hit the API on empty / whitespace query", async () => {
    const fetcher = vi.fn();
    render(<AddressSearch enabled={true} onPick={() => {}} fetcher={fetcher as unknown as typeof fetch} />);

    // The component mounted with empty query — let any debounce timer pass.
    await new Promise((r) => setTimeout(r, 600));
    expect(fetcher).not.toHaveBeenCalled();

    // Typing only whitespace also must not fire.
    const input = screen.getByLabelText("Хаяг хайх") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "   " } });
    });
    await new Promise((r) => setTimeout(r, 600));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("Mongolian query resolves to expected lat/lon via onPick", async () => {
    // The fake Nominatim result for Хан-Уул дүүрэг — a representative
    // UB south-side coordinate. We don't care which exact street; only
    // that the parse path lands the same number it received.
    const fakeHit = {
      display_name: "Хан-Уул дүүрэг, Улаанбаатар, Монгол улс",
      lat: "47.8864",
      lon: "106.9057",
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([fakeHit]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onPick = vi.fn();

    render(<AddressSearch enabled={true} onPick={onPick} fetcher={fetcher as unknown as typeof fetch} />);

    const input = screen.getByLabelText("Хаяг хайх") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "Хан-Уул" } });
    });

    // Wait past the debounce + the resolved promise.
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1), { timeout: 1500 });

    const calledUrl = (fetcher.mock.calls[0]?.[0] as string) ?? "";
    expect(calledUrl).toContain("countrycodes=mn");
    expect(calledUrl).toContain("accept-language=mn");

    // The hit button should appear and clicking it fires onPick with
    // numeric coords + zoom=17.
    const hitBtn = await screen.findByText(/Хан-Уул дүүрэг/);
    await act(async () => {
      fireEvent.click(hitBtn);
    });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]).toMatchObject({
      lat: 47.8864,
      lon: 106.9057,
      zoom: 17,
      label: fakeHit.display_name,
    });
  });

  it("hides when enabled=false (search bar not useful with map off)", () => {
    render(<AddressSearch enabled={false} onPick={() => {}} />);
    expect(screen.queryByLabelText("Хаяг хайх")).toBeNull();
  });
});
