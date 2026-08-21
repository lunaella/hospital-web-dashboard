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
  const { permissions, loading, profileError, refreshProfile } = useAuth();

  if (loading) return null;

  // The /me fetch itself failed (after AuthContext's own retry) rather than
  // the admin genuinely having 'none' on this section — permissions default
  // to empty either way, so without this check a transient network/server
  // hiccup right after login looked identical to a real restriction, with
  // no way to tell the difference or recover besides a manual hard refresh.
  if (profileError) {
    return (
      <div className="min-h-[600px] flex items-center justify-center px-8">
        <div className="max-w-[420px] flex flex-col items-center text-center gap-4">
          <div className="w-[64px] h-[64px] rounded-full bg-[#f1dddc] flex items-center justify-center">
            <IconLock className="w-7 h-7 text-[#9B1B20]" />
          </div>
          <h2 className="font-poppins font-bold text-[22px] text-black">Couldn't verify your access</h2>
          <p className="font-poppins font-medium text-[14px] text-[#808080] leading-relaxed">
            We couldn't reach the ResQ server to check your permissions. This usually clears up on its own —
            try again, or check that the API is running.
          </p>
          <button
            type="button"
            onClick={refreshProfile}
            className="mt-1 bg-[#9B1B20] rounded-[16px] h-[44px] px-6 flex items-center justify-center cursor-pointer hover:bg-[#8B1218] transition-colors"
          >
            <span className="font-poppins font-bold text-[14px] text-white">Try again</span>
          </button>
        </div>
      </div>
    );
  }

  if (permissions[section] === "none") {
    return (
      <div className="min-h-[600px] flex items-center justify-center px-8">
        <div className="max-w-[420px] flex flex-col items-center text-center gap-4">
          <div className="w-[64px] h-[64px] rounded-full bg-[#f1dddc] flex items-center justify-center">
            <IconLock className="w-7 h-7 text-[#9B1B20]" />
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
