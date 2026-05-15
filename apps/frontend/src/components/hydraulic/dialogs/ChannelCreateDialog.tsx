/**
 * Phase 12.5b — Channel creation dialog.
 *
 * Opens when the engineer completes the 2-click `addChannel` flow on
 * the SchemeEditor: pick channel type (Л-4 / Л-7 / Л-9 / custom),
 * tick the contained circuits, supply custom dimensions if needed,
 * confirm → SchemeEditor builds the channel + pipes atomically via
 * `addChannel`. Replaces the Phase 12.5 default (always Л-7 + 4
 * standard circuits) so engineers can choose the right section type
 * for the project at draw time.
 *
 * Per ГК-23/02 СЕРИЯ Г-991-1 + GK_DATA.json dimensions.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CHANNEL_TYPE_REGISTRY,
  CIRCUIT_DEFAULTS,
  type ChannelTypeKey,
} from "../scheme/channelTypes";
import type { PipeCircuit } from "../nodeCatalog";

export interface ChannelCreatePayload {
  channelType: ChannelTypeKey;
  customWidth_mm?: number;
  customHeight_mm?: number;
  pipeCircuits: PipeCircuit[];
  defaultDn: number;
}

interface Props {
  /** Engineer-supplied length_m read off the geometry — shown for
   *  context but not editable here (engineer adjusts per-pipe via
   *  Inspector once the channel exists). */
  length_m: number;
  onConfirm: (payload: ChannelCreatePayload) => void;
  onCancel: () => void;
}

/** Pre-baked recommendations per channel type so the engineer picks
 *  a sensible default set in one click. Engineer can still tick /
 *  untick individually. */
const RECOMMENDED_CIRCUITS: Record<Exclude<ChannelTypeKey, "custom">, PipeCircuit[]> = {
  "Л-4": ["heating_supply", "heating_return"],
  "Л-7": ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc"],
  "Л-9": ["heating_supply", "heating_return", "dhw_supply", "dhw_recirc", "cold_water"],
};

export function ChannelCreateDialog({ length_m, onConfirm, onCancel }: Props) {
  const [channelType, setChannelType] = useState<ChannelTypeKey>("Л-7");
  const [customWidth, setCustomWidth] = useState<string>("800");
  const [customHeight, setCustomHeight] = useState<string>("500");
  const [circuits, setCircuits] = useState<Set<PipeCircuit>>(
    new Set(RECOMMENDED_CIRCUITS["Л-7"]),
  );
  const [defaultDn, setDefaultDn] = useState<string>("100");

  // Whenever the engineer picks a new channel type, reset the circuit
  // checklist to the recommended set so the modal stays opinionated
  // but not enforcing — they can still untick after the change.
  useEffect(() => {
    if (channelType === "custom") return;
    setCircuits(new Set(RECOMMENDED_CIRCUITS[channelType]));
  }, [channelType]);

  // ESC closes; Enter confirms (matches engineer keyboard habits).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirmIfValid();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelType, circuits, customWidth, customHeight, defaultDn]);

  const cwNum = parseFloat(customWidth);
  const chNum = parseFloat(customHeight);
  const dnNum = parseFloat(defaultDn);
  const validCustom =
    channelType !== "custom" ||
    (Number.isFinite(cwNum) && cwNum > 0 && Number.isFinite(chNum) && chNum > 0);
  const validDn = Number.isFinite(dnNum) && dnNum >= 15 && dnNum <= 1400;
  const validCircuits = circuits.size >= 1;
  const canConfirm = validCustom && validDn && validCircuits;

  function toggleCircuit(c: PipeCircuit) {
    const next = new Set(circuits);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setCircuits(next);
  }

  function confirmIfValid() {
    if (!canConfirm) return;
    const orderedCircuits: PipeCircuit[] = CIRCUIT_DEFAULTS.map((c) => c.circuit).filter(
      (c) => circuits.has(c),
    );
    const payload: ChannelCreatePayload = {
      channelType,
      pipeCircuits: orderedCircuits,
      defaultDn: dnNum,
      ...(channelType === "custom"
        ? { customWidth_mm: cwNum, customHeight_mm: chNum }
        : {}),
    };
    onConfirm(payload);
  }

  const specPreview = useMemo(() => {
    if (channelType === "custom") {
      if (!validCustom) return "Хэмжээ оруулаагүй";
      return `Сонголтоор ${cwNum}×${chNum} мм`;
    }
    const spec = CHANNEL_TYPE_REGISTRY[channelType];
    return `${spec.label} — ${spec.useCase}`;
  }, [channelType, cwNum, chNum, validCustom]);

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" data-testid="channel-create-dialog">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h3 style={{ margin: 0, fontSize: 16 }}>▤ Суваг үүсгэх (ГК-23/02)</h3>
          <button onClick={onCancel} style={closeBtn} aria-label="Хаах">
            ✕
          </button>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--fg-muted)" }}>
          Бетон сувагт орох хоолойнуудыг сонгож, төрлийг тогтооно. Хоолойн нийт
          урт <strong>{length_m.toFixed(1)} м</strong> — анхдагч DN {defaultDn} мм-ээр бөглөгдөнө.
        </p>

        {/* Channel type radios */}
        <div style={sectionStyle}>
          <h4 style={sectionTitle}>Сувгийн төрөл</h4>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(Object.values(CHANNEL_TYPE_REGISTRY) as Array<{
              key: ChannelTypeKey;
              label: string;
            }>).map((spec) => (
              <label key={spec.key} style={typeOption(channelType === spec.key)}>
                <input
                  type="radio"
                  name="channel-type"
                  value={spec.key}
                  checked={channelType === spec.key}
                  onChange={() => setChannelType(spec.key)}
                  data-testid={`channel-type-${spec.key}`}
                />
                <span>{spec.label}</span>
              </label>
            ))}
            <label style={typeOption(channelType === "custom")}>
              <input
                type="radio"
                name="channel-type"
                value="custom"
                checked={channelType === "custom"}
                onChange={() => setChannelType("custom")}
                data-testid="channel-type-custom"
              />
              <span>Сонголтоор</span>
            </label>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--fg-muted)" }}>
            {specPreview}
          </p>
        </div>

        {/* Custom dimensions */}
        {channelType === "custom" && (
          <div style={sectionStyle}>
            <h4 style={sectionTitle}>Хэмжээ (мм)</h4>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <label>
                Өргөн:&nbsp;
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(e.target.value)}
                  min={100}
                  max={3000}
                  step={50}
                  style={numInputStyle}
                  data-testid="channel-custom-width"
                />
              </label>
              <label>
                Өндөр:&nbsp;
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(e.target.value)}
                  min={100}
                  max={2000}
                  step={50}
                  style={numInputStyle}
                  data-testid="channel-custom-height"
                />
              </label>
            </div>
          </div>
        )}

        {/* Circuit checklist */}
        <div style={sectionStyle}>
          <h4 style={sectionTitle}>Багтаах хоолойнууд (ГК-23/02 хэлхээ)</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {CIRCUIT_DEFAULTS.map((c) => {
              const checked = circuits.has(c.circuit);
              return (
                <label
                  key={c.circuit}
                  style={circuitOption(checked)}
                  data-testid={`circuit-${c.circuit}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCircuit(c.circuit)}
                  />
                  <span>
                    <strong>{c.code}</strong> — {c.label}
                    {c.tempC != null && (
                      <span style={{ color: "var(--fg-muted)", marginLeft: 6 }}>
                        ({c.tempC}°C)
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          {!validCircuits && (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--danger)" }}>
              Дор хаяж 1 хэлхээ сонгоно уу.
            </p>
          )}
        </div>

        {/* Default DN */}
        <div style={sectionStyle}>
          <h4 style={sectionTitle}>Анхдагч DN (мм)</h4>
          <input
            type="number"
            value={defaultDn}
            onChange={(e) => setDefaultDn(e.target.value)}
            min={15}
            max={1400}
            step={5}
            style={numInputStyle}
            data-testid="channel-default-dn"
          />
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--fg-muted)" }}>
            Бүх хоолой энэ DN-ээр эхэлнэ — Inspector-аас тус бүрд нь засна.
          </span>
        </div>

        {/* Footer actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button onClick={onCancel} style={secondaryBtn} data-testid="channel-cancel">
            Цуцлах
          </button>
          <button
            onClick={confirmIfValid}
            disabled={!canConfirm}
            style={canConfirm ? primaryBtn : primaryBtnDisabled}
            data-testid="channel-confirm"
          >
            Үүсгэх ({circuits.size}п)
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalStyle: CSSProperties = {
  background: "var(--bg, white)",
  borderRadius: 10,
  width: "min(560px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  padding: 18,
  boxShadow: "0 10px 60px rgba(0,0,0,0.3)",
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border-soft, #eee)",
};
const closeBtn: CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 18,
  cursor: "pointer",
  color: "var(--fg-muted, #888)",
};
const sectionStyle: CSSProperties = { marginBottom: 12 };
const sectionTitle: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 12,
  color: "var(--fg-muted, #444)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
function typeOption(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "5px 10px",
    border: `1px solid ${active ? "var(--accent, #1f5faa)" : "var(--border-soft, #ddd)"}`,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    background: active ? "rgba(31, 95, 170, 0.06)" : "transparent",
  };
}
function circuitOption(checked: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    border: `1px solid ${checked ? "var(--accent, #1f5faa)" : "var(--border-soft, #ddd)"}`,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    background: checked ? "rgba(31, 95, 170, 0.06)" : "transparent",
  };
}
const numInputStyle: CSSProperties = {
  padding: "4px 6px",
  width: 90,
  fontSize: 12,
  border: "1px solid var(--border-soft, #ccc)",
  borderRadius: 4,
};
const primaryBtn: CSSProperties = {
  padding: "6px 14px",
  background: "var(--accent, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 13,
};
const primaryBtnDisabled: CSSProperties = {
  ...primaryBtn,
  opacity: 0.5,
  cursor: "not-allowed",
};
const secondaryBtn: CSSProperties = {
  padding: "6px 14px",
  background: "var(--bg-elev, #f6f6f8)",
  border: "1px solid var(--border-soft, #ddd)",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 13,
};
