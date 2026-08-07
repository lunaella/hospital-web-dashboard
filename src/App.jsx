import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import { HospitalProvider } from "./context/HospitalContext";
import { AuthProvider } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import SectionGuard from "./components/SectionGuard";
import Login from "./pages/Login";
import LoginFailed from "./pages/LoginFailed";
import Dashboard from "./pages/Dashboard";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import LogoutConfirmation from "./pages/LogoutConfirmation";
import DonorManagement from "./pages/DonorManagement";
import ViewBDPage from "./pages/ViewBDPage";
import NewBDPage from "./pages/NewBDPage";

// Routes that are meant to appear as an overlay/modal on top of whatever page
// triggered them (e.g. clicking "+ New Broadcast" on the Dashboard should show
// the Dashboard dimmed behind the modal, not navigate away from it). When a
// caller navigates here via `navigate(path, { state: { backgroundLocation } })`,
// the "background" route stays mounted and this second <Routes> renders the
// modal on top of it. Visiting one of these paths directly (e.g. a refresh, or
// no backgroundLocation state) falls back to rendering it as a normal full page.
const MODAL_ROUTES = (
  <>
    <Route path="/logout-confirmation" element={<LogoutConfirmation />} />
    <Route
      path="/view-broadcasts"
      element={
        <AppShell>
          <SectionGuard section="broadcasts">
            <ViewBDPage />
          </SectionGuard>
        </AppShell>
      }
    />
    <Route path="/new-broadcast" element={<NewBDPage />} />
  </>
);

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/login-failed" element={<LoginFailed />} />
        <Route
          path="/dashboard"
          element={
            <AppShell>
              <SectionGuard section="dashboard">
                <Dashboard />
              </SectionGuard>
            </AppShell>
          }
        />
        <Route
          path="/reports"
          element={
            <AppShell>
              <SectionGuard section="reports">
                <Reports />
              </SectionGuard>
            </AppShell>
          }
        />
        {/* Settings itself is always reachable (self-service account/session
            management applies to every admin); the cards inside it that are
            real administrative capabilities — Hospital Network, Data Import,
            Team Access — gate themselves individually. */}
        <Route path="/settings" element={<AppShell><Settings /></AppShell>} />
        <Route
          path="/donor-management"
          element={
            <AppShell>
              <SectionGuard section="donor_management">
                <DonorManagement />
              </SectionGuard>
            </AppShell>
          }
        />
        {MODAL_ROUTES}
      </Routes>

      {backgroundLocation && <Routes>{MODAL_ROUTES}</Routes>}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HospitalProvider>
          <AppRoutes />
        </HospitalProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
