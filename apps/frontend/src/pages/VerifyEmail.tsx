/**
 * Phase 10.1 — Email verification page.
 *
 * URL: /verify-email?token=<token>
 *
 * Page auto-submits the token on mount. Three states:
 *   1. Verifying (initial)
 *   2. Success → "Verified! → Login"
 *   3. Error → "Invalid / expired"
 *
 * After successful verify, the engineer is invited to log in. No
 * auto-login because we want the engineer to see the success
 * confirmation explicitly before navigating away.
 */
import { useEffect, useState } from "react";
import { AuthShell } from "./Login";
import { api, HttpError } from "../lib/api";

type VerifyState = "verifying" | "ok" | "error";

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") ?? "";
}

export function VerifyEmail() {
  const [token] = useState(getToken());
  const [state, setState] = useState<VerifyState>("verifying");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMsg("Холбоос дутуу — token параметр алга");
      return;
    }
    void api.post("/auth/verify-email", { token })
      .then(() => setState("ok"))
      .catch((e: unknown) => {
        setState("error");
        setMsg(e instanceof HttpError ? e.message : "Холбоос хүчингүй эсвэл хугацаа дууссан");
      });
  }, [token]);

  if (state === "verifying") {
    return (
      <AuthShell title="И-мэйл баталгаажуулж байна...">
        <p style={{ fontSize: 14, color: "var(--fg-muted, #666)" }}>Түр хүлээнэ үү.</p>
      </AuthShell>
    );
  }

  if (state === "ok") {
    return (
      <AuthShell title="✓ И-мэйл баталгаажсан">
        <p style={{ fontSize: 14 }} data-testid="verify-success">
          Танай и-мэйл амжилттай баталгаажсан. Одоо нэвтрэх боломжтой.
        </p>
        <p style={{ fontSize: 12, marginTop: 12 }}>
          <a href="/login">→ Нэвтрэх хуудас</a>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Алдаа">
      <p style={{ fontSize: 14, color: "var(--danger, #a32d2d)" }} data-testid="verify-error">
        {msg}
      </p>
      <p style={{ fontSize: 12, marginTop: 12 }}>
        <a href="/login">← Нэвтрэх хуудас</a>
      </p>
    </AuthShell>
  );
}
