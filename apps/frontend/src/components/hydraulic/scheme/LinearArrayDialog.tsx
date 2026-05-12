/**
 * Phase 6.5 — Linear array dialog.
 *
 * Modal form exposing the four `LinearArrayParams` fields. Submit
 * calls `applyLinearArrayToSelection()` from arrayApplier and reports
 * the result via the parent's `onResult` callback. Cancel just
 * closes — no side effects.
 */
import { useState, type CSSProperties } from "react";
import { applyLinearArrayToSelection } from "./arrayApplier";
import type { LinearArrayDirection } from "./arrayOps";

export interface LinearArrayDialogProps {
  onClose: () => void;
  onResult?: (result: { nodes: number; pipes: number } | null) => void;
}

export function LinearArrayDialog({ onClose, onResult }: LinearArrayDialogProps) {
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(5);
  const [rowSpacing_m, setRowSpacing] = useState(10);
  const [colSpacing_m, setColSpacing] = useState(20);
  const [direction, setDirection] = useState<LinearArrayDirection>("Right-Down");

  const totalCopies = Math.max(0, rows * cols - 1);
  const tooBig = totalCopies > 5000;
  const submit = () => {
    if (tooBig) return;
    const r = applyLinearArrayToSelection({
      rows,
      cols,
      rowSpacing_m,
      colSpacing_m,
      direction,
    });
    onResult?.(r);
    onClose();
  };

  return (
    <div style={backdrop} onClick={onClose} data-testid="linear-array-dialog">
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={titleStyle}>▦ Шугаман массив (Linear Array)</span>
          <button type="button" onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={fieldRow}>
          <Field label="Мөр (rows)">
            <NumInput value={rows} min={1} max={100} onChange={setRows} />
          </Field>
          <Field label="Багана (cols)">
            <NumInput value={cols} min={1} max={100} onChange={setCols} />
          </Field>
        </div>

        <div style={fieldRow}>
          <Field label="Мөрийн зай (м)">
            <NumInput value={rowSpacing_m} min={0.1} step={0.5} onChange={setRowSpacing} />
          </Field>
          <Field label="Баганын зай (м)">
            <NumInput value={colSpacing_m} min={0.1} step={0.5} onChange={setColSpacing} />
          </Field>
        </div>

        <Field label="Чиглэл">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as LinearArrayDirection)}
            style={inputStyle}
          >
            <option value="Right-Down">→↓ Баруун-доош</option>
            <option value="Right-Up">→↑ Баруун-дээш</option>
            <option value="Left-Down">←↓ Зүүн-доош</option>
            <option value="Left-Up">←↑ Зүүн-дээш</option>
          </select>
        </Field>

        <div style={summary}>
          <b>{totalCopies}</b> хувилбар үүсгэх ({rows}×{cols} - 1 эх хувилбар)
        </div>
        {tooBig && (
          <div style={{ color: "var(--danger, #f44)", fontSize: 12, marginTop: 4 }}>
            ⚠ 5000-аас илүү хувилбар үүсгэх боломжгүй. Хэт том grid-ыг 2 шаттай хийнэ үү.
          </div>
        )}

        <div style={btnRow}>
          <button type="button" onClick={onClose} style={cancelBtn}>Цуцлах</button>
          <button
            type="button"
            onClick={submit}
            disabled={tooBig}
            style={{
              ...okBtn,
              opacity: tooBig ? 0.4 : 1,
              cursor: tooBig ? "not-allowed" : "pointer",
            }}
          >
            Үүсгэх
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form primitives (shared with PolarArrayDialog) ────────────── */

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

export { inputStyle as _sharedInputStyle };
