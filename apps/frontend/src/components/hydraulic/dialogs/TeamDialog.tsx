/**
 * Phase 10.5 — Team dialog.
 *
 * Engineer-owner (project creator) manages team membership for a
 * project. Add member by email → pick role → save. Remove members.
 * Approver-role users can hit the "Зөвшөөрөх" button to record
 * their approval.
 *
 * Three roles:
 *   - engineer (owner-equivalent — full edit / share / delete)
 *   - checker  (view + run compliance)
 *   - approver (view + approve)
 */
import { useEffect, useState, type CSSProperties } from "react";
import { api, HttpError } from "../../../lib/api";

type Role = "engineer" | "checker" | "approver";

interface Member {
  userId: string;
  email: string | null;
  name: string | null;
  role: Role;
  addedAt: string;
  isOwner: boolean;
  approvedAt: string | null;
}

interface Props {
  projectId: string;
  currentUserId: string;
  onClose: () => void;
}

function roleLabel(role: Role): string {
  switch (role) {
    case "engineer": return "Инженер";
    case "checker": return "Шалгагч";
    case "approver": return "Батлагч";
  }
}

export function TeamDialog({ projectId, currentUserId, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("checker");
  const [adding, setAdding] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get<{ members: Member[] }>(`/projects/${projectId}/members`);
      setMembers(res.members);
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

  async function addMember() {
    setAdding(true);
    setErr(null);
    try {
      await api.post(`/projects/${projectId}/members`, { userEmail: newEmail, role: newRole });
      setNewEmail("");
      await refresh();
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Гишүүн нэмж чадсангүй");
    } finally {
      setAdding(false);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Энэ гишүүнийг устгах уу?")) return;
    setErr(null);
    try {
      await api.del(`/projects/${projectId}/members/${userId}`);
      await refresh();
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Устгаж чадсангүй");
    }
  }

  async function approveProject() {
    setErr(null);
    try {
      await api.put(`/projects/${projectId}/approve`, {});
      await refresh();
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Зөвшөөрөл өгч чадсангүй");
    }
  }

  // Is the current viewer an approver who hasn't yet acted?
  const currentMember = members.find((m) => m.userId === currentUserId);
  const isApproverPending = currentMember?.role === "approver" && !currentMember.approvedAt;

  // Only the project owner sees the add/remove controls
  const isOwnerViewing = members.find((m) => m.userId === currentUserId && m.isOwner) !== undefined;

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="team-dialog-overlay">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} data-testid="team-dialog">
        <header style={headerStyle}>
          <h3 style={{ margin: 0 }}>👥 Багийн гишүүд</h3>
          <button type="button" onClick={onClose} style={closeBtn} data-testid="team-close">✕</button>
        </header>

        {/* Approval button (approver-pending state only) */}
        {isApproverPending && (
          <section style={approverPromptStyle} data-testid="team-approver-prompt">
            <p style={{ margin: 0, fontSize: 13 }}>
              ⚠ Та энэ төслийг батлах эрхтэй. Шалгасны дараа доорх товчийг дарж зөвшөөрөл бүртгэнэ үү.
            </p>
            <button
              type="button"
              onClick={approveProject}
              style={approveBtn}
              data-testid="team-approve"
            >
              ✓ Зөвшөөрөх
            </button>
          </section>
        )}

        {/* Add member (owner-only) */}
        {isOwnerViewing && (
          <section style={sectionStyle} data-testid="team-add-section">
            <h4 style={sectionTitle}>Шинэ гишүүн нэмэх</h4>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 12, color: "var(--fg-muted, #666)" }}>И-мэйл</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={adding}
                  style={inputStyle}
                  placeholder="engineer@example.com"
                  data-testid="team-add-email"
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: "var(--fg-muted, #666)" }}>Үүрэг</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Role)}
                  disabled={adding}
                  style={selectStyle}
                  data-testid="team-add-role"
                >
                  <option value="checker">Шалгагч</option>
                  <option value="approver">Батлагч</option>
                  <option value="engineer">Инженер</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addMember}
                disabled={adding || !newEmail}
                style={primaryBtn}
                data-testid="team-add-submit"
              >
                {adding ? "Нэмж байна..." : "Нэмэх"}
              </button>
            </div>
          </section>
        )}

        {/* Member list */}
        <section style={sectionStyle}>
          <h4 style={sectionTitle}>Гишүүд ({members.length})</h4>
          {loading && <p style={{ fontSize: 12, color: "var(--fg-muted)" }}>Ачаалж байна...</p>}
          {!loading && members.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg-muted)" }} data-testid="team-empty">
              Гишүүн алга.
            </p>
          )}
          {!loading && members.length > 0 && (
            <table style={tableStyle} data-testid="team-list">
              <thead>
                <tr>
                  <th style={thStyle}>Хэрэглэгч</th>
                  <th style={thStyle}>Үүрэг</th>
                  <th style={thStyle}>Төлөв</th>
                  {isOwnerViewing && <th style={thStyle}>Үйлдэл</th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td style={tdStyle}>
                      <div>{m.name ?? <em>(нэргүй)</em>}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-muted, #888)" }}>{m.email ?? "—"}</div>
                    </td>
                    <td style={tdStyle}>
                      {roleLabel(m.role)}
                      {m.isOwner && <span style={ownerBadge}>эзэн</span>}
                    </td>
                    <td style={tdStyle}>
                      {m.role === "approver" && m.approvedAt
                        ? <span style={{ color: "var(--success, #2c8a3f)" }} data-testid={`team-approved-${m.userId}`}>
                            ✓ Зөвшөөрсөн {new Date(m.approvedAt).toLocaleDateString("mn-MN")}
                          </span>
                        : m.role === "approver"
                          ? <span style={{ color: "var(--fg-muted)" }}>хүлээгдэж байна</span>
                          : "—"
                      }
                    </td>
                    {isOwnerViewing && (
                      <td style={tdStyle}>
                        {!m.isOwner && (
                          <button
                            type="button"
                            onClick={() => removeMember(m.userId)}
                            style={smallBtnDanger}
                            data-testid={`team-remove-${m.userId}`}
                          >
                            🗑 Устгах
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {err && (
          <p style={{ color: "var(--danger, #a32d2d)", fontSize: 12, marginTop: 8 }} data-testid="team-err">
            ⚠ {err}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Styles ──────────────────────────────────────────────────── */

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
  width: "min(680px, 96vw)",
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
const approverPromptStyle: CSSProperties = {
  padding: 12,
  background: "var(--bp-amber-soft, #fff8e6)",
  border: "1px solid var(--bp-amber, #d29a30)",
  borderRadius: 6,
  marginBottom: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const sectionStyle: CSSProperties = { marginBottom: 14 };
const sectionTitle: CSSProperties = { margin: "0 0 8px", fontSize: 13, color: "var(--fg-muted, #444)" };
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  marginTop: 2,
  fontSize: 13,
  border: "1px solid var(--border, #ccc)",
  borderRadius: 4,
};
const selectStyle: CSSProperties = {
  padding: "6px 8px",
  marginTop: 2,
  fontSize: 13,
};
const primaryBtn: CSSProperties = {
  padding: "7px 14px",
  background: "var(--accent, #1f5faa)",
  color: "white",
  border: "none",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const approveBtn: CSSProperties = {
  ...primaryBtn,
  background: "var(--success, #2c8a3f)",
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
  padding: "8px 8px",
  borderBottom: "1px solid var(--border-soft, #eee)",
};
const ownerBadge: CSSProperties = {
  marginLeft: 6,
  fontSize: 10,
  padding: "1px 6px",
  background: "var(--bp-blue-soft, #e1ecf7)",
  color: "var(--bp-blue, #1f5faa)",
  borderRadius: 999,
};
const smallBtnDanger: CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  background: "var(--bg-elev, #f6f6f8)",
  color: "var(--danger, #a32d2d)",
  border: "1px solid var(--border-soft, #ddd)",
  borderRadius: 4,
  cursor: "pointer",
};
