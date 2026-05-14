/**
 * Phase 6.5 — BatchOpsToolbar.
 *
 * Compact toolbar exposing every Phase 6.5 batch operation as a single
 * click:
 *   ↺ ↻ ⟳ ⏥ ⏤ ▦ ⊕
 *   Rotate CCW / Rotate CW / Rotate 180 / Mirror H / Mirror V /
 *   Linear array / Polar array
 *
 * State machine:
 *   - All transform buttons disabled when multiSelection is empty.
 *   - Array buttons disabled when multiSelection is empty (need a
 *     payload to clone).
 *   - Linear / Polar buttons open a modal dialog with the params;
 *     "Үүсгэх" submits, "Цуцлах" closes.
 *
 * Where it sits:
 *   Mounted by SchemeEditor at the top-centre of the canvas, above
 *   the existing top toolbar. Visible whenever the editor is active.
 *
 * Phase 6.8.7 (BUG #6) — engineers reported the rotate ↺/↻ glyphs
 * looked identical to undo/redo glyphs in the OS font (both render
 * to "an arc with arrow", visually indistinguishable at 16px on
 * common Windows / Mac font stacks). Fixed by adding a short text
 * label under each button: "↺ 90°", "↻ 90°", "⟳ 180°", "⏥ ↕",
 * "⏤ ↔", "▦", "⊕". The label is the load-bearing engineer cue;
 * the glyph stays as a visual anchor.
 */
import { useState, type CSSProperties } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import {
  applyRotateCCW,
  applyRotateCW,
  applyRotate180,
  applyMirrorHorizontal,
  applyMirrorVertical,
} from "./transformApplier";
import { LinearArrayDialog } from "./LinearArrayDialog";
import { PolarArrayDialog } from "./PolarArrayDialog";

export interface BatchOpsToolbarProps {
  /** Called when an operation completes successfully — caller can
   *  raise a toast or trigger any other UI feedback. */
  onToastMessage?: (text: string) => void;
}

export function BatchOpsToolbar({ onToastMessage }: BatchOpsToolbarProps) {
  const ms = useHydraulicStore((s) => s.multiSelection);
  const [linearOpen, setLinearOpen] = useState(false);
  const [polarOpen, setPolarOpen] = useState(false);

  const totalSelected = ms.nodeIds.length + ms.pipeIds.length;
  // Phase 6.8.7 — transforms enable when ANY transformable entity is
  // selected (nodes / annotations / buildings). Previously only nodes
  // unlocked the rotate / mirror buttons, so a building-only
  // selection couldn't be rotated even though `applyRotate*` knows
  // how to handle it.
  const transformsDisabled =
    ms.nodeIds.length === 0
    && (ms.annotationIds ?? []).length === 0
    && (ms.buildingIds ?? []).length === 0;
  // Array tools still require nodes — cloning a payload without
  // nodes is a no-op for now (Phase 6.5.4 arrayApplier reads node
  // ids first; building-only arrays would need a separate code
  // path that's out of scope for the closeout PR).
  const arrayDisabled = ms.nodeIds.length === 0;

  const runWithToast = (action: () => number, prefix: string) => () => {
    const n = action();
    if (n > 0 && onToastMessage) {
      onToastMessage(`${prefix}: ${n} цэг`);
    }
  };

  return (
    <>
      <div style={wrap} data-testid="batch-ops-toolbar">
        <span style={label}>Бөгөмөөр:</span>
        <ToolbarBtn
          title="Цагийн зүүний эсрэг 90° (CCW)"
          subLabel="90°↺"
          disabled={transformsDisabled}
          onClick={runWithToast(applyRotateCCW, "Эргүүлсэн ↺ 90°")}
        >↺</ToolbarBtn>
        <ToolbarBtn
          title="Цагийн зүүгээр 90° (CW)"
          subLabel="90°↻"
          disabled={transformsDisabled}
          onClick={runWithToast(applyRotateCW, "Эргүүлсэн ↻ 90°")}
        >↻</ToolbarBtn>
        <ToolbarBtn
          title="180° эргүүлэх"
          subLabel="180°"
          disabled={transformsDisabled}
          onClick={runWithToast(applyRotate180, "Эргүүлсэн 180°")}
        >⟳</ToolbarBtn>
        <span style={divider} />
        <ToolbarBtn
          title="Хэвтээ тэнхлэгээр тусгах (дээш↕доош)"
          subLabel="↕"
          disabled={transformsDisabled}
          onClick={runWithToast(applyMirrorHorizontal, "Хэвтээ тусгасан")}
        >⏥</ToolbarBtn>
        <ToolbarBtn
          title="Босоо тэнхлэгээр тусгах (зүүн↔баруун)"
          subLabel="↔"
          disabled={transformsDisabled}
          onClick={runWithToast(applyMirrorVertical, "Босоо тусгасан")}
        >⏤</ToolbarBtn>
        <span style={divider} />
        <ToolbarBtn
          title="Шугаман массив (N×M grid)"
          subLabel="N×M"
          disabled={arrayDisabled}
          onClick={() => setLinearOpen(true)}
        >▦</ToolbarBtn>
        <ToolbarBtn
          title="Радиал массив (төвийн орчмын N хувилбар)"
          subLabel="rad"
          disabled={arrayDisabled}
          onClick={() => setPolarOpen(true)}
        >⊕</ToolbarBtn>
        {totalSelected > 0 && (
          <span style={countBadge} data-testid="batch-ops-count">
            {totalSelected}
          </span>
        )}
      </div>
      {linearOpen && (
        <LinearArrayDialog
          onClose={() => setLinearOpen(false)}
          onResult={(r) => {
            if (r && onToastMessage) {
              onToastMessage(`Шугаман массив: ${r.nodes} цэг, ${r.pipes} хоолой үүсгэгдсэн`);
            }
          }}
        />
      )}
      {polarOpen && (
        <PolarArrayDialog
          onClose={() => setPolarOpen(false)}
          onResult={(r) => {
            if (r && onToastMessage) {
              onToastMessage(`Радиал массив: ${r.nodes} цэг, ${r.pipes} хоолой үүсгэгдсэн`);
            }
          }}
        />
      )}
    </>
  );
}

/* ─── Local button presentation ─────────────────────────────────── */

function ToolbarBtn({
  children,
  onClick,
  disabled,
  title,
  subLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  /** Phase 6.8.7 — short text label rendered under the glyph so
   *  rotate buttons can't be confused with undo/redo (the latter
   *  use the same ↺/↻ characters on most OS fonts). 3–5 chars. */
  subLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-sublabel={subLabel}
      style={{
        ...btnBase,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span style={glyphStyle}>{children}</span>
      {subLabel && <span style={subLabelStyle}>{subLabel}</span>}
    </button>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const wrap: CSSProperties = {
  position: "absolute",
  top: 12,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  alignItems: "center",
  gap: 4,
  padding: "4px 10px",
  background: "var(--bp-bg-2, #1c1c1c)",
  border: "1px solid var(--bp-line, #333)",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "var(--font-sans, inherit)",
  zIndex: 7,
  boxShadow: "var(--shadow, 0 2px 8px rgba(0,0,0,0.3))",
};

const label: CSSProperties = {
  fontSize: 11,
  color: "var(--fg-muted, #888)",
  marginRight: 4,
  fontWeight: 600,
};

const divider: CSSProperties = {
  width: 1,
  height: 18,
  background: "var(--bp-line, #444)",
  margin: "0 4px",
};

const btnBase: CSSProperties = {
  // Phase 6.8.7 — width widened (30 → 42) + height grown (28 → 36)
  // to fit the disambiguating subLabel underneath each glyph.
  width: 42,
  height: 36,
  padding: 0,
  border: "1px solid var(--bp-line, #444)",
  borderRadius: 4,
  background: "var(--bp-bg, #2a2a2a)",
  color: "var(--fg, #fff)",
  fontFamily: "var(--font-mono, monospace)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 80ms, border-color 80ms",
  lineHeight: 1,
};

const glyphStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1,
};

const subLabelStyle: CSSProperties = {
  fontSize: 8,
  lineHeight: 1,
  marginTop: 2,
  color: "var(--fg-muted, #aaa)",
  letterSpacing: 0.2,
};

const countBadge: CSSProperties = {
  marginLeft: 6,
  padding: "1px 7px",
  background: "#FFB300",
  color: "#000",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: "var(--font-mono, monospace)",
};
