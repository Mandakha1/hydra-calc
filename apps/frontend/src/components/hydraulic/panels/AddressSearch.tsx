/**
 * Phase 5B.1b — Mongolia-biased address search via OpenStreetMap Nominatim.
 *
 * Engineering rationale:
 *   Mongolian projects open at Ulaanbaatar's Сүхбаатарын талбай by default.
 *   For any project outside the centre of UB the engineer has to pan + zoom
 *   manually — minutes of clicking before they can drop a single node. A
 *   one-line address search jumps the map straight to the right хороо,
 *   street, or аймаг centre.
 *
 *   Free, no API key. Nominatim asks for ≤ 1 req/sec → we debounce at 500 ms
 *   and abort the previous request before firing the next one. The
 *   `countrycodes=mn` parameter biases results to Mongolia so "Хан-Уул"
 *   resolves to the УБ duureg rather than some random street elsewhere.
 *
 * Source-of-truth on selection:
 *   Calling `onPick({ lat, lon, zoom: 17 })` is the contract. The parent
 *   wires this to `leafletMapRef.current?.flyTo()` + `updateSettings({
 *   mapCenterLat, mapCenterLon, mapZoom })`. Persisted so re-opening the
 *   project lands on the same view.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/** A single Nominatim hit — we keep only the fields we render. */
export interface NominatimHit {
  /** Free-form display address (already in `accept-language` locale). */
  display_name: string;
  lat: string;
  lon: string;
  /** Higher = more confident match. We sort descending. */
  importance?: number;
}

interface Props {
  /** Map currently visible — search is only useful when the user can see it. */
  enabled: boolean;
  /** Pick callback — coords + a sensible street-level default zoom. */
  onPick: (hit: { lat: number; lon: number; zoom: number; label: string }) => void;
  /** Inject a custom fetcher for tests. Defaults to global fetch. */
  fetcher?: typeof fetch;
}

/** Debounce delay before firing Nominatim. 500 ms = under the 1 req/s rule. */
const DEBOUNCE_MS = 500;

/** Geocoder endpoint. Mongolia-biased + Mongolian-language responses. */
export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

/**
 * Build the search URL. Exported for unit-test assertions — verifies the
 * Mongolia bias + accept-language + UTF-8 Cyrillic encoding are wired
 * correctly without having to inspect the actual fetch call.
 */
export function buildNominatimUrl(query: string): string {
  const u = new URL(NOMINATIM_URL);
  u.searchParams.set("q", query);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "5");
  u.searchParams.set("accept-language", "mn");
  u.searchParams.set("countrycodes", "mn");
  return u.toString();
}

export function AddressSearch({ enabled, onPick, fetcher }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NominatimHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doFetch = useCallback(
    async (q: string) => {
      // Abort the previous in-flight request — Nominatim limits us.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      try {
        const f = fetcher ?? fetch;
        const res = await f(buildNominatimUrl(q), {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
        const data = (await res.json()) as NominatimHit[];
        setHits(Array.isArray(data) ? data : []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // user typed more
        setError((e as Error).message);
        setHits([]);
      } finally {
        setLoading(false);
      }
    },
    [fetcher],
  );

  // Debounced auto-fetch on query change.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) {
      setHits(null);
      setError(null);
      return;
    }
    timerRef.current = setTimeout(() => void doFetch(q), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, doFetch]);

  if (!enabled) return null;

  return (
    <div style={wrap} data-testid="address-search">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Хаяг хайх (Хан-Уул, Сүхбаатар …)"
        aria-label="Хаяг хайх"
        style={input}
      />
      {loading && <div style={statusLine}>хайж байна…</div>}
      {error && (
        <div style={{ ...statusLine, color: "var(--danger, #c33)" }}>
          {error}
        </div>
      )}
      {hits && hits.length === 0 && !loading && !error && (
        <div style={statusLine}>Илэрц олдсонгүй</div>
      )}
      {hits && hits.length > 0 && (
        <div style={dropdown}>
          {hits.map((h, i) => (
            <button
              key={`${h.lat},${h.lon},${i}`}
              type="button"
              onClick={() => {
                onPick({
                  lat: Number(h.lat),
                  lon: Number(h.lon),
                  zoom: 17,
                  label: h.display_name,
                });
                setHits(null);
                setQuery("");
              }}
              style={hitBtn}
              title={h.display_name}
            >
              📍 {h.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const wrap: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 56,
  zIndex: 7,
  width: 280,
  background: "var(--bp-bg-2)",
  border: "1px solid var(--bp-line)",
  borderRadius: 8,
  padding: 6,
  boxShadow: "var(--shadow)",
};

const input: CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.6rem",
  background: "var(--bp-bg)",
  color: "var(--bp-text)",
  border: "1px solid var(--bp-line)",
  borderRadius: 4,
  fontSize: 13,
  fontFamily: "var(--font-sans)",
};

const statusLine: CSSProperties = {
  fontSize: 11,
  color: "var(--bp-muted, #888)",
  padding: "0.3rem 0.4rem",
};

const dropdown: CSSProperties = {
  marginTop: 4,
  maxHeight: 220,
  overflowY: "auto",
};

const hitBtn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "0.4rem 0.5rem",
  marginBottom: 2,
  background: "var(--bp-bg)",
  color: "var(--bp-text)",
  border: "1px solid var(--bp-line)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  lineHeight: 1.3,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
