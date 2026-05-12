import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  verified: boolean;
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  accessExpiresAt: number | null;
  demoMode: boolean;
  setAuth(payload: { user: AuthUser; accessToken: string; accessExpiresAt: number }): void;
  clearAuth(): void;
  enableDemo(): void;
  isAuthenticated(): boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      accessExpiresAt: null,
      demoMode: false,
      setAuth: (p) =>
        set({
          user: p.user,
          accessToken: p.accessToken,
          accessExpiresAt: p.accessExpiresAt,
          demoMode: false,
        }),
      clearAuth: () =>
        set({ user: null, accessToken: null, accessExpiresAt: null, demoMode: false }),
      enableDemo: () =>
        set({
          user: {
            id: "demo-user",
            email: "demo@hydra.local",
            name: "Demo хэрэглэгч",
            role: "user",
            verified: true,
            createdAt: new Date().toISOString(),
          },
          accessToken: "demo-token",
          accessExpiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30,
          demoMode: true,
        }),
      isAuthenticated: () => {
        const s = get();
        if (s.demoMode) return true;
        return !!s.user && !!s.accessToken && (s.accessExpiresAt ?? 0) > Date.now();
      },
    }),
    {
      name: "hydra.auth",
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        accessExpiresAt: s.accessExpiresAt,
        demoMode: s.demoMode,
      }),
    },
  ),
);
