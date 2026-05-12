import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../../lib/authStore";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();
  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
