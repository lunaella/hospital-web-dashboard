import { useAuth } from "../context/AuthContext";
import { IconLock } from "./icons";

// Wraps a whole page's route (see App.jsx) and only mounts it if the logged-
// in admin has at least 'view' access to that Team Access section — a
// missing/'none' permission renders a placeholder instead, so a restricted
// admin sees a clear reason why the page is empty instead of a page that
// tries to load and silently 403s on every request.
//
// While the admin's own permissions are still loading (first paint after a
// hard refresh, before GET /api/auth/me resolves) this renders nothing
// rather than flashing "Access Restricted" and then the real page a moment
// later.
export default function SectionGuard({ section, children }) {
  const { permissions, loading } = useAuth();

  if (loading) return null;

  if (permissions[section] === "none") {
    return (
      <div className="min-h-[600px] flex items-center justify-center px-8">
        <div className="max-w-[420px] flex flex-col items-center text-center gap-4">
          <div className="w-[64px] h-[64px] rounded-full bg-[#f1dddc] flex items-center justify-center">
            <IconLock className="w-7 h-7 text-[#ad2b21]" />
          </div>
          <h2 className="font-poppins font-bold text-[22px] text-black">Access Restricted</h2>
          <p className="font-poppins font-medium text-[14px] text-[#808080] leading-relaxed">
            You don't have permission to view this section. If you need access, ask your ResQ team manager to
            grant it from Settings &gt; Team Access.
          </p>
        </div>
      </div>
    );
  }

  return children;
}
