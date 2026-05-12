import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../lib/authStore";
import { api, HttpError } from "../lib/api";

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: "user" | "admin";
    verified: boolean;
    createdAt: string;
  };
  accessToken: string;
  accessExpiresAt: number;
}

export function useAuth() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<AuthResponse>("/auth/login", { email, password });
      setAuth(res);
      return res.user;
    },
    [setAuth],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await api.post<AuthResponse>("/auth/register", { email, password, name });
      setAuth(res);
      return res.user;
    },
    [setAuth],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
    }
    clearAuth();
    nav("/", { replace: true });
  }, [clearAuth, nav]);

  return { user, isAuthenticated, login, register, logout };
}
