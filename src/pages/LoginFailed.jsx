import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api, setToken } from "../lib/apiClient";

import resqLogo from "../assets/resq-logo.png";

const imgResQLogo = resqLogo;

// Mirrors Login.jsx's fluid layout exactly, plus the error banner. See the
// comment at the top of Login.jsx for why this is a responsive flex layout
// (min-h-screen + flex row/column) instead of a fixed 1440x1024 canvas
// scaled to fit the window.
export default function LoginFailed() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(location.state?.error || "Invalid username or password.");

  async function handleLogin(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await api.post("/api/auth/login", { username, password });
      setToken(data.token);
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden font-poppins flex flex-col"
      style={{ background: "radial-gradient(circle at 50% 50%, #d94636 0%, #a8241d 40%, #1e0504 100%)" }}
    >
      <div className="relative z-10 flex-1 w-full max-w-[1320px] mx-auto flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16 px-6 sm:px-10 lg:px-12 py-14">
        <div className="flex flex-col gap-6 w-full max-w-xl lg:flex-1">
          <div className="flex items-center gap-4">
            <div className="relative h-[86px] w-[113px] shrink-0">
              <img alt="" className="block w-full h-full object-contain" src={imgResQLogo} />
            </div>
            <div className="h-[42px] w-[1.5px] bg-[rgba(255,255,255,0.25)] shrink-0" />
            <p className="font-poppins font-semibold text-[13px] text-[rgba(255,255,255,0.85)] tracking-[0.2em] whitespace-nowrap">
              ADMIN PORTAL
            </p>
          </div>

          <p className="font-poppins font-extrabold uppercase text-[40px] sm:text-[52px] lg:text-[64px] leading-[0.95] tracking-tight text-white">
            Connect. Save Lives.
            <br />
            On Time.
          </p>

          <p className="font-poppins font-medium text-[14px] leading-[1.6] text-[rgba(255,255,255,0.85)] max-w-md">
            ResQ's hospital coordination portal — real-time broadcasts,
            eligibility tracking, and delivery confirmations.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="w-full max-w-[440px] shrink-0 bg-[rgba(255,255,255,0.12)] backdrop-blur-md border border-[rgba(255,255,255,0.25)] rounded-[20px] p-8 flex flex-col gap-5"
        >
          <p className="font-poppins font-bold text-[22px] text-white">Log in to ResQ</p>

          <div className="flex flex-col gap-2">
            <label className="font-poppins font-semibold text-[12px] tracking-wide text-[rgba(255,255,255,0.8)]">
              YOUR USERNAME
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[rgba(255,255,255,0.9)] h-[44px] rounded-[10px] pl-4 pr-10 outline-none font-poppins text-[14px] text-black"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] pointer-events-none">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-poppins font-semibold text-[12px] tracking-wide text-[rgba(255,255,255,0.8)]">
              YOUR PASSWORD
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[rgba(255,255,255,0.9)] h-[44px] rounded-[10px] pl-4 pr-10 outline-none font-poppins text-[14px] text-black"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a8a8a] hover:text-black cursor-pointer"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a3 3 0 004.24 4.24" />
                    <path d="M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 7 11 7a13.16 13.16 0 01-3.22 3.94M6.1 6.1A13.16 13.16 0 001 11s4 7 11 7a10.94 10.94 0 004.9-1.14" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-[14px] h-[14px]"
            />
            <span className="font-poppins text-[12px] text-[rgba(255,255,255,0.8)]">Remember me</span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-[48px] bg-[#9B1B20] hover:bg-[#8B1218] disabled:cursor-wait disabled:opacity-70 transition-colors rounded-[10px] flex items-center justify-center cursor-pointer"
          >
            <span className="font-poppins font-bold text-[15px] text-white">
              {isSubmitting ? "Signing in..." : "Log in"}
            </span>
          </button>

          <p className="font-poppins font-medium text-[13px] text-[#ffb4b0]">{error}</p>
        </form>
      </div>
    </div>
  );
}
