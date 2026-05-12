/**
 * Phase 6.5 — Polar array dialog.
 *
 * Modal for `PolarArrayParams`. Centre input simplified to numeric
 * x/y px fields with a "Use selection centroid" shortcut button —
 * a full canvas-click centre-picker UX is deferred (the numeric
 * input + shortcut covers the common cases).
 */
import { useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { applyPolarArrayToSelection } from "./arrayApplier";
import { centroidPx } from "./transforms";

export interface PolarArrayDialogProps {
  onClose: () => void;
  onResult?: (result: { nodes: number; pipes: number } | null) => void;
}

export function PolarArrayDialog({ onClose, onResult }: PolarArrayDialogProps) {
  // Default centre = selection centroid (most common engineering case).
  const initialCenter = (() => {
    const s = useHydraulicStore.getState();
    const targets = s.nodes.filter((n) => s.multiSelection.nodeIds.includes(n.id));
    if (targets.length === 0) return { x: 0, y: 0 };
    return centroidPx(targets);
  })();

  const [count, setCount] = useState(8);
  const [centerX, setCenterX] = useState(Math.round(initialCenter.x));
  const [centerY, setCenterY] = useState(Math.round(initialCenter.y));
  const [startAngleDeg, setStartAngle] = useState<string>("");
  const [sweepAngleDeg, setSweepAngle] = useState(360);
  const [rotateEachWithArray, setRotateEach] = useState(false);

  const totalCopies = Math.max(0, count - 1);
  const tooBig = totalCopies > 360;
  const submit = () => {
    if (tooBig || count < 2) return;
    const r = applyPolarArrayToSelection({
      center_px: { x: centerX, y: centerY },
      count,
      ...(startAngleDeg.trim() !== "" && Number.isFinite(Number(startAngleDeg))
        ? { startAngleDeg: Number(startAngleDeg) }
        : {}),
      sweepAngleDeg,
      rotateEachWithArray,
    });
    onResult?.(r);
    onClose();
  };

  const useSelCentroid = () => {
    const s = useHydraulicStore.getState();
    const targets = s.nodes.filter((n) => s.multiSelection.nodeIds.includes(n.id));
    if (targets.length === 0) return;
    const c = centroidPx(targets);
    setCenterX(Math.round(c.x));
    setCenterY(Math.round(c.y));
  };

  return (
    <div style={backdrop} onClick={onClose} data-testid="polar-array-dialog">
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={titleStyle}>⊕ Радиал массив (Polar Array)</span>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <Field label="Хувилбарын тоо (төв доторх эх + хувилбарууд)">
          <NumInput value={count} min={2} max={360} onChange={setCount} />
        </Field>

        <div style={fieldRow}>
          <Field label="Төв X (px)">
            <NumInput value={centerX} onChange={setCenterX} />
          </Field>
          <Field label="Төв Y (px)">
            <NumInput value={centerY} onChange={setCenterY} />
          </Field>
        </div>
        <button type="button" onClick={useSelCentroid} style={ghostBtn}>
          ⊙ Сонгогдсон цэгүүдийн төв ашиглах
        </button>

        <div style={fieldRow}>
          <Field label="Эхлэх өнцөг (°)">
            <input
              type="number"
              placeholder="авто"
              value={startAngleDeg}
              onChange={(e) => setStartAngle(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Тойргын дүрс (°, 360=бүтэн)">
            <NumInput value={sweepAngleDeg} min={1} max={720} onChange={setSweepAngle} />
          </Field>
        </div>

        <label style={checkboxRow}>
          <input
            type="checkbox"
            checked={rotateEachWithArray}
            onChange={(e) => setRotateEach(e.target.checked)}
          />
          <span>Хувилбар бүрийг өөрийнх нь өнцгөөр эргүүлэх (үндсэн чиглэл төв рүү харна)</span>
        </label>

        <div style={summary}>
          <b>{totalCopies}</b> хувилбар үүсгэх (эх хувилбар тооцолоогүй)
        </div>
        {tooBig && (
          <div style={{ color: "var(--danger, #f44)", fontSize: 12, marginTop: 4 }}>
            ⚠ Хэт олон хувилбар (360-аас илүү). Утгыг бууруулна уу.
          </div>
        )}

        <div style={btnRow}>
          <button type="button" onClick={onClose} style={cancelBtn}>Цуцлах</button>
          <button
            type="button"
            onClick={submit}
            disabled={tooBig || count < 2}
            style={{
              ...okBtn,
              opacity: tooBig || count < 2 ? 0.4 : 1,
              cursor: tooBig || count < 2 ? "not-allowed" : "pointer",
            }}
          >
            Үүсгэх
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <span style={{ fontSize: 11, color: "var(--fg-muted, #888)" }}>{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (!Number.isFinite(v)) return;
        onChange(v);
      }}
      style={inputStyle}
    />
  );
}

const backdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const dialog: CSSProperties = {
  background: "var(--bp-bg-2, #1c1c1c)",
  border: "1px solid var(--bp-line, #333)",
  borderRadius: 8,
  padding: "1rem 1.25rem",
  minWidth: 380,
  maxWidth: 480,
  fontFamily: "var(--font-sans, inherit)",
  color: "var(--fg, #fff)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: "1px solid var(--bp-line, #333)",
};

const titleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
};

const closeBtn: CSSProperties = {
  width: 24,
  height: 24,
  padding: 0,
  background: "transparent",
  color: "var(--fg-muted, #888)",
  border: "none",
  cursor: "pointer",
  fontSize: 16,
};

const fieldRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 10,
};

const inputStyle: CSSProperties = {
  padding: "0.35rem 0.5rem",
  fontSize: 13,
  background: "var(--bp-bg, #2a2a2a)",
  color: "var(--fg, #fff)",
  border: "1px solid var(--bp-line, #444)",
  borderRadius: 4,
  fontFamily: "var(--font-mono, monospace)",
  width: "100%",
  boxSizing: "border-box",
};

const ghostBtn: CSSProperties = {
  padding: "0.35rem 0.7rem",
  marginBottom: 10,
  marginTop: -4,
  background: "transparent",
  color: "var(--fg-muted, #888)",
  border: "1px dashed var(--bp-line, #444)",
  borderRadius: 4,
  fontSize: 11,
  fontFamily: "var(--font-sans, inherit)",
  cursor: "pointer",
  width: "100%",
};

const checkboxRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "var(--fg, #fff)",
  marginTop: 4,
  cursor: "pointer",
};

const summary: CSSProperties = {
  padding: "0.5rem 0.7rem",
  marginTop: 8,
  background: "var(--bp-bg, #2a2a2a)",
  border: "1px solid var(--bp-line, #444)",
  borderRadius: 4,
  fontSize: 12,
  color: "var(--fg, #fff)",
};

const btnRow: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 14,
};

const cancelBtn: CSSProperties = {
  padding: "0.5rem 0.9rem",
  background: "transparent",
  color: "var(--fg-muted, #888)",
  border: "1px solid var(--bp-line, #444)",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "var(--font-sans, inherit)",
};

const okBtn: CSSProperties = {
  padding: "0.5rem 1.2rem",
  background: "#FFB300",
  color: "#000",
  border: "none",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--font-sans, inherit)",
};
