/* Shared primitive components — ported verbatim from Hydra Calc Design / primitives.jsx */
import type { CSSProperties, ReactNode } from "react";

export const Icon = ({ name, size = 14, style, className }: { name: string; size?: number; style?: CSSProperties; className?: string }) => (
  <svg width={size} height={size} className={className} style={style} aria-hidden="true">
    <use href={`#ic-${name}`} />
  </svg>
);

export const Pill = ({ tone = "default", icon, children }: { tone?: "default" | "ok" | "warn" | "err" | "info"; icon?: string; children: ReactNode }) => (
  <span className={`pill ${tone}`}>
    {icon && <Icon name={icon} size={11} />}
    {!icon && tone !== "default" && <span className="dot"></span>}
    {children}
  </span>
);

export const HMono = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div className="hdr-mono" style={style}>{children}</div>
);

export const NumVal = ({ value, unit, tone, size = 18 }: { value: ReactNode; unit?: string; tone?: "ok" | "warn" | "err" | "default"; size?: number }) => {
  const color =
    tone === "ok" ? "var(--bp-green)" :
    tone === "warn" ? "var(--bp-amber)" :
    tone === "err" ? "var(--bp-red)" :
    "var(--bp-text)";
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums", color }}>
      <span style={{ fontSize: size, fontWeight: 600 }}>{value}</span>
      {unit && <span style={{ fontSize: Math.max(10, size * 0.55), color: "var(--bp-text-3)", fontWeight: 500 }}>{unit}</span>}
    </span>
  );
};

export const BlueprintBg = ({ minor = 16, major = 80, opacity = 1 }: { minor?: number; major?: number; opacity?: number }) => (
  <div aria-hidden="true" style={{
    position: "absolute", inset: 0, opacity,
    backgroundImage: `
      linear-gradient(var(--bp-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--bp-grid) 1px, transparent 1px),
      linear-gradient(var(--bp-grid-strong) 1px, transparent 1px),
      linear-gradient(90deg, var(--bp-grid-strong) 1px, transparent 1px)
    `,
    backgroundSize: `${minor}px ${minor}px, ${minor}px ${minor}px, ${major}px ${major}px, ${major}px ${major}px`,
    pointerEvents: "none",
  }} />
);

interface SegOpt { value: string; label: string; icon?: string }
export const Seg = ({ value, onChange, options, size = "md" }: { value: string; onChange: (v: string) => void; options: SegOpt[]; size?: "sm" | "md" }) => (
  <div style={{
    display: "inline-flex",
    background: "var(--bp-bg)",
    border: "1px solid var(--bp-line)",
    borderRadius: 6,
    padding: 2,
    gap: 2,
  }}>
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        style={{
          height: size === "sm" ? 22 : 26,
          padding: size === "sm" ? "0 8px" : "0 10px",
          border: "none",
          background: value === o.value ? "var(--bp-bg-3)" : "transparent",
          color: value === o.value ? "var(--bp-text)" : "var(--bp-text-3)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          cursor: "pointer",
          borderRadius: 4,
          display: "inline-flex", alignItems: "center", gap: 5,
        }}
      >
        {o.icon && <Icon name={o.icon} size={11} />}
        {o.label}
      </button>
    ))}
  </div>
);

export const PanelCard = ({ title, right, children, padding = 12, style }: { title?: ReactNode; right?: ReactNode; children: ReactNode; padding?: number | string; style?: CSSProperties }) => (
  <div style={{
    background: "var(--bp-bg-2)",
    border: "1px solid var(--bp-line)",
    borderRadius: 8,
    overflow: "hidden",
    ...style,
  }}>
    {(title || right) && (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid var(--bp-line)",
        background: "linear-gradient(180deg, rgba(0,0,0,0.02), transparent)",
      }}>
        <div className="hdr-mono">{title}</div>
        <div>{right}</div>
      </div>
    )}
    <div style={{ padding }}>{children}</div>
  </div>
);

export const TopBar = ({ project = "Hydra Calc", saved = "12s", variant = "Editor", onCalc, onExport, onShare }: { project?: string; saved?: string; variant?: string; onCalc?: () => void; onExport?: () => void; onShare?: () => void }) => (
  <div className="topbar">
    <div className="brand">
      <div className="brand-mark"></div>
      <span>HYDRA<span style={{ color: "var(--bp-blue)" }}>·</span>CALC</span>
      <span className="ver">v0.4.2</span>
    </div>
    <div className="crumbs">
      <span>Төслүүд</span><span className="sep">/</span>
      <span className="cur">{project}</span><span className="sep">/</span>
      <span style={{ color: "var(--bp-blue-2)" }}>{variant}</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16, color: "var(--bp-text-3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--bp-green)", boxShadow: "0 0 6px var(--bp-green)" }}></span>
      Хадгалагдсан · <span style={{ color: "var(--bp-text-2)" }}>{saved} өмнө</span>
    </div>
    <div className="top-actions">
      <button className="btn ghost" onClick={onShare}><Icon name="share" />Хуваалцах</button>
      <button className="btn" onClick={onExport}><Icon name="export" />Экспорт <span className="kbd">⌘E</span></button>
      <button className="btn primary" onClick={onCalc}><Icon name="play" />Тооцоолох <span className="kbd" style={{ color: "#06122488", borderColor: "#06122444" }}>⌘↵</span></button>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: "linear-gradient(135deg, var(--bp-blue), var(--bp-amber))",
        color: "#fff", fontWeight: 700, fontSize: 11,
        display: "grid", placeItems: "center",
        marginLeft: 4,
      }}>TB</div>
    </div>
  </div>
);
