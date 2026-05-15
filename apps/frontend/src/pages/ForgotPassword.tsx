/**
 * Phase 10.1 — Forgot password page.
 *
 * Engineer enters email; backend always returns ok (doesn't leak
 * which addresses are registered). On success the engineer sees a
 * "check your inbox" confirmation. In dev mode the verification
 * link prints to the backend console for local testing.
 */
import { useState, type FormEvent } from "react";
import { AuthShell } from "./Login";
import { api, HttpError } from "../lib/api";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await api.post("/auth/forgot", { email });
      setSent(true);
    } catch (e) {
      setErr(e instanceof HttpError ? e.message : "Алдаа гарлаа. Дахин оролдоно уу.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthShell title="Шалгана уу">
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          Хэрэв <code>{email}</code> бүртгэлтэй бол сэргээх холбоосыг и-мэйлээр илгээсэн.
        </p>
        <p style={{ fontSize: 12, color: "var(--fg-muted, #888)" }}>
          1 цагт хүчинтэй. Spam хавтсыг шалгана уу.
        </p>
        <p style={{ fontSize: 12, marginTop: 12 }}>
          <a href="/login">← Нэвтрэх хуудас</a>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Нууц үг мартсан">
      <form onSubmit={onSubmit}>
        <p style={{ fontSize: 13, color: "var(--fg-muted, #666)", marginBottom: 12 }}>
          Бүртгэлтэй и-мэйлээ оруулна уу. Бид сэргээх холбоосыг и-мэйлээр илгээнэ.
        </p>
        <label htmlFor="email" style={{ fontSize: 13 }}>И-мэйл</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting}
          style={{ width: "100%", padding: "8px 10px", marginTop: 4, marginBottom: 12 }}
          data-testid="forgot-email"
        />
        <button
          type="submit"
          disabled={submitting || !email}
          style={{ width: "100%", padding: "10px 14px" }}
          data-testid="forgot-submit"
        >
          {submitting ? "Илгээж байна..." : "Сэргээх холбоос илгээх"}
        </button>
        {err && <p style={{ color: "var(--danger, #a32d2d)", fontSize: 12, marginTop: 8 }}>{err}</p>}
        <p style={{ fontSize: 12, marginTop: 12 }}>
          <a href="/login">← Нэвтрэх хуудас</a>
        </p>
      </form>
    </AuthShell>
  );
}
