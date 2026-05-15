/**
 * Phase 10.1 — Email service abstraction.
 *
 * Three templates supported:
 *   - welcome        — sent on register (includes verification link)
 *   - verify_email   — sent on /auth/resend-verification
 *   - reset_password — sent on /auth/forgot
 *
 * Provider selection via env var:
 *   - dev mode (no EMAIL_PROVIDER): logs payload to console + returns success
 *   - "postmark": uses POSTMARK_API_TOKEN + Postmark REST API
 *   - "sendgrid": uses SENDGRID_API_KEY + SendGrid REST API
 *
 * All copy is Mongolian (the target engineer audience). Provider
 * keys are NEVER committed — supplied via env in production.
 */

import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

export type EmailTemplate = "welcome" | "verify_email" | "reset_password";

export interface EmailPayload {
  to: string;
  template: EmailTemplate;
  /** Engineer-facing display name (used in greeting). May be empty. */
  recipientName?: string;
  /** Template-specific data. */
  data: Record<string, string>;
}

interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Render the Mongolian-language email body. Templates are kept
 * inline (small enough to read at a glance) rather than in separate
 * files — easier to review during PR audit.
 */
function render(payload: EmailPayload): RenderedEmail {
  const greeting = payload.recipientName
    ? `Сайн байна уу ${payload.recipientName}!`
    : "Сайн байна уу!";
  switch (payload.template) {
    case "welcome": {
      const link = payload.data.verifyLink ?? "";
      return {
        subject: "Hydra Calc-руу тавтай морилно уу — и-мэйлээ баталгаажуул",
        text:
          `${greeting}\n\n` +
          `Hydra Calc-руу бүртгэлд тавтай морилно уу. Доорх холбоосыг дарж и-мэйлээ баталгаажуулна уу:\n\n` +
          `${link}\n\n` +
          `Энэ холбоос 24 цагийн дотор хүчинтэй.\n\n` +
          `— Hydra Calc баг`,
        html:
          `<p>${greeting}</p>` +
          `<p>Hydra Calc-руу бүртгэлд тавтай морилно уу. Доорх товчийг дарж и-мэйлээ баталгаажуулна уу:</p>` +
          `<p><a href="${link}" style="background:#1f5faa;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">И-мэйл баталгаажуулах</a></p>` +
          `<p style="color:#888;font-size:12px">Эсвэл энэ холбоосыг хуулна уу: ${link}</p>` +
          `<p style="color:#888;font-size:12px">Энэ холбоос 24 цагийн дотор хүчинтэй.</p>` +
          `<p>— Hydra Calc баг</p>`,
      };
    }
    case "verify_email": {
      const link = payload.data.verifyLink ?? "";
      return {
        subject: "И-мэйл баталгаажуулалт — Hydra Calc",
        text:
          `${greeting}\n\n` +
          `И-мэйлийг дахин баталгаажуулах хүсэлт ирлээ:\n\n${link}\n\n` +
          `24 цагт хүчинтэй. Хэрэв та хүсээгүй бол энэ и-мэйлийг үл харгалзаарай.\n\n— Hydra Calc баг`,
        html:
          `<p>${greeting}</p>` +
          `<p>И-мэйл баталгаажуулалтын холбоос:</p>` +
          `<p><a href="${link}">${link}</a></p>` +
          `<p style="color:#888;font-size:12px">24 цагт хүчинтэй.</p>` +
          `<p>— Hydra Calc баг</p>`,
      };
    }
    case "reset_password": {
      const link = payload.data.resetLink ?? "";
      return {
        subject: "Нууц үг сэргээх — Hydra Calc",
        text:
          `${greeting}\n\n` +
          `Нууц үг сэргээх хүсэлт ирлээ. Доорх холбоосыг дарж шинэ нууц үг тогтооно уу:\n\n${link}\n\n` +
          `1 цагт хүчинтэй. Хэрэв та хүсээгүй бол энэ и-мэйлийг үл харгалзаарай.\n\n— Hydra Calc баг`,
        html:
          `<p>${greeting}</p>` +
          `<p>Нууц үг сэргээх холбоос:</p>` +
          `<p><a href="${link}" style="background:#1f5faa;color:white;padding:10px 18px;border-radius:6px;text-decoration:none;">Нууц үг солих</a></p>` +
          `<p style="color:#888;font-size:12px">1 цагт хүчинтэй. Хүсээгүй бол үл харгалзаарай.</p>` +
          `<p>— Hydra Calc баг</p>`,
      };
    }
  }
}

/**
 * Send an email via the configured provider. In dev / test mode
 * the email is logged to stdout instead of going over the wire,
 * so engineer's local flow Just Works without provider creds.
 *
 * Returns a `messageId` (provider-issued in production, synthetic in dev)
 * so the caller can correlate with delivery logs.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string; provider: string }> {
  const rendered = render(payload);
  const provider = process.env.EMAIL_PROVIDER ?? "";

  // Dev / test fallback — log everything to stdout instead of
  // calling a real provider. Engineers spin up the backend locally
  // without any keys and still get the verification link in
  // their terminal.
  if (!provider || env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(
      "\n📧 [email/dev]\n" +
        `  to: ${payload.to}\n` +
        `  template: ${payload.template}\n` +
        `  subject: ${rendered.subject}\n` +
        `  ─────\n${rendered.text}\n  ─────\n`,
    );
    return { messageId: `dev-${Date.now()}`, provider: "dev" };
  }

  // Postmark / SendGrid integration. Both providers accept a simple
  // POST with JSON body. Keys NEVER logged.
  if (provider === "postmark") {
    const token = process.env.POSTMARK_API_TOKEN;
    if (!token) throw new Error("POSTMARK_API_TOKEN env var missing");
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify({
        From: process.env.EMAIL_FROM ?? "noreply@hydra-calc.mn",
        To: payload.to,
        Subject: rendered.subject,
        TextBody: rendered.text,
        HtmlBody: rendered.html,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Postmark send failed (${res.status}): ${errBody}`);
    }
    const json = (await res.json()) as { MessageID: string };
    return { messageId: json.MessageID, provider: "postmark" };
  }

  if (provider === "sendgrid") {
    const token = process.env.SENDGRID_API_KEY;
    if (!token) throw new Error("SENDGRID_API_KEY env var missing");
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: payload.to }], subject: rendered.subject }],
        from: { email: process.env.EMAIL_FROM ?? "noreply@hydra-calc.mn" },
        content: [
          { type: "text/plain", value: rendered.text },
          { type: "text/html", value: rendered.html },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`SendGrid send failed (${res.status}): ${errBody}`);
    }
    const id = res.headers.get("x-message-id") ?? `sg-${Date.now()}`;
    return { messageId: id, provider: "sendgrid" };
  }

  throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
}

/** Generate a URL-safe random token (32 bytes / 256 bits → 43 char base64url). */
export function generateEmailToken(): string {
  // Node's crypto is synchronous + secure. ES-module import via
  // top-of-file `import { randomBytes } from "node:crypto"` instead of
  // `require()` keeps `@typescript-eslint/no-require-imports` happy.
  const bytes = randomBytes(32);
  return bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Exposed for unit tests — verifies the rendered template content. */
export function renderForTests(payload: EmailPayload): RenderedEmail {
  return render(payload);
}
