import type { CSSProperties, ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { PIPE_DB, PIPE_MATERIALS, CLIMATE, WALL_TYPES, GLAZING } from "shared";
import { NODE_KINDS, CATEGORIES, getNodeKind } from "../nodeCatalog";
import { calcHeatLoad } from "../calc/heatLoad";
// Phase 13.13 — volumetric heat-load quick estimate (W×L×H × q_v).
import {
  autoVolumetricHeatLoad,
  resolveSpecificLoad,
} from "../calc/volumetricHeatLoad";
import { pipeLengthFromGeometry } from "../calc/haversine";
import { updateDimension, removeDimension } from "../scheme/dimensionApplier";
import {
  resolveDimensionEndpoints,
  computeDimensionLabel,
} from "../scheme/dimensions";
import {
  updateConstructionLine,
  removeConstructionLine,
} from "../scheme/constructionLineApplier";
import { constructionLineLength } from "../scheme/constructionLines";
import {
  updateAnnotation,
  removeAnnotation,
} from "../scheme/annotationApplier";
import {
  updateBuilding,
  removeBuilding,
} from "../scheme/buildingApplier";
import type {
  BuildingEnvelope,
  EnvelopeSurface,
  SchemeDimension,
  SchemeConstructionLine,
  SchemeAnnotation,
  SchemeBuilding,
} from "../hydraulicTypes";

export function InspectorPanel({ readOnly }: { readOnly?: boolean }) {
  const selection = useHydraulicStore((s) => s.selection);
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const settings = useHydraulicStore((s) => s.settings);
  const updateSettings = useHydraulicStore((s) => s.updateSettings);
  const dimensions = useHydraulicStore((s) => s.dimensions);
  const constructionLines = useHydraulicStore((s) => s.constructionLines);
  const annotations = useHydraulicStore((s) => s.annotations);
  const buildings = useHydraulicStore((s) => s.buildings);
  const updateNode = useHydraulicStore((s) => s.updateNode);
  const updatePipe = useHydraulicStore((s) => s.updatePipe);
  const removeNode = useHydraulicStore((s) => s.removeNode);
  const removePipe = useHydraulicStore((s) => s.removePipe);

  if (!selection) {
    return (
      <aside style={sidebarStyle}>
        <h3>Мэдээлэл</h3>
        <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          Зангилаа эсвэл хоолой сонгоод энд засварлана уу.
        </p>
        <hr />
        <div style={{ fontSize: 13, color: "var(--fg-muted)" }}>
          <b>Keyboard:</b>
          <br />
          Del / Backspace — устгах
          <br />
          ESC — горим цуцлах
          <br />
          Mouse wheel — томруулах
        </div>
      </aside>
    );
  }

  // Phase 6.6.1 — dimension inspector branch (before node/pipe).
  if (selection.kind === "dimension") {
    const dim = (dimensions ?? []).find((d: SchemeDimension) => d.id === selection.id);
    if (!dim) return null;
    const resolved = resolveDimensionEndpoints(dim, nodes);
    const autoLabel = computeDimensionLabel(
      { ...dim, label: undefined },
      resolved,
    );
    return (
      <aside style={sidebarStyle}>
        <h3>Хэмжээс</h3>
        <Field label="Эх → Төгсгөл">
          <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            {dim.fromNodeId} → {dim.toNodeId}
            {resolved.orphan && (
              <span style={{ color: "var(--danger, #C44)", marginLeft: 8 }}>
                ⚠ Дутагдалтай зангилаа
              </span>
            )}
          </div>
        </Field>
        <Field label={`Зайны утга (autoматаар: ${autoLabel})`}>
          <input
            type="text"
            placeholder={autoLabel}
            value={dim.label ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateDimension(dim.id, { label: e.target.value || undefined })
            }
            style={inputStyle}
          />
        </Field>
        <Field label={`Шилжилт (${dim.offset_px} px)`}>
          <input
            type="range"
            min={10}
            max={100}
            value={dim.offset_px}
            disabled={readOnly}
            onChange={(e) =>
              updateDimension(dim.id, { offset_px: Number(e.target.value) })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Давхрага">
          <select
            value={dim.layerKey ?? "D"}
            disabled={readOnly}
            onChange={(e) =>
              updateDimension(dim.id, {
                layerKey: e.target.value as "D" | "C",
              })
            }
            style={inputStyle}
          >
            <option value="D">D — Хэмжээс / Текст</option>
            <option value="C">C — Туслах шугам</option>
          </select>
        </Field>
        {!readOnly && (
          <button
            style={{
              ...inputStyle,
              color: "var(--danger)",
              borderColor: "var(--danger)",
              marginTop: 8,
              cursor: "pointer",
            }}
            onClick={() => removeDimension(dim.id)}
          >
            Хэмжээсийг устгах
          </button>
        )}
      </aside>
    );
  }

  // Phase 6.6.2 — construction-line inspector branch.
  if (selection.kind === "constructionLine") {
    const cl = (constructionLines ?? []).find(
      (c: SchemeConstructionLine) => c.id === selection.id,
    );
    if (!cl) return null;
    const length_m = constructionLineLength(cl);
    return (
      <aside style={sidebarStyle}>
        <h3>Туслах шугам</h3>
        <Field label={`Урт (${length_m.toFixed(2)}м)`}>
          <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            ({cl.from.x.toFixed(0)}, {cl.from.y.toFixed(0)}) → ({cl.to.x.toFixed(0)}, {cl.to.y.toFixed(0)})
          </div>
        </Field>
        <Field label="Нэр (axis, ось)">
          <input
            type="text"
            placeholder="жишээ нь: А-А, Х-Х"
            value={cl.label ?? ""}
            disabled={readOnly}
            onChange={(e) =>
              updateConstructionLine(cl.id, { label: e.target.value || undefined })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Шугамын төрөл">
          <select
            value={cl.style ?? "dashed"}
            disabled={readOnly}
            onChange={(e) =>
              updateConstructionLine(cl.id, {
                style: e.target.value as SchemeConstructionLine["style"],
              })
            }
            style={inputStyle}
          >
            <option value="dashed">Тасархай (dashed)</option>
            <option value="solid">Бүхэл (solid)</option>
            <option value="dotted">Цэгчилсэн (dotted)</option>
          </select>
        </Field>
        <Field label="Давхрага">
          <select
            value={cl.layerKey ?? "C"}
            disabled={readOnly}
            onChange={(e) =>
              updateConstructionLine(cl.id, {
                layerKey: e.target.value as "D" | "C",
              })
            }
            style={inputStyle}
          >
            <option value="C">C — Туслах шугам</option>
            <option value="D">D — Хэмжээс / Текст</option>
          </select>
        </Field>
        {!readOnly && (
          <button
            style={{
              ...inputStyle,
              color: "var(--danger)",
              borderColor: "var(--danger)",
              marginTop: 8,
              cursor: "pointer",
            }}
            onClick={() => removeConstructionLine(cl.id)}
          >
            Туслах шугамыг устгах
          </button>
        )}
      </aside>
    );
  }

  // Phase 6.7.3 — north-arrow inspector branch (singleton, no
  // applier — fields persist via updateSettings on the store).
  if (selection.kind === "northArrow") {
    const na = settings.northArrow ?? {};
    // Stored values (may be undefined). When undefined, the canvas
    // renderer applies its default. We show "—" so the engineer
    // knows the field is at its automatic value.
    const xLabel =
      na.x_px === undefined ? "автомат" : `${Math.round(na.x_px)}`;
    const yLabel =
      na.y_px === undefined ? "автомат" : `${Math.round(na.y_px)}`;
    const rotation = na.rotation_deg ?? 0;
    const patch = (delta: Partial<typeof na>) =>
      updateSettings({ northArrow: { ...na, ...delta } });
    return (
      <aside style={sidebarStyle}>
        <h3>Хойт сум</h3>
        <Field label={`X — viewport-px (${xLabel})`}>
          <input
            type="number"
            value={na.x_px ?? ""}
            placeholder="автомат"
            disabled={readOnly}
            onChange={(e) =>
              patch({
                x_px: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            style={inputStyle}
          />
        </Field>
        <Field label={`Y — viewport-px (${yLabel})`}>
          <input
            type="number"
            value={na.y_px ?? ""}
            placeholder="автомат"
            disabled={readOnly}
            onChange={(e) =>
              patch({
                y_px: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
            style={inputStyle}
          />
        </Field>
        <Field label={`Эргүүлэлт (${rotation.toFixed(0)}°)`}>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={rotation}
            disabled={readOnly}
            onChange={(e) => patch({ rotation_deg: Number(e.target.value) })}
            style={inputStyle}
          />
        </Field>
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() =>
                patch({ x_px: undefined, y_px: undefined })
              }
              title="Хойт суманг автомат байрлал (баруун дээд) руу буцаах"
              style={{
                ...inputStyle,
                cursor: "pointer",
                marginTop: 6,
              }}
            >
              ↺ Анхдагч байрлал
            </button>
            <button
              type="button"
              onClick={() => patch({ rotation_deg: 0 })}
              title="Эргүүлэлтийг 0° (жинхэнэ хойт) руу буцаах"
              style={{
                ...inputStyle,
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              ⇧ Жинхэнэ хойт (0°)
            </button>
          </>
        )}
      </aside>
    );
  }

  // Phase 6.6.3 — annotation inspector branch.
  if (selection.kind === "annotation") {
    const annotation = (annotations ?? []).find(
      (a: SchemeAnnotation) => a.id === selection.id,
    );
    if (!annotation) return null;
    return (
      <aside style={sidebarStyle}>
        <h3>Тэмдэглэгээ</h3>
        <Field label="Текст">
          <textarea
            rows={3}
            value={annotation.text}
            disabled={readOnly}
            onChange={(e) =>
              updateAnnotation(annotation.id, { text: e.target.value })
            }
            style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>
        <Field label={`Шрифт (${annotation.fontSize_px ?? 12}px)`}>
          <input
            type="range"
            min={8}
            max={32}
            value={annotation.fontSize_px ?? 12}
            disabled={readOnly}
            onChange={(e) =>
              updateAnnotation(annotation.id, { fontSize_px: Number(e.target.value) })
            }
            style={inputStyle}
          />
        </Field>
        <Field label={`Эргүүлэлт (${(annotation.rotation_deg ?? 0).toFixed(0)}°)`}>
          <input
            type="range"
            min={-180}
            max={180}
            step={5}
            value={annotation.rotation_deg ?? 0}
            disabled={readOnly}
            onChange={(e) =>
              updateAnnotation(annotation.id, { rotation_deg: Number(e.target.value) })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Текстийн зэрэгцүүлэлт">
          <select
            value={annotation.align ?? "left"}
            disabled={readOnly}
            onChange={(e) =>
              updateAnnotation(annotation.id, {
                align: e.target.value as SchemeAnnotation["align"],
              })
            }
            style={inputStyle}
          >
            <option value="left">Зүүн (left)</option>
            <option value="center">Төв (center)</option>
            <option value="right">Баруун (right)</option>
          </select>
        </Field>
        <Field label="Давхрага">
          <select
            value={annotation.layerKey ?? "D"}
            disabled={readOnly}
            onChange={(e) =>
              updateAnnotation(annotation.id, {
                layerKey: e.target.value as "D" | "C",
              })
            }
            style={inputStyle}
          >
            <option value="D">D — Хэмжээс / Текст</option>
            <option value="C">C — Туслах шугам</option>
          </select>
        </Field>
        {!readOnly && (
          <button
            style={{
              ...inputStyle,
              color: "var(--danger)",
              borderColor: "var(--danger)",
              marginTop: 8,
              cursor: "pointer",
            }}
            onClick={() => removeAnnotation(annotation.id)}
          >
            Тэмдэглэгээг устгах
          </button>
        )}
      </aside>
    );
  }

  /* Phase 6.8.6 — reference-building inspector. Engineer fills in
     label / floors / type / heat-load AFTER drawing the polygon
     (the draw flow creates a bare outline so the engineer can
     iterate without the legacy BuildingDialog gate). */
  if (selection.kind === "building") {
    const building = (buildings ?? []).find(
      (b: SchemeBuilding) => b.id === selection.id,
    );
    if (!building) return null;
    return (
      <aside style={sidebarStyle}>
        <h3>Барилгын зураг</h3>
        <Field label="Нэр">
          <input
            value={building.label ?? ""}
            disabled={readOnly}
            onChange={(e) => updateBuilding(building.id, { label: e.target.value })}
            style={inputStyle}
            placeholder="АОС-15"
          />
        </Field>
        <Field label="Барилгын төрөл">
          <select
            value={building.building_type ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                updateBuilding(building.id, { building_type: undefined });
              } else {
                updateBuilding(building.id, {
                  building_type: v as SchemeBuilding["building_type"],
                });
              }
            }}
            style={inputStyle}
            data-testid="inspector-building-type"
          >
            <option value="">— сонгох —</option>
            <option value="apartment">Орон сууц</option>
            <option value="school">Сургууль</option>
            <option value="hospital">Эмнэлэг</option>
            <option value="office">Оффис</option>
            <option value="industrial">Үйлдвэрийн</option>
          </select>
        </Field>
        <Field label="Давхар">
          <input
            type="number"
            min={1}
            max={50}
            value={building.floors ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              updateBuilding(building.id, { floors: v });
            }}
            style={inputStyle}
            placeholder="5"
          />
        </Field>
        <Field label="Дулааны ачаалал (кВт)">
          <input
            type="number"
            min={0}
            step={0.1}
            value={building.heatLoad_kw ?? ""}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value === "" ? undefined : Number(e.target.value);
              updateBuilding(building.id, { heatLoad_kw: v });
            }}
            style={inputStyle}
            placeholder="500"
          />
        </Field>
        <Field label="Давхрага">
          <select
            value={building.layerKey ?? "D"}
            disabled={readOnly}
            onChange={(e) =>
              updateBuilding(building.id, {
                layerKey: e.target.value as "D" | "C",
              })
            }
            style={inputStyle}
          >
            <option value="D">D — Дизайн / зураг (хэвлэх)</option>
            <option value="C">C — Туслах (зөвхөн дэлгэц)</option>
          </select>
        </Field>
        <p style={{ fontSize: 12, color: "var(--fg-muted)", margin: "0.4rem 0 0" }}>
          Энэ нь барилгын <b>зураг</b> л юм — гидравлик ачаалалд автоматаар
          оролцоогүй. Хэрэглэгчтэй холбохын тулд тус хэрэглэгчийн зангилаа
          (АОС / ЦТП) барилга дотор тавьж, хоолой татна уу.
        </p>
        {!readOnly && (
          <button
            style={{
              ...inputStyle,
              color: "var(--danger)",
              borderColor: "var(--danger)",
              marginTop: 8,
              cursor: "pointer",
            }}
            onClick={() => removeBuilding(building.id)}
          >
            Барилгын зургийг устгах
          </button>
        )}
      </aside>
    );
  }

  if (selection.kind === "node") {
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return null;
    return (
      <aside style={sidebarStyle}>
        <h3>Зангилаа: {node.label}</h3>
        <Field label="Нэр">
          <input
            value={node.label}
            disabled={readOnly}
            onChange={(e) => updateNode(node.id, { label: e.target.value })}
            style={inputStyle}
          />
        </Field>
        {/* Phase 6.8.5 (BUG A) — fine-grained node-kind dropdown.
            Pre-fix the select had 5 hardcoded options (consumer /
            source / junction / pump / well) using simplified
            category names. But every node placed via the toolbar
            palette carries a fine-grained kind like
            `source_substation` (ЦТП), `consumer_apartment` (АОС),
            `well_supply` (ДХ). Because none of those matched the
            hardcoded options, the select rendered uncontrolled —
            engineers saw "Хэрэглэгч" on a ЦТП node and assumed the
            node was misclassified.
            Also dropped Russian "Источник" → Mongolian "Эх үүсвэр"
            per the codebase convention (see CLAUDE.md "Russian terms
            forbidden" rule).
            Options are grouped by category (optgroup) so the
            dropdown stays scannable even with 30+ entries. */}
        <Field label="Төрөл">
          <select
            value={node.kind}
            disabled={readOnly}
            onChange={(e) => updateNode(node.id, { kind: e.target.value as typeof node.kind })}
            style={inputStyle}
            data-testid="inspector-node-kind"
          >
            {/* If the stored kind is unknown to nodeCatalog (e.g.
                imported from a legacy Zulu file with a custom kind),
                surface it as a one-off option so the select stays
                controlled and the engineer can see the raw value. */}
            {!getNodeKind(node.kind) && (
              <option value={node.kind}>{`(танигдаагүй) ${node.kind}`}</option>
            )}
            {CATEGORIES.map((cat) => {
              const kindsInCat = NODE_KINDS.filter((k) => k.category === cat.key);
              if (kindsInCat.length === 0) return null;
              return (
                <optgroup key={cat.key} label={cat.label}>
                  {kindsInCat.map((k) => (
                    <option key={k.key} value={k.key}>{k.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="X">
            <input
              type="number"
              value={node.x}
              disabled={readOnly}
              onChange={(e) => updateNode(node.id, { x: Number(e.target.value) })}
              style={inputStyle}
            />
          </Field>
          <Field label="Y">
            <input
              type="number"
              value={node.y}
              disabled={readOnly}
              onChange={(e) => updateNode(node.id, { y: Number(e.target.value) })}
              style={inputStyle}
            />
          </Field>
          <Field label="h (м)">
            <input
              type="number"
              value={node.elevation_m ?? ""}
              disabled={readOnly}
              onChange={(e) => updateNode(node.id, { elevation_m: e.target.value === "" ? undefined : Number(e.target.value) })}
              style={inputStyle}
            />
          </Field>
        </div>
        {/* Phase 6D — numeric lat/lon input. Lets the engineer pin a
            node to an exact coordinate (e.g. paste from a surveyor's
            GPS readout) instead of dragging it on the map. Hidden
            until a `geo` already exists OR the engineer toggles
            the empty fields. */}
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="Lat">
            <input
              type="number"
              step={0.0000001}
              placeholder="47.9184"
              value={node.geo?.lat ?? ""}
              disabled={readOnly}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v === null) {
                  // Clearing lat removes the geo lock — node falls
                  // back to drag-based positioning.
                  updateNode(node.id, { geo: undefined });
                } else {
                  updateNode(node.id, {
                    geo: {
                      lat: v,
                      lon: node.geo?.lon ?? 106.9176, // default to УБ centre if user only set lat
                    },
                  });
                }
              }}
              style={inputStyle}
              title="Geographic latitude. Зөвхөн node-ийн геогр. байрлалыг засна — газрын зураг автоматаар тэнд хөдөлнө."
            />
          </Field>
          <Field label="Lon">
            <input
              type="number"
              step={0.0000001}
              placeholder="106.9176"
              value={node.geo?.lon ?? ""}
              disabled={readOnly}
              onChange={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v === null) {
                  updateNode(node.id, { geo: undefined });
                } else {
                  updateNode(node.id, {
                    geo: {
                      lat: node.geo?.lat ?? 47.9184,
                      lon: v,
                    },
                  });
                }
              }}
              style={inputStyle}
              title="Geographic longitude."
            />
          </Field>
        </div>

        {node.kind === "consumer" && (
          <>
            <Field label="Ачаалал (Вт)">
              <input
                type="number"
                value={node.heatLoad_w ?? 0}
                disabled={readOnly}
                onChange={(e) => updateNode(node.id, { heatLoad_w: Number(e.target.value) })}
                style={inputStyle}
              />
            </Field>
            <Field label="Шаардлагатай даралт (MPa)">
              <input
                type="number"
                step="0.01"
                value={node.requiredPressure_mpa ?? ""}
                placeholder="0.15"
                disabled={readOnly}
                onChange={(e) => updateNode(node.id, { requiredPressure_mpa: e.target.value === "" ? undefined : Number(e.target.value) })}
                style={inputStyle}
              />
            </Field>
            <EnvelopeEditor
              nodeId={node.id}
              envelope={node.envelope}
              defaultCity={settings.city}
              readOnly={readOnly}
              onChange={(env, autoLoad) => {
                updateNode(node.id, { envelope: env, heatLoad_w: autoLoad });
              }}
            />
          </>
        )}

        {node.kind === "pump" && (
          <div style={{ display: "flex", gap: 8 }}>
            <Field label="H (м)">
              <input
                type="number"
                value={node.pump?.H_m ?? 0}
                disabled={readOnly}
                onChange={(e) =>
                  updateNode(node.id, { pump: { H_m: Number(e.target.value), Q_m3h: node.pump?.Q_m3h ?? 0 } })
                }
                style={inputStyle}
              />
            </Field>
            <Field label="Q (м³/ц)">
              <input
                type="number"
                value={node.pump?.Q_m3h ?? 0}
                disabled={readOnly}
                onChange={(e) =>
                  updateNode(node.id, { pump: { H_m: node.pump?.H_m ?? 0, Q_m3h: Number(e.target.value) } })
                }
                style={inputStyle}
              />
            </Field>
          </div>
        )}

        {/* Hatch fill picker — only meaningful for buildings (have width_m or footprint). */}
        {(node.width_m || node.footprint) && (
          <Field label="Дүүргэлт (hatch)">
            <select
              value={node.hatchPattern ?? "solid"}
              disabled={readOnly}
              onChange={(e) => updateNode(node.id, { hatchPattern: e.target.value as typeof node.hatchPattern })}
              style={inputStyle}
            >
              <option value="solid">▦ Хагас тунгалаг (default)</option>
              <option value="diag45">╱ 45° налуу шугам (бетон)</option>
              <option value="diag135">╲ 135° налуу шугам</option>
              <option value="cross">⊞ Crosshatch (тоосго / индустри)</option>
              <option value="brick">▥ Тоосго pattern</option>
              <option value="dots">⋯ Цэгэн (хайрга / дүүргэлт)</option>
              <option value="none">○ Дүүргэлгүй (зөвхөн зураас)</option>
            </select>
          </Field>
        )}

        {/* Phase 13.0b — physical dimension editing for building-rendered
            entities (source_tec defaults 80×50 m, consumer_industrial,
            etc.). When the engineer wants to PERMANENTLY shrink a TЭЦ
            symbol (not just scale-multiply it), they edit these
            directly. Visible only when width_m / height_m are set,
            i.e. for entities currently rendering as building rectangles. */}
        {(node.width_m != null && node.height_m != null) && (
          <>
            <Field label="Өргөн (м)">
              <input
                type="number"
                min={0.1}
                max={500}
                step={0.1}
                value={node.width_m ?? 0}
                disabled={readOnly}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  updateNode(node.id, { width_m: v });
                }}
                style={inputStyle}
                data-testid="inspector-width-m"
                title="Физик хэмжээ метрээр — preset / size_scale-аас тусдаа"
              />
            </Field>
            <Field label="Урт (м)">
              <input
                type="number"
                min={0.1}
                max={500}
                step={0.1}
                value={node.height_m ?? 0}
                disabled={readOnly}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isFinite(v) || v <= 0) return;
                  updateNode(node.id, { height_m: v });
                }}
                style={inputStyle}
                data-testid="inspector-height-m"
                title="Физик хэмжээ метрээр — preset / size_scale-аас тусдаа"
              />
            </Field>
            {/* Phase 13.13 — volumetric heat-load quick estimate.
                Engineer typed W × L → auto-compute volume × specific
                load (kind-default). Shown alongside the dimension
                inputs so the engineer sees the kW figure update live.
                Specific load is engineer-overridable; heat load can
                also be edited manually (override wins). */}
            <VolumetricHeatLoadBlock node={node} updateNode={updateNode} readOnly={readOnly} />
          </>
        )}

        {/* Phase 6.8.3 — per-entity size override. Multiplies the
            project-wide preset; default 1.0 means "no override".
            Range deliberately wide (0.3..2.5) so the engineer can
            both tame a misclassified large source (0.5×) and
            highlight a landmark consumer (2×). The renderer still
            clamps the final radius to MIN/MAX, so extreme values
            saturate rather than break the layout. */}
        <Field label="Хэмжээний хувь (size scale)">
          <input
            type="number"
            min={0.3}
            max={2.5}
            step={0.1}
            value={node.size_scale ?? 1.0}
            disabled={readOnly}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isNaN(v)) return;
              // Treat "1" as "no override" — strip the field so
              // legacy save/load round-trips don't accumulate
              // `size_scale: 1` everywhere.
              if (Math.abs(v - 1.0) < 0.001) {
                updateNode(node.id, { size_scale: undefined });
              } else {
                updateNode(node.id, { size_scale: v });
              }
            }}
            style={inputStyle}
            title="0.3..2.5; 1.0 = preset-ийг өөрчилөхгүй"
          />
        </Field>

        <Field label="Тэмдэглэл">
          <textarea
            value={node.notes ?? ""}
            disabled={readOnly}
            onChange={(e) => updateNode(node.id, { notes: e.target.value })}
            style={{ ...inputStyle, minHeight: 60, fontFamily: "inherit" }}
          />
        </Field>

        {!readOnly && (
          <button
            style={{ ...inputStyle, color: "var(--danger)", borderColor: "var(--danger)", marginTop: 8, cursor: "pointer" }}
            onClick={() => removeNode(node.id)}
          >
            Зангилааг устгах
          </button>
        )}
      </aside>
    );
  }

  // pipe
  const pipe = pipes.find((p) => p.id === selection.id);
  if (!pipe) return null;
  const category = settings.primaryMaterialCategory;
  const sortament = PIPE_DB[category];

  // Phase 5B.1c — when BOTH endpoints have geo coords set, the pipe's
  // length can be derived from the great-circle distance instead of a
  // manually-typed value. We show the auto-computed value as a lock-
  // icon hint; the engineer can still override (clears node.geo on
  // either endpoint so the manual input wins). Phase 5D will wire the
  // mutation back into the solver — for now this is purely visual +
  // a click-to-apply shortcut.
  const fromNode = pipe ? nodes.find((n) => n.id === pipe.fromNodeId) : null;
  const toNode = pipe ? nodes.find((n) => n.id === pipe.toNodeId) : null;
  const geoLength = pipeLengthFromGeometry(fromNode, toNode);
  const lengthMatches =
    geoLength !== null && Math.abs(geoLength - pipe.length_m) < 0.5;
  return (
    <aside style={sidebarStyle}>
      <h3>Хоолой</h3>
      <Field label="Материал">
        <select
          value={pipe.materialKey}
          disabled={readOnly}
          onChange={(e) => updatePipe(pipe.id, { materialKey: e.target.value })}
          style={inputStyle}
        >
          {PIPE_MATERIALS.map((m) => (
            <option key={m.key} value={m.key}>{m.name}</option>
          ))}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="DN">
          <select
            value={pipe.dn}
            disabled={readOnly}
            onChange={(e) => updatePipe(pipe.id, { dn: Number(e.target.value) })}
            style={inputStyle}
          >
            {sortament.map((s) => (
              <option key={s.dn} value={s.dn}>{s.dn} (ID {s.id_mm}мм)</option>
            ))}
          </select>
        </Field>
        <Field label={lengthMatches ? "Урт (м) 🔒 авто" : "Урт (м)"}>
          <input
            type="number"
            step="0.1"
            value={pipe.length_m}
            disabled={readOnly}
            onChange={(e) => updatePipe(pipe.id, { length_m: Number(e.target.value) })}
            style={inputStyle}
            title={
              lengthMatches
                ? "Газрын зураг дээрх node байрлалаас Haversine аргаар автоматаар тооцоолсон."
                : geoLength !== null
                  ? `Геометрээс тооцоолсон: ${geoLength.toFixed(2)} м.`
                  : "Гар оруулга. Node-ийн lat/lon-г тогтоосны дараа авто-урт хийгдэнэ."
            }
          />
        </Field>
      </div>
      {geoLength !== null && !lengthMatches && !readOnly && (
        <button
          type="button"
          onClick={() => updatePipe(pipe.id, { length_m: Math.round(geoLength * 100) / 100 })}
          style={{
            marginTop: -4,
            marginBottom: 4,
            padding: "0.25rem 0.6rem",
            fontSize: 11,
            background: "var(--bp-blue-soft, #e7f1ff)",
            color: "var(--bp-blue, #0066cc)",
            border: "1px solid var(--bp-blue, #0066cc)",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          📐 Геометрээс {geoLength.toFixed(2)} м оруулах
        </button>
      )}
      <Field label="Тэмдэглэл">
        <input
          value={pipe.label ?? ""}
          disabled={readOnly}
          onChange={(e) => updatePipe(pipe.id, { label: e.target.value })}
          style={inputStyle}
        />
      </Field>
      {!readOnly && (
        <button
          style={{ ...inputStyle, color: "var(--danger)", borderColor: "var(--danger)", marginTop: 8, cursor: "pointer" }}
          onClick={() => removePipe(pipe.id)}
        >
          Хоолой устгах
        </button>
      )}
    </aside>
  );
}

function EnvelopeEditor({
  nodeId,
  envelope,
  defaultCity,
  readOnly,
  onChange,
}: {
  nodeId: string;
  envelope?: BuildingEnvelope;
  defaultCity: string;
  readOnly?: boolean;
  onChange: (env: BuildingEnvelope, autoLoad: number) => void;
}) {
  const env: BuildingEnvelope = envelope ?? {
    floor_area_m2: 120,
    city: defaultCity,
    use: "residential",
    surfaces: [],
  };

  function update(patch: Partial<BuildingEnvelope>) {
    const next = { ...env, ...patch };
    const load = calcHeatLoad(next);
    onChange(next, Math.round(load.total_w));
  }

  function addSurface() {
    const s: EnvelopeSurface = {
      id: `s_${Date.now()}`,
      wallTypeKey: WALL_TYPES[0]!.key,
      area_m2: 20,
    };
    update({ surfaces: [...env.surfaces, s] });
  }

  function updateSurface(id: string, patch: Partial<EnvelopeSurface>) {
    update({
      surfaces: env.surfaces.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  }

  function removeSurface(id: string) {
    update({ surfaces: env.surfaces.filter((s) => s.id !== id) });
  }

  const result = calcHeatLoad(env);

  return (
    <details style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 10, marginTop: 10 }}>
      <summary style={{ cursor: "pointer", color: "var(--accent)", fontSize: 13, marginBottom: 8 }}>
        🏠 Барилгын дулаан ачаалал (БНбД 23-02-09)
      </summary>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="Хот">
          <select value={env.city} onChange={(e) => update({ city: e.target.value })} disabled={readOnly} style={inputStyle}>
            {CLIMATE.map((c) => (
              <option key={c.city} value={c.city}>{c.city} ({c.tnr_c}°C)</option>
            ))}
          </select>
        </Field>
        <Field label="Зориулалт">
          <select
            value={env.use}
            onChange={(e) => update({ use: e.target.value as BuildingEnvelope["use"] })}
            disabled={readOnly}
            style={inputStyle}
          >
            <option value="residential">Орон сууц</option>
            <option value="office">Оффис</option>
            <option value="retail">Дэлгүүр</option>
            <option value="industrial">Үйлдвэр</option>
            <option value="school">Сургууль</option>
            <option value="hospital">Эмнэлэг</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Field label="Шалны талбай (м²)">
          <input
            type="number"
            value={env.floor_area_m2}
            onChange={(e) => update({ floor_area_m2: Number(e.target.value) })}
            disabled={readOnly}
            style={inputStyle}
          />
        </Field>
        <Field label="Эзлэхүүн (м³)">
          <input
            type="number"
            value={env.volume_m3 ?? ""}
            placeholder={`${Math.round(env.floor_area_m2 * 2.8)}`}
            onChange={(e) => update({ volume_m3: e.target.value === "" ? undefined : Number(e.target.value) })}
            disabled={readOnly}
            style={inputStyle}
          />
        </Field>
      </div>

      <div style={{ fontSize: 12, color: "var(--fg-muted)", margin: "8px 0" }}>
        Гадна хашлага ({env.surfaces.length})
      </div>
      {env.surfaces.map((s) => {
        const options = [...WALL_TYPES, ...GLAZING.map((g) => ({ key: g.key, name: g.name, r_value: g.r, u_value: g.u, category: "window" as const }))];
        return (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 4, marginBottom: 4 }}>
            <select
              value={s.wallTypeKey}
              onChange={(e) => updateSurface(s.id, { wallTypeKey: e.target.value })}
              disabled={readOnly}
              style={{ ...inputStyle, fontSize: 11 }}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>{o.name} (R={o.r_value.toFixed(2)})</option>
              ))}
            </select>
            <input
              type="number"
              value={s.area_m2}
              onChange={(e) => updateSurface(s.id, { area_m2: Number(e.target.value) })}
              disabled={readOnly}
              style={{ ...inputStyle, fontSize: 11 }}
              placeholder="м²"
            />
            <select
              value={s.orientation ?? ""}
              onChange={(e) => updateSurface(s.id, { orientation: (e.target.value || undefined) as EnvelopeSurface["orientation"] })}
              disabled={readOnly}
              style={{ ...inputStyle, fontSize: 11 }}
            >
              <option value="">—</option>
              {["N","NE","E","SE","S","SW","W","NW"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            {!readOnly && (
              <button
                onClick={() => removeSurface(s.id)}
                style={{ ...inputStyle, color: "var(--danger)", border: "1px solid var(--border)", cursor: "pointer", fontSize: 11 }}
              >×</button>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <button
          onClick={addSurface}
          style={{ ...inputStyle, marginTop: 6, cursor: "pointer", width: "100%", fontSize: 12 }}
        >+ Хашлага нэмэх</button>
      )}

      <div style={{ marginTop: 12, padding: 8, background: "var(--bg)", borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 12 }}>
        <div>Q_tr = <b>{(result.transmission_w / 1000).toFixed(2)} кВт</b></div>
        <div>Q_inf = <b>{(result.infiltration_w / 1000).toFixed(2)} кВт</b></div>
        <div>Q_gain = <b>−{(result.internal_gains_w / 1000).toFixed(2)} кВт</b></div>
        <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 4, marginTop: 4 }}>
          <span style={{ color: "var(--accent)" }}>Нийт: {(result.total_w / 1000).toFixed(2)} кВт</span>
        </div>
      </div>
    </details>
  );
}

/**
 * Phase 13.13 — Volumetric heat-load quick-estimate block.
 *
 * Renders below the W×L dimension inputs when the engineer's node has
 * plan dimensions set. Shows:
 *   - building height (resolved: explicit > floors × floorH > 9 m)
 *   - volume = W × L × H (read-only auto-compute)
 *   - specific load (engineer-overridable; defaults to kind-typical)
 *   - heat load = volume × specific (engineer-overridable; auto-fills
 *     when engineer hasn't typed a manual override)
 *
 * Engineer workflow:
 *   1. Drag a TЭЦ / АОС polygon on the map (Phase 13.11 OSM trace OR
 *      Phase 13.1 manual draw).
 *   2. Tap the new node, then in Inspector type W × L (Phase 13.0b).
 *   3. This block auto-fills volume + heat load using БНбД 23-02-09
 *      typical specificLoad for the kind (АОС=45, hospital=60, etc.).
 *   4. Engineer reviews / overrides specificLoad if their survey
 *      yields a different q_v.
 */
function VolumetricHeatLoadBlock({
  node,
  updateNode,
  readOnly,
}: {
  node: { id: string; kind: string; width_m?: number; height_m?: number; buildingHeight_m?: number; floors?: number; floorHeight_m?: number; specificLoad_w_per_m3?: number; heatLoad_w?: number; volume_m3?: number };
  updateNode: (id: string, patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const auto = autoVolumetricHeatLoad(node);
  if (!auto) {
    return (
      <div style={{ fontSize: 11, color: "var(--fg-muted)", padding: "6px 8px", background: "var(--bg-soft, rgba(0,0,0,0.04))", borderRadius: 6, marginBottom: 8 }}>
        💡 Өргөн / Урт / Өндөр оруулаад дулааны ачааллын тооцоо автоматжина (БНбД 23-02-09 §7).
      </div>
    );
  }
  const buildingHeightUsed =
    typeof node.buildingHeight_m === "number" && node.buildingHeight_m > 0
      ? `${node.buildingHeight_m} м (тогтсон)`
      : typeof node.floors === "number" && node.floors > 0
        ? `${node.floors} × ${node.floorHeight_m ?? 3} м = ${(node.floors * (node.floorHeight_m ?? 3)).toFixed(1)} м`
        : "9 м (анхдагч)";
  const specEffective = resolveSpecificLoad({
    kind: node.kind,
    override: node.specificLoad_w_per_m3,
  });
  return (
    <div
      style={{
        marginBottom: 10,
        padding: "8px 10px",
        background: "var(--bg-soft, rgba(0,0,0,0.04))",
        borderRadius: 6,
        border: "1px dashed var(--border-soft)",
      }}
      data-testid="volumetric-heat-block"
    >
      <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        🧮 Дулааны ачаалал — авто (БНбД 23-02-09 §7)
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--fg)" }}>
        <div>📏 Өндөр: <strong>{buildingHeightUsed}</strong></div>
        <div>📦 Эзэлхүүн: <strong>{auto.volume_m3.toFixed(1)} м³</strong> = {node.width_m} × {node.height_m} × H</div>
      </div>
      <Field label={`Хувийн ачаалал (Вт/м³) · ${node.specificLoad_w_per_m3 ? "тогтсон" : "автомат — " + node.kind}`}>
        <input
          type="number"
          min={5}
          max={200}
          step={1}
          value={node.specificLoad_w_per_m3 ?? specEffective}
          disabled={readOnly}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!Number.isFinite(v) || v <= 0) return;
            updateNode(node.id, { specificLoad_w_per_m3: v });
          }}
          style={inputStyle}
          data-testid="inspector-specific-load"
          title="БНбД 23-02-09 §7 q_v — барилгын төрлөөс хамаарсан хувийн дулааны ачаалал"
        />
      </Field>
      <Field label="Дулааны ачаалал (кВт) — авто">
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="number"
            min={0}
            step={0.1}
            value={node.heatLoad_w != null ? (node.heatLoad_w / 1000).toFixed(2) : (auto.heatLoad_w / 1000).toFixed(2)}
            disabled={readOnly}
            onChange={(e) => {
              const kw = Number(e.target.value);
              if (!Number.isFinite(kw)) return;
              updateNode(node.id, { heatLoad_w: Math.round(kw * 1000) });
            }}
            style={inputStyle}
            data-testid="inspector-heat-load-kw"
            title="W = volume_m³ × specificLoad_w_per_m³ — engineer-override-боломжтой"
          />
          <button
            type="button"
            onClick={() => {
              updateNode(node.id, {
                heatLoad_w: auto.heatLoad_w,
                volume_m3: auto.volume_m3,
              });
            }}
            disabled={readOnly}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "var(--accent, #1f5faa)",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: readOnly ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
            data-testid="inspector-heat-load-reset"
            title="Auto-utga-aar дахин тооцоолох"
          >
            ⟲ Авто
          </button>
        </div>
      </Field>
      <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 4 }}>
        💡 Авто утга: <strong>{(auto.heatLoad_w / 1000).toFixed(2)} кВт</strong> ({auto.volume_m3.toFixed(1)} м³ × {specEffective} Вт/м³)
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 10, flex: 1 }}>
      <div style={{ fontSize: 11, color: "var(--fg-muted)", marginBottom: 3, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.4rem 0.55rem",
  fontSize: 13,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
};

const sidebarStyle: CSSProperties = {
  width: 340,
  background: "var(--bg-soft)",
  borderLeft: "1px solid var(--border-soft)",
  padding: "1rem",
  overflowY: "auto",
  height: "100%",
};
