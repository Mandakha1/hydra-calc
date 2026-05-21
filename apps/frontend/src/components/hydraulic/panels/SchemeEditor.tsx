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
import { DrawingHud } from "../scheme/DrawingHud";
import { formatLength } from "../scheme/dimensionFormat";
import {
  buildTagAsParams,
  TAG_AS_KIND_OPTIONS,
} from "../scheme/outlineTag";
import {
  computeSymbolRadiusPx,
  computePipeStrokeWidthPx,
  resolveEntityKind,
  MIN_SYMBOL_PX,
  SYMBOL_SIZE_PRESETS,
  SYMBOL_SIZE_PRESET_LABELS,
  DEFAULT_SYMBOL_SIZE_PRESET,
  steppedPreset,
} from "../scheme/symbolSize";
import {
  findEndpointSnap,
  snapPointToGridM,
  DEFAULT_SNAP,
} from "../scheme/snap";
import { renderSymbolFor } from "../scheme/symbols";
import { resolveLayer, layerKeyFor, resolveLayerByKey } from "../scheme/layers";
import { LayerPanel } from "../scheme/LayerPanel";
import {
  resolveDimensionEndpoints,
  computeDimensionLabel,
  dimensionGeometry,
  dimensionBoundingBox,
} from "../scheme/dimensions";
import {
  addDimension,
  removeDimension,
  selectDimension,
} from "../scheme/dimensionApplier";
import { strokeDasharrayForStyle } from "../scheme/constructionLines";
// Phase 12.5 — composite-channel render helpers + atomic build.
import {
  channelPipeCountBadge,
  buildChannelFromDraw,
  addPipeToChannel as addPipeToChannelHelper,
  removePipeFromChannel as removePipeFromChannelHelper,
} from "../scheme/channelOperations";
import {
  channelTypeLabel,
  CHANNEL_TYPE_REGISTRY,
  CIRCUIT_DEFAULTS,
  type ChannelTypeKey,
} from "../scheme/channelTypes";
// Phase 12.7 — engineer-facing per-channel label panel.
import {
  buildChannelLabel,
  isLabelVisible,
  labelDimensions,
} from "../scheme/channelLabelPanel";
// Phase 12.8 — engineering cross-reference numbers + flow arrows.
import { assignNodeNumbers, nodeNumberBadge } from "../scheme/nodeNumbering";
import {
  buildAllArrows,
  buildArrowFromDisplayedPolyline,
  isPipeFlowReversed,
} from "../scheme/flowArrows";
// Phase 13.1 — pipe endpoint clipping at building polygon perimeter.
import {
  findTaggedBuilding,
  clipPipeEndpointAtBuilding,
} from "../scheme/pipePolygonClip";
// Phase 12.5b — channel-create modal opened on second click.
import {
  ChannelCreateDialog,
  type ChannelCreatePayload,
} from "../dialogs/ChannelCreateDialog";
import {
  addConstructionLine,
  selectConstructionLine,
} from "../scheme/constructionLineApplier";
import {
  annotationBoundingBox,
  annotationLines,
  effectiveFontSize,
  LINE_HEIGHT_MULTIPLIER,
} from "../scheme/annotations";
import {
  addAnnotation,
  selectAnnotation,
} from "../scheme/annotationApplier";
import {
  addBuilding,
  selectBuilding,
  updateBuilding,
} from "../scheme/buildingApplier";
// Phase 13.3 — polygon vertex editing helpers.
import { setVertex, polygonBboxMetres } from "../scheme/polygonVertexEdit";
// Phase 13.5 — AutoCAD-style direct dimension input math.
import { polarOffsetPoint, parseDimensionInput } from "../scheme/polarOffset";
// Phase 13.7 — view-mode (top / bottom / iso) projection + extrusion.
import {
  type ViewMode,
  viewModeWrapperTransform,
  buildingHeightPx,
  isoWalls,
} from "../scheme/viewMode";
import { ScaleBar } from "../scheme/ScaleBar";
import {
  DEFAULT_SCALE,
  DEFAULT_PAPER_SIZE,
  DEFAULT_PAPER_ORIENTATION,
  paperDimensionsMm,
} from "../scheme/scales";
import { TitleBlock } from "../scheme/TitleBlock";
import { titleBlockDimensionsMm } from "../scheme/titleBlockMeta";
import { NorthArrow } from "../scheme/NorthArrow";
import {
  applyNorthArrowDefaults,
  clampNorthArrowPosition,
  NORTH_ARROW_CANVAS_MMTOPX,
} from "../scheme/northArrowMeta";
import { Toast } from "../scheme/Toast";
import { BatchOpsToolbar } from "../scheme/BatchOpsToolbar";
import { pushUndoSnapshot, undo as undoOp, redo as redoOp } from "../scheme/undoStack";
import { projectGeoToSchemeXY } from "../scheme/projection";
// Phase 13.14 — map-aware pipe geometry: lets live preview, bend math,
// commit length, and saved-pipe rendering all route geo-stamped vertices
// through the same projector so the polyline tracks pan/zoom instead of
// snapping back to stale stored x/y.
import {
  displayVertex,
  displayPipePolyline,
  polylineLengthPx,
  type ProjectorCtx,
} from "../scheme/displayPipeGeometry";
// Phase 13.20 — visual offset for parallel multi-circuit pipes sharing
// the same endpoints. Engineer report: "Жижиг барилга дээр давхарлаж
// зурхад алдаа их гарч цэгүүд зөрж байна" — Т1+Т2+Т3+Т4+В1 were
// stacking on top of each other so only the topmost circuit was
// visible + the bend handles "drifted" because clicks grabbed
// whichever pipe rendered last at that pixel.
import {
  computeParallelOffsets,
  perpendicularUnit,
  DEFAULT_PARALLEL_SPACING_PX,
} from "../scheme/parallelPipeOffset";
// Phase 13.21 — engineer-facing pipe label (DN / L / Q / v / ΔP) and
// chamber-on-pipe split helpers.
import { buildPipeLabelLines } from "../scheme/pipeLabel";
import {
  splitPipeAtFraction,
  defaultChamberKindForCircuit,
} from "../scheme/splitPipe";
// Phase 13.24 — project right-click cursor onto pipe polyline so
// "place at cursor" menu actions split exactly where the engineer
// clicked rather than at the geometric midpoint.
import { projectPointOnPolyline } from "../scheme/projectPointOnPolyline";
// Phase 13.25 — magistral / branch classification.
import { classifyPipeRoles, pipeRoleBadge } from "../scheme/classifyPipeRoles";
// Phase 13.39 — bend deflection-angle labels on canvas.
import { bendDeflectionDeg, bendOutwardBisector } from "../scheme/bendPoints";
import { TEMP_SCHEDULES } from "shared";
import { SPEED_BANDS, PRESSURE_BANDS, colorForValue } from "../colorBands";
import type {
  SchemeNode,
  SchemePipe,
  SchemeAnnotation,
} from "../hydraulicTypes";

type Mode =
  | "select"
  | "addNode"
  | "addPipe"
  | "addChannel"
  | "drawBuilding"
  | "measure"
  | "pickBuilding"
  | "drawDimension"
  | "drawConstruction"
  | "drawAnnotation";
type AngleMode = "free" | "ortho90" | "ortho45";

interface Props {
  readOnly?: boolean;
}

/**
 * Phase 13.1 — kinds that should enter polygon-draw mode (AutoCAD-style)
 * when picked from the side palette, instead of single-click placement.
 *
 * Source + consumer categories carry physical extent (ТЭЦ defaults to
 * 80×50 m, АОС to 30×15 m, etc.) — drawing them as polygon outlines
 * gives engineers a true-to-scale plan view with any-angle vertices.
 * Wells / chambers / valves / sensors stay single-click (they have no
 * meaningful real-world footprint at typical drawing scales).
 *
 * Engineer-feedback driven: "Эх үүсвэр, олон хэрэглэгчийг яг үүн шиг
 * polygon-аар зурдаг болго" (turn building-like placement into an
 * AutoCAD-style polygon flow).
 */
function isBuildingLikeKind(kind: string): boolean {
  const def = getNodeKind(kind);
  if (!def) return false;
  return def.category === "source" || def.category === "consumer";
}

const GRID_M = 1; // 1 meter grid
const MAJOR_GRID_M = 5; // major every 5m
const RULER_PX = 24; // ruler thickness

export function SchemeEditor({ readOnly }: Props) {
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  // Phase 12.5 — composite underground channels (Л-4 / Л-7 / Л-9 per
  // ГК-23/02). Renders ONE thick gray polyline per channel that visually
  // replaces the contained pipes on the plan. Cross-section + label
  // panel are deferred to Phase 12.6 / 12.7. Defaulted to [] so legacy
  // projects without the `channels` array still render unchanged.
  const channels = useHydraulicStore((s) => s.channels);
  const selection = useHydraulicStore((s) => s.selection);
  const results = useHydraulicStore((s) => s.results);
  const violations = useHydraulicStore((s) => s.violations);
  const settings = useHydraulicStore((s) => s.settings);
  const addNode = useHydraulicStore((s) => s.addNode);
  const addPipe = useHydraulicStore((s) => s.addPipe);
  // Phase 12.5 — composite channel atomic insertion.
  const addChannel = useHydraulicStore((s) => s.addChannel);
  // Phase 12.5b — patch + cascade-remove for the right-click submenu.
  const updateChannel = useHydraulicStore((s) => s.updateChannel);
  const removeChannel = useHydraulicStore((s) => s.removeChannel);
  const updateNode = useHydraulicStore((s) => s.updateNode);
  const updatePipe = useHydraulicStore((s) => s.updatePipe);
  const removeNode = useHydraulicStore((s) => s.removeNode);
  const removePipe = useHydraulicStore((s) => s.removePipe);
  const updateSettings = useHydraulicStore((s) => s.updateSettings);
  const select = useHydraulicStore((s) => s.select);
  // Phase 6.5.1 — multi-selection actions
  const selectToggle = useHydraulicStore((s) => s.selectToggle);
  const selectExtend = useHydraulicStore((s) => s.selectExtend);
  const selectMany = useHydraulicStore((s) => s.selectMany);
  const clearSelection = useHydraulicStore((s) => s.clearSelection);
  const multiSelection = useHydraulicStore((s) => s.multiSelection);
  // Phase 6.6.1 — dimension entities
  const dimensions = useHydraulicStore((s) => s.dimensions);
  // Phase 6.6.2 — construction-line entities
  const constructionLines = useHydraulicStore((s) => s.constructionLines);
  // Phase 6.6.3 — annotation entities
  const annotations = useHydraulicStore((s) => s.annotations);
  // Phase 6.8.6 — reference-building entities
  const buildings = useHydraulicStore((s) => s.buildings);

  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [pendingKind, setPendingKind] = useState<string>("consumer_apartment");
  const [pendingCircuit, setPendingCircuit] = useState<PipeCircuit>("heating_supply");
  const [angleMode, setAngleMode] = useState<AngleMode>("ortho90");
  const [pipeFrom, setPipeFrom] = useState<string | null>(null);
  /**
   * Phase 13.8 — Zulu-style pipe drawing: bend points captured between
   * the first-node click and the final-node click. Engineer can drop
   * any number of intermediate corners by clicking empty canvas; the
   * pipe commits with `bendPoints: pipeBendPts` so the calc engine
   * treats the whole polyline as ONE pipe with bends (Phase 12.3
   * length_m authoritative invariant preserved). Clicking a second
   * node terminates the drawing and dispatches addPipe.
   */
  const [pipeBendPts, setPipeBendPts] = useState<Array<{ x: number; y: number; lat?: number; lon?: number }>>([]);

  /**
   * Phase 13.18 — engineer report: "Шугам зурахдаа давхар халаалтын
   * шугамын Өгөх буцах, ХХУ — Хэрэглээний халуун усны Өгөх буцах,
   * Хүйтэн усны шугамыг Mouse 2 дээрээс нэмэх тохиргоог оруулна уу."
   *
   * Heat-network engineers typically lay 2-5 pipes in a single trench
   * (Т1 + Т2 + Т3 + Т4 + В1) but had to draw each pipe individually,
   * five times along the same route. This Set holds the EXTRA circuits
   * to draw alongside `pendingCircuit` — when non-empty, every pipe
   * commit (node-click / building-click / Enter / double-click) creates
   * ONE SchemePipe per selected circuit, all sharing fromNodeId,
   * toNodeId, bendPoints, and length_m. Setting persists across draws
   * until the engineer toggles it off.
   *
   * Activated via right-click in addPipe mode → floating picker panel.
   */
  // Phase 13.47 — engineer report: "Халаалтын систем эь Өгөх болон
  // Буцах гэсэн 2 Шугамтай байдаг". Default `extraCircuits` to
  // include `heating_return` so every drawn heating pipe becomes a
  // supply+return pair (Т1 + Т2). The engineer can still uncheck
  // the return via the circuit picker if they want a single line.
  const [extraCircuits, setExtraCircuits] = useState<Set<PipeCircuit>>(
    () => new Set(["heating_return"]),
  );
  /** Phase 13.18 — circuit-picker popup position (cursor location). */
  const [circuitPickerAt, setCircuitPickerAt] = useState<{ x: number; y: number } | null>(null);

  // Phase 12.5 — first endpoint while drawing a composite channel.
  // Mirrors `pipeFrom` semantics: click first node → setChannelFrom,
  // click second node → buildChannelFromDraw + addChannel atomically.
  // For v1 the channel type defaults to Л-7 with the 4 standard
  // circuits (D2.1/D2.2/D3/D4); engineer adjusts via Inspector later.
  const [channelFrom, setChannelFrom] = useState<string | null>(null);
  // Phase 12.5b — pending channel-create payload captured between the
  // engineer's 2nd click and the modal's confirm. When non-null the
  // ChannelCreateDialog is open. On confirm we call addChannel; on
  // cancel we discard and return to select.
  const [pendingChannelCreate, setPendingChannelCreate] = useState<{
    fromNodeId: string;
    toNodeId: string;
    length_m: number;
  } | null>(null);
  /**
   * Phase 13.33 — engineer report: simplify the side palette to just
   * "Барилга зурах". The full 6-category palette (Эх үүсвэр /
   * Хэрэглэгч / etc.) collapses behind a "▾ Дэлгэрэнгүй" toggle so
   * power users + legacy tests still have access. Default = hidden
   * to match the engineer's mental model: building is the primary
   * entity; pipes attach to buildings; node kinds inferred from
   * the polygon the pipe endpoint lands inside.
   */
  const [showAdvancedPalette, setShowAdvancedPalette] = useState(false);

  /**
   * Phase 13.32 — engineer report: "J-10, J-4 гэх мэт энэ захын
   * цэгүүд чинь өөрөө хэрэглэгч шүү дээ. Шугамын эцсийн цэгүүд нь
   * Станц / УДДТ / Зуух / Орон сууц / Эмнэлэг / Сургууль / Цэцэрлэг
   * / Оффис гэх мэт ээр сонгож ачааллаа тооцдог байвал зөв."
   *
   * When an addPipe gesture auto-creates a fresh node at empty
   * canvas (Phase 13.12 first click / Phase 13.16 double-click
   * terminate / Phase 13.12 Enter terminate), we keep the node as
   * a "junction" stub then immediately surface a small floating
   * picker so the engineer assigns the real kind right there. They
   * can dismiss (leave as junction) or pick a source/consumer kind
   * — the picker patches the node with kind + label + heat-load
   * defaults from `nodeCatalog`.
   */
  const [pendingEndpointPicker, setPendingEndpointPicker] = useState<{
    nodeId: string;
    /** Where to anchor the popover (current scheme XY of the node). */
    x: number;
    y: number;
  } | null>(null);
  // Phase 13.22 Task 7 — branch-from-pipe prompt.
  // When the engineer clicks "🌿 Салбар шугам зурах" on a pipe, the
  // handler splits the pipe + inserts a tee + auto-enters addPipe mode.
  // This state remembers the tee id so AFTER the engineer commits the
  // branch pipe, we show a dialog asking whether to also add a chamber
  // / valve at the branch junction (engineer's explicit ask: "та худаг
  // болон хаалт салбар хэсэгт нэмэх үү гэж асуудаг болгоно уу").
  const [pendingBranchPrompt, setPendingBranchPrompt] = useState<{
    teeNodeId: string;
  } | null>(null);
  // Phase 12.8b — channel label-panel drag-to-reposition. Captures
  // the mouse-anchor + the channel's labelOffset at drag start; the
  // global mousemove updates labelOffset = startOffset + (mouse - start).
  // Mouseup writes the final offset via updateChannel + pushes a single
  // undo snapshot.
  const [channelLabelDrag, setChannelLabelDrag] = useState<{
    channelId: string;
    startMouse: Point;
    startOffset: { dx: number; dy: number };
  } | null>(null);
  const [polygon, setPolygon] = useState<Point[]>([]); // polyline being drawn
  const [pendingFootprint, setPendingFootprint] = useState<Point[] | null>(null);
  const [showPalette, setShowPalette] = useState<NodeCategory | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<{ nodeId: string; offX: number; offY: number } | null>(null);
  // Phase 13.2 — building polygon drag handle. Engineer mousedowns on
  // any vertex of a tagged building (Phase 12.4 outline + tag-as
  // workflow) and drags the WHOLE polygon (+ its taggedAsNodeId
  // companion node) to a new position. Captures the start mouse pt +
  // the starting polygon vertices + tagged node pos, then onMouseMove
  // patches every vertex / the node by the same translation delta.
  // Mouseup commits with ONE pushUndoSnapshot so Ctrl+Z reverts the
  // whole drag in a single step.
  const [buildingDrag, setBuildingDrag] = useState<{
    buildingId: string;
    startMouse: Point;
    startPolygon: Array<{ x: number; y: number; lat?: number; lon?: number }>;
    /** Tagged node (when present) — moves alongside the polygon so the
     *  centroid label + pipe endpoints stay in sync. */
    taggedNodeId?: string;
    startNodePos?: { x: number; y: number };
  } | null>(null);
  /** Phase 13.3 — per-vertex polygon edit. When a building is
   *  selected, small square handles render at each vertex. Engineer
   *  mousedowns one → drags → drop reshapes the polygon. Inspector's
   *  width_m / height_m auto-update from the new bbox on commit. */
  const [polygonVertexDrag, setPolygonVertexDrag] = useState<{
    buildingId: string;
    vertexIndex: number;
  } | null>(null);
  /**
   * Phase 13.5 — AutoCAD-style direct-distance input. While a draw is
   * in progress (drawBuilding with ≥1 vertex OR addPipe with a `from`
   * node), engineer types LENGTH (м) + ANGLE (°) into a floating
   * panel and Enter commits the next vertex / pipe endpoint at the
   * polar offset. Stored as strings so partial input ("1." / "") is
   * tolerated without resetting to NaN.
   */
  const [dimensionInputLen, setDimensionInputLen] = useState<string>("");
  const [dimensionInputAng, setDimensionInputAng] = useState<string>("0");
  /** Which input field is focused: "length" (default after first
   *  vertex) or "angle". Tab swaps. */
  const [dimensionInputFocus, setDimensionInputFocus] = useState<"length" | "angle">("length");
  const [mousePos, setMousePos] = useState<Point | null>(null);
  /** Phase 12.2 — viewport-space cursor position (clientX / clientY)
   *  for the floating DrawingHud overlay, which positions itself in
   *  fixed-coords (not scheme-space). */
  const [mouseViewport, setMouseViewport] = useState<{ x: number; y: number } | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [snapGrid, setSnapGrid] = useState(true);
  /**
   * Phase 13.3 — sub-meter snap mode. When true, polygon / pipe / node
   * vertex placement snaps to a 0.1 m grid instead of the default 1 m
   * grid. Engineer toggles via the top toolbar when they need
   * precision dimensions (1.5 m / 2.5 m / 3.1 m, etc.) for narrow
   * service rooms, equipment bays, or odd-shaped real-world buildings.
   */
  const [fineSnap, setFineSnap] = useState(false);
  // Phase 13.6 — map ON by default. Engineers reported they almost
  // always want the OSM background underneath their drawings (per-
  // node geo-anchoring + real-scale building math both depend on the
  // map being visible). The 🗺 toggle button remains for engineers
  // who want pure-schematic mode (PDF prints / overview snapshots).
  const [showMap, setShowMap] = useState(true);
  /**
   * Phase 13.7 — AutoCAD-style view mode:
   *   "top"    — 2D plan (default; engineer looks straight down).
   *   "bottom" — 2D plan flipped 180° (paper-drawing parity).
   *   "iso"    — 60° AutoCAD isometric tilt; buildings extrude
   *              upward by their floors × 3 m / buildingHeight_m.
   */
  const [viewMode, setViewMode] = useState<ViewMode>("top");
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
  /** Алдааны pulsation — Phase 13.37 inженерийн санал: "Тооцоо
   * хийсний дараа шугам томорч жижгэрдэг новшийн effect ээ
   * болиул". Default false — violated шугам/node-ууд улаан
   * өнгөөрөө л харагдана, анимац байхгүй. Хэрэв инженер pulsation
   * хүсвэл дээд талын ⚠ товч дарж асаана. */
  const [animateErrors, setAnimateErrors] = useState(false);
  /** Leaflet map ref — used to convert lat/lon ↔ container px. */
  const leafletMapRef = useRef<L.Map | null>(null);
  /** Bumped on map move/zoom to force a render so geo-anchored nodes reposition. */
  const [mapTick, setMapTick] = useState(0);
  /** Right-click context menu — shown next to a target element.
   *  Phase 12.4 — target.kind extended to include "building" so the
   *  outline-first workflow can wire engineer's right-click → tag-as. */
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: { kind: "node" | "pipe" | "building"; id: string };
    /** Phase 13.24 — scheme-space cursor coords for pipe right-clicks.
     *  Lets "place at cursor" actions (chamber / valve / compensator /
     *  branch tee) split the pipe AT the click position instead of at
     *  the geometric midpoint. Null for node / building targets where
     *  the click position is irrelevant. */
    svgPt?: { x: number; y: number };
  } | null>(null);
  /** Pipe waypoint drag state — index identifies which middle point is being moved. */
  const [waypointDrag, setWaypointDrag] = useState<{ pipeId: string; index: number } | null>(null);
  /** Phase 12.3 — bend-point drag handle. Engineer-clicked bend point
   *  follows cursor until mouseup. Separate from waypointDrag because
   *  bendPoints uses the new richer field with lat/lon support. */
  const [bendPointDrag, setBendPointDrag] = useState<{ pipeId: string; index: number } | null>(null);
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
  /** Phase 6.5.1 — Rubber-band drag state. Records SVG-space start
   *  point (so it survives pan/zoom) + the moving end point. When
   *  defined, the canvas renders a translucent rectangle. On
   *  mouseup we hit-test all nodes/pipes and populate multiSelection. */
  const [rubberBand, setRubberBand] = useState<{
    startSvg: Point;
    endSvg: Point;
  } | null>(null);
  /** Phase 6.5.2 — ephemeral toast message + key (key forces re-mount
   *  so consecutive identical messages still trigger the animation). */
  const [toast, setToast] = useState<{ text: string; key: number; tone?: "neutral" | "success" } | null>(null);
  /** Phase 6.6.1 — dimension drawing state. After click 1 on a node,
   *  we lock the first anchor. The next click (also requires node
   *  endpoint snap) locks the second anchor and commits the dimension.
   *  Cursor-following preview line shown via mousePos. */
  const [pendingDimAnchor, setPendingDimAnchor] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  /** Phase 6.6.2 — construction-line drawing state. Free-coord
   *  (no node anchor) — first click sets the start point in scheme
   *  pixel space, second click anywhere commits the line. Esc
   *  cancels in-flight.
   *
   *  Phase 6.8.2: anchor also carries an optional geo lat/lon
   *  captured at first-click time. When the engineer pans/zooms the
   *  map between clicks, the preview line + final committed
   *  `geoFrom` track the original click in world space (rather than
   *  drifting with the map). */
  const [pendingConstructionAnchor, setPendingConstructionAnchor] = useState<{
    x: number;
    y: number;
    geo?: { lat: number; lon: number };
  } | null>(null);
  /** Phase 6.7.1 — viewport dimensions for placing fixed-position
   *  widgets (ScaleBar bottom-left, future Title Block, etc.) outside
   *  the pan/zoom transform. Tracked via ResizeObserver in an effect
   *  below so it stays in sync with window resize / sidebar toggle. */
  const [svgViewport, setSvgViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  /** Phase 6.7.3 — north-arrow drag state. Records the click anchor
   *  in viewport coords + the arrow's starting position so mousemove
   *  can compute the new position. */
  const [northArrowDrag, setNorthArrowDrag] = useState<{
    startMouse: { x: number; y: number };
    startArrow: { x: number; y: number };
  } | null>(null);
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

  /**
   * Phase 13.7 — sync the leaflet map container's CSS transform with
   * the engineer-selected viewMode. The SVG canvas applies the same
   * transform via its inline style; the map needs a JS-driven side-
   * effect because Leaflet doesn't know about React. Both elements
   * tilt together so engineer sees a coherent 3D scene in Iso mode.
   *
   * Caveat: Leaflet's pan / click coordinate math doesn't account
   * for CSS 3D transforms — edit gestures in Iso/Bottom are
   * unreliable. Engineers should flip back to Top to edit. This is
   * a viewing-only feature, matching AutoCAD's Top/Bottom/Iso UX.
   */
  useEffect(() => {
    const leafletEl = document.querySelector(".leaflet-container");
    if (!(leafletEl instanceof HTMLElement)) return;
    const css = viewModeWrapperTransform(viewMode);
    leafletEl.style.transform = css === "none" ? "" : css;
    leafletEl.style.transformOrigin = "center center";
    leafletEl.style.transition = "transform 350ms ease-out";
  }, [viewMode, showMap]);

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

  /** Phase 6.7.1 — Track SVG viewport dimensions so we can pin the
   *  ScaleBar (and future TitleBlock / NorthArrow widgets) at a fixed
   *  bottom-left position outside the pan/zoom transform group. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const update = () => {
      const r = svg.getBoundingClientRect();
      setSvgViewport({ width: r.width, height: r.height });
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);
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
   *  the map. Phase 6.8.2 dropped the old "mapAnchored" opt-in toggle — now
   *  every canvas click while the map is on captures geo, so the entity
   *  always tracks pan/zoom from the moment it's drawn. Legacy nodes
   *  without .geo (placed before the map was opened) keep their plain x/y.
   *
   *  Phase 6.8.2: math extracted to `scheme/projection.ts` so annotations
   *  + construction-line endpoints can use the same projection (see
   *  `displayPosAnnotation` and `displayPosConstructionEndpoint` below). */
  const displayPos = useCallback((n: SchemeNode): Point => {
    if (!showMap || !n.geo) return { x: n.x, y: n.y };
    const projected = projectGeoToSchemeXY(
      n.geo,
      leafletMapRef.current,
      svgRef.current,
      RULER_PX,
      zoom,
      pan,
    );
    return projected ?? { x: n.x, y: n.y };
    // mapTick is intentionally referenced via the dep array as a render
    // trigger — the math reads svg/map refs lazily, not from React state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, pan, zoom, mapTick]);

  /** Phase 6.8.2 — annotation display helper. Mirrors `displayPos` for
   *  the new `SchemeAnnotation.geo` field so drafting text follows the
   *  map view alongside nodes/pipes. Legacy annotations without geo
   *  (drawn before Phase 6.8.2 or before the map was visible) fall
   *  back to their stored pixel anchor. */
  const displayPosAnnotation = useCallback((a: SchemeAnnotation): Point => {
    if (!showMap || !a.geo) return { x: a.x, y: a.y };
    const projected = projectGeoToSchemeXY(
      a.geo,
      leafletMapRef.current,
      svgRef.current,
      RULER_PX,
      zoom,
      pan,
    );
    return projected ?? { x: a.x, y: a.y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, pan, zoom, mapTick]);

  /** Phase 6.8.2 — construction-line endpoint display helper. Construction
   *  lines have two free endpoints (`from`, `to`) each with its own
   *  optional geo anchor (`geoFrom`, `geoTo`). The renderer calls this
   *  twice per line — once per endpoint — and feeds the two display
   *  points into the line geometry. Fallback to pixel coords when geo
   *  is missing keeps Phase 6.6.2 legacy lines rendering exactly as
   *  before. */
  const displayPosConstructionEndpoint = useCallback((
    point: { x: number; y: number },
    geo: { lat: number; lon: number } | undefined,
  ): Point => {
    if (!showMap || !geo) return { x: point.x, y: point.y };
    const projected = projectGeoToSchemeXY(
      geo,
      leafletMapRef.current,
      svgRef.current,
      RULER_PX,
      zoom,
      pan,
    );
    return projected ?? { x: point.x, y: point.y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMap, pan, zoom, mapTick]);

  /** Phase 13.14 — projector context for `displayVertex` /
   *  `displayPipePolyline`. Closes over the live leaflet ref, the SVG
   *  ref, and the current pan/zoom so geo-stamped bends + nodes always
   *  render at the engineer's intended geographic position regardless
   *  of how many times the map has been panned/zoomed since the click.
   *
   *  `mapTick` in deps forces re-creation on every leaflet 'move' / 'zoom'
   *  event so React re-renders the live preview + saved pipes with
   *  refreshed projections. (`displayPos` uses the same trick.) */
  const projectorCtx = useMemo<ProjectorCtx>(
    () => ({
      showMap,
      projectGeo: (geo) =>
        projectGeoToSchemeXY(
          geo,
          leafletMapRef.current,
          svgRef.current,
          RULER_PX,
          zoom,
          pan,
        ),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showMap, pan, zoom, mapTick],
  );

  const snap = useCallback(
    (p: Point): Point => {
      if (!snapGrid) return p;
      // Phase 13.3 — fine-snap mode uses a 0.1 m grid (= GRID_PX / 10)
      // so engineer can place vertices at 1.5 m / 2.5 m / 3.1 m / 3.6 m
      // for real-world buildings whose dimensions aren't whole metres.
      const step = fineSnap ? GRID_PX / 10 : GRID_PX;
      return {
        x: Math.round(p.x / step) * step,
        y: Math.round(p.y / step) * step,
      };
    },
    [snapGrid, GRID_PX, fineSnap],
  );

  const constrain = useCallback(
    (from: Point, to: Point): Point => {
      if (angleMode === "free") return to;
      return constrainToAngle(from, to, angleMode === "ortho90" ? 90 : 45);
    },
    [angleMode],
  );

  /**
   * Place a new node at a canvas point (already snapped). Phase 6.8.2:
   * captures geo lat/lon automatically whenever the map is visible (no
   * opt-in toggle). Explicit `opts.geo` from the map-click path still wins.
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
    const geo = opts?.geo ?? (showMap ? svgToLatLon(pt) : null);
    // Phase 13.34 — strip width_m / height_m / floors from the
    // kind defaults so the node renders as a small symbol, NOT a
    // huge BuildingPlanShape rectangle. Engineer report: tag шинж
    // дүрс барилгаасаа том. The building polygon (when drawn) is
    // the engineer's intended visual outline; a duplicate rectangle
    // from the node clutters the canvas. Heat load + pressure
    // defaults are preserved.
    const { width_m: _wm, height_m: _hm, floors: _fl, ...defaultsNoDims } =
      kindDef?.defaults ?? {};
    void _wm;
    void _hm;
    void _fl;
    addNode({
      id,
      kind: pendingKind,
      label: prettyName(pendingKind, nodes.length + 1),
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      ...(geo ? { geo: { lat: geo.lat, lon: geo.lon } } : {}),
      ...defaultsNoDims,
    });
    select({ kind: "node", id });
    setShowPalette(null);
    // Reference the new-module grid helper so dead-code elimination
    // keeps it tree-shaken in for downstream callers (6D will use it).
    void snapPointToGridM;
  }, [readOnly, pendingKind, showMap, svgToLatLon, addNode, nodes, select, settings.snapEndpoint, displayPos]);

  /**
   * Phase 13.18 — multi-circuit pipe commit.
   *
   * When the engineer has toggled extra circuits via the Mouse-2
   * picker (`extraCircuits`), a single commit gesture creates ONE
   * SchemePipe per selected circuit (Т1 / Т2 / Т3 / Т4 / В1) — all
   * sharing fromNodeId, toNodeId, bendPoints, length_m, materialKey,
   * dn. When `extraCircuits` is empty, behaves identically to a
   * single `addPipe({circuit: pendingCircuit, …})` call (legacy path).
   *
   * Reduces 5 manual draws → 1 along a shared trench, which matches
   * Mongolian heat-network design reality (Т1 + Т2 supply/return,
   * optionally Т3 + Т4 DHW, optionally В1 cold).
   */
  const commitPipeWithCircuits = useCallback(
    (args: {
      fromNodeId: string;
      toNodeId: string;
      length_m: number;
      bendPoints?: ReadonlyArray<{ x: number; y: number; lat?: number; lon?: number }>;
      materialKey?: string;
      dn?: number;
    }): number => {
      const circuits: PipeCircuit[] = [pendingCircuit];
      for (const c of extraCircuits) {
        if (c !== pendingCircuit) circuits.push(c);
      }
      const len_m = Math.max(0.5, Math.round(args.length_m * 10) / 10);
      const hasBends = args.bendPoints && args.bendPoints.length > 0;
      for (const circuit of circuits) {
        addPipe({
          id: uid("pipe"),
          fromNodeId: args.fromNodeId,
          toNodeId: args.toNodeId,
          materialKey: args.materialKey ?? "steel_aged",
          dn: args.dn ?? 50,
          length_m: len_m,
          circuit,
          ...(hasBends ? { bendPoints: args.bendPoints!.map((bp) => ({ ...bp })) } : {}),
        });
      }
      return circuits.length;
    },
    [addPipe, pendingCircuit, extraCircuits],
  );

  /**
   * Phase 6.8.6 — commit a polygon drawn via the `drawBuilding` mode
   * directly as a SchemeBuilding entity (bypassing the legacy
   * BuildingDialog → consumer-node path).
   *
   * Why bypass the dialog: engineers reported that drawing a quick
   * outline on the map shouldn't force them through an envelope /
   * load-calc form — they want the polygon on the canvas first,
   * then fill metadata via the Inspector at their own pace (or
   * leave it blank for pure-reference outlines).
   *
   * Geo is preserved per-vertex (each `polygon[i]` may carry
   * `{lat, lon}` from `onMapNativeClick`), so the new building
   * tracks the leaflet map view on pan/zoom via the Phase 6.8.2
   * mechanism. Pixel coords stay the source of truth + canvas-only
   * fallback when no map is visible.
   *
   * BuildingDialog is still wired and used by `pickBuildingFromOsm`
   * — that path benefits from the dialog's rich envelope-based
   * heat-load inputs because OSM tags hint at building type.
   */
  const commitDrawnBuilding = useCallback((
    vertices: Array<{ x: number; y: number; lat?: number; lon?: number }>,
  ) => {
    if (readOnly) return;
    if (vertices.length < 3) return;
    const cur = useHydraulicStore.getState();
    const buildingsCount = (cur.buildings ?? []).length;
    const id = uid("bld");
    const cleanedPolygon = vertices.map((v) => ({
      x: Math.round(v.x),
      y: Math.round(v.y),
      ...(typeof v.lat === "number" ? { lat: v.lat } : {}),
      ...(typeof v.lon === "number" ? { lon: v.lon } : {}),
    }));

    // Phase 13.1 — when the engineer entered drawBuilding from a
    // source/consumer palette pick (isBuildingLikeKind(pendingKind)),
    // auto-tag the building with that kind and create the linked
    // SchemeNode at the polygon centroid. This mirrors the Phase 12.4
    // right-click "Энэ юу вэ?" workflow but happens immediately at
    // commit time, giving the engineer an AutoCAD-style "select kind →
    // draw outline → done" placement gesture for buildings.
    const buildingLikeKind = isBuildingLikeKind(pendingKind) ? pendingKind : null;
    if (buildingLikeKind) {
      const draft = {
        id,
        polygon: cleanedPolygon,
        label: `Барилга-${buildingsCount + 1}`,
        layerKey: "D" as const,
      };
      const { node, buildingPatch } = buildTagAsParams(
        draft,
        buildingLikeKind,
        cur.nodes,
      );
      // Also dimension-tag the new node so InspectorPanel's Phase 13.0b
      // width_m / height_m fields show realistic defaults (polygon
      // bounding-box converted to metres via PX_PER_METER).
      const bx = bbox(cleanedPolygon.map((p) => ({ x: p.x, y: p.y })));
      const width_m = (bx.maxX - bx.minX) / PX_PER_METER;
      const height_m = (bx.maxY - bx.minY) / PX_PER_METER;
      // Phase 13.10 — stamp the tagged node with `geo` derived from
      // the polygon's centroid in lat/lon space. Engineer report:
      // "Барилгын зураг газрын зургыг дагаж хөдөлж байгаа ч үүсгэсэн
      // автомат tag нь тусдаа салж хөдөлж байна." Root cause:
      // buildTagAsParams returns a node with x/y only; without `geo`
      // the node renderer doesn't project via leaflet on map moves,
      // so polygon (per-vertex geo) and node centroid drift apart.
      // We derive lat/lon by averaging the polygon vertices' lat/lon
      // (already stamped at click time per Phase 13.5c) — that
      // matches the polygon centroid exactly on each map redraw.
      let nodeGeo: { lat: number; lon: number } | undefined;
      if (showMap) {
        const vertsWithGeo = cleanedPolygon.filter(
          (v): v is typeof v & { lat: number; lon: number } =>
            typeof v.lat === "number" && typeof v.lon === "number",
        );
        if (vertsWithGeo.length > 0) {
          const lat = vertsWithGeo.reduce((s, v) => s + v.lat, 0) / vertsWithGeo.length;
          const lon = vertsWithGeo.reduce((s, v) => s + v.lon, 0) / vertsWithGeo.length;
          nodeGeo = { lat, lon };
        } else {
          // Fallback — project the node's x/y back via the current
          // leaflet view. Less precise (depends on current map zoom)
          // but works when polygon vertices weren't geo-stamped.
          const ll = svgToLatLon({ x: node.x, y: node.y });
          if (ll) nodeGeo = ll;
        }
      }
      pushUndoSnapshot("Барилга + tag-as", 2);
      addBuilding({ ...draft, ...buildingPatch });
      addNode({
        ...node,
        ...(width_m > 0 ? { width_m } : {}),
        ...(height_m > 0 ? { height_m } : {}),
        ...(nodeGeo ? { geo: nodeGeo } : {}),
      });
      select({ kind: "node", id: node.id });
      setPolygon([]);
      setMode("select");
      // Phase 13.1 — clear pendingKind back to a neutral default so
      // the engineer's next "single-click placement" gesture (junction,
      // valve, etc.) doesn't accidentally trigger another polygon draw.
      setPendingKind("consumer_apartment");
      setToast({
        text: `${node.label} — барилга + tag үүсгэв`,
        key: Date.now(),
        tone: "success",
      });
      return;
    }

    addBuilding({
      id,
      polygon: cleanedPolygon,
      label: `Барилга-${buildingsCount + 1}`,
      layerKey: "D",
    });
    selectBuilding(id);
    setPolygon([]);
    setMode("select");
    setToast({
      text: "Барилгын зураг үүсгэв",
      key: Date.now(),
      tone: "success",
    });
  }, [readOnly, pendingKind, addBuilding, addNode, select]);

  /**
   * Phase 6.8.7 — Quick-fill "standard apartment" building template.
   *
   * Drops a 5-storey 20×30 m polygon at the engineer's current
   * viewport centre, fully filled with defaults (label "Барилга-N",
   * floors=5, building_type="apartment"). When the map is visible,
   * each vertex carries lat/lon so the new building tracks the map
   * view via the Phase 6.8.2 mechanism. The new building is
   * auto-selected so the Inspector opens immediately for fine-
   * tuning floors / heat-load / colour.
   *
   * Engineering rationale: drawing the same 4-vertex rectangle
   * over and over for each АОС on a plan is a recurring time-sink.
   * One click puts a known starting shape on the canvas; the
   * engineer drags vertices / edits metadata to suit.
   */
  /**
   * Phase 13.5 — commit the engineer-typed (length, angle) as the
   * NEXT vertex / pipe endpoint relative to the current anchor.
   *
   * Active anchor resolution:
   *   - drawBuilding mode → last polygon vertex (polygon[length-1])
   *   - addPipe mode      → the `from` node's display position
   *
   * On success the inputs reset (length cleared so the engineer can
   * type the next segment immediately; angle preserved as a
   * "polar tracking" default — common AutoCAD habit). On invalid
   * input the panel emits a toast and stays focused.
   */
  const commitDimensionInput = useCallback(() => {
    if (readOnly) return;
    const parsed = parseDimensionInput(dimensionInputLen, dimensionInputAng);
    if (!parsed) {
      setToast({
        text: "Урт нь >0 м, өнцөг тоо байх ёстой",
        key: Date.now(),
        tone: "neutral",
      });
      return;
    }
    let from: Point | null = null;
    if (mode === "drawBuilding" && polygon.length > 0) {
      from = polygon[polygon.length - 1]!;
    } else if (mode === "addPipe" && pipeFrom) {
      const fromNode = nodes.find((n) => n.id === pipeFrom);
      if (fromNode) from = { x: fromNode.x, y: fromNode.y };
    }
    if (!from) {
      setToast({
        text: "Зурах горимд эх цэг алга — эхлээд эх цэг сонгоно уу",
        key: Date.now(),
        tone: "neutral",
      });
      return;
    }
    // Phase 13.5b — REAL-SCALE fix. When the map is visible, the
    // engineer expects 5 m typed to mean 5 m on the underlying map
    // (e.g. OSM at zoom 18 ≈ 5.6 px/м at УБ latitude). The
    // schematic-mode PX_PER_METER (20 px/м) is wrong on the map.
    // Use mapPxPerMeter when available, divided by `zoom` so the
    // SVG group's scale(zoom) transform doesn't double-apply.
    const effectivePxPerMeter =
      showMap && mapPxPerMeter && mapPxPerMeter > 0
        ? mapPxPerMeter / Math.max(zoom, 0.05)
        : PX_PER_METER;
    const next = polarOffsetPoint(from, parsed.length_m, parsed.angle_deg, effectivePxPerMeter);
    if (mode === "drawBuilding") {
      // Push the next polygon vertex. If we hit ≥3 vertices the
      // existing Enter / click-on-first-vertex closing flow takes
      // over from here.
      const withGeo = showMap
        ? { ...next, ...(svgToLatLon(next) ?? {}) }
        : next;
      setPolygon((cur) => [...cur, withGeo]);
    } else if (mode === "addPipe" && pipeFrom) {
      // Create a destination node at the polar-offset point, then
      // draw the pipe to it. Length on the pipe = engineer-typed
      // length_m (so the typed value lands in length_m directly,
      // not the px-derived approximation).
      const nodeId = uid("dim");
      const geo = showMap ? svgToLatLon(next) ?? undefined : undefined;
      addNode({
        id: nodeId,
        kind: "junction",
        label: `J-${nodes.length + 1}`,
        x: Math.round(next.x),
        y: Math.round(next.y),
        ...(geo ? { geo } : {}),
      });
      // Phase 13.18 — polar-offset commit also honours multi-circuit.
      commitPipeWithCircuits({
        fromNodeId: pipeFrom,
        toNodeId: nodeId,
        length_m: parsed.length_m,
      });
      setPipeFrom(nodeId); // chain — engineer can keep typing
    }
    // Reset length but KEEP angle (engineers iterate same direction).
    setDimensionInputLen("");
    setDimensionInputFocus("length");
  }, [
    readOnly,
    dimensionInputLen,
    dimensionInputAng,
    mode,
    polygon,
    pipeFrom,
    nodes,
    showMap,
    svgToLatLon,
    addNode,
    commitPipeWithCircuits,
    // Phase 13.5b — real-scale fix deps.
    mapPxPerMeter,
    zoom,
  ]);

  const placeBuildingTemplate = useCallback(() => {
    if (readOnly) return;
    // Viewport centre → scheme coords. Falls back to (0, 0) when
    // svgViewport is still 0 (very rare — only on first mount).
    const cx = svgViewport.width > 0
      ? (svgViewport.width / 2 - RULER_PX) / zoom - pan.x
      : 0;
    const cy = svgViewport.height > 0
      ? (svgViewport.height / 2 - RULER_PX) / zoom - pan.y
      : 0;
    // 20 m × 30 m at PX_PER_METER (20 px/m schematic-mode fallback,
    // which is also a reasonable default building footprint scale
    // when the map IS on — the polygon can be dragged to true scale
    // afterwards). Half-extents: 200 × 300 px.
    const halfW = 200;
    const halfH = 300;
    const corners: Array<Point> = [
      { x: Math.round(cx - halfW), y: Math.round(cy - halfH) },
      { x: Math.round(cx + halfW), y: Math.round(cy - halfH) },
      { x: Math.round(cx + halfW), y: Math.round(cy + halfH) },
      { x: Math.round(cx - halfW), y: Math.round(cy + halfH) },
    ];
    // Stamp geo onto each vertex when the map is visible so the
    // template tracks pan/zoom like a drawn polygon.
    const vertices = corners.map((c) => {
      const ll = showMap ? svgToLatLon(c) : null;
      return ll ? { ...c, lat: ll.lat, lon: ll.lon } : c;
    });
    const cur = useHydraulicStore.getState();
    const buildingsCount = (cur.buildings ?? []).length;
    const id = uid("bld");
    addBuilding({
      id,
      polygon: vertices,
      label: `Барилга-${buildingsCount + 1}`,
      floors: 5,
      building_type: "apartment",
      layerKey: "D",
    });
    selectBuilding(id);
    setToast({
      text: "Темплейт барилга үүсгэв",
      key: Date.now(),
      tone: "success",
    });
  }, [readOnly, svgViewport.width, svgViewport.height, zoom, pan, showMap, svgToLatLon]);

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
        // Phase 6.8.6 — commit DIRECTLY as a SchemeBuilding instead of
        // opening the legacy BuildingDialog. The polygon already carries
        // per-vertex {lat, lon}, so the geo-anchoring follows seamlessly.
        commitDrawnBuilding(polygon as Array<Point & { lat?: number; lon?: number }>);
        return;
      }
      const nextPoint: Point = polygon.length > 0
        ? snap(constrain(polygon[polygon.length - 1]!, svgPt))
        : svgPt;
      // Stamp geo onto the vertex (polygon state holds {x,y,lat?,lon?}).
      setPolygon([...polygon, { ...nextPoint, lat, lon } as Point & { lat?: number; lon?: number }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, mode, pan, zoom, placeNodeAt, snap, polygon, constrain, commitDrawnBuilding]);

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
      const inferredKind = (() => {
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
      // Phase 13.11 — when the engineer already picked a building-like
      // kind from the palette (Phase 13.1 polygon flow OR clicked OSM
      // 🏘 directly), route the fetched OSM footprint to the new
      // Phase 13.1 SchemeBuilding + tag-as workflow instead of the
      // legacy BuildingDialog. Engineer report: "Газрын зураг дээрх
      // барилга дээр давхарлаж зурах үед яг цэвэр хүрээг нь дагаж
      // зурагдахгүй байна." Manual polygon snap can't match OSM
      // building corners pixel-perfect — OSM tracing draws the
      // building's exact outline AND tags it with the engineer's
      // chosen kind in one click.
      const tagAsKind = isBuildingLikeKind(pendingKind) ? pendingKind : inferredKind;
      if (tagAsKind) {
        const buildingId = uid("bld");
        const buildingsCount = (useHydraulicStore.getState().buildings ?? []).length;
        const draft = {
          id: buildingId,
          polygon: footprint,
          label: name && name.length > 0 ? name : `Барилга-${buildingsCount + 1}`,
          layerKey: "D" as const,
        };
        const { node, buildingPatch } = buildTagAsParams(
          draft,
          tagAsKind,
          useHydraulicStore.getState().nodes,
        );
        // Width / height from polygon bbox so InspectorPanel + render
        // (Phase 13.0b) show realistic dims immediately.
        const bx = bbox(footprint.map((p) => ({ x: p.x, y: p.y })));
        const width_m = (bx.maxX - bx.minX) / PX_PER_METER;
        const height_m = (bx.maxY - bx.minY) / PX_PER_METER;
        pushUndoSnapshot("OSM-аас барилга + tag-as", 2);
        addBuilding({ ...draft, ...buildingPatch });
        addNode({
          ...node,
          ...(width_m > 0 ? { width_m } : {}),
          ...(height_m > 0 ? { height_m } : {}),
          // Phase 13.10 — stamp geo so the centroid icon tracks the
          // map alongside the polygon. OSM polygon vertices all
          // carry exact lat/lon; centroid is the average.
          geo: centroid,
          // Floors auto-fill from OSM tag when available — saves the
          // engineer a manual edit in Inspector.
          ...(levels && levels > 0 ? { floors: levels } : {}),
        });
        select({ kind: "node", id: node.id });
        setMode("select");
        setToast({
          text: `${node.label} — OSM-аас татаж тэмдэглэв (${Math.round(areaM2)} м²)`,
          key: Date.now(),
          tone: "success",
        });
        return;
      }
      // Legacy BuildingDialog path — kept for engineers who entered
      // OSM mode without picking a kind first.
      setPendingFootprint(footprint);
      setOsmPickPreset({
        kind: inferredKind,
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
      // Phase 13.18 — close the multi-circuit picker on any canvas
      // click. ESC also closes, but engineers usually transition by
      // dropping a vertex right after picking circuits.
      if (circuitPickerAt) setCircuitPickerAt(null);
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
      } else if (mode === "addPipe" && !pipeFrom) {
        // Phase 13.12 — Zulu-style pipe drawing extension:
        // engineer report "Шугам хоолойг барилгагүй хоосон хэсэгт
        // ч зурж болно." Empty-canvas FIRST click in addPipe mode
        // now drops a junction node at the click point AND sets it
        // as the pipe's `from` endpoint.
        // Phase 13.32 — also raise a kind-picker so the engineer
        // immediately assigns the real endpoint kind (Станц / УДДТ
        // / Зуух / Орон сууц / Эмнэлэг / Сургууль / Цэцэрлэг /
        // Оффис) instead of leaving J-N stubs as "junction".
        const id = uid("j");
        const llStart = showMap ? svgToLatLon(pt) : null;
        addNode({
          id,
          kind: "junction",
          label: `J-${nodes.length + 1}`,
          x: Math.round(pt.x),
          y: Math.round(pt.y),
          ...(llStart ? { geo: { lat: llStart.lat, lon: llStart.lon } } : {}),
        });
        setPipeFrom(id);
        setPipeBendPts([]);
        setPendingEndpointPicker({
          nodeId: id,
          x: Math.round(pt.x),
          y: Math.round(pt.y),
        });
      } else if (mode === "addPipe" && pipeFrom) {
        // Phase 13.8 — Zulu-style mid-pipe bend points. Empty-canvas
        // clicks between the from-node and the to-node accumulate
        // as `pipeBendPts` and become the pipe's bendPoints[] on
        // commit. Engineer draws an arbitrary polyline; calc still
        // treats it as ONE pipe with `length_m` authoritative
        // (Phase 12.3 invariant). Constrain to the previous anchor
        // so engineer can also engage angleMode "ortho90" if they
        // want crisp 90° corners along the way.
        // Phase 13.14 — when the map is on, anchor must come from
        // displayPos (geo-projected) NOT stored x/y, else the bend's
        // constrain math snaps to "where the from-node USED to be"
        // before the most recent pan/zoom. Bends already get a lat/lon
        // stamp below so future renders track the map.
        const prevAnchor = pipeBendPts.length > 0
          ? displayVertex(pipeBendPts[pipeBendPts.length - 1]!, projectorCtx)
          : (() => {
              const fromNode = nodes.find((n) => n.id === pipeFrom);
              return fromNode ? displayPos(fromNode) : pt;
            })();
        const constrained = snap(constrain(prevAnchor, pt));
        const llBend = showMap ? svgToLatLon(constrained) : null;
        const bend = llBend
          ? { ...constrained, lat: llBend.lat, lon: llBend.lon }
          : constrained;
        setPipeBendPts([...pipeBendPts, bend]);
      } else if (mode === "drawBuilding") {
        // Polygon drawing — add vertex; close if click on first vertex
        if (polygon.length >= 3 && nearPoint(pt, polygon[0]!, 12)) {
          // Phase 6.8.6 — commit DIRECTLY as a SchemeBuilding (no
          // dialog). Phase 13.5c — when the map is visible, vertices
          // below ALSO carry lat/lon so the polygon tracks the map
          // through pan/zoom (previously only the leaflet-onMapClick
          // path stamped geo; canvas-overlay clicks did not, leaving
          // polygons stuck in scheme-pixel space when the map moved).
          commitDrawnBuilding(polygon as Array<Point & { lat?: number; lon?: number }>);
          return;
        }
        let nextPoint = pt;
        if (polygon.length > 0) {
          nextPoint = snap(constrain(polygon[polygon.length - 1]!, pt));
        }
        // Phase 13.5c — engineer report: "Сургуулийн барилгыг газрын
        // зураг дээр зурсанч цуг хөдлөхгүй, scale zoom хийгдэхгүй
        // байна." Root cause: canvas-overlay click handler dropped
        // the lat/lon stamp. Fix: when showMap is on, project the
        // snap'd point back to lat/lon via svgToLatLon so every
        // polygon vertex carries geo. Polygon render then projects
        // via leaflet on every mapTick → real-scale tracking works.
        const llCanvas = showMap ? svgToLatLon(nextPoint) : null;
        const stampedNextPoint = llCanvas
          ? { ...nextPoint, lat: llCanvas.lat, lon: llCanvas.lon }
          : nextPoint;
        setPolygon([
          ...polygon,
          stampedNextPoint as Point & { lat?: number; lon?: number },
        ]);
      } else if (mode === "drawDimension") {
        // Phase 6.6.1 — empty-canvas click in drawDimension mode is a
        // no-op (dimensions require node endpoint snap). Toast hints.
        setToast({
          text: "Хэмжээс зурахын тулд эхний цэг дээр (node) click хий",
          key: Date.now(),
          tone: "neutral",
        });
      } else if (mode === "drawAnnotation") {
        // Phase 6.6.3 — single-click flow: prompt for text, then drop
        // the annotation at the snapped click point. Returning to
        // "select" mode after a commit matches the dimension flow.
        // Empty input cancels (engineer can also press Esc inside the
        // prompt).
        // eslint-disable-next-line no-alert
        const text = typeof window !== "undefined" ? window.prompt("Тэмдэглэгээний текст:") : null;
        const trimmed = (text ?? "").trim();
        if (trimmed.length > 0) {
          // Phase 6.8.2 — stamp geo lat/lon when the map is visible
          // so the annotation follows pan/zoom (same pattern as
          // placeNodeAt). Legacy non-map projects continue to drop
          // the field and render off plain x/y.
          const geo = showMap ? svgToLatLon(pt) : null;
          addAnnotation({
            id: uid("note"),
            x: pt.x,
            y: pt.y,
            text: trimmed,
            layerKey: "D",
            ...(geo ? { geo: { lat: geo.lat, lon: geo.lon } } : {}),
          });
          setMode("select");
          setToast({
            text: "Тэмдэглэгээ үүсгэв",
            key: Date.now(),
            tone: "success",
          });
        } else {
          setToast({
            text: "Тэмдэглэгээ цуцлав",
            key: Date.now(),
            tone: "neutral",
          });
        }
      } else if (mode === "drawConstruction") {
        // Phase 6.6.2 — free-placement (no node anchor required).
        // First click sets start; second click commits the line.
        // Phase 6.8.2 — both clicks capture geo when the map is
        // visible so each endpoint tracks the map independently
        // (so an engineer can pan/zoom freely between the two
        // clicks without the anchor "drifting").
        if (!pendingConstructionAnchor) {
          const anchorGeo = showMap ? svgToLatLon(pt) : null;
          setPendingConstructionAnchor({
            x: pt.x,
            y: pt.y,
            ...(anchorGeo ? { geo: { lat: anchorGeo.lat, lon: anchorGeo.lon } } : {}),
          });
          setToast({
            text: "Эхний цэг тогтлоо. Дараагийн цэг рүү дарж туслах шугам үүсгэнэ.",
            key: Date.now(),
            tone: "neutral",
          });
        } else if (
          Math.abs(pendingConstructionAnchor.x - pt.x) > 0.5 ||
          Math.abs(pendingConstructionAnchor.y - pt.y) > 0.5
        ) {
          // Different point → commit. The orthogonal-constraint helper
          // is applied for consistency with measure/polygon flows so
          // 90°/45° snap respects the engineer's setting.
          const endPt = snap(constrain(pendingConstructionAnchor, pt));
          const endGeo = showMap ? svgToLatLon(endPt) : null;
          addConstructionLine({
            id: uid("cl"),
            from: { x: pendingConstructionAnchor.x, y: pendingConstructionAnchor.y },
            to: { x: endPt.x, y: endPt.y },
            layerKey: "C",
            style: "dashed",
            ...(pendingConstructionAnchor.geo
              ? { geoFrom: pendingConstructionAnchor.geo }
              : {}),
            ...(endGeo ? { geoTo: { lat: endGeo.lat, lon: endGeo.lon } } : {}),
          });
          setPendingConstructionAnchor(null);
          setMode("select");
          setToast({
            text: "Туслах шугам үүсгэв",
            key: Date.now(),
            tone: "success",
          });
        }
      } else if (mode === "select") {
        select(null);
      }
    },
    // pickBuildingFromOsm + svgToLatLon are useCallback values that depend on
    // [pan, zoom] — omitting them caused stale closures: after the user pans
    // the canvas, pickBuilding clicks would resolve to the OLD viewport's
    // lat/lon (wrong OSM building fetched). Adding them as deps fixes that.
    // Phase 13.14 — pipeFrom / pipeBendPts / nodes / addNode / displayPos /
    // projectorCtx added so the addPipe branches (empty-canvas first click
    // + bend point clicks) see fresh state instead of the captured-on-mount
    // versions. This fixes "хоосон газар... хоолой зурахад ажиллахгүй".
    [
      mode,
      toSvg,
      snap,
      select,
      readOnly,
      polygon,
      constrain,
      placeNodeAt,
      pickBuildingFromOsm,
      svgToLatLon,
      pendingConstructionAnchor,
      showMap,
      commitDrawnBuilding,
      pipeFrom,
      pipeBendPts,
      nodes,
      addNode,
      displayPos,
      circuitPickerAt,
      projectorCtx,
    ],
  );

  const onCanvasDoubleClick = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (mode === "drawBuilding" && polygon.length >= 3) {
        e.preventDefault();
        // Phase 6.8.6 — direct-commit SchemeBuilding (no dialog).
        commitDrawnBuilding(polygon as Array<Point & { lat?: number; lon?: number }>);
        return;
      }
      // Phase 13.16 — engineer report: "Шугамыг барилгагүй газарт
      // зурхад хадгалагдахгүй байна." Root cause: in addPipe mode,
      // empty-space single clicks add bend points (Phase 13.8) but
      // nothing committed the pipe — engineer expected the click to
      // also END the pipe (the hint text used to promise this).
      // Fix: empty-canvas DOUBLE-CLICK terminates the pipe at the
      // click point. Auto-creates a terminal junction (with geo when
      // the map is on) and commits via addPipe. The two preceding
      // single clicks of the dblclick gesture already added two bend
      // points at the same coords — we drop the LAST bend and use
      // its position as the terminal, mirroring the Enter handler.
      if (mode === "addPipe" && pipeFrom) {
        const fromNode = nodes.find((n) => n.id === pipeFrom);
        if (!fromNode) return;
        e.preventDefault();
        const lastBend = pipeBendPts.length > 0
          ? pipeBendPts[pipeBendPts.length - 1]!
          : null;
        const clickPt = snap(toSvg(e));
        const termPt: { x: number; y: number; lat?: number; lon?: number } = lastBend
          ? {
              x: lastBend.x,
              y: lastBend.y,
              ...(typeof lastBend.lat === "number" ? { lat: lastBend.lat } : {}),
              ...(typeof lastBend.lon === "number" ? { lon: lastBend.lon } : {}),
            }
          : (() => {
              const ll = showMap ? svgToLatLon(clickPt) : null;
              return ll
                ? { x: clickPt.x, y: clickPt.y, lat: ll.lat, lon: ll.lon }
                : { x: clickPt.x, y: clickPt.y };
            })();
        const carryBends = pipeBendPts.length > 0
          ? pipeBendPts.slice(0, -1)
          : [];
        const toId = uid("j");
        addNode({
          id: toId,
          kind: "junction",
          label: `J-${nodes.length + 1}`,
          x: Math.round(termPt.x),
          y: Math.round(termPt.y),
          ...(typeof termPt.lat === "number" && typeof termPt.lon === "number"
            ? { geo: { lat: termPt.lat, lon: termPt.lon } }
            : {}),
        });
        // Polyline length via the map-aware geometry helper so on-map
        // pipes record correct length_m even after pan/zoom.
        const polyline = displayPipePolyline(
          fromNode,
          carryBends,
          { x: termPt.x, y: termPt.y, ...(termPt.lat != null ? { lat: termPt.lat, lon: termPt.lon } : {}) },
          projectorCtx,
        );
        const measuredLen = pxToM(polylineLengthPx(polyline));
        const manualLen = parseFloat(pipeLengthInput);
        const length_m = Number.isFinite(manualLen) && manualLen > 0 ? manualLen : measuredLen;
        const nPipes = commitPipeWithCircuits({
          fromNodeId: pipeFrom,
          toNodeId: toId,
          length_m,
          bendPoints: carryBends,
        });
        setPipeFrom(null);
        setPipeBendPts([]);
        setPipeLengthInput("");
        setMode("select");
        // Phase 13.32 — also prompt for the terminal endpoint kind
        // so the engineer assigns Орон сууц / Эмнэлэг / Оффис / etc.
        // rather than leaving the auto-created J-N as plain junction.
        setPendingEndpointPicker({
          nodeId: toId,
          x: Math.round(termPt.x),
          y: Math.round(termPt.y),
        });
        setToast({
          text: nPipes > 1
            ? `${nPipes} шугам үүсгэв — эцсийн цэгийн төрлөө сонгоно уу`
            : "Шугам үүсгэв — эцсийн цэгийн төрлөө сонгоно уу",
          key: Date.now(),
          tone: "success",
        });
      }
    },
    [
      mode,
      polygon,
      commitDrawnBuilding,
      pipeFrom,
      pipeBendPts,
      nodes,
      addNode,
      snap,
      toSvg,
      svgToLatLon,
      showMap,
      pipeLengthInput,
      projectorCtx,
      commitPipeWithCircuits,
    ],
  );

  const onNodeMouseDown = useCallback(
    (e: MouseEvent, node: SchemeNode) => {
      e.stopPropagation();
      if (readOnly) {
        select({ kind: "node", id: node.id });
        return;
      }
      // Phase 6.6.1 — dimension drawing two-click flow.
      // First node click → lock fromNodeId; second click on a
      // different node → commit dimension and auto-return to select.
      if (mode === "drawDimension") {
        if (!pendingDimAnchor) {
          setPendingDimAnchor({ nodeId: node.id, x: node.x, y: node.y });
          setToast({
            text: "Эхний цэг сонгогдсон. Хоёрдугаар node-руу click хий.",
            key: Date.now(),
            tone: "neutral",
          });
        } else if (pendingDimAnchor.nodeId !== node.id) {
          // Commit.
          addDimension({
            id: uid("dim"),
            fromNodeId: pendingDimAnchor.nodeId,
            toNodeId: node.id,
            offset_px: 30,
            layerKey: "D",
            fromNode_cached_xy: { x: pendingDimAnchor.x, y: pendingDimAnchor.y },
            toNode_cached_xy: { x: node.x, y: node.y },
          });
          setPendingDimAnchor(null);
          setMode("select");
          setToast({
            text: "Хэмжээс үүсгэв",
            key: Date.now(),
            tone: "success",
          });
        }
        return;
      }
      // Phase 6.6.2 — construction-line drawing: treat a node click
      // as a "snap to vertex" so engineers can lay out alignment
      // lines starting from existing nodes. No anchor relationship
      // is recorded — the construction line just stores the (x,y).
      if (mode === "drawConstruction") {
        const nodePt = { x: node.x, y: node.y };
        // Phase 6.8.2 — when the construction line snaps to an
        // existing node, inherit the node's geo (if any) so the
        // endpoint keeps tracking the node's real-world position
        // even if the engineer moves the node afterwards or the
        // map pans. Falls back to a fresh svgToLatLon for un-geo
        // nodes on a visible map.
        const nodeGeo = node.geo ?? (showMap ? svgToLatLon(nodePt) : null);
        if (!pendingConstructionAnchor) {
          setPendingConstructionAnchor({
            x: nodePt.x,
            y: nodePt.y,
            ...(nodeGeo ? { geo: { lat: nodeGeo.lat, lon: nodeGeo.lon } } : {}),
          });
          setToast({
            text: "Эхний цэг тогтлоо. Дараагийн цэг рүү дарж туслах шугам үүсгэнэ.",
            key: Date.now(),
            tone: "neutral",
          });
        } else if (
          Math.abs(pendingConstructionAnchor.x - nodePt.x) > 0.5 ||
          Math.abs(pendingConstructionAnchor.y - nodePt.y) > 0.5
        ) {
          addConstructionLine({
            id: uid("cl"),
            from: { x: pendingConstructionAnchor.x, y: pendingConstructionAnchor.y },
            to: nodePt,
            layerKey: "C",
            style: "dashed",
            ...(pendingConstructionAnchor.geo
              ? { geoFrom: pendingConstructionAnchor.geo }
              : {}),
            ...(nodeGeo ? { geoTo: { lat: nodeGeo.lat, lon: nodeGeo.lon } } : {}),
          });
          setPendingConstructionAnchor(null);
          setMode("select");
          setToast({
            text: "Туслах шугам үүсгэв",
            key: Date.now(),
            tone: "success",
          });
        }
        return;
      }
      if (mode === "addPipe") {
        if (!pipeFrom) {
          setPipeFrom(node.id);
          setPipeBendPts([]);
        } else if (pipeFrom !== node.id) {
          const from = nodes.find((n) => n.id === pipeFrom);
          // Phase 13.8 — pipe length sums the FULL polyline:
          // from-node → bend[0] → bend[1] → … → to-node. Engineer's
          // intermediate bend clicks add to the real-world distance.
          // Manual length override still wins when the engineer
          // typed a value into the pipeLengthInput field.
          // Phase 13.14 — geometry math routes every vertex through
          // `displayVertex` so on-map drawings measure the polyline at
          // the current pan/zoom (stored x/y is stale once the map has
          // moved). polylineLengthPx then sums the displayed segments;
          // pxToM converts to engineer-facing metres.
          const manualLen = parseFloat(pipeLengthInput);
          let measuredLen = 0;
          if (from) {
            const polyline = displayPipePolyline(from, pipeBendPts, node, projectorCtx);
            measuredLen = pxToM(polylineLengthPx(polyline));
          }
          const length_m = Number.isFinite(manualLen) && manualLen > 0 ? manualLen : measuredLen;
          // Phase 13.18 — multi-circuit: when extraCircuits is non-
          // empty, this single commit creates one SchemePipe per
          // selected circuit (Т1/Т2/Т3/Т4/В1). Phase 13.8 invariant
          // preserved: calc engine reads length_m as authoritative.
          const nPipes = commitPipeWithCircuits({
            fromNodeId: pipeFrom,
            toNodeId: node.id,
            length_m,
            bendPoints: pipeBendPts,
          });
          setPipeFrom(null);
          setPipeBendPts([]);
          setPipeLengthInput("");
          setMode("select");
          if (nPipes > 1) {
            setToast({
              text: `${nPipes} шугам үүсгэв (Т1 + Т2 + …)`,
              key: Date.now(),
              tone: "success",
            });
          }
        }
      } else if (mode === "addChannel") {
        // Phase 12.5 — two-click channel placement. Phase 12.5b
        // upgrades the 2nd click: instead of immediately building the
        // channel with hardcoded Л-7 defaults, we open the
        // ChannelCreateDialog so the engineer picks type + circuits
        // + DN. The Inspector / right-click submenu still lets them
        // tweak the channel after creation.
        if (!channelFrom) {
          setChannelFrom(node.id);
        } else if (channelFrom !== node.id) {
          const from = nodes.find((n) => n.id === channelFrom);
          const measuredLen = from
            ? pxToM(Math.hypot(from.x - node.x, from.y - node.y))
            : 0;
          const length_m = Math.max(0.5, Math.round(measuredLen * 10) / 10);
          setPendingChannelCreate({
            fromNodeId: channelFrom,
            toNodeId: node.id,
            length_m,
          });
          // Leave addChannel mode now — the modal owns the flow.
          // setChannelFrom remains as visual cue until modal closes;
          // cleared by the modal's onConfirm / onCancel handlers below.
        }
      } else {
        // Phase 6.5.1 — modifier-click semantics:
        //   - Ctrl/Cmd+click → toggle in multi-selection (no drag)
        //   - Shift+click    → extend multi-selection (no drag)
        //   - Plain click    → single-select + start drag (legacy)
        if (e.ctrlKey || e.metaKey) {
          selectToggle({ kind: "node", id: node.id });
          return;
        }
        if (e.shiftKey) {
          selectExtend({ kind: "node", id: node.id });
          return;
        }
        select({ kind: "node", id: node.id });
        const pt = toSvg(e);
        setDrag({ nodeId: node.id, offX: pt.x - node.x, offY: pt.y - node.y });
      }
    },
    // pipeLengthInput is read at line 522 (manual length override). Without
    // it in deps, the closure captures the value at the time the user clicked
    // the FROM node — if they then typed in the L field BEFORE clicking the TO
    // node, the typed length was silently ignored. This was a real bug.
    // Phase 13.14 — pipeBendPts + projectorCtx added so the polyline length
    // sum sees every captured bend and the current projector (map-aware).
    // Phase 13.18 — commitPipeWithCircuits picks up extraCircuits state.
    [
      mode,
      pipeFrom,
      pipeBendPts,
      // Phase 12.5 — channel draw deps.
      channelFrom,
      addChannel,
      nodes,
      commitPipeWithCircuits,
      toSvg,
      select,
      selectToggle,
      selectExtend,
      readOnly,
      pipeLengthInput,
      pendingDimAnchor,
      pendingConstructionAnchor,
      showMap,
      svgToLatLon,
      projectorCtx,
    ],
  );

  const onPipeClick = useCallback(
    (e: MouseEvent, pipe: SchemePipe) => {
      e.stopPropagation();
      // Phase 6.5.1 — modifier-click on pipes mirrors node behavior.
      if (e.ctrlKey || e.metaKey) {
        selectToggle({ kind: "pipe", id: pipe.id });
        return;
      }
      if (e.shiftKey) {
        selectExtend({ kind: "pipe", id: pipe.id });
        return;
      }
      select({ kind: "pipe", id: pipe.id });
    },
    [select, selectToggle, selectExtend],
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

  /** Right-click on a node / pipe / building — open context menu.
   *  Phase 12.4 — extended to support building target for tag-as.
   *  Phase 13.24 — for pipe targets, capture the cursor's scheme-space
   *  coords so "place at cursor" menu actions can split the pipe AT
   *  the click position instead of the geometric midpoint. */
  const onContextMenuTarget = useCallback(
    (e: MouseEvent, target: { kind: "node" | "pipe" | "building"; id: string }) => {
      if (readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      // select() only accepts node/pipe/... not building directly in
      // some legacy paths — use selectBuilding for buildings.
      if (target.kind === "building") {
        selectBuilding(target.id);
      } else {
        select(target);
      }
      const svgPt = target.kind === "pipe" ? toSvg(e) : undefined;
      setContextMenu({ x: e.clientX, y: e.clientY, target, ...(svgPt ? { svgPt } : {}) });
    },
    [readOnly, select, selectBuilding, toSvg],
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
      // Phase 12.2 — also track raw viewport-pixel cursor for the
      // DrawingHud floating overlay.
      setMouseViewport({ x: e.clientX, y: e.clientY });
      // Phase 6.7.3 — north-arrow drag. Position is in VIEWPORT
      // coords (the arrow lives outside the pan/zoom group) so we
      // don't pass through `toSvg`. Clamp so the marker can't be
      // dragged off-screen.
      if (northArrowDrag && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const mouseVx = e.clientX - rect.left;
        const mouseVy = e.clientY - rect.top;
        const dx = mouseVx - northArrowDrag.startMouse.x;
        const dy = mouseVy - northArrowDrag.startMouse.y;
        const clamped = clampNorthArrowPosition(
          northArrowDrag.startArrow.x + dx,
          northArrowDrag.startArrow.y + dy,
          svgViewport.width,
          svgViewport.height,
          NORTH_ARROW_CANVAS_MMTOPX,
        );
        updateSettings({
          northArrow: {
            ...(settings.northArrow ?? {}),
            x_px: Math.round(clamped.x_px),
            y_px: Math.round(clamped.y_px),
          },
        });
        return;
      }
      // Phase 6.5.1 — rubber-band drag: update the end point so the
      // visible rectangle follows the cursor live.
      if (rubberBand) {
        setRubberBand({ startSvg: rubberBand.startSvg, endSvg: pt });
        return;
      }
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
        // Phase 6.8.2 — always re-stamp geo when the map is visible, so a
        // node that already tracks the map keeps a fresh anchor after the
        // engineer drags it, and a legacy non-geo node picks up an anchor
        // as soon as it's moved on a visible map.
        if (showMap) {
          const ll = svgToLatLon(snapped);
          if (ll) patch.geo = { lat: ll.lat, lon: ll.lon };
        }
        updateNode(drag.nodeId, patch);
        // Phase 13.2 — when the dragged node is the tagged-as anchor
        // of a building, translate the building's polygon vertices by
        // the same delta so the outline + centroid stay in sync.
        const taggedBuilding = (buildings ?? []).find(
          (b) => b.taggedAsNodeId === drag.nodeId,
        );
        if (taggedBuilding) {
          const dx = patch.x! - (nodes.find((n) => n.id === drag.nodeId)?.x ?? patch.x!);
          const dy = patch.y! - (nodes.find((n) => n.id === drag.nodeId)?.y ?? patch.y!);
          if (dx !== 0 || dy !== 0) {
            const translated = taggedBuilding.polygon.map((v) => ({
              ...v,
              x: Math.round(v.x + dx),
              y: Math.round(v.y + dy),
              ...(showMap
                ? svgToLatLon({ x: v.x + dx, y: v.y + dy }) ?? {}
                : {}),
            }));
            updateBuilding(taggedBuilding.id, { polygon: translated });
          }
        }
      } else if (polygonVertexDrag) {
        // Phase 13.3 — drag a single building polygon vertex.
        // Snap respects fine-snap (0.1 m) when on. The new vertex
        // is committed live so the engineer sees the polygon morph
        // under the cursor; onMouseUp pushes ONE undo snapshot.
        const snapped = snap(pt);
        const building = (buildings ?? []).find(
          (b) => b.id === polygonVertexDrag.buildingId,
        );
        if (building) {
          const nextVertex = {
            x: Math.round(snapped.x * 10) / 10,
            y: Math.round(snapped.y * 10) / 10,
            ...(showMap ? svgToLatLon(snapped) ?? {} : {}),
          };
          const newPoly = setVertex(
            building.polygon,
            polygonVertexDrag.vertexIndex,
            nextVertex,
          );
          updateBuilding(building.id, { polygon: newPoly });
        }
      } else if (buildingDrag) {
        // Phase 13.2 — building polygon drag. Translate every vertex
        // by the cursor delta from the drag start; mirror the
        // translation onto the tagged-as node so its centroid label +
        // pipe endpoints follow. Geo re-stamped per vertex / node when
        // the map is visible so the building tracks pan/zoom after
        // the drag ends. No undo push here — onMouseUp does it once.
        const rawDx = pt.x - buildingDrag.startMouse.x;
        const rawDy = pt.y - buildingDrag.startMouse.y;
        // Snap the centroid translation to grid for tidy positioning.
        const snappedCentroid = snap({ x: rawDx, y: rawDy });
        const dx = Math.round(snappedCentroid.x);
        const dy = Math.round(snappedCentroid.y);
        const translated = buildingDrag.startPolygon.map((v) => {
          const nx = v.x + dx;
          const ny = v.y + dy;
          return {
            ...v,
            x: nx,
            y: ny,
            ...(showMap ? svgToLatLon({ x: nx, y: ny }) ?? {} : {}),
          };
        });
        updateBuilding(buildingDrag.buildingId, { polygon: translated });
        if (buildingDrag.taggedNodeId && buildingDrag.startNodePos) {
          const nx = buildingDrag.startNodePos.x + dx;
          const ny = buildingDrag.startNodePos.y + dy;
          const nodePatch: Partial<SchemeNode> = { x: nx, y: ny };
          if (showMap) {
            const ll = svgToLatLon({ x: nx, y: ny });
            if (ll) nodePatch.geo = ll;
          }
          updateNode(buildingDrag.taggedNodeId, nodePatch);
        }
      } else if (waypointDrag) {
        const snapped = snap(pt);
        const pipe = pipes.find((p) => p.id === waypointDrag.pipeId);
        if (pipe?.waypoints) {
          const newWaypoints = pipe.waypoints.map((wp, i) =>
            i === waypointDrag.index ? { x: Math.round(snapped.x), y: Math.round(snapped.y) } : wp,
          );
          updatePipe(waypointDrag.pipeId, { waypoints: newWaypoints });
        }
      } else if (bendPointDrag) {
        // Phase 12.3 — drag bend point handle
        const snapped = snap(pt);
        const pipe = pipes.find((p) => p.id === bendPointDrag.pipeId);
        if (pipe?.bendPoints) {
          const newBendPoints = pipe.bendPoints.map((bp, i) =>
            i === bendPointDrag.index
              ? {
                  x: Math.round(snapped.x),
                  y: Math.round(snapped.y),
                  // Preserve lat/lon if map is on and point has them
                  ...(showMap ? (svgToLatLon(snapped) ?? {}) : {}),
                }
              : bp,
          );
          updatePipe(bendPointDrag.pipeId, { bendPoints: newBendPoints });
        }
      } else if (channelLabelDrag) {
        // Phase 12.8b — drag channel label panel. New offset = start
        // + (current - start mouse). No snap; engineer wants free
        // positioning. The store push is a live updateChannel (no
        // snapshot per frame); the SNAPSHOT happens on mouseup below.
        const dx = pt.x - channelLabelDrag.startMouse.x;
        const dy = pt.y - channelLabelDrag.startMouse.y;
        updateChannel(channelLabelDrag.channelId, {
          labelOffset: {
            dx: channelLabelDrag.startOffset.dx + dx,
            dy: channelLabelDrag.startOffset.dy + dy,
          },
        });
      }
    },
    [
      drag,
      toSvg,
      updateNode,
      snap,
      showMap,
      svgToLatLon,
      waypointDrag,
      pipes,
      updatePipe,
      mapPanDrag,
      rubberBand,
      northArrowDrag,
      svgViewport,
      settings.northArrow,
      updateSettings,
      // Phase 12.8b — channel label drag deps.
      channelLabelDrag,
      updateChannel,
      // Phase 13.2 — building polygon drag deps.
      buildingDrag,
      buildings,
      // Phase 13.3 — per-vertex drag deps.
      polygonVertexDrag,
    ],
  );

  /** Mouse-down on the SVG. If user clicked empty canvas while map is shown,
   *  start a map-pan drag (we route this through Leaflet's panBy because the
   *  SVG sits on top and would normally swallow the drag). */
  const onCanvasMouseDown = useCallback((e: MouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    if (mode !== "select") return;
    const target = e.target as Element;
    const tag = target.tagName.toLowerCase();
    // Empty area = the SVG root or the background grid rect (which has no aria-label parent).
    const isEmpty = tag === "svg" || (tag === "rect" && !target.closest("g[aria-label]"));
    if (!isEmpty) return;
    // Phase 6.5.1 — empty-canvas drag routing:
    //   - Map visible + no Shift  → existing map-pan
    //   - Map visible + Shift     → rubber-band (override)
    //   - No map                  → rubber-band always
    const useRubberBand = !showMap || e.shiftKey;
    if (useRubberBand) {
      const svgPt = toSvg(e);
      setRubberBand({ startSvg: svgPt, endSvg: svgPt });
    } else if (showMap && leafletMapRef.current) {
      setMapPanDrag({ startX: e.clientX, startY: e.clientY });
    }
  }, [readOnly, showMap, mode, toSvg]);

  const onMouseUp = useCallback(() => {
    setDrag(null);
    setWaypointDrag(null);
    setBendPointDrag(null);
    setMapPanDrag(null);
    setNorthArrowDrag(null);
    // Phase 12.8b — finalize the channel-label drag. The labelOffset
    // was already being updated live in onMouseMove; here we just
    // push a single undo snapshot capturing the final state so Ctrl+Z
    // returns the label to its pre-drag position in one step.
    if (channelLabelDrag) {
      pushUndoSnapshot("Сувгийн тайлбар зөөгдсөн", 1);
      setChannelLabelDrag(null);
    }
    // Phase 13.2 — finalize the building polygon drag. The polygon +
    // tagged-node positions were updated live in onMouseMove; here we
    // push ONE undo snapshot so Ctrl+Z reverts the whole gesture, and
    // clear the drag state. Cheap no-op when no drag was in flight.
    if (buildingDrag) {
      pushUndoSnapshot("Барилгыг зөөсөн", 1);
      setBuildingDrag(null);
    }
    // Phase 13.3 — finalize the per-vertex polygon edit. Push ONE
    // undo snapshot + sync width_m / height_m on the tagged node so
    // Inspector / downstream calc reflect the new bbox dimensions.
    if (polygonVertexDrag) {
      pushUndoSnapshot("Барилгын оройг засав", 1);
      const cur = useHydraulicStore.getState();
      const b = (cur.buildings ?? []).find(
        (bb) => bb.id === polygonVertexDrag.buildingId,
      );
      if (b?.taggedAsNodeId) {
        const dims = polygonBboxMetres(b.polygon, PX_PER_METER);
        if (dims.width_m > 0 && dims.height_m > 0) {
          updateNode(b.taggedAsNodeId, {
            width_m: dims.width_m,
            height_m: dims.height_m,
          });
        }
      }
      setPolygonVertexDrag(null);
    }
    // Phase 6.5.1 — Resolve rubber-band on mouseup: hit-test all
    // visible nodes + pipes, populate multiSelection.
    if (rubberBand) {
      const minX = Math.min(rubberBand.startSvg.x, rubberBand.endSvg.x);
      const maxX = Math.max(rubberBand.startSvg.x, rubberBand.endSvg.x);
      const minY = Math.min(rubberBand.startSvg.y, rubberBand.endSvg.y);
      const maxY = Math.max(rubberBand.startSvg.y, rubberBand.endSvg.y);
      // Distinguish "tiny click" (< 4 px diag) from a real drag.
      // A click without drag is a deselect.
      const diag = Math.hypot(maxX - minX, maxY - minY);
      if (diag < 4) {
        clearSelection();
        setRubberBand(null);
        return;
      }
      // Node hit-test: node centre inside rect (using displayPos).
      const hitNodeIds: string[] = [];
      for (const n of nodes) {
        const dp = displayPos(n);
        if (dp.x >= minX && dp.x <= maxX && dp.y >= minY && dp.y <= maxY) {
          hitNodeIds.push(n.id);
        }
      }
      // Pipe hit-test: BOTH endpoints inside rect (rather than line-
      // intersection — engineering "lasso" semantics where the pipe
      // is selected when its connection is fully inside the box).
      const hitPipeIds: string[] = [];
      const nodeIdSet = new Set(hitNodeIds);
      for (const p of pipes) {
        if (nodeIdSet.has(p.fromNodeId) && nodeIdSet.has(p.toNodeId)) {
          hitPipeIds.push(p.id);
        }
      }
      // Phase 6.6.2 — construction-line hit-test: midpoint inside
      // rect (the engineering "lasso" semantics — a guide line is
      // selected when its centre is inside the box; partial-overlap
      // is not selection-worthy).
      const hitConstructionLineIds: string[] = [];
      for (const cl of constructionLines ?? []) {
        const mx = (cl.from.x + cl.to.x) / 2;
        const my = (cl.from.y + cl.to.y) / 2;
        if (mx >= minX && mx <= maxX && my >= minY && my <= maxY) {
          hitConstructionLineIds.push(cl.id);
        }
      }
      // Phase 6.6.3 — annotation hit-test: anchor inside rect.
      const hitAnnotationIds: string[] = [];
      for (const a of annotations ?? []) {
        if (a.x >= minX && a.x <= maxX && a.y >= minY && a.y <= maxY) {
          hitAnnotationIds.push(a.id);
        }
      }
      selectMany({
        nodeIds: hitNodeIds,
        pipeIds: hitPipeIds,
        constructionLineIds: hitConstructionLineIds,
        annotationIds: hitAnnotationIds,
      });
      setRubberBand(null);
    }
  }, [rubberBand, nodes, pipes, constructionLines, annotations, displayPos, selectMany, clearSelection, channelLabelDrag, buildingDrag, polygonVertexDrag]);

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
        // Phase 6.5.1 — Delete now removes ALL multi-selected objects
        // in one shot, not just the legacy single-target. Engineers
        // selecting 5 АОС-ы blocks and pressing Del expect all 5 gone.
        // Phase 6.6.1/6.6.2 — also includes dimensions + construction
        // lines in the multi-delete batch.
        const ms = useHydraulicStore.getState().multiSelection;
        const dimIdsSel = ms.dimensionIds ?? [];
        const clIdsSel = ms.constructionLineIds ?? [];
        const anIdsSel = ms.annotationIds ?? [];
        const bldIdsSel = ms.buildingIds ?? [];
        const totalSelected =
          ms.nodeIds.length
          + ms.pipeIds.length
          + dimIdsSel.length
          + clIdsSel.length
          + anIdsSel.length
          + bldIdsSel.length;
        const hasMulti = totalSelected > 1;
        if (hasMulti) {
          // Phase 6.5.5 — snapshot before cascade-delete so Ctrl+Z
          // restores all removed nodes + pipes + drafting aids +
          // buildings (Phase 6.8.6).
          pushUndoSnapshot("Бөгөмөөр устгасан", totalSelected);
          // Snapshot ids — removeNode cascades to pipes touching it
          // and would mutate ms mid-iteration.
          const pipeIds = [...ms.pipeIds];
          const nodeIds = [...ms.nodeIds];
          const dimIds = [...dimIdsSel];
          const clIds = [...clIdsSel];
          const annIds = [...anIdsSel];
          const bldIds = [...bldIdsSel];
          for (const pid of pipeIds) useHydraulicStore.getState().removePipe(pid);
          for (const nid of nodeIds) useHydraulicStore.getState().removeNode(nid);
          // Drafting aids + buildings — set-based delete inline so we
          // don't push N extra snapshots (the appliers each push one;
          // this batch already pushed its own).
          if (
            dimIds.length > 0
            || clIds.length > 0
            || annIds.length > 0
            || bldIds.length > 0
          ) {
            useHydraulicStore.setState((s) => ({
              dimensions: (s.dimensions ?? []).filter((d) => !dimIds.includes(d.id)),
              constructionLines: (s.constructionLines ?? []).filter((c) => !clIds.includes(c.id)),
              annotations: (s.annotations ?? []).filter((a) => !annIds.includes(a.id)),
              buildings: (s.buildings ?? []).filter((b) => !bldIds.includes(b.id)),
            }));
          }
          useHydraulicStore.getState().clearSelection();
          return;
        }
        if (!selection) return;
        // Phase 6.5.5 — single-target delete also snapshot-able.
        pushUndoSnapshot("Устгасан", 1);
        if (selection.kind === "node") useHydraulicStore.getState().removeNode(selection.id);
        else if (selection.kind === "pipe") useHydraulicStore.getState().removePipe(selection.id);
        else if (selection.kind === "dimension") {
          // Phase 6.6.1 — drop dimension inline (applier would push a
          // duplicate snapshot — we already pushed one above).
          useHydraulicStore.setState((s) => ({
            dimensions: (s.dimensions ?? []).filter((d) => d.id !== selection.id),
            selection: null,
            multiSelection: {
              nodeIds: s.multiSelection.nodeIds,
              pipeIds: s.multiSelection.pipeIds,
              dimensionIds: (s.multiSelection.dimensionIds ?? []).filter((x) => x !== selection.id),
              constructionLineIds: s.multiSelection.constructionLineIds ?? [],
              annotationIds: s.multiSelection.annotationIds ?? [],
              buildingIds: s.multiSelection.buildingIds ?? [],
            },
          }));
        } else if (selection.kind === "constructionLine") {
          // Phase 6.6.2 — same pattern for construction lines.
          useHydraulicStore.setState((s) => ({
            constructionLines: (s.constructionLines ?? []).filter((c) => c.id !== selection.id),
            selection: null,
            multiSelection: {
              nodeIds: s.multiSelection.nodeIds,
              pipeIds: s.multiSelection.pipeIds,
              dimensionIds: s.multiSelection.dimensionIds ?? [],
              constructionLineIds: (s.multiSelection.constructionLineIds ?? []).filter((x) => x !== selection.id),
              annotationIds: s.multiSelection.annotationIds ?? [],
              buildingIds: s.multiSelection.buildingIds ?? [],
            },
          }));
        } else if (selection.kind === "annotation") {
          // Phase 6.6.3 — same pattern for annotations.
          useHydraulicStore.setState((s) => ({
            annotations: (s.annotations ?? []).filter((a) => a.id !== selection.id),
            selection: null,
            multiSelection: {
              nodeIds: s.multiSelection.nodeIds,
              pipeIds: s.multiSelection.pipeIds,
              dimensionIds: s.multiSelection.dimensionIds ?? [],
              constructionLineIds: s.multiSelection.constructionLineIds ?? [],
              annotationIds: (s.multiSelection.annotationIds ?? []).filter((x) => x !== selection.id),
              buildingIds: s.multiSelection.buildingIds ?? [],
            },
          }));
        } else if (selection.kind === "building") {
          // Phase 6.8.6 — same pattern for reference buildings.
          useHydraulicStore.setState((s) => ({
            buildings: (s.buildings ?? []).filter((b) => b.id !== selection.id),
            selection: null,
            multiSelection: {
              nodeIds: s.multiSelection.nodeIds,
              pipeIds: s.multiSelection.pipeIds,
              dimensionIds: s.multiSelection.dimensionIds ?? [],
              constructionLineIds: s.multiSelection.constructionLineIds ?? [],
              annotationIds: s.multiSelection.annotationIds ?? [],
              buildingIds: (s.multiSelection.buildingIds ?? []).filter((x) => x !== selection.id),
            },
          }));
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        // Phase 6.5.5 — Ctrl+Z (no Shift): undo.
        e.preventDefault();
        const r = undoOp();
        if (r) {
          setToast({
            text: `Буцаалаа: ${r.label} (${r.affectedCount})`,
            key: Date.now(),
            tone: "neutral",
          });
        } else {
          setToast({
            text: "Буцаах түүх алга",
            key: Date.now(),
            tone: "neutral",
          });
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        ((e.key === "y" || e.key === "Y") ||
          (e.shiftKey && (e.key === "z" || e.key === "Z")))
      ) {
        // Phase 6.5.5 — Ctrl+Y or Ctrl+Shift+Z: redo.
        e.preventDefault();
        const r = redoOp();
        if (r) {
          setToast({
            text: `Дахин гүйцэтгэв: ${r.label} (${r.affectedCount})`,
            key: Date.now(),
            tone: "success",
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        // Phase 6.5.1 — Ctrl+A: select-all on the current network.
        e.preventDefault();
        useHydraulicStore.getState().selectMany({
          nodeIds: useHydraulicStore.getState().nodes.map((n) => n.id),
          pipeIds: useHydraulicStore.getState().pipes.map((p) => p.id),
        });
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
        // Phase 6.5.2 — Ctrl+C: copy multi-selection to clipboard.
        e.preventDefault();
        const r = useHydraulicStore.getState().copySelection();
        if (r) {
          setToast({
            text: `${r.nodes} цэг, ${r.pipes} хоолой clipboard-д хуулсан`,
            key: Date.now(),
            tone: "success",
          });
        } else {
          // Phase 6.8.1 BUG #5 fix — was silent before, leaving the
          // engineer wondering whether Ctrl+C even fired. Surface
          // the empty-selection case explicitly so the engineer
          // knows the handler ran but had nothing to copy.
          setToast({
            text: "Сонгогдсон зүйл алга — copy хийх боломжгүй",
            key: Date.now(),
            tone: "neutral",
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "x" || e.key === "X")) {
        // Phase 6.5.2 — Ctrl+X: cut (copy + delete in one step).
        e.preventDefault();
        const r = useHydraulicStore.getState().cutSelection();
        if (r) {
          setToast({
            text: `${r.nodes} цэг, ${r.pipes} хоолой устгасан, clipboard-д хадгалсан`,
            key: Date.now(),
            tone: "success",
          });
        } else {
          // Phase 6.8.1 BUG #5 fix — same as Ctrl+C above.
          setToast({
            text: "Сонгогдсон зүйл алга — cut хийх боломжгүй",
            key: Date.now(),
            tone: "neutral",
          });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
        // Phase 6.5.2 — Ctrl+V: paste with default +20m offset.
        e.preventDefault();
        const r = useHydraulicStore.getState().pasteClipboard();
        if (r) {
          setToast({
            text: `${r.nodes} цэг, ${r.pipes} хоолой буулгасан`,
            key: Date.now(),
            tone: "success",
          });
        } else {
          setToast({
            text: "Clipboard хоосон",
            key: Date.now(),
            tone: "neutral",
          });
        }
      } else if (e.key === "[" || e.key === "]") {
        // Phase 13.0 — keyboard shortcut to step through symbol-size
        // presets without opening SettingsPanel. `[` shrinks, `]`
        // grows. Saturates at xs / xl bounds. Engineer-feedback fix
        // for "АОС / Эх үүсвэрийн хэмжээ хэт том" — discoverable +
        // fast iteration. Toast feedback shows the new tier label.
        e.preventDefault();
        const direction: "decrease" | "increase" = e.key === "[" ? "decrease" : "increase";
        const next = steppedPreset(settings.symbolSizePreset, direction);
        if (next !== (settings.symbolSizePreset ?? DEFAULT_SYMBOL_SIZE_PRESET)) {
          updateSettings({ symbolSizePreset: next });
          setToast({
            text: `Тэмдэгийн хэмжээ: ${SYMBOL_SIZE_PRESET_LABELS[next]} (${Math.round(SYMBOL_SIZE_PRESETS[next] * 100)}%)`,
            key: Date.now(),
            tone: "success",
          });
        }
      } else if (e.key === "Escape") {
        // Phase 13.18 — Esc with picker open just closes the picker
        // (doesn't cancel the in-flight pipe draw). Second Esc cancels
        // the draw as before.
        if (circuitPickerAt) {
          setCircuitPickerAt(null);
          return;
        }
        setMode("select");
        setShowPalette(null);
        setPipeFrom(null);
        // Phase 13.8 — also drop any captured mid-pipe bend points
        // so a follow-up pipe draw starts with a clean slate.
        setPipeBendPts([]);
        // Phase 12.5 — cancel any in-flight channel draw.
        setChannelFrom(null);
        // Phase 12.5b — also dismiss the channel-create modal if open.
        setPendingChannelCreate(null);
        // Phase 13.22 Task 7 — Esc also dismisses the branch prompt
        // so the engineer who cancelled the branch doesn't see the
        // chamber/valve dialog afterwards.
        setPendingBranchPrompt(null);
        // Phase 13.32 — Esc dismisses the endpoint kind picker too;
        // the auto-created node stays as a junction.
        setPendingEndpointPicker(null);
        setPolygon([]);
        setPendingFootprint(null);
        setMeasurePoints([]);
        setContextMenu(null);
        // Phase 6.6.1 — cancel any in-flight dimension drawing.
        setPendingDimAnchor(null);
        // Phase 6.6.2 — cancel any in-flight construction-line drawing.
        setPendingConstructionAnchor(null);
        // Phase 6.5.1 — Esc also clears multi-selection.
        useHydraulicStore.getState().clearSelection();
      } else if (e.key === "Enter" && mode === "drawBuilding" && polygon.length >= 3) {
        // Phase 6.8.6 — direct-commit SchemeBuilding on Enter (no dialog).
        commitDrawnBuilding(polygon as Array<Point & { lat?: number; lon?: number }>);
      } else if (e.key === "Enter" && mode === "addPipe" && pipeFrom) {
        // Phase 13.12 — Enter terminates an in-flight pipe at the
        // last captured bend point (or the cursor position when
        // mousePos is known). Engineer no longer needs to click on
        // a node/building to end the pipe — they can finish it
        // anywhere on empty canvas. A junction node is auto-created
        // at the termination point.
        e.preventDefault();
        const termPt: Point | null = pipeBendPts.length > 0
          ? { x: pipeBendPts[pipeBendPts.length - 1]!.x, y: pipeBendPts[pipeBendPts.length - 1]!.y }
          : mousePos
            ? snap(mousePos)
            : null;
        if (!termPt) {
          setToast({
            text: "Эцсийн цэг тогтоохын тулд хоосон газар нэг удаа дарна уу",
            key: Date.now(),
            tone: "neutral",
          });
        } else {
          const fromNode = nodes.find((n) => n.id === pipeFrom);
          if (fromNode) {
            // The LAST bend (or cursor) becomes the to-node. If there
            // are >0 captured bends, the last one IS the terminal
            // junction (drop it from bendPoints[] so it's not a
            // duplicate vertex).
            const carryBends = pipeBendPts.length > 0 ? pipeBendPts.slice(0, -1) : [];
            const toId = uid("j");
            const llTerm = showMap ? svgToLatLon(termPt) : null;
            addNode({
              id: toId,
              kind: "junction",
              label: `J-${nodes.length + 1}`,
              x: Math.round(termPt.x),
              y: Math.round(termPt.y),
              ...(llTerm ? { geo: { lat: llTerm.lat, lon: llTerm.lon } } : {}),
            });
            // Polyline length sum (from → bends → term).
            // Phase 13.14 — routes through displayVertex so on-map drawings
            // measure across the CURRENT pan/zoom (not the from-node's
            // stored x/y from when it was originally placed). termPt is a
            // fresh click point so it's already in current scheme coords.
            const polyline = displayPipePolyline(
              fromNode,
              carryBends,
              { x: termPt.x, y: termPt.y },
              projectorCtx,
            );
            const measuredLen = pxToM(polylineLengthPx(polyline));
            const manualLen = parseFloat(pipeLengthInput);
            const length_m = Number.isFinite(manualLen) && manualLen > 0 ? manualLen : measuredLen;
            // Phase 13.18 — Enter-terminate also honours multi-circuit.
            const nPipes = commitPipeWithCircuits({
              fromNodeId: pipeFrom,
              toNodeId: toId,
              length_m,
              bendPoints: carryBends,
            });
            setPipeFrom(null);
            setPipeBendPts([]);
            setPipeLengthInput("");
            setMode("select");
            // Phase 13.32 — Enter-terminate also prompts for the
            // endpoint kind so the engineer assigns the real
            // consumer/source type rather than leaving J-N stubs.
            setPendingEndpointPicker({
              nodeId: toId,
              x: Math.round(termPt.x),
              y: Math.round(termPt.y),
            });
            setToast({
              text: nPipes > 1
                ? `${nPipes} шугам үүсгэв — эцсийн цэгийн төрлөө сонгоно уу`
                : "Шугам үүсгэв — эцсийн цэгийн төрлөө сонгоно уу",
              key: Date.now(),
              tone: "success",
            });
          }
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "g" || e.key === "G") {
        setShowGrid((g) => !g);
      } else if (e.key === "s" || e.key === "S") {
        setSnapGrid((s) => !s);
      } else if (e.key === "d" || e.key === "D") {
        // Phase 12.2 — toggle persistent dimension labels on all pipes
        // (the live HUD next to cursor shows during draw regardless).
        const current = useHydraulicStore.getState().settings.showLiveDimensions ?? true;
        updateSettings({ showLiveDimensions: !current });
      } else if (e.key === "m" || e.key === "M") {
        setShowMap((m) => !m);
      } else if (e.key === "v" || e.key === "V") {
        // Phase 6D — V = select (industry-standard "arrow tool" key)
        setMode("select");
      } else if (e.key === "p" || e.key === "P") {
        // Phase 6D — P = pipe-add mode
        setMode("addPipe");
      } else if (e.key === "1") {
        // Phase 6D — 1 = add source (УДДТ/substation default)
        setMode("addNode");
        setPendingKind("source_substation");
      } else if (e.key === "2") {
        // Phase 6D — 2 = add consumer (АОС/apartment default)
        setMode("addNode");
        setPendingKind("consumer_apartment");
      } else if (e.key === "3") {
        // Phase 6D — 3 = add well/chamber (ДХ — generic underground)
        setMode("addNode");
        setPendingKind("chamber");
      } else if (e.key === "4") {
        // Phase 6D — 4 = add junction (T-fitting / узель)
        setMode("addNode");
        setPendingKind("tee");
      } else if (e.key === "5") {
        // Phase 6D — 5 = add valve (gate-valve default)
        setMode("addNode");
        setPendingKind("valve_gate");
      } else if (e.key === "6") {
        // Phase 6D — 6 = add compensator (К — U-shape default)
        setMode("addNode");
        setPendingKind("compensator_u");
      } else if (e.key === "7") {
        // Phase 6D — 7 = add elbow (ЭӨ — 90° default)
        setMode("addNode");
        setPendingKind("elbow_90");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, readOnly, mode, polygon, duplicateSelected, commitDrawnBuilding]);

  const violatingPipeIds = new Set(
    (violations ?? []).filter((v) => v.target.kind === "pipe").map((v) => v.target.id),
  );
  const violatingNodeIds = new Set(
    (violations ?? []).filter((v) => v.target.kind === "node").map((v) => v.target.id),
  );

  // Phase 12.8 — engineering cross-reference node numbers
  // (Mongolian category order: source → fitting → consumer → chamber → …).
  // Memoised because the underlying ordering only changes when nodes
  // are added / removed / kind-changed, NOT on every render.
  const nodeNumberMap = useMemo(() => assignNodeNumbers(nodes), [nodes]);
  // Phase 13.22 — flow arrows now render inline from the displayed
  // polyline (see the saved-pipe arrow loop below). The legacy
  // `buildAllArrows` memo was discarded because its raw `node.x/.y`
  // positions drifted off the visible pipe on map pan. Reference
  // kept here so tree-shake leaves the export for PDF/Drawing-Set
  // consumers that don't have access to displayPos.
  void buildAllArrows;

  // Phase 13.20 — pre-compute parallel-offset index per pipe id. Memo
  // recomputes only when the pipe topology changes (adding / removing
  // pipes, changing fromNodeId / toNodeId / circuit) — pan/zoom don't
  // touch the offset, only the perpendicular projection in the renderer
  // does. computeParallelOffsets skips channelId-grouped pipes.
  const parallelOffsetByPipeId = useMemo(
    () => computeParallelOffsets(pipes),
    [pipes],
  );

  // Phase 13.25 — auto-classify each pipe as Магистраль / Салбар /
  // Холбоогүй from the network topology so the renderer can show the
  // role badge in the pipe label and the Excel exporter can emit the
  // "Шугамын төрөл" column. Memoised on pipes + nodes (consumer set
  // can shift when the engineer adds / removes buildings).
  const pipeRoleByPipeId = useMemo(
    () => classifyPipeRoles(pipes, nodes),
    [pipes, nodes],
  );

  // Phase 13.21 — ΔT inferred from the project's temperature schedule
  // so Q labels on heating pipes use the correct supply→return drop
  // (e.g. 130/70 → ΔT=60). Memoised on the schedule key so it doesn't
  // recompute every cursor move.
  const pipeLabelDeltaT = useMemo(() => {
    const sched = TEMP_SCHEDULES.find(
      (t) => t.key === settings.temperatureScheduleKey,
    );
    if (!sched) return 60; // sensible Mongolian district fallback
    return sched.supply_c - sched.return_c;
  }, [settings.temperatureScheduleKey]);

  // Live cursor info
  const cursorM = mousePos ? { x: pxToM(mousePos.x), y: pxToM(mousePos.y) } : null;
  const livePipeInfo = mode === "addPipe" && pipeFrom && mousePos
    ? (() => {
        const from = nodes.find((n) => n.id === pipeFrom);
        if (!from) return null;
        // Phase 13.14 — anchor for the live HUD = last captured bend
        // (if any) ELSE the from-node's CURRENT display position
        // (`displayPos`, not stored x/y — see Phase 6.8.2 + report
        // "хоосон газар... шугам арилж байна"). Without this, on the
        // map the live segment drew from the from-node's stale stored
        // x/y after any pan/zoom — looked like the pipe vanished.
        const anchor = pipeBendPts.length > 0
          ? displayVertex(pipeBendPts[pipeBendPts.length - 1]!, projectorCtx)
          : displayPos(from);
        const to = constrain(anchor, mousePos);
        const dx = to.x - anchor.x;
        const dy = to.y - anchor.y;
        const len_m = pxToM(Math.hypot(dx, dy));
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        return { len_m, ang, to, anchor };
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

      {/* Phase 13.7 — AutoCAD-style view selector (Top / Bottom / Iso).
          Positioned top-right of the canvas. Engineer flips Iso to see
          buildings extruded by their actual floor heights along with
          the map. Note: edit gestures (click / drag / polygon-draw)
          are reliable only in Top mode — the CSS 3D transform in
          Iso/Bottom skews mouse coordinates; the panel surfaces a
          hint to switch back when an edit gesture would be ambiguous. */}
      <div style={viewSelectorStyle} data-testid="view-selector">
        {(["top", "bottom", "iso"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setViewMode(v)}
            style={{
              ...viewSelectorBtnStyle,
              ...(viewMode === v
                ? { background: "var(--accent)", color: "white", fontWeight: 700 }
                : {}),
            }}
            data-testid={`view-mode-${v}`}
            title={v === "iso" ? "Isometric — 3D барилга газрын зурагтай" : v === "bottom" ? "Доороос (180° flip)" : "Дээрээс (default plan view)"}
          >
            {v === "top" ? "📐 Top" : v === "bottom" ? "🔄 Bot" : "📦 Iso"}
          </button>
        ))}
      </div>
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
      {/* Phase 6E — Layer panel for visibility / lock per pipe role.
          Positioned bottom-left of the canvas overlay so it doesn't
          obscure the map controls (top-right). */}
      {!readOnly && (
        <div style={{ position: "absolute", left: 12, bottom: 12, zIndex: 6 }}>
          <LayerPanel />
        </div>
      )}
      {/* Phase 6.8.2 — the old "📍 Газрын зурагт уях" toggle was dropped.
          Geo-anchoring is now implicit: any entity drawn while the map is
          visible captures lat/lon automatically and tracks pan/zoom. */}

      {/* Vertical category toolbar */}
      {!readOnly && !hideUi && (
        <div
          data-testid="scheme-toolbar"
          style={{
            width: 64,
            background: "var(--bg-soft)",
            borderRight: "1px solid var(--border-soft)",
            display: "flex",
            flexDirection: "column",
            padding: "0.4rem 0",
            gap: 4,
            zIndex: 4,
            // Phase 6.8.4 (BUG #7) — at smaller viewport heights the
            // 14+ category buttons used to overflow below the visible
            // area, cutting off Хэмжих / Хэмжээс / Туслах / Тэмдэглэгээ.
            // maxHeight: 100% + overflowY: auto turns the toolbar into
            // a scrollable strip so every tool stays reachable. The
            // scrollbar is intentional — it's the cheapest accessible
            // affordance + matches the "more tools below" pattern in
            // CAD apps. scrollbarWidth: thin keeps it discreet.
            maxHeight: "100%",
            overflowY: "auto",
            scrollbarWidth: "thin",
          }}
        >
          {/* Phase 13.18 — engineer report: "Хоолой Цэсийг хамгийн
              эхэнд байрлуулна уу." Pipe is the most frequently used
              tool in heat-network design; moving it to the top of
              the palette cuts the mouse travel for every draw
              session. Сонгох (select) drops one slot down — still
              within reach + accessible via the 'V' shortcut. */}
          <SideBtn
            active={mode === "addPipe"}
            onClick={() => {
              setMode("addPipe");
              setPipeFrom(null);
              setPipeBendPts([]);
              setShowPalette(null);
              // Phase 13.8 — Zulu-style flexibility: default to free
              // angles when the engineer enters pipe-draw mode. They
              // can still flip to ortho90 / ortho45 from the top
              // toolbar for grid-aligned mains.
              setAngleMode("free");
            }}
            icon="／"
            label="Хоолой"
          />
          <SideBtn
            active={mode === "select"}
            onClick={() => {
              setMode("select");
              setShowPalette(null);
            }}
            icon="↖"
            label="Сонгох"
          />
          {/* Phase 13.33 — engineer report: "Эхлээд зүүн талд байгаа
              Хэрэглэгч болон Үүсвэрийн Цэсийг устгаж зүгээр л Барилга
              зурах гэсэн нэршилтэй болгоно."
              The 6-category palette (Эх үүсвэр / Хэрэглэгч / Худаг /
              Хаалт / Холбоос / Мэдрэгч) is collapsed behind a
              "Дэлгэрэнгүй" toggle. The default engineer flow is:
              draw a building (one prominent button below) + draw
              pipes that land INSIDE the building. Node kinds get
              inferred from the building polygon the pipe endpoint
              click lands in. The category palette stays accessible
              for engineers who want to drop standalone nodes
              (junctions / valves / sensors) without a building. */}
          {showAdvancedPalette && CATEGORIES.map((cat) => (
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
          <SideBtn
            active={mode === "drawBuilding"}
            onClick={() => {
              setMode("drawBuilding");
              setPolygon([]);
              setShowPalette(null);
              // Phase 13.33 — default pendingKind so the polygon's
              // taggedAsKind label says "Орон сууц"; engineer changes
              // via Inspector after the polygon is drawn.
              setPendingKind("consumer_apartment");
            }}
            icon="▱"
            label="Барилга зурах"
            color="var(--success)"
          />
          {/* Phase 13.33 — advanced palette toggle. Default hidden;
              power users + Inspector kind dropdown still have access
              to all NODE_KINDS via this expansion. */}
          <SideBtn
            active={showAdvancedPalette}
            onClick={() => setShowAdvancedPalette((v) => !v)}
            icon={showAdvancedPalette ? "▾" : "▸"}
            label={showAdvancedPalette ? "Цэс хаах" : "Бүх багаж"}
            title="Хэрэглэгч / Эх үүсвэр / Хаалт / ... — бусад зангилаа байрлуулагч цэс"
          />
          {/* Phase 6.8.7 — quick-fill "standard apartment" template.
              One click places a 5-storey 20×30 m polygon at the
              current viewport centre with default metadata, so the
              engineer can iterate from a known starting point
              instead of always drawing fresh polygons. Inspector
              opens with the new building selected so floors / load
              fields are immediately editable. */}
          <SideBtn
            active={false}
            onClick={placeBuildingTemplate}
            icon="🏠"
            label="Темплейт"
            color="var(--success)"
            title="Стандарт 5-давхар 20×30м блок зурагт байрлуулна"
          />
          {/* Phase 12.5 — composite channel (Л-4/Л-7/Л-9 per ГК-23/02).
              Click button → click first node → click second node. The
              channel defaults to Л-7 with 4 standard circuits
              (D2.1/D2.2/D3/D4) — Mongolian medium-branch most-common
              case. Channel type + pipe set can be adjusted via
              Inspector / right-click after creation (Phase 12.6 polish). */}
          <SideBtn
            active={mode === "addChannel"}
            onClick={() => {
              setMode("addChannel");
              setChannelFrom(null);
              setShowPalette(null);
            }}
            icon="▤"
            label="Суваг"
            color="#666"
            title="Газар доорх бетон суваг (Л-4 / Л-7 / Л-9) — олон хоолойг нэг трэйнчид багтаасан зураг"
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
            active={mode === "drawDimension"}
            onClick={() => {
              setMode((m) => (m === "drawDimension" ? "select" : "drawDimension"));
              setPendingDimAnchor(null);
              setShowPalette(null);
            }}
            icon="📐"
            label="Хэмжээс"
            color="#222"
          />
          <SideBtn
            active={mode === "drawConstruction"}
            onClick={() => {
              setMode((m) => (m === "drawConstruction" ? "select" : "drawConstruction"));
              setPendingConstructionAnchor(null);
              setShowPalette(null);
            }}
            icon="┄"
            label="Туслах"
            color="#888"
          />
          <SideBtn
            active={mode === "drawAnnotation"}
            onClick={() => {
              setMode((m) => (m === "drawAnnotation" ? "select" : "drawAnnotation"));
              setShowPalette(null);
            }}
            icon="A"
            label="Тэмдэглэгээ"
            color="#222"
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

      {/* Floating palette
          Phase 6.8.5 (BUG #2) — `key={showPalette}` forces React to
          fully unmount + remount the palette div when the engineer
          switches categories (e.g. Эх үүсвэр popup → Камер popup).
          Without the key, React diffs the same `<div>` with new
          children, but the BROWSER's native `title=` tooltip on the
          previous category's button stayed visible because its
          anchor DOM node was recycled. With a category-scoped key,
          the entire subtree is torn down → tooltip anchor is gone →
          OS dismisses the tooltip. Cheaper + simpler than a custom
          Tooltip component for a 1-line fix. */}
      {showPalette && (
        <div
          key={showPalette}
          data-testid="scheme-palette"
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
                // Phase 13.1 — source/consumer kinds enter polygon-
                // draw mode so the engineer outlines the real building
                // footprint AutoCAD-style instead of dropping a single
                // centered point. Wells / valves / sensors keep the
                // legacy click-to-place behaviour. The polygon's
                // commit handler auto-creates the tagged node + sets
                // width_m / height_m from the bbox so InspectorPanel's
                // dimension inputs show realistic defaults.
                if (isBuildingLikeKind(k.key)) {
                  setMode("drawBuilding");
                  setPolygon([]);
                  // Phase 13.3 — real buildings are rarely axis-aligned
                  // (residential plots, ТЭЦ campus layouts, etc.). Default
                  // to free-angle so engineer can outline the actual
                  // footprint shape without fighting the 90° constraint.
                  // Engineer can toggle back to ortho90 / ortho45 via the
                  // top toolbar if they want crisp axes for a schematic.
                  setAngleMode("free");
                  setToast({
                    text: `${k.shortLabel} — газрын зураг дээр контур зурна (дурын өнцөг · Enter → дуусгах)`,
                    key: Date.now(),
                    tone: "neutral",
                  });
                }
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
        {/* Phase 13.3 — fine-snap toggle. 0.1 m grid for sub-metre
            precision (1.5 / 2.5 / 3.1 / 3.6 m dimensions). Only
            meaningful while snapGrid is on; visually disabled
            otherwise. */}
        <button
          onClick={() => setFineSnap((f) => !f)}
          style={{
            ...topBtn,
            ...(fineSnap ? { color: "var(--accent)" } : {}),
            ...(snapGrid ? {} : { opacity: 0.4 }),
          }}
          disabled={!snapGrid}
          title={
            snapGrid
              ? `Нарийн snap (0.1м) — ${fineSnap ? "ON" : "OFF"}`
              : "Эхлээд ⊟ Snap-ийг ассан байх ёстой"
          }
          data-testid="fine-snap-toggle"
        >0.1м</button>
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
          Зангилаа / барилга дарж <strong>шууд дуусгана</strong>.
          {" "}Хоосон газар нэг удаа = <strong>булан</strong> · хоёр удаа (<em>double-click</em>) эсвэл <strong>Enter</strong> = дуусгах · ESC цуцлах.
          {" · "}
          <em style={{ color: "var(--fg-muted)" }}>Mouse 2 (right-click) → давхар шугам</em>
          {pipeBendPts.length > 0 && (
            <span style={{ marginLeft: 8, color: "var(--warning)", fontWeight: 700 }}>
              · {pipeBendPts.length} булан
            </span>
          )}
          {extraCircuits.size > 0 && (
            <span style={{ marginLeft: 8, color: "var(--accent)", fontWeight: 700 }}>
              · {1 + extraCircuits.size} шугам
            </span>
          )}
          {parseFloat(pipeLengthInput) > 0 && (
            <span style={{ marginLeft: 8, color: "var(--bp-blue)", fontWeight: 700 }}>
              · L = {pipeLengthInput}м (тогтсон)
            </span>
          )}
        </div>
      )}
      {mode === "addPipe" && !pipeFrom && (
        <div style={hintStyle}>
          Эх цэг сонгох: зангилаа, барилгын полигон, эсвэл <strong>хоосон газар</strong> (Zulu-стиль) дээр дарна.
          {" · "}
          <em style={{ color: "var(--fg-muted)" }}>Mouse 2 (right-click) → давхар шугам сонгох</em>
          {extraCircuits.size > 0 && (
            <span style={{ marginLeft: 8, color: "var(--accent)", fontWeight: 700 }}>
              · {1 + extraCircuits.size} circuit идэвхтэй
            </span>
          )}
        </div>
      )}
      {mode === "addNode" && (
        <div style={hintStyle}>{getNodeKind(pendingKind)?.name} — canvas дээр дарна</div>
      )}
      {mode === "drawBuilding" && (
        <div style={hintStyle}>
          Polygon-ы өнцгүүдийг дараалан дарна. {polygon.length >= 3 ? "Эхний цэг рүү буцаж эсвэл Enter — хаах" : "≥3 цэг хэрэгтэй"}.
          {polygon.length > 0 && ` (${polygon.length} өнцөг)`}
          {/* Phase 13.11 + 13.29 — engineer report: "Эх үүсвэр болон
              хэрэглэгч зурах үед барилга дээр давхарлаж зурахад яг
              хүрээг нь дагуулж цэвэр зурж болохгүй байна."
              The "🏘 OSM-аас татах" button used to disappear after
              the first vertex. Now ALWAYS visible during drawBuilding
              (when map + building-like kind). If the engineer has
              vertices placed, clicking the button asks to REPLACE
              the manual polygon with the OSM outline. */}
          {showMap && isBuildingLikeKind(pendingKind) && (
            <button
              onClick={() => {
                if (polygon.length > 0) {
                  const ok = window.confirm(
                    `Зурсан ${polygon.length} өнцгийг устгаад OSM-ийн яг хэлбэрийг татах уу?`,
                  );
                  if (!ok) return;
                }
                setPolygon([]);
                setMode("pickBuilding");
                setToast({
                  text: "🏘 OSM-аас татах — газрын зураг дээрх барилгын дотор дарна",
                  key: Date.now(),
                  tone: "neutral",
                });
              }}
              style={{
                marginLeft: 10,
                padding: "3px 12px",
                background: "var(--bp-blue, #1f5faa)",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
              }}
              data-testid="hint-osm-trace"
              title="OSM газрын зургаас барилгын яг хүрээг татаж тэмдэглэх"
            >
              {polygon.length === 0
                ? "🏘 OSM-аас татах"
                : `🏘 OSM-аас солих (${polygon.length} цэг устгана)`}
            </button>
          )}
        </div>
      )}

      {/* Phase 13.5 — AutoCAD-style direct dimension input. Floating
          panel docked top-right of the canvas while a draw is in
          progress (≥1 polygon vertex placed OR addPipe has a `from`
          node). Engineer types length (m) + angle (°) → Enter places
          the next vertex / pipe endpoint at the polar offset.
          Convention: 0° east, 90° north, CCW positive. Tab cycles
          between fields. */}
      {!readOnly &&
        ((mode === "drawBuilding" && polygon.length > 0) ||
          (mode === "addPipe" && pipeFrom)) && (
          <div
            style={dimensionInputPanelStyle}
            data-testid="dimension-input-panel"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                commitDimensionInput();
              } else if (e.key === "Tab") {
                e.preventDefault();
                e.stopPropagation();
                setDimensionInputFocus((f) => (f === "length" ? "angle" : "length"));
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setDimensionInputLen("");
              }
            }}
          >
            <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 4 }}>
              📐 CAD оролт — Tab солих · Enter зурах
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <label style={{ fontSize: 11 }}>
                Урт:
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={dimensionInputLen}
                  placeholder="м"
                  data-testid="dimension-input-length"
                  ref={(el) => {
                    if (el && dimensionInputFocus === "length" && document.activeElement !== el) {
                      // Auto-focus when the panel opens or focus moves back here
                    }
                  }}
                  autoFocus={dimensionInputFocus === "length"}
                  onFocus={() => setDimensionInputFocus("length")}
                  onChange={(e) => setDimensionInputLen(e.target.value)}
                  style={dimensionInputBoxStyle}
                />
                <span style={{ marginLeft: 2 }}>м</span>
              </label>
              <label style={{ fontSize: 11 }}>
                Өнцөг:
                <input
                  type="number"
                  step={1}
                  value={dimensionInputAng}
                  placeholder="°"
                  data-testid="dimension-input-angle"
                  autoFocus={dimensionInputFocus === "angle"}
                  onFocus={() => setDimensionInputFocus("angle")}
                  onChange={(e) => setDimensionInputAng(e.target.value)}
                  style={dimensionInputBoxStyle}
                />
                <span style={{ marginLeft: 2 }}>°</span>
              </label>
              <button
                onClick={commitDimensionInput}
                style={dimensionInputBtnStyle}
                data-testid="dimension-input-commit"
                title="Enter — зурах"
              >
                ↳
              </button>
            </div>
            <div style={{ fontSize: 10, color: "var(--fg-muted)", marginTop: 4 }}>
              Конвенц: 0° зүүн (восток) · 90° хойд · CCW эерэг
            </div>
          </div>
        )}
      {mode === "measure" && (
        <div style={hintStyle}>
          📏 Хэмжих хэрэгсэл — цэгүүдийг дараалан дарна. {measurePoints.length >= 1 ? `Σ урт live харагдана. ESC цуцлах.` : "Эхний цэг дээр дарна."}
          {measurePoints.length > 0 && ` (${measurePoints.length} цэг)`}
        </div>
      )}
      {mode === "pickBuilding" && isBuildingLikeKind(pendingKind) && (
        <div style={hintStyle}>
          🏘 OSM-аас <strong>{getNodeKind(pendingKind)?.shortLabel ?? "барилга"}</strong> татах
          — газрын зураг дээрх барилгын дотор дарна. Footprint + цэгийн geo
          автоматаар тэмдэгтэй болно.
        </div>
      )}
      {mode === "pickBuilding" && !isBuildingLikeKind(pendingKind) && (
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
        data-testid="scheme-canvas"
        onClick={onCanvasClick}
        onDoubleClick={onCanvasDoubleClick}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onContextMenu={(e) => {
          // Phase 13.18 — right-click in addPipe mode opens the multi-
          // circuit picker (engineer report: "Mouse 2 дээрээс нэмэх
          // тохиргоог оруулна уу"). Other modes fall through to the
          // default browser menu OR to existing onContextMenuTarget
          // handlers on individual nodes/pipes/buildings.
          if (mode === "addPipe") {
            const targetTag = (e.target as Element).tagName;
            // Only when clicking the empty canvas — node/pipe/building
            // right-clicks already have their own context-menu hooks.
            if (
              targetTag === "svg" ||
              targetTag === "rect" ||
              targetTag === "pattern" ||
              targetTag === "path"
            ) {
              e.preventDefault();
              setCircuitPickerAt({ x: e.clientX, y: e.clientY });
            }
          }
        }}
        style={{
          flex: 1,
          height: "100%",
          display: "block",
          // Phase 13.7 — apply view-mode transform. Top mode is the
          // identity (no transform); Bottom flips 180° around the
          // canvas centre so the engineer sees a plan-paper mirror;
          // Iso tilts the SVG 60° so buildings render in axonometric.
          // The transform applies to the SVG only — the leaflet map
          // also gets a matching transform via a side-effect (see
          // useEffect below) so they stay locked together visually.
          transform: viewModeWrapperTransform(viewMode),
          transformOrigin: "center center",
          transition: "transform 350ms ease-out",
          cursor: mapPanDrag ? "grabbing"
            : drag ? "grabbing"
            // Phase 6.8.1 BUG #1 fix — crosshair in pipe-draw mode so
            // the engineer aims precisely at a node center. The bug
            // report's reproduction was "clicked ЦТП but pipeFrom
            // didn't set"; investigation hypothesis is engineer-
            // missing-the-hit-zone due to ambiguous cursor + Leaflet
            // pointer-events handoff. Crosshair narrows the target.
            : (mode === "drawBuilding" || mode === "measure" || mode === "addPipe" || mode === "addChannel" ? "crosshair"
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
                  // Phase 6.8.1 BUG #1 fix — defensive `pointerEvents: all`.
                  style={{ cursor: "move", color: fillColor, pointerEvents: "all" }}
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

            {/* Phase 6.8.6 — Reference building polygons. Rendered
                AFTER consumer-with-footprint nodes so the hydraulic
                buildings sit on top visually (their colour also
                differs — engineer-friendly orange vs the dashed
                drafting-grey of reference outlines). Each polygon
                follows the leaflet map on pan/zoom via per-vertex
                geo (Phase 6.8.2 mechanism), with rigid-translate
                fallback when no geo is present. */}
            {(() => {
              const bs = buildings ?? [];
              if (bs.length === 0) return null;
              return bs.map((b) => {
                const lk = b.layerKey ?? "D";
                const layer = resolveLayerByKey(lk, settings.layers);
                if (!layer.visible) return null;
                const isSelected = selection?.kind === "building" && selection.id === b.id;
                const isMultiSelected = (multiSelection.buildingIds ?? []).includes(b.id);
                const pts = b.polygon;
                const fillColor = b.color ?? layer.color;
                // Per-vertex geo projection mirrors the consumer-
                // footprint block above. When the map is on AND
                // any vertex carries lat/lon, use those for the
                // current view; otherwise stay in scheme-pixel space.
                const usingPerVertexGeo =
                  showMap
                  && pts.some((p) => typeof p.lat === "number" && typeof p.lon === "number")
                  && leafletMapRef.current
                  && svgRef.current;
                let movedPts: Array<{ x: number; y: number }>;
                if (usingPerVertexGeo) {
                  const map = leafletMapRef.current!;
                  const mapRect = map.getContainer().getBoundingClientRect();
                  const svgRect = svgRef.current!.getBoundingClientRect();
                  movedPts = pts.map((p) => {
                    if (typeof p.lat !== "number" || typeof p.lon !== "number") {
                      return { x: p.x, y: p.y };
                    }
                    const cpt = map.latLngToContainerPoint([p.lat, p.lon]);
                    return {
                      x: (mapRect.left + cpt.x - svgRect.left - RULER_PX) / zoom - pan.x,
                      y: (mapRect.top + cpt.y - svgRect.top - RULER_PX) / zoom - pan.y,
                    };
                  });
                } else {
                  movedPts = pts.map((p) => ({ x: p.x, y: p.y }));
                }
                const centroid = polygonCentroid(movedPts);
                const xMin = Math.min(...movedPts.map((p) => p.x));
                const yMin = Math.min(...movedPts.map((p) => p.y));
                const xMax = Math.max(...movedPts.map((p) => p.x));
                const yMax = Math.max(...movedPts.map((p) => p.y));
                // Area is computed from the displayed (projected) points
                // so the m² readout matches the on-screen scale at the
                // current map zoom.
                const area_m2 = polygonAreaM2(movedPts);
                // Phase 13.38 — engineer report: "барилга зурчаад тэрэн
                // дээр Дулааны ачаалал бичих шаардлагагүй шүү дээ зүгээр
                // л үзүүлэн гээд байхад". The polygon is purely a
                // visual outline (per Phase 13.30+ mental model). The
                // hydraulic entity is the pipe-endpoint NODE — heat
                // load belongs on the node label, NOT on the polygon
                // overlay. `b.heatLoad_kw` stays on the model (it's
                // still synced from the linked node for legacy data +
                // BНбД compliance rules), but the rendered readout no
                // longer shows it. Floors stays — engineer can still
                // type it via Inspector and it's referenced by the
                // compliance check.
                const floorsStr =
                  typeof b.floors === "number" ? ` · ${b.floors}д` : "";
                return (
                  <g
                    key={b.id}
                    data-testid={`building-${b.id}`}
                    onMouseDown={(e) => {
                      // Phase 13.35 — engineer report (Mongolian,
                      // with frustration): "Шугам автоматаар барилгатай
                      // холбогдоод байна, холбогдох ёсгүй. Шугамын
                      // салбар дахь эцсийн цэгүүд нь өөрөө барилга
                      // байгууламж хэрэглэгч болно шүү дээ."
                      //
                      // Phase 13.33 polygon→node auto-anchor REMOVED.
                      // Pipe endpoints are STANDALONE consumer/source
                      // nodes — the engineer's click point IS the
                      // hydraulic entity, no inheritance from polygon.
                      // Polygon is purely decorative.
                      //
                      // We don't stopPropagation here in addPipe mode,
                      // so the click bubbles to the canvas onClick →
                      // empty-canvas branch creates a junction stub +
                      // raises the Phase 13.32 kind picker for the
                      // engineer to assign Орон сууц / Эмнэлэг / ...
                      if (mode === "addPipe") {
                        return;
                      }
                      if (mode === "select" || mode === "drawBuilding") {
                        e.stopPropagation();
                        if (e.ctrlKey || e.metaKey) {
                          selectToggle({ kind: "building", id: b.id });
                          return;
                        }
                        if (e.shiftKey) {
                          selectExtend({ kind: "building", id: b.id });
                          return;
                        }
                        selectBuilding(b.id);
                        // Phase 13.2 — plain click also primes the
                        // polygon drag so a click+drag gesture moves
                        // the whole building (and its tagged node).
                        // Only in "select" mode — drawBuilding mode
                        // is reserved for vertex placement.
                        if (mode === "select" && !readOnly) {
                          const pt = toSvg(e);
                          const taggedNode = b.taggedAsNodeId
                            ? nodes.find((n) => n.id === b.taggedAsNodeId)
                            : null;
                          setBuildingDrag({
                            buildingId: b.id,
                            startMouse: pt,
                            startPolygon: b.polygon.map((v) => ({ ...v })),
                            ...(taggedNode
                              ? {
                                  taggedNodeId: taggedNode.id,
                                  startNodePos: { x: taggedNode.x, y: taggedNode.y },
                                }
                              : {}),
                          });
                        }
                      }
                    }}
                    onContextMenu={(e) => onContextMenuTarget(e, { kind: "building", id: b.id })}
                    style={{ cursor: mode === "select" ? "move" : undefined }}
                  >
                    {isMultiSelected && (
                      <rect
                        x={xMin - 4}
                        y={yMin - 4}
                        width={xMax - xMin + 8}
                        height={yMax - yMin + 8}
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth={2}
                        strokeDasharray="3 2"
                        pointerEvents="none"
                      />
                    )}
                    <polygon
                      points={movedPts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={fillColor}
                      fillOpacity={isSelected ? 0.22 : 0.08}
                      stroke={isSelected ? "var(--accent)" : fillColor}
                      strokeWidth={isSelected ? 2.5 : 1.25}
                      strokeDasharray={isSelected ? undefined : "5 3"}
                      pointerEvents="all"
                    />
                    {/* Phase 13.41 — engineer screenshot: text dwarfed
                        OSM buildings on the map. Three fixes:
                        (a) divide font size + offsets by canvas zoom so
                            labels stay at constant SCREEN size regardless
                            of how far the engineer zoomed in;
                        (b) hide the label/area pair entirely when the
                            polygon's smaller bbox dimension is too small
                            to fit text without overlapping;
                        (c) strip auto-generated "OSM-NNNNN" prefixes —
                            those were Overpass-import fallbacks for
                            unnamed buildings and have no engineering
                            meaning. */}
                    {(() => {
                      const bboxMinPx = Math.min(xMax - xMin, yMax - yMin);
                      // SVG outer group is scale(zoom) — divide by zoom
                      // so 11 px renders as 11 SCREEN px (not 11×zoom).
                      const labelFontPx = 11 / Math.max(zoom, 0.1);
                      const areaFontPx = 9 / Math.max(zoom, 0.1);
                      const labelOffsetY = 3 / Math.max(zoom, 0.1);
                      const areaOffsetY = 11 / Math.max(zoom, 0.1);
                      const strokeWidthLabel = 3 / Math.max(zoom, 0.1);
                      const strokeWidthArea = 2.5 / Math.max(zoom, 0.1);
                      // Suppress entirely when polygon is < 24 SCREEN px
                      // (the labels would otherwise spill outside).
                      const minBboxScreen = 24;
                      const visible = bboxMinPx * zoom >= minBboxScreen;
                      if (!visible) return null;
                      const rawLabel = b.label ?? "";
                      // Strip the Overpass fallback "OSM-12345..." prefix
                      // — display nothing when only the OSM id is set
                      // (engineer can type a real label in Inspector).
                      const displayLabel = /^OSM-\d+$/.test(rawLabel) ? "" : rawLabel;
                      // Hide "0м²" — area math returned ~0 because the
                      // polygon is tiny in metres; the readout is noise.
                      const showArea = area_m2 >= 1;
                      return (
                        <>
                          {displayLabel && (
                            <text
                              x={centroid.x}
                              y={centroid.y - labelOffsetY}
                              fontSize={labelFontPx}
                              fontWeight={600}
                              textAnchor="middle"
                              fill="var(--fg)"
                              stroke="white"
                              strokeWidth={strokeWidthLabel}
                              paintOrder="stroke"
                              pointerEvents="none"
                            >
                              {displayLabel}
                            </text>
                          )}
                          {(showArea || floorsStr) && (
                            <text
                              x={centroid.x}
                              y={centroid.y + areaOffsetY}
                              fontSize={areaFontPx}
                              textAnchor="middle"
                              fill="var(--fg-muted)"
                              fontFamily="var(--font-mono)"
                              stroke="white"
                              strokeWidth={strokeWidthArea}
                              paintOrder="stroke"
                              pointerEvents="none"
                            >
                              {showArea ? `${area_m2.toFixed(0)}м²` : ""}
                              {floorsStr}
                            </text>
                          )}
                        </>
                      );
                    })()}
                    {/* Phase 13.3 — per-vertex drag handles. Only rendered
                        when the building is the active single selection
                        (avoids clutter when many buildings + multi-select).
                        Each handle is a small accent square; mousedown
                        primes polygonVertexDrag → onMouseMove reshapes →
                        onMouseUp commits with one undo snapshot. */}
                    {isSelected && mode === "select" && !readOnly &&
                      movedPts.map((pt, i) => {
                        const isActive =
                          polygonVertexDrag?.buildingId === b.id &&
                          polygonVertexDrag.vertexIndex === i;
                        const handleSize = isActive ? 10 : 8;
                        return (
                          <rect
                            key={`vh-${b.id}-${i}`}
                            x={pt.x - handleSize / 2}
                            y={pt.y - handleSize / 2}
                            width={handleSize}
                            height={handleSize}
                            fill={isActive ? "var(--warning)" : "white"}
                            stroke="var(--accent)"
                            strokeWidth={isActive ? 2 : 1.5}
                            data-testid={`vertex-handle-${b.id}-${i}`}
                            style={{ cursor: "nwse-resize" }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setPolygonVertexDrag({
                                buildingId: b.id,
                                vertexIndex: i,
                              });
                            }}
                          />
                        );
                      })}
                  </g>
                );
              });
            })()}

            {/* Phase 6.6.1 — Dimension lines. Rendered before pipes so
                pipes can hover above dimension labels. Each dimension
                gets witness ticks + offset main line + arrowheads +
                centered label with white halo. Orphan state (anchor
                deleted) renders in red dashed. */}
            {(() => {
              const dims = dimensions ?? [];
              if (dims.length === 0) return null;
              const dLayer = resolveLayerByKey("D", settings.layers);
              if (!dLayer.visible) return null;
              return dims.map((dim) => {
                const resolved = resolveDimensionEndpoints(dim, nodes);
                const geom = dimensionGeometry(resolved.from, resolved.to, dim.offset_px);
                const label = computeDimensionLabel(dim, resolved);
                const isSelected = selection?.kind === "dimension" && selection.id === dim.id;
                const isMultiSelected = (multiSelection.dimensionIds ?? []).includes(dim.id);
                const color = resolved.orphan
                  ? "#C44"
                  : isSelected
                    ? "var(--accent)"
                    : dLayer.color;
                const strokeDasharray = resolved.orphan ? "4 2" : undefined;
                return (
                  <g
                    key={dim.id}
                    data-testid={`dimension-${dim.id}`}
                    onMouseDown={(e) => {
                      // Click selects (when not in a drawing mode).
                      if (mode === "select" || mode === "drawDimension") {
                        e.stopPropagation();
                        selectDimension(dim.id);
                      }
                    }}
                    style={{ cursor: mode === "select" ? "pointer" : undefined }}
                  >
                    {isMultiSelected && (
                      <rect
                        x={Math.min(geom.witness1.from.x, geom.witness2.from.x, geom.dimLine.from.x, geom.dimLine.to.x) - 4}
                        y={Math.min(geom.witness1.from.y, geom.witness2.from.y, geom.dimLine.from.y, geom.dimLine.to.y) - 4}
                        width={
                          Math.abs(
                            Math.max(geom.witness1.to.x, geom.witness2.to.x, geom.dimLine.from.x, geom.dimLine.to.x)
                            - Math.min(geom.witness1.from.x, geom.witness2.from.x, geom.dimLine.from.x, geom.dimLine.to.x),
                          ) + 8
                        }
                        height={
                          Math.abs(
                            Math.max(geom.witness1.to.y, geom.witness2.to.y, geom.dimLine.from.y, geom.dimLine.to.y)
                            - Math.min(geom.witness1.from.y, geom.witness2.from.y, geom.dimLine.from.y, geom.dimLine.to.y),
                          ) + 8
                        }
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth={2}
                        strokeDasharray="3 2"
                        pointerEvents="none"
                      />
                    )}
                    {/* Witness lines (thin perpendicular ticks) */}
                    <line
                      x1={geom.witness1.from.x}
                      y1={geom.witness1.from.y}
                      x2={geom.witness1.to.x}
                      y2={geom.witness1.to.y}
                      stroke={color}
                      strokeWidth={1}
                      strokeDasharray={strokeDasharray}
                      pointerEvents="none"
                    />
                    <line
                      x1={geom.witness2.from.x}
                      y1={geom.witness2.from.y}
                      x2={geom.witness2.to.x}
                      y2={geom.witness2.to.y}
                      stroke={color}
                      strokeWidth={1}
                      strokeDasharray={strokeDasharray}
                      pointerEvents="none"
                    />
                    {/* Main dimension line */}
                    <line
                      x1={geom.dimLine.from.x}
                      y1={geom.dimLine.from.y}
                      x2={geom.dimLine.to.x}
                      y2={geom.dimLine.to.y}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray={strokeDasharray}
                      // Wider invisible hit-area for easier clicking.
                      style={{ cursor: mode === "select" ? "pointer" : undefined }}
                    />
                    {/* Arrowheads */}
                    <polygon points={geom.arrow1Points} fill={color} />
                    <polygon points={geom.arrow2Points} fill={color} />
                    {/* Label with white halo via stroke-then-fill */}
                    <text
                      x={geom.labelPos.x}
                      y={geom.labelPos.y - 4}
                      fontSize={11}
                      fontFamily="var(--font-mono)"
                      fill={color}
                      stroke="white"
                      strokeWidth={3}
                      paintOrder="stroke"
                      textAnchor="middle"
                      transform={
                        Math.abs(geom.angle_deg) > 90
                          ? `rotate(${geom.angle_deg + 180} ${geom.labelPos.x} ${geom.labelPos.y})`
                          : `rotate(${geom.angle_deg} ${geom.labelPos.x} ${geom.labelPos.y})`
                      }
                      pointerEvents="none"
                    >
                      {label}
                    </text>
                    {/* Orphan warning marker — small red dot at label */}
                    {resolved.orphan && (
                      <circle
                        cx={geom.labelPos.x}
                        cy={geom.labelPos.y}
                        r={3}
                        fill="#C44"
                      >
                        <title>Дутагдалтай зангилаа — устгана уу эсвэл шинэ зангилаа сонгоно уу</title>
                      </circle>
                    )}
                  </g>
                );
              });
            })()}

            {/* Phase 6.6.1 — Dimension drawing preview: rubber-band-ish line
                from pendingDimAnchor to cursor while engineer picks the
                second node. */}
            {mode === "drawDimension" && pendingDimAnchor && mousePos && (
              <g pointerEvents="none">
                <line
                  x1={pendingDimAnchor.x}
                  y1={pendingDimAnchor.y}
                  x2={mousePos.x}
                  y2={mousePos.y}
                  stroke="#FFB300"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={pendingDimAnchor.x}
                  cy={pendingDimAnchor.y}
                  r={5}
                  fill="#FFB300"
                  stroke="white"
                  strokeWidth={1.5}
                />
              </g>
            )}

            {/* Phase 6.6.2 — Construction lines. Rendered before pipes so
                pipes stay on top visually. Layer-respecting visibility
                + style (solid/dashed/dotted) + optional centred label
                with halo. No orphan state — these are free-coord. */}
            {(() => {
              const lines = constructionLines ?? [];
              if (lines.length === 0) return null;
              return lines.map((cl) => {
                const lk = cl.layerKey ?? "C";
                const layer = resolveLayerByKey(lk, settings.layers);
                if (!layer.visible) return null;
                const isSelected = selection?.kind === "constructionLine" && selection.id === cl.id;
                const isMultiSelected = (multiSelection.constructionLineIds ?? []).includes(cl.id);
                const color = isSelected ? "var(--accent)" : layer.color;
                const dash = strokeDasharrayForStyle(cl.style);
                // Phase 6.8.2 — each endpoint may carry an
                // independent geo anchor (geoFrom / geoTo). The
                // display helper falls back to the stored x/y when
                // the map isn't visible or the line is a legacy
                // Phase 6.6.2 entity without geo — so the rendered
                // line matches old behaviour exactly when nothing
                // has changed.
                const fromDp = displayPosConstructionEndpoint(cl.from, cl.geoFrom);
                const toDp = displayPosConstructionEndpoint(cl.to, cl.geoTo);
                const mid = { x: (fromDp.x + toDp.x) / 2, y: (fromDp.y + toDp.y) / 2 };
                const angle_deg = (Math.atan2(toDp.y - fromDp.y, toDp.x - fromDp.x) * 180) / Math.PI;
                // Recompute the bounding box from the DISPLAYED
                // endpoints so the multi-select highlight follows
                // the map view. Inline (vs constructionLineBoundingBox)
                // because the helper takes the stored entity, not
                // free-form points.
                const bb = {
                  minX: Math.min(fromDp.x, toDp.x),
                  minY: Math.min(fromDp.y, toDp.y),
                  maxX: Math.max(fromDp.x, toDp.x),
                  maxY: Math.max(fromDp.y, toDp.y),
                };
                return (
                  <g
                    key={cl.id}
                    data-testid={`construction-line-${cl.id}`}
                    onMouseDown={(e) => {
                      // Click selects (when not in a drawing mode).
                      if (mode === "select" || mode === "drawConstruction") {
                        e.stopPropagation();
                        selectConstructionLine(cl.id);
                      }
                    }}
                    style={{ cursor: mode === "select" ? "pointer" : undefined }}
                  >
                    {isMultiSelected && (
                      <rect
                        x={bb.minX - 4}
                        y={bb.minY - 4}
                        width={bb.maxX - bb.minX + 8}
                        height={bb.maxY - bb.minY + 8}
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth={2}
                        strokeDasharray="3 2"
                        pointerEvents="none"
                      />
                    )}
                    {/* Wider invisible hit zone for easier clicking on
                        a thin dashed/dotted stroke. */}
                    <line
                      x1={fromDp.x}
                      y1={fromDp.y}
                      x2={toDp.x}
                      y2={toDp.y}
                      stroke="transparent"
                      strokeWidth={10}
                      pointerEvents="stroke"
                      style={{ cursor: mode === "select" ? "pointer" : undefined }}
                    />
                    {/* Visible line */}
                    <line
                      x1={fromDp.x}
                      y1={fromDp.y}
                      x2={toDp.x}
                      y2={toDp.y}
                      stroke={color}
                      strokeWidth={1.25}
                      strokeDasharray={dash}
                      pointerEvents="none"
                    />
                    {cl.label && cl.label.trim().length > 0 && (
                      <text
                        x={mid.x}
                        y={mid.y - 4}
                        fontSize={11}
                        fontFamily="var(--font-mono)"
                        fill={color}
                        stroke="white"
                        strokeWidth={3}
                        paintOrder="stroke"
                        textAnchor="middle"
                        transform={
                          Math.abs(angle_deg) > 90
                            ? `rotate(${angle_deg + 180} ${mid.x} ${mid.y})`
                            : `rotate(${angle_deg} ${mid.x} ${mid.y})`
                        }
                        pointerEvents="none"
                      >
                        {cl.label}
                      </text>
                    )}
                  </g>
                );
              });
            })()}

            {/* Phase 6.6.2 — Construction-line drawing preview.
                Phase 6.8.2 — when the anchor carries geo, the
                preview tracks the map between the two clicks (so
                the engineer can pan/zoom freely without losing
                their start point). */}
            {mode === "drawConstruction" && pendingConstructionAnchor && mousePos && (() => {
              const anchorDp = displayPosConstructionEndpoint(
                { x: pendingConstructionAnchor.x, y: pendingConstructionAnchor.y },
                pendingConstructionAnchor.geo,
              );
              return (
                <g pointerEvents="none">
                  <line
                    x1={anchorDp.x}
                    y1={anchorDp.y}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    stroke="#888"
                    strokeWidth={1.25}
                    strokeDasharray="6 4"
                  />
                  <circle
                    cx={anchorDp.x}
                    cy={anchorDp.y}
                    r={4}
                    fill="#888"
                    stroke="white"
                    strokeWidth={1.25}
                  />
                </g>
              );
            })()}

            {/* Phase 6.6.3 — Annotations. Rendered before pipes so
                pipes can hover above the text labels. Each annotation
                renders as a multi-line rotated SVG <text> with a
                white halo for legibility. Layer "D" by default
                (visible in print). Multi-select gold rect overlay. */}
            {(() => {
              const annos = annotations ?? [];
              if (annos.length === 0) return null;
              return annos.map((a) => {
                const lk = a.layerKey ?? "D";
                const layer = resolveLayerByKey(lk, settings.layers);
                if (!layer.visible) return null;
                const isSelected = selection?.kind === "annotation" && selection.id === a.id;
                const isMultiSelected = (multiSelection.annotationIds ?? []).includes(a.id);
                const color = a.color ?? (isSelected ? "var(--accent)" : layer.color);
                const fs = effectiveFontSize(a);
                const rot = a.rotation_deg ?? 0;
                const anchor =
                  a.align === "center" ? "middle"
                  : a.align === "right" ? "end"
                  : "start";
                const lines = annotationLines(a);
                const bb = annotationBoundingBox(a);
                // Phase 6.8.2 — when the annotation carries geo and
                // the map is visible, project to the live display
                // position and wrap the inner draw in a translate.
                // The wrap (rather than substituting every x/y)
                // keeps the rotation transforms intact: rotating
                // around (a.x, a.y) inside the translate is
                // mathematically identical to rotating around
                // (dp.x, dp.y) in outer coords.
                const dp = displayPosAnnotation(a);
                const dx = dp.x - a.x;
                const dy = dp.y - a.y;
                const wrapTransform = dx !== 0 || dy !== 0 ? `translate(${dx} ${dy})` : undefined;
                return (
                  <g
                    key={a.id}
                    data-testid={`annotation-${a.id}`}
                    onMouseDown={(e) => {
                      if (mode === "select" || mode === "drawAnnotation") {
                        e.stopPropagation();
                        if (e.ctrlKey || e.metaKey) {
                          selectToggle({ kind: "annotation", id: a.id });
                          return;
                        }
                        if (e.shiftKey) {
                          selectExtend({ kind: "annotation", id: a.id });
                          return;
                        }
                        selectAnnotation(a.id);
                      }
                    }}
                    transform={wrapTransform}
                    style={{ cursor: mode === "select" ? "pointer" : undefined }}
                  >
                    {isMultiSelected && (
                      <rect
                        x={bb.minX - 4}
                        y={bb.minY - 4}
                        width={bb.maxX - bb.minX + 8}
                        height={bb.maxY - bb.minY + 8}
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth={2}
                        strokeDasharray="3 2"
                        pointerEvents="none"
                        transform={rot !== 0 ? `rotate(${rot} ${a.x} ${a.y})` : undefined}
                      />
                    )}
                    {/* Invisible hit zone for easier clicking. */}
                    <rect
                      x={bb.minX - 2}
                      y={bb.minY - 2}
                      width={bb.maxX - bb.minX + 4}
                      height={bb.maxY - bb.minY + 4}
                      fill="transparent"
                      pointerEvents="all"
                      transform={rot !== 0 ? `rotate(${rot} ${a.x} ${a.y})` : undefined}
                      style={{ cursor: mode === "select" ? "pointer" : undefined }}
                    />
                    <text
                      x={a.x}
                      y={a.y}
                      fontSize={fs}
                      fontFamily="var(--font-mono)"
                      fill={color}
                      stroke="white"
                      strokeWidth={3}
                      paintOrder="stroke"
                      textAnchor={anchor}
                      transform={rot !== 0 ? `rotate(${rot} ${a.x} ${a.y})` : undefined}
                      pointerEvents="none"
                    >
                      {lines.map((ln, i) => (
                        <tspan
                          key={i}
                          x={a.x}
                          dy={i === 0 ? 0 : fs * LINE_HEIGHT_MULTIPLIER}
                        >
                          {ln}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Phase 6.6.3 — Annotation drawing preview marker. */}
            {mode === "drawAnnotation" && mousePos && (
              <g pointerEvents="none">
                <circle
                  cx={mousePos.x}
                  cy={mousePos.y}
                  r={5}
                  fill="#222"
                  fillOpacity={0.35}
                  stroke="white"
                  strokeWidth={1.25}
                />
                <text
                  x={mousePos.x + 8}
                  y={mousePos.y - 6}
                  fontSize={10}
                  fill="#222"
                  stroke="white"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  Click to place
                </text>
              </g>
            )}

            {/* Phase 12.5 — composite underground channels (Л-4/Л-7/Л-9
                per ГК-23/02). Renders ONE thick gray polyline per
                channel that visually REPLACES the contained pipes on
                the plan view; individual pipes inside a channel skip
                their own render below (filter via p.channelId).
                The cross-section detail view (Phase 12.6) and
                AutoCAD-style label panel (Phase 12.7) are layered on
                later. Click handling for now: clicking the channel
                selects the FIRST contained pipe so InspectorPanel
                shows pipe-level fields (DN, material, length). */}
            {(channels ?? []).map((ch) => {
              const a = nodes.find((n) => n.id === ch.fromNodeId);
              const b = nodes.find((n) => n.id === ch.toNodeId);
              if (!a || !b) return null;
              const aPos = displayPos(a);
              const bPos = displayPos(b);
              const points: Point[] = [{ x: aPos.x, y: aPos.y }];
              if (ch.bendPoints?.length) {
                // Phase 13.17 — same fix as the saved-pipe renderer:
                // project bend lat/lon at the current pan/zoom so the
                // composite channel polyline tracks the map alongside
                // its endpoint nodes.
                for (const bp of ch.bendPoints) {
                  const dp = displayVertex(bp, projectorCtx);
                  points.push({ x: dp.x, y: dp.y });
                }
              }
              points.push({ x: bPos.x, y: bPos.y });
              const pathD = points
                .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
                .join(" ");
              // Midpoint for the "Nп" badge + type label.
              const midIdx = Math.max(1, Math.floor(points.length / 2));
              const midX = (points[midIdx - 1]!.x + points[midIdx]!.x) / 2;
              const midY = (points[midIdx - 1]!.y + points[midIdx]!.y) / 2;

              const firstPipeId = ch.pipeIds[0];
              const isSelected =
                selection?.kind === "pipe" &&
                firstPipeId != null &&
                selection.id === firstPipeId;
              // Channel render width is GENEROUSLY thicker than the
              // contained pipes so the visual hierarchy reads
              // "trench > pipes inside" at a glance. Engineer can
              // still hit individual pipes via the cross-section view.
              const channelWidth = isSelected ? 18 : 14;
              const fill = "#666";
              const stroke = isSelected ? "var(--accent)" : "#2A2A2A";
              const badgeText = channelPipeCountBadge(ch);
              const typeText = channelTypeLabel(
                ch.channelType,
                ch.crossSectionWidth_mm,
                ch.crossSectionHeight_mm,
              );

              return (
                <g key={`ch_${ch.id}`}>
                  {/* Wide hit area — clicking selects the first pipe so
                      InspectorPanel surfaces something meaningful. */}
                  <path
                    d={pathD}
                    stroke="transparent"
                    strokeWidth={Math.max(20, channelWidth + 8)}
                    fill="none"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (firstPipeId)
                        select({ kind: "pipe", id: firstPipeId });
                    }}
                    onContextMenu={(e) => {
                      if (firstPipeId)
                        onContextMenuTarget(e, { kind: "pipe", id: firstPipeId });
                    }}
                    style={{ cursor: "pointer", pointerEvents: "stroke" }}
                  />
                  {/* Channel underlay — dark stroke for crisp border. */}
                  <path
                    d={pathD}
                    stroke={stroke}
                    strokeWidth={channelWidth + 2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                  {/* Channel fill — concrete-gray. */}
                  <path
                    d={pathD}
                    stroke={fill}
                    strokeWidth={channelWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                  {/* Midpoint badge — "4п" pipe count + channel type. */}
                  <g pointerEvents="none">
                    <rect
                      x={midX - 30}
                      y={midY - 11}
                      width={60}
                      height={22}
                      rx={4}
                      fill="white"
                      stroke="#333"
                      strokeWidth={1}
                      opacity={0.95}
                    />
                    <text
                      x={midX}
                      y={midY + 4}
                      textAnchor="middle"
                      fontSize={11}
                      fontWeight={600}
                      fill="#222"
                    >
                      {badgeText} · {typeText.replace(/\s\(.*$/, "")}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Phase 12.7 — Per-channel engineering label panel.
                AutoCAD-style 3-line callout (type + pipes + meta) at
                engineer-positioned offset from the channel midpoint
                with a thin leader line. Hidden when channel has
                labelVisible=false. Phase 12.8b wires the project-wide
                ProjectSettings.showChannelLabels toggle. Phase 12.8b
                also adds drag-to-reposition: mousedown on the label
                background starts a drag that writes the new offset to
                channel.labelOffset via updateChannel. */}
            {settings.showChannelLabels !== false &&
              (channels ?? []).map((ch) => {
              if (!isLabelVisible(ch, settings.showChannelLabels)) return null;
              const label = buildChannelLabel(ch, nodes, pipes);
              if (!label) return null;
              const dims = labelDimensions(label);
              if (dims.width === 0) return null;
              const ax = label.anchorX;
              const ay = label.anchorY;
              const lx = ax + label.offsetDx;
              const ly = ay + label.offsetDy;
              const lineEndX = lx > ax ? lx - 4 : lx + dims.width + 4;
              const lineEndY = ly > ay ? ly - 4 : ly + dims.height + 4;
              const lines = [label.typeLine, label.pipesLine, label.metaLine].filter(
                (l) => l.length > 0,
              );
              const isDragging = channelLabelDrag?.channelId === ch.id;
              return (
                <g
                  key={`chlbl_${ch.id}`}
                  data-testid={`channel-label-${ch.id}`}
                >
                  {/* Leader line — channel midpoint → label box edge */}
                  <line
                    x1={ax}
                    y1={ay}
                    x2={lineEndX}
                    y2={lineEndY}
                    stroke="#555"
                    strokeWidth={0.75}
                    strokeDasharray="2 2"
                    pointerEvents="none"
                  />
                  <circle cx={ax} cy={ay} r={1.5} fill="#555" pointerEvents="none" />
                  {/* Label background — draggable. Phase 12.8b. */}
                  <rect
                    x={lx}
                    y={ly}
                    width={dims.width}
                    height={dims.height}
                    fill={isDragging ? "#FFE9A6" : "#FFF8E1"}
                    stroke={isDragging ? "var(--accent, #1f5faa)" : "#5B4F33"}
                    strokeWidth={isDragging ? 1.2 : 0.6}
                    rx={3}
                    opacity={0.96}
                    style={{ cursor: "move" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      const pt = toSvg(e);
                      setChannelLabelDrag({
                        channelId: ch.id,
                        startMouse: pt,
                        startOffset: { dx: label.offsetDx, dy: label.offsetDy },
                      });
                    }}
                    data-testid={`channel-label-bg-${ch.id}`}
                  />
                  {lines.map((line, i) => (
                    <text
                      key={i}
                      x={lx + 6}
                      y={ly + 12 + i * 14}
                      fontSize={11}
                      fontWeight={i === 0 ? 700 : 400}
                      fill="#222"
                      pointerEvents="none"
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}

            {/* pipes */}
            {pipes.map((p) => {
              // Phase 12.5 — pipes inside a composite channel are
              // rendered by the channel polyline above (one thick gray
              // line representing the whole trench). Skip individual
              // render here so the visual hierarchy stays clean.
              if (p.channelId) return null;
              const a = nodes.find((n) => n.id === p.fromNodeId);
              const b = nodes.find((n) => n.id === p.toNodeId);
              if (!a || !b) return null;
              let aPos = displayPos(a);
              let bPos = displayPos(b);
              // Phase 13.1 — clip pipe endpoints at the building polygon
              // perimeter when one (or both) endpoints are tagged to a
              // SchemeBuilding (Phase 12.1 outline workflow). Engineer
              // expects pipes to enter through walls, not appear from
              // the geometric centre.
              // Phase 13.16 — when the map is on, the building polygon
              // is rendered at projected (lat/lon → SVG) coords but
              // its stored x/y stays frozen. Pass the PROJECTED polygon
              // to clipPipeEndpointAtBuilding so the intersection math
              // matches the on-screen polygon perimeter at the current
              // pan/zoom. Without this the pipe enters the building's
              // ORIGINAL position (often off-screen) after any map move.
              const aBuilding = findTaggedBuilding(a.id, buildings);
              const bBuilding = findTaggedBuilding(b.id, buildings);
              const projectBuildingPolygon = (b2: typeof aBuilding) => {
                if (!b2) return undefined;
                return b2.polygon.map((v) => displayVertex(v, projectorCtx));
              };
              if (aBuilding) {
                aPos = clipPipeEndpointAtBuilding({
                  endpointAt: aPos,
                  otherEndpoint: bPos,
                  building: aBuilding,
                  displayPolygon: projectBuildingPolygon(aBuilding),
                });
              }
              if (bBuilding) {
                bPos = clipPipeEndpointAtBuilding({
                  endpointAt: bPos,
                  otherEndpoint: aPos,
                  building: bBuilding,
                  displayPolygon: projectBuildingPolygon(bBuilding),
                });
              }
              // Phase 13.20 — perpendicular shift for parallel multi-
              // circuit pipes. The offset is centred on zero (e.g. for
              // N=5 it's [-2..+2] × 4 px) and applied AFTER clipping
              // so the visible parallel lines still enter the building
              // perimeter at the correct face. Singleton pipes get
              // offset = 0 → identical to pre-Phase-13.20 rendering.
              const parallelIndex = parallelOffsetByPipeId.get(p.id) ?? 0;
              const perp =
                parallelIndex !== 0 ? perpendicularUnit(aPos, bPos) : { x: 0, y: 0 };
              const offsetDx = perp.x * parallelIndex * DEFAULT_PARALLEL_SPACING_PX;
              const offsetDy = perp.y * parallelIndex * DEFAULT_PARALLEL_SPACING_PX;
              if (offsetDx !== 0 || offsetDy !== 0) {
                aPos = { x: aPos.x + offsetDx, y: aPos.y + offsetDy };
                bPos = { x: bPos.x + offsetDx, y: bPos.y + offsetDy };
              }
              const isSelected = selection?.kind === "pipe" && selection.id === p.id;
              const isBad = violatingPipeIds.has(p.id);
              const r = results?.pipes.find((x) => x.pipeId === p.id);
              const circuit = PIPE_CIRCUITS.find((c) => c.key === p.circuit) ?? PIPE_CIRCUITS[0]!;
              // Phase 6E — layer system: pipe color, visibility, lock
              // come from the project-level layer config (with sane
              // defaults). When the layer is hidden, skip rendering;
              // when locked, the hit-area pointer-events are disabled.
              const layer = resolveLayer(p.circuit, settings.layers);
              if (!layer.visible) return null;
              // Color overlay (Zulu voda.ini bands) when results exist + overlay mode active
              let overlayColor: string | undefined;
              if (colorOverlay === "speed" && r) {
                overlayColor = colorForValue(r.v_m_s, SPEED_BANDS);
              } else if (colorOverlay === "pressure" && results) {
                const fromR = results.nodes.find((nr) => nr.nodeId === p.fromNodeId);
                if (fromR) overlayColor = colorForValue(fromR.pressureAtNode_mpa * 102, PRESSURE_BANDS);
              }
              // Layer colour wins over the legacy circuit.color when
              // no overlay / no bad / no selection state takes over.
              const stroke = isBad ? "var(--danger)" : isSelected ? "var(--accent)" : (overlayColor ?? layer.color);
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
              // Phase 12.3 — prefer bendPoints (richer with lat/lon)
              // over legacy waypoints. Both fields supported for back-
              // ward compat with Phase 6 projects.
              // Phase 13.14 — bends with lat/lon get re-projected at the
              // CURRENT pan/zoom via displayVertex so saved pipes stay
              // locked to the engineer's intended corners on the map
              // (previously they snapped back to original stored x/y).
              // Phase 13.20 — bends ALSO get the parallel-offset shift
              // applied (same dx/dy as the endpoints above) so the
              // multi-circuit fan-out stays a rigid-body parallel of
              // the original polyline shape.
              if (p.bendPoints?.length) {
                for (const bp of p.bendPoints) {
                  const dp = displayVertex(bp, projectorCtx);
                  points.push({ x: dp.x + offsetDx, y: dp.y + offsetDy });
                }
              } else if (p.waypoints?.length) {
                for (const wp of p.waypoints) {
                  points.push({ x: wp.x + offsetDx, y: wp.y + offsetDy });
                }
              } else if (angleMode === "ortho90" && Math.abs(aPos.x - bPos.x) > 1 && Math.abs(aPos.y - bPos.y) > 1) {
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
              // Phase 6.5.1 — multi-select dashed gold overlay shows
              // whenever the pipe is in the multi-selection set.
              const isPipeMultiSelected = multiSelection.pipeIds.includes(p.id);
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
                    style={{
                      cursor: layer.locked ? "not-allowed" : "pointer",
                      // Phase 6E — locked-layer pipes are non-interactive:
                      // no click, no double-click, no context menu. Engineer
                      // unlocks the layer in the LayerPanel first.
                      pointerEvents: layer.locked ? "none" : "stroke",
                    }}
                  />
                  {/* Underlay — static colored stroke */}
                  <path d={pathD} stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={circuit.dash} opacity={flowClass ? 0.45 : 1} pointerEvents="none" />
                  {/* Phase 6.5.1 — multi-select dashed gold overlay along the pipe. */}
                  {isPipeMultiSelected && (
                    <path
                      d={pathD}
                      stroke="#FFB300"
                      strokeWidth={sw + 1.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="6 3"
                      opacity={0.85}
                      pointerEvents="none"
                    />
                  )}
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
                  {/* Waypoint handles — visible only when pipe is selected.
                      Phase 13.17: route through displayVertex so geo-aware
                      waypoints follow the map under pan/zoom. Legacy non-geo
                      waypoints fall back to stored x/y. */}
                  {isSelected && p.waypoints?.map((wp, i) => {
                    const dp = displayVertex(wp, projectorCtx);
                    return (
                      <circle
                        key={`wp-${p.id}-${i}`}
                        cx={dp.x}
                        cy={dp.y}
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
                    );
                  })}
                  {/* Phase 12.3 — bend point handles. Rendered when pipe
                      is selected. Drag to reposition; right-click on
                      handle deletes (wired in 12.4 context menu). For
                      now MVP: just visible markers, full drag handler
                      to follow once context menu lands.
                      Phase 13.17: handles project from bp.geo so they
                      stay aligned with the rendered pipe path on the
                      map. Without this the handle sat at the bend's
                      ORIGINAL pan/zoom coords while the pipe line
                      moved with the map — drag started from the
                      wrong place. */}
                  {isSelected && p.bendPoints?.map((bp, i) => {
                    const dp = displayVertex(bp, projectorCtx);
                    // Phase 13.20 — handles get the same parallel-offset
                    // shift so they sit ON the visible polyline of THIS
                    // pipe (not the un-offset master path). Drag still
                    // commits raw bp.x/.y so all parallel siblings move
                    // together — the offset is purely visual.
                    return (
                      <circle
                        key={`bp-${p.id}-${i}`}
                        cx={dp.x + offsetDx}
                        cy={dp.y + offsetDy}
                        r={5}
                        fill="var(--accent, #1f5faa)"
                        stroke="var(--bg, white)"
                        strokeWidth={2}
                        data-testid={`bend-point-${p.id}-${i}`}
                        data-bend-index={i}
                        style={{ cursor: "move" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setBendPointDrag({ pipeId: p.id, index: i });
                        }}
                      />
                    );
                  })}
                  {/* Phase 13.39 — deflection-angle label at each
                      intermediate vertex of the rendered polyline.
                      Engineer report: "Шугам хэдэн Градус эргэж
                      байгааг үураг дээр яг тухайн буланд нь тоогоор
                      харуулмаар байна". The label sits on the OUTSIDE
                      of the bend (outward bisector offset) so it
                      doesn't overlap the pipe stroke or the small
                      drag handle. Skip near-straight vertices (< 5°)
                      so ortho90 auto-corners that happen to be tiny
                      step-throughs don't clutter the canvas. */}
                  {points.length > 2 && points.slice(1, -1).map((bend, i) => {
                    const prev = points[i]!;
                    const next = points[i + 2]!;
                    const deg = bendDeflectionDeg(prev, bend, next);
                    if (deg < 5) return null;
                    const bis = bendOutwardBisector(prev, bend, next);
                    const offsetPx = 16;
                    const lx = bend.x + bis.x * offsetPx;
                    const ly = bend.y + bis.y * offsetPx;
                    return (
                      <text
                        key={`bend-deg-${p.id}-${i}`}
                        x={lx}
                        y={ly}
                        fontSize={10}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fill="var(--fg-dim, #555)"
                        stroke="white"
                        strokeWidth={2.5}
                        paintOrder="stroke"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                        data-testid={`bend-deg-${p.id}-${i}`}
                      >
                        {Math.round(deg)}°
                      </text>
                    );
                  })}
                  {/* Phase 13.21 — engineer-facing multi-line label
                      panel. Replaces the legacy 2-line "DN · L" + "v · R"
                      pair with a 2-4 line callout that ALSO surfaces the
                      pipe section number (1-2, 2-3, …), circuit tag,
                      computed Q (kW or МВт), and ΔP (Pa or кПа). Toggle
                      via the same `showLiveDimensions` setting / 'D'
                      keyboard shortcut as before. */}
                  {(settings.showLiveDimensions ?? true) && (() => {
                    const aIdx = nodes.findIndex((n) => n.id === p.fromNodeId) + 1;
                    const bIdx = nodes.findIndex((n) => n.id === p.toNodeId) + 1;
                    const lines = buildPipeLabelLines({
                      pipe: p,
                      fromIndex: aIdx,
                      toIndex: bIdx,
                      fromNode: a,
                      results: results ?? undefined,
                      scheduleDeltaT_c: pipeLabelDeltaT,
                    });
                    // Phase 13.25 — prepend a role badge ("М" magistral
                    // /"С" branch) to line 1 so the engineer sees the
                    // pipe classification at a glance.
                    const role = pipeRoleByPipeId.get(p.id);
                    if (role && lines[0]) {
                      lines[0] = {
                        ...lines[0],
                        text: `[${pipeRoleBadge(role)}] ${lines[0].text}`,
                      };
                    }
                    const baseFs1 = 11;
                    const baseFs = 10;
                    const fs1 = baseFs1 / zoom;
                    const fs = baseFs / zoom;
                    const stride = 13 / zoom;
                    const haloStroke = 3 / zoom;
                    // Phase 13.28 — engineer report: "Chrome дээр
                    // screenshot хийх байдлаар системийн замбараагүй
                    // байдлыг засна уу. Алдаа их, ажиллагаа муу."
                    //
                    // Visual chaos analysis (with my 27-node fixture):
                    // Every pipe showed a 4-line label stack near the
                    // midpoint. With 16 pipes packed in 1206×568 px,
                    // labels overlapped each other AND the building
                    // rectangles. Cleaner default: ONLY the COMPACT
                    // line 1 (section · circuit · role badge) for
                    // every pipe; FULL multi-line breakdown only when
                    // the engineer SELECTS the pipe or HOVERS over it.
                    //
                    // Old Phase 13.27 compact-mode (low-map-zoom-only)
                    // is replaced — compact is now the DEFAULT view
                    // regardless of map zoom. Engineer can still see
                    // every detail per-pipe in the Inspector + the
                    // results table; the on-canvas overlay stays
                    // readable at scale.
                    const showFullDetail = isSelected;
                    const displayedLines = showFullDetail
                      ? lines
                      : lines.slice(0, 1);
                    // Phase 13.27 — translucent background box behind the
                    // text block so the engineer can read labels over
                    // busy OSM tiles + dense pipe overlays.
                    const longestText = displayedLines.reduce(
                      (max, ln) => (ln.text.length > max ? ln.text.length : max),
                      0,
                    );
                    const boxW = (longestText * baseFs * 0.62 + 12) / zoom;
                    const boxH = (displayedLines.length * baseFs * 1.3 + 6) / zoom;
                    const boxY = mp.y - 4 / zoom - displayedLines.length * stride;
                    return (
                      <g pointerEvents="none">
                        <rect
                          x={mp.x - boxW / 2}
                          y={boxY}
                          width={boxW}
                          height={boxH}
                          rx={4 / zoom}
                          fill="rgba(255, 255, 255, 0.85)"
                          stroke="rgba(0, 0, 0, 0.15)"
                          strokeWidth={1 / zoom}
                        />
                        {displayedLines.map((ln, i) => {
                          const y =
                            mp.y - 4 / zoom -
                            (displayedLines.length - 1 - i) * stride;
                          return (
                            <text
                              key={i}
                              x={mp.x}
                              y={y}
                              fontSize={i === 0 ? fs1 : fs}
                              fontFamily="var(--font-mono)"
                              fontWeight={i === 0 ? 700 : 500}
                              fill={isBad ? "var(--danger)" : ln.accent ? circuit.color : "var(--fg-muted)"}
                              stroke="var(--bg, white)"
                              strokeWidth={haloStroke}
                              paintOrder="stroke"
                              textAnchor="middle"
                            >
                              {ln.text}
                            </text>
                          );
                        })}
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* Pipe preview — Phase 13.8 includes accumulated bend points
                so engineer sees the polyline they're drawing in real time.
                Phase 13.14: every vertex is routed through `displayVertex`
                so geo-anchored from-nodes + bends stay glued to their
                lat/lon even after the engineer pans / zooms the map mid-
                draw. Without this the live line drew from the from-node's
                STALE stored x/y → appeared to "vanish" off-screen. */}
            {livePipeInfo && (() => {
              const from = nodes.find((n) => n.id === pipeFrom);
              if (!from) return null;
              const fromDp = displayPos(from);
              const to = livePipeInfo.to;
              const points: Point[] = [{ x: fromDp.x, y: fromDp.y }];
              // Phase 13.8 — captured bend points (Zulu-style mid-
              // pipe corners) render in order so the engineer sees
              // every clicked anchor in the live preview.
              // Phase 13.14 — bend.geo overrides bend.x/.y when on map.
              for (const bp of pipeBendPts) {
                const dp = displayVertex(bp, projectorCtx);
                points.push({ x: dp.x, y: dp.y });
              }
              if (
                pipeBendPts.length === 0 &&
                angleMode === "ortho90" &&
                Math.abs(fromDp.x - to.x) > 1 &&
                Math.abs(fromDp.y - to.y) > 1
              ) {
                points.push({ x: to.x, y: fromDp.y });
              }
              points.push(to);
              const pathD = points.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`).join(" ");
              const circuit = PIPE_CIRCUITS.find((c) => c.key === pendingCircuit) ?? PIPE_CIRCUITS[0]!;
              return (
                <>
                  <path d={pathD} stroke={circuit.color} strokeWidth={3} fill="none" strokeDasharray="6 4" opacity="0.65" strokeLinecap="round" strokeLinejoin="round" />
                  {/* Phase 13.8 — small warning-coloured dots at each captured bend point */}
                  {pipeBendPts.map((bp, i) => {
                    const dp = displayVertex(bp, projectorCtx);
                    return (
                      <circle key={`bend-${i}`} cx={dp.x} cy={dp.y} r={4} fill="var(--warning)" stroke="white" strokeWidth={1.5} />
                    );
                  })}
                  <text x={(fromDp.x + to.x) / 2} y={(fromDp.y + to.y) / 2 - 12} fontSize="12" fontFamily="var(--font-mono)" fill="var(--accent)" textAnchor="middle" fontWeight="600">
                    {formatLength(livePipeInfo.len_m)} · {livePipeInfo.ang.toFixed(1)}°
                    {pipeBendPts.length > 0 && ` · ${pipeBendPts.length} булан`}
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
              // Phase 6.5.1 — multi-select gold ring shows when the
              // node is part of the multi-selection set. The legacy
              // single-`isSelected` accent still drives the main
              // color change (so InspectorPanel target is obvious).
              const isMultiSelected = multiSelection.nodeIds.includes(n.id);
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
              // Phase 6.8.3 — preset × per-entity override → final
              // scale multiplier. Both factors default to 1.0 so
              // legacy nodes and legacy projects render unchanged
              // when neither is set.
              const presetKey = settings.symbolSizePreset ?? DEFAULT_SYMBOL_SIZE_PRESET;
              const presetMultiplier = SYMBOL_SIZE_PRESETS[presetKey];
              const perNodeScale = n.size_scale ?? 1.0;
              const sizeScaleFactor = presetMultiplier * perNodeScale;
              // Phase 13.4 — when this node is tag-linked to a
              // SchemeBuilding (Phase 12.4 outline workflow), the
              // polygon outline already represents the building
              // visually. Rendering ANOTHER big rect on top of it
              // double-draws and hides the polygon (engineer report:
              // "Орон сууц гэсэн tag үүссэн ба хэт том араа болон
              // дөрвөлжин дүрс барилгыг бүхэлд нь хаагаад
              // харагдахгүй болгочихлоо"). Suppress the building
              // rect for tagged nodes — they render as a small
              // centroid symbol instead, sitting INSIDE the polygon.
              const isTaggedToBuilding = (buildings ?? []).some(
                (b) => b.taggedAsNodeId === n.id,
              );
              const wm = n.width_m ?? 0;
              const hm = n.height_m ?? 0;
              // Phase 13.15 — engineer report: "Эрүүл мэндийн төв зурсан
              // доторх барилгын дүрстэй лого хэт том халхалж байна." For
              // tagged-to-building nodes the centroid logo should sit
              // PROPORTIONALLY INSIDE the polygon, not use the generic
              // 35 m consumer / 18 m source reference (which dwarfs small
              // 15-20 m hospital / kindergarten footprints). Cap the
              // logo at 0.4× the polygon's shorter plan dimension; the
              // MIN_SYMBOL_PX floor still guarantees clickability.
              const buildingMinDim_m =
                isTaggedToBuilding && wm > 0 && hm > 0
                  ? Math.min(wm, hm) * 0.4
                  : undefined;
              const rawR = computeSymbolRadiusPx(
                entityKind,
                pxPerM_for_symbol,
                sizeScaleFactor,
                buildingMinDim_m ? { maxDiameter_m: buildingMinDim_m } : undefined,
              );
              // Phase 13.36 — engineer report (after Phase 13.35 still
              // showed huge tags): "ene haraal idsen tag heterhii tom
              // bn jijigruul gej helsen bizte ugluunuus hoish 4 5 tsag
              // nrg yum zasaj chadahgui".
              //
              // Phase 13.35 capped ONLY nodes with a legacy
              // building.taggedAsNodeId link (isTaggedToBuilding).
              // The Phase 13.32 endpoint-kind-picker flow creates
              // consumer/source nodes WITHOUT that link — the
              // engineer's click point IS the consumer. Result: the
              // cap never fired for the normal flow, symbol rendered
              // at 50+ px diameter at street zoom.
              //
              // Fix: cap every consumer/source/junction-style symbol
              // node — i.e. anything that does NOT render as a
              // BuildingPlanShape (Phase 13.4 opt-in rectangle that
              // requires explicit width_m AND height_m ≥ 6 m). The
              // BuildingPlanShape branch keeps its real-scale render.
              //
              // 8 px radius → 16 px diameter on screen, Google-Maps-
              // pin sized. Selected nodes get the usual +4 px halo
              // so the engineer can spot the active pick.
              const isBuilding =
                !isTaggedToBuilding &&
                (def.category === "consumer" || def.category === "source") &&
                wm >= 6 &&
                hm >= 6;
              const TAG_MAX_R = 8;
              const computedR = !isBuilding
                ? Math.min(TAG_MAX_R, rawR)
                : rawR;
              const r = isSelected ? computedR + 4 : computedR;
              void MIN_SYMBOL_PX; // imported for downstream test-friendly access
              const isPump = def.category === "pump";
              const isActivePump = isPump && results && !isBad;
              const showErrorRings = isBad && animateErrors;
              const dp = displayPos(n);
              const hasGeo = !!n.geo;
              // `isBuilding` is computed above the cap block so the
              // cap can branch on it. Real plan view: ONLY when the
              // user explicitly set width_m & height_m (e.g. drew a
              // building polygon, or typed dimensions in inspector).
              // Defaults from nodeCatalog are NOT used here — that
              // would expand every imported DXF consumer to 30×12 m,
              // hiding the network.
              //
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
              // Phase 13.0b — building-rectangle render now honours the
              // same scale multiplier as symbol-rendered nodes
              // (SYMBOL_SIZE_PRESETS × node.size_scale). Engineers
              // reported source_tec (ТЭЦ defaults 80×50 m) couldn't be
              // shrunk via [/], SettingsPanel preset, or Inspector
              // size_scale because the building render bypassed
              // computeSymbolRadiusPx. Apply the same composite factor
              // here so all three controls work on TЭЦ.
              const wpxRaw = wm * scaleFactor * sizeScaleFactor;
              const hpxRaw = hm * scaleFactor * sizeScaleFactor;
              const wpx = usingMapScale ? Math.max(12, wpxRaw) : wpxRaw;
              const hpx = usingMapScale ? Math.max(8, hpxRaw) : hpxRaw;
              return (
                <g
                  key={n.id}
                  transform={`translate(${dp.x}, ${dp.y})`}
                  onMouseDown={(e) => onNodeMouseDown(e, n)}
                  onContextMenu={(e) => onContextMenuTarget(e, { kind: "node", id: n.id })}
                  // Phase 6.8.1 BUG #1 fix — defensive `pointerEvents: all`
                  // so the FULL group bounding box captures clicks, not just
                  // the painted SVG primitives inside. Helps when Leaflet
                  // sits below + the engineer clicks the symbol's edge.
                  style={{ cursor: readOnly ? "pointer" : "move", pointerEvents: "all" }}
                  tabIndex={0}
                  aria-label={`${n.label} (${def.name})`}
                  className={isBad && animateErrors ? "hydra-violation" : ""}
                >
                  {/* Phase 13.44 — engineer report: "Mouse 1 deer udaan
                      darah ued garaad mouse 1 darhaa bolih ued arilj
                      bn". After Phase 13.36 capped consumer/source
                      symbols at 8 px radius, the actual click target
                      shrank to a 16-px-diameter disc. Engineers
                      missing it by a few pixels hit the canvas
                      background, triggering the rubber-band false-
                      positive in onMouseUp (diag < 4 →
                      clearSelection). An invisible 22-px hit-pad
                      around the symbol catches near-misses without
                      changing the visual size. Only emitted for
                      non-BuildingPlanShape rendering — buildings
                      already have a large rect hit area. */}
                  {!isBuilding && (
                    <circle r={22} fill="transparent" pointerEvents="all" />
                  )}
                  {/* Алдааны expanding ring — only when violating */}
                  {showErrorRings && (
                    <>
                      <circle r={Math.max(12, isBuilding ? Math.min(wpx, hpx) / 2 : 12)} className="hydra-violation-ring" />
                      <circle r={Math.max(12, isBuilding ? Math.min(wpx, hpx) / 2 : 12)} className="hydra-violation-ring" style={{ animationDelay: "0.6s" }} />
                    </>
                  )}
                  {/* Phase 6.5.1 — multi-select gold ring overlay.
                      Drawn under the symbol so it appears as a halo
                      framing without obscuring the engineering icon. */}
                  {isMultiSelected && (
                    isBuilding ? (
                      <rect
                        x={-wpx / 2 - 4}
                        y={-hpx / 2 - 4}
                        width={wpx + 8}
                        height={hpx + 8}
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        pointerEvents="none"
                      />
                    ) : (
                      <circle
                        r={r + 4}
                        fill="none"
                        stroke="#FFB300"
                        strokeWidth={2}
                        strokeDasharray="3 2"
                        pointerEvents="none"
                      />
                    )
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
                    /* Phase 6C — engineering symbol library.
                       Pump body wrapper still rotates if active; the
                       SVG symbol renders inside it. Falls back to
                       JunctionSymbol for unknown kinds. */
                    <g className={isActivePump ? "hydra-pump-active" : ""}>
                      {renderSymbolFor(entityKind, {
                        radius: r,
                        color,
                        selected: isSelected,
                      })}
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

            {/* Phase 12.8 — engineering cross-reference node-number
                badges. Small dark capsule with the auto-assigned 1..N
                sequence painted at upper-right of each node, providing
                a stable index for title-block / report cross-reference.
                Rendered as a separate loop so the existing node-render
                block stays untouched. */}
            {settings.showNodeNumbers !== false &&
              nodes
                .filter((n) => !n.footprint || n.footprint.length < 3)
                .map((n) => {
                  const num = nodeNumberMap.get(n.id);
                  if (num == null) return null;
                  const dp = displayPos(n);
                  const badge = nodeNumberBadge(num);
                  // Phase 13.41 — engineer screenshot showed black "02"
                  // / "08" badges dominating small OSM buildings on the
                  // map. The SVG outer group has scale(zoom), so every
                  // pixel value below is divided by zoom to keep the
                  // badge at constant SCREEN size regardless of how far
                  // the engineer zoomed in.
                  const z = Math.max(zoom, 0.1);
                  const offX = 12 / z;
                  const offY = 12 / z;
                  const halfW = 8 / z;
                  const halfH = 6.5 / z;
                  const rx = 2.5 / z;
                  const fontPx = 8.5 / z;
                  const baselineDy = 2.5 / z;
                  const bx = dp.x + offX;
                  const by = dp.y - offY;
                  return (
                    // Phase 13.44 — the badge USED to have
                    // pointerEvents="none" so it didn't block clicks.
                    // The unintended consequence: clicking the
                    // visible "05" black tag passed through to the
                    // SVG canvas, which started a tiny rubber-band
                    // (diag < 4 px) → onMouseUp clearSelection() ran
                    // → the Inspector "halь үзэгдээд алга болчихлоо".
                    // Make the badge clickable + delegate to
                    // onNodeMouseDown so the badge is part of the
                    // node's hit area. The aria-label also ensures
                    // the canvas onMouseDown's `isEmpty` heuristic
                    // (`target.closest("g[aria-label]")`) recognises
                    // the badge as a node element.
                    <g
                      key={`nn_${n.id}`}
                      aria-label={`node-${n.id}-badge`}
                      onMouseDown={(e) => onNodeMouseDown(e, n)}
                      style={{ cursor: readOnly ? "pointer" : "move" }}
                    >
                      <rect
                        x={bx - halfW}
                        y={by - halfH}
                        width={halfW * 2}
                        height={halfH * 2}
                        rx={rx}
                        fill="#222"
                        opacity={0.85}
                      />
                      <text
                        x={bx}
                        y={by + baselineDy}
                        textAnchor="middle"
                        fontSize={fontPx}
                        fill="white"
                        fontWeight={700}
                        pointerEvents="none"
                      >
                        {badge}
                      </text>
                    </g>
                  );
                })}

            {/* Phase 12.8 — pipe flow-direction arrows. Small chevron
                at each pipe midpoint pointing in the flow direction
                (geometric from→to or solver-reversed when G_kg_s < 0).
                Skipped for pipes inside a composite channel.
                Phase 13.20 — apply parallel offset so multi-circuit
                arrows fan out alongside their pipes. Phase 13.21 —
                thicker stroke (1.5 → 2.25 px) + circuit-aware fill
                so arrows stand out on busy map backgrounds.
                Phase 13.22 — recompute arrow positions from the
                DISPLAYED polyline (with map projection + parallel
                offset) so the chevron lands ON the visible pipe.
                Pre-Phase-13.22 the arrows came from
                `buildAllArrows(pipes, nodes, …)` which uses raw
                `node.x/.y` — those go stale on map pan so arrows
                drifted "off the pipe" by 10s of px. */}
            {settings.showFlowArrows !== false &&
              pipes
                .filter((p) => !p.channelId)
                .map((p) => {
                  const fromNode = nodes.find((n) => n.id === p.fromNodeId);
                  const toNode = nodes.find((n) => n.id === p.toNodeId);
                  if (!fromNode || !toNode) return null;
                  // Build the same displayed polyline the pipe path
                  // renders with (Phase 13.14 + 13.20).
                  const points: Point[] = [];
                  const aDp = displayPos(fromNode);
                  const bDp = displayPos(toNode);
                  points.push({ x: aDp.x, y: aDp.y });
                  if (p.bendPoints?.length) {
                    for (const bp of p.bendPoints) {
                      const dp = displayVertex(bp, projectorCtx);
                      points.push({ x: dp.x, y: dp.y });
                    }
                  } else if (p.waypoints?.length) {
                    for (const wp of p.waypoints) points.push({ x: wp.x, y: wp.y });
                  }
                  points.push({ x: bDp.x, y: bDp.y });
                  // Apply parallel offset perpendicular to from→to.
                  const parallelIndex = parallelOffsetByPipeId.get(p.id) ?? 0;
                  let dx = 0;
                  let dy = 0;
                  if (parallelIndex !== 0) {
                    const perp = perpendicularUnit(aDp, bDp);
                    dx = perp.x * parallelIndex * DEFAULT_PARALLEL_SPACING_PX;
                    dy = perp.y * parallelIndex * DEFAULT_PARALLEL_SPACING_PX;
                  }
                  const shifted = dx !== 0 || dy !== 0
                    ? points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
                    : points;
                  const reversed = isPipeFlowReversed(
                    p.id,
                    results ? "computed" : "geometric",
                    results ?? undefined,
                  );
                  const arrow = buildArrowFromDisplayedPolyline(
                    p.id,
                    shifted,
                    reversed,
                  );
                  if (!arrow) return null;
                  const circuitDef = PIPE_CIRCUITS.find((c) => c.key === p.circuit);
                  const arrowColor = circuitDef?.color ?? "#1F2937";
                  return (
                    <g key={`fa_${arrow.pipeId}`} pointerEvents="none">
                      <line
                        x1={arrow.tail1X}
                        y1={arrow.tail1Y}
                        x2={arrow.tipX}
                        y2={arrow.tipY}
                        stroke={arrowColor}
                        strokeWidth={2.25}
                        strokeLinecap="round"
                      />
                      <line
                        x1={arrow.tail2X}
                        y1={arrow.tail2Y}
                        x2={arrow.tipX}
                        y2={arrow.tipY}
                        stroke={arrowColor}
                        strokeWidth={2.25}
                        strokeLinecap="round"
                      />
                    </g>
                  );
                })}

            {/* Phase 6.5.1 — rubber-band selection rectangle, drawn
                inside the zoom/pan group so it tracks the underlying
                coordinates. Translucent gold fill + dashed gold border. */}
            {rubberBand && (() => {
              const x = Math.min(rubberBand.startSvg.x, rubberBand.endSvg.x);
              const y = Math.min(rubberBand.startSvg.y, rubberBand.endSvg.y);
              const w = Math.abs(rubberBand.endSvg.x - rubberBand.startSvg.x);
              const h = Math.abs(rubberBand.endSvg.y - rubberBand.startSvg.y);
              return (
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill="#FFB300"
                  fillOpacity={0.08}
                  stroke="#FFB300"
                  strokeWidth={1.2}
                  strokeDasharray="4 3"
                  pointerEvents="none"
                />
              );
            })()}
          </g>
        </g>

        {/* Rulers */}
        <Rulers zoom={zoom} pan={pan} width={2000} height={2000} />
        {cursorM && (
          <text x={6} y={16} fontSize="11" fontFamily="var(--font-mono)" fill="var(--accent)">
            X={cursorM.x.toFixed(2)}м Y={cursorM.y.toFixed(2)}м
          </text>
        )}

        {/* Phase 6.7.1 — Scale bar (viewport-anchored, outside pan/zoom).
            Tick spacing follows the active pxPerMeter so the engineer
            can verify the canvas matches the declared print scale.
            Placed last in the SVG so it renders on top of everything. */}
        {svgViewport.height > 0 && (
          <ScaleBar
            scale={settings.printScale ?? DEFAULT_SCALE}
            paperSize={settings.printPaperSize ?? DEFAULT_PAPER_SIZE}
            orientation={settings.printOrientation ?? DEFAULT_PAPER_ORIENTATION}
            x={16}
            y={svgViewport.height - 36}
            pxPerMeter={
              showMap && mapPxPerMeter && mapPxPerMeter > 0
                ? mapPxPerMeter
                : PX_PER_METER * zoom
            }
          />
        )}

        {/* Phase 6.7.2 — Title block preview (viewport-anchored, outside
            pan/zoom). Renders bottom-right. mmToPx kept at 1.5 so the
            corner widget is roughly 280×105 px on A3 landscape — a
            useful preview without dominating the canvas. The PDF
            exporter (Phase 6.7.4) will call <TitleBlock> with the real
            paper-mm-to-PDF-pt conversion for true 1:1 print output. */}
        {svgViewport.height > 0 && svgViewport.width > 0 && (() => {
          const paperSize = settings.printPaperSize ?? DEFAULT_PAPER_SIZE;
          const orientation = settings.printOrientation ?? DEFAULT_PAPER_ORIENTATION;
          const tbDims = titleBlockDimensionsMm(paperSize, orientation);
          // paperDimensionsMm import kept so this preview can later be
          // upgraded to "page rect outline" without a re-import.
          void paperDimensionsMm;
          const mmToPx = 1.5;
          const tbWidthPx = tbDims.width * mmToPx;
          const tbHeightPx = tbDims.height * mmToPx;
          return (
            <TitleBlock
              meta={settings.titleBlock}
              scale={settings.printScale ?? DEFAULT_SCALE}
              paperSize={paperSize}
              orientation={orientation}
              x={svgViewport.width - tbWidthPx - 16}
              y={svgViewport.height - tbHeightPx - 16}
              mmToPx={mmToPx}
            />
          );
        })()}

        {/* Phase 6.7.3 — North arrow (viewport-anchored singleton).
            Default position is computed top-right; engineer can drag
            it anywhere on the viewport and rotate via the Inspector. */}
        {svgViewport.width > 0 && svgViewport.height > 0 && (() => {
          const def = applyNorthArrowDefaults(
            settings.northArrow,
            svgViewport.width,
            svgViewport.height,
            NORTH_ARROW_CANVAS_MMTOPX,
          );
          const isNaSelected = selection?.kind === "northArrow";
          return (
            <NorthArrow
              x_px={def.x_px}
              y_px={def.y_px}
              rotation_deg={def.rotation_deg}
              mmToPx={NORTH_ARROW_CANVAS_MMTOPX}
              isSelected={isNaSelected}
              onMouseDown={(e) => {
                if (readOnly) return;
                if (mode !== "select") return;
                e.stopPropagation();
                e.preventDefault();
                // Select the arrow + begin drag.
                select({ kind: "northArrow", id: "" });
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                setNorthArrowDrag({
                  startMouse: {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                  },
                  startArrow: { x: def.x_px, y: def.y_px },
                });
              }}
            />
          );
        })()}
      </svg>

      {/* Phase 12.2 — Live AutoCAD-style dimension HUD. Renders as a
          floating DOM overlay (NOT in SVG) so it can position with
          edge-aware fixed coords. Active during pipe draw + building
          polygon + measurement modes when cursor is over canvas. */}
      {mouseViewport && livePipeInfo && mode === "addPipe" && (
        <DrawingHud
          cursorViewport={mouseViewport}
          viewport={{ width: window.innerWidth, height: window.innerHeight }}
          distance_m={livePipeInfo.len_m}
          angleRad={(livePipeInfo.ang * Math.PI) / 180}
          modeLabel="Хоолой зурж байна"
        />
      )}
      {mouseViewport && liveBuildingInfo && mode === "drawBuilding" && (
        <DrawingHud
          cursorViewport={mouseViewport}
          viewport={{ width: window.innerWidth, height: window.innerHeight }}
          distance_m={liveBuildingInfo.len_m}
          angleRad={(() => {
            const last = polygon[polygon.length - 1]!;
            const to = liveBuildingInfo.to;
            return Math.atan2(to.y - last.y, to.x - last.x);
          })()}
          modeLabel={`Барилга зурж байна (${polygon.length} цэг)`}
        />
      )}

      {/* Phase 6.5 BatchOpsToolbar — rotate / mirror / array on multi-
          selection. Phase 13.9 — engineer-requested hide; the same
          actions remain available via the right-click context menu
          and the keyboard shortcuts that BatchOpsToolbar exposed
          (Ctrl+D duplicate, Del delete, etc.). Engineers found the
          permanent top-of-canvas strip "Бөгөмөөр:" added clutter
          to the editor.

          NOTE: Import kept on purpose so re-enabling is a one-line
          re-render — engineer feedback may revisit this. */}
      {false && !readOnly && (
        <BatchOpsToolbar
          onToastMessage={(text) =>
            setToast({ text, key: Date.now(), tone: "success" })
          }
        />
      )}

      {/* Phase 6.5.2 — Ephemeral toast for copy/cut/paste feedback.
          Re-mounts on key change so consecutive identical messages
          still play the fade-in. */}
      {toast && (
        <Toast
          key={toast.key}
          message={toast.text}
          tone={toast.tone}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Phase 6.5.1 / 6.8.6 — Multi-selection counter HUD. Shows
          when 2+ objects selected. Bottom-left to stay clear of the
          bottom-right results HUD. Phase 6.8.6 added buildings to
          the count so the engineer sees the full multi-selection
          shape ("3 цэг, 1 хоолой, 2 барилга сонгогдсон"). */}
      {(() => {
        const nCount = multiSelection.nodeIds.length;
        const pCount = multiSelection.pipeIds.length;
        const bCount = (multiSelection.buildingIds ?? []).length;
        const total = nCount + pCount + bCount;
        if (total <= 1) return null;
        const segments: string[] = [];
        if (nCount > 0) segments.push(`${nCount} цэг`);
        if (pCount > 0) segments.push(`${pCount} хоолой`);
        if (bCount > 0) segments.push(`${bCount} барилга`);
        return (
          <div
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              background: "var(--bg-elev, #2a2a2a)",
              border: "1px solid #FFB300",
              color: "#FFB300",
              padding: "0.4rem 0.7rem",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-mono, monospace)",
              zIndex: 5,
              pointerEvents: "none",
            }}
            data-testid="selection-counter"
          >
            {segments.join(", ")}{" сонгогдсон"}
          </div>
        );
      })()}

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

      {/* Phase 13.18 — multi-circuit picker. Opens on right-click in
          addPipe mode (engineer report: "Mouse 2 дээрээс нэмэх
          тохиргоог оруулна уу"). Toggle which extra circuits to
          draw simultaneously with the current pendingCircuit. State
          persists across pipe-draw commits until the engineer
          unchecks them or exits addPipe mode. */}
      {circuitPickerAt && (
        <div
          style={{
            position: "fixed",
            left: circuitPickerAt.x + 4,
            top: circuitPickerAt.y + 4,
            background: "var(--bg-elev, #2a2a2a)",
            border: "1px solid var(--border, #444)",
            borderRadius: 8,
            padding: "0.5rem 0.6rem",
            fontSize: 12,
            color: "var(--fg, #e8e8e8)",
            zIndex: 50,
            boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
            minWidth: 240,
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--accent, #1f5faa)" }}>
            🔀 Давхар шугам сонгох
          </div>
          <div style={{ marginBottom: 8, fontSize: 11, color: "var(--fg-muted, #999)" }}>
            Тэмдэглэсэн circuit бүрд нэг шугам үүсгэнэ
          </div>
          {PIPE_CIRCUITS.map((c) => {
            const isPending = c.key === pendingCircuit;
            const isExtra = extraCircuits.has(c.key);
            const checked = isPending || isExtra;
            return (
              <label
                key={c.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "0.25rem 0.1rem",
                  cursor: isPending ? "default" : "pointer",
                  opacity: isPending ? 0.7 : 1,
                }}
                title={isPending ? "Үндсэн circuit — толгой панелаас солино" : "Tag-нэмэх / хасах"}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isPending}
                  onChange={(ev) => {
                    if (isPending) return; // can't uncheck the main one here
                    setExtraCircuits((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(c.key);
                      else next.delete(c.key);
                      return next;
                    });
                  }}
                />
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 6,
                    background: c.color,
                    borderRadius: 2,
                    border: c.dash ? `1px dashed ${c.color}` : "none",
                  }}
                />
                <span style={{ flex: 1 }}>{c.label}</span>
                {isPending && (
                  <span style={{ fontSize: 10, color: "var(--accent, #1f5faa)", fontWeight: 700 }}>
                    Үндсэн
                  </span>
                )}
              </label>
            );
          })}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 8,
              paddingTop: 6,
              borderTop: "1px solid var(--border-soft, #333)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                // Quick preset: Т1 + Т2 (heating supply + return)
                setExtraCircuits(new Set(["heating_return"]));
                if (pendingCircuit !== "heating_supply") setPendingCircuit("heating_supply");
              }}
              style={pickerBtn}
              title="Халаалт: Т1 + Т2"
            >
              Халаалт ×2
            </button>
            <button
              type="button"
              onClick={() => {
                // Full preset: Т1 + Т2 + Т3 + Т4
                setExtraCircuits(new Set(["heating_return", "dhw_supply", "dhw_recirc"]));
                if (pendingCircuit !== "heating_supply") setPendingCircuit("heating_supply");
              }}
              style={pickerBtn}
              title="Халаалт + ХУС: Т1+Т2+Т3+Т4"
            >
              Т1+2+3+4
            </button>
            <button
              type="button"
              onClick={() => setExtraCircuits(new Set())}
              style={{ ...pickerBtn, marginLeft: "auto" }}
              title="Бүх давхар сонголтыг арилгана"
            >
              ✕ Цэвэрлэх
            </button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--fg-dim, #aaa)" }}>
            Идэвхтэй: <strong>{1 + extraCircuits.size}</strong> шугам · ESC хаах
          </div>
        </div>
      )}

      {/* Phase 13.22 Task 7 — branch-from-pipe chamber/valve prompt.
          After the engineer commits the branch pipe started from a
          right-click "🌿 Салбар шугам зурах", we ask whether to ALSO
          add a chamber or valve at the branch junction (engineer's
          explicit ask). The prompt is dismissable. */}
      {/* Phase 13.32 — pipe-endpoint kind picker. Floats next to the
          newly-auto-created J-N node so the engineer assigns its real
          type (Станц / УДДТ / Зуух / Орон сууц / Эмнэлэг / Сургууль
          / Цэцэрлэг / Оффис) immediately. Esc dismisses → node stays
          a plain junction. */}
      {pendingEndpointPicker && (() => {
        const node = nodes.find((n) => n.id === pendingEndpointPicker.nodeId);
        if (!node) {
          setPendingEndpointPicker(null);
          return null;
        }
        // Resolve screen-space position from current pan/zoom so the
        // popover sticks to the node even if the engineer pans first.
        const svgEl = svgRef.current;
        const rect = svgEl?.getBoundingClientRect();
        if (!rect) return null;
        const dp = displayPos(node);
        const screenX = rect.left + RULER_PX + (dp.x + pan.x) * zoom;
        const screenY = rect.top + RULER_PX + (dp.y + pan.y) * zoom;
        const KIND_GROUPS: Array<{
          title: string;
          items: Array<{ kind: string; icon: string; label: string }>;
        }> = [
          {
            title: "Эх үүсвэр",
            items: [
              { kind: "source_tec", icon: "🏭", label: "Эх үүсвэр (Станц)" },
              { kind: "source_substation", icon: "⊕", label: "УДДТ" },
              { kind: "source_boiler", icon: "🔥", label: "Зуух" },
            ],
          },
          {
            title: "Хэрэглэгч",
            items: [
              { kind: "consumer_apartment", icon: "🏢", label: "Орон сууц" },
              { kind: "consumer_hospital", icon: "🏥", label: "Эмнэлэг" },
              { kind: "consumer_school", icon: "🏫", label: "Сургууль" },
              { kind: "consumer_kindergarten", icon: "🧒", label: "Цэцэрлэг" },
              { kind: "consumer_office", icon: "🏛", label: "Оффис" },
              { kind: "consumer_retail", icon: "🏪", label: "Дэлгүүр" },
              { kind: "consumer_industrial", icon: "🏗", label: "Үйлдвэр" },
            ],
          },
        ];
        const applyKind = (kind: string) => {
          const def = getNodeKind(kind);
          if (!def) return;
          // Pull label + load + pressure defaults from nodeCatalog so
          // Inspector immediately shows realistic heat load.
          // Phase 13.34 — engineer report: "Энэ юу вэ цэснээс УДДТ /
          // Орон сууц гэж сонгоход тэг ний дүрс хэт том буюу
          // барилгаасаа том байна." Root cause: this picker used to
          // also seed `width_m / height_m / floors` from kind defaults
          // (e.g. consumer_apartment → 30×12m, 9 floors). With those
          // set, the renderer's `isBuilding` check at line 5247 fires
          // → BuildingPlanShape renders a 30×12m rectangle bigger
          // than the engineer's drawn polygon. Fix: drop the
          // dimension defaults so the node renders as a small symbol
          // (Phase 13.15 capped at the polygon's min dim if tagged).
          // Engineer sets real dims via Inspector → manually meaningful.
          const sameKindCount = nodes.filter((n) => n.kind === kind).length;
          const label = `${def.shortLabel}-${sameKindCount + 1}`;
          updateNode(node.id, {
            kind,
            label,
            ...(def.defaults?.heatLoad_w ? { heatLoad_w: def.defaults.heatLoad_w } : {}),
            ...(def.defaults?.requiredPressure_mpa ? { requiredPressure_mpa: def.defaults.requiredPressure_mpa } : {}),
            // Phase 13.34 — DELIBERATELY no width_m / height_m / floors
            // here. Building polygon (when drawn) already gives the
            // engineer the visual outline; a duplicate large rectangle
            // from BuildingPlanShape just clutters the canvas.
          });
          setPendingEndpointPicker(null);
          setToast({
            text: `${label} болгож сонголоо`,
            key: Date.now(),
            tone: "success",
          });
        };
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: Math.max(8, screenY + 16),
              left: Math.min(window.innerWidth - 280, screenX + 16),
              zIndex: 200,
              background: "var(--bp-bg-2, #fff)",
              border: "2px solid var(--accent, #1f5faa)",
              borderRadius: 8,
              padding: 10,
              minWidth: 240,
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
              fontFamily: "var(--font-sans)",
            }}
            data-testid="endpoint-kind-picker"
          >
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "var(--accent)" }}>
              Энэ цэг юу вэ? ({node.label})
            </div>
            {KIND_GROUPS.map((group) => (
              <div key={group.title} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: "var(--bp-text-3, #888)", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  {group.title}
                </div>
                {group.items.map((it) => (
                  <button
                    key={it.kind}
                    type="button"
                    onClick={() => applyKind(it.kind)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "5px 8px",
                      fontSize: 12,
                      border: 0,
                      background: "transparent",
                      cursor: "pointer",
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bp-bg-hover, #eef)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {it.icon} {it.label}
                  </button>
                ))}
              </div>
            ))}
            <div style={{ height: 1, background: "var(--bp-line-2, #ddd)", margin: "4px 0" }} />
            <button
              type="button"
              onClick={() => setPendingEndpointPicker(null)}
              style={{
                width: "100%",
                padding: "5px 8px",
                fontSize: 11,
                border: 0,
                background: "transparent",
                color: "var(--bp-text-3, #888)",
                cursor: "pointer",
                borderRadius: 4,
              }}
            >
              ✕ Зөвхөн зангилаа байг (J-N)
            </button>
          </div>
        );
      })()}

      {pendingBranchPrompt && mode === "select" && (
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--bg-elev, #2a2a2a)",
            border: "2px solid var(--accent, #1f5faa)",
            borderRadius: 10,
            padding: "1rem 1.25rem",
            fontSize: 13,
            color: "var(--fg, #e8e8e8)",
            zIndex: 200,
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            minWidth: 340,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14, color: "var(--accent, #1f5faa)" }}>
            🌿 Салбар цэгт юу нэмэх вэ?
          </div>
          <div style={{ marginBottom: 12, fontSize: 12, color: "var(--fg-muted, #999)" }}>
            Салбар цэг (Tee) дээр стандартын дагуу шалгах камер, хаалт суурилуулах боломжтой
            <br />
            (БНбД 41-02-13 §6.3 / СНиП 41-02-2003 §9.6.10).
          </div>
          {(() => {
            const teeNodeId = pendingBranchPrompt.teeNodeId;
            const teeNode = nodes.find((n) => n.id === teeNodeId);
            if (!teeNode) {
              // Defensive — the tee got removed somehow; close.
              setPendingBranchPrompt(null);
              return null;
            }
            const placeAtTee = (extraKind: string) => {
              // Create a new co-located node at the tee position. We
              // don't reshape the existing pipes — the chamber/valve
              // sits AT the tee as a sibling node. Engineer can move
              // it via Inspector if needed.
              const def = getNodeKind(extraKind);
              const idPrefix =
                extraKind === "chamber" || extraKind === "well_supply"
                  ? extraKind === "well_supply" ? "well" : "ch"
                  : "v";
              const labelPrefix = def?.shortLabel ?? "X";
              const newId = uid(idPrefix);
              pushUndoSnapshot(`Салбар цэгт ${def?.name ?? extraKind} нэмсэн`, 1);
              addNode({
                id: newId,
                kind: extraKind,
                label: `${labelPrefix}-${nodes.filter((n) => n.kind === extraKind).length + 1}`,
                x: teeNode.x + 14, // tiny offset so the icons don't completely overlap
                y: teeNode.y - 14,
                ...(teeNode.geo ? { geo: teeNode.geo } : {}),
              });
            };
            return (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    placeAtTee("chamber");
                    setPendingBranchPrompt(null);
                    setToast({
                      text: "🛡 Салбар цэгт шалгах камер нэмлээ",
                      key: Date.now(),
                      tone: "success",
                    });
                  }}
                  style={branchPromptBtn}
                >
                  🛡 Шалгах камер нэмэх
                </button>
                <button
                  type="button"
                  onClick={() => {
                    placeAtTee("valve_ball");
                    setPendingBranchPrompt(null);
                    setToast({
                      text: "🚿 Салбар цэгт бөмбөлөг хаалт нэмлээ",
                      key: Date.now(),
                      tone: "success",
                    });
                  }}
                  style={branchPromptBtn}
                >
                  🚿 Бөмбөлөг хаалт нэмэх
                </button>
                <button
                  type="button"
                  onClick={() => {
                    placeAtTee("chamber");
                    placeAtTee("valve_ball");
                    setPendingBranchPrompt(null);
                    setToast({
                      text: "🛡🚿 Салбар цэгт камер + хаалт нэмлээ",
                      key: Date.now(),
                      tone: "success",
                    });
                  }}
                  style={branchPromptBtn}
                >
                  🛡🚿 Аль аль нь нэмэх
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPendingBranchPrompt(null);
                    setToast({
                      text: "Салбар үүсгэв (нэмэлт зүйл нэмэхгүй)",
                      key: Date.now(),
                      tone: "neutral",
                    });
                  }}
                  style={{ ...branchPromptBtn, opacity: 0.7 }}
                >
                  ✕ Үгүй, орхих
                </button>
              </div>
            );
          })()}
        </div>
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
              : target.kind === "building"
                ? (buildings ?? []).find((b) => b.id === target.id)?.label
                : pipes.find((p) => p.id === target.id)?.id;
            const next = window.prompt("Шинэ нэр:", cur ?? "");
            if (next !== null && next.trim()) {
              if (target.kind === "node") updateNode(target.id, { label: next.trim() });
              else if (target.kind === "building") {
                useHydraulicStore.setState((s) => ({
                  buildings: (s.buildings ?? []).map((b) =>
                    b.id === target.id ? { ...b, label: next.trim() } : b,
                  ),
                }));
              }
              // pipes don't have label; skip for now
            }
            setContextMenu(null);
          }}
          onDelete={() => {
            const target = contextMenu.target;
            if (!window.confirm("Энэ элементийг устгах уу?")) return;
            if (target.kind === "node") removeNode(target.id);
            else if (target.kind === "building") {
              // Phase 12.4 — also delete the tagged node if present
              const b = (buildings ?? []).find((bb) => bb.id === target.id);
              if (b?.taggedAsNodeId) removeNode(b.taggedAsNodeId);
              useHydraulicStore.setState((s) => ({
                buildings: (s.buildings ?? []).filter((bb) => bb.id !== target.id),
              }));
            }
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
          onPlaceOnPipe={(kindOrSentinel, tOrDistance) => {
            // Phase 13.21-13.24 — generic split-and-insert on pipe.
            // Atomic op: addNode → addPipe × 2 → removePipe (original),
            // all wrapped in one undo snapshot. Dispatches on the
            // `kindOrSentinel` argument:
            //   "__auto_chamber__" → Phase 13.21 chamber/well (auto by circuit)
            //   "__branch_tee__"   → Phase 13.22 Task 7 tee + addPipe entry
            //   "valve_*"          → Phase 13.22 Task 5 valve subtype
            //   "compensator_*"    → Phase 13.24 compensator placement
            //
            // `tOrDistance` semantics:
            //   t ∈ [0, 1]            → use as parametric fraction
            //   t < 0  ("__cursor__") → Phase 13.24 project right-click
            //                           svgPt onto the displayed polyline
            //                           and use the projected t
            //   t > 1  ("distance")   → metres-from-start (1000 + m)
            const target = contextMenu.target;
            if (target.kind !== "pipe") return;
            const pipe = pipes.find((p) => p.id === target.id);
            if (!pipe) return;
            const fromNode = nodes.find((n) => n.id === pipe.fromNodeId);
            const toNode = nodes.find((n) => n.id === pipe.toNodeId);
            if (!fromNode || !toNode) return;
            let t = tOrDistance;
            if (tOrDistance < 0) {
              // Phase 13.24 — cursor mode. Build the same displayed
              // polyline the renderer uses (Phase 13.14 displayVertex
              // + Phase 13.20 parallel offset NOT applied here since
              // the click is at the SCREEN polyline already), then
              // project the right-click svgPt onto it.
              const svgPt = contextMenu.svgPt;
              if (svgPt) {
                const fromDp = displayPos(fromNode);
                const toDp = displayPos(toNode);
                const polylineDp: Array<{ x: number; y: number }> = [fromDp];
                if (pipe.bendPoints?.length) {
                  for (const bp of pipe.bendPoints) {
                    const dp = displayVertex(bp, projectorCtx);
                    polylineDp.push({ x: dp.x, y: dp.y });
                  }
                } else if (pipe.waypoints?.length) {
                  for (const wp of pipe.waypoints) polylineDp.push({ x: wp.x, y: wp.y });
                }
                polylineDp.push(toDp);
                const proj = projectPointOnPolyline(svgPt, polylineDp);
                t = proj?.t ?? 0.5;
                // Clamp away from endpoints — the calc engine needs a
                // positive length on every sub-pipe.
                t = Math.max(0.02, Math.min(0.98, t));
              } else {
                t = 0.5; // defensive fallback
              }
            } else if (tOrDistance > 1) {
              const meters = tOrDistance - 1000;
              const totalLen = pipe.length_m > 0 ? pipe.length_m : 1;
              t = Math.max(0.01, Math.min(0.99, meters / totalLen));
            }
            const split = splitPipeAtFraction({
              pipe,
              from: { x: fromNode.x, y: fromNode.y, ...(fromNode.geo ? { lat: fromNode.geo.lat, lon: fromNode.geo.lon } : {}) },
              to: { x: toNode.x, y: toNode.y, ...(toNode.geo ? { lat: toNode.geo.lat, lon: toNode.geo.lon } : {}) },
              t,
            });
            // Resolve the actual node kind + label prefix from the
            // sentinel / kind arg.
            let kind = kindOrSentinel;
            let labelPrefix = "К";
            let idPrefix = "n";
            let toastText = "Зангилаа байрлуулсан";
            let isBranchTee = false;
            if (kindOrSentinel === "__auto_chamber__") {
              kind = defaultChamberKindForCircuit(pipe.circuit);
              labelPrefix = kind === "well_supply" ? "ХУ-ШХ" : "ШК";
              idPrefix = kind === "well_supply" ? "well" : "ch";
              toastText = kind === "well_supply"
                ? "💧 Шалгах худаг үүсгэв (БНбД 40-05 §7)"
                : "🛡 Шалгах камер үүсгэв (БНбД 41-02-13 §6.3)";
            } else if (kindOrSentinel === "__branch_tee__") {
              kind = "tee"; // see nodeCatalog
              labelPrefix = "Т";
              idPrefix = "tee";
              isBranchTee = true;
            } else if (kindOrSentinel.startsWith("valve_")) {
              const def = getNodeKind(kindOrSentinel);
              labelPrefix = def?.shortLabel ?? "В";
              idPrefix = "v";
              toastText = `🚿 ${def?.name ?? "Хаалт"} байрлуулсан`;
            } else if (kindOrSentinel.startsWith("compensator_")) {
              // Phase 13.24 — compensator placement at the cursor.
              // ζ ≈ 1.5 default (BNbD 41-02-13 Table 6.2 for axial).
              const def = getNodeKind(kindOrSentinel);
              labelPrefix = def?.shortLabel ?? "К";
              idPrefix = "k";
              toastText = `🔄 ${def?.name ?? "Компенсатор"} байрлуулсан (БНбД 41-02-13 §6.2)`;
            }
            const insId = uid(idPrefix);
            pushUndoSnapshot(toastText, 4);
            addNode({
              id: insId,
              kind,
              label: `${labelPrefix}-${nodes.filter((n) => n.kind === kind).length + 1}`,
              x: Math.round(split.point.x),
              y: Math.round(split.point.y),
              ...(typeof split.point.lat === "number" && typeof split.point.lon === "number"
                ? { geo: { lat: split.point.lat, lon: split.point.lon } }
                : {}),
            });
            addPipe({
              id: uid("pipe"),
              fromNodeId: pipe.fromNodeId,
              toNodeId: insId,
              materialKey: pipe.materialKey,
              dn: pipe.dn,
              length_m: split.lengthFirst_m,
              circuit: pipe.circuit,
              ...(split.bendsBefore.length > 0 ? { bendPoints: split.bendsBefore } : {}),
            });
            addPipe({
              id: uid("pipe"),
              fromNodeId: insId,
              toNodeId: pipe.toNodeId,
              materialKey: pipe.materialKey,
              dn: pipe.dn,
              length_m: split.lengthSecond_m,
              circuit: pipe.circuit,
              ...(split.bendsAfter.length > 0 ? { bendPoints: split.bendsAfter } : {}),
            });
            removePipe(pipe.id);
            setContextMenu(null);
            // Phase 13.22 Task 7 — for a branch tee, auto-enter addPipe
            // mode anchored at the new tee + remember that we're in
            // mid-branch so the post-commit dialog can offer to add a
            // chamber/valve at the branch point.
            if (isBranchTee) {
              setPipeFrom(insId);
              setPipeBendPts([]);
              setMode("addPipe");
              setAngleMode("free");
              setPendingBranchPrompt({ teeNodeId: insId });
              setToast({
                text: "🌿 Салбар цэг үүсгэв. Одоо салбар шугамыг зурна уу. Дуусгасны дараа худаг/хаалт асуух болно.",
                key: Date.now(),
                tone: "neutral",
              });
            } else {
              setToast({
                text: toastText,
                key: Date.now(),
                tone: "success",
              });
            }
          }}
          groupSize={multiSelection.nodeIds.length + multiSelection.pipeIds.length}
          onDeleteGroup={() => {
            const ms = useHydraulicStore.getState().multiSelection;
            const total = ms.nodeIds.length + ms.pipeIds.length;
            if (total < 2) return;
            if (!window.confirm(`${total} элементийг устгах уу?`)) return;
            const pipeIds = [...ms.pipeIds];
            const nodeIds = [...ms.nodeIds];
            for (const pid of pipeIds) removePipe(pid);
            for (const nid of nodeIds) removeNode(nid);
            clearSelection();
            setContextMenu(null);
          }}
          onDeselectAll={() => {
            clearSelection();
            setContextMenu(null);
          }}
          isPipe={contextMenu.target.kind === "pipe"}
          hasWaypoints={
            contextMenu.target.kind === "pipe" &&
            (pipes.find((p) => p.id === contextMenu.target.id)?.waypoints?.length ?? 0) > 0
          }
          isBuilding={contextMenu.target.kind === "building"}
          taggedKind={
            contextMenu.target.kind === "building"
              ? (buildings ?? []).find((b) => b.id === contextMenu.target.id)?.taggedAsKind
              : undefined
          }
          onTagAs={(kind: string) => {
            const target = contextMenu.target;
            if (target.kind !== "building") return;
            const building = (buildings ?? []).find((b) => b.id === target.id);
            if (!building) return;
            // Phase 12.4 — atomic tag-as: build params then dispatch
            // addNode + patchBuilding so undo treats both as one op.
            const { node, buildingPatch } = buildTagAsParams(
              building,
              kind,
              useHydraulicStore.getState().nodes,
            );
            const store = useHydraulicStore.getState();
            store.addNode(node);
            // Patch building inline via setState since the store doesn't
            // have a dedicated updateBuilding action yet.
            useHydraulicStore.setState((s) => ({
              buildings: (s.buildings ?? []).map((b) =>
                b.id === target.id ? { ...b, ...buildingPatch } : b,
              ),
            }));
            setContextMenu(null);
          }}
          onUntag={() => {
            const target = contextMenu.target;
            if (target.kind !== "building") return;
            const building = (buildings ?? []).find((b) => b.id === target.id);
            if (!building) return;
            const store = useHydraulicStore.getState();
            if (building.taggedAsNodeId) {
              store.removeNode(building.taggedAsNodeId);
            }
            useHydraulicStore.setState((s) => ({
              buildings: (s.buildings ?? []).map((b) =>
                b.id === target.id
                  ? { ...b, taggedAsKind: undefined, taggedAsNodeId: undefined }
                  : b,
              ),
            }));
            setContextMenu(null);
          }}
          /* Phase 12.5b — channel-action wiring. Computed lazily
             from the targeted pipe; passed only when the pipe is
             inside a composite channel. */
          {...(() => {
            if (contextMenu.target.kind !== "pipe") return {};
            const pipe = pipes.find((p) => p.id === contextMenu.target.id);
            if (!pipe?.channelId) return {};
            const channel = (channels ?? []).find((c) => c.id === pipe.channelId);
            if (!channel) return {};
            const containedPipeIds = new Set(channel.pipeIds);
            const containedPipes = pipes.filter((p) => containedPipeIds.has(p.id));
            const usedCircuits = new Set(
              containedPipes
                .map((p) => p.circuit)
                .filter((c): c is PipeCircuit => c != null),
            );
            const availableCircuits = CIRCUIT_DEFAULTS
              .map((c) => c.circuit)
              .filter((c) => !usedCircuits.has(c));
            return {
              isChannelMember: true,
              channelAvailableCircuits: availableCircuits,
              onChangeChannelType: (next: ChannelTypeKey) => {
                const patch: { channelType: ChannelTypeKey; crossSectionWidth_mm?: number; crossSectionHeight_mm?: number } = {
                  channelType: next,
                };
                if (next !== "custom") {
                  const spec = CHANNEL_TYPE_REGISTRY[next];
                  patch.crossSectionWidth_mm = spec.widthMm;
                  patch.crossSectionHeight_mm = spec.heightMm;
                }
                pushUndoSnapshot("Сувгийн төрөл солих", 1);
                updateChannel(channel.id, patch);
                setContextMenu(null);
              },
              onAddPipeToChannel: (circuit: PipeCircuit) => {
                pushUndoSnapshot("Сувагт хоолой нэмсэн", 1);
                const len = containedPipes[0]?.length_m ?? pipe.length_m;
                const { channelPatch, newPipe } = addPipeToChannelHelper({
                  channel,
                  existingPipes: containedPipes,
                  newCircuit: circuit,
                  defaultDn: pipe.dn,
                  defaultMaterialKey: pipe.materialKey,
                  length_m: len,
                });
                // Atomic-ish: addPipe writes the pipe row;
                // updateChannel updates the parent's pipeIds list.
                addPipe(newPipe);
                updateChannel(channelPatch.id, { pipeIds: channelPatch.pipeIds });
                setContextMenu(null);
              },
              onRemoveFromChannel: () => {
                pushUndoSnapshot("Хоолойг сувгаас гаргасан", 1);
                const { channelPatch } = removePipeFromChannelHelper({
                  channel,
                  pipeIdToRemove: pipe.id,
                });
                updateChannel(channelPatch.id, { pipeIds: channelPatch.pipeIds });
                // Clear the back-reference on the pipe so it renders as
                // a standalone pipe again.
                updatePipe(pipe.id, { channelId: undefined });
                setContextMenu(null);
              },
              onRemoveChannel: () => {
                if (!window.confirm(
                  `Бүх сувгийг устгах уу? ${containedPipes.length} хоолой бас устах.`,
                )) return;
                pushUndoSnapshot("Сувгийг устгасан", 1 + containedPipes.length);
                removeChannel(channel.id);
                setContextMenu(null);
              },
            };
          })()}
        />
      )}

      {/* Phase 12.5b — Channel creation dialog. Opens after the
          engineer's 2nd click in addChannel mode (captures from/to/
          length in pendingChannelCreate). Confirm → build channel via
          the pure helper + dispatch addChannel atomically. Cancel
          discards the in-flight draw. */}
      {pendingChannelCreate && (
        <ChannelCreateDialog
          length_m={pendingChannelCreate.length_m}
          onConfirm={(payload: ChannelCreatePayload) => {
            const { channel, pipes: newPipes } = buildChannelFromDraw({
              fromNodeId: pendingChannelCreate.fromNodeId,
              toNodeId: pendingChannelCreate.toNodeId,
              channelType: payload.channelType,
              customWidth_mm: payload.customWidth_mm,
              customHeight_mm: payload.customHeight_mm,
              pipeCircuits: payload.pipeCircuits,
              defaultDn: payload.defaultDn,
              length_m: pendingChannelCreate.length_m,
            });
            addChannel(channel, newPipes);
            setPendingChannelCreate(null);
            setChannelFrom(null);
            setMode("select");
          }}
          onCancel={() => {
            setPendingChannelCreate(null);
            setChannelFrom(null);
            setMode("select");
          }}
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
  groupSize, onDeleteGroup, onDeselectAll,
  // Phase 12.4 — building tag-as workflow
  isBuilding, onTagAs, onUntag, taggedKind,
  // Phase 12.5b — channel actions when the targeted pipe is inside a composite channel
  isChannelMember, onRemoveFromChannel, onRemoveChannel, onChangeChannelType, onAddPipeToChannel,
  channelAvailableCircuits,
  // Phase 13.21 + 13.22 — split-and-insert any node kind on a pipe
  // (chamber / well / valve_* / tee for branching).
  onPlaceOnPipe,
}: {
  x: number; y: number;
  target: { kind: "node" | "pipe" | "building"; id: string };
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddWaypoint: () => void;
  onClearWaypoints: () => void;
  onClose: () => void;
  isPipe: boolean;
  hasWaypoints: boolean;
  /** Phase 6.5.1 — total count in current multi-selection. When > 1,
   *  group actions (delete-all / deselect-all) appear at the top. */
  groupSize: number;
  onDeleteGroup: () => void;
  onDeselectAll: () => void;
  /** Phase 12.4 — true when target is a SchemeBuilding. Shows the
   *  "Энэ юу вэ?" submenu and Phase 12.1 tag-as wiring. */
  isBuilding?: boolean;
  onTagAs?: (kind: string) => void;
  onUntag?: () => void;
  taggedKind?: string;
  /** Phase 12.5b — true when target is a pipe inside a composite channel.
   *  Surfaces "Suvgaas garagh" / "Suvag устгах" / change-type + add-pipe
   *  submenu items. The four handlers are optional; ContextMenu only
   *  renders the menu rows when the corresponding handler is supplied. */
  isChannelMember?: boolean;
  onRemoveFromChannel?: () => void;
  onRemoveChannel?: () => void;
  onChangeChannelType?: (next: ChannelTypeKey) => void;
  onAddPipeToChannel?: (circuit: PipeCircuit) => void;
  /** Circuits the channel does NOT already contain — engineer can add
   *  one via the submenu. */
  channelAvailableCircuits?: PipeCircuit[];
  /** Phase 13.21 + 13.22 — caller-supplied split-and-insert handler.
   *  Receives the node `kind` and either a fraction t ∈ [0, 1]
   *  (midpoint = 0.5) or a "distance mode" sentinel `1000 + meters`
   *  so the parent can resolve metres against the pipe's authoritative
   *  length_m. Special kinds:
   *    "__auto_chamber__" — circuit-aware (well_supply for cold,
   *       chamber for everything else; per БНбД 41-02-13 / 40-05)
   *    "__branch_tee__"   — insert a junction (tee) + auto-enter
   *       addPipe mode for the branch line (Phase 13.22 Task 7)
   *    "valve_*"          — Russian-source verified outdoor heat-net
   *       valve subtypes (Phase 13.22 Task 5) */
  onPlaceOnPipe?: (kind: string, tOrDistanceSentinel: number) => void;
}) {
  // Phase 12.4 — sub-menu state for the "Энэ юу вэ?" tag-as submenu
  const [tagSubmenuOpen, setTagSubmenuOpen] = useState(false);
  // Phase 12.5b — submenu states for channel-type change + add-pipe.
  const [channelTypeSubmenuOpen, setChannelTypeSubmenuOpen] = useState(false);
  const [addPipeSubmenuOpen, setAddPipeSubmenuOpen] = useState(false);
  // Phase 13.22 — submenu state for valve-on-pipe. Phase 13.23 dropped
  // the branch submenu in favour of two flat one-click entries.
  const [valveSubmenuOpen, setValveSubmenuOpen] = useState(false);
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
        {groupSize > 1
          ? `Группдээ ${groupSize} элемент`
          : target.kind === "node" ? "Зангилаа"
          : target.kind === "building" ? "Барилга"
          : "Хоолой"}
      </div>
      {/* Phase 12.4 — building tag-as submenu (the headline feature
          that wires Phase 12.1's outline-first workflow). */}
      {isBuilding && !tagSubmenuOpen && (
        <>
          <CtxBtn
            icon="❓"
            onClick={() => setTagSubmenuOpen(true)}
            data-testid="ctx-tag-as"
          >
            Энэ юу вэ? ▶
          </CtxBtn>
          {taggedKind && onUntag && (
            <CtxBtn icon="✂" onClick={onUntag} data-testid="ctx-untag">
              Тагийг арилгах
            </CtxBtn>
          )}
          <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
        </>
      )}
      {/* Phase 12.4 — tag-as kind submenu */}
      {isBuilding && tagSubmenuOpen && onTagAs && (
        <>
          <div style={{ padding: "6px 10px", fontSize: 11, color: "var(--bp-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Энэ барилга юу вэ?
          </div>
          {TAG_AS_KIND_OPTIONS.map((opt) => (
            <CtxBtn
              key={opt.kind}
              icon=""
              onClick={() => { onTagAs(opt.kind); setTagSubmenuOpen(false); }}
              data-testid={`ctx-tag-${opt.kind}`}
            >
              {opt.label}
            </CtxBtn>
          ))}
          <CtxBtn icon="←" onClick={() => setTagSubmenuOpen(false)}>
            Буцах
          </CtxBtn>
          <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
        </>
      )}
      {/* Phase 6.5.1 — group operations appear FIRST when 2+ selected. */}
      {groupSize > 1 && (
        <>
          <CtxBtn icon="🗑" onClick={onDeleteGroup} danger kbd="Del">
            Бүгдийг устгах ({groupSize})
          </CtxBtn>
          <CtxBtn icon="✕" onClick={onDeselectAll} kbd="Esc">
            Сонголтоо цуцлах
          </CtxBtn>
          <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
        </>
      )}
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
      {/* Phase 13.21/13.22 — split-and-insert node on a pipe.
          Refactored from the original chamber-only flow to a generic
          handler that accepts any node kind:
            • chamber / well_supply (Phase 13.21) — Худаг / Шалгах камер
            • valve_* (Phase 13.22 Task 5)        — Гадна шугамын хаалт
              арматур (ball / gate / balance / butterfly / check / vent
              / drain) per СНиП 41-02-2003 §9.6 + Politerm справочник
            • tee (Phase 13.22 Task 7)            — Салбар цэг үүсгээд
              addPipe горимд орж салбар шугам зурна */}
      {/* Phase 13.24 — "place at cursor" actions. Engineer report:
          "Курсорыг аваачсан тэр цэгт хаалт, худаг, компенсатор хийх
          боломжтой болгоно уу." Each button passes `-1` as the
          fraction; the parent handler resolves it by projecting the
          right-click svgPt onto the pipe's displayed polyline. */}
      {isPipe && onPlaceOnPipe && !valveSubmenuOpen && (
        <CtxBtn
          icon="🛡"
          onClick={() => onPlaceOnPipe("__auto_chamber__", -1)}
          data-testid="ctx-place-chamber-cursor"
        >
          🛡 Курсорын цэгт худаг / камер байрлуулах
        </CtxBtn>
      )}
      {isPipe && onPlaceOnPipe && !valveSubmenuOpen && (
        <CtxBtn
          icon="🚿"
          onClick={() => setValveSubmenuOpen(true)}
          data-testid="ctx-place-valve"
        >
          🚿 Курсорын цэгт хаалт байрлуулах ▶
        </CtxBtn>
      )}
      {/* Phase 13.24 — compensator (Phase 13.13b П-shape) placement
          directly at the cursor. Engineer can pick the kind via
          Inspector after; default = compensator_u for outdoor mains. */}
      {isPipe && onPlaceOnPipe && !valveSubmenuOpen && (
        <CtxBtn
          icon="🔄"
          onClick={() => onPlaceOnPipe("compensator_u", -1)}
          data-testid="ctx-place-compensator-cursor"
        >
          🔄 Курсорын цэгт компенсатор байрлуулах
        </CtxBtn>
      )}
      {/* Phase 13.23 + 13.24 — branch from the cursor (not midpoint).
          The 📏 distance-mode variant kept for engineers who want
          precise metres-from-source placement (per СНиП 100m/50m
          spacing rules). */}
      {isPipe && onPlaceOnPipe && !valveSubmenuOpen && (
        <CtxBtn
          icon="🌿"
          onClick={() => onPlaceOnPipe("__branch_tee__", -1)}
          data-testid="ctx-place-branch-cursor"
        >
          🌿 Курсорын цэгээс салбар шугам зурах
        </CtxBtn>
      )}
      {isPipe && onPlaceOnPipe && !valveSubmenuOpen && (
        <CtxBtn
          icon="📏"
          onClick={() => {
            const raw = window.prompt(
              "Эх цэгээс хэдэн метр зайд салбар үүсгэх вэ?",
              "10",
            );
            const d_m = raw ? parseFloat(raw) : NaN;
            if (Number.isFinite(d_m) && d_m > 0) {
              onPlaceOnPipe("__branch_tee__", 1000 + d_m);
            }
          }}
          data-testid="ctx-place-branch-distance"
        >
          📏 ... зайд салбар үүсгэх
        </CtxBtn>
      )}
      {isPipe && onPlaceOnPipe && !valveSubmenuOpen && (
        <CtxBtn
          icon="📏"
          onClick={() => {
            const raw = window.prompt(
              "Эх цэгээс хэдэн метр зайд камер байрлуулах вэ?\n(0.1 - pipe.length - 0.1)",
              "5",
            );
            const d_m = raw ? parseFloat(raw) : NaN;
            if (Number.isFinite(d_m) && d_m > 0) {
              onPlaceOnPipe("__auto_chamber__", 1000 + d_m);
            }
          }}
          data-testid="ctx-place-chamber-distance"
        >
          📏 ... зайд камер байрлуулах
        </CtxBtn>
      )}
      {/* Valve type submenu — Russian-source verified outdoor heat-net
          valves per СНиП 41-02-2003 §9.6 + Politerm Spravochnik §11.
          Phase 13.24 — all entries place AT the right-click cursor
          (passes -1 sentinel; parent projects svgPt onto polyline). */}
      {isPipe && onPlaceOnPipe && valveSubmenuOpen && (
        <>
          <CtxBtn icon="◯" onClick={() => onPlaceOnPipe("valve_ball", -1)}>
            Бөмбөлөг хаалт (DN15-300)
          </CtxBtn>
          <CtxBtn icon="▷◁" onClick={() => onPlaceOnPipe("valve_gate", -1)}>
            Гацуу хаалт (магистраль)
          </CtxBtn>
          <CtxBtn icon="⚖" onClick={() => onPlaceOnPipe("valve_balancing", -1)}>
            Тэнцвэрлэгчийн хаалт
          </CtxBtn>
          <CtxBtn icon="◐" onClick={() => onPlaceOnPipe("valve_butterfly", -1)}>
            Эрэг хаалт (DN100+)
          </CtxBtn>
          <CtxBtn icon="▶|" onClick={() => onPlaceOnPipe("valve_check", -1)}>
            Эргэх хаалт (насосын дараа)
          </CtxBtn>
          <CtxBtn icon="↑" onClick={() => onPlaceOnPipe("valve_air_vent", -1)}>
            Агаар гарагч (дээд цэг)
          </CtxBtn>
          <CtxBtn icon="↓" onClick={() => onPlaceOnPipe("valve_drain", -1)}>
            Угаагч хаалт (доод цэг)
          </CtxBtn>
          <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
          <CtxBtn icon="◀" onClick={() => setValveSubmenuOpen(false)}>
            ◀ Буцах
          </CtxBtn>
        </>
      )}

      {/* Phase 12.5b — Channel-specific menu items. Render only when
          the right-clicked pipe is inside a composite channel AND the
          parent provided handlers for these actions. Sub-menu state is
          isolated to the type-change + add-pipe rows so the engineer
          can browse options without committing. */}
      {isChannelMember && !channelTypeSubmenuOpen && !addPipeSubmenuOpen && (
        <>
          <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
          {onChangeChannelType && (
            <CtxBtn
              icon="▤"
              onClick={() => setChannelTypeSubmenuOpen(true)}
              data-testid="ctx-channel-change-type"
            >
              Сувгийн төрөл солих ▶
            </CtxBtn>
          )}
          {onAddPipeToChannel &&
            channelAvailableCircuits &&
            channelAvailableCircuits.length > 0 && (
              <CtxBtn
                icon="➕"
                onClick={() => setAddPipeSubmenuOpen(true)}
                data-testid="ctx-channel-add-pipe"
              >
                Сувагт хоолой нэмэх ▶
              </CtxBtn>
            )}
          {onRemoveFromChannel && (
            <CtxBtn
              icon="↗"
              onClick={onRemoveFromChannel}
              data-testid="ctx-channel-remove-pipe"
            >
              Энэ хоолойг сувгаас гаргах
            </CtxBtn>
          )}
          {onRemoveChannel && (
            <CtxBtn
              icon="🗑"
              danger
              onClick={onRemoveChannel}
              data-testid="ctx-channel-remove"
            >
              Бүх сувгийг устгах
            </CtxBtn>
          )}
        </>
      )}

      {/* Channel-type submenu */}
      {isChannelMember && channelTypeSubmenuOpen && onChangeChannelType && (
        <>
          <div
            style={{
              padding: "6px 10px",
              fontSize: 11,
              color: "var(--bp-text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Сувгийн шинэ төрөл
          </div>
          {(Object.values(CHANNEL_TYPE_REGISTRY) as Array<{
            key: ChannelTypeKey;
            label: string;
          }>).map((spec) => (
            <CtxBtn
              key={spec.key}
              icon=""
              onClick={() => {
                onChangeChannelType(spec.key);
                setChannelTypeSubmenuOpen(false);
              }}
              data-testid={`ctx-channel-type-${spec.key}`}
            >
              {spec.label}
            </CtxBtn>
          ))}
          <CtxBtn
            icon=""
            onClick={() => {
              onChangeChannelType("custom");
              setChannelTypeSubmenuOpen(false);
            }}
            data-testid="ctx-channel-type-custom"
          >
            Сонголтоор
          </CtxBtn>
          <CtxBtn icon="←" onClick={() => setChannelTypeSubmenuOpen(false)}>
            Буцах
          </CtxBtn>
        </>
      )}

      {/* Add-pipe submenu */}
      {isChannelMember &&
        addPipeSubmenuOpen &&
        onAddPipeToChannel &&
        channelAvailableCircuits && (
          <>
            <div
              style={{
                padding: "6px 10px",
                fontSize: 11,
                color: "var(--bp-text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Нэмэх хэлхээ
            </div>
            {channelAvailableCircuits.map((circuit) => {
              const def = CIRCUIT_DEFAULTS.find((c) => c.circuit === circuit);
              return (
                <CtxBtn
                  key={circuit}
                  icon=""
                  onClick={() => {
                    onAddPipeToChannel(circuit);
                    setAddPipeSubmenuOpen(false);
                  }}
                  data-testid={`ctx-channel-add-pipe-${circuit}`}
                >
                  {def ? `${def.code} — ${def.label}` : circuit}
                </CtxBtn>
              );
            })}
            <CtxBtn icon="←" onClick={() => setAddPipeSubmenuOpen(false)}>
              Буцах
            </CtxBtn>
          </>
        )}

      <div style={{ height: 1, background: "var(--bp-line-2)", margin: "4px 0" }} />
      <CtxBtn icon="🗑" onClick={onDelete} danger kbd="Del">Устгах</CtxBtn>
    </div>
  );
}

function CtxBtn({ icon, onClick, children, danger, kbd, "data-testid": testid }: {
  icon: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  kbd?: string;
  "data-testid"?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
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

function SideBtn({
  active,
  onClick,
  icon,
  label,
  color,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  color?: string;
  /** Phase 6.8.7 — optional richer tooltip; defaults to `label`. */
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
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

/* Phase 13.18 — multi-circuit picker mini-button (preset + clear). */
const pickerBtn: CSSProperties = {
  padding: "0.25rem 0.45rem",
  fontSize: 11,
  background: "var(--bg, #1a1a1a)",
  color: "var(--fg, #e8e8e8)",
  border: "1px solid var(--border, #444)",
  borderRadius: 4,
  cursor: "pointer",
};

/* Phase 13.22 Task 7 — branch-tee post-commit prompt button. */
const branchPromptBtn: CSSProperties = {
  padding: "0.55rem 0.7rem",
  fontSize: 12,
  fontWeight: 600,
  background: "var(--bg, #1a1a1a)",
  color: "var(--fg, #e8e8e8)",
  border: "1px solid var(--border, #444)",
  borderRadius: 6,
  cursor: "pointer",
  textAlign: "left",
};

/* Phase 13.7 — view selector (Top / Bottom / Iso) docked top-right. */
const viewSelectorStyle: CSSProperties = {
  position: "absolute",
  top: 60,
  right: 24,
  zIndex: 6,
  background: "var(--bg, white)",
  border: "1px solid var(--border-soft, #ddd)",
  borderRadius: 6,
  padding: 2,
  display: "flex",
  gap: 2,
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
};
const viewSelectorBtnStyle: CSSProperties = {
  padding: "4px 10px",
  fontSize: 11,
  background: "transparent",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  color: "var(--fg)",
  fontWeight: 500,
};

/* Phase 13.5 — CAD-style dimension input panel styles. */
const dimensionInputPanelStyle: CSSProperties = {
  position: "absolute",
  top: 105,
  left: 80,
  zIndex: 6,
  background: "var(--bg, white)",
  border: "1px solid var(--accent, #1f5faa)",
  borderRadius: 6,
  padding: "8px 12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
  minWidth: 280,
};
const dimensionInputBoxStyle: CSSProperties = {
  marginLeft: 4,
  width: 60,
  padding: "3px 6px",
  fontSize: 12,
  border: "1px solid var(--border-soft, #ccc)",
  borderRadius: 4,
};
const dimensionInputBtnStyle: CSSProperties = {
  padding: "4px 10px",
  background: "var(--accent, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

function prettyName(kind: string, n: number): string {
  const def = getNodeKind(kind);
  if (!def) return `Node-${n}`;
  return `${def.shortLabel}-${n}`;
}

export type _Unused = ReactNode;
