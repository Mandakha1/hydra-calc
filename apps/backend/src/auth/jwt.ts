import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export interface JwtPayload {
  sub: string;
  email: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
}

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

function sign(data: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(data).digest());
}

export function signAccessToken(
  payload: { sub: string; email: string; role: "user" | "admin" },
  ttlSeconds = env.JWT_ACCESS_TTL,
): { token: string; expiresAt: number } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...payload, iat, exp }));
  const sig = sign(`${header}.${body}`, env.JWT_SECRET);
  return { token: `${header}.${body}.${sig}`, expiresAt: exp * 1000 };
}

export function verifyAccessToken(token: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed JWT");
  const [header, body, sig] = parts as [string, string, string];
  const expected = sign(`${header}.${body}`, env.JWT_SECRET);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("Bad signature");
  const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as JwtPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

/** Opaque refresh token — 48 bytes b64url. Hashed before storing. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHmac("sha256", env.JWT_SECRET).update(token).digest("hex");
}

/** Share token — 32 bytes b64url, URL-safe, no PII. */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
