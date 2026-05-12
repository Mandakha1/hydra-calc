import type { CSSProperties, ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { PIPE_DB, PIPE_MATERIALS, CLIMATE, WALL_TYPES, GLAZING } from "shared";
import { calcHeatLoad } from "../calc/heatLoad";
import { pipeLengthFromGeometry } from "../calc/haversine";
import { updateDimension, removeDimension } from "../scheme/dimensionApplier";
import {
  resolveDimensionEndpoints,
  computeDimensionLabel,
} from "../scheme/dimensions";
import type { BuildingEnvelope, EnvelopeSurface, SchemeDimension } from "../hydraulicTypes";

export function InspectorPanel({ readOnly }: { readOnly?: boolean }) {
  const selection = useHydraulicStore((s) => s.selection);
  const nodes = useHydraulicStore((s) => s.nodes);
  const pipes = useHydraulicStore((s) => s.pipes);
  const settings = useHydraulicStore((s) => s.settings);
  const dimensions = useHydraulicStore((s) => s.dimensions);
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
        <Field label="Төрөл">
          <select
            value={node.kind}
            disabled={readOnly}
            onChange={(e) => updateNode(node.id, { kind: e.target.value as typeof node.kind })}
            style={inputStyle}
          >
            <option value="consumer">Хэрэглэгч</option>
            <option value="source">Источник</option>
            <option value="junction">Салаалалт</option>
            <option value="pump">Насос</option>
            <option value="well">Худаг / ИТП</option>
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
