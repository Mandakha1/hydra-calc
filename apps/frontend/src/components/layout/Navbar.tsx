/**
 * Phase 11.1 — Responsive Navbar.
 *
 * < 768px: hamburger menu (drawer dropdown), only Logo + auth button visible
 * 768-1024px: tight horizontal layout
 * > 1024px: full horizontal layout (legacy behaviour)
 */
import { useState, type CSSProperties } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useViewport } from "../../hooks/useViewport";
import { Button } from "../ui/Button";

export function Navbar() {
  const { user, logout } = useAuth();
  const { isMobile } = useViewport();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const linkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
    color: isActive ? "var(--accent)" : "var(--fg-muted)",
    padding: "0.4rem 0.75rem",
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
    borderRadius: "var(--radius-sm)",
  });

  const mobileLinkStyle = ({ isActive }: { isActive: boolean }): CSSProperties => ({
    ...linkStyle({ isActive }),
    display: "block",
    padding: "0.75rem 1rem",
    fontSize: 16,
    borderBottom: "1px solid var(--border-soft)",
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

        {/* Desktop / tablet nav */}
        {!isMobile && (
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
        )}

        {/* Mobile hamburger */}
        {isMobile && (
          <button
            type="button"
            aria-label="Цэс"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((p) => !p)}
            style={hamburgerStyle}
            data-testid="navbar-hamburger"
          >
            {drawerOpen ? "✕" : "☰"}
          </button>
        )}
      </div>

      {/* Mobile drawer dropdown — slides under the navbar */}
      {isMobile && drawerOpen && (
        <nav
          style={{
            background: "var(--bg, white)",
            borderTop: "1px solid var(--border-soft)",
            borderBottom: "1px solid var(--border-soft)",
          }}
          data-testid="navbar-drawer"
          onClick={() => setDrawerOpen(false)}
        >
          <NavLink to="/about" style={mobileLinkStyle}>Тухай</NavLink>
          <NavLink to="/pricing" style={mobileLinkStyle}>Үнэ</NavLink>
          <NavLink to="/docs" style={mobileLinkStyle}>Гарын авлага</NavLink>
          {user ? (
            <>
              <NavLink to="/app" style={mobileLinkStyle}>Төслүүд</NavLink>
              <button
                type="button"
                onClick={() => { logout(); setDrawerOpen(false); }}
                style={mobileLogoutBtn}
                data-testid="navbar-mobile-logout"
              >
                Гарах
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" style={mobileLinkStyle}>Нэвтрэх</NavLink>
              <NavLink to="/register" style={mobileLinkStyle}>Эхлэх</NavLink>
            </>
          )}
        </nav>
      )}
    </header>
  );
}

const hamburgerStyle: CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 24,
  cursor: "pointer",
  color: "var(--fg, white)",
  padding: "0.4rem 0.75rem",
  lineHeight: 1,
};

const mobileLogoutBtn: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "0.75rem 1rem",
  fontSize: 16,
  color: "var(--danger, #b0392e)",
  background: "none",
  border: "none",
  borderBottom: "1px solid var(--border-soft)",
  cursor: "pointer",
};

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
