import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AuthShell } from "./Login";
import { HttpError } from "../lib/api";

export function Register() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const nav = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await register(email, password, name || undefined);
      nav("/app", { replace: true });
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Бүртгүүлэхэд алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Шинээр бүртгүүлэх">
      <form onSubmit={onSubmit}>
        <Input
          label="Нэр (сонголт)"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
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
          autoComplete="new-password"
          required
          minLength={8}
          hint="Хамгийн багадаа 8 тэмдэгт"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <Button type="submit" size="lg" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Бүртгэж байна..." : "Бүртгүүлэх"}
        </Button>
      </form>
      <div style={{ marginTop: "1.25rem", fontSize: 13, textAlign: "center", color: "var(--fg-muted)" }}>
        Аль хэдийн бүртгэлтэй юу? <Link to="/login">Нэвтрэх</Link>
      </div>
    </AuthShell>
  );
}
