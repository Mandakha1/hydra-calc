/**
 * Phase 10.3 — Share dialog.
 *
 * Replaces the Phase 6.x one-shot alert flow. Engineer opens this
 * modal, picks an expiry, clicks "Create" → token + URL appear in
 * the list with copy + revoke actions. Multiple active tokens
 * supported (engineer may have one for the checker and another
 * for the approver).
 *
 * The /shared/:token route already exists (Phase 6.8.4 + Phase 10.3
 * backend extensions). This component only handles the management UI.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { api, HttpError } from "../../../lib/api";

interface ShareRow {
  id: string;
  token: string;
  canEdit: boolean;
  expiresAt: string | null;
  createdAt: string;
  active: boolean;
}

interface Props {
  projectId: string;
  onClose: () => void;
}

type ExpiryChoice = "1h" | "1d" | "1w" | "1mo" | "never";

const EXPIRY_OPTIONS: Array<{ key: ExpiryChoice; label: string; seconds: number | null }> = [
  { key: "1h", label: "1 цаг", seconds: 60 * 60 },
  { key: "1d", label: "1 өдөр", seconds: 24 * 60 * 60 },
  { key: "1w", label: "1 долоо хоног", seconds: 7 * 24 * 60 * 60 },
  { key: "1mo", label: "1 сар", seconds: 30 * 24 * 60 * 60 },
  { key: "never", label: "Хязгааргүй", seconds: null },
];

export function ShareDialog({ projectId, onClose }: Props) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<ExpiryChoice>("1w");
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ shares: ShareRow[] }>(`/projects/${projectId}/shares`);
      setShares(res.shares);
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Жагсаалт татаж чадсангүй");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function createShare() {
    setCreating(true);
    setErr(null);
    setJustCreatedToken(null);
    try {
      const opt = EXPIRY_OPTIONS.find((o) => o.key === expiry)!;
      const body: { canEdit: false; expiresInSeconds?: number } = { canEdit: false };
      if (opt.seconds !== null) body.expiresInSeconds = opt.seconds;
      const res = await api.post<{ token: string; url: string }>(`/projects/${projectId}/share`, body);
      setJustCreatedToken(res.token);
      // Auto-copy to clipboard
      const fullUrl = `${window.location.origin}${res.url}`;
      await navigator.clipboard.writeText(fullUrl).catch(() => undefined);
      await refresh();
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Холбоос үүсгэж чадсангүй");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(shareId: string) {
    if (!confirm("Энэ токен устгах уу? Хуваалцсан бүх хэрэглэгчдийн хандалт алдагдана.")) return;
    setErr(null);
    try {
      await api.del(`/projects/${projectId}/shares/${shareId}`);
      await refresh();
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Устгаж чадсангүй");
    }
  }

  function copyUrl(token: string) {
    const fullUrl = `${window.location.origin}/shared/${token}`;
    void navigator.clipboard.writeText(fullUrl).catch(() => undefined);
  }

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="share-dialog-overlay">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} data-testid="share-dialog">
        <header style={headerStyle}>
          <h3 style={{ margin: 0 }}>🔗 Хуваалцах холбоос</h3>
          <button type="button" onClick={onClose} style={closeBtn} data-testid="share-close">✕</button>
        </header>

        {/* Create section */}
        <section style={sectionStyle}>
          <h4 style={sectionTitle}>Шинэ холбоос үүсгэх</h4>
          <p style={{ fontSize: 12, color: "var(--fg-muted, #666)", marginBottom: 8 }}>
            Read-only — хэн ч энэ холбоосыг ашиглавал төслийг үзэх боломжтой (засах боломжгүй).
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 13 }}>Хугацаа:</label>
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
              disabled={creating}
              style={selectStyle}
              data-testid="share-expiry-select"
            >
              {EXPIRY_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={createShare}
              disabled={creating}
              style={primaryBtn}
              data-testid="share-create"
            >
              {creating ? "Үүсгэж байна..." : "Холбоос үүсгэх"}
            </button>
          </div>
          {justCreatedToken && (
            <p style={{ fontSize: 12, color: "var(--success, #2c8a3f)", marginTop: 8 }} data-testid="share-just-created">
              ✓ Үүссэн ба буферт хуулсан: {window.location.origin}/shared/{justCreatedToken}
            </p>
          )}
        </section>

        {/* Existing tokens */}
        <section style={sectionStyle}>
          <h4 style={sectionTitle}>Идэвхтэй холбоосууд</h4>
          {loading && <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>Ачаалж байна...</p>}
          {!loading && shares.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg-muted)" }} data-testid="share-empty">
              Идэвхтэй холбоос алга.
            </p>
          )}
          {!loading && shares.length > 0 && (
            <table style={tableStyle} data-testid="share-list">
              <thead>
                <tr>
                  <th style={thStyle}>Токен</th>
                  <th style={thStyle}>Үүсгэсэн</th>
                  <th style={thStyle}>Дуусах</th>
                  <th style={thStyle}>Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={s.id} style={!s.active ? { opacity: 0.4 } : undefined}>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 11 }}>{s.token.slice(0, 10)}…</code>
                    </td>
                    <td style={tdStyle}>{new Date(s.createdAt).toLocaleString("mn-MN")}</td>
                    <td style={tdStyle}>
                      {s.expiresAt ? new Date(s.expiresAt).toLocaleString("mn-MN") : "Хязгааргүй"}
                      {!s.active && <span style={{ marginLeft: 4, color: "var(--danger, #a32d2d)" }}>(дууссан)</span>}
                    </td>
                    <td style={tdStyle}>
                      <button type="button" onClick={() => copyUrl(s.token)} style={smallBtn} data-testid={`share-copy-${s.id}`}>
                        📋 Хуулах
                      </button>
                      <button type="button" onClick={() => revoke(s.id)} style={smallBtnDanger} data-testid={`share-revoke-${s.id}`}>
                        🗑 Устгах
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {err && (
          <p style={{ color: "var(--danger, #a32d2d)", fontSize: 12, marginTop: 8 }} data-testid="share-err">
            ⚠ {err}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalStyle: CSSProperties = {
  background: "var(--bg, white)",
  borderRadius: 10,
  width: "min(640px, 96vw)",
  maxHeight: "90vh",
  overflow: "auto",
  padding: 18,
  boxShadow: "0 10px 60px rgba(0,0,0,0.3)",
};
const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border-soft, #eee)",
};
const closeBtn: CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 18,
  cursor: "pointer",
  color: "var(--fg-muted, #888)",
};
const sectionStyle: CSSProperties = { marginBottom: 14 };
const sectionTitle: CSSProperties = { margin: "0 0 6px", fontSize: 14, color: "var(--fg-muted, #444)" };
const selectStyle: CSSProperties = { padding: "4px 8px", fontSize: 13 };
const primaryBtn: CSSProperties = {
  padding: "6px 14px",
  background: "var(--accent, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 13,
};
const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  borderBottom: "2px solid var(--border, #ccc)",
  fontWeight: 600,
  color: "var(--fg-muted, #666)",
};
const tdStyle: CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid var(--border-soft, #eee)",
  verticalAlign: "middle",
};
const smallBtn: CSSProperties = {
  padding: "3px 8px",
  marginRight: 4,
  fontSize: 11,
  background: "var(--bg-elev, #f6f6f8)",
  border: "1px solid var(--border-soft, #ddd)",
  borderRadius: 4,
  cursor: "pointer",
};
const smallBtnDanger: CSSProperties = {
  ...smallBtn,
  color: "var(--danger, #a32d2d)",
};
