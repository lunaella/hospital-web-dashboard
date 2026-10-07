import { Link } from "react-router-dom";
import { useState } from "react";
import { api } from "../lib/apiClient";

import resqLogo from "../assets/resq-logo.png";

const MIN_PASSWORD_LENGTH = 8; // keep in sync with auth.controller.js resetPassword

const inputClass =
  "w-full bg-[rgba(255,255,255,0.9)] h-[44px] rounded-[10px] px-4 outline-none font-poppins text-[14px] text-black";
const labelClass = "font-poppins font-semibold text-[12px] tracking-wide text-[rgba(255,255,255,0.8)]";

// Self-service password reset, in three steps on one card:
//   1. "request" — enter username, server emails a 6-digit code
//   2. "reset"   — enter that code + a new password
//   3. "done"    — success, back to login
// Same background/card look as Login.jsx so it reads as part of that flow.
export default function ForgotPassword() {
  const [step, setStep] = useState("request");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function requestCode(e) {
    e?.preventDefault();
    if (!username.trim()) {
      setError("Enter your username.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const data = await api.post("/api/auth/forgot-password", { username: username.trim() });
      setNotice(data.message);
      setStep("reset");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post("/api/auth/reset-password", { username: username.trim(), code: code.trim(), newPassword });
      setStep("done");
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
      <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center gap-8 px-6 py-14">
        <div className="flex items-center gap-4">
          <div className="relative h-[64px] w-[84px] shrink-0">
            <img alt="" className="block w-full h-full object-contain" src={resqLogo} />
          </div>
          <div className="h-[32px] w-[1.5px] bg-[rgba(255,255,255,0.25)] shrink-0" />
          <p className="font-poppins font-semibold text-[13px] text-[rgba(255,255,255,0.85)] tracking-[0.2em] whitespace-nowrap">
            ADMIN PORTAL
          </p>
        </div>

        <form
          onSubmit={step === "request" ? requestCode : submitReset}
          className="w-full max-w-[440px] bg-[rgba(255,255,255,0.12)] backdrop-blur-md border border-[rgba(255,255,255,0.25)] rounded-[20px] p-8 flex flex-col gap-5"
        >
          <p className="font-poppins font-bold text-[22px] text-white">
            {step === "done" ? "Password updated" : "Reset your password"}
          </p>

          {step === "request" && (
            <>
              <p className="font-poppins text-[13px] leading-[1.6] text-[rgba(255,255,255,0.8)]">
                Enter your username and we'll email a 6-digit reset code to the address on your account.
              </p>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>YOUR USERNAME</label>
                <input
                  type="text"
                  autoFocus
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={inputClass}
                />
              </div>
            </>
          )}

          {step === "reset" && (
            <>
              <p className="font-poppins text-[13px] leading-[1.6] text-[rgba(255,255,255,0.8)]">
                {notice} The code is for <span className="font-semibold text-white">{username.trim()}</span> and
                expires in 10 minutes.
              </p>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>RESET CODE</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className={`${inputClass} tracking-[0.4em] text-center font-semibold`}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>NEW PASSWORD</label>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>CONFIRM NEW PASSWORD</label>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="w-[14px] h-[14px]"
                />
                <span className="font-poppins text-[12px] text-[rgba(255,255,255,0.8)]">Show passwords</span>
              </label>
            </>
          )}

          {step === "done" && (
            <p className="font-poppins text-[13px] leading-[1.6] text-[rgba(255,255,255,0.85)]">
              Your password has been changed and any other sessions on this account were signed out. Log in with
              your new password.
            </p>
          )}

          {error && (
            <p role="alert" className="font-poppins text-[13px] text-white bg-[rgba(0,0,0,0.25)] rounded-[8px] px-3 py-2">
              {error}
            </p>
          )}

          {step === "done" ? (
            <Link
              to="/login"
              className="w-full h-[48px] bg-[#9B1B20] hover:bg-[#8B1218] transition-colors rounded-[10px] flex items-center justify-center"
            >
              <span className="font-poppins font-bold text-[15px] text-white">Back to log in</span>
            </Link>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-[48px] bg-[#9B1B20] hover:bg-[#8B1218] disabled:cursor-wait disabled:opacity-70 transition-colors rounded-[10px] flex items-center justify-center cursor-pointer"
            >
              <span className="font-poppins font-bold text-[15px] text-white">
                {step === "request"
                  ? isSubmitting ? "Sending code..." : "Send reset code"
                  : isSubmitting ? "Updating..." : "Set new password"}
              </span>
            </button>
          )}

          {step !== "done" && (
            <div className="flex items-center justify-between">
              <Link to="/login" className="font-poppins text-[12px] text-[rgba(255,255,255,0.8)] hover:text-white underline">
                Back to log in
              </Link>
              {step === "reset" && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => requestCode()}
                  className="font-poppins text-[12px] text-[rgba(255,255,255,0.8)] hover:text-white underline cursor-pointer"
                >
                  Resend code
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
