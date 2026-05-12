/**
 * Phase 6E — layer panel.
 *
 * Compact collapsible panel exposing the five pipe-role layers:
 *   - colour swatch
 *   - layer label (Mongolian)
 *   - 👁 visibility toggle
 *   - 🔒 lock toggle
 *
 * Designed to slot anywhere in the editor's overlay area. The store
 * is the source of truth — toggles call `updateSettings({ layers:
 * ... })` and the SchemeEditor's pipe-render path re-reads on the
 * next render.
 *
 * No color-picker in this iteration; the engineer can hand-edit the
 * project JSON if they want bespoke colours (defaults match the
 * Russian/Mongolian drafting palette so most never will).
 */
import { useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { DEFAULT_LAYERS, LAYER_ORDER, type LayerKey } from "./layers";

export function LayerPanel() {
  const settings = useHydraulicStore((s) => s.settings);
  const updateSettings = useHydraulicStore((s) => s.updateSettings);
  const [open, setOpen] = useState(true);

  const setLayer = (key: LayerKey, patch: { visible?: boolean; locked?: boolean }) => {
    const existing = settings.layers ?? {};
    const current = existing[key] ?? {};
    updateSettings({
      layers: {
        ...existing,
        [key]: { ...current, ...patch },
      },
    });
  };

  return (
    <div style={wrap} data-testid="layer-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={headerBtn}
        title={open ? "Давхрага хаах" : "Давхрага нээх"}
      >
        <span>📚 Давхрага</span>
        <span style={{ opacity: 0.6, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div style={list}>
          {LAYER_ORDER.map((key) => {
            const def = DEFAULT_LAYERS[key];
            const override = settings.layers?.[key] ?? {};
            const visible = override.visible ?? def.visible;
            const locked = override.locked ?? def.locked;
            const color = override.color ?? def.color;
            return (
              <div key={key} style={row}>
                <span
                  style={{
                    ...swatch,
                    background: color,
                    opacity: visible ? 1 : 0.3,
                  }}
                />
                <span style={{ ...label, color: visible ? "var(--fg)" : "var(--fg-muted)" }}>
                  <b style={{ fontFamily: "var(--font-mono)" }}>{key}</b> &nbsp;
                  {def.label}
                </span>
                <button
                  type="button"
                  onClick={() => setLayer(key, { visible: !visible })}
                  title={visible ? "Нуух" : "Харуулах"}
                  style={{
                    ...iconBtn,
                    color: visible ? "var(--fg)" : "var(--fg-muted)",
                  }}
                  data-testid={`layer-visibility-${key}`}
                >
                  {visible ? "👁" : "—"}
                </button>
                <button
                  type="button"
                  onClick={() => setLayer(key, { locked: !locked })}
                  title={locked ? "Тайлах" : "Цоожлох"}
                  style={{
                    ...iconBtn,
                    color: locked ? "var(--warning, #e6914f)" : "var(--fg-muted)",
                  }}
                  data-testid={`layer-lock-${key}`}
                >
                  {locked ? "🔒" : "🔓"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const wrap: CSSProperties = {
  background: "var(--bp-bg-2, #1c1c1c)",
  border: "1px solid var(--bp-line, #333)",
  borderRadius: 6,
  fontSize: 12,
  minWidth: 240,
  maxWidth: 320,
  boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.3))",
};

const headerBtn: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  width: "100%",
  padding: "0.5rem 0.7rem",
  background: "transparent",
  color: "var(--fg, #fff)",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "var(--font-sans, inherit)",
};

const list: CSSProperties = {
  borderTop: "1px solid var(--bp-line, #333)",
  padding: "0.3rem 0",
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0.35rem 0.7rem",
};

const swatch: CSSProperties = {
  display: "inline-block",
  width: 14,
  height: 14,
  border: "1px solid var(--bp-line, #333)",
  borderRadius: 2,
  flexShrink: 0,
};

const label: CSSProperties = {
  flex: 1,
  fontSize: 11.5,
  lineHeight: 1.3,
};

const iconBtn: CSSProperties = {
  width: 22,
  height: 22,
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  fontSize: 13,
};
