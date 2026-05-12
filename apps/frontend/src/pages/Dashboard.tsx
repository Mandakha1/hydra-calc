import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, HttpError } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../lib/authStore";
import { listDemoProjects, storage } from "../lib/storage";
import { TemplatesGallery } from "../components/hydraulic/panels/TemplatesGallery";
import type { SchemeTemplate } from "../components/hydraulic/schemeLibrary";

interface ProjectListItem {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  updatedAt: string;
  createdAt: string;
}

interface ListResponse {
  items: ProjectListItem[];
  total: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const demoMode = useAuthStore((s) => s.demoMode);
  const [items, setItems] = useState<ProjectListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const nav = useNavigate();

  async function pickTemplate(tpl: SchemeTemplate) {
    setShowTemplates(false);
    if (tpl.key === "empty") {
      nav("/app/new");
      return;
    }
    const state = tpl.build();
    const name = `${tpl.name} ${new Date().toISOString().slice(5, 10)}`;
    try {
      if (demoMode) {
        await storage.set(`project:${name}`, JSON.stringify(state));
        nav(`/app/${encodeURIComponent(name)}`);
      } else {
        const created = await api.post<{ id: string }>("/projects", { name, data: state });
        nav(`/app/${created.id}`);
      }
    } catch (e) {
      alert(e instanceof HttpError ? e.message : "Үүсгэж чадсангүй");
    }
  }

  // load() is memoized on [demoMode] so its identity is stable while demoMode
  // is unchanged — fixing the previous bug where toggling demoMode AFTER mount
  // would leave the captured load() reading the old demoMode value. The
  // useEffect now correctly re-fires when the user logs in/out mid-session.
  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (demoMode) {
        const demo = listDemoProjects();
        setItems(demo.map((p) => ({ ...p, description: null, tags: [], createdAt: p.updatedAt })));
        setTotal(demo.length);
      } else {
        const res = await api.get<ListResponse>("/projects?limit=100");
        setItems(res.items);
        setTotal(res.total);
      }
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Ачаалж чадсангүй");
    } finally {
      setLoading(false);
    }
  }, [demoMode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDelete(id: string, name: string) {
    if (!confirm(`"${name}" төслийг устгах уу? Буцаах боломжгүй.`)) return;
    try {
      if (demoMode) {
        window.localStorage.removeItem(`hydra.demo.project:${name}`);
        window.localStorage.removeItem(`hydra.demo.project:${name}:ts`);
      } else {
        await api.del(`/projects/${id}`);
      }
      setItems((xs) => xs.filter((p) => p.id !== id));
      setTotal((t) => t - 1);
    } catch (e) {
      alert(e instanceof HttpError ? e.message : "Устгаж чадсангүй");
    }
  }

  return (
    <div style={{ padding: "2rem 0", minHeight: "calc(100vh - 58px)" }}>
      <div className="container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>Миний төслүүд</h1>
            <div style={{ color: "var(--fg-muted)", fontSize: 14 }}>
              Сайн байна уу, {user?.name || user?.email}. {total} идэвхтэй төсөл.
            </div>
            {demoMode && (
              <div
                className="badge"
                style={{ marginTop: 6, color: "var(--warning)", borderColor: "var(--warning)" }}
              >
                Demo горим · браузерт хадгалж байна (cloud биш)
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => nav("/app/import-dxf")} size="lg" variant="secondary">📐 AutoCAD .dxf</Button>
            <Button onClick={() => nav("/app/import-zulu")} size="lg" variant="secondary">📂 Zulu .sqlite</Button>
            <Button onClick={() => setShowTemplates(true)} size="lg" variant="secondary">📋 Загвар сонгох</Button>
            <Button onClick={() => nav("/app/new")} size="lg">+ Хоосон төсөл</Button>
          </div>
        </header>
        {showTemplates && <TemplatesGallery onPick={pickTemplate} onCancel={() => setShowTemplates(false)} />}

        {loading && <div style={{ color: "var(--fg-muted)" }}>Ачааллаж байна...</div>}
        {err && <div style={{ color: "var(--danger)" }}>{err}</div>}

        {!loading && items.length === 0 && (
          <Card style={{ textAlign: "center", padding: "3rem" }}>
            <div style={{ fontSize: 42, marginBottom: "1rem" }}>📐</div>
            <h3>Төсөл алга байна</h3>
            <p>УБ-ын бодит сүлжээн дээр үндэслэсэн загвараас эхэл, эсвэл хоосон төсөл үүсгэ.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <Button size="lg" onClick={() => setShowTemplates(true)}>📋 Загвар сонгох</Button>
              <Link to="/app/new">
                <Button size="lg" variant="secondary">+ Хоосон төсөл</Button>
              </Link>
            </div>
          </Card>
        )}

        {!loading && items.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1rem",
            }}
          >
            {items.map((p) => (
              <Card key={p.id} hover>
                <Link
                  to={`/app/${p.id}`}
                  style={{ color: "inherit", textDecoration: "none", display: "block" }}
                >
                  <h3 style={{ marginBottom: 6 }}>{p.name}</h3>
                  {p.description && (
                    <p style={{ fontSize: 13, marginBottom: "0.75rem", color: "var(--fg-muted)" }}>
                      {p.description}
                    </p>
                  )}
                  <div style={{ fontSize: 12, color: "var(--fg-dim)", fontFamily: "var(--font-mono)" }}>
                    Шинэчилсэн: {new Date(p.updatedAt).toLocaleString("mn-MN")}
                  </div>
                  {p.tags && p.tags.length > 0 && (
                    <div style={{ marginTop: "0.75rem", display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.tags.map((t) => (
                        <span key={t} className="badge">{t}</span>
                      ))}
                    </div>
                  )}
                </Link>
                <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border-soft)", paddingTop: "0.5rem", display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p.id, p.name);
                    }}
                  >
                    Устгах
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
