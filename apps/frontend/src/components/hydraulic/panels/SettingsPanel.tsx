import type { CSSProperties, ReactNode } from "react";
import { useHydraulicStore } from "../hydraulicStore";
import { TEMP_SCHEDULES, CLIMATE, NETWORK_TYPES } from "shared";

export function SettingsPanel({ readOnly }: { readOnly?: boolean }) {
  const settings = useHydraulicStore((s) => s.settings);
  const update = useHydraulicStore((s) => s.updateSettings);

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
