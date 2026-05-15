/**
 * Phase 10.4 — Activity feed tab.
 *
 * Engineer-facing per-project audit trail. Pulls from
 * `/api/projects/:id/audit` with infinite-scroll pagination.
 *
 * Trust signal for checker/approver: every meaningful project
 * mutation logged + timestamped + attributed.
 *
 * Lazy-loaded — only fetched when the engineer opens the
 * 📋 Үйл ажиллагаа tab.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { api, HttpError } from "../../../lib/api";

interface Props {
  /** Project id (UUID for server-side projects, name for demo). Falsy
   *  when the engineer hasn't saved the project yet — feed renders a
   *  helpful empty state. */
  projectId?: string | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: unknown;
  userId: string | null;
  createdAt: string;
}

/** Map technical action keys to Mongolian engineer-friendly verbs. */
function actionLabel(action: string): string {
  switch (action) {
    case "register": return "🆕 Бүртгүүлсэн";
    case "login": return "🔑 Нэвтэрсэн";
    case "login.failed": return "⚠ Нэвтрэх оролдлого амжилтгүй";
    case "logout": return "🚪 Гарсан";
    case "email.verified": return "✓ И-мэйл баталгаажсан";
    case "password.reset.requested": return "🔄 Нууц үг сэргээх хүсэлт";
    case "password.reset.completed": return "✓ Нууц үг шинэчилсэн";
    case "project.create": return "📄 Төсөл үүсгэсэн";
    case "project.update": return "✏ Төсөл засварласан";
    case "project.update_metadata": return "✏ Тохиргоо өөрчилсөн";
    case "project.delete": return "🗑 Төсөл устгасан";
    case "share.created": return "🔗 Хуваалцах токен үүсгэсэн";
    case "share.revoked": return "🗑 Хуваалцах токен устгасан";
    case "compliance.check.run": return "📋 Стандарт шалгасан";
    case "pdf.export": return "🖨 PDF гаргасан";
    case "import.dxf": return "📐 DXF импортолсон";
    default: return action;
  }
}

export function ActivityFeed({ projectId }: Props = {}) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [oldestLoaded, setOldestLoaded] = useState<string | null>(null);

  async function loadPage(before?: string) {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (before) query.set("before", before);
      const res = await api.get<{ entries: AuditEntry[]; hasMore: boolean }>(
        `/projects/${projectId}/audit?${query.toString()}`,
      );
      if (before) {
        setEntries((prev) => [...prev, ...res.entries]);
      } else {
        setEntries(res.entries);
      }
      setHasMore(res.hasMore);
      if (res.entries.length > 0) {
        setOldestLoaded(res.entries[res.entries.length - 1]!.createdAt);
      }
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Үйл ажиллагааны жагсаалт татаж чадсангүй");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div style={containerStyle} data-testid="activity-feed">
      <header style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>📋 Үйл ажиллагааны түүх</h3>
        <p style={{ fontSize: 12, color: "var(--fg-muted, #888)", margin: "0.25rem 0 0" }}>
          Сүүлийн 90 хоногийн чухал өөрчлөлтүүд. Checker / Approver-руу зориулсан баталгааны мөр.
        </p>
      </header>

      {!projectId && (
        <p style={{ fontSize: 13, color: "var(--fg-muted, #888)" }} data-testid="activity-no-project">
          Төсөл хадгалагдаагүй байна. Эхлээд хадгална уу.
        </p>
      )}

      {projectId && loading && entries.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>Ачаалж байна...</p>
      )}

      {projectId && !loading && entries.length === 0 && !err && (
        <p style={{ fontSize: 13, color: "var(--fg-muted, #888)" }} data-testid="activity-empty">
          Үйл ажиллагаа алга. Эхний өөрчлөлт хийсний дараа энд харагдана.
        </p>
      )}

      {entries.length > 0 && (
        <ul style={listStyle} data-testid="activity-list">
          {entries.map((e) => (
            <li key={e.id} style={listItemStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 600 }}>{actionLabel(e.action)}</span>
                <span style={{ fontSize: 11, color: "var(--fg-muted, #888)", fontFamily: "var(--font-mono)" }}>
                  {new Date(e.createdAt).toLocaleString("mn-MN")}
                </span>
              </div>
              {(e.entityType || e.entityId) && (
                <div style={{ fontSize: 11, color: "var(--fg-muted, #666)", fontFamily: "var(--font-mono)" }}>
                  {e.entityType && `${e.entityType}: `}
                  {e.entityId ?? ""}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasMore && oldestLoaded && (
        <button
          type="button"
          onClick={() => loadPage(oldestLoaded)}
          disabled={loading}
          style={loadMoreBtn}
          data-testid="activity-load-more"
        >
          {loading ? "Ачаалж байна..." : "Илүүг ачаалах"}
        </button>
      )}

      {err && (
        <p style={{ color: "var(--danger, #a32d2d)", fontSize: 12 }} data-testid="activity-err">
          ⚠ {err}
        </p>
      )}
    </div>
  );
}

/* ─── Styles ────────────────────────────────────────────────────── */

const containerStyle: CSSProperties = {
  padding: 16,
  height: "100%",
  overflow: "auto",
};
const listStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
};
const listItemStyle: CSSProperties = {
  padding: "8px 12px",
  borderBottom: "1px solid var(--border-soft, #eee)",
  background: "var(--bg-elev, #fafafa)",
  marginBottom: 4,
  borderRadius: 4,
};
const loadMoreBtn: CSSProperties = {
  marginTop: 12,
  padding: "6px 14px",
  background: "var(--bg-elev, #f0f0f0)",
  border: "1px solid var(--border-soft, #ddd)",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 12,
};
