/**
 * Phase 10.1 — Email module unit tests.
 *
 * Tests the pure-rendering side of the email service. The actual
 * provider send paths (Postmark / SendGrid) are deferred to manual
 * production smoke tests — running them in CI would require live
 * provider creds.
 */
import { describe, it, expect } from "vitest";
import { renderForTests, generateEmailToken } from "../lib/email.js";

describe("email rendering — welcome", () => {
  const payload = {
    to: "engineer@example.com",
    template: "welcome" as const,
    recipientName: "Болд",
    data: { verifyLink: "https://hydra-calc.mn/verify-email?token=ABC123" },
  };

  it("subject is Mongolian and engineer-facing", () => {
    const out = renderForTests(payload);
    expect(out.subject).toMatch(/Hydra Calc/);
    expect(out.subject).toMatch(/баталгаажуул/);
  });

  it("greeting includes recipient name", () => {
    const out = renderForTests(payload);
    expect(out.text).toMatch(/Сайн байна уу Болд/);
    expect(out.html).toMatch(/Сайн байна уу Болд/);
  });

  it("includes the verification link verbatim", () => {
    const out = renderForTests(payload);
    expect(out.text).toContain(payload.data.verifyLink);
    expect(out.html).toContain(payload.data.verifyLink);
  });

  it("HTML body contains a call-to-action button", () => {
    const out = renderForTests(payload);
    expect(out.html).toMatch(/<a href=/);
    expect(out.html).toMatch(/И-мэйл баталгаажуулах/);
  });
});

describe("email rendering — reset_password", () => {
  const payload = {
    to: "engineer@example.com",
    template: "reset_password" as const,
    data: { resetLink: "https://hydra-calc.mn/reset-password?token=XYZ" },
  };

  it("subject mentions password reset in Mongolian", () => {
    const out = renderForTests(payload);
    expect(out.subject).toMatch(/Нууц үг сэргээх/);
  });

  it("body mentions 1-hour expiry", () => {
    const out = renderForTests(payload);
    expect(out.text).toMatch(/1 цаг/);
  });

  it("falls back to generic greeting when no recipientName", () => {
    const out = renderForTests(payload);
    expect(out.text).toMatch(/Сайн байна уу!/);
  });
});

describe("email rendering — verify_email (resend)", () => {
  it("renders with the verifyLink", () => {
    const out = renderForTests({
      to: "x@y.com",
      template: "verify_email",
      data: { verifyLink: "https://example.com/v?t=T" },
    });
    expect(out.subject).toMatch(/Баталгаажуулалт|баталгаажуулалт/);
    expect(out.text).toContain("https://example.com/v?t=T");
  });
});

describe("generateEmailToken", () => {
  it("produces a URL-safe random string (43 chars from 32 bytes b64url)", () => {
    const t = generateEmailToken();
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t.length).toBeLessThanOrEqual(48);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces distinct tokens on repeated calls", () => {
    const t1 = generateEmailToken();
    const t2 = generateEmailToken();
    const t3 = generateEmailToken();
    expect(t1).not.toBe(t2);
    expect(t2).not.toBe(t3);
  });

  it("token entropy is sufficient (no obvious patterns)", () => {
    const tokens = Array.from({ length: 50 }, () => generateEmailToken());
    const set = new Set(tokens);
    expect(set.size).toBe(50); // all unique
  });
});
