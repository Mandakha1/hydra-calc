/**
 * Phase 10.1 — Password reset page.
 *
 * URL: /reset-password?token=<token>
 *
 * Engineer arrives via the email link, enters a new password
 * (with confirmation), submits → backend validates token + sets
 * new hash + revokes ALL their sessions. Engineer is redirected
 * to /login to re-authenticate with the new password.
 */
import { useState, type FormEvent } from "react";
import { AuthShell } from "./Login";
import { api, HttpError } from "../lib/api";

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? "";
}

export function ResetPassword() {
  const [token] = useState(getToken());
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthShell title="Алдаатай холбоос">
        <p style={{ fontSize: 14 }}>
          Холбоос дутуу эсвэл хугацаа дууссан. <a href="/forgot">Дахин сэргээх хүсэлт</a>.
        </p>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Амжилттай">
        <p style={{ fontSize: 14 }}>Нууц үг солигдсон. Шинэ нууц үгээрээ нэвтэрнэ үү.</p>
        <p style={{ fontSize: 12, marginTop: 12 }}>
          <a href="/login">→ Нэвтрэх хуудас</a>
        </p>
      </AuthShell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw1 !== pw2) {
      setErr("Нууц үг таарахгүй байна");
      return;
    }
    if (pw1.length < 8) {
      setErr("Нууц үг 8-аас доош тэмдэгттэй байж болохгүй");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset", { token, newPassword: pw1 });
      setDone(true);
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Алдаа гарлаа");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Шинэ нууц үг тогтоох">
      <form onSubmit={onSubmit}>
        <label htmlFor="pw1" style={{ fontSize: 13 }}>Шинэ нууц үг</label>
        <input
          id="pw1"
          type="password"
          required
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          disabled={submitting}
          style={{ width: "100%", padding: "8px 10px", marginTop: 4, marginBottom: 12 }}
          data-testid="reset-pw1"
        />
        <label htmlFor="pw2" style={{ fontSize: 13 }}>Дахин оруулна уу</label>
        <input
          id="pw2"
          type="password"
          required
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          disabled={submitting}
          style={{ width: "100%", padding: "8px 10px", marginTop: 4, marginBottom: 12 }}
          data-testid="reset-pw2"
        />
        <button
          type="submit"
          disabled={submitting || !pw1 || !pw2}
          style={{ width: "100%", padding: "10px 14px" }}
          data-testid="reset-submit"
        >
          {submitting ? "Шинэчилж байна..." : "Нууц үг шинэчлэх"}
        </button>
        {err && <p style={{ color: "var(--danger, #a32d2d)", fontSize: 12, marginTop: 8 }}>{err}</p>}
      </form>
    </AuthShell>
  );
}
