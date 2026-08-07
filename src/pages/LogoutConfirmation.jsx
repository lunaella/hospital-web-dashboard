import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, clearToken } from "../lib/apiClient";
import { IconLogout, IconX } from "../components/icons";
import { useAuth } from "../context/AuthContext";

// Confirmation modal shown when an admin attempts to end their session.
// Intended to be rendered on top of whatever page triggered it (e.g. Settings),
// so it only implements the dialog + dimmed backdrop, not the page behind it.
export default function LogoutConfirmation() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [isEnding, setIsEnding] = useState(false);

  function handleCancel() {
    navigate(-1);
  }

  async function handleConfirm() {
    setIsEnding(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      // Even if the server call fails (e.g. already expired), still clear
      // the local token and send the admin back to login.
    } finally {
      clearToken();
      await refreshProfile(); // clears the cached permissions/profile now that the token is gone
      navigate("/login");
    }
  }

  return (
    <div className="fixed inset-0 z-50 font-poppins">
      <div
        className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]"
        onClick={handleCancel}
        aria-hidden="true"
      />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[25px] w-[653px] max-w-[95vw] h-[370px] max-h-[95vh] shadow-[0px_17px_38px_0px_rgba(0,0,0,0.1)]">
        <button
          type="button"
          onClick={handleCancel}
          aria-label="Close"
          className="absolute right-[24px] top-[24px] cursor-pointer"
        >
          <IconX className="w-5 h-5 text-[#808080]" />
        </button>

        <div className="absolute left-[41px] top-[57px] w-[66px] h-[58px]">
          <div className="absolute inset-0 rounded-full bg-[#f1dddc]" />
          <IconLogout className="absolute left-[22px] top-[16px] w-[22px] h-[26px] text-[#ad2b21]" />
        </div>

        <h2 className="absolute left-[41px] top-[139px] font-poppins font-bold text-[25px] text-black">
          End Admin Session?
        </h2>

        <p className="absolute left-[41px] top-[180px] w-[571px] font-poppins font-semibold text-[17px] text-[#808080] leading-normal">
          Are you sure you want to end your current session? This will immediately clear your JWT from
          local storage and redirect you to login page.
        </p>

        <button
          type="button"
          onClick={handleCancel}
          className="absolute left-[225px] top-[296px] border-2 border-[#d9d9d9] rounded-[16px] w-[180px] h-[49px] flex items-center justify-center cursor-pointer"
        >
          <span className="font-poppins font-bold text-[17px] text-black">Cancel</span>
        </button>

        <button
          type="button"
          onClick={handleConfirm}
          disabled={isEnding}
          className="absolute left-[418px] top-[296px] bg-[#ad2b21] rounded-[16px] w-[203px] h-[49px] flex items-center justify-center cursor-pointer disabled:cursor-wait disabled:opacity-70"
        >
          <span className="font-poppins font-bold text-[17px] text-white">
            {isEnding ? "Logging out..." : "Confirm Logout"}
          </span>
        </button>
      </div>
    </div>
  );
}
