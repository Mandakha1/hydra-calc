/**
 * Modal asking the user to assign usage to a freshly drawn building footprint,
 * then auto-computes heat load from envelope volume × specific load.
 *
 * Specific loads (W/m³) are typical Mongolian design values per БНбД 23-02 + UB heat-loss
 * benchmarks (Sokolov + НТП-90). Editable.
 */
import { useMemo, useState } from "react";
import { NODE_KINDS } from "../nodeCatalog";
import { polygonAreaM2, polygonPerimeterM } from "../geometry";
import type { SchemeNode } from "../hydraulicTypes";

const SPECIFIC_LOAD_W_PER_M3: Record<string, number> = {
  consumer_apartment: 35,
  consumer_house: 45,
  consumer_office: 40,
  consumer_school: 50,
  consumer_hospital: 70,
  consumer_retail: 38,
  consumer_industrial: 60,
  consumer_warehouse: 18,
};

interface Props {
  footprint: Array<{ x: number; y: number; lat?: number; lon?: number }>;
  /** Pre-fill values (e.g. from OSM Overpass API). */
  preset?: Partial<SchemeNode>;
  onConfirm: (data: Partial<SchemeNode> & { kind: string }) => void;
  onCancel: () => void;
}

export function BuildingDialog({ footprint, preset, onConfirm, onCancel }: Props) {
  const consumerKinds = NODE_KINDS.filter((k) => k.formKey === "consumerBuilding");
  const [kind, setKind] = useState<string>(preset?.kind ?? consumerKinds[0]!.key);
  const def = NODE_KINDS.find((k) => k.key === kind);
  const [floors, setFloors] = useState<number>(preset?.floors ?? def?.defaults?.floors ?? 5);
  const [floorHeight, setFloorHeight] = useState<number>(preset?.floorHeight_m ?? 3.0);
  const [specificLoad, setSpecificLoad] = useState<number>(preset?.specificLoad_w_per_m3 ?? SPECIFIC_LOAD_W_PER_M3[kind] ?? 35);
  const [name, setName] = useState<string>(preset?.label ?? "");

  const area_m2 = useMemo(() => polygonAreaM2(footprint), [footprint]);
  const perimeter_m = useMemo(() => polygonPerimeterM(footprint), [footprint]);
  const buildingHeight_m = floors * floorHeight;
  const volume_m3 = area_m2 * buildingHeight_m;
  const heatLoad_w = volume_m3 * specificLoad;

  function handleKindChange(k: string) {
    setKind(k);
    const newDef = NODE_KINDS.find((x) => x.key === k);
    if (newDef?.defaults?.floors) setFloors(newDef.defaults.floors);
    setSpecificLoad(SPECIFIC_LOAD_W_PER_M3[k] ?? 35);
  }

  function handleConfirm() {
    onConfirm({
      kind,
      label: name || `${def?.shortLabel ?? "Барилга"}-${Date.now().toString(36).slice(-3)}`,
      footprint,
      footprintArea_m2: area_m2,
      floors,
      floorHeight_m: floorHeight,
      buildingHeight_m,
      volume_m3,
      floor_area_m2: area_m2,
      specificLoad_w_per_m3: specificLoad,
      heatLoad_w: Math.round(heatLoad_w),
      requiredPressure_mpa: def?.defaults?.requiredPressure_mpa ?? 0.15,
    });
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(11, 17, 23, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "1.5rem",
          width: "min(560px, 92vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Барилгын зориулалт + хэмжээг сонгоно уу</h3>
        <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: "1rem" }}>
          Цэгийн зурлагаас тогтоолгүй: <b style={{ color: "var(--accent)" }}>S = {area_m2.toFixed(1)} м²</b> · Периметр {perimeter_m.toFixed(1)} м · {footprint.length} өнцөг
        </div>

        <Field label="Зориулалт">
          <select value={kind} onChange={(e) => handleKindChange(e.target.value)} style={inputStyle}>
            {consumerKinds.map((k) => (
              <option key={k.key} value={k.key}>{k.icon} {k.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Барилгын нэр (сонголт)">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={def?.shortLabel}
            style={inputStyle}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Давхрын тоо">
            <input
              type="number"
              min={1}
              max={50}
              value={floors}
              onChange={(e) => setFloors(Math.max(1, Number(e.target.value) || 1))}
              style={inputStyle}
            />
          </Field>
          <Field label="Давхрын өндөр (м)">
            <input
              type="number"
              step={0.1}
              min={2}
              max={6}
              value={floorHeight}
              onChange={(e) => setFloorHeight(Number(e.target.value) || 3)}
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Тусгай дулаан ачаалал q (Вт/м³)">
          <input
            type="number"
            step={1}
            min={5}
            max={200}
            value={specificLoad}
            onChange={(e) => setSpecificLoad(Number(e.target.value) || 35)}
            style={inputStyle}
          />
          <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 4 }}>
            БНбД 23-02 / Сoколов: орон сууц 30-45, эмнэлэг 60-80, үйлдвэр 50-100
          </div>
        </Field>

        <div
          style={{
            marginTop: "1rem",
            padding: "0.85rem",
            background: "var(--bg)",
            borderRadius: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            border: "1px solid var(--border-soft)",
          }}
        >
          <div style={{ marginBottom: 6, color: "var(--fg-muted)", fontSize: 11, textTransform: "uppercase" }}>Автомат тооцоо</div>
          <div>S<sub>шал</sub> = <b>{area_m2.toFixed(1)} м²</b></div>
          <div>H<sub>барилга</sub> = {floors} × {floorHeight.toFixed(1)} = <b>{buildingHeight_m.toFixed(1)} м</b></div>
          <div>V = {area_m2.toFixed(1)} × {buildingHeight_m.toFixed(1)} = <b>{volume_m3.toFixed(0)} м³</b></div>
          <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 6, marginTop: 6 }}>
            <span style={{ color: "var(--accent)" }}>
              Q = {volume_m3.toFixed(0)} × {specificLoad} = <b>{(heatLoad_w / 1000).toFixed(2)} кВт</b>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: "1.25rem", justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...btnStyle, background: "transparent", borderColor: "var(--border)" }}>
            Цуцлах
          </button>
          <button onClick={handleConfirm} style={{ ...btnStyle, background: "var(--accent)", color: "#0b1117", borderColor: "var(--accent)", fontWeight: 600 }}>
            Үүсгэх ✓
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  fontSize: 14,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
};

const btnStyle: React.CSSProperties = {
  padding: "0.55rem 1.2rem",
  fontSize: 14,
  border: "1px solid var(--border)",
  background: "var(--bg-elev)",
  color: "var(--fg)",
  borderRadius: 6,
  cursor: "pointer",
};
