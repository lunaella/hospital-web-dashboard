import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import TeamAccessCard from "../components/TeamAccessCard";
import { api, apiUploadFile } from "../lib/apiClient";
import { useHospital } from "../context/HospitalContext";
import { DIRECTORY_CITIES, hospitalsForCity } from "../data/hospitalDirectory";
import {
  IconIdCard,
  IconShield,
  IconTerminal,
  IconInfoCircle,
  IconCpu,
  IconMonitor,
  IconWifi,
  IconMapPin,
  IconDroplet,
  IconDownload,
  IconCheckCircle,
} from "../components/icons";

// Column headers each import type expects — used both for the downloadable
// blank template and as a hint in the UI. The backend actually matches
// headers case/whitespace-insensitively (see server/src/utils/importHelpers.js),
// so a real hospital spreadsheet doesn't have to match this exactly.
const IMPORT_TYPES = [
  {
    key: "donors",
    label: "Donors",
    endpoint: "/api/import/donors",
    needsHospital: false,
    template: ["Name", "Phone", "Email", "Blood Type", "Last Donation Date"],
  },
  {
    key: "inventory",
    label: "Inventory",
    endpoint: "/api/import/inventory",
    needsHospital: true,
    template: ["Blood Type", "Units Available", "Critical Threshold", "Low Threshold"],
  },
  {
    key: "requests",
    label: "Blood Requests",
    endpoint: "/api/import/requests",
    needsHospital: true,
    template: ["Blood Type", "Priority", "Ward", "Units Needed", "Units Fulfilled", "Created At"],
  },
  {
    key: "appointments",
    label: "Appointments",
    endpoint: "/api/import/appointments",
    needsHospital: true,
    template: ["Phone", "Scheduled At", "Status"],
  },
];

// Static per-tile chrome; values come from GET /api/settings/session.
const SESSION_TILE_META = [
  { key: "engine", label: "ENGINE", icon: IconCpu },
  { key: "system", label: "SYSTEM", icon: IconMonitor },
  { key: "network", label: "NETWORK IP", icon: IconWifi },
  { key: "region", label: "REGION", icon: IconMapPin },
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

const EMPTY_HOSPITAL_FORM = { name: "", code: "", city: "", address: "", latitude: "", longitude: "", appointmentCapacity: "5" };

function inputClass() {
  return "border border-[#aaa4a0] rounded-[10px] w-full h-[40px] px-4 font-poppins text-[15px] text-black outline-none";
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

  const { hospitalId, hospitals, refreshHospitals, setHospitalId } = useHospital();
  const [showHospitalForm, setShowHospitalForm] = useState(false);
  const [editingHospitalId, setEditingHospitalId] = useState(null);
  const [hospitalForm, setHospitalForm] = useState(EMPTY_HOSPITAL_FORM);
  const [hospitalFormError, setHospitalFormError] = useState(null);
  const [confirmDeleteHospitalId, setConfirmDeleteHospitalId] = useState(null);
  const [hospitalDeleteError, setHospitalDeleteError] = useState(null);
  const [hospitalDeleting, setHospitalDeleting] = useState(false);

  const [thresholdRows, setThresholdRows] = useState([]);
  const [thresholdsError, setThresholdsError] = useState(null);
  const [editingType, setEditingType] = useState(null);
  const [thresholdForm, setThresholdForm] = useState({ critical: "", low: "" });
  const [thresholdRowError, setThresholdRowError] = useState(null);
  const [savingType, setSavingType] = useState(null);
  const [hospitalFormSaving, setHospitalFormSaving] = useState(false);

  const [importType, setImportType] = useState("donors");
  // Which hospital an import lands in — a dedicated choice inside this card
  // rather than silently following the global switcher at the top of the
  // app, so switching hospitals to check something else while this card is
  // open can't accidentally point an import at the wrong one. Pre-filled
  // from whatever's currently selected up top purely as a convenience
  // default; changing it here doesn't touch the global switcher.
  const [importHospitalId, setImportHospitalId] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);

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

  // Inventory Thresholds: only meaningful for one specific hospital at a
  // time (there's no single row to edit for the "All Hospitals" aggregate),
  // so this refetches whenever the switcher changes and just clears the
  // list when "all" is selected instead of fetching. Pulled out as its own
  // function (not just inline in an effect) so a successful inventory
  // import can also trigger a refresh once it's done.
  async function refreshThresholds() {
    if (hospitalId === "all") {
      setThresholdRows([]);
      return;
    }
    try {
      const rows = await api.get("/api/dashboard/stock");
      setThresholdRows(rows);
    } catch (err) {
      setThresholdsError(err.message);
    }
  }

  useEffect(() => {
    refreshThresholds();
  }, [hospitalId]);

  // Default the import destination to whatever's currently selected in the
  // global switcher, once — purely a convenience starting point. Only fires
  // while nothing's been chosen yet, so it won't clobber a deliberate choice
  // made inside the import card, and it skips "all" since that was never a
  // valid import destination.
  useEffect(() => {
    if (!importHospitalId && hospitalId && hospitalId !== "all") {
      setImportHospitalId(hospitalId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitalId]);

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
  }, [
    saveMessage,
    showHospitalForm,
    hospitalFormError,
    hospitals,
    thresholdRows,
    editingType,
    thresholdRowError,
    importResult,
    importError,
  ]);

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

  function openAddHospital() {
    setEditingHospitalId(null);
    setHospitalForm(EMPTY_HOSPITAL_FORM);
    setHospitalFormError(null);
    setShowHospitalForm(true);
  }

  function openEditHospital(hospital) {
    setEditingHospitalId(hospital.id);
    setHospitalForm({
      name: hospital.name ?? "",
      code: hospital.code ?? "",
      city: hospital.city ?? "",
      address: hospital.address ?? "",
      latitude: hospital.latitude ?? "",
      longitude: hospital.longitude ?? "",
      appointmentCapacity: hospital.appointmentCapacity ?? "5",
    });
    setHospitalFormError(null);
    setShowHospitalForm(true);
  }

  function closeHospitalForm() {
    setShowHospitalForm(false);
    setEditingHospitalId(null);
    setHospitalForm(EMPTY_HOSPITAL_FORM);
    setHospitalFormError(null);
  }

  function updateHospitalField(key, value) {
    setHospitalForm((prev) => ({ ...prev, [key]: value }));
  }

  // City drives which hospitals show up in the Hospital Name dropdown
  // below — switching city clears the name, since whatever was picked for
  // the old city almost certainly isn't in the new one's list.
  function handleCityChange(city) {
    setHospitalForm((prev) => ({ ...prev, city, name: "" }));
  }

  // Picking a real hospital from the directory (src/data/hospitalDirectory.js)
  // auto-fills its known code/address — still editable afterward, this is
  // just a starting point, not a lock.
  function handleHospitalNameChange(name) {
    const match = hospitalsForCity(hospitalForm.city).find((h) => h.name === name);
    setHospitalForm((prev) => ({
      ...prev,
      name,
      code: match ? match.code : prev.code,
      address: match ? match.address : prev.address,
    }));
  }

  async function submitHospitalForm(e) {
    e.preventDefault();

    if (!hospitalForm.name.trim() || !hospitalForm.code.trim()) {
      setHospitalFormError("Name and code are required.");
      return;
    }

    setHospitalFormSaving(true);
    setHospitalFormError(null);
    try {
      if (editingHospitalId) {
        await api.patch(`/api/hospitals/${editingHospitalId}`, hospitalForm);
      } else {
        await api.post("/api/hospitals", hospitalForm);
      }
      await refreshHospitals();
      closeHospitalForm();
    } catch (err) {
      setHospitalFormError(err.message);
    } finally {
      setHospitalFormSaving(false);
    }
  }

  async function confirmDeleteHospital(id) {
    setHospitalDeleteError(null);
    setHospitalDeleting(true);
    try {
      await api.delete(`/api/hospitals/${id}`);
      // The hospital switcher can't be left pointed at a hospital that no
      // longer exists — every hospital-scoped GET would just come back
      // empty with no obvious explanation why.
      if (hospitalId === id) setHospitalId("all");
      setConfirmDeleteHospitalId(null);
      await refreshHospitals();
    } catch (err) {
      setHospitalDeleteError(err.message);
    } finally {
      setHospitalDeleting(false);
    }
  }

  function openEditThreshold(row) {
    setEditingType(row.type);
    setThresholdForm({ critical: String(row.criticalThreshold), low: String(row.lowThreshold) });
    setThresholdRowError(null);
  }

  function closeEditThreshold() {
    setEditingType(null);
    setThresholdRowError(null);
  }

  async function submitThreshold(e, bloodType) {
    e.preventDefault();

    const critical = Number(thresholdForm.critical);
    const low = Number(thresholdForm.low);
    if (!Number.isInteger(critical) || critical < 0 || !Number.isInteger(low) || low < 0) {
      setThresholdRowError("Both values must be whole numbers, 0 or higher.");
      return;
    }
    if (critical > low) {
      setThresholdRowError("Critical threshold can't be higher than the low threshold.");
      return;
    }

    setSavingType(bloodType);
    setThresholdRowError(null);
    try {
      const updated = await api.patch(`/api/dashboard/stock/${encodeURIComponent(bloodType)}`, {
        hospitalId,
        criticalThreshold: critical,
        lowThreshold: low,
      });
      setThresholdRows((prev) => prev.map((r) => (r.type === bloodType ? { ...r, ...updated } : r)));
      setEditingType(null);
    } catch (err) {
      setThresholdRowError(err.message);
    } finally {
      setSavingType(null);
    }
  }

  function downloadImportTemplate(type) {
    const meta = IMPORT_TYPES.find((t) => t.key === type);
    const csv = `${meta.template.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `resq-${type}-template.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function submitImport(e) {
    e.preventDefault();
    setImportError(null);
    setImportResult(null);

    const meta = IMPORT_TYPES.find((t) => t.key === importType);
    if (!importFile) {
      setImportError("Choose a .csv or .xlsx file first.");
      return;
    }
    if (meta.needsHospital && !importHospitalId) {
      setImportError("Select which hospital this data belongs to before importing.");
      return;
    }

    setImportSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (meta.needsHospital) formData.append("hospitalId", importHospitalId);
      const result = await apiUploadFile(meta.endpoint, formData);
      setImportResult(result);
      setImportFile(null);
      if (importType === "inventory") await refreshThresholds();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImportSubmitting(false);
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
              <IconIdCard className="w-6 h-6 text-[#ad2b21]" />
            </div>
            <div>
              <p className="font-poppins font-medium text-[20px] text-black">Account Credentials</p>
              <p className="mt-1 flex items-center gap-2 font-poppins font-semibold text-[15px] text-[#808080]">
                <span className="w-2 h-2 rounded-full bg-[#4c8c4a] shrink-0" />
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
                  <IconShield className="w-4 h-4 text-[#fa0000]" />
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
                <span className="w-2 h-2 rounded-full bg-[#ad2b21] shrink-0" />
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
              <IconTerminal className="w-6 h-6 text-[#ad2b21]" />
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
                {sessionTiles.map((info) => {
                  const TileIcon = info.icon;
                  return (
                    <div key={info.key} className="bg-[#d9d9d9] rounded-[13px] w-[115px] h-[70px] px-3 pt-3">
                      <TileIcon className="w-4 h-4 mb-1 text-black" />
                      <p className="font-poppins font-semibold text-[12px] text-black tracking-wide">{info.label}</p>
                      <p className="font-poppins text-[12px] text-black">{info.value}</p>
                    </div>
                  );
                })}
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
                <IconInfoCircle className="w-3 h-3 mt-0.5 shrink-0" />
                Terminating this session will immediately invalidate your JWT and clear all storage.
              </p>
            </div>
          </div>
        </div>

        {/* Hospital Network — a real administrative capability (not
            self-service like the cards above), so it's hidden entirely for
            an admin with 'none' on the settings section rather than shown
            in a way that would just 403 on every request. */}
        {profile && profile.permissions?.settings !== "none" && (
        <>
        <h2 className="mt-10 font-poppins font-semibold text-[20px] text-black">Hospital Network</h2>
        <p className="mt-1.5 font-poppins font-semibold text-[15px] text-[#808080] max-w-[616px]">
          Add or edit the hospitals this dashboard oversees. Appointments and inventory are scoped to
          whichever hospital a donor is routed to.
        </p>

        <div className="mt-4 bg-white rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[816px] overflow-hidden">
          <div className="bg-[#f7f5f5] px-8 py-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-[#f1dddc] rounded-[5px] w-[56px] h-[52px] flex items-center justify-center shrink-0">
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="#ad2b21"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 21V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" />
                  <path d="M9 21v-4h6v4" />
                  <path d="M12 7v6M9 10h6" />
                </svg>
              </div>
              <div>
                <p className="font-poppins font-medium text-[20px] text-black">Hospital Network</p>
                <p className="mt-1 font-poppins font-semibold text-[15px] text-[#808080]">
                  {hospitals.length} hospital{hospitals.length === 1 ? "" : "s"} registered
                </p>
              </div>
            </div>
            {!showHospitalForm && (
              <button
                type="button"
                onClick={openAddHospital}
                className="shrink-0 bg-[#ad2b21] rounded-[16px] h-[44px] px-6 flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors"
              >
                <span className="font-poppins font-bold text-[15px] text-white">+ Add Hospital</span>
              </button>
            )}
          </div>

          <div className="px-8 py-8">
            {showHospitalForm ? (
              <form onSubmit={submitHospitalForm} className="flex flex-col gap-8">
                <div className="grid grid-cols-2 gap-x-10 gap-y-8">
                  <Field label="CITY">
                    <select
                      value={hospitalForm.city}
                      onChange={(e) => handleCityChange(e.target.value)}
                      className={inputClass()}
                    >
                      <option value="" disabled>
                        Select a city...
                      </option>
                      {DIRECTORY_CITIES.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                      {/* Preserves an existing hospital's city on edit even if it's
                          outside the directory above (e.g. older seed data). */}
                      {hospitalForm.city && !DIRECTORY_CITIES.includes(hospitalForm.city) && (
                        <option value={hospitalForm.city}>{hospitalForm.city}</option>
                      )}
                    </select>
                  </Field>
                  <Field label="HOSPITAL NAME" hint={!hospitalForm.city ? "Select a city first" : undefined}>
                    <select
                      value={hospitalForm.name}
                      onChange={(e) => handleHospitalNameChange(e.target.value)}
                      className={inputClass()}
                      disabled={!hospitalForm.city}
                    >
                      <option value="" disabled>
                        {hospitalForm.city ? "Select a hospital..." : "Select a city first"}
                      </option>
                      {hospitalsForCity(hospitalForm.city).map((h) => (
                        <option key={h.name} value={h.name}>
                          {h.name}
                        </option>
                      ))}
                      {hospitalForm.name &&
                        !hospitalsForCity(hospitalForm.city).some((h) => h.name === hospitalForm.name) && (
                          <option value={hospitalForm.name}>{hospitalForm.name}</option>
                        )}
                    </select>
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-x-10 gap-y-8">
                  <Field label="CODE" hint="Short unique identifier, e.g. SLMC-QC — auto-filled when you pick a hospital, but editable">
                    <input
                      value={hospitalForm.code}
                      onChange={(e) => updateHospitalField("code", e.target.value)}
                      className={inputClass()}
                    />
                  </Field>
                  <Field label="ADDRESS">
                    <input
                      value={hospitalForm.address}
                      onChange={(e) => updateHospitalField("address", e.target.value)}
                      className={inputClass()}
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-x-10 gap-y-8">
                  <Field label="LATITUDE" hint="Used for the app's nearest-hospital recommendation">
                    <input
                      value={hospitalForm.latitude}
                      onChange={(e) => updateHospitalField("latitude", e.target.value)}
                      className={inputClass()}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="LONGITUDE">
                    <input
                      value={hospitalForm.longitude}
                      onChange={(e) => updateHospitalField("longitude", e.target.value)}
                      className={inputClass()}
                      inputMode="decimal"
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-x-10 gap-y-8">
                  <Field
                    label="APPOINTMENT SLOT CAPACITY"
                    hint="Max donors that can be booked into the exact same time slot at this hospital"
                  >
                    <input
                      value={hospitalForm.appointmentCapacity}
                      onChange={(e) => updateHospitalField("appointmentCapacity", e.target.value)}
                      className={inputClass()}
                      inputMode="numeric"
                      type="number"
                      min="1"
                    />
                  </Field>
                </div>

                <hr className="border-t border-[#efeeed]" />

                <div className="flex items-center justify-between gap-4">
                  {hospitalFormError ? (
                    <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{hospitalFormError}</p>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={closeHospitalForm}
                      className="rounded-[16px] w-[120px] h-[49px] flex items-center justify-center cursor-pointer border border-[#aaa4a0]"
                    >
                      <span className="font-poppins font-bold text-[15px] text-black">Cancel</span>
                    </button>
                    <button
                      type="submit"
                      disabled={hospitalFormSaving}
                      className="shrink-0 bg-[#ad2b21] rounded-[16px] w-[203px] h-[49px] flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
                    >
                      <span className="font-poppins font-bold text-[17px] text-white">
                        {hospitalFormSaving ? "Saving..." : editingHospitalId ? "Save Hospital" : "Add Hospital"}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            ) : hospitals.length === 0 ? (
              <p className="font-poppins text-[15px] text-[#808080]">No hospitals registered yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[#efeeed]">
                {hospitals.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                    <div>
                      <p className="font-poppins font-medium text-[15px] text-black">{h.name}</p>
                      <p className="font-poppins text-[13px] text-[#808080]">
                        {h.code}
                        {h.city ? `  •  ${h.city}` : ""}
                      </p>
                      {confirmDeleteHospitalId === h.id && hospitalDeleteError && (
                        <p className="mt-1 font-poppins text-[12px] text-[#d70b07]">{hospitalDeleteError}</p>
                      )}
                    </div>
                    {confirmDeleteHospitalId === h.id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-poppins text-[12px] text-[#d70b07]">Delete this hospital?</span>
                        <button
                          type="button"
                          onClick={() => confirmDeleteHospital(h.id)}
                          disabled={hospitalDeleting}
                          className="bg-[#d70b07] rounded-[16px] h-[40px] px-4 flex items-center justify-center cursor-pointer disabled:cursor-wait disabled:opacity-70"
                        >
                          <span className="font-poppins font-semibold text-[13px] text-white">
                            {hospitalDeleting ? "Deleting..." : "Confirm"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteHospitalId(null);
                            setHospitalDeleteError(null);
                          }}
                          disabled={hospitalDeleting}
                          className="border border-[#aaa4a0] rounded-[16px] h-[40px] px-4 flex items-center justify-center cursor-pointer"
                        >
                          <span className="font-poppins font-semibold text-[13px] text-black">Cancel</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditHospital(h)}
                          className="border border-[#aaa4a0] rounded-[16px] h-[40px] px-5 flex items-center justify-center cursor-pointer"
                        >
                          <span className="font-poppins font-semibold text-[13px] text-black">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setHospitalDeleteError(null);
                            setConfirmDeleteHospitalId(h.id);
                          }}
                          className="border border-[#ce4444] rounded-[16px] h-[40px] px-5 flex items-center justify-center cursor-pointer"
                        >
                          <span className="font-poppins font-semibold text-[13px] text-[#d70b07]">Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </>
        )}

        {/* Inventory Thresholds */}
        <h2 className="mt-10 font-poppins font-semibold text-[20px] text-black">Inventory Thresholds</h2>
        <p className="mt-1.5 font-poppins font-semibold text-[15px] text-[#808080] max-w-[616px]">
          Set the unit counts where a blood type flips to LOW or CRITICAL on the dashboard. These are per
          hospital and per blood type — there's no single number that fits every hospital or every type.
        </p>

        <div className="mt-4 bg-white rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[816px] overflow-hidden">
          <div className="bg-[#f7f5f5] px-8 py-6 flex items-center gap-4">
            <div className="bg-[#f1dddc] rounded-[5px] w-[56px] h-[52px] flex items-center justify-center shrink-0">
              <IconDroplet className="w-6 h-6 text-[#ad2b21]" />
            </div>
            <div>
              <p className="font-poppins font-medium text-[20px] text-black">Inventory Thresholds</p>
              <p className="mt-1 font-poppins font-semibold text-[15px] text-[#808080]">
                {hospitalId === "all"
                  ? "Select a specific hospital to view and edit its thresholds"
                  : hospitals.find((h) => h.id === hospitalId)?.name || "Selected hospital"}
              </p>
            </div>
          </div>

          <div className="px-8 py-8">
            {hospitalId === "all" ? (
              <p className="font-poppins text-[15px] text-[#808080]">
                Thresholds are set per hospital. Use the hospital switcher at the top of the page to pick one.
              </p>
            ) : thresholdsError ? (
              <p className="font-poppins text-[15px] text-[#d70b07]">Couldn't load inventory: {thresholdsError}</p>
            ) : thresholdRows.length === 0 ? (
              <p className="font-poppins text-[15px] text-[#808080]">No inventory rows for this hospital yet.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[#efeeed]">
                {thresholdRows.map((row) =>
                  editingType === row.type ? (
                    <form
                      key={row.type}
                      onSubmit={(e) => submitThreshold(e, row.type)}
                      className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <p className="font-poppins font-medium text-[15px] text-black">
                        {row.type} <span className="font-normal text-[#808080]">· {row.units} units on hand</span>
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="CRITICAL AT OR BELOW">
                          <input
                            type="number"
                            min="0"
                            value={thresholdForm.critical}
                            onChange={(e) => setThresholdForm((prev) => ({ ...prev, critical: e.target.value }))}
                            className={inputClass()}
                          />
                        </Field>
                        <Field label="LOW AT OR BELOW">
                          <input
                            type="number"
                            min="0"
                            value={thresholdForm.low}
                            onChange={(e) => setThresholdForm((prev) => ({ ...prev, low: e.target.value }))}
                            className={inputClass()}
                          />
                        </Field>
                      </div>
                      {thresholdRowError && (
                        <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{thresholdRowError}</p>
                      )}
                      <div className="flex items-center gap-3 self-end">
                        <button
                          type="button"
                          onClick={closeEditThreshold}
                          className="rounded-[16px] h-[40px] px-5 flex items-center justify-center cursor-pointer border border-[#aaa4a0]"
                        >
                          <span className="font-poppins font-semibold text-[13px] text-black">Cancel</span>
                        </button>
                        <button
                          type="submit"
                          disabled={savingType === row.type}
                          className="bg-[#ad2b21] rounded-[16px] h-[40px] px-5 flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
                        >
                          <span className="font-poppins font-semibold text-[13px] text-white">
                            {savingType === row.type ? "Saving..." : "Save"}
                          </span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div key={row.type} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div>
                        <p className="font-poppins font-medium text-[15px] text-black">
                          {row.type} <span className="font-normal text-[#808080]">· {row.units} units on hand</span>
                        </p>
                        <p className="font-poppins text-[13px] text-[#808080]">
                          Critical ≤ {row.criticalThreshold} · Low ≤ {row.lowThreshold}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditThreshold(row)}
                        className="border border-[#aaa4a0] rounded-[16px] h-[40px] px-5 flex items-center justify-center cursor-pointer"
                      >
                        <span className="font-poppins font-semibold text-[13px] text-black">Edit</span>
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Data Import — same rationale as Hospital Network above: gated
            behind 'settings' access rather than shown to everyone. */}
        {profile && profile.permissions?.settings !== "none" && (
        <>
        <h2 className="mt-10 font-poppins font-semibold text-[20px] text-black">Data Import</h2>
        <p className="mt-1.5 font-poppins font-semibold text-[15px] text-[#808080] max-w-[616px]">
          Bring existing records into ResQ from a spreadsheet — donors, current inventory, and past requests
          or appointments. Accepts .csv or .xlsx files.
        </p>

        <div className="mt-4 bg-white rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[816px] overflow-hidden">
          <div className="bg-[#f7f5f5] px-8 py-6 flex items-center gap-4">
            <div className="bg-[#f1dddc] rounded-[5px] w-[56px] h-[52px] flex items-center justify-center shrink-0">
              <IconDownload className="w-6 h-6 text-[#ad2b21] rotate-180" />
            </div>
            <div>
              <p className="font-poppins font-medium text-[20px] text-black">Data Import</p>
              <p className="mt-1 font-poppins font-semibold text-[15px] text-[#808080]">
                Migrate records from a previous system or spreadsheet
              </p>
            </div>
          </div>

          <form onSubmit={submitImport} className="px-8 py-8 flex flex-col gap-6">
            <Field label="WHAT ARE YOU IMPORTING?">
              <div className="grid grid-cols-4 gap-2">
                {IMPORT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setImportType(t.key);
                      setImportResult(null);
                      setImportError(null);
                    }}
                    className={`h-[38px] rounded-[8px] border text-[13px] font-poppins font-semibold cursor-pointer ${
                      importType === t.key
                        ? "bg-[#ad2b21] border-[#ad2b21] text-white"
                        : "bg-[#f6f5f4] border-[#d9d9d9] text-[#808080]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>

            {(() => {
              const meta = IMPORT_TYPES.find((t) => t.key === importType);
              return (
                <>
                  <div className="flex items-center justify-between gap-4 bg-[#f6f5f4] rounded-[10px] px-4 py-3">
                    <p className="font-poppins text-[13px] text-[#808080]">
                      Expected columns: <span className="text-black">{meta.template.join(", ")}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => downloadImportTemplate(importType)}
                      className="shrink-0 font-poppins font-semibold text-[13px] text-[#ad2b21] cursor-pointer whitespace-nowrap"
                    >
                      Download template
                    </button>
                  </div>

                  {meta.needsHospital && (
                    <Field label="IMPORTING INTO" hint="This is independent of the hospital switcher at the top of the app.">
                      <select
                        value={importHospitalId}
                        onChange={(e) => setImportHospitalId(e.target.value)}
                        className={inputClass()}
                      >
                        <option value="" disabled>
                          Select a hospital...
                        </option>
                        {hospitals.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  <Field label="FILE">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                      className="font-poppins text-[13px] text-black file:mr-4 file:h-[36px] file:px-4 file:rounded-[8px] file:border-0 file:bg-[#f1dddc] file:text-[#ad2b21] file:font-semibold file:cursor-pointer"
                    />
                  </Field>
                </>
              );
            })()}

            {importError && <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{importError}</p>}

            {importResult && (
              <div className="rounded-[10px] border border-[#d9d9d9] px-4 py-3 flex flex-col gap-2">
                <p className="flex items-center gap-2 font-poppins font-semibold text-[14px] text-black">
                  <IconCheckCircle className="w-4 h-4 text-[#4c8c4a] shrink-0" />
                  {importResult.imported} imported
                  {importResult.skipped > 0 ? `, ${importResult.skipped} skipped (already existed)` : ""}
                  {importResult.errors.length > 0 ? `, ${importResult.errors.length} failed` : ""}
                </p>
                {importResult.errors.length > 0 && (
                  <div className="max-h-[160px] overflow-y-auto flex flex-col gap-1">
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="font-poppins text-[12px] text-[#d70b07]">
                        Row {e.row}: {e.message}
                      </p>
                    ))}
                    {importResult.errorsTruncated > 0 && (
                      <p className="font-poppins text-[12px] text-[#808080]">
                        + {importResult.errorsTruncated} more errors not shown
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={importSubmitting}
              className="self-start bg-[#ad2b21] rounded-[16px] h-[49px] px-8 flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
            >
              <span className="font-poppins font-bold text-[17px] text-white">
                {importSubmitting ? "Importing..." : "Import"}
              </span>
            </button>
          </form>
        </div>
        </>
        )}

        {/* Team Access — only visible to the super admin or a delegated
            team manager (see requireTeamManager on the backend). Everyone
            else has no reason to see a roster of every admin account. */}
        {profile && (profile.isSuperAdmin || profile.canManageTeam) && <TeamAccessCard currentAdminId={profile.id} />}
      </div>
    </div>
  );
}
