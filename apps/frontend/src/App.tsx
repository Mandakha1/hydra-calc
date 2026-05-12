import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Navbar } from "./components/layout/Navbar";
import { Footer } from "./components/layout/Footer";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { IconDefs } from "./design/IconDefs";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { ForgotPassword } from "./pages/ForgotPassword";
import { Dashboard } from "./pages/Dashboard";
import { HydraulicApp } from "./pages/HydraulicApp";
import { SharedView } from "./pages/SharedView";
import { NotFound } from "./pages/NotFound";
import { About, Pricing, Docs } from "./pages/StaticPages";
import { ImportZulu } from "./pages/ImportZulu";
import { ImportDxf } from "./pages/ImportDxf";

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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot" element={<ForgotPassword />} />
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
      </main>
      {!hideFooter && !isHome && <Footer />}
    </>
  );
}
