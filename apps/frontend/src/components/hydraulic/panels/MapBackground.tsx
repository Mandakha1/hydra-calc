/**
 * High-precision geographic map background — vanilla Leaflet, no react-leaflet.
 *
 * Provides 5 tile providers (OSM, Satellite, Topo, Carto Light, Stamen Terrain).
 * Map is fully interactive (pan/zoom independent of canvas) — engineers align it
 * to their схем by dragging.
 *
 * Click "📍 Snap to map" while a node is selected to bind that node's pixel coords
 * to a real-world lat/lon (saved to node.geo).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface MapProvider {
  key: string;
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
  isSatellite?: boolean;
}

export const MAP_PROVIDERS: MapProvider[] = [
  {
    key: "osm",
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxZoom: 19,
  },
  {
    key: "satellite",
    name: "Satellite (Esri)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
    maxZoom: 22,
    isSatellite: true,
  },
  {
    key: "topo",
    name: "Topo (OpenTopoMap)",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "© OpenTopoMap, © OpenStreetMap",
    maxZoom: 17,
  },
  {
    key: "carto_light",
    name: "Carto Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "© CARTO, © OpenStreetMap",
    maxZoom: 20,
  },
  {
    key: "esri_topo",
    name: "Esri Topo",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri",
    maxZoom: 19,
  },
];

interface Props {
  /** Initial center [lat, lon]. Defaults to Ulaanbaatar Sukhbaatar Square. */
  center?: [number, number];
  /** Initial zoom. Default 13. */
  zoom?: number;
  /** Provider key. */
  providerKey?: string;
  /** Opacity 0-1 (so the schema canvas is still visible above). */
  opacity?: number;
  /** Pass click coords back to caller (for "snap node to here"). */
  onMapClick?: (lat: number, lon: number) => void;
  /** Map move/zoom event — fires when pan or zoom changes. */
  onMapView?: (info: { bounds: L.LatLngBounds; zoom: number; center: L.LatLng }) => void;
  /** Receives the underlying Leaflet Map instance once initialized. */
  onMapReady?: (map: L.Map) => void;
}

/** Default center: Ulaanbaatar / Сүхбаатарын талбай. */
const DEFAULT_CENTER: [number, number] = [47.918873, 106.917015];

export function MapBackground({
  center = DEFAULT_CENTER,
  zoom = 13,
  providerKey = "osm",
  opacity = 0.85,
  onMapClick,
  onMapView,
  onMapReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true,
    });
    mapRef.current = map;
    if (onMapReady) onMapReady(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map move/zoom — push view changes upward so SVG node positions can re-anchor.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapView) return;
    const fire = () => onMapView({ bounds: map.getBounds(), zoom: map.getZoom(), center: map.getCenter() });
    map.on("move", fire);
    map.on("zoom", fire);
    fire();
    return () => {
      map.off("move", fire);
      map.off("zoom", fire);
    };
  }, [onMapView]);

  // Switch tile provider
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const provider = MAP_PROVIDERS.find((p) => p.key === providerKey) ?? MAP_PROVIDERS[0]!;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const layer = L.tileLayer(provider.url, {
      attribution: provider.attribution,
      maxZoom: provider.maxZoom,
      opacity,
    });
    layer.addTo(map);
    tileLayerRef.current = layer;
  }, [providerKey, opacity]);

  // Map click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;
    const handler = (e: L.LeafletMouseEvent) => onMapClick(e.latlng.lat, e.latlng.lng);
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [onMapClick]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
      }}
    />
  );
}

/** Map provider selector — small floating UI panel. */
export function MapControls({
  enabled,
  onToggle,
  providerKey,
  onProviderChange,
  opacity,
  onOpacityChange,
}: {
  enabled: boolean;
  onToggle: () => void;
  providerKey: string;
  onProviderChange: (k: string) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={mapControlsWrap}>
      <button
        onClick={onToggle}
        title="Газрын зураг (M)"
        style={{
          ...mapBtn,
          ...(enabled ? { color: "var(--bp-blue)", borderColor: "var(--bp-blue)", background: "var(--bp-blue-soft)" } : {}),
        }}
      >
        🗺
      </button>
      {enabled && (
        <button
          onClick={() => setOpen((o) => !o)}
          title="Газрын зургийн provider"
          style={mapBtn}
        >
          ⚙
        </button>
      )}
      {enabled && open && (
        <div style={dropdown}>
          <div className="hdr-mono" style={{ marginBottom: 8 }}>Provider</div>
          {MAP_PROVIDERS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                onProviderChange(p.key);
                setOpen(false);
              }}
              style={{
                ...providerBtn,
                ...(providerKey === p.key ? { background: "var(--bp-blue-soft)", color: "var(--bp-blue)", borderColor: "var(--bp-blue)" } : {}),
              }}
            >
              {p.isSatellite ? "🛰" : "🗺"} {p.name}
            </button>
          ))}
          <div className="hdr-mono" style={{ marginTop: 12, marginBottom: 4 }}>Тунгалаг {Math.round(opacity * 100)}%</div>
          <input
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            style={{ width: "100%" }}
          />
        </div>
      )}
    </div>
  );
}

const mapControlsWrap: CSSProperties = {
  position: "absolute",
  top: 60,
  right: 12,
  zIndex: 6,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  background: "var(--bp-bg-2)",
  border: "1px solid var(--bp-line)",
  padding: 4,
  borderRadius: 8,
  boxShadow: "var(--shadow)",
};

const mapBtn: CSSProperties = {
  width: 32,
  height: 32,
  background: "var(--bp-bg)",
  color: "var(--bp-text)",
  border: "1px solid var(--bp-line)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const dropdown: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 44,
  minWidth: 220,
  background: "var(--bp-bg-2)",
  border: "1px solid var(--bp-line)",
  borderRadius: 6,
  padding: 10,
  boxShadow: "var(--shadow-lg)",
};

const providerBtn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "0.4rem 0.6rem",
  marginBottom: 3,
  background: "var(--bp-bg)",
  color: "var(--bp-text)",
  border: "1px solid var(--bp-line)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
};
