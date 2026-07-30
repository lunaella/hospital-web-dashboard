import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import { api } from "../lib/apiClient";

const imgVector2 = "https://www.figma.com/api/mcp/asset/05e71480-622d-4ace-8429-68c10fb260b9";
const imgEllipse54 = "https://www.figma.com/api/mcp/asset/98df5025-d8c9-4be7-b57b-213f0507b011";
const imgEllipse55 = "https://www.figma.com/api/mcp/asset/9e60c02d-fb58-44e6-acd8-6a684b7da4e3";
const imgVector3 = "https://www.figma.com/api/mcp/asset/e5295954-58e8-4d17-98b0-939a725a4874";
const imgGroup3 = "https://www.figma.com/api/mcp/asset/5cbed700-2dd2-4d2d-9470-58c116f5a2d9";
const imgVector4 = "https://www.figma.com/api/mcp/asset/4258f374-7d71-4553-b151-8ca49e005143";
const imgGroup4 = "https://www.figma.com/api/mcp/asset/d5c51899-0327-4752-b340-93fbd1e0ba98";
const imgGroup5 = "https://www.figma.com/api/mcp/asset/729d32a7-fdc8-4e32-a9fb-42a95fb78994";
const imgVector5 = "https://www.figma.com/api/mcp/asset/a5ce2ada-bfd4-45b2-959c-ea404768c811";
const imgVector6 = "https://www.figma.com/api/mcp/asset/06fd37b2-fd44-4e70-8e2d-3fe15832cc5e";

// Static per-tile chrome; values come from GET /api/settings/session.
const SESSION_TILE_META = [
  { key: "engine", label: "ENGINE", icon: imgGroup4 },
  { key: "system", label: "SYSTEM", icon: imgGroup5 },
  { key: "network", label: "NETWORK IP", icon: imgVector5 },
  { key: "region", label: "REGION", icon: imgVector6 },
];

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// Field label helper — keeps the "space after the heading" consistent
// everywhere instead of hand-tuned pixel offsets per field.
function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="font-poppins font-medium text-[15px] text-black tracking-wide">{label}</label>
      {children}
      {hint && <p className="italic font-poppins text-[11px] text-[#808080]">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saveMessage, setSaveMessage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);

  const contentRef = useRef(null);
  const [pageHeight, setPageHeight] = useState(1024);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [me, activeSession] = await Promise.all([
          api.get("/api/auth/me"),
          api.get("/api/settings/session"),
        ]);
        if (cancelled) return;
        setProfile(me);
        setEmail(me.email);
        setSession(activeSession);
      } catch (err) {
        if (!cancelled) setSaveMessage({ type: "error", text: `Couldn't load profile: ${err.message}` });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    function measure() {
      setPageHeight(120 + el.scrollHeight + 24);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [saveMessage]);

  async function handleSave(e) {
    e.preventDefault();

    if (currentPassword || newPassword || confirmPassword) {
      if (!currentPassword) {
        setSaveMessage({ type: "error", text: "Enter your current password to change it." });
        return;
      }
      if (newPassword.length < 16) {
        setSaveMessage({ type: "error", text: "New password must be at least 16 characters." });
        return;
      }
      if (newPassword !== confirmPassword) {
        setSaveMessage({ type: "error", text: "New password and confirmation do not match." });
        return;
      }
    }

    setIsSaving(true);
    try {
      if (profile && email !== profile.email) {
        const updated = await api.patch("/api/settings/email", { email });
        setProfile(updated);
      }
      if (currentPassword || newPassword || confirmPassword) {
        await api.patch("/api/settings/password", { currentPassword, newPassword });
      }
      setSaveMessage({ type: "success", text: "Credentials updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setSaveMessage({ type: "error", text: err.message });
    } finally {
      setIsSaving(false);
    }
  }

  const sessionTiles = SESSION_TILE_META.map((meta) => ({
    ...meta,
    value:
      {
        engine: session?.engine,
        system: session?.system,
        network: session?.ipAddress,
        region: session?.region,
      }[meta.key] ?? "--",
  }));

  return (
    <div className="bg-white relative w-[1440px] mx-auto font-poppins" style={{ height: pageHeight }}>

      {/* Header bar */}
      <PageHeader title="Administrative Controls" />

      {/* Main content */}
      <div ref={contentRef} className="absolute left-[312px] top-[120px] w-[945px]">
        <div className="flex flex-col gap-2 w-[800px]">
          <h1 className="font-poppins font-bold text-[23px] text-black">System Settings</h1>
          <p className="font-poppins font-semibold text-[17px] text-[#808080]">
            Configure administrative identities, update authentication and security protocols, and manage active system sessions.
          </p>
        </div>

        <div className="mt-[45px] flex flex-col gap-1.5 w-[616px]">
          <h2 className="font-poppins font-semibold text-[20px] text-black">Administrative Identity</h2>
          <p className="font-poppins font-semibold text-[15px] text-[#808080]">
            Manage the primary authentication credentials for this high-privilage account.
          </p>
        </div>

        {/* Account Credentials card */}
        <form
          onSubmit={handleSave}
          className="mt-8 bg-white rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[816px] overflow-hidden"
        >
          <div className="bg-[#f7f5f5] px-8 py-6 flex items-center gap-4">
            <div className="bg-[#f1dddc] rounded-[5px] w-[56px] h-[52px] flex items-center justify-center shrink-0">
              <img alt="" className="w-6 h-6" src={imgVector2} />
            </div>
            <div>
              <p className="font-poppins font-medium text-[20px] text-black">Account Credentials</p>
              <p className="mt-1 flex items-center gap-2 font-poppins font-semibold text-[15px] text-[#808080]">
                <img alt="" className="w-2 h-2" src={imgEllipse54} />
                {session
                  ? `Last login from ${session.region ?? "unknown region"}    ${formatRelativeTime(session.createdAt)}`
                  : "Loading session info..."}
              </p>
            </div>
          </div>

          <div className="px-8 py-8 flex flex-col gap-8">
            <div className="grid grid-cols-2 gap-x-10 gap-y-8">
              <Field label="SYSTEM USERNAME" hint="Username is immutable for system level accounts.">
                <div className="bg-[#d9d9d9] rounded-[10px] w-full h-[40px] flex items-center px-4">
                  <span className="font-poppins text-[15px] text-[#aaa4a0]">{profile?.username ?? "--"}</span>
                </div>
              </Field>

              <Field label="CLEARANCE LEVEL" hint="Inherited from the system architect group">
                <div className="bg-[rgba(225,32,53,0.25)] rounded-[10px] w-full h-[40px] flex items-center px-4 gap-2">
                  <img alt="" className="w-4 h-4" src={imgVector3} />
                  <span className="font-poppins font-medium text-[15px] text-[#fa0000] tracking-wide">
                    {profile?.clearance ?? "--"}
                  </span>
                </div>
              </Field>
            </div>

            <Field label="PRIMARY ADMIN EMAIL">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-[#aaa4a0] rounded-[10px] w-full h-[40px] px-4 font-poppins text-[15px] text-black outline-none"
              />
            </Field>

            <hr className="border-t border-[#efeeed]" />

            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-2">
                <img alt="" className="w-2 h-2" src={imgEllipse55} />
                <p className="font-poppins font-medium text-[16px] text-black tracking-wide">SECURITY PROTOCOL UPDATE</p>
              </div>

              <div className="max-w-[286px]">
                <Field label="Current System Password">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="border border-[#aaa4a0] rounded-[10px] w-full h-[40px] px-4 font-poppins text-[15px] text-black outline-none"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-x-10 gap-y-8">
                <Field label="Create New Password">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 16 characters required"
                    className="border border-[#aaa4a0] rounded-[10px] w-full h-[40px] px-4 font-poppins text-[15px] text-[#aaa4a0] outline-none"
                  />
                </Field>

                <Field label="Confirm New Password">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter to verify"
                    className="border border-[#aaa4a0] rounded-[10px] w-full h-[40px] px-4 font-poppins text-[15px] text-[#aaa4a0] outline-none"
                  />
                </Field>
              </div>
            </div>

            <hr className="border-t border-[#efeeed]" />

            <div className="flex items-center justify-between gap-4">
              {saveMessage ? (
                <p
                  className={`font-poppins font-semibold text-[13px] ${
                    saveMessage.type === "success" ? "text-[#4c8c4a]" : "text-[#d70b07]"
                  }`}
                >
                  {saveMessage.text}
                </p>
              ) : (
                <span />
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="shrink-0 bg-[#ad2b21] rounded-[16px] w-[203px] h-[49px] flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
              >
                <span className="font-poppins font-bold text-[17px] text-white">
                  {isSaving ? "Saving..." : "Save Credentials"}
                </span>
              </button>
            </div>
          </div>
        </form>

        {/* Session & Environmental Security */}
        <h2 className="mt-10 font-poppins font-semibold text-[20px] text-black">Session &amp; Environmental Security</h2>
        <div className="mt-4 bg-white rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[816px] p-6">
          <div className="flex items-center gap-4 pb-4 mb-6 border-b border-[#efeeed]">
            <div className="bg-[#f1dddc] rounded-[5px] w-[56px] h-[52px] flex items-center justify-center shrink-0">
              <img alt="" className="w-6 h-6" src={imgGroup3} />
            </div>
            <p className="font-poppins font-medium text-[20px] text-black">Active Terminal Session</p>
          </div>

          <div className="flex gap-6 items-start">
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="border border-[#808080] rounded-[10px] h-[19px] px-3 flex items-center justify-center font-poppins font-bold text-[10px] text-black whitespace-nowrap">
                  Active Now
                </span>
                <p className="font-poppins font-medium text-[15px] text-black">
                  Established Session ID: {session?.sessionCode ?? "--"}
                </p>
              </div>
              <div className="flex gap-3">
                {sessionTiles.map((info) => (
                  <div key={info.key} className="bg-[#d9d9d9] rounded-[13px] w-[115px] h-[70px] px-3 pt-3">
                    <img alt="" className="w-4 h-4 mb-1" src={info.icon} />
                    <p className="font-poppins font-semibold text-[12px] text-black tracking-wide">{info.label}</p>
                    <p className="font-poppins text-[12px] text-black">{info.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="w-px self-stretch bg-[#d9d9d9]" />

            <div className="w-[231px] flex flex-col gap-3">
              <p className="font-poppins font-medium text-[12px] text-[#d80b07] tracking-wide">DANGER ZONE</p>
              <button
                type="button"
                onClick={() => navigate("/logout-confirmation", { state: { backgroundLocation: location } })}
                className="border-[1.5px] border-[#ce4444] rounded-[16px] w-full h-[49px] flex items-center justify-center cursor-pointer"
              >
                <span className="font-poppins font-bold text-[17px] text-[#d70b07]">Logout of Session</span>
              </button>
              <p className="flex items-start gap-1.5 font-poppins text-[11px] text-[#808080]">
                <img alt="" className="w-3 h-3 mt-0.5 shrink-0" src={imgVector4} />
                Terminating this session will immediately invalidate your JWT and clear all storage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
