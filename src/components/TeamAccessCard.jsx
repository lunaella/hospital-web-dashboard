import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { useHospital } from "../context/HospitalContext";
import { IconUsers, IconPlus, IconX, IconCheckCircle, IconShield } from "./icons";

const SECTION_META = [
  { key: "dashboard", label: "Dashboard" },
  { key: "donor_management", label: "Donor Management" },
  { key: "reports", label: "Reports" },
  { key: "broadcasts", label: "Broadcasts" },
  { key: "settings", label: "Settings" },
];

const LEVEL_LABEL = { none: "No Access", view: "View Only", edit: "Full Access" };

function emptyPermissionsForm() {
  return Object.fromEntries(SECTION_META.map((s) => [s.key, "none"]));
}

function selectClass() {
  return "border border-[#aaa4a0] rounded-[8px] h-[34px] px-2 font-poppins text-[12px] text-black outline-none";
}

// A small grid of <select> dropdowns, one per Team Access section — shared
// between the "add person" and "edit person" forms below so the two never
// drift out of sync visually.
function PermissionsGrid({ value, onChange, disabled }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {SECTION_META.map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-3">
          <span className="font-poppins text-[13px] text-black">{s.label}</span>
          <select
            value={value[s.key] ?? "none"}
            onChange={(e) => onChange(s.key, e.target.value)}
            disabled={disabled}
            className={selectClass()}
          >
            <option value="none">No Access</option>
            <option value="view">View Only</option>
            <option value="edit">Full Access</option>
          </select>
        </div>
      ))}
    </div>
  );
}

// A checkbox list of every hospital in the network — shared between the
// "add person" and "edit person" forms, same idea as PermissionsGrid.
// Nothing checked = unrestricted (every hospital), which is the same
// convention the backend uses for an admin with no admin_hospital_assignments
// rows, so this list has to make that meaning obvious rather than looking
// like an empty/broken control.
function HospitalChecklist({ hospitals, value, onChange }) {
  function toggle(id) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div>
      <p className="font-poppins font-medium text-[13px] text-black mb-1">Which hospitals can they access?</p>
      <p className="font-poppins text-[12px] text-[#808080] mb-3">
        Leave everything unchecked to give this person access to every hospital.
      </p>
      {hospitals.length === 0 ? (
        <p className="font-poppins text-[12px] text-[#808080]">No hospitals in the network yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {hospitals.map((h) => (
            <label key={h.id} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={value.includes(h.id)}
                onChange={() => toggle(h.id)}
                className="w-[15px] h-[15px]"
              />
              <span className="font-poppins text-[13px] text-black">{h.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_ADD_FORM = { username: "", email: "", tempPassword: "", canManageTeam: false, makeSuperAdmin: false };

// The Settings page only renders this when the logged-in admin is the super
// admin or a delegated team manager (see requireTeamManager on the
// backend) — everyone else never even fetches the team roster.
export default function TeamAccessCard({ currentAdminId }) {
  const { hospitals } = useHospital();
  const [team, setTeam] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addPermissions, setAddPermissions] = useState(emptyPermissionsForm());
  const [addHospitalIds, setAddHospitalIds] = useState([]);
  const [addFormError, setAddFormError] = useState(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState(null); // { username, tempPassword } — shown once, not stored

  const [editingId, setEditingId] = useState(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPermissions, setEditPermissions] = useState(emptyPermissionsForm());
  const [editHospitalIds, setEditHospitalIds] = useState([]);
  const [editCanManageTeam, setEditCanManageTeam] = useState(false);
  const [editResetPassword, setEditResetPassword] = useState("");
  const [editFormError, setEditFormError] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  async function refreshTeam() {
    try {
      const rows = await api.get("/api/team");
      setTeam(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshTeam();
  }, []);

  const currentAdmin = team.find((a) => a.id === currentAdminId);
  const isRealSuperAdmin = currentAdmin?.isSuperAdmin ?? false;

  function openAddForm() {
    setAddForm(EMPTY_ADD_FORM);
    setAddPermissions(emptyPermissionsForm());
    setAddHospitalIds([]);
    setAddFormError(null);
    setJustCreated(null);
    setShowAddForm(true);
  }

  async function submitAddForm(e) {
    e.preventDefault();
    if (!addForm.username.trim() || !addForm.email.trim() || !addForm.tempPassword) {
      setAddFormError("Username, email, and a temporary password are required.");
      return;
    }
    if (addForm.tempPassword.length < 8) {
      setAddFormError("Temporary password must be at least 8 characters.");
      return;
    }

    setAddSubmitting(true);
    setAddFormError(null);
    try {
      await api.post("/api/team", { ...addForm, permissions: addPermissions, hospitalIds: addHospitalIds });
      setJustCreated({ username: addForm.username, tempPassword: addForm.tempPassword });
      setAddForm(EMPTY_ADD_FORM);
      setAddPermissions(emptyPermissionsForm());
      setAddHospitalIds([]);
      await refreshTeam();
    } catch (err) {
      setAddFormError(err.message);
    } finally {
      setAddSubmitting(false);
    }
  }

  function openEdit(admin) {
    setEditingId(admin.id);
    setEditEmail(admin.email);
    setEditPermissions({ ...emptyPermissionsForm(), ...admin.permissions });
    setEditHospitalIds(admin.hospitalIds ?? []);
    setEditCanManageTeam(admin.canManageTeam);
    setEditResetPassword("");
    setEditFormError(null);
  }

  function closeEdit() {
    setEditingId(null);
    setEditFormError(null);
  }

  async function submitEdit(e, adminId) {
    e.preventDefault();
    if (editResetPassword && editResetPassword.length < 8) {
      setEditFormError("New temporary password must be at least 8 characters.");
      return;
    }

    setEditSubmitting(true);
    setEditFormError(null);
    try {
      const body = { email: editEmail, permissions: editPermissions, hospitalIds: editHospitalIds };
      if (isRealSuperAdmin) body.canManageTeam = editCanManageTeam;
      if (editResetPassword) body.resetPassword = editResetPassword;
      await api.patch(`/api/team/${adminId}`, body);
      setEditingId(null);
      await refreshTeam();
    } catch (err) {
      setEditFormError(err.message);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function confirmDelete(adminId) {
    setDeleteError(null);
    try {
      await api.delete(`/api/team/${adminId}`);
      setConfirmDeleteId(null);
      await refreshTeam();
    } catch (err) {
      setDeleteError(err.message);
    }
  }

  return (
    <>
      <h2 className="mt-10 font-poppins font-semibold text-[20px] text-black">Team Access</h2>
      <p className="mt-1.5 font-poppins font-semibold text-[15px] text-[#808080] max-w-[616px]">
        Add people who need to use this portal and choose exactly what each of them can see and do. Only the
        super admin{isRealSuperAdmin ? "" : " and delegated team managers"} can make changes here.
      </p>

      <div className="mt-4 bg-white rounded-[10px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1)] w-[816px] overflow-hidden">
        <div className="bg-[#f7f5f5] px-8 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-[#f1dddc] rounded-[5px] w-[56px] h-[52px] flex items-center justify-center shrink-0">
              <IconUsers className="w-6 h-6 text-[#ad2b21]" />
            </div>
            <div>
              <p className="font-poppins font-medium text-[20px] text-black">Team Access</p>
              <p className="mt-1 font-poppins font-semibold text-[15px] text-[#808080]">
                {team.length} {team.length === 1 ? "account" : "accounts"} with portal access
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={openAddForm}
            className="shrink-0 bg-[#ad2b21] rounded-[16px] h-[42px] px-5 flex items-center gap-2 justify-center cursor-pointer hover:bg-[#8f2419] transition-colors"
          >
            <IconPlus className="w-4 h-4 text-white" />
            <span className="font-poppins font-semibold text-[14px] text-white">Add Person</span>
          </button>
        </div>

        <div className="px-8 py-6 flex flex-col gap-4">
          {loading && <p className="font-poppins text-[13px] text-[#808080]">Loading team roster...</p>}
          {loadError && <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{loadError}</p>}

          {showAddForm && (
            <form onSubmit={submitAddForm} className="rounded-[10px] border border-[#d9d9d9] p-5 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <p className="font-poppins font-semibold text-[15px] text-black">Add a new person</p>
                <button type="button" onClick={() => setShowAddForm(false)} className="cursor-pointer">
                  <IconX className="w-4 h-4 text-[#808080]" />
                </button>
              </div>

              {justCreated && (
                <div className="rounded-[10px] bg-[#f0faf3] border border-[#bfe3c8] px-4 py-3 flex flex-col gap-1">
                  <p className="flex items-center gap-2 font-poppins font-semibold text-[13px] text-[#1e7d32]">
                    <IconCheckCircle className="w-4 h-4 shrink-0" />
                    Account created for {justCreated.username}
                  </p>
                  <p className="font-poppins text-[13px] text-black">
                    Temporary password: <span className="font-mono font-semibold">{justCreated.tempPassword}</span>
                  </p>
                  <p className="font-poppins text-[12px] text-[#808080]">
                    Share this with them yourself — it won't be shown again. They can change it from Settings
                    after logging in.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <label className="flex flex-col gap-1.5">
                  <span className="font-poppins font-medium text-[13px] text-black">Username</span>
                  <input
                    value={addForm.username}
                    onChange={(e) => setAddForm((p) => ({ ...p, username: e.target.value }))}
                    className="border border-[#aaa4a0] rounded-[8px] h-[38px] px-3 font-poppins text-[13px] text-black outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-poppins font-medium text-[13px] text-black">Email</span>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
                    className="border border-[#aaa4a0] rounded-[8px] h-[38px] px-3 font-poppins text-[13px] text-black outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1.5 col-span-2">
                  <span className="font-poppins font-medium text-[13px] text-black">Temporary password</span>
                  <input
                    value={addForm.tempPassword}
                    onChange={(e) => setAddForm((p) => ({ ...p, tempPassword: e.target.value }))}
                    placeholder="Min. 8 characters — they should change it after first login"
                    className="border border-[#aaa4a0] rounded-[8px] h-[38px] px-3 font-poppins text-[13px] text-black outline-none"
                  />
                </label>
              </div>

              <div>
                <p className="font-poppins font-medium text-[13px] text-black mb-3">What can they access?</p>
                <PermissionsGrid value={addPermissions} onChange={(k, v) => setAddPermissions((p) => ({ ...p, [k]: v }))} />
              </div>

              <HospitalChecklist hospitals={hospitals} value={addHospitalIds} onChange={setAddHospitalIds} />

              {isRealSuperAdmin && (
                <div className="flex flex-col gap-2 rounded-[10px] bg-[#f6f5f4] p-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addForm.canManageTeam}
                      onChange={(e) => setAddForm((p) => ({ ...p, canManageTeam: e.target.checked }))}
                      className="w-[15px] h-[15px]"
                    />
                    <span className="font-poppins text-[13px] text-black">
                      Let this person add/edit/remove other team members too
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addForm.makeSuperAdmin}
                      onChange={(e) => setAddForm((p) => ({ ...p, makeSuperAdmin: e.target.checked }))}
                      className="w-[15px] h-[15px]"
                    />
                    <span className="font-poppins text-[13px] text-[#ad2b21]">
                      Make this a super admin (full, unrestricted access — use sparingly)
                    </span>
                  </label>
                </div>
              )}

              {addFormError && <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{addFormError}</p>}

              <button
                type="submit"
                disabled={addSubmitting}
                className="self-start bg-[#ad2b21] rounded-[16px] h-[42px] px-6 flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
              >
                <span className="font-poppins font-semibold text-[14px] text-white">
                  {addSubmitting ? "Creating..." : "Create Account"}
                </span>
              </button>
            </form>
          )}

          {deleteError && <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{deleteError}</p>}

          {!loading &&
            team.map((admin) => (
              <div key={admin.id} className="rounded-[10px] border border-[#efeeed] p-5">
                {editingId === admin.id ? (
                  <form onSubmit={(e) => submitEdit(e, admin.id)} className="flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                      <p className="font-poppins font-semibold text-[15px] text-black">Editing {admin.username}</p>
                      <button type="button" onClick={closeEdit} className="cursor-pointer">
                        <IconX className="w-4 h-4 text-[#808080]" />
                      </button>
                    </div>

                    <label className="flex flex-col gap-1.5 max-w-[320px]">
                      <span className="font-poppins font-medium text-[13px] text-black">Email</span>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="border border-[#aaa4a0] rounded-[8px] h-[38px] px-3 font-poppins text-[13px] text-black outline-none"
                      />
                    </label>

                    {admin.isSuperAdmin ? (
                      <p className="flex items-center gap-2 font-poppins text-[13px] text-[#808080]">
                        <IconShield className="w-4 h-4 text-[#ad2b21]" />
                        Super admin — always has full access to every section.
                      </p>
                    ) : (
                      <div>
                        <p className="font-poppins font-medium text-[13px] text-black mb-3">What can they access?</p>
                        <PermissionsGrid
                          value={editPermissions}
                          onChange={(k, v) => setEditPermissions((p) => ({ ...p, [k]: v }))}
                        />
                      </div>
                    )}

                    {!admin.isSuperAdmin && (
                      <HospitalChecklist hospitals={hospitals} value={editHospitalIds} onChange={setEditHospitalIds} />
                    )}

                    {isRealSuperAdmin && !admin.isSuperAdmin && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editCanManageTeam}
                          onChange={(e) => setEditCanManageTeam(e.target.checked)}
                          className="w-[15px] h-[15px]"
                        />
                        <span className="font-poppins text-[13px] text-black">
                          Let this person add/edit/remove other team members too
                        </span>
                      </label>
                    )}

                    <label className="flex flex-col gap-1.5 max-w-[320px]">
                      <span className="font-poppins font-medium text-[13px] text-black">Reset password (optional)</span>
                      <input
                        value={editResetPassword}
                        onChange={(e) => setEditResetPassword(e.target.value)}
                        placeholder="Leave blank to keep their current password"
                        className="border border-[#aaa4a0] rounded-[8px] h-[38px] px-3 font-poppins text-[13px] text-black outline-none"
                      />
                    </label>

                    {editFormError && <p className="font-poppins font-semibold text-[13px] text-[#d70b07]">{editFormError}</p>}

                    <button
                      type="submit"
                      disabled={editSubmitting}
                      className="self-start bg-[#ad2b21] rounded-[16px] h-[42px] px-6 flex items-center justify-center cursor-pointer hover:bg-[#8f2419] transition-colors disabled:cursor-wait disabled:opacity-70"
                    >
                      <span className="font-poppins font-semibold text-[14px] text-white">
                        {editSubmitting ? "Saving..." : "Save Changes"}
                      </span>
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="flex items-center gap-2 font-poppins font-medium text-[15px] text-black">
                        {admin.username}
                        {admin.id === currentAdminId && (
                          <span className="font-poppins font-normal text-[12px] text-[#808080]">(you)</span>
                        )}
                        {admin.isSuperAdmin && (
                          <span className="flex items-center gap-1 bg-[rgba(225,32,53,0.12)] text-[#ad2b21] rounded-[8px] px-2 py-0.5 font-poppins font-semibold text-[11px]">
                            <IconShield className="w-3 h-3" /> Super Admin
                          </span>
                        )}
                        {!admin.isSuperAdmin && admin.canManageTeam && (
                          <span className="bg-[#f6f5f4] text-[#808080] rounded-[8px] px-2 py-0.5 font-poppins font-semibold text-[11px]">
                            Team Manager
                          </span>
                        )}
                      </p>
                      <p className="font-poppins text-[13px] text-[#808080]">{admin.email}</p>
                      {!admin.isSuperAdmin && (
                        <p className="mt-1 font-poppins text-[12px] text-[#808080]">
                          {SECTION_META.filter((s) => admin.permissions[s.key] !== "none")
                            .map((s) => `${s.label}: ${LEVEL_LABEL[admin.permissions[s.key]]}`)
                            .join(" · ") || "No access granted yet"}
                        </p>
                      )}
                      {!admin.isSuperAdmin && (
                        <p className="mt-1 font-poppins text-[12px] text-[#808080]">
                          Hospitals:{" "}
                          {admin.hospitalIds.length === 0
                            ? "All hospitals"
                            : hospitals
                                .filter((h) => admin.hospitalIds.includes(h.id))
                                .map((h) => h.name)
                                .join(", ") || `${admin.hospitalIds.length} assigned`}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {confirmDeleteId === admin.id ? (
                        <>
                          <span className="font-poppins text-[12px] text-[#d70b07]">Remove this account?</span>
                          <button
                            type="button"
                            onClick={() => confirmDelete(admin.id)}
                            className="bg-[#d70b07] rounded-[12px] h-[34px] px-4 flex items-center justify-center cursor-pointer"
                          >
                            <span className="font-poppins font-semibold text-[12px] text-white">Confirm</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="border border-[#aaa4a0] rounded-[12px] h-[34px] px-4 flex items-center justify-center cursor-pointer"
                          >
                            <span className="font-poppins font-semibold text-[12px] text-black">Cancel</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(admin)}
                            className="border border-[#aaa4a0] rounded-[12px] h-[34px] px-4 flex items-center justify-center cursor-pointer"
                          >
                            <span className="font-poppins font-semibold text-[12px] text-black">Edit</span>
                          </button>
                          {admin.id !== currentAdminId && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(admin.id)}
                              className="border border-[#ce4444] rounded-[12px] h-[34px] px-4 flex items-center justify-center cursor-pointer"
                            >
                              <span className="font-poppins font-semibold text-[12px] text-[#d70b07]">Remove</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </>
  );
}
