import { useEffect, useState } from "react";
import { loadRedCrossPhone, subscribeRedCrossPhone, telHref } from "../lib/redCrossContact";

// "Call Red Cross" for hospital admins — the other direction of the Call
// hospital button the super admin sees (PendingApprovalAlerts.jsx). Renders
// nothing until the super admin has set the hotline in Settings.
//   variant="pill"  — header / banner button with the number on it
//   variant="icon"  — round phone icon for a table row
//   variant="link"  — inline text link inside a sentence
export default function CallRedCrossButton({ variant = "pill", className = "" }) {
  const [phone, setPhone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    loadRedCrossPhone().then((p) => {
      if (!cancelled) setPhone(p);
    });
    const unsubscribe = subscribeRedCrossPhone(setPhone);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!phone) return null;
  const stop = (e) => e.stopPropagation();

  if (variant === "icon") {
    return (
      <a
        href={telHref(phone)}
        onClick={stop}
        className={`w-[26px] h-[26px] rounded-full border border-[#d9d9d9] flex items-center justify-center text-[#3d1116] hover:bg-[#f6f5f4] ${className}`}
        title={`Call the Red Cross at ${phone}`}
        aria-label="Call the Red Cross"
      >
        <PhoneIcon className="w-[13px] h-[13px]" />
      </a>
    );
  }
  if (variant === "link") {
    return (
      <a href={telHref(phone)} onClick={stop} className={`text-[#9B1B20] underline whitespace-nowrap ${className}`}>
        call the Red Cross at {phone}
      </a>
    );
  }
  return (
    <a
      href={telHref(phone)}
      onClick={stop}
      className={`shrink-0 flex items-center gap-1.5 h-[34px] px-4 rounded-full border border-[#9B1B20] text-[#9B1B20] font-poppins font-semibold text-[12px] hover:bg-[#fbeeec] transition-colors whitespace-nowrap ${className}`}
      title={`Call the Red Cross at ${phone}`}
    >
      <PhoneIcon className="w-[13px] h-[13px]" />
      Call Red Cross
    </a>
  );
}

function PhoneIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}
