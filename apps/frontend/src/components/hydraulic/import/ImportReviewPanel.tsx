/**
 * Phase 7.4 — Engineer review pane on DXF import.
 *
 * Sits between the parser (lib/dxfImport.ts) and the commit step
 * (saveProject → /app/:id navigate). Engineer reviews the auto-
 * detected block→NodeKind mappings + CAD-layer→PipeCircuit
 * mappings BEFORE the import is committed. Overrides feed back
 * into a re-run of the importer so the engineer sees a live
 * preview count change as they tweak.
 *
 * Architectural conventions:
 *   - One-shot UI: rendered after parse, dismissed on Confirm/Cancel.
 *   - Re-parse on override change: the engineer's overrides feed
 *     into a second `importDxfJson` call (cheap on the already-
 *     extracted JSON; expensive original DXF text parse is NOT
 *     re-run). Live-preview count updates from the re-parse.
 *   - Confirm flow: engineer's overrides become permanent for this
 *     import only — they don't persist to settings. Phase 9+ could
 *     add a "save these as project default" toggle.
 *   - Single undo snapshot: caller `saveProject` is responsible for
 *     pre-pending an empty-state UndoSnapshot to the saved project
 *     state so engineer can Ctrl+Z in the editor to "undo the
 *     import" entirely.
 *
 * Reuses Phase 6.8.5 NODE_KINDS + Phase 7.3 PIPE_CIRCUITS as the
 * dropdown source — no duplicate enums.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { NODE_KINDS, CATEGORIES, PIPE_CIRCUITS, type NodeCategory, type PipeCircuit } from "../nodeCatalog";
import { circuitLabelShort } from "../../../lib/dxfLayerMapper";
import type { DxfImportResult, ExtractedDxf } from "../../../lib/dxfImport";

export interface ImportOverrides {
  /** Block name (case-sensitive) → NodeKind. Wins over the
   *  auto-classifier's Cyrillic + Latin tiers. */
  blockAliases: Record<string, string>;
  /** CAD layer name (case-sensitive) → PipeCircuit. Wins over the
   *  multi-signal voter. */
  layerCircuits: Record<string, PipeCircuit>;
}

export interface ImportReviewPanelProps {
  /**
   * The initial parse result (engineer hasn't applied any overrides
   * yet — these are the auto-detected mappings). Used to render the
   * tables of detected blocks / layers.
   */
  parseResult: DxfImportResult;
  /**
   * The pre-extracted JSON used to re-run the importer when the
   * engineer applies overrides. The importer reuses this; we don't
   * re-parse the raw DXF text.
   */
  extracted?: ExtractedDxf;
  /** Called when engineer hits "Confirm" — receives overrides +
   *  the live-preview result (so the caller doesn't have to re-run). */
  onConfirm: (overrides: ImportOverrides, livePreview: DxfImportResult) => void;
  /** Called when engineer hits "Cancel" — no state changes. */
  onCancel: () => void;
  /**
   * Optional `recompute` function — the caller (ImportDxf.tsx)
   * supplies this so we don't have to re-import the ExtractedDxf
   * from scratch on every override change. Returns a DxfImportResult
   * representing the engineer's edits applied to the original parse.
   */
  recompute?: (overrides: ImportOverrides) => DxfImportResult;
}

export function ImportReviewPanel(props: ImportReviewPanelProps) {
  const { parseResult, onConfirm, onCancel, recompute } = props;

  const [blockAliases, setBlockAliases] = useState<Record<string, string>>({});
  const [layerCircuits, setLayerCircuits] = useState<Record<string, PipeCircuit>>({});

  // Live-preview recompute. When `recompute` isn't supplied (e.g.
  // unit tests), we fall back to the original parseResult stats.
  const livePreview = useMemo<DxfImportResult>(() => {
    if (recompute) return recompute({ blockAliases, layerCircuits });
    return parseResult;
  }, [recompute, blockAliases, layerCircuits, parseResult]);

  const distinctBlocks = parseResult.distinctBlocks ?? [];
  const distinctLayers = parseResult.distinctLayers ?? [];

  function setBlock(blockName: string, kind: string) {
    setBlockAliases((prev) => ({ ...prev, [blockName]: kind }));
  }
  function setLayer(layerName: string, circuit: PipeCircuit) {
    setLayerCircuits((prev) => ({ ...prev, [layerName]: circuit }));
  }
  function clearOverrides() {
    setBlockAliases({});
    setLayerCircuits({});
  }

  return (
    <div style={containerStyle} data-testid="import-review-panel">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🔍 Импортын review</h3>
        <p style={{ fontSize: 12, color: "var(--bp-text-3, #666)", margin: "0.25rem 0 0" }}>
          Зөв тааруулагдсан эсэхийг шалгаад {"“Импортыг батлах”"} дарна уу. Ctrl+Z дарж сэргээх боломжтой.
        </p>
      </header>

      {/* ─── Live preview stats ─────────────────────────── */}
      <section style={statsGrid} data-testid="review-stats">
        <Stat label="Зангилаа" value={livePreview.state.nodes.length} />
        <Stat label="Хоолой" value={livePreview.state.pipes.length} />
        <Stat label="Эх үүсвэр" value={livePreview.stats.sources} />
        <Stat label="Хэрэглэгч" value={livePreview.stats.consumers} />
        <Stat label="Камер" value={livePreview.stats.chambers} />
        <Stat label="⚠ Анхааруулга" value={livePreview.warnings.length} />
      </section>

      {/* ─── Block alias review ─────────────────────────── */}
      {distinctBlocks.length > 0 && (
        <section style={sectionStyle} data-testid="review-blocks">
          <h4 style={sectionTitleStyle}>Блок-зангилаа давтаргалт</h4>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>CAD блок нэр</th>
                <th style={thStyle}>Тоо</th>
                <th style={thStyle}>Автоматаар</th>
                <th style={thStyle}>Engineer override</th>
              </tr>
            </thead>
            <tbody>
              {distinctBlocks.map((b) => (
                <tr key={b.block}>
                  <td style={tdStyle}><code style={{ fontSize: 11 }}>{b.block}</code></td>
                  <td style={tdNumStyle}>{b.nodeCount}</td>
                  <td style={tdStyle}>{b.autoKind}</td>
                  <td style={tdStyle}>
                    <NodeKindSelect
                      value={blockAliases[b.block] ?? b.autoKind}
                      onChange={(k) => setBlock(b.block, k)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* ─── Layer circuit review ───────────────────────── */}
      {distinctLayers.length > 0 && (
        <section style={sectionStyle} data-testid="review-layers">
          <h4 style={sectionTitleStyle}>Давхарга харгалзуулалт (хоолойн чиглэл)</h4>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>CAD layer</th>
                <th style={thStyle}>Тоо</th>
                <th style={thStyle}>Автоматаар</th>
                <th style={thStyle}>Hydra layer</th>
                <th style={thStyle}>Engineer override</th>
              </tr>
            </thead>
            <tbody>
              {distinctLayers.map((l) => (
                <tr key={l.layer} style={l.hadConflict ? { background: "var(--bp-amber-soft, #fff5e6)" } : undefined}>
                  <td style={tdStyle}>
                    <code style={{ fontSize: 11 }}>{l.layer}</code>
                    {l.hadConflict && <span title="Multi-signal зөрчилтэй" style={{ marginLeft: 6, color: "var(--bp-amber, #cc6600)" }}>⚠</span>}
                  </td>
                  <td style={tdNumStyle}>{l.pipeCount}</td>
                  <td style={tdStyle}>{circuitLabelShort(l.autoCircuit as PipeCircuit)}</td>
                  <td style={tdStyle}><code style={{ fontSize: 11, color: "var(--bp-text-3, #666)" }}>{l.autoLayerKey}</code></td>
                  <td style={tdStyle}>
                    <CircuitSelect
                      value={(layerCircuits[l.layer] ?? l.autoCircuit) as PipeCircuit}
                      onChange={(c) => setLayer(l.layer, c)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {distinctBlocks.length === 0 && distinctLayers.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--bp-text-3, #666)" }}>
          Импортод override-той зүйл олдсонгүй.
        </p>
      )}

      {/* ─── Action buttons ─────────────────────────────── */}
      <div style={actionRow}>
        <button
          type="button"
          onClick={() => onConfirm({ blockAliases, layerCircuits }, livePreview)}
          style={primaryBtn}
          data-testid="review-confirm"
        >
          ✓ Импортыг батлах ({livePreview.state.nodes.length} зангилаа, {livePreview.state.pipes.length} хоолой)
        </button>
        <button type="button" onClick={clearOverrides} style={secondaryBtn} data-testid="review-clear">
          🔄 Override-уудыг цэвэрлэх
        </button>
        <button type="button" onClick={onCancel} style={secondaryBtn} data-testid="review-cancel">
          ✗ Цуцлах
        </button>
      </div>
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────── */

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={statBoxStyle}>
      <span style={{ fontSize: 10, color: "var(--bp-text-3, #666)" }}>{label}</span>
      <span style={{ fontSize: 16, fontFamily: "var(--font-mono)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/**
 * Dropdown listing every NodeKind, grouped by NodeCategory. The
 * label/Cyrillic name is what the engineer sees; the value is the
 * kind string that the importer + store expects.
 */
function NodeKindSelect({ value, onChange }: { value: string; onChange: (kind: string) => void }) {
  // Group kinds by category.
  const byCategory = useMemo(() => {
    const map = new Map<NodeCategory, typeof NODE_KINDS>();
    for (const kd of NODE_KINDS) {
      const arr = map.get(kd.category) ?? [];
      arr.push(kd);
      map.set(kd.category, arr);
    }
    return map;
  }, []);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid="review-kind-select"
      style={selectStyle}
    >
      {CATEGORIES.map((cat) => {
        const kinds = byCategory.get(cat.key) ?? [];
        if (kinds.length === 0) return null;
        return (
          <optgroup key={cat.key} label={cat.label}>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

function CircuitSelect({ value, onChange }: { value: PipeCircuit; onChange: (c: PipeCircuit) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PipeCircuit)}
      data-testid="review-circuit-select"
      style={selectStyle}
    >
      {PIPE_CIRCUITS.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  padding: 16,
  background: "var(--bp-bg, #fff)",
  border: "1px solid var(--bp-line-2, #ddd)",
  borderRadius: 10,
};
const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
  marginBottom: 14,
};
const statBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "6px 10px",
  background: "var(--bp-bg-elev, #f7f7f8)",
  border: "1px solid var(--bp-line, #eee)",
  borderRadius: 6,
};
const sectionStyle: CSSProperties = { marginBottom: 14 };
const sectionTitleStyle: CSSProperties = {
  margin: "0 0 6px",
  fontSize: 13,
  color: "var(--bp-text-2, #333)",
};
const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "5px 7px",
  borderBottom: "1px solid var(--bp-line-2, #ddd)",
  fontWeight: 600,
  color: "var(--bp-text-3, #666)",
};
const tdStyle: CSSProperties = {
  padding: "5px 7px",
  borderBottom: "1px solid var(--bp-line, #eee)",
};
const tdNumStyle: CSSProperties = { ...tdStyle, fontFamily: "var(--font-mono)", textAlign: "right" };
const selectStyle: CSSProperties = {
  width: "100%",
  padding: "3px 4px",
  fontSize: 12,
  fontFamily: "inherit",
};
const actionRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 16,
};
const primaryBtn: CSSProperties = {
  padding: "8px 14px",
  background: "var(--bp-blue, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const secondaryBtn: CSSProperties = {
  padding: "8px 14px",
  background: "var(--bp-bg-elev, #f0f0f0)",
  border: "1px solid var(--bp-line-2, #ddd)",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};
