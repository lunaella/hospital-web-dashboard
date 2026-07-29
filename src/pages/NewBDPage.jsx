import { useState } from "react";
import { useNavigate } from "react-router-dom";

// Rebuilt from the "Create New Broadcast" reference screenshot the user provided
// directly from Figma (node 510:812, "NewBDPage") — the Figma MCP tool quota was
// exhausted before this frame could be pulled via get_design_context, so this is
// a manual reproduction of that screenshot rather than raw design_context output.

const URGENCY_LEVELS = [
  {
    key: "Emergency",
    icon: (
      <svg viewBox="0 0 20 20" className="w-[14px] h-[14px]" fill="none">
        <path d="M10 2 1 17h18L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 8v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="14.5" r="0.75" fill="currentColor" />
      </svg>
    ),
  },
  {
    key: "Urgent",
    icon: (
      <svg viewBox="0 0 20 20" className="w-[14px] h-[14px]" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v4l3 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: "Normal",
    icon: (
      <svg viewBox="0 0 20 20" className="w-[14px] h-[14px]" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 10.2 8.7 12.5 13.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function NewBDPage() {
  const navigate = useNavigate();

  const [urgency, setUrgency] = useState("Emergency");
  const [bloodType, setBloodType] = useState("O-");
  const [units, setUnits] = useState(2);

  function handleCancel() {
    navigate(-1);
  }

  function handleSubmit(e) {
    e.preventDefault();
    // No backend wiring yet — log the broadcast request and return to the list.
    console.log("New blood donation broadcast:", { urgency, bloodType, units });
    navigate("/view-broadcasts");
  }

  return (
    <div className="fixed inset-0 z-50 font-poppins">
      <div className="absolute inset-0 bg-[rgba(30,10,12,0.45)]" onClick={handleCancel} aria-hidden="true" />
      <form
        onSubmit={handleSubmit}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[20px] shadow-[0px_17px_38px_0px_rgba(0,0,0,0.15)] w-[560px] max-w-[95vw] max-h-[95vh] overflow-y-auto px-8 py-7"
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-6">
          <div className="w-[44px] h-[44px] rounded-full bg-[#f8e2e0] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none">
              <path
                d="M12 20s-7-4.35-9.5-8.5C.9 8.2 2.3 5 5.6 5c1.9 0 3.3 1 4.4 2.6 1.1-1.6 2.5-2.6 4.4-2.6 3.3 0 4.7 3.2 3.1 6.5C19 15.65 12 20 12 20Z"
                fill="#ad2b21"
              />
            </svg>
          </div>
          <div>
            <h2 className="font-poppins font-bold text-[20px] text-black leading-tight">Create New Broadcast</h2>
            <p className="font-poppins font-medium text-[13px] text-[#868686] leading-tight mt-0.5">
              Dispatch urgent blood request notifications to all eligible donors
            </p>
          </div>
        </div>

        {/* 1. Urgency level */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-poppins font-bold text-[11px] text-[#ad2b21] tracking-wide whitespace-nowrap">
              1. SET URGENCY LEVEL
            </span>
            <div className="flex-1 h-px bg-[#e5e4e7]" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {URGENCY_LEVELS.map((level) => (
              <button
                key={level.key}
                type="button"
                onClick={() => setUrgency(level.key)}
                className={`h-[38px] rounded-[10px] border flex items-center justify-center gap-1.5 text-[13px] font-poppins font-semibold transition-colors ${
                  urgency === level.key
                    ? "bg-[#ad2b21] border-[#ad2b21] text-white"
                    : "bg-white border-[#d9d9d9] text-[#808080]"
                }`}
              >
                {level.icon}
                {level.key}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Blood type */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-poppins font-bold text-[11px] text-[#ad2b21] tracking-wide whitespace-nowrap">
              2. SELECT TARGET BLOOD TYPE
            </span>
            <div className="flex-1 h-px bg-[#e5e4e7]" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {BLOOD_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setBloodType(type)}
                className={`h-[42px] rounded-[10px] border-2 text-[15px] font-poppins font-bold transition-colors ${
                  bloodType === type
                    ? "bg-[#fbeeec] border-[#ad2b21] text-[#ad2b21]"
                    : "bg-white border-[#d9d9d9] text-black"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Quota requirement */}
        <div className="mb-7">
          <div className="flex items-center gap-3 mb-3">
            <span className="font-poppins font-bold text-[11px] text-[#ad2b21] tracking-wide whitespace-nowrap">
              3. QUOTA REQUIREMENT
            </span>
            <div className="flex-1 h-px bg-[#e5e4e7]" />
          </div>
          <div className="bg-[#f6f5f4] rounded-[10px] h-[54px] flex items-center justify-between px-4">
            <span className="font-poppins font-medium text-[13px] text-[#808080]">Number of Units Required</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUnits((u) => Math.max(1, u - 1))}
                aria-label="Decrease units"
                className="w-[28px] h-[28px] rounded-full border border-[#d9d9d9] bg-white flex items-center justify-center text-[16px] text-[#808080] cursor-pointer"
              >
                &minus;
              </button>
              <span className="font-poppins font-bold text-[16px] text-black w-[16px] text-center">{units}</span>
              <button
                type="button"
                onClick={() => setUnits((u) => u + 1)}
                aria-label="Increase units"
                className="w-[28px] h-[28px] rounded-full border border-[#d9d9d9] bg-white flex items-center justify-center text-[16px] text-[#808080] cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="h-[45px] px-6 rounded-[16px] border-2 border-[#d9d9d9] text-[14px] font-poppins font-bold text-black cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="h-[45px] px-6 rounded-[16px] bg-[#ad2b21] text-[14px] font-poppins font-bold text-white cursor-pointer hover:bg-[#8f2419] transition-colors"
          >
            Confirm &amp; Broadcast Request
          </button>
        </div>
      </form>
    </div>
  );
}
