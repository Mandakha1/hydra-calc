/* Landing page — ported from Hydra Calc Design / landing.jsx (Atelier blueprint hero) */
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, BlueprintBg } from "../design/primitives";

export function Home() {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        overflow: "auto",
        background: "var(--bp-bg)",
        color: "var(--bp-text)",
        fontFamily: "var(--font-sans)",
        position: "relative",
      }}
    >
      <BlueprintBg minor={20} major={120} />

      {/* Nav */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "16px 48px",
          backdropFilter: "blur(12px)",
          background: "rgba(239, 231, 210, 0.78)",
          borderBottom: "1px solid var(--bp-line)",
        }}
      >
        <div className="brand" style={{ fontSize: 14 }}>
          <div className="brand-mark"></div>
          <span>HYDRA<span style={{ color: "var(--bp-blue)" }}>·</span>CALC</span>
        </div>
        <nav style={{ display: "flex", gap: 24, fontSize: 13, color: "var(--bp-text-2)" }}>
          <a style={navLink}>Бүтээгдэхүүн</a>
          <a style={navLink}>Стандарт</a>
          <Link to="/pricing" style={navLink}>Үнэ</Link>
          <Link to="/docs" style={navLink}>Баримт</Link>
          <Link to="/about" style={navLink}>Тухай</Link>
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <Link to="/login"><button className="btn ghost">Нэвтрэх</button></Link>
          <Link to="/register"><button className="btn primary">Үнэгүй туршаад үзэх <span style={{ fontSize: 11, opacity: 0.7 }}>→</span></button></Link>
        </div>
      </header>

      {/* HERO */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          padding: "72px 48px 48px",
          gap: 48,
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* animated color blobs */}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "-10%", right: "30%", width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(176,57,46,0.18), transparent 70%)", filter: "blur(20px)", animation: "blob1 14s ease-in-out infinite" }} />
          <div style={{ position: "absolute", bottom: "-15%", right: "-8%", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(31,95,170,0.18), transparent 70%)", filter: "blur(20px)", animation: "blob2 18s ease-in-out infinite" }} />
          <div style={{ position: "absolute", top: "40%", left: "-5%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(closest-side, rgba(183,134,26,0.16), transparent 70%)", filter: "blur(20px)", animation: "blob3 22s ease-in-out infinite" }} />
        </div>

        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--bp-line-2)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--bp-text-2)",
              marginBottom: 24,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bp-green)", boxShadow: "0 0 8px var(--bp-green)" }} />
            МНС 4217 · БНбД 41-01-2019 · СП 124.13330
          </div>
          <h1
            style={{
              fontSize: 72,
              lineHeight: 0.95,
              fontWeight: 700,
              fontFamily: "var(--font-sans)",
              margin: 0,
              letterSpacing: "-0.03em",
              color: "var(--bp-text)",
            }}
          >
            Дулааны<br />сүлжээгээ<br />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--bp-supply)",
                position: "relative",
                display: "inline-block",
              }}
            >
              5 минутад
              <svg width="100%" height="14" viewBox="0 0 220 14" preserveAspectRatio="none" style={{ position: "absolute", left: 0, bottom: -4, width: "100%" }}>
                <path d="M 4 9 Q 60 2 120 7 T 216 6" fill="none" stroke="var(--bp-supply)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
              </svg>
            </span><br />
            тооцоолоорой.
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--bp-text-2)", maxWidth: 480, marginTop: 24 }}>
            Excel-ээ хая. Drag-and-drop канвас, Colebrook-White итераци, авто
            насос сонголт, AutoCAD DXF экспорт — бүгд нэг газраас. Монгол
            инженерүүдэд зориулж бүтээсэн.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
            <Link to="/register">
              <button className="btn primary" style={{ height: 44, padding: "0 22px", fontSize: 14 }}>
                14 хоног үнэгүй <span style={{ marginLeft: 6 }}>→</span>
              </button>
            </Link>
            <Link to="/docs">
              <button className="btn" style={{ height: 44, padding: "0 22px", fontSize: 14 }}>
                <Icon name="play" size={12} />3 минутын танилцуулга
              </button>
            </Link>
          </div>
          <div style={{ display: "flex", gap: 32, marginTop: 40, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bp-text-3)" }}>
            <Stat n="6 загвар" l="УБ-н бодит сүлжээний жишээ" />
            <Stat n="15 ИТП схем" l="СП 41-101 дагуу бэлэн" />
            <Stat n="3 стандарт" l="МНС 4217 · БНбД · СП 124" />
          </div>
        </div>

        {/* Hero visual — editor mockup */}
        <div style={{ position: "relative", height: 560, zIndex: 1 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              border: "1px solid var(--bp-line-2)",
              borderRadius: 14,
              background: "var(--bp-bg-2)",
              boxShadow: "0 40px 80px -20px rgba(26,34,51,0.25), 0 8px 20px -8px rgba(176,57,46,0.15), 0 0 0 1px rgba(26,34,51,0.05)",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ height: 32, background: "var(--bp-bg-3)", borderBottom: "1px solid var(--bp-line)", display: "flex", alignItems: "center", padding: "0 12px", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#EF4444" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F5C842" }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ADE80" }} />
              <div style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bp-text-3)" }}>tsede.mn/app/Хороолол-7</div>
            </div>
            <div style={{ flex: 1, position: "relative" }}>
              <SchemaMockup />
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: -20,
              left: -30,
              zIndex: 2,
              background: "var(--bp-bg-2)",
              border: "1px solid var(--bp-text)",
              borderRadius: 12,
              padding: "14px 18px",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              boxShadow: "0 20px 40px -10px rgba(26,34,51,0.25)",
              minWidth: 240,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--bp-text-3)", letterSpacing: "0.12em", marginBottom: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--bp-green)", animation: "pulse 2s ease-in-out infinite" }} />
              BENCHMARK · LIVE
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 600, color: "var(--bp-text)", fontFamily: "var(--font-display)", fontStyle: "italic" }}>1.2s</div>
                <div style={{ fontSize: 10, color: "var(--bp-text-3)" }}>50 сегментийн тооцоо</div>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--bp-green)", padding: "3px 8px", border: "1px solid var(--bp-green)", borderRadius: 4, background: "var(--bp-green-soft)" }}>
                40× илүү хурдан
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES bento */}
      <section style={{ padding: "72px 48px" }}>
        <div className="hdr-mono" style={{ marginBottom: 8 }}>// 01 — Бүтээгдэхүүн</div>
        <h2 style={h2}>
          Инженерийн график бус,<br />
          <span style={{ color: "var(--bp-text-3)" }}>инженерийн</span> хэрэгсэл.
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "240px 240px", gap: 14, marginTop: 40 }}>
          <Bento title="SVG канвас + drag-and-drop" tag="01" highlight style={{ gridRow: "1 / 3" }}>
            <p style={bentoDesc}>Pan, zoom, keyboard shortcut. Сүлжээгээ зураач шиг бүтээ — гэхдээ инженерийн нарийвчлалтай.</p>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", marginTop: 16, position: "relative", overflow: "hidden", borderRadius: 6, border: "1px solid var(--bp-line)" }}>
              <SchemaMockup />
            </div>
          </Bento>
          <Bento title="Colebrook–White" tag="02">
            <p style={bentoDesc}>50-итерацт, 1e-8 нарийвчлалаар.</p>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, color: "var(--bp-blue-2)", background: "var(--bp-bg)", padding: "12px 14px", borderRadius: 6, border: "1px solid var(--bp-line)", marginTop: "auto" }}>
              1/√λ = −2 log₁₀(...)
            </div>
          </Bento>
          <Bento title="14 төрлийн хана + 20 аймаг" tag="03">
            <p style={bentoDesc}>Дулаан ачааллыг гар аргаар тооцох цаг өнгөрсөн.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginTop: "auto" }}>
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} style={{ aspectRatio: "1", borderRadius: 2, background: i === 7 ? "var(--bp-blue)" : "var(--bp-line)" }} />
              ))}
            </div>
          </Bento>
          <Bento title="Excel + DXF экспорт" tag="04">
            <p style={bentoDesc}>6 sheet · 3 слой · AutoCAD R14 нийцтэй.</p>
            <div style={{ display: "flex", gap: 6, marginTop: "auto", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              <span style={chip}>.xlsx</span>
              <span style={chip}>.dxf</span>
              <span style={chip}>.pdf</span>
            </div>
          </Bento>
          <Bento title="Авто норм шалгалт" tag="05">
            <p style={bentoDesc}>v ≤ 3.5 m/s · R ≤ 80 Pa/m · Δp ≥ 0.15 MPa</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10 }}>
                <span style={{ ...chipDot, background: "var(--bp-green)" }} />v ≤ 3.5 m/s · OK
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10 }}>
                <span style={{ ...chipDot, background: "var(--bp-amber)" }} />R = 78 Pa/m · хязгаарт
              </div>
            </div>
          </Bento>
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: "32px 48px 72px", borderTop: "1px solid var(--bp-line)" }}>
        <div className="hdr-mono" style={{ marginBottom: 8 }}>// 02 — Үнийн санал</div>
        <h2 style={h2}>Инженер бүрд хүртээмжтэй.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 40 }}>
          <Plan name="Үнэгүй" price="₮0" period="/14 хоног" features={["1 идэвхтэй төсөл", "10 сегмент хүртэл", "Excel экспорт"]} />
          <Plan name="Inженер" price="₮89,000" period="/сар" features={["Хязгааргүй төсөл", "Бүх стандарт", "DXF экспорт", "Share link"]} highlight />
          <Plan name="Студи" price="Үнэ тохиролцоно" period="" features={["Багийн хамтын ажиллагаа", "SSO + audit log", "On-prem боломж", "Тусгай дэмжлэг"]} />
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--bp-line)", padding: "28px 48px", display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--bp-text-3)" }}>
        <div>© 2026 Tsede · Улаанбаатар хот, Монгол Улс</div>
        <div style={{ display: "flex", gap: 16 }}>
          <a style={navLink}>Нууцлал</a>
          <a style={navLink}>Гэрээ</a>
          <a style={navLink}>support@tsede.mn</a>
        </div>
      </footer>
    </div>
  );
}

const navLink: CSSProperties = { color: "var(--bp-text-2)", textDecoration: "none", cursor: "pointer", fontSize: 13 };
const h2: CSSProperties = { fontSize: 44, fontWeight: 700, fontFamily: "var(--font-sans)", margin: 0, letterSpacing: "-0.02em", lineHeight: 1.05, color: "var(--bp-text)" };
const bentoDesc: CSSProperties = { fontSize: 13, color: "var(--bp-text-2)", lineHeight: 1.5, margin: "8px 0 0" };
const chip: CSSProperties = { padding: "3px 8px", border: "1px solid var(--bp-line-2)", borderRadius: 3, color: "var(--bp-text-2)" };
const chipDot: CSSProperties = { width: 6, height: 6, borderRadius: "50%" };

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "var(--bp-text)", letterSpacing: "-0.01em" }}>{n}</div>
      <div style={{ color: "var(--bp-text-3)" }}>{l}</div>
    </div>
  );
}

function Bento({ title, tag, children, highlight, style }: { title: string; tag: string; children: ReactNode; highlight?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: highlight ? "var(--bp-bg-3)" : "var(--bp-bg-2)",
        border: `1px solid ${highlight ? "var(--bp-blue)" : "var(--bp-line)"}`,
        borderRadius: 10,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--bp-text)" }}>{title}</div>
        <div className="hdr-mono" style={{ color: highlight ? "var(--bp-blue-2)" : "var(--bp-text-faint)" }}>{tag}</div>
      </div>
      {children}
    </div>
  );
}

function Plan({ name, price, period, features, highlight }: { name: string; price: string; period: string; features: string[]; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? "var(--bp-bg-3)" : "var(--bp-bg-2)",
        border: `1px solid ${highlight ? "var(--bp-blue)" : "var(--bp-line)"}`,
        borderRadius: 12,
        padding: 24,
        position: "relative",
      }}
    >
      {highlight && (
        <div style={{ position: "absolute", top: -10, right: 16, padding: "3px 10px", borderRadius: 999, background: "var(--bp-blue)", color: "#061224", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600 }}>
          ХАМГИЙН ТҮГЭЭМЭЛ
        </div>
      )}
      <div className="hdr-mono">{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8, marginBottom: 18 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: "var(--bp-text)", letterSpacing: "-0.02em" }}>{price}</span>
        <span style={{ fontSize: 13, color: "var(--bp-text-3)" }}>{period}</span>
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {features.map((f) => (
          <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--bp-text-2)" }}>
            <Icon name="check" size={12} style={{ color: highlight ? "var(--bp-blue)" : "var(--bp-green)" }} />
            {f}
          </li>
        ))}
      </ul>
      <Link to="/register">
        <button className={highlight ? "btn primary" : "btn"} style={{ width: "100%", marginTop: 22, height: 38, justifyContent: "center" }}>
          Сонгох
        </button>
      </Link>
    </div>
  );
}

/** Inline schema mockup for hero — animated supply/return + nodes. */
function SchemaMockup() {
  return (
    <svg viewBox="0 0 600 360" style={{ width: "100%", height: "100%", display: "block" }}>
      {/* Grid */}
      <defs>
        <pattern id="hgrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--bp-grid)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="600" height="360" fill="url(#hgrid)" />

      {/* Supply pipe (red) */}
      <path d="M 60 110 L 240 110 L 240 60 L 460 60" stroke="var(--bp-supply)" strokeWidth="3" fill="none" />
      <path d="M 60 110 L 240 110 L 240 60 L 460 60" stroke="var(--bp-supply)" strokeWidth="6" fill="none" opacity="0.35" className="flow-s" />
      <path d="M 240 110 L 240 200 L 460 200" stroke="var(--bp-supply)" strokeWidth="2.5" fill="none" />
      <path d="M 240 200 L 240 290 L 460 290" stroke="var(--bp-supply)" strokeWidth="2.5" fill="none" />

      {/* Return pipe (blue) */}
      <path d="M 60 130 L 220 130 L 220 80 L 460 80" stroke="var(--bp-return)" strokeWidth="2.5" fill="none" opacity="0.85" />
      <path d="M 220 130 L 220 220 L 460 220" stroke="var(--bp-return)" strokeWidth="2" fill="none" opacity="0.85" />
      <path d="M 220 220 L 220 310 L 460 310" stroke="var(--bp-return)" strokeWidth="2" fill="none" opacity="0.85" />

      {/* Source */}
      <g transform="translate(60, 120)">
        <rect x="-22" y="-22" width="44" height="44" rx="3" fill="var(--bp-bg-2)" stroke="var(--bp-blue)" strokeWidth="2" />
        <use href="#ic-source" width="22" height="22" x="-11" y="-11" style={{ color: "var(--bp-blue)" }} />
        <text y="38" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--bp-text)" fontWeight="600">ТЭЦ-4</text>
        <text y="50" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--bp-text-3)">130/70°C</text>
      </g>

      {/* Junction */}
      <g transform="translate(240, 120)">
        <circle r="8" fill="var(--bp-bg-2)" stroke="var(--bp-blue-2)" strokeWidth="1.5" />
        <circle r="2.5" fill="var(--bp-blue-2)" />
      </g>

      {/* Consumers */}
      <g transform="translate(490, 60)">
        <rect x="-30" y="-18" width="60" height="36" fill="var(--bp-bg-2)" stroke="var(--bp-green)" strokeWidth="1.5" rx="3" />
        <use href="#ic-house" width="14" height="14" x="-7" y="-14" style={{ color: "var(--bp-green)" }} />
        <text y="2" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--bp-text)" fontWeight="600">ОС-1</text>
        <text y="13" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--bp-text-3)">600 кВт</text>
      </g>
      <g transform="translate(490, 200)">
        <rect x="-30" y="-18" width="60" height="36" fill="var(--bp-bg-2)" stroke="var(--bp-amber)" strokeWidth="1.5" rx="3" />
        <use href="#ic-house" width="14" height="14" x="-7" y="-14" style={{ color: "var(--bp-amber)" }} />
        <text y="2" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--bp-text)" fontWeight="600">Сургууль</text>
        <text y="13" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--bp-amber)">v=3.41 ⚠</text>
      </g>
      <g transform="translate(490, 290)">
        <rect x="-30" y="-18" width="60" height="36" fill="var(--bp-bg-2)" stroke="var(--bp-green)" strokeWidth="1.5" rx="3" />
        <use href="#ic-house" width="14" height="14" x="-7" y="-14" style={{ color: "var(--bp-green)" }} />
        <text y="2" textAnchor="middle" fontSize="9" fontFamily="var(--font-mono)" fill="var(--bp-text)" fontWeight="600">Эмнэлэг</text>
        <text y="13" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="var(--bp-text-3)">480 кВт</text>
      </g>

      {/* Annotations */}
      <g fontFamily="var(--font-mono)" fontSize="9" fill="var(--bp-text-3)">
        <line x1="150" y1="110" x2="150" y2="50" stroke="var(--bp-text-faint)" strokeDasharray="2 2" />
        <text x="155" y="48">DN150 · v=1.84 m/s</text>
        <line x1="370" y1="200" x2="370" y2="160" stroke="var(--bp-text-faint)" strokeDasharray="2 2" />
        <text x="375" y="158" fill="var(--bp-amber)">DN65 · v=3.41 ⚠</text>
      </g>
    </svg>
  );
}
