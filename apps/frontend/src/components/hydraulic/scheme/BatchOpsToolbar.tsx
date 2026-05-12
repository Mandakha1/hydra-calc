/**
 * Phase 6.5 — BatchOpsToolbar.
 *
 * Compact toolbar exposing every Phase 6.5 batch operation as a single
 * click:
 *   ↺ ↻ ↕ ⏥ ⏤ ▦ ⊕
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
  const transformsDisabled = ms.nodeIds.length === 0;
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
          disabled={transformsDisabled}
          onClick={runWithToast(applyRotateCCW, "Эргүүлсэн ↺ 90°")}
        >↺</ToolbarBtn>
        <ToolbarBtn
          title="Цагийн зүүгээр 90° (CW)"
          disabled={transformsDisabled}
          onClick={runWithToast(applyRotateCW, "Эргүүлсэн ↻ 90°")}
        >↻</ToolbarBtn>
        <ToolbarBtn
          title="180° эргүүлэх"
          disabled={transformsDisabled}
          onClick={runWithToast(applyRotate180, "Эргүүлсэн 180°")}
        >⟳</ToolbarBtn>
        <span style={divider} />
        <ToolbarBtn
          title="Хэвтээ тэнхлэгээр тусгах (дээш↕доош)"
          disabled={transformsDisabled}
          onClick={runWithToast(applyMirrorHorizontal, "Хэвтээ тусгасан")}
        >⏥</ToolbarBtn>
        <ToolbarBtn
          title="Босоо тэнхлэгээр тусгах (зүүн↔баруун)"
          disabled={transformsDisabled}
          onClick={runWithToast(applyMirrorVertical, "Босоо тусгасан")}
        >⏤</ToolbarBtn>
        <span style={divider} />
        <ToolbarBtn
          title="Шугаман массив (N×M grid)"
          disabled={arrayDisabled}
          onClick={() => setLinearOpen(true)}
        >▦</ToolbarBtn>
        <ToolbarBtn
          title="Радиал массив (төвийн орчмын N хувилбар)"
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...btnBase,
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
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
  width: 30,
  height: 28,
  padding: 0,
  border: "1px solid var(--bp-line, #444)",
  borderRadius: 4,
  background: "var(--bp-bg, #2a2a2a)",
  color: "var(--fg, #fff)",
  fontSize: 16,
  fontFamily: "var(--font-mono, monospace)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "background 80ms, border-color 80ms",
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
