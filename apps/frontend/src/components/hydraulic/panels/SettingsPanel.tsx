import type { CSSProperties, ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { TEMP_SCHEDULES, CLIMATE, NETWORK_TYPES } from "shared";
import {
  STANDARD_SCALES,
  DEFAULT_SCALE,
  DEFAULT_PAPER_SIZE,
  DEFAULT_PAPER_ORIENTATION,
  fitToPageScale,
} from "../scheme/scales";
import {
  DEFAULT_DRAWING_TITLE,
  DEFAULT_STANDARDS_FOOTER,
  DEFAULT_REVISION,
  DEFAULT_SHEET_NUMBER,
  todayIsoDate,
} from "../scheme/titleBlockMeta";
import type { TitleBlockMeta } from "../hydraulicTypes";
import { bbox } from "../geometry";

export function SettingsPanel({ readOnly }: { readOnly?: boolean }) {
  const settings = useHydraulicStore((s) => s.settings);
  const nodes = useHydraulicStore((s) => s.nodes);
  const update = useHydraulicStore((s) => s.updateSettings);

  /** Phase 6.7.1 — "Fit to page" preset. Compute bbox of all nodes
   *  (the network skeleton), then pick the smallest standard scale
   *  that fits with current paper + orientation. No-op when there
   *  are no nodes (engineer hasn't drawn anything yet). */
  const fitToPage = () => {
    if (nodes.length === 0) return;
    const b = bbox(nodes);
    const paperSize = settings.printPaperSize ?? DEFAULT_PAPER_SIZE;
    const orientation = settings.printOrientation ?? DEFAULT_PAPER_ORIENTATION;
    const next = fitToPageScale(
      { width: b.width, height: b.height },
      paperSize,
      orientation,
    );
    update({ printScale: next });
  };

  /** Phase 6.7.2 — small helper to merge-and-persist a title-block
   *  field. Reads the current titleBlock object (or {}), spreads the
   *  patch, writes back. Keeps the field-set sparse so unset fields
   *  remain `undefined` and the renderer's default-applier fires. */
  const tb = settings.titleBlock ?? {};
  const updateTitleBlock = (patch: Partial<TitleBlockMeta>) => {
    update({ titleBlock: { ...tb, ...patch } });
  };
  const setDateToday = () => updateTitleBlock({ date: todayIsoDate() });

  return (
    <div style={{ padding: "1.5rem", maxWidth: 640, margin: "0 auto" }}>
      <h2>Төслийн тохиргоо</h2>

      <Field label="Хот (уур амьсгалын зориулсан)">
        <select
          value={settings.city}
          disabled={readOnly}
          onChange={(e) => update({ city: e.target.value })}
          style={inputStyle}
        >
          {CLIMATE.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} (Т_н.р = {c.tnr_c}°C, {c.heating_days} өдөр)
            </option>
          ))}
        </select>
      </Field>

      <Field label="Температурын график">
        <select
          value={settings.temperatureScheduleKey}
          disabled={readOnly}
          onChange={(e) => update({ temperatureScheduleKey: e.target.value })}
          style={inputStyle}
        >
          {TEMP_SCHEDULES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.supply_c}/{t.return_c} °C — {t.description}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Сүлжээний төрөл">
        <select
          value={settings.networkType}
          disabled={readOnly}
          onChange={(e) => update({ networkType: e.target.value as typeof settings.networkType })}
          style={inputStyle}
        >
          {NETWORK_TYPES.map((n) => (
            <option key={n.key} value={n.key}>{n.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Материалын категори (сортамент)">
        <select
          value={settings.primaryMaterialCategory}
          disabled={readOnly}
          onChange={(e) => update({ primaryMaterialCategory: e.target.value as typeof settings.primaryMaterialCategory })}
          style={inputStyle}
        >
          <option value="steel">Ган (ГОСТ 10704)</option>
          <option value="ppr">PPR (ГОСТ 32415)</option>
          <option value="pehd">PE-HD (ГОСТ 18599)</option>
        </select>
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Источникийн даралт (MPa)">
          <input
            type="number"
            step="0.01"
            value={settings.sourcePressure_mpa}
            disabled={readOnly}
            onChange={(e) => update({ sourcePressure_mpa: Number(e.target.value) })}
            style={inputStyle}
          />
        </Field>
        <Field label="Дотоод алдагдлын хувь">
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={settings.localLossesFraction}
            disabled={readOnly}
            onChange={(e) => update({ localLossesFraction: Number(e.target.value) })}
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Phase 6.7.1 — Print + Scale section. Engineer chooses paper
          size + orientation + drafting scale here; "Fit to page"
          auto-picks the smallest valid scale for the current bbox. */}
      <hr style={{ margin: "1.5rem 0", border: 0, borderTop: "1px solid var(--border-soft)" }} />
      <h3 style={{ marginTop: "1rem", marginBottom: "0.6rem", fontSize: 15 }}>Хэвлэх</h3>
      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Хэмжээ (Scale)">
          <select
            value={settings.printScale ?? DEFAULT_SCALE}
            disabled={readOnly}
            onChange={(e) => update({ printScale: e.target.value as typeof STANDARD_SCALES[number] })}
            style={inputStyle}
          >
            {STANDARD_SCALES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Цаасны хэмжээ">
          <select
            value={settings.printPaperSize ?? DEFAULT_PAPER_SIZE}
            disabled={readOnly}
            onChange={(e) => update({ printPaperSize: e.target.value as "A3" | "A4" })}
            style={inputStyle}
          >
            <option value="A3">A3</option>
            <option value="A4">A4</option>
          </select>
        </Field>
        <Field label="Чиглэл">
          <select
            value={settings.printOrientation ?? DEFAULT_PAPER_ORIENTATION}
            disabled={readOnly}
            onChange={(e) => update({ printOrientation: e.target.value as "portrait" | "landscape" })}
            style={inputStyle}
          >
            <option value="landscape">Хэвтээ</option>
            <option value="portrait">Босоо</option>
          </select>
        </Field>
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={fitToPage}
          disabled={nodes.length === 0}
          title={nodes.length === 0 ? "Эхлээд node нэмнэ үү" : "Зурагт тохирох хэмжээг автоматаар сонгох"}
          style={{
            ...inputStyle,
            cursor: nodes.length === 0 ? "not-allowed" : "pointer",
            opacity: nodes.length === 0 ? 0.5 : 1,
            marginTop: 4,
            width: "auto",
          }}
        >
          📐 Хуудас руу багтаах
        </button>
      )}

      {/* Phase 6.7.2 — Title block (Зургийн тамга) metadata.
          Engineer fills these once per project; they appear on the
          canvas preview and on the printed PDF. All optional —
          unset rows render blank so signature boxes stay in place. */}
      <hr style={{ margin: "1.5rem 0", border: 0, borderTop: "1px solid var(--border-soft)" }} />
      <h3 style={{ marginTop: "1rem", marginBottom: "0.6rem", fontSize: 15 }}>Зургийн тамга</h3>

      <Field label="Зургийн нэр">
        <input
          type="text"
          value={tb.drawingTitle ?? ""}
          placeholder={DEFAULT_DRAWING_TITLE}
          disabled={readOnly}
          onChange={(e) => updateTitleBlock({ drawingTitle: e.target.value })}
          style={inputStyle}
        />
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Төслийн код">
          <input
            type="text"
            value={tb.projectCode ?? ""}
            placeholder="TS-2026-..."
            disabled={readOnly}
            onChange={(e) => updateTitleBlock({ projectCode: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Огноо">
          <div style={{ display: "flex", gap: 6 }}>
            <input
              type="date"
              value={tb.date ?? ""}
              disabled={readOnly}
              onChange={(e) => updateTitleBlock({ date: e.target.value })}
              style={inputStyle}
            />
            {!readOnly && (
              <button
                type="button"
                onClick={setDateToday}
                title="Өнөөдрийн огноог автоматаар оруулах"
                style={{ ...inputStyle, cursor: "pointer", width: "auto" }}
              >
                Өнөөдөр
              </button>
            )}
          </div>
        </Field>
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Зурсан">
          <input
            type="text"
            value={tb.engineer ?? ""}
            disabled={readOnly}
            onChange={(e) => updateTitleBlock({ engineer: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Шалгасан">
          <input
            type="text"
            value={tb.checker ?? ""}
            disabled={readOnly}
            onChange={(e) => updateTitleBlock({ checker: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Бат. зөвш.">
          <input
            type="text"
            value={tb.approver ?? ""}
            disabled={readOnly}
            onChange={(e) => updateTitleBlock({ approver: e.target.value })}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Фирм">
        <input
          type="text"
          value={tb.company ?? ""}
          disabled={readOnly}
          onChange={(e) => updateTitleBlock({ company: e.target.value })}
          style={inputStyle}
        />
      </Field>

      <Field label="Хаяг">
        <textarea
          rows={2}
          value={tb.address ?? ""}
          disabled={readOnly}
          onChange={(e) => updateTitleBlock({ address: e.target.value })}
          style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </Field>

      <div style={{ display: "flex", gap: 12 }}>
        <Field label="Сэргээлт">
          <input
            type="text"
            value={tb.revision ?? ""}
            placeholder={DEFAULT_REVISION}
            disabled={readOnly}
            onChange={(e) => updateTitleBlock({ revision: e.target.value })}
            style={inputStyle}
          />
        </Field>
        <Field label="Хуудас">
          <input
            type="text"
            value={tb.sheetNumber ?? ""}
            placeholder={DEFAULT_SHEET_NUMBER}
            disabled={readOnly}
            onChange={(e) => updateTitleBlock({ sheetNumber: e.target.value })}
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Стандарт (footer)">
        <input
          type="text"
          value={tb.standardsFooter ?? ""}
          placeholder={DEFAULT_STANDARDS_FOOTER}
          disabled={readOnly}
          onChange={(e) => updateTitleBlock({ standardsFooter: e.target.value })}
          style={inputStyle}
        />
      </Field>

      <hr style={{ margin: "1.5rem 0", border: 0, borderTop: "1px solid var(--border-soft)" }} />
      <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>
        Стандартууд: БНбД 41-01-2019, БНбД 23-02-09, СП 124.13330.2012, ГОСТ 10704-91, 32415-2013, 18599-2001.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <div style={{ fontSize: 13, color: "var(--fg-muted)", marginBottom: 5, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.65rem",
  fontSize: 14,
  background: "var(--bg)",
  color: "var(--fg)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
};
