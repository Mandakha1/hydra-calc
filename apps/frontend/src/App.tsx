/**
 * Phase 11.4 — Lazy-loaded route chunks.
 *
 * Pre-launch optimization: defer the heavy page components
 * (ImportDxf 270KB+, HydraulicApp 600KB+, SharedView) until the
 * engineer actually navigates to them. Trims the initial bundle
 * by ~10-15 KB raw / ~3-4 KB gz.
 *
 * Routes that stay eagerly imported:
 *   - Home, Login, Register, ForgotPassword, ResetPassword,
 *     VerifyEmail, NotFound — first-paint paths, small bundles,
 *     and code-splitting them would add a noticeable network
 *     round-trip on the auth funnel
 *   - Navbar / Footer / ProtectedRoute / IconDefs — global chrome
 *
 * Routes lazy-loaded:
 *   - Dashboard, HydraulicApp (the big one — ~600 KB)
 *   - ImportZulu, ImportDxf (each ~150 KB)
 *   - SharedView (the read-only viewer)
 *   - StaticPages bundle (About / Pricing / Docs)
 */
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { IconDefs } from "./design/IconDefs";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { VerifyEmail } from "./pages/VerifyEmail";
import { NotFound } from "./pages/NotFound";

// Lazy-loaded route chunks (Phase 11.4)
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const HydraulicApp = lazy(() => import("./pages/HydraulicApp").then((m) => ({ default: m.HydraulicApp })));
const SharedView = lazy(() => import("./pages/SharedView").then((m) => ({ default: m.SharedView })));
const ImportZulu = lazy(() => import("./pages/ImportZulu").then((m) => ({ default: m.ImportZulu })));
const ImportDxf = lazy(() => import("./pages/ImportDxf").then((m) => ({ default: m.ImportDxf })));
const About = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.About })));
const Pricing = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Pricing })));
const Docs = lazy(() => import("./pages/StaticPages").then((m) => ({ default: m.Docs })));

/** Simple loading shell shown while a route chunk fetches. */
function RouteLoading() {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      color: "var(--fg-muted, #888)",
      fontSize: 14,
    }}>
      <span>Ачаалж байна…</span>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}

function Shell() {
  const location = useLocation();
  // Hide footer on app routes (the hydraulic editor should be full-bleed)
  const hideFooter = location.pathname.startsWith("/app/") || location.pathname.startsWith("/shared/");
  // Home page has its own header; skip global Navbar
  const isHome = location.pathname === "/";

  return (
    <>
      <IconDefs />
      {!isHome && <Navbar />}
      <main>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/about" element={<About />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/docs" element={<Docs />} />

            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/import-zulu"
              element={
                <ProtectedRoute>
                  <ImportZulu />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/import-dxf"
              element={
                <ProtectedRoute>
                  <ImportDxf />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/new"
              element={
                <ProtectedRoute>
                  <HydraulicApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/:id"
              element={
                <ProtectedRoute>
                  <HydraulicApp />
                </ProtectedRoute>
              }
            />
            <Route path="/shared/:token" element={<SharedView />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {!hideFooter && !isHome && <Footer />}
    </>
  );
}
