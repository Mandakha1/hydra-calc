import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import type L from "leaflet";
import { useHydraulicStore, uid } from "../hydraulicStore";
import {
  NODE_KINDS,
  CATEGORIES,
  PIPE_CIRCUITS,
  PX_PER_METER,
  pxToM,
  getNodeKind,
  type NodeCategory,
  type PipeCircuit,
} from "../nodeCatalog";
import {
  polygonAreaM2,
  polygonCentroid,
  bbox,
  nearPoint,
  constrainToAngle,
  type Point,
} from "../geometry";
import { BuildingDialog } from "./BuildingDialog";
import { MapBackground, MapControls } from "./MapBackground";
import { AddressSearch } from "./AddressSearch";
import {
  computeSymbolRadiusPx,
  computePipeStrokeWidthPx,
  resolveEntityKind,
  MIN_SYMBOL_PX,
} from "../scheme/symbolSize";
import {
  findEndpointSnap,
  snapPointToGridM,
  DEFAULT_SNAP,
} from "../scheme/snap";
import { SPEED_BANDS, PRESSURE_BANDS, colorForValue } from "../colorBands";
import type { SchemeNode, SchemePipe } from "../hydraulicTypes";

type Mode = "select" | "addNode" | "addPipe" | "drawBuilding" | "measure" | "pickBuilding";
type AngleMode = "free" | "ortho90" | "ortho45";

interface Props {
  readOnly?: boolean;
}

const GRID_M = 1; // 1 meter grid
const MAJOR_GRID_M = 5; // major every 5m
const RULER_PX = 24; // ruler thickness

export function SchemeEditor({ readOnly }: Props) {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const selection = useHydraulicStore((s) => s.selection);
  const results = useHydraulicStore((s) => s.results);
  const violations = useHydraulicStore((s) => s.violations);
  const settings = useHydraulicStore((s) => s.settings);
  const addNode = useHydraulicStore((s) => s.addNode);
  const addPipe = useHydraulicStore((s) => s.addPipe);
  const updateNode = useHydraulicStore((s) => s.updateNode);
  const updatePipe = useHydraulicStore((s) => s.updatePipe);
  const removeNode = useHydraulicStore((s) => s.removeNode);
  const removePipe = useHydraulicStore((s) => s.removePipe);
  const updateSettings = useHydraulicStore((s) => s.updateSettings);
  const select = useHydraulicStore((s) => s.select);

  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [pendingKind, setPendingKind] = useState<string>("consumer_apartment");
  const [pendingCircuit, setPendingCircuit] = useState<PipeCircuit>("heating_supply");
  const [angleMode, setAngleMode] = useState<AngleMode>("ortho90");
  const [pipeFrom, setPipeFrom] = useState<string | null>(null);
  const [polygon, setPolygon] = useState<Point[]>([]); // polyline being drawn
  const [pendingFootprint, setPendingFootprint] = useState<Point[] | null>(null);
  const [showPalette, setShowPalette] = useState<NodeCategory | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ nodeId: string; offX: number; offY: number } | null>(null);
  const [mousePos, setMousePos] = useState<Point | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  const [showMap, setShowMap] = useState(false);
  // Map provider + opacity are persisted on ProjectSettings (Phase 5B.1a)
  // so each project remembers the engineer's preferred tile style across
  // page reloads. Default to OSM / 1.0 opacity if the project never had
  // them set.
  const mapProvider = settings.mapProviderKey ?? "osm";
  const mapOpacity = settings.mapOpacity ?? 1.0;
  const setMapProvider = useCallback(
    (k: string) => updateSettings({ mapProviderKey: k }),
    [updateSettings],
  );
  const setMapOpacity = useCallback(
    (v: number) => updateSettings({ mapOpacity: v }),
    [updateSettings],
  );
  const [colorOverlay, setColorOverlay] = useState<"off" | "speed" | "pressure">("off");
  /** Шугам хоолойн урсгалын анимаци — Zulu-стилийн. Тооцоо хийгдсэний дараа автомат идэвхждэг. */
  const [animateFlow, setAnimateFlow] = useState(true);
  /** Алдааны pulsation — violations байх үед автомат идэвхждэг. */
  const [animateErrors, setAnimateErrors] = useState(true);
  /** Газрын зураг дээр шууд зурах горим — click дарахад lat/lon-д хадгалагдана. */
  const [mapAnchored, setMapAnchored] = useState(false);
  /** Leaflet map ref — used to convert lat/lon ↔ container px. */
  const leafletMapRef = useRef<L.Map | null>(null);
  /** Bumped on map move/zoom to force a render so geo-anchored nodes reposition. */
  const [mapTick, setMapTick] = useState(0);
  /** Right-click context menu — shown next to a target element. */
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: { kind: "node" | "pipe"; id: string };
  } | null>(null);
  /** Pipe waypoint drag state — index identifies which middle point is being moved. */
  const [waypointDrag, setWaypointDrag] = useState<{ pipeId: string; index: number } | null>(null);
  /** Hide the side toolbar + top mini toolbar for distraction-free drawing. */
  const [hideUi, setHideUi] = useState(false);
  /** Measure tool: list of points clicked to form a polyline whose total length is shown live. */
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);
  /** Optional manual length override (m) for next pipe drawn. When set, the
   *  second click on canvas places the to-end exactly L meters from from-node
   *  in the current cursor direction (constrained by angleMode). */
  const [pipeLengthInput, setPipeLengthInput] = useState<string>("");
  /** Map-pan drag state: when in select mode + showMap=true, dragging an empty
   *  canvas area pans the underlying Leaflet map (so geo-anchored nodes track
   *  with it). We can't use Leaflet's built-in drag because the SVG sits on
   *  top — instead we capture the gesture here and call map.panBy(). */
  const [mapPanDrag, setMapPanDrag] = useState<{ startX: number; startY: number } | null>(null);
  /** OSM Overpass API loading flag — shows a spinner while fetching building. */
  const [osmLoading, setOsmLoading] = useState(false);
  /** Stable reference for the onMapView callback — passing an arrow function
   *  to MapBackground every render caused its useEffect to re-attach listeners
   *  on every render, which, combined with the immediate `fire()` inside the
   *  effect, produced an infinite re-render loop. */
  const onMapViewStable = useCallback(() => {
    setMapTick((t) => t + 1);
  }, []);
  /** Stable onMapReady — same reason. Captures the leaflet map on mount and
   *  triggers a single re-render so mapPxPerMeter useMemo runs again with the
   *  ref populated. Must NOT depend on any state, or React will loop. */
  const onMapReadyStable = useCallback((m: L.Map) => {
    leafletMapRef.current = m;
    if (import.meta.env.DEV) (window as unknown as { __leafletMap: L.Map }).__leafletMap = m;
    // mapTick gets bumped by the first move/zoom event Leaflet fires anyway,
    // so we don't need to setMapTick here (which would double-render).
  }, []);
  /** OSM-fetched building preset — passed to BuildingDialog for pre-filling. */
  const [osmPickPreset, setOsmPickPreset] = useState<Partial<SchemeNode> | null>(null);

  /** Pixels-per-meter at current map view. Used to size buildings to true
   *  scale when displayed on top of a Leaflet map (so width_m × height_m
   *  match the map zoom). Recomputed on every mapTick.
   *
   *  IMPLEMENTATION NOTE: leaflet's `latLngToContainerPoint` rounds container
   *  pixels to integers, so a 1-m delta (~0.05 px) collapses to zero. We use
   *  a 1-km delta (≈ 0.00898° lat) and divide by 1000 — this preserves
   *  precision across all zoom levels. */
  const mapPxPerMeter = useMemo(() => {
    const map = leafletMapRef.current;
    if (!map || !showMap) return null;
    try {
      const c = map.getCenter();
      const dLatDeg_1km = 0.00898;  // 1 km north in degrees latitude (any latitude)
      const p1 = map.latLngToContainerPoint(c);
      const p2 = map.latLngToContainerPoint([c.lat + dLatDeg_1km, c.lng]);
      return Math.abs(p2.y - p1.y) / 1000; // px per metre
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, mapTick]);

  /** Compute pan/zoom that fits all nodes within the viewport. */
  const fitToContent = useCallback(() => {
    const svg = svgRef.current;
    if (!svg || nodes.length === 0) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const n of nodes) {
      xs.push(n.x); ys.push(n.y);
      if (n.footprint) {
        for (const p of n.footprint) { xs.push(p.x); ys.push(p.y); }
      }
      const wm = n.width_m ?? 0;
      const hm = n.height_m ?? 0;
      if (wm > 0 && hm > 0) {
        const wpx = wm * PX_PER_METER, hpx = hm * PX_PER_METER;
        xs.push(n.x - wpx / 2, n.x + wpx / 2);
        ys.push(n.y - hpx / 2, n.y + hpx / 2);
      }
    }
    if (xs.length === 0) return;
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;
    if (w <= 0 || h <= 0) return;
    const rect = svg.getBoundingClientRect();
    const viewW = rect.width - RULER_PX * 2 - 80;   // padding
    const viewH = rect.height - RULER_PX * 2 - 80;
    const sx = viewW / w, sy = viewH / h;
    const newZoom = Math.max(0.05, Math.min(4, Math.min(sx, sy) * 0.92));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setZoom(newZoom);
    setPan({
      x: (rect.width / 2) / newZoom - cx - RULER_PX / newZoom,
      y: (rect.height / 2) / newZoom - cy - RULER_PX / newZoom,
    });
  }, [nodes]);

  /** Auto-fit when nodes first appear (≥8 = likely an imported project). */
  const didAutoFitRef = useRef(false);
  useEffect(() => {
    if (didAutoFitRef.current) return;
    if (nodes.length < 8) return;
    // Run after first paint so getBoundingClientRect returns real dimensions.
    const t = setTimeout(() => {
      fitToContent();
      didAutoFitRef.current = true;
    }, 120);
    return () => clearTimeout(t);
  }, [nodes.length, fitToContent]);
  const GRID_PX = GRID_M * PX_PER_METER;

  const toSvg = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left - RULER_PX) / zoom - pan.x,
        y: (e.clientY - rect.top - RULER_PX) / zoom - pan.y,
      };
    },
    [pan, zoom],
  );

  /** Convert SVG canvas pixel coords → real-world lat/lon via Leaflet. */
  const svgToLatLon = useCallback((p: Point): { lat: number; lon: number } | null => {
    const map = leafletMapRef.current;
    const svg = svgRef.current;
    if (!map || !svg) return null;
    const rect = svg.getBoundingClientRect();
    // Convert svg-space → screen px → Leaflet container px → lat/lon
    const screenX = p.x * zoom + pan.x * zoom + RULER_PX + rect.left;
    const screenY = p.y * zoom + pan.y * zoom + RULER_PX + rect.top;
    const mapRect = map.getContainer().getBoundingClientRect();
    const containerX = screenX - mapRect.left;
    const containerY = screenY - mapRect.top;
    const ll = map.containerPointToLatLng([containerX, containerY]);
    return { lat: ll.lat, lon: ll.lng };
  }, [pan, zoom]);

  /** For a node with .geo, compute its current display SVG coords from leaflet map.
   *  IMPORTANT: as long as the map is visible AND the node has .geo, we follow
   *  the map — regardless of the mapAnchored toggle (which only controls
   *  whether NEW clicks save geo). This way a node that was created on the
   *  map keeps tracking when the user pans/zooms even after they toggle the
   *  pin off. */
  const displayPos = useCallback((n: SchemeNode): Point => {
    const map = leafletMapRef.current;
    const svg = svgRef.current;
    if (!showMap || !n.geo || !map || !svg) return { x: n.x, y: n.y };
    const containerPt = map.latLngToContainerPoint([n.geo.lat, n.geo.lon]);
    const mapRect = map.getContainer().getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const screenX = mapRect.left + containerPt.x;
    const screenY = mapRect.top + containerPt.y;
    return {
      x: (screenX - svgRect.left - RULER_PX) / zoom - pan.x,
      y: (screenY - svgRect.top - RULER_PX) / zoom - pan.y,
    };
    // mapTick is intentionally referenced via .current/closure; we depend on it
    // as a render trigger in the effect that calls setMapTick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, pan, zoom, mapTick]);

  const snap = useCallback(
    (p: Point): Point => {
      if (!snapGrid) return p;
      return { x: Math.round(p.x / GRID_PX) * GRID_PX, y: Math.round(p.y / GRID_PX) * GRID_PX };
    },
    [snapGrid, GRID_PX],
  );

  const constrain = useCallback(
    (from: Point, to: Point): Point => {
      if (angleMode === "free") return to;
      return constrainToAngle(from, to, angleMode === "ortho90" ? 90 : 45);
    },
    [angleMode],
  );

  /**
   * Place a new node at a canvas point (already snapped). Saves geo lat/lon
   * if mapAnchored is on, OR if explicit geo is passed (used by map-click path).
   */
  const placeNodeAt = useCallback((pt: Point, opts?: { geo?: { lat: number; lon: number } }) => {
    if (readOnly) return;
    // Phase 6B — endpoint snap: if the click is on top of an existing
    // node (within pixelThreshold), re-use that node ID rather than
    // creating a near-duplicate. The threshold comes from project
    // settings (default 12 px). When disabled, the check is skipped.
    const epSettings = settings.snapEndpoint ?? DEFAULT_SNAP.endpoint;
    if (epSettings.enabled) {
      // Compare in CANVAS coordinates (the same coord system pt is in).
      // displayPos handles the geo-anchored case where nodes track the
      // map view; for non-geo nodes it's just (n.x, n.y).
      const candidates = nodes.map((n) => {
        const dp = displayPos(n);
        return { id: n.id, x: dp.x, y: dp.y };
      });
      const ep = findEndpointSnap(pt, candidates, epSettings.pixelThreshold, true);
      if (ep.nodeId !== null) {
        // Reuse existing node — select it, no new node created.
        select({ kind: "node", id: ep.nodeId });
        setShowPalette(null);
        return;
      }
    }
    const kindDef = getNodeKind(pendingKind);
    const id = uid(pendingKind.split("_")[0] ?? "n");
    const geo = opts?.geo ?? (mapAnchored && showMap ? svgToLatLon(pt) : null);
    addNode({
      id,
      kind: pendingKind,
      label: prettyName(pendingKind, nodes.length + 1),
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      ...(geo ? { geo: { lat: geo.lat, lon: geo.lon } } : {}),
      ...(kindDef?.defaults ?? {}),
    });
    select({ kind: "node", id });
    setShowPalette(null);
    // Reference the new-module grid helper so dead-code elimination
    // keeps it tree-shaken in for downstream callers (6D will use it).
    void snapPointToGridM;
  }, [readOnly, pendingKind, mapAnchored, showMap, svgToLatLon, addNode, nodes, select, settings.snapEndpoint, displayPos]);

  /**
   * When the user clicks directly on the Leaflet map (not blocked by an SVG
   * node/pipe), place the currently-selected category at that lat/lon.
   * This is how map-overlay drawing works: map gets the click first, then
   * we convert lat/lon → canvas px via leaflet.latLngToContainerPoint.
   */
  const onMapNativeClick = useCallback((lat: number, lon: number) => {
    if (readOnly) return;
    const map = leafletMapRef.current;
    const svg = svgRef.current;
    if (!map || !svg) return;
    const containerPt = map.latLngToContainerPoint([lat, lon]);
    const mapRect = map.getContainer().getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const screenX = mapRect.left + containerPt.x;
    const screenY = mapRect.top + containerPt.y;
    const svgPt: Point = {
      x: (screenX - svgRect.left - RULER_PX) / zoom - pan.x,
      y: (screenY - svgRect.top - RULER_PX) / zoom - pan.y,
    };
    if (mode === "addNode") {
      placeNodeAt(snap(svgPt), { geo: { lat, lon } });
    } else if (mode === "pickBuilding") {
      void pickBuildingFromOsm(lat, lon);
    } else if (mode === "drawBuilding") {
      // Polygon vertex on map — store BOTH pixel and geo so the polygon
      // tracks the map when user pans/zooms.
      if (polygon.length >= 3 && nearPoint(svgPt, polygon[0]!, 12)) {
        setPendingFootprint([...polygon]);
        setPolygon([]);
        return;
      }
      const nextPoint: Point = polygon.length > 0
        ? snap(constrain(polygon[polygon.length - 1]!, svgPt))
        : svgPt;
      // Stamp geo onto the vertex (polygon state holds {x,y,lat?,lon?}).
      setPolygon([...polygon, { ...nextPoint, lat, lon } as Point & { lat?: number; lon?: number }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, mode, pan, zoom, placeNodeAt, snap, polygon, constrain]);

  /**
   * Fetch the closest OSM building polygon to the clicked lat/lon via
   * Overpass API (free, no key). Convert geometry to canvas pixels and open
   * the BuildingDialog pre-filled with footprint + tags.
   */
  const pickBuildingFromOsm = useCallback(async (lat: number, lon: number) => {
    const map = leafletMapRef.current;
    const svg = svgRef.current;
    if (!map || !svg) return;
    // 150m radius — wide enough to catch the building even if the click lands
    // a bit off (e.g. street/plaza). Closest match is picked from the result set.
    const overpassQuery = `[out:json][timeout:15];way["building"](around:150,${lat},${lon});out geom tags;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;
    setOsmLoading(true);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as {
        elements: Array<{
          id: number;
          tags?: Record<string, string>;
          geometry?: Array<{ lat: number; lon: number }>;
        }>;
      };
      if (!data.elements || data.elements.length === 0) {
        alert("Энэ цэгийн дэргэд OSM-д барилгын мэдээлэл олдсонгүй. Газрын зургийг томруулж зөв байшин дээр дарна уу.");
        return;
      }
      // Pick the closest building (centroid distance squared).
      let best: { el: typeof data.elements[number]; d2: number } | null = null;
      for (const el of data.elements) {
        if (!el.geometry || el.geometry.length < 3) continue;
        const cLat = el.geometry.reduce((s, p) => s + p.lat, 0) / el.geometry.length;
        const cLon = el.geometry.reduce((s, p) => s + p.lon, 0) / el.geometry.length;
        const dLat = (cLat - lat) * 111320;
        const dLon = (cLon - lon) * 111320 * Math.cos(lat * Math.PI / 180);
        const d2 = dLat * dLat + dLon * dLon;
        if (!best || d2 < best.d2) best = { el, d2 };
      }
      if (!best) {
        alert("Барилга олдсонгүй");
        return;
      }
      const closest = best.el;
      const tags = closest.tags ?? {};
      // Convert each lat/lon vertex to canvas SVG inner coords (for footprint pixels).
      const mapRect = map.getContainer().getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();
      const footprint = closest.geometry!.map((p) => {
        const cpt = map.latLngToContainerPoint([p.lat, p.lon]);
        return {
          x: Math.round((mapRect.left + cpt.x - svgRect.left - RULER_PX) / zoom - pan.x),
          y: Math.round((mapRect.top + cpt.y - svgRect.top - RULER_PX) / zoom - pan.y),
          lat: p.lat,
          lon: p.lon,
        };
      });
      // Compute polygon centroid (in lat/lon).
      const centroid = {
        lat: closest.geometry!.reduce((s, p) => s + p.lat, 0) / closest.geometry!.length,
        lon: closest.geometry!.reduce((s, p) => s + p.lon, 0) / closest.geometry!.length,
      };
      // Compute area using haversine + shoelace (in m²).
      const areaM2 = (() => {
        const pts = closest.geometry!;
        const lat0 = lat * Math.PI / 180;
        const m_per_deg_lat = 111320;
        const m_per_deg_lon = 111320 * Math.cos(lat0);
        let s = 0;
        for (let i = 0; i < pts.length; i += 1) {
          const j = (i + 1) % pts.length;
          const xi = pts[i]!.lon * m_per_deg_lon;
          const yi = pts[i]!.lat * m_per_deg_lat;
          const xj = pts[j]!.lon * m_per_deg_lon;
          const yj = pts[j]!.lat * m_per_deg_lat;
          s += xi * yj - xj * yi;
        }
        return Math.abs(s) / 2;
      })();
      // Pull useful tags from OSM
      const buildingTag = tags.building ?? "yes";
      const buildingType = tags["building:type"] ?? buildingTag;
      const levels = parseInt(tags["building:levels"] ?? "0") || undefined;
      const name = tags.name ?? tags["addr:housenumber"] ?? `OSM-${closest.id}`;
      const kind = (() => {
        const t = (buildingType + " " + (tags.amenity ?? "")).toLowerCase();
        if (t.includes("apartment") || t.includes("residential") || buildingTag === "apartments") return "consumer_apartment";
        if (t.includes("hospital")) return "consumer_hospital";
        if (t.includes("school") || t.includes("kindergarten")) return "consumer_school";
        if (t.includes("retail") || t.includes("commercial") || t.includes("shop")) return "consumer_retail";
        if (t.includes("industrial") || t.includes("warehouse")) return "consumer_industrial";
        if (t.includes("office")) return "consumer_office";
        if (t.includes("house")) return "consumer_house";
        return "consumer_apartment";
      })();
      // Open BuildingDialog with pre-filled footprint + lat/lon + suggested kind.
      setPendingFootprint(footprint);
      setOsmPickPreset({
        kind,
        label: name,
        floors: levels,
        geo: centroid,
        footprintArea_m2: Math.round(areaM2),
        adres: tags["addr:street"] ? `${tags["addr:street"]}${tags["addr:housenumber"] ? " " + tags["addr:housenumber"] : ""}` : undefined,
        notes: `OSM way #${closest.id}${tags.name ? `\nНэр: ${tags.name}` : ""}${tags["start_date"] ? `\nБариг.он: ${tags["start_date"]}` : ""}`,
      });
      setMode("select");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`OSM API хүсэлт амжилтгүй: ${msg}\n\nИнтернет холболтоо шалгана уу.`);
    } finally {
      setOsmLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pan, zoom]);

  const onCanvasClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (readOnly) return;
      const target = e.target as Element;
      // Allow clicks on bg only
      if (target.tagName !== "svg" && target.tagName !== "rect" && target.tagName !== "pattern" && target.tagName !== "path") return;
      const pt = snap(toSvg(e));

      if (mode === "addNode") {
        placeNodeAt(pt);
      } else if (mode === "pickBuilding") {
        // Convert SVG-inner click point → lat/lon, then fetch from Overpass.
        const ll = svgToLatLon(pt);
        if (ll) void pickBuildingFromOsm(ll.lat, ll.lon);
      } else if (mode === "measure") {
        // Хэмжих горим: цэгүүдийг дараалан дарж полилайн үүсгэнэ. Эцсийн уртыг live харуулна.
        // Functional update — closure-аас prev state-ыг алдалгүй авна (React batching-аас аюулгүй).
        setMeasurePoints((prev) => {
          const last = prev[prev.length - 1];
          const next = last ? snap(constrain(last, pt)) : pt;
          return [...prev, next];
        });
      } else if (mode === "drawBuilding") {
        // Polygon drawing — add vertex; close if click on first vertex
        if (polygon.length >= 3 && nearPoint(pt, polygon[0]!, 12)) {
          // Close polygon → open dialog
          setPendingFootprint([...polygon]);
          setPolygon([]);
          return;
        }
        let nextPoint = pt;
        if (polygon.length > 0) {
          nextPoint = snap(constrain(polygon[polygon.length - 1]!, pt));
        }
        setPolygon([...polygon, nextPoint]);
      } else if (mode === "select") {
        select(null);
      }
    },
    // pickBuildingFromOsm + svgToLatLon are useCallback values that depend on
    // [pan, zoom] — omitting them caused stale closures: after the user pans
    // the canvas, pickBuilding clicks would resolve to the OLD viewport's
    // lat/lon (wrong OSM building fetched). Adding them as deps fixes that.
    [mode, toSvg, snap, select, readOnly, polygon, constrain, placeNodeAt, pickBuildingFromOsm, svgToLatLon],
  );

  const onCanvasDoubleClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (mode === "drawBuilding" && polygon.length >= 3) {
        e.preventDefault();
        setPendingFootprint([...polygon]);
        setPolygon([]);
      }
    },
    [mode, polygon],
  );

  const onNodeMouseDown = useCallback(
    (e: MouseEvent, node: SchemeNode) => {
      e.stopPropagation();
      if (readOnly) {
        select({ kind: "node", id: node.id });
        return;
      }
      if (mode === "addPipe") {
        if (!pipeFrom) {
          setPipeFrom(node.id);
        } else if (pipeFrom !== node.id) {
          const from = nodes.find((n) => n.id === pipeFrom);
          // Manual length override — if user typed a value, use that; otherwise
          // measure pixel distance between nodes.
          const manualLen = parseFloat(pipeLengthInput);
          const measuredLen = from ? pxToM(Math.hypot(from.x - node.x, from.y - node.y)) : 0;
          const length_m = Number.isFinite(manualLen) && manualLen > 0 ? manualLen : measuredLen;
          addPipe({
            id: uid("pipe"),
            fromNodeId: pipeFrom,
            toNodeId: node.id,
            materialKey: "steel_aged",
            dn: 50,
            length_m: Math.max(0.5, Math.round(length_m * 10) / 10),
            circuit: pendingCircuit,
          });
          setPipeFrom(null);
          setPipeLengthInput("");
          setMode("select");
        }
      } else {
        select({ kind: "node", id: node.id });
        const pt = toSvg(e);
        setDrag({ nodeId: node.id, offX: pt.x - node.x, offY: pt.y - node.y });
      }
    },
    // pipeLengthInput is read at line 522 (manual length override). Without
    // it in deps, the closure captures the value at the time the user clicked
    // the FROM node — if they then typed in the L field BEFORE clicking the TO
    // node, the typed length was silently ignored. This was a real bug.
    [mode, pipeFrom, nodes, addPipe, toSvg, select, readOnly, pendingCircuit, pipeLengthInput],
  );

  const onPipeClick = useCallback(
    (e: MouseEvent, pipe: SchemePipe) => {
      e.stopPropagation();
      select({ kind: "pipe", id: pipe.id });
    },
    [select],
  );

  /** Add a waypoint at the click position — bends the pipe through that point. */
  const onPipeDoubleClick = useCallback(
    (e: MouseEvent, pipe: SchemePipe) => {
      e.stopPropagation();
      e.preventDefault();
      if (readOnly) return;
      const pt = snap(toSvg(e));
      const existing = pipe.waypoints ?? [];
      // Insert the new waypoint at the position closest to the click — between the
      // two ends of the segment that contains the click point.
      const a = nodes.find((n) => n.id === pipe.fromNodeId);
      const b = nodes.find((n) => n.id === pipe.toNodeId);
      if (!a || !b) return;
      const allPoints = [{ x: a.x, y: a.y }, ...existing, { x: b.x, y: b.y }];
      // Find the segment whose midpoint is closest to pt
      let bestSeg = 0;
      let bestDist = Infinity;
      for (let i = 0; i < allPoints.length - 1; i += 1) {
        const m = { x: (allPoints[i]!.x + allPoints[i + 1]!.x) / 2, y: (allPoints[i]!.y + allPoints[i + 1]!.y) / 2 };
        const d = Math.hypot(m.x - pt.x, m.y - pt.y);
        if (d < bestDist) { bestDist = d; bestSeg = i; }
      }
      const newWaypoints = [...existing];
      newWaypoints.splice(bestSeg, 0, { x: Math.round(pt.x), y: Math.round(pt.y) });
      updatePipe(pipe.id, { waypoints: newWaypoints });
    },
    [readOnly, snap, toSvg, nodes, updatePipe],
  );

  /** Right-click on a node or pipe — open context menu. */
  const onContextMenuTarget = useCallback(
    (e: MouseEvent, target: { kind: "node" | "pipe"; id: string }) => {
      if (readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      select(target);
      setContextMenu({ x: e.clientX, y: e.clientY, target });
    },
    [readOnly, select],
  );

  /** Duplicate the currently-selected node, offset by 30px. */
  const duplicateSelected = useCallback(() => {
    if (readOnly || !selection || selection.kind !== "node") return;
    const orig = nodes.find((n) => n.id === selection.id);
    if (!orig) return;
    const newId = uid(orig.kind.split("_")[0] ?? "n");
    const dup: SchemeNode = {
      ...orig,
      id: newId,
      x: orig.x + 30,
      y: orig.y + 30,
      label: `${orig.label}-хуулбар`,
      // Don't carry geo to the duplicate (it'd land on the same lat/lon)
      geo: undefined,
    };
    addNode(dup);
    select({ kind: "node", id: newId });
  }, [readOnly, selection, nodes, addNode, select]);

  const onMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      const pt = toSvg(e);
      setMousePos(pt);
      // Map-pan drag — translate the underlying Leaflet map so geo-anchored
      // nodes track with it. Update startX/startY so each event represents a delta.
      if (mapPanDrag && leafletMapRef.current) {
        const dx = e.clientX - mapPanDrag.startX;
        const dy = e.clientY - mapPanDrag.startY;
        if (dx !== 0 || dy !== 0) {
          leafletMapRef.current.panBy([-dx, -dy], { animate: false });
          setMapPanDrag({ startX: e.clientX, startY: e.clientY });
        }
        return;
      }
      if (drag) {
        const snapped = snap({ x: pt.x - drag.offX, y: pt.y - drag.offY });
        const patch: Partial<SchemeNode> = { x: Math.round(snapped.x), y: Math.round(snapped.y) };
        // If we're in map-anchored mode, also update geo so the node stays
        // pinned to that lat/lon when the user pans/zooms the map afterward.
        if (mapAnchored && showMap) {
          const ll = svgToLatLon(snapped);
          if (ll) patch.geo = { lat: ll.lat, lon: ll.lon };
        }
        updateNode(drag.nodeId, patch);
      } else if (waypointDrag) {
        const snapped = snap(pt);
        const pipe = pipes.find((p) => p.id === waypointDrag.pipeId);
        if (pipe?.waypoints) {
          const newWaypoints = pipe.waypoints.map((wp, i) =>
            i === waypointDrag.index ? { x: Math.round(snapped.x), y: Math.round(snapped.y) } : wp,
          );
          updatePipe(waypointDrag.pipeId, { waypoints: newWaypoints });
        }
      }
    },
    [drag, toSvg, updateNode, snap, mapAnchored, showMap, svgToLatLon, waypointDrag, pipes, updatePipe, mapPanDrag],
  );

  /** Mouse-down on the SVG. If user clicked empty canvas while map is shown,
   *  start a map-pan drag (we route this through Leaflet's panBy because the
   *  SVG sits on top and would normally swallow the drag). */
  const onCanvasMouseDown = useCallback((e: MouseEvent<SVGSVGElement>) => {
    if (!showMap || !leafletMapRef.current) return;
    if (mode !== "select") return;
    const target = e.target as Element;
    const tag = target.tagName.toLowerCase();
    // Empty area = the SVG root or the background grid rect (which has no aria-label parent).
    const isEmpty = tag === "svg" || (tag === "rect" && !target.closest("g[aria-label]"));
    if (!isEmpty) return;
    setMapPanDrag({ startX: e.clientX, startY: e.clientY });
  }, [showMap, mode]);

  const onMouseUp = useCallback(() => {
    setDrag(null);
    setWaypointDrag(null);
    setMapPanDrag(null);
  }, []);

  const onWheel = useCallback((e: WheelEvent<SVGSVGElement>) => {
    if (Math.abs(e.deltaY) < 1) return;
    // When map is shown, route wheel to leaflet (zoom in/out the map under cursor).
    // The geo-anchored nodes will then re-anchor via mapTick → displayPos.
    if (showMap && leafletMapRef.current) {
      const map = leafletMapRef.current;
      const cur = map.getZoom();
      const factor = e.deltaY < 0 ? 1 : -1;
      // Use container point under cursor as zoom anchor so the spot doesn't drift.
      const rect = map.getContainer().getBoundingClientRect();
      const cp = map.containerPointToLatLng([e.clientX - rect.left, e.clientY - rect.top]);
      map.setZoomAround(cp, cur + factor, { animate: false });
      return;
    }
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => Math.max(0.05, Math.min(4, z * factor)));
  }, [showMap]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (readOnly) return;
      // Ignore key events from form inputs (e.g. typing in an input field)
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selection) return;
        if (selection.kind === "node") useHydraulicStore.getState().removeNode(selection.id);
        else useHydraulicStore.getState().removePipe(selection.id);
      } else if (e.key === "Escape") {
        setMode("select");
        setShowPalette(null);
        setPipeFrom(null);
        setPolygon([]);
        setPendingFootprint(null);
        setMeasurePoints([]);
        setContextMenu(null);
        setContextMenu(null);
      } else if (e.key === "Enter" && mode === "drawBuilding" && polygon.length >= 3) {
        setPendingFootprint([...polygon]);
        setPolygon([]);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "g" || e.key === "G") {
        setShowGrid((g) => !g);
      } else if (e.key === "s" || e.key === "S") {
        setSnapGrid((s) => !s);
      } else if (e.key === "m" || e.key === "M") {
        setShowMap((m) => !m);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, readOnly, mode, polygon, duplicateSelected]);

  const violatingPipeIds = new Set(
    (violations ?? []).filter((v) => v.target.kind === "pipe").map((v) => v.target.id),
  );
  const violatingNodeIds = new Set(
    (violations ?? []).filter((v) => v.target.kind === "node").map((v) => v.target.id),
  );

  // Live cursor info
  const cursorM = mousePos ? { x: pxToM(mousePos.x), y: pxToM(mousePos.y) } : null;
  const livePipeInfo = mode === "addPipe" && pipeFrom && mousePos
    ? (() => {
        const from = nodes.find((n) => n.id === pipeFrom);
        if (!from) return null;
        const to = constrain(from, mousePos);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len_m = pxToM(Math.hypot(dx, dy));
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        return { len_m, ang, to };
      })()
    : null;
  const liveBuildingInfo = mode === "drawBuilding" && polygon.length > 0 && mousePos
    ? (() => {
        const last = polygon[polygon.length - 1]!;
        const to = snap(constrain(last, mousePos));
        const len_m = pxToM(Math.hypot(to.x - last.x, to.y - last.y));
        const closeable = polygon.length >= 3 && nearPoint(to, polygon[0]!, 12);
        const previewArea = closeable ? polygonAreaM2(polygon) : 0;
        return { len_m, to, closeable, previewArea };
      })()
    : null;

  return (
    <div style={{ position: "relative", height: "100%", background: "var(--bg)", display: "flex" }}>
      {showMap && (
        <MapBackground
          providerKey={mapProvider}
          opacity={mapOpacity}
          onMapReady={onMapReadyStable}
          onMapView={onMapViewStable}
          onMapClick={onMapNativeClick}
        />
      )}
      <MapControls
        enabled={showMap}
        onToggle={() => setShowMap((m) => !m)}
        providerKey={mapProvider}
        onProviderChange={setMapProvider}
        opacity={mapOpacity}
        onOpacityChange={setMapOpacity}
      />
      <AddressSearch
        enabled={showMap}
        onPick={({ lat, lon, zoom }) => {
          // Fly the map to the hit, then persist the centre + zoom so
          // reopening the project lands here. flyTo is a no-op when the
          // map ref isn't yet mounted (defensive — Leaflet attaches async).
          leafletMapRef.current?.flyTo([lat, lon], zoom, { duration: 0.6 });
          updateSettings({ mapCenterLat: lat, mapCenterLon: lon, mapZoom: zoom });
        }}
      />
      {showMap && !readOnly && (
        <button
          onClick={() => setMapAnchored((m) => !m)}
          title={mapAnchored
            ? "Газрын зурагт уях горим — асаалттай. Click дарахад lat/lon-д хадгалагдана."
            : "Газрын зурагт уях горим — унтраалттай. Click нь зөвхөн pixel-д үүсгэнэ."}
          style={{
            position: "absolute",
            top: 60,
            right: 56,
            zIndex: 6,
            padding: "0.4rem 0.7rem",
            fontSize: 12,
            background: mapAnchored ? "var(--bp-blue)" : "var(--bp-bg-2)",
            color: mapAnchored ? "var(--bp-bg-2)" : "var(--bp-text)",
            border: `1px solid ${mapAnchored ? "var(--bp-blue)" : "var(--bp-line-2)"}`,
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          📍 {mapAnchored ? "Газрын зурагт уясан" : "Газрын зурагт уях"}
        </button>
      )}

      {/* Vertical category toolbar */}
      {!readOnly && !hideUi && (
        <div
          style={{
            width: 64,
            background: "var(--bg-soft)",
            borderRight: "1px solid var(--border-soft)",
            display: "flex",
            flexDirection: "column",
            padding: "0.4rem 0",
            gap: 4,
            zIndex: 4,
          }}
        >
          <SideBtn
            active={mode === "select"}
            onClick={() => {
              setMode("select");
              setShowPalette(null);
            }}
            icon="↖"
            label="Сонгох"
          />
          {CATEGORIES.map((cat) => (
            <SideBtn
              key={cat.key}
              active={mode === "addNode" && showPalette === cat.key}
              onClick={() => {
                setMode("addNode");
                setShowPalette(cat.key);
              }}
              icon={NODE_KINDS.find((n) => n.category === cat.key)?.icon ?? "•"}
              label={cat.label}
              color={cat.color}
            />
          ))}
          <div style={{ borderTop: "1px solid var(--border-soft)", margin: "4px 0" }} />
          <SideBtn
            active={mode === "drawBuilding"}
            onClick={() => {
              setMode("drawBuilding");
              setPolygon([]);
              setShowPalette(null);
            }}
            icon="▱"
            label="Барилга"
            color="var(--success)"
          />
          <SideBtn
            active={mode === "addPipe"}
            onClick={() => {
              setMode("addPipe");
              setPipeFrom(null);
              setShowPalette(null);
            }}
            icon="／"
            label="Хоолой"
          />
          <SideBtn
            active={mode === "measure"}
            onClick={() => {
              setMode((m) => (m === "measure" ? "select" : "measure"));
              setMeasurePoints([]);
              setShowPalette(null);
            }}
            icon="📏"
            label="Хэмжих"
            color="var(--bp-blue)"
          />
          <SideBtn
            active={mode === "pickBuilding"}
            onClick={() => {
              if (!showMap) {
                alert("Газрын зургийг асаасны дараа OSM-ээс барилга татах боломжтой.");
                return;
              }
              setMode((m) => (m === "pickBuilding" ? "select" : "pickBuilding"));
              setShowPalette(null);
            }}
            icon="🏘"
            label="OSM"
            color="var(--bp-blue)"
          />
        </div>
      )}

      {/* Floating palette */}
      {showPalette && (
        <div
          style={{
            position: "absolute",
            left: 70,
            top: 8,
            zIndex: 5,
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            padding: "0.6rem",
            borderRadius: 8,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 6,
            minWidth: 320,
            maxWidth: 420,
            boxShadow: "var(--shadow)",
          }}
        >
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--fg-muted)", textTransform: "uppercase" }}>
            {CATEGORIES.find((c) => c.key === showPalette)?.label}
          </div>
          {NODE_KINDS.filter((k) => k.category === showPalette).map((k) => (
            <button
              key={k.key}
              onClick={() => {
                setPendingKind(k.key);
                setShowPalette(null);
              }}
              title={k.description}
              style={{
                ...paletteBtn,
                ...(pendingKind === k.key ? { background: "var(--accent-bg)", borderColor: "var(--accent)" } : {}),
              }}
            >
              <span style={{ fontSize: 18 }}>{k.icon}</span>
              <span style={{ fontSize: 11, textAlign: "center", lineHeight: 1.2 }}>{k.shortLabel}</span>
            </button>
          ))}
        </div>
      )}

      {/* Top mini toolbar */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 5,
          display: "flex",
          gap: 6,
          background: "var(--bg-elev)",
          border: "1px solid var(--border)",
          padding: 6,
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        <select
          value={angleMode}
          onChange={(e) => setAngleMode(e.target.value as AngleMode)}
          style={topInput}
          title="Шугам/полилайн өнцөг"
        >
          <option value="ortho90">⌐ 90°</option>
          <option value="ortho45">⫽ 45°</option>
          <option value="free">∞ Free</option>
        </select>
        {mode === "addPipe" && (
          <>
            <select
              value={pendingCircuit}
              onChange={(e) => setPendingCircuit(e.target.value as PipeCircuit)}
              style={topInput}
              title="Хоолойн төрөл"
            >
              {PIPE_CIRCUITS.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={0.5}
              step={0.5}
              placeholder="L (м)"
              value={pipeLengthInput}
              onChange={(e) => setPipeLengthInput(e.target.value)}
              style={{ ...topInput, width: 70 }}
              title="Хоолойн урт (м) — оруулсан тоо нь зурсан зайнаас давах тогтсон утга болно. Хоосон үлдвэл pixel-аар тооцоологдоно."
            />
          </>
        )}
        <button
          onClick={() => setShowGrid((g) => !g)}
          style={{ ...topBtn, ...(showGrid ? { color: "var(--accent)" } : {}) }}
          title="Тор (G)"
        >▦</button>
        <button
          onClick={() => setSnapGrid((s) => !s)}
          style={{ ...topBtn, ...(snapGrid ? { color: "var(--accent)" } : {}) }}
          title="Snap (S)"
        >⊟</button>
        <button onClick={() => setZoom((z) => Math.min(4, z * 1.2))} style={topBtn} title="Томруулах">+</button>
        <button onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))} style={topBtn} title="Жижигрүүлэх">−</button>
        <button onClick={fitToContent} style={topBtn} title="Бүх схемийг үзэгдэхүйц болгох (Fit to view)">⤢</button>
        <button
          onClick={() => setHideUi((h) => !h)}
          style={{ ...topBtn, ...(hideUi ? { color: "var(--bp-blue)" } : {}) }}
          title={hideUi ? "UI харуулах" : "UI нуух (зөвхөн зураглал)"}
        >{hideUi ? "◨" : "◧"}</button>
        <select
          value={colorOverlay}
          onChange={(e) => setColorOverlay(e.target.value as typeof colorOverlay)}
          style={topInput}
          title="Хоолойн өнгийг тооцоонд хамаатуулах"
        >
          <option value="off">Өнгө: схем</option>
          <option value="speed">Өнгө: хурд (м/с)</option>
          <option value="pressure">Өнгө: даралт (м.в.с.)</option>
        </select>
        <button
          onClick={() => setAnimateFlow((f) => !f)}
          style={{ ...topBtn, ...(animateFlow ? { color: "var(--bp-blue)", background: "var(--bp-blue-soft)", borderColor: "var(--bp-blue)" } : {}) }}
          title={animateFlow ? "Шугамын урсгалын анимацийг унтраах" : "Шугамын урсгалын анимаци"}
        >▶▶</button>
        <button
          onClick={() => setAnimateErrors((e) => !e)}
          style={{ ...topBtn, ...(animateErrors ? { color: "var(--bp-red)", background: "var(--bp-red-soft)", borderColor: "var(--bp-red)" } : {}) }}
          title={animateErrors ? "Алдааны анимацийг унтраах" : "Алдааны анимаци"}
        >⚠</button>
      </div>

      {/* Mode hints */}
      {mode === "addPipe" && pipeFrom && (
        <div style={hintStyle}>
          Хоолойн төгсгөлийн зангилаа дээр дарна. ESC цуцлах.
          {parseFloat(pipeLengthInput) > 0 && (
            <span style={{ marginLeft: 8, color: "var(--bp-blue)", fontWeight: 700 }}>
              · L = {pipeLengthInput}м (тогтсон)
            </span>
          )}
        </div>
      )}
      {mode === "addPipe" && !pipeFrom && (
        <div style={hintStyle}>Эх зангилаа дээр дарна.</div>
      )}
      {mode === "addNode" && (
        <div style={hintStyle}>{getNodeKind(pendingKind)?.name} — canvas дээр дарна</div>
      )}
      {mode === "drawBuilding" && (
        <div style={hintStyle}>
          Polygon-ы өнцгүүдийг дараалан дарна. {polygon.length >= 3 ? "Эхний цэг рүү буцаж эсвэл Enter — хаах" : "≥3 цэг хэрэгтэй"}.
          {polygon.length > 0 && ` (${polygon.length} өнцөг)`}
        </div>
      )}
      {mode === "measure" && (
        <div style={hintStyle}>
          📏 Хэмжих хэрэгсэл — цэгүүдийг дараалан дарна. {measurePoints.length >= 1 ? `Σ урт live харагдана. ESC цуцлах.` : "Эхний цэг дээр дарна."}
          {measurePoints.length > 0 && ` (${measurePoints.length} цэг)`}
        </div>
      )}
      {mode === "pickBuilding" && (
        <div style={hintStyle}>
          🏘 OSM Барилга татах — газрын зураг дээр барилгын дотор дарна. OSM-аас ойролцоох барилгын footprint-г татаж тэмдэглэнэ.
          {osmLoading && <span style={{ marginLeft: 8, color: "var(--bp-amber)" }}>… татаж байна</span>}
        </div>
      )}

      {/* Canvas with rulers.
          When the map is showing, the SVG sits above the Leaflet layer (z=3).
          Pointer-events stay AUTO so node/pipe clicks & drags continue to
          work normally. To pan the map under the canvas, drag an empty area
          (target===svg or grid rect) — see onCanvasMouseDown below; that path
          calls leafletMap.panBy(). Wheel-on-empty area zooms the map. */}
      <svg
        ref={svgRef}
        onClick={onCanvasClick}
        onDoubleClick={onCanvasDoubleClick}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{
          flex: 1,
          height: "100%",
          display: "block",
          cursor: mapPanDrag ? "grabbing"
            : drag ? "grabbing"
            : (mode === "drawBuilding" || mode === "measure" ? "crosshair"
            : showMap && mode === "select" ? "grab"
            : "default"),
          position: "relative",
          zIndex: showMap ? 3 : 1,
        }}
      >
        <defs>
          <pattern id="grid" width={GRID_PX} height={GRID_PX} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID_PX} 0 L 0 0 0 ${GRID_PX}`} fill="none" stroke="var(--border-soft)" strokeWidth="0.5" />
          </pattern>
          <pattern id="majorGrid" width={GRID_PX * MAJOR_GRID_M} height={GRID_PX * MAJOR_GRID_M} patternUnits="userSpaceOnUse">
            <path d={`M ${GRID_PX * MAJOR_GRID_M} 0 L 0 0 0 ${GRID_PX * MAJOR_GRID_M}`} fill="none" stroke="var(--border)" strokeWidth="0.8" />
          </pattern>
          {/* AutoCAD-style hatch patterns for building polygons.
              Each pattern is one stroke color = currentColor (so caller can theme via fill). */}
          <pattern id="hatch-diag45" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
          </pattern>
          <pattern id="hatch-diag135" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
          </pattern>
          <pattern id="hatch-cross" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="0.7" opacity="0.55" />
            <line x1="0" y1="0" x2="10" y2="0" stroke="currentColor" strokeWidth="0.7" opacity="0.55" />
          </pattern>
          <pattern id="hatch-brick" width="20" height="10" patternUnits="userSpaceOnUse">
            <rect width="20" height="10" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
            <line x1="10" y1="0" x2="10" y2="5" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
            <line x1="0" y1="5" x2="20" y2="5" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
            <line x1="0" y1="5" x2="0" y2="10" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
            <line x1="20" y1="5" x2="20" y2="10" stroke="currentColor" strokeWidth="0.6" opacity="0.45" />
          </pattern>
          <pattern id="hatch-dots" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="0.9" fill="currentColor" opacity="0.55" />
          </pattern>
          {/* Arrow marker for pump outlet + flow indicators */}
          <marker id="arrow-pump" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          <marker id="arrow-flow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Main canvas content (translated by RULER_PX so rulers fit).
            When showMap=true, the SVG root is pointer-events:none so the
            Leaflet map underneath can be panned/zoomed — but we re-enable
            pointer-events on the interactive group below so nodes/pipes
            still respond to clicks/drags. */}
        <g transform={`translate(${RULER_PX}, ${RULER_PX})`} style={{ pointerEvents: showMap ? "auto" : undefined }}>
          <g transform={`scale(${zoom}) translate(${pan.x}, ${pan.y})`}>
            {showGrid && !showMap && (
              <>
                <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#grid)" pointerEvents="none" />
                <rect x="-5000" y="-5000" width="10000" height="10000" fill="url(#majorGrid)" pointerEvents="none" />
              </>
            )}

            {/* X/Y axis lines through origin */}
            <line x1="-5000" y1="0" x2="5000" y2="0" stroke="var(--border)" strokeWidth="1" opacity="0.6" pointerEvents="none" />
            <line x1="0" y1="-5000" x2="0" y2="5000" stroke="var(--border)" strokeWidth="1" opacity="0.6" pointerEvents="none" />

            {/* Building footprint polygons */}
            {nodes.filter((n) => n.footprint && n.footprint.length >= 3).map((n) => {
              const pts = n.footprint!;
              const isSelected = selection?.kind === "node" && selection.id === n.id;
              const def = getNodeKind(n.kind);
              const cat = CATEGORIES.find((c) => c.key === def?.category);
              const fillColor = cat?.color ?? "var(--accent)";
              const center = polygonCentroid(pts);
              // When map-anchored, the footprint may have per-vertex lat/lon
              // (set by OSM picker or map polygon drawing). If so, recompute
              // each vertex from leaflet — that way the polygon STAYS GLUED
              // to the map as the user pans/zooms (instead of drifting as a
              // rigid block when only the centroid is geo-anchored).
              const usingPerVertexGeo = showMap && pts.some((p) => p.lat !== undefined && p.lon !== undefined) && leafletMapRef.current && svgRef.current;
              let movedPts: Array<{ x: number; y: number }>;
              let movedCenter: Point;
              if (usingPerVertexGeo) {
                const map = leafletMapRef.current!;
                const mapRect = map.getContainer().getBoundingClientRect();
                const svgRect = svgRef.current!.getBoundingClientRect();
                movedPts = pts.map((p) => {
                  if (p.lat === undefined || p.lon === undefined) return { x: p.x, y: p.y };
                  const cpt = map.latLngToContainerPoint([p.lat, p.lon]);
                  return {
                    x: (mapRect.left + cpt.x - svgRect.left - RULER_PX) / zoom - pan.x,
                    y: (mapRect.top + cpt.y - svgRect.top - RULER_PX) / zoom - pan.y,
                  };
                });
                const cx = movedPts.reduce((s, p) => s + p.x, 0) / movedPts.length;
                const cy = movedPts.reduce((s, p) => s + p.y, 0) / movedPts.length;
                movedCenter = { x: cx, y: cy };
              } else {
                // Fallback: rigid translate by displayPos delta (centroid follows geo).
                const dp = displayPos(n);
                const dx = dp.x - n.x;
                const dy = dp.y - n.y;
                movedPts = (dx === 0 && dy === 0) ? pts.map((p) => ({ x: p.x, y: p.y })) : pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
                movedCenter = { x: center.x + dx, y: center.y + dy };
              }
              return (
                <g
                  key={`fp-${n.id}`}
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onContextMenu={(e) => onContextMenuTarget(e, { kind: "node", id: n.id })}
                  style={{ cursor: "move", color: fillColor }}
                >
                  {/* Hatch background — Zulu/AutoCAD style. Drawn first so polygon outline is on top. */}
                  {n.hatchPattern && n.hatchPattern !== "none" && n.hatchPattern !== "solid" && (
                    <polygon
                      points={movedPts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={`url(#hatch-${n.hatchPattern})`}
                      stroke="none"
                      pointerEvents="none"
                    />
                  )}
                  <polygon
                    points={movedPts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={n.hatchPattern && n.hatchPattern !== "solid" ? "none" : fillColor}
                    fillOpacity={n.hatchPattern && n.hatchPattern !== "solid" ? 0 : (isSelected ? 0.25 : 0.12)}
                    stroke={isSelected ? "var(--accent)" : fillColor}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    pointerEvents="all"
                  />
                  <text x={movedCenter.x} y={movedCenter.y - 4} fontSize="13" fontWeight="600" textAnchor="middle" fill="var(--fg)" style={{ pointerEvents: "none" }}>
                    {n.label}
                  </text>
                  <text x={movedCenter.x} y={movedCenter.y + 12} fontSize="10" textAnchor="middle" fill="var(--fg-muted)" fontFamily="var(--font-mono)" style={{ pointerEvents: "none" }}>
                    {n.footprintArea_m2?.toFixed(0)}м² · {n.floors ?? 1}д · {((n.heatLoad_w ?? 0) / 1000).toFixed(1)}кВт
                  </text>
                </g>
              );
            })}

            {/* pipes */}
            {pipes.map((p) => {
              const a = nodes.find((n) => n.id === p.fromNodeId);
              const b = nodes.find((n) => n.id === p.toNodeId);
              if (!a || !b) return null;
              const aPos = displayPos(a);
              const bPos = displayPos(b);
              const isSelected = selection?.kind === "pipe" && selection.id === p.id;
              const isBad = violatingPipeIds.has(p.id);
              const r = results?.pipes.find((x) => x.pipeId === p.id);
              const circuit = PIPE_CIRCUITS.find((c) => c.key === p.circuit) ?? PIPE_CIRCUITS[0]!;
              // Color overlay (Zulu voda.ini bands) when results exist + overlay mode active
              let overlayColor: string | undefined;
              if (colorOverlay === "speed" && r) {
                overlayColor = colorForValue(r.v_m_s, SPEED_BANDS);
              } else if (colorOverlay === "pressure" && results) {
                const fromR = results.nodes.find((nr) => nr.nodeId === p.fromNodeId);
                if (fromR) overlayColor = colorForValue(fromR.pressureAtNode_mpa * 102, PRESSURE_BANDS);
              }
              const stroke = isBad ? "var(--danger)" : isSelected ? "var(--accent)" : (overlayColor ?? circuit.color);
              // Phase 6A — pipe stroke is now DN-aware on the map.
              // DN200 magistral renders visibly thicker than DN32
              // service, but tight clamps prevent "highway" effect
              // at high zoom and "vanishing line" at low zoom.
              // Falls back to legible 3.5 px in schematic-only mode.
              const usingMapForPipe = showMap && !!a.geo && !!b.geo && !!mapPxPerMeter && mapPxPerMeter > 0;
              const pxPerM_for_pipe = usingMapForPipe
                ? mapPxPerMeter! / Math.max(zoom, 0.05)
                : null;
              const sw_base = computePipeStrokeWidthPx(p.dn, pxPerM_for_pipe);
              const sw = isSelected ? sw_base + 1.5 : sw_base;

              const points: Point[] = [{ x: aPos.x, y: aPos.y }];
              if (p.waypoints?.length) points.push(...p.waypoints);
              else if (angleMode === "ortho90" && Math.abs(aPos.x - bPos.x) > 1 && Math.abs(aPos.y - bPos.y) > 1) {
                points.push({ x: bPos.x, y: aPos.y });
              }
              points.push({ x: bPos.x, y: bPos.y });
              const pathD = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              const midIdx = Math.floor(points.length / 2);
              const mp = {
                x: (points[midIdx - 1]!.x + points[midIdx]!.x) / 2,
                y: (points[midIdx - 1]!.y + points[midIdx]!.y) / 2,
              };
              // Анимацийн хурд — Zulu voda.ini band-уудтай зэрэгцэх:
              //   <0.1 м/с: super-slow (cold), <0.8: slow, <1.5: normal, <2.0: fast, >2.0: very fast
              const flowClass = (() => {
                if (!animateFlow || !r) return "";
                const v = r.v_m_s;
                if (v < 0.1) return ""; // зогссон ус — анимац байхгүй
                if (v >= 1.5) return "hydra-pipe-flow fast";
                if (v < 0.4) return "hydra-pipe-flow slow";
                return "hydra-pipe-flow";
              })();
              const violationClass = (isBad && animateErrors) ? "hydra-violation" : "";
              return (
                <g key={p.id} className={violationClass}>
                  {/* Pickable hit area — wider than the visible stroke, transparent */}
                  <path
                    d={pathD}
                    stroke="transparent"
                    strokeWidth={Math.max(14, sw + 8)}
                    fill="none"
                    onClick={(e) => onPipeClick(e, p)}
                    onDoubleClick={(e) => onPipeDoubleClick(e, p)}
                    onContextMenu={(e) => onContextMenuTarget(e, { kind: "pipe", id: p.id })}
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                  />
                  {/* Underlay — static colored stroke */}
                  <path d={pathD} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={circuit.dash} opacity={flowClass ? 0.45 : 1} pointerEvents="none" />
                  {/* Animated flow overlay — only when results exist + flow > 0.1 m/s */}
                  {flowClass && (
                    <path
                      d={pathD}
                      stroke={isBad ? "var(--danger)" : (overlayColor ?? circuit.color)}
                      strokeWidth={sw + 0.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={flowClass}
                      style={{ opacity: 0.95 }}
                      pointerEvents="none"
                    />
                  )}
                  {/* Waypoint handles — visible only when pipe is selected */}
                  {isSelected && p.waypoints?.map((wp, i) => (
                    <circle
                      key={`wp-${p.id}-${i}`}
                      cx={wp.x}
                      cy={wp.y}
                      r={5}
                      fill="var(--bp-bg)"
                      stroke="var(--bp-blue)"
                      strokeWidth={2}
                      style={{ cursor: "move" }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setWaypointDrag({ pipeId: p.id, index: i });
                      }}
                    />
                  ))}
                  <text x={mp.x} y={mp.y - 8} fontSize="11" fontFamily="var(--font-mono)" fill={isBad ? "var(--danger)" : "var(--fg-muted)"} textAnchor="middle" pointerEvents="none">
                    DN{p.dn} · {p.length_m}м
                  </text>
                  {r && (
                    <text x={mp.x} y={mp.y + 14} fontSize="10" fontFamily="var(--font-mono)" fill="var(--fg-dim)" textAnchor="middle" pointerEvents="none">
                      v={r.v_m_s.toFixed(2)} · R={r.headlossPerMeter_pa.toFixed(0)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Pipe preview */}
            {livePipeInfo && (() => {
              const from = nodes.find((n) => n.id === pipeFrom);
              if (!from) return null;
              const to = livePipeInfo.to;
              const points: Point[] = [{ x: from.x, y: from.y }];
              if (angleMode === "ortho90" && Math.abs(from.x - to.x) > 1 && Math.abs(from.y - to.y) > 1) {
                points.push({ x: to.x, y: from.y });
              }
              points.push(to);
              const pathD = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              const circuit = PIPE_CIRCUITS.find((c) => c.key === pendingCircuit) ?? PIPE_CIRCUITS[0]!;
              return (
                <>
                  <path d={pathD} stroke={circuit.color} strokeWidth={3} fill="none" strokeDasharray="6 4" opacity="0.65" strokeLinecap="round" strokeLinejoin="round" />
                  <text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 12} fontSize="12" fontFamily="var(--font-mono)" fill="var(--accent)" textAnchor="middle" fontWeight="600">
                    {livePipeInfo.len_m.toFixed(2)}м · {livePipeInfo.ang.toFixed(0)}°
                  </text>
                </>
              );
            })()}

            {/* Polygon being drawn */}
            {polygon.length > 0 && (() => {
              const pathPoints = [...polygon];
              if (liveBuildingInfo) pathPoints.push(liveBuildingInfo.to);
              const open = pathPoints.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              const closed = liveBuildingInfo?.closeable
                ? `${open} L ${polygon[0]!.x} ${polygon[0]!.y} Z`
                : open;
              return (
                <>
                  <path d={closed} stroke="var(--success)" strokeWidth="2" fill="rgba(94, 207, 140, 0.1)" strokeDasharray="4 3" />
                  {polygon.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={i === 0 && polygon.length >= 3 ? 8 : 4} fill={i === 0 && polygon.length >= 3 ? "var(--warning)" : "var(--success)"} stroke="var(--bg)" strokeWidth="1.5" />
                  ))}
                  {liveBuildingInfo && (
                    <text x={liveBuildingInfo.to.x + 10} y={liveBuildingInfo.to.y - 10} fontSize="12" fontFamily="var(--font-mono)" fill="var(--success)" fontWeight="600">
                      {liveBuildingInfo.len_m.toFixed(2)}м
                      {liveBuildingInfo.closeable && ` · S=${liveBuildingInfo.previewArea.toFixed(0)}м²`}
                    </text>
                  )}
                </>
              );
            })()}

            {/* Measure polyline — engineer clicks points; total length is shown live. */}
            {mode === "measure" && measurePoints.length > 0 && (() => {
              const pts = [...measurePoints];
              if (mousePos) pts.push(snap(constrain(measurePoints[measurePoints.length - 1]!, mousePos)));
              const d = pts.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              // Cumulative segment lengths (in meters, matching world scale).
              let total = 0;
              const segs: { from: Point; to: Point; len_m: number }[] = [];
              for (let i = 1; i < pts.length; i += 1) {
                const a = pts[i - 1]!; const b = pts[i]!;
                const len_m = pxToM(Math.hypot(a.x - b.x, a.y - b.y));
                total += len_m;
                segs.push({ from: a, to: b, len_m });
              }
              const tip = pts[pts.length - 1]!;
              return (
                <>
                  <path d={d} stroke="var(--bp-blue)" strokeWidth={2.5} fill="none" strokeDasharray="6 3" />
                  {pts.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 5 : 4} fill="var(--bp-blue)" stroke="var(--bg)" strokeWidth={1.5} />
                  ))}
                  {/* Per-segment label */}
                  {segs.map((s, i) => {
                    const mx = (s.from.x + s.to.x) / 2;
                    const my = (s.from.y + s.to.y) / 2;
                    return (
                      <text key={`seg-${i}`} x={mx} y={my - 6} fontSize="11" fontFamily="var(--font-mono)" fill="var(--bp-blue)" textAnchor="middle" fontWeight="600" style={{ pointerEvents: "none" }}>
                        {s.len_m.toFixed(2)}м
                      </text>
                    );
                  })}
                  {/* Cumulative total at the tip */}
                  {segs.length >= 1 && (
                    <g transform={`translate(${tip.x + 12}, ${tip.y - 12})`} style={{ pointerEvents: "none" }}>
                      <rect x={0} y={-14} width={Math.max(80, `Σ ${total.toFixed(2)}м`.length * 7)} height={20} rx={4} fill="var(--bp-blue)" opacity={0.92} />
                      <text x={6} y={1} fontSize="12" fontFamily="var(--font-mono)" fill="white" fontWeight="700">
                        Σ {total.toFixed(2)}м
                      </text>
                    </g>
                  )}
                </>
              );
            })()}

            {/* Point nodes (non-footprint) */}
            {nodes.filter((n) => !n.footprint || n.footprint.length < 3).map((n) => {
              const isSelected = selection?.kind === "node" && selection.id === n.id;
              const isPipeTarget = mode === "addPipe" && pipeFrom === n.id;
              const isBad = violatingNodeIds.has(n.id);
              const def = getNodeKind(n.kind) ?? NODE_KINDS[0]!;
              const cat = CATEGORIES.find((c) => c.key === def.category);
              const baseColor = cat?.color ?? "var(--accent)";
              const color = isBad ? "var(--danger)" : isPipeTarget ? "var(--warning)" : isSelected ? "var(--accent)" : baseColor;
              // Phase 6A — point-node symbol radius is zoom-aware.
              //   * When the leaflet map is visible AND we have a
              //     valid mapPxPerMeter, scale by the entity's real-
              //     world size and clamp to [MIN_SYMBOL_PX, MAX].
              //   * Otherwise (schematic mode, no map) keep the
              //     legible MIN_SYMBOL_PX default.
              // The scaleFactor below already accounts for the SVG
              // group's zoom transform, so dividing by zoom keeps
              // visual size constant regardless of canvas zoom.
              const entityKind = resolveEntityKind(n.kind, def.category);
              const usingMapForSymbol = showMap && !!n.geo && !!mapPxPerMeter && mapPxPerMeter > 0;
              const pxPerM_for_symbol = usingMapForSymbol
                ? mapPxPerMeter! / Math.max(zoom, 0.05)
                : null;
              const computedR = computeSymbolRadiusPx(entityKind, pxPerM_for_symbol);
              const r = isSelected ? computedR + 4 : computedR;
              void MIN_SYMBOL_PX; // imported for downstream test-friendly access
              const isPump = def.category === "pump";
              const isActivePump = isPump && results && !isBad;
              const showErrorRings = isBad && animateErrors;
              const dp = displayPos(n);
              const hasGeo = !!n.geo;
              // Real plan view: ONLY when the user explicitly set width_m & height_m
              // (e.g. drew a building polygon, or typed dimensions in inspector).
              // Defaults from nodeCatalog are NOT used here — that would expand
              // every imported DXF consumer to 30×12m, hiding the network.
              const wm = n.width_m ?? 0;
              const hm = n.height_m ?? 0;
              const isBuilding = (def.category === "consumer" || def.category === "source") && wm >= 6 && hm >= 6;
              // When the leaflet map is showing AND this node is geo-anchored,
              // size the building rect to the MAP's meters-per-pixel (so it
              // matches the satellite/OSM zoom level). Otherwise fall back to
              // canvas PX_PER_METER. mapTick is in deps so this updates live
              // as the user zooms the map.
              //
              // The svg group has scale(zoom) applied, so dividing by zoom keeps
              // visual size constant regardless of canvas zoom level.
              const usingMapScale = showMap && !!n.geo && !!mapPxPerMeter && mapPxPerMeter > 0;
              const scaleFactor = usingMapScale ? mapPxPerMeter! / Math.max(zoom, 0.05) : PX_PER_METER;
              // At very low map zooms (e.g. zoom 10) building may be < 4 px;
              // clamp so engineer can still see + click it. At high zoom (street
              // level), shows true scale. Min 12 px wide / 8 px tall keeps the
              // shape recognisable.
              const wpxRaw = wm * scaleFactor;
              const hpxRaw = hm * scaleFactor;
              const wpx = usingMapScale ? Math.max(12, wpxRaw) : wpxRaw;
              const hpx = usingMapScale ? Math.max(8, hpxRaw) : hpxRaw;
              return (
                <g
                  key={n.id}
                  transform={`translate(${dp.x}, ${dp.y})`}
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onContextMenu={(e) => onContextMenuTarget(e, { kind: "node", id: n.id })}
                  style={{ cursor: readOnly ? "pointer" : "move" }}
                  tabIndex={0}
                  aria-label={`${n.label} (${def.name})`}
                  className={isBad && animateErrors ? "hydra-violation" : ""}
                >
                  {/* Алдааны expanding ring — only when violating */}
                  {showErrorRings && (
                    <>
                      <circle r={Math.max(12, isBuilding ? Math.min(wpx, hpx) / 2 : 12)} className="hydra-violation-ring" />
                      <circle r={Math.max(12, isBuilding ? Math.min(wpx, hpx) / 2 : 12)} className="hydra-violation-ring" style={{ animationDelay: "0.6s" }} />
                    </>
                  )}
                  {isBuilding ? (
                    <BuildingPlanShape
                      width={wpx}
                      height={hpx}
                      color={color}
                      floors={n.floors ?? 1}
                      isSource={def.category === "source"}
                      selected={isSelected}
                      hatch={n.hatchPattern}
                    />
                  ) : (
                    /* Pump body wrapper — rotates if active */
                    <g className={isActivePump ? "hydra-pump-active" : ""}>
                      <NodeShape category={def.category} color={color} r={r} selected={isSelected} />
                    </g>
                  )}
                  {/* Label on top of the building — outside the rect for readability */}
                  {isBuilding ? (
                    <>
                      <text y={-hpx / 2 - 8} fontSize={Math.max(11, Math.min(16, hpx / 8))} textAnchor="middle" fontFamily="var(--font-sans)" fill={color} fontWeight="600" style={{ pointerEvents: "none" }}>
                        {n.label}
                      </text>
                      {n.heatLoad_w && n.heatLoad_w > 0 && (
                        <text y={hpx / 2 + 14} fontSize="11" textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--fg-dim)" style={{ pointerEvents: "none" }}>
                          {(n.heatLoad_w / 1000).toFixed(0)} kW · {n.floors ?? 1}д
                        </text>
                      )}
                    </>
                  ) : (
                    <>
                      <text y={4} fontSize={r > 13 ? 11 : 10} textAnchor="middle" fontFamily="var(--font-mono)" fill={color} fontWeight="600" style={{ pointerEvents: "none" }}>
                        {def.shortLabel}
                      </text>
                      <text y={-r - 6} fontSize="11" textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--fg-muted)" style={{ pointerEvents: "none" }}>
                        {n.label}
                      </text>
                      {n.heatLoad_w && n.heatLoad_w > 0 && (
                        <text y={r + 14} fontSize="10" textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--fg-dim)" style={{ pointerEvents: "none" }}>
                          {(n.heatLoad_w / 1000).toFixed(0)} kW
                        </text>
                      )}
                    </>
                  )}
                  {hasGeo && (
                    <text x={(isBuilding ? wpx / 2 : r) + 4} y={-(isBuilding ? hpx / 2 : r) + 2} fontSize="10" fill="var(--bp-blue)" style={{ pointerEvents: "none" }}>📍</text>
                  )}
                </g>
              );
            })}
          </g>
        </g>

        {/* Rulers */}
        <Rulers zoom={zoom} pan={pan} width={2000} height={2000} />
        {cursorM && (
          <text x={6} y={16} fontSize="11" fontFamily="var(--font-mono)" fill="var(--accent)">
            X={cursorM.x.toFixed(2)}м Y={cursorM.y.toFixed(2)}м
          </text>
        )}
      </svg>

      {/* HUD */}
      {results && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            padding: "0.6rem 0.85rem",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--fg-muted)",
            minWidth: 220,
          }}
        >
          <div>Σ ачаалал: <b style={{ color: "var(--accent)" }}>{(results.totalLoad_w / 1000).toFixed(1)} kW</b></div>
          <div>v_макс: <b style={{ color: results.maxVelocity_m_s > 3.5 ? "var(--danger)" : "var(--accent)" }}>{results.maxVelocity_m_s.toFixed(2)} м/с</b></div>
          <div>R_макс: <b style={{ color: results.maxHeadlossPerMeter_pa > 80 ? "var(--warning)" : "var(--accent)" }}>{results.maxHeadlossPerMeter_pa.toFixed(0)} Pa/м</b></div>
          <div>P_мин: <b style={{ color: results.minConsumerPressure_mpa < 0.15 ? "var(--danger)" : "var(--accent)" }}>{results.minConsumerPressure_mpa.toFixed(3)} MPa</b></div>
          {results.pump && <div>Насос: <b>H={results.pump.H_m.toFixed(1)}м, Q={results.pump.Q_m3h.toFixed(1)}м³/ц</b></div>}
        </div>
      )}

      {/* Building dialog */}
      {pendingFootprint && (
        <BuildingDialog
          footprint={pendingFootprint}
          preset={osmPickPreset ?? undefined}
          onCancel={() => { setPendingFootprint(null); setOsmPickPreset(null); }}
          onConfirm={(data) => {
            const id = uid("bld");
            const center = polygonCentroid(pendingFootprint);
            addNode({
              ...(osmPickPreset ?? {}),
              ...data,
              id,
              kind: data.kind ?? osmPickPreset?.kind ?? "consumer_apartment",
              label: data.label ?? osmPickPreset?.label ?? `Барилга-${nodes.length + 1}`,
              x: Math.round(center.x),
              y: Math.round(center.y),
              footprint: pendingFootprint,
            });
            setPendingFootprint(null);
            setOsmPickPreset(null);
            setMode("select");
            select({ kind: "node", id });
          }}
        />
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          target={contextMenu.target}
          onClose={() => setContextMenu(null)}
          onRename={() => {
            const target = contextMenu.target;
            const cur = target.kind === "node"
              ? nodes.find((n) => n.id === target.id)?.label
              : pipes.find((p) => p.id === target.id)?.id;
            const next = window.prompt("Шинэ нэр:", cur ?? "");
            if (next !== null && next.trim()) {
              if (target.kind === "node") updateNode(target.id, { label: next.trim() });
              // pipes don't have label; skip for now
            }
            setContextMenu(null);
          }}
          onDelete={() => {
            const target = contextMenu.target;
            if (!window.confirm("Энэ элементийг устгах уу?")) return;
            if (target.kind === "node") removeNode(target.id);
            else removePipe(target.id);
            setContextMenu(null);
          }}
          onDuplicate={() => {
            duplicateSelected();
            setContextMenu(null);
          }}
          onAddWaypoint={() => {
            const target = contextMenu.target;
            if (target.kind !== "pipe") return;
            const pipe = pipes.find((p) => p.id === target.id);
            if (!pipe) return;
            // Insert a waypoint at the midpoint of the longest segment
            const a = nodes.find((n) => n.id === pipe.fromNodeId);
            const b = nodes.find((n) => n.id === pipe.toNodeId);
            if (!a || !b) return;
            const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
            const wp = [...(pipe.waypoints ?? []), mid];
            updatePipe(pipe.id, { waypoints: wp });
            setContextMenu(null);
          }}
          onClearWaypoints={() => {
            const target = contextMenu.target;
            if (target.kind !== "pipe") return;
            updatePipe(target.id, { waypoints: [] });
            setContextMenu(null);
          }}
          isPipe={contextMenu.target.kind === "pipe"}
          hasWaypoints={
            contextMenu.target.kind === "pipe" &&
            (pipes.find((p) => p.id === contextMenu.target.id)?.waypoints?.length ?? 0) > 0
          }
        />
      )}
    </div>
  );
}

/** Right-click context menu — fixed-positioned floating menu. */
function ContextMenu({
  x, y, target,
  onRename, onDelete, onDuplicate,
  onAddWaypoint, onClearWaypoints,
  onClose,
  isPipe, hasWaypoints,
}: {
  x: number; y: number;
  target: { kind: "node" | "pipe"; id: string };
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddWaypoint: () => void;
  onClearWaypoints: () => void;
  onClose: () => void;
  isPipe: boolean;
  hasWaypoints: boolean;
}) {
  // Click-outside dismissal
  useEffect(() => {
    const dismiss = () => onClose();
    window.addEventListener("click", dismiss);
    return () => window.removeEventListener("click", dismiss);
  }, [onClose]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 100,
        background: "var(--bp-bg-2)",
        border: "1px solid var(--bp-line-2)",
        borderRadius: 6,
        padding: 4,
        boxShadow: "0 8px 24px rgba(26, 34, 51, 0.18)",
        minWidth: 180,
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--bp-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {target.kind === "node" ? "Зангилаа" : "Хоолой"}
      </div>
      {!isPipe && (
        <CtxBtn icon="✏" onClick={onRename}>Нэр өөрчлөх</CtxBtn>
      )}
      {!isPipe && (
        <CtxBtn icon="⎘" onClick={onDuplicate} kbd="Ctrl+D">Хуулбарлах</CtxBtn>
      )}
      {isPipe && (
        <CtxBtn icon="◇" onClick={onAddWaypoint}>Эргэлтийн цэг нэмэх</CtxBtn>
      )}
      {isPipe && hasWaypoints && (
        <CtxBtn icon="⏐" onClick={onClearWaypoints}>Бүх эргэлтийг арилгах</CtxBtn>
      )}
      <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
      <CtxBtn icon="🗑" onClick={onDelete} danger kbd="Del">Устгах</CtxBtn>
    </div>
  );
}

function CtxBtn({ icon, onClick, children, danger, kbd }: { icon: string; onClick: () => void; children: ReactNode; danger?: boolean; kbd?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        padding: "6px 10px",
        gap: 8,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        color: danger ? "var(--bp-red)" : "var(--bp-text)",
        fontFamily: "var(--font-sans)",
        textAlign: "left",
        borderRadius: 3,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bp-bg-3)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ width: 16, fontSize: 14 }}>{icon}</span>
      <span style={{ flex: 1 }}>{children}</span>
      {kbd && <span style={{ fontSize: 10, color: "var(--bp-text-3)", fontFamily: "var(--font-mono)" }}>{kbd}</span>}
    </button>
  );
}

/** Top + left rulers in meters. */
function Rulers({ zoom, pan, width, height }: { zoom: number; pan: Point; width: number; height: number }) {
  const ticks: ReactNode[] = [];
  // Major ticks every 5m, minor every 1m
  const stepM = MAJOR_GRID_M;
  const start_x_m = -50;
  const end_x_m = 200;
  const start_y_m = -50;
  const end_y_m = 200;
  for (let m = start_x_m; m <= end_x_m; m += stepM) {
    const px = m * PX_PER_METER * zoom + pan.x * zoom + RULER_PX;
    if (px < RULER_PX || px > width) continue;
    ticks.push(
      <g key={`xt${m}`}>
        <line x1={px} y1={RULER_PX - 6} x2={px} y2={RULER_PX} stroke="var(--fg-muted)" strokeWidth="1" />
        <text x={px + 2} y={RULER_PX - 8} fontSize="9" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
          {m}
        </text>
      </g>,
    );
  }
  for (let m = start_y_m; m <= end_y_m; m += stepM) {
    const py = m * PX_PER_METER * zoom + pan.y * zoom + RULER_PX;
    if (py < RULER_PX || py > height) continue;
    ticks.push(
      <g key={`yt${m}`}>
        <line x1={RULER_PX - 6} y1={py} x2={RULER_PX} y2={py} stroke="var(--fg-muted)" strokeWidth="1" />
        <text x={2} y={py - 2} fontSize="9" fill="var(--fg-muted)" fontFamily="var(--font-mono)">
          {m}
        </text>
      </g>,
    );
  }
  return (
    <>
      <rect x={0} y={0} width={width} height={RULER_PX} fill="var(--bg-soft)" stroke="var(--border-soft)" />
      <rect x={0} y={0} width={RULER_PX} height={height} fill="var(--bg-soft)" stroke="var(--border-soft)" />
      <rect x={0} y={0} width={RULER_PX} height={RULER_PX} fill="var(--bg-elev)" stroke="var(--border-soft)" />
      <text x={4} y={16} fontSize="9" fill="var(--fg-dim)" fontFamily="var(--font-mono)">м</text>
      {ticks}
    </>
  );
}

/**
 * Real-scale architectural plan view of a building (top-down).
 * Renders a rectangle of width_m × height_m with floor lines, roof crest,
 * and an entrance marker — like an architectural site plan.
 */
function BuildingPlanShape({ width, height, color, floors, isSource, selected, hatch }: {
  width: number; height: number; color: string; floors: number; isSource: boolean; selected: boolean;
  hatch?: "solid" | "diag45" | "diag135" | "cross" | "brick" | "dots" | "none";
}) {
  const sw = selected ? 3 : 2;
  const halfW = width / 2;
  const halfH = height / 2;
  const useHatch = hatch && hatch !== "none" && hatch !== "solid";
  const rx = Math.min(6, Math.min(width, height) * 0.05);
  // Floor lines — one ridge line per floor, evenly spaced.
  // Source factories: chimney box on top instead of ridge lines.
  return (
    <g style={{ color }}>
      {/* Hatch background — drawn first under outline */}
      {useHatch && (
        <rect
          x={-halfW}
          y={-halfH}
          width={width}
          height={height}
          fill={`url(#hatch-${hatch})`}
          stroke="none"
          pointerEvents="none"
          rx={rx}
        />
      )}
      {/* Building footprint — pointerEvents="all" so the entire rect (incl
          transparent interior when hatched) is clickable for selection/drag. */}
      <rect
        x={-halfW}
        y={-halfH}
        width={width}
        height={height}
        fill={useHatch ? "none" : "var(--bg)"}
        fillOpacity={useHatch ? 0 : (selected ? 0.95 : 0.85)}
        stroke={color}
        strokeWidth={sw}
        rx={rx}
        pointerEvents="all"
      />
      {/* Inner offset (wall thickness simulation) */}
      <rect
        x={-halfW + 4}
        y={-halfH + 4}
        width={width - 8}
        height={height - 8}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.35}
        rx={Math.max(0, Math.min(4, Math.min(width, height) * 0.04 - 2))}
      />
      {isSource ? (
        <>
          {/* Chimney + factory roof line */}
          <rect x={-halfW * 0.3} y={-halfH - 12} width={halfW * 0.6} height={12} fill={color} fillOpacity={0.5} stroke={color} strokeWidth={1.5} />
          <line x1={-halfW + 8} y1={-halfH * 0.3} x2={halfW - 8} y2={-halfH * 0.3} stroke={color} strokeWidth={1.5} opacity={0.55} />
          <line x1={-halfW + 8} y1={halfH * 0.3} x2={halfW - 8} y2={halfH * 0.3} stroke={color} strokeWidth={1.5} opacity={0.55} />
          {/* "F" mark for factory */}
          <text x={0} y={5} fontSize={Math.min(width, height) * 0.18} textAnchor="middle" fontFamily="var(--font-mono)" fill={color} fontWeight="700" style={{ pointerEvents: "none" }}>
            ⚙
          </text>
        </>
      ) : (
        <>
          {/* Ridge / floor lines */}
          {Array.from({ length: Math.min(Math.max(1, Math.floor(floors / 2)), 6) }).map((_, i) => {
            const t = (i + 1) / (Math.min(Math.max(1, Math.floor(floors / 2)), 6) + 1);
            const y = -halfH + height * t;
            return <line key={i} x1={-halfW + 8} y1={y} x2={halfW - 8} y2={y} stroke={color} strokeWidth={0.8} opacity={0.35} />;
          })}
          {/* Entrance — small notch on the side closest to nearest pipe */}
          <rect x={-3} y={halfH - 1} width={6} height={4} fill={color} fillOpacity={0.7} />
        </>
      )}
    </g>
  );
}

/**
 * Top-down architectural plan-view shapes per node category.
 * Inspired by Politerm/Zulu plan-view symbology + БНбД 41-01 standard диаграммууд.
 *
 * Source (эх үүсвэр): чимэглэлгүй double-square, gear icon inside (factory roof).
 * Consumer (хэрэглэгч): rounded square representing roof footprint.
 * Valve (хаалт): GOST-style "two opposing triangles" (bowtie) symbol.
 * Fitting (холбоос): triangle (pipe junction).
 * Chamber/well (камер/худаг): square with hatched corner.
 * Pump (насос): impeller shape — circle + 2-blade rotor + arrow.
 */
function NodeShape({ category, color, r, selected }: { category: string; color: string; r: number; selected: boolean }) {
  const sw = selected ? 3.5 : 2.5;
  switch (category) {
    case "source":
      // Factory: outer square + inner gear + heat-radiating dots
      return (
        <>
          <rect x={-r - 3} y={-r - 3} width={r * 2 + 6} height={r * 2 + 6} fill="var(--bg)" stroke={color} strokeWidth={sw} rx={3} />
          <rect x={-r * 0.7} y={-r * 0.7} width={r * 1.4} height={r * 1.4} fill="none" stroke={color} strokeWidth={1.2} rx={2} />
          {/* Roof/chimney indicator triangles */}
          <polygon points={`${-r * 0.5},${-r - 3} ${r * 0.5},${-r - 3} ${0},${-r - 7}`} fill={color} opacity={0.6} />
        </>
      );
    case "consumer":
      // Building plan: rounded rectangle with subtle roof line
      return (
        <>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} fill="var(--bg)" stroke={color} strokeWidth={sw} rx={r * 0.25} />
          {/* Subtle "ridge line" — represents roof crest */}
          <line x1={-r * 0.7} y1={-r * 0.4} x2={r * 0.7} y2={-r * 0.4} stroke={color} strokeWidth={1} opacity={0.4} />
          <line x1={-r * 0.7} y1={r * 0.0} x2={r * 0.7} y2={r * 0.0} stroke={color} strokeWidth={1} opacity={0.4} />
          <line x1={-r * 0.7} y1={r * 0.4} x2={r * 0.7} y2={r * 0.4} stroke={color} strokeWidth={1} opacity={0.4} />
        </>
      );
    case "valve": {
      // GOST-style bowtie: two triangles facing each other
      const inset = r * 0.3;
      return (
        <>
          <polygon points={`${-r},${-r * 0.7} ${-inset},0 ${-r},${r * 0.7}`} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={sw} />
          <polygon points={`${r},${-r * 0.7} ${inset},0 ${r},${r * 0.7}`} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={sw} />
          {/* Stem (handle) */}
          <line x1={0} y1={-inset} x2={0} y2={-r - 4} stroke={color} strokeWidth={1.5} />
          <circle cx={0} cy={-r - 5} r={2.5} fill={color} />
        </>
      );
    }
    case "fitting":
      // Triangle (junction marker)
      return <polygon points={`0,${-r} ${r * 0.866},${r * 0.5} ${-r * 0.866},${r * 0.5}`} fill="var(--bg)" stroke={color} strokeWidth={sw} />;
    case "chamber":
      // Concrete chamber: square with hatched corners (BNbD-standard)
      return (
        <>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} fill="var(--bg)" stroke={color} strokeWidth={sw} />
          <line x1={-r} y1={-r} x2={-r * 0.4} y2={-r} stroke={color} strokeWidth={2} />
          <line x1={-r} y1={-r} x2={-r} y2={-r * 0.4} stroke={color} strokeWidth={2} />
          <line x1={r} y1={r} x2={r * 0.4} y2={r} stroke={color} strokeWidth={2} />
          <line x1={r} y1={r} x2={r} y2={r * 0.4} stroke={color} strokeWidth={2} />
          {/* Manhole (cover) */}
          <circle r={r * 0.45} fill="none" stroke={color} strokeWidth={1} strokeDasharray="2 2" opacity={0.6} />
        </>
      );
    case "pump":
      // Centrifugal pump: outer casing + impeller (3-blade) + outlet arrow
      return (
        <>
          <circle r={r} fill="var(--bg)" stroke={color} strokeWidth={sw} />
          {/* 3 blades */}
          <path
            d={`M 0 0 L ${r * 0.7} ${-r * 0.3} A ${r * 0.7} ${r * 0.7} 0 0 0 ${r * 0.0} ${-r * 0.7} Z`}
            fill={color}
            fillOpacity={0.5}
          />
          <path
            d={`M 0 0 L ${-r * 0.5} ${r * 0.55} A ${r * 0.7} ${r * 0.7} 0 0 0 ${r * 0.5} ${r * 0.55} Z`}
            fill={color}
            fillOpacity={0.5}
          />
          {/* Hub */}
          <circle r={r * 0.18} fill={color} />
          {/* Outlet arrow */}
          <line x1={r * 0.95} y1={0} x2={r * 1.5} y2={0} stroke={color} strokeWidth={2} markerEnd="url(#arrow-pump)" />
        </>
      );
    default:
      return <circle r={r} fill="var(--bg)" stroke={color} strokeWidth={sw} />;
  }
}

function SideBtn({ active, onClick, icon, label, color }: { active?: boolean; onClick: () => void; icon: string; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        margin: "0 6px",
        padding: "0.4rem 0",
        border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
        background: active ? "var(--accent-bg)" : "transparent",
        color: active ? "var(--accent)" : color ?? "var(--fg)",
        borderRadius: 6,
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        fontSize: 16,
      }}
    >
      <span>{icon}</span>
      <span style={{ fontSize: 9, color: active ? "var(--accent)" : "var(--fg-dim)" }}>{label.slice(0, 5)}</span>
    </button>
  );
}

const paletteBtn: CSSProperties = {
  padding: "0.5rem",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--fg)",
  borderRadius: 6,
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  minHeight: 56,
};

const topInput: CSSProperties = {
  padding: "0.3rem 0.4rem",
  fontSize: 11,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "var(--font-mono)",
};

const topBtn: CSSProperties = {
  padding: "0.3rem 0.5rem",
  fontSize: 13,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  cursor: "pointer",
  minWidth: 26,
};

const hintStyle: CSSProperties = {
  position: "absolute",
  top: 60,
  left: 80,
  zIndex: 5,
  background: "var(--accent-bg)",
  border: "1px solid var(--accent-dim)",
  color: "var(--accent)",
  padding: "0.4rem 0.75rem",
  borderRadius: 6,
  fontSize: 12,
};

function prettyName(kind: string, n: number): string {
  const def = getNodeKind(kind);
  if (!def) return `Node-${n}`;
  return `${def.shortLabel}-${n}`;
}

export type _Unused = ReactNode;
