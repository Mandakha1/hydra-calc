import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useAuthStore } from "../lib/authStore";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { HttpError } from "../lib/api";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const enableDemo = useAuthStore((s) => s.enableDemo);
  const nav = useNavigate();
  const location = useLocation();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string })?.from ?? "/app";
      nav(from, { replace: true });
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Нэвтрэхэд алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Нэвтрэх">
      <form onSubmit={onSubmit}>
        <Input
          label="И-мэйл"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Нууц үг"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <Button type="submit" size="lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Нэвтэрч байна..." : "Нэвтрэх"}
        </Button>
      </form>

      <div
        style={{
          borderTop: "1px solid var(--border-soft)",
          marginTop: "1.25rem",
          paddingTop: "1rem",
          textAlign: "center",
        }}
      >
        <Button
          variant="secondary"
          size="md"
          style={{ width: "100%" }}
          onClick={() => {
            enableDemo();
            nav("/app", { replace: true });
          }}
        >
          🧪 Demo горим — сервергүйгээр туршиж үзэх
        </Button>
        <div style={{ fontSize: 11, color: "var(--fg-dim)", marginTop: 4 }}>
          Төсөл браузерт хадгалагдана. Postgres шаардлагагүй.
        </div>
      </div>

      <div style={{ marginTop: "1.25rem", fontSize: 13, textAlign: "center", color: "var(--fg-muted)" }}>
        Бүртгэлгүй юу? <Link to="/register">Энд бүртгүүл</Link>
        <br />
        <Link to="/forgot" style={{ color: "var(--fg-dim)" }}>Нууц үг мартсан?</Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "calc(100vh - 58px)", display: "flex", alignItems: "center", padding: "3rem 1.5rem" }}>
      <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
        <h1 style={{ textAlign: "center", marginBottom: "1.5rem" }}>{title}</h1>
        <Card>{children}</Card>
      </div>
    </div>
  );
}
