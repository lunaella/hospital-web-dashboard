import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import ScaleToFit from "./components/ScaleToFit";
import Login from "./pages/Login";
import LoginFailed from "./pages/LoginFailed";
import Dashboard from "./pages/Dashboard";
import DashboardNew from "./pages/DashboardNew";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import LogoutConfirmation from "./pages/LogoutConfirmation";
import DonorManagement from "./pages/DonorManagement";
import BDConfirm from "./pages/BDConfirm";
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
    <Route path="/bd-confirm" element={<BDConfirm />} />
    <Route path="/view-broadcasts" element={<ScaleToFit><ViewBDPage /></ScaleToFit>} />
    <Route path="/new-broadcast" element={<NewBDPage />} />
  </>
);

function AppRoutes() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation || location}>
        <Route path="/" element={<ScaleToFit><Login /></ScaleToFit>} />
        <Route path="/login" element={<ScaleToFit><Login /></ScaleToFit>} />
        <Route path="/login-failed" element={<ScaleToFit><LoginFailed /></ScaleToFit>} />
        <Route path="/dashboard" element={<ScaleToFit><Dashboard /></ScaleToFit>} />
        <Route path="/dashboard-new" element={<ScaleToFit><DashboardNew /></ScaleToFit>} />
        <Route path="/reports" element={<ScaleToFit><Reports /></ScaleToFit>} />
        <Route path="/settings" element={<ScaleToFit><Settings /></ScaleToFit>} />
        <Route path="/donor-management" element={<ScaleToFit><DonorManagement /></ScaleToFit>} />
        {MODAL_ROUTES}
      </Routes>

      {backgroundLocation && <Routes>{MODAL_ROUTES}</Routes>}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
