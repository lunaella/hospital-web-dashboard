// Donor Profile popup (Donor Management screen) — opened via "View Profile"
// in a donor row's actions menu. Shows blood type, the same authoritative
// eligibility read the QR-scan flow uses (GET /:id/screening-summary), and
// donation history, in one place instead of just the row's compact columns.
//
// Data Privacy (RA 10173): only what's already visible elsewhere in the
// admin plus donation history is shown here — no raw health_screening
// answers, no emergency contact, no address. The phone number stays masked
// by default (same masking as the donor list) with an explicit Show toggle,
// so nothing sensitive is exposed just by opening the popup.
//
// Portaled to document.body — see FulfillmentLogModal.jsx's comment: every
// page renders inside AppShell's `transform: scale(...)` zoom wrapper,
// which breaks `position: fixed` centering/sizing for anything rendered
// inline instead of portaled out of it.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/apiClient";
import { maskPhone } from "../utils/pii";
import Avatar from "./Avatar";

const STATUS_STYLE = {
  ELIGIBLE: "bg-[#eafaf0] text-[#1e7d32]",
  DEFERRED: "bg-[#fff8e1] text-[#8a6d1d]",
  CLINICAL_REVIEW: "bg-[#fdecea] text-[#c26460]",
  UNKNOWN: "bg-[#f1f1f1] text-[#8a8a8a]",
};

const STATUS_LABEL = {
  ELIGIBLE: "Eligible",
  DEFERRED: "Deferred",
  CLINICAL_REVIEW: "Needs Clinical Review",
  UNKNOWN: "Unknown",
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DonorProfileModal({ donorId, onClose }) {
  const [donor, setDonor] = useState(null);
  const [screening, setScreening] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  useEffect(() => {
    if (!donorId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPhoneRevealed(false);

    Promise.all([
      api.get(`/api/donors/${donorId}`),
      api.get(`/api/donors/${donorId}/screening-summary`),
      api.get(`/api/donors/${donorId}/donation-history`),
    ])
      .then(([donorRes, screeningRes, historyRes]) => {
        if (cancelled) return;
        setDonor(donorRes);
        setScreening(screeningRes);
        setHistory(historyRes);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [donorId]);

  if (!donorId) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] font-poppins flex items-center justify-center p-6">
      <div className="absolute inset-0 backdrop-blur-[7.5px] bg-[rgba(217,217,217,0.85)]" onClick={onClose} />
      <div className="relative bg-white rounded-[16px] p-6 w-[480px] max-w-[92vw] max-h-[85vh] overflow-y-auto shadow-xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-[#8a8a8a] tracking-wide uppercase">Donor Profile</p>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[#808080] hover:text-black text-2xl leading-none"
            title="Close"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {loading && <p className="text-[13px] text-[#8a8a8a]">Loading donor profile...</p>}
        {error && <p className="text-[13px] text-[#d70b07]">Couldn't load donor profile: {error}</p>}

        {!loading && !error && donor && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={donor.name} photoUrl={donor.avatar} size={52} />
                <div>
                  <h3 className="font-poppins font-bold text-[19px] text-black">{donor.name}</h3>
                  <p className="text-[12px] text-[#aaa4a0]">{donor.donorCode}</p>
                </div>
              </div>
              <span className="inline-flex items-center justify-center w-[58px] h-[28px] bg-[#f8f3f4] border-2 border-[#ebdfe1] rounded-[10px] text-[12px] font-semibold text-[#9B1B20]">
                {donor.bloodType}
              </span>
            </div>

            <div className="flex items-center gap-2 text-[12px] text-black">
              <span className="text-[#8a8a8a] font-semibold uppercase text-[11px]">Phone</span>
              <span>{phoneRevealed ? donor.phone : maskPhone(donor.phone)}</span>
              <button
                type="button"
                onClick={() => setPhoneRevealed((v) => !v)}
                title={phoneRevealed ? "Hide phone number" : "Show full phone number"}
                aria-label={phoneRevealed ? "Hide phone number" : "Show full phone number"}
                className="text-[10px] font-semibold text-[#9B1B20] hover:underline cursor-pointer"
              >
                {phoneRevealed ? "Hide" : "Show"}
              </button>
            </div>

            {screening && (
              <div className="bg-[#fafafa] rounded-[12px] p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#8a8a8a] tracking-wide uppercase">
                    Eligibility Status
                  </span>
                  <span
                    className={`inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full ${
                      STATUS_STYLE[screening.status] ?? STATUS_STYLE.UNKNOWN
                    }`}
                  >
                    {STATUS_LABEL[screening.status] ?? "Unknown"}
                  </span>
                </div>
                <p className="text-[12px] text-black">{screening.message}</p>
                {screening.clearanceDate && (
                  <p className="text-[11px] text-[#8a8a8a]">Cleared to donate again on {formatDate(screening.clearanceDate)}</p>
                )}
              </div>
            )}

            <div>
              <p className="text-[12px] font-semibold text-[#8a8a8a] tracking-wide uppercase mb-2">Donation History</p>
              {history.length === 0 ? (
                <p className="text-[12px] text-[#aaa4a0]">No recorded donations yet.</p>
              ) : (
                <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between text-[12px] px-3 py-2 bg-[#fafafa] rounded-[8px]"
                    >
                      <span className="text-black font-medium">{h.hospitalName}</span>
                      <span className="text-[#8a8a8a]">{formatDate(h.arrivedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
