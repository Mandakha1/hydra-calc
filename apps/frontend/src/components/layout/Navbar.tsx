import type { CSSProperties } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/Button";

export function Navbar() {
  const { user, logout } = useAuth();

  const linkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
    color: isActive ? "var(--accent)" : "var(--fg-muted)",
    padding: "0.4rem 0.75rem",
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
    borderRadius: "var(--radius-sm)",
  });

  return (
    <header
      style={{
        borderBottom: "1px solid var(--border-soft)",
        background: "rgba(11, 17, 23, 0.85)",
        backdropFilter: "blur(12px)",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        className="container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 58,
        }}
      >
        <Link to="/" style={{ textDecoration: "none", color: "var(--fg)", display: "flex", alignItems: "center", gap: 10 }}>
          <Logo />
          <span style={{ fontWeight: 700, letterSpacing: "-0.01em" }}>Hydra Calc</span>
        </Link>

        <nav style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <NavLink to="/about" style={linkStyle}>Тухай</NavLink>
          <NavLink to="/pricing" style={linkStyle}>Үнэ</NavLink>
          <NavLink to="/docs" style={linkStyle}>Гарын авлага</NavLink>

          <div style={{ width: 1, height: 20, background: "var(--border-soft)", margin: "0 0.75rem" }} />

          {user ? (
            <>
              <NavLink to="/app" style={linkStyle}>Төслүүд</NavLink>
              <Button variant="ghost" size="sm" onClick={logout}>Гарах</Button>
            </>
          ) : (
            <>
              <NavLink to="/login" style={linkStyle}>Нэвтрэх</NavLink>
              <Link to="/register" style={{ marginLeft: 8 }}>
                <Button variant="primary" size="sm">Эхлэх</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy="12" r="2" fill="var(--accent)" />
      <circle cx="20" cy="12" r="2" fill="var(--accent)" />
      <path d="M4 14v4h16v-4" stroke="var(--accent-dim)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
