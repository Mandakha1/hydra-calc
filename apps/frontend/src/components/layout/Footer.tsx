import { STANDARDS, APP_NAME } from "shared";
import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border-soft)",
        marginTop: "4rem",
        padding: "2.5rem 0 3rem",
        background: "var(--bg-soft)",
      }}
    >
      <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "2rem" }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: "0.6rem" }}>{APP_NAME}</div>
          <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>
            Монгол дулаан хангамжийн сүлжээний инженерүүдэд зориулсан нээлттэй тооцоолуур.
          </p>
        </div>
        <div>
          <h4 style={{ fontSize: 13, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Бүтээгдэхүүн</h4>
          <FooterLinks
            items={[
              { to: "/about", label: "Тухай" },
              { to: "/pricing", label: "Үнэ" },
              { to: "/docs", label: "Гарын авлага" },
            ]}
          />
        </div>
        <div>
          <h4 style={{ fontSize: 13, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Стандартууд</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {Object.values(STANDARDS).map((s) => (
              <li key={s} style={{ fontSize: 13, color: "var(--fg-dim)", fontFamily: "var(--font-mono)", padding: "0.25rem 0" }}>
                {s}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 style={{ fontSize: 13, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Холбоо</h4>
          <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>
            Санал хүсэлт: <a href="mailto:hello@example.com">hello@example.com</a>
          </p>
        </div>
      </div>
      <div
        className="container"
        style={{
          marginTop: "2.5rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--border-soft)",
          fontSize: 12,
          color: "var(--fg-dim)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <span>© {new Date().getFullYear()} Hydra Calc — Бүх эрх хуулиар хамгаалагдсан.</span>
        <span className="mono">Made in Mongolia · v0.1.0</span>
      </div>
    </footer>
  );
}

function FooterLinks({ items }: { items: { to: string; label: string }[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((it) => (
        <li key={it.to} style={{ padding: "0.25rem 0" }}>
          <Link to={it.to} style={{ fontSize: 13, color: "var(--fg-muted)" }}>
            {it.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
