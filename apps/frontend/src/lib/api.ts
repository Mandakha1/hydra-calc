/**
 * Tiny fetch wrapper with:
 *   - auth interceptor (Bearer from authStore)
 *   - auto-refresh on 401
 *   - JSON in/out
 *   - same-origin default (proxy in dev, Caddy in prod)
 */
import { useAuthStore } from "./authStore";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "") + "/api";

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}
export { HttpError };

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      useAuthStore.getState().setAuth({
        user: data.user,
        accessToken: data.accessToken,
        accessExpiresAt: data.accessExpiresAt,
      });
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function request<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && retry) {
    const newToken = await doRefresh();
    if (newToken) return request<T>(method, path, body, false);
    useAuthStore.getState().clearAuth();
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = (data as { message?: string })?.message ?? res.statusText;
    throw new HttpError(res.status, data, msg);
  }
  return data as T;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T = unknown>(path: string) => request<T>("DELETE", path),
};
