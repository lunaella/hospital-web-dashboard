// Ported from resq_app/lib/utils/algo/decision_tree_class.dart's
// DecisionTreeClassifier — same rule-based decision tree, same node order,
// same thresholds, kept as a faithful line-by-line port (not reinvented)
// so a donor's status here can never quietly drift from what their own app
// shows. The mobile app is still the source of truth for a donor's actual
// screening answers (health_screening JSONB, written at registration/
// retake) — this module just re-evaluates those same answers server-side,
// for whenever a hospital staffer scanning a donor's QR pass needs an
// instant, official read instead of trusting a client-cached status.

import { assessMajorMedicalHistory, assessTravelOrNeedleStick, malariaExposureOf } from "./medKeywordRules.js";

const MIN_DONATION_INTERVAL_DAYS = 90;
const TATTOO_DEFERRAL_WINDOW_DAYS = 365;
const RECENT_PROCEDURE_DEF_DAYS = 28;
const TRANSFUSION_SURGERY_DEF_DAYS = 365;
const TRAVEL_NEEDLE_DEF_DAYS = 365;
// Malaria: 3 months after a visit, 3 years after leaving a place they
// lived in, 3 years after finishing treatment.
const MALARIA_WINDOW_DAYS = { visited: 90, lived: 1095, treated: 1095 };

function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

// A handful of DecisionTreeClassifier's ten EligibleStats reasons are a
// plain "come back after N days" wait — the rest (an active infection/
// medication, or a high-risk exposure flag) aren't something a countdown
// resolves; they need an actual clinical judgment call before donating.
// This buckets the raw reason into the three-way status the QR scan
// displays to staff: ELIGIBLE, DEFERRED (has a clearance date), or
// CLINICAL_REVIEW (doesn't).
const CLINICAL_REVIEW_REASONS = new Set(["deferredMedical", "deferredClinicalRisk", "deferredMajorMedical"]);

const REASON_MESSAGES = {
  deferredNotWell: "Reported not feeling well today.",
  deferredFasting: "Reported no full meal and fluids in the last 4–6 hours.",
  deferredRecentProcedure: "Reported a medication or minor procedure within the last 4 weeks.",
  deferredMajorMedical: "Reported a major medical history that needs clinical judgment before donating.",
  deferredTransfusionSurgery: "Reported a blood transfusion or surgery within the last 12 months.",
  deferredTravelNeedle:
    "Reported malaria exposure (3 months after a visit, 3 years after living there or finishing treatment) or a needle-stick exposure (12 months) within its deferral window.",
  deferredWeight: "Below the 50kg minimum weight threshold.",
  deferredAge: "Outside the 18-65 eligible age range.",
  deferredInterval: "Within the mandatory 90-day interval since their last recorded donation.",
  deferredTattsPierce: "Within the 12-month deferral window for a recent tattoo/piercing.",
  deferredAlcohol: "Reported alcohol intake within the last 24 hours.",
  deferredMaternal: "Reported as currently pregnant or nursing.",
  deferredMensCycle: "Within 7 days of their last menstrual period.",
  deferredMedical: "Reported an active infection or medication — needs clinical judgment, not a fixed wait.",
  deferredClinicalRisk: "Reported a high-risk exposure — needs clinical judgment, not a fixed wait.",
};

// Mirrors DecisionTreeClassifier.classify(): same nodes, evaluated in the
// same order, first match wins. Returns { reason: null } for eligible.
function runDecisionTree(npt) {
  // Immediate Wellness Check
  if (!npt.feelsWellToday) {
    return { reason: "deferredNotWell", daysRemaining: 0 };
  }

  // Meal / Fluid Intake Check (last 4-6 hrs)
  if (!npt.hasEatenRecently) {
    return { reason: "deferredFasting", daysRemaining: 0 };
  }

  // Node 1: Weight Threshold Check (DOH Standard >= 50kg)
  if (npt.weight < 50.0) {
    return { reason: "deferredWeight", daysRemaining: 0 };
  }

  // Node 2: Age Bracket Check (Standard 18-65)
  if (npt.age < 18 || npt.age > 65) {
    return { reason: "deferredAge", daysRemaining: 0 };
  }

  // Node 3: Last Donation Interval Check (90-day deferral for returning donors)
  if (!npt.isFirstTimeDonor && npt.lastDonationDate) {
    const daysSince = daysBetween(npt.lastDonationDate, new Date());
    if (daysSince < MIN_DONATION_INTERVAL_DAYS) {
      return { reason: "deferredInterval", daysRemaining: MIN_DONATION_INTERVAL_DAYS - daysSince };
    }
  }

  // Node 4: Medical / Active Infection Check
  if (npt.hasActiveInfectOrMeds) {
    return { reason: "deferredMedical", daysRemaining: 0 };
  }

  // Recent Minor Medications/Procedures Check (4-week window, judged
  // against the most recent selected item; any item without a date defers).
  if (npt.recentMedProcedures.length > 0) {
    let mostRecent = null;
    let anyMissingDate = false;
    for (const option of npt.recentMedProcedures) {
      const raw = npt.medProcedureDetails?.[option]?.date;
      const date = raw ? new Date(raw) : null;
      if (!date || Number.isNaN(date.getTime())) {
        anyMissingDate = true;
        continue;
      }
      if (!mostRecent || date > mostRecent) mostRecent = date;
    }
    if (anyMissingDate || !mostRecent) {
      return { reason: "deferredRecentProcedure", daysRemaining: 0 };
    }
    const daysSince = daysBetween(mostRecent, new Date());
    if (daysSince < RECENT_PROCEDURE_DEF_DAYS) {
      return { reason: "deferredRecentProcedure", daysRemaining: RECENT_PROCEDURE_DEF_DAYS - daysSince };
    }
  }

  // Major Medical History Check — judged on the free-text description
  // (medKeywordRules.js), so controlled asthma/diabetes doesn't defer.
  if (npt.hasMajorMedicalHistory) {
    if (assessMajorMedicalHistory(npt.majorMedicalHistoryDesc).verdict === "deferred") {
      return { reason: "deferredMajorMedical", daysRemaining: 0 };
    }
  }

  // Node 5: Tattoo / Piercing Window Check (12 months from the procedure date)
  if (npt.hasTattsOrPierce) {
    if (npt.tattooDate) {
      const daysSince = daysBetween(npt.tattooDate, new Date());
      if (daysSince < TATTOO_DEFERRAL_WINDOW_DAYS) {
        return { reason: "deferredTattsPierce", daysRemaining: TATTOO_DEFERRAL_WINDOW_DAYS - daysSince };
      }
      // else: window has passed — fall through, no longer deferred for this.
    } else {
      // No date on file to verify the window has elapsed — defer.
      return { reason: "deferredTattsPierce", daysRemaining: 0 };
    }
  }

  // Transfusion or Surgery Check (12 months from the event date)
  if (npt.hasTransfusionOrSurgery) {
    if (npt.transfusionOrSurgeryDate) {
      const daysSince = daysBetween(npt.transfusionOrSurgeryDate, new Date());
      if (daysSince < TRANSFUSION_SURGERY_DEF_DAYS) {
        return { reason: "deferredTransfusionSurgery", daysRemaining: TRANSFUSION_SURGERY_DEF_DAYS - daysSince };
      }
    } else {
      return { reason: "deferredTransfusionSurgery", daysRemaining: 0 };
    }
  }

  // Travel or Needle Stick Check — judged on the description: non-endemic
  // travel doesn't defer, malaria defers 3 months after a visit or 3 years
  // after living there or finishing treatment, and needle-stick or
  // tattoo/piercing exposure has 12 months.
  if (npt.hasTravelOrNeedleStick) {
    const assessment = assessTravelOrNeedleStick(npt.travelOrNeedleDesc);
    if (assessment.verdict === "deferred") {
      const windowDays = assessment.labels.includes("Malaria-Endemic Travel")
        ? MALARIA_WINDOW_DAYS[malariaExposureOf(npt.travelOrNeedleDesc)]
        : TRAVEL_NEEDLE_DEF_DAYS;
      if (npt.travelOrNeedleDate) {
        const daysSince = daysBetween(npt.travelOrNeedleDate, new Date());
        if (daysSince < windowDays) {
          return { reason: "deferredTravelNeedle", daysRemaining: windowDays - daysSince };
        }
      } else {
        return { reason: "deferredTravelNeedle", daysRemaining: 0 };
      }
    }
  }

  // Node 6: Alcohol Intake Check (< 24 hrs)
  if (npt.hasAlcoholPast24hr) {
    return { reason: "deferredAlcohol", daysRemaining: 0 };
  }

  // Node 7: Gender-Specific Branching
  if (npt.gender === "female") {
    if (npt.isPregOrNursing === true) {
      return { reason: "deferredMaternal", daysRemaining: 0 };
    }
    if (npt.lastMensPeriodDate) {
      const daysSince = daysBetween(npt.lastMensPeriodDate, new Date());
      if (daysSince < 7) {
        return { reason: "deferredMensCycle", daysRemaining: 7 - daysSince };
      }
    }
    return { reason: null, daysRemaining: 0 };
  }

  if (npt.hasHighRiskExpo === true) {
    return { reason: "deferredClinicalRisk", daysRemaining: 0 };
  }
  return { reason: null, daysRemaining: 0 };
}

// Builds the DonorScreensNPT-equivalent input from a `donors` row (plus its
// health_screening JSONB) and classifies it — same precedence between
// hospital-verified last_donation_at and the donor's self-reported
// lastDonationDate as eligibility_service.dart's screensFromProfile, so the
// two never disagree over which donation date is authoritative.
export function classifyDonorRow(donor) {
  const screening = donor.healthScreening;
  if (!screening || typeof screening !== "object") {
    return {
      status: "UNKNOWN",
      reason: null,
      message: "No completed screening on file for this donor.",
      clearanceDate: null,
      daysRemaining: null,
    };
  }

  const age = donor.age;
  const weightKg = donor.weightKg != null ? Number(donor.weightKg) : null;
  const gender = donor.gender;
  const hasTatts = screening.hasTattsOrPierce;
  const hasAlcohol = screening.hasAlcoholPast24hr;
  const hasActiveInfect = screening.hasActiveInfectOrMeds;

  if (
    typeof age !== "number" ||
    weightKg == null ||
    Number.isNaN(weightKg) ||
    (gender !== "male" && gender !== "female") ||
    typeof hasTatts !== "boolean" ||
    typeof hasAlcohol !== "boolean" ||
    typeof hasActiveInfect !== "boolean"
  ) {
    return {
      status: "UNKNOWN",
      reason: null,
      message: "Screening on file for this donor is incomplete.",
      clearanceDate: null,
      daysRemaining: null,
    };
  }

  const backendLastDonation = donor.lastDonationAt ? new Date(donor.lastDonationAt) : null;
  const selfReportedLastDonation = screening.lastDonationDate ? new Date(screening.lastDonationDate) : null;
  const lastDonationDate = backendLastDonation ?? selfReportedLastDonation;
  const isFirstTimeDonor =
    backendLastDonation != null
      ? false
      : typeof screening.isFirstTimeDonor === "boolean"
        ? screening.isFirstTimeDonor
        : selfReportedLastDonation == null;

  const npt = {
    gender,
    weight: weightKg,
    age,
    isFirstTimeDonor,
    lastDonationDate,
    hasTattsOrPierce: hasTatts,
    tattooDate: screening.tattooDate ? new Date(screening.tattooDate) : null,
    hasAlcoholPast24hr: hasAlcohol,
    hasActiveInfectOrMeds: hasActiveInfect,
    // Same defaults as eligibility_service.dart's screensFromProfile, so an
    // older screening saved before these questions existed still classifies.
    feelsWellToday: typeof screening.feelsWellToday === "boolean" ? screening.feelsWellToday : true,
    hasEatenRecently: typeof screening.hasEatenRecently === "boolean" ? screening.hasEatenRecently : true,
    recentMedProcedures: Array.isArray(screening.recentMedProcedures) ? screening.recentMedProcedures.map(String) : [],
    medProcedureDetails:
      screening.medProcedureDetails && typeof screening.medProcedureDetails === "object" ? screening.medProcedureDetails : {},
    hasMajorMedicalHistory: screening.hasMajorMedicalHistory === true,
    majorMedicalHistoryDesc: screening.majorMedicalHistoryDesc ?? null,
    hasTransfusionOrSurgery: screening.hasTransfusionOrSurgery === true,
    transfusionOrSurgeryDate: screening.transfusionOrSurgeryDate ? new Date(screening.transfusionOrSurgeryDate) : null,
    hasTravelOrNeedleStick: screening.hasTravelOrNeedleStick === true,
    travelOrNeedleDate: screening.travelOrNeedleDate ? new Date(screening.travelOrNeedleDate) : null,
    travelOrNeedleDesc: screening.travelOrNeedleDesc ?? null,
    isPregOrNursing: typeof screening.isPregOrNursing === "boolean" ? screening.isPregOrNursing : null,
    lastMensPeriodDate: screening.lastMensPeriodDate ? new Date(screening.lastMensPeriodDate) : null,
    hasHighRiskExpo: typeof screening.hasHighRiskExpo === "boolean" ? screening.hasHighRiskExpo : null,
  };

  const result = runDecisionTree(npt);
  if (!result.reason) {
    return {
      status: "ELIGIBLE",
      reason: null,
      message: "No deferral flags — eligible to donate.",
      clearanceDate: null,
      daysRemaining: null,
    };
  }

  const status = CLINICAL_REVIEW_REASONS.has(result.reason) ? "CLINICAL_REVIEW" : "DEFERRED";
  const clearanceDate =
    status === "DEFERRED" && result.daysRemaining > 0
      ? new Date(Date.now() + result.daysRemaining * 86400000).toISOString()
      : null;

  return {
    status,
    reason: result.reason,
    message: REASON_MESSAGES[result.reason] || "Deferred.",
    clearanceDate,
    daysRemaining: result.daysRemaining > 0 ? result.daysRemaining : null,
  };
}

// Whether a donor should be asked to come donate right now — used to pick
// who gets "please donate" vs referral pushes. Same answer as the donor's
// own app: the full decision tree when a screening is on file, and only
// the 90-day rule on last_donation_at when it isn't (e.g. an admin-created
// walk-in donor), which is also what the app falls back to.
// Needs age, weightKg, gender, healthScreening and lastDonationAt.
export function canDonateNow(donor) {
  return donorEligibility(donor).isEligible;
}

// canDonateNow plus what the admin Donor Management list shows for a
// donor who can't: daysUntilEligible is the countdown when the deferral is
// a plain wait (null when it isn't, e.g. an active infection), and
// lockReason is the decision-tree reason ("deferredInterval" for the
// 90-day rule — the only one the admin's "Mark Eligible" override can
// clear, since that just resets last_donation_at).
export function donorEligibility(donor) {
  const { status, reason, message, daysRemaining } = classifyDonorRow(donor);
  if (status === "ELIGIBLE") {
    return { isEligible: true, daysUntilEligible: null, lockReason: null, lockMessage: null };
  }
  if (status !== "UNKNOWN") {
    return { isEligible: false, daysUntilEligible: daysRemaining, lockReason: reason, lockMessage: message };
  }
  const daysSince = donor.lastDonationAt ? daysBetween(new Date(donor.lastDonationAt), new Date()) : null;
  if (daysSince == null || daysSince >= MIN_DONATION_INTERVAL_DAYS) {
    return { isEligible: true, daysUntilEligible: null, lockReason: null, lockMessage: null };
  }
  return {
    isEligible: false,
    daysUntilEligible: MIN_DONATION_INTERVAL_DAYS - daysSince,
    lockReason: "deferredInterval",
    lockMessage: REASON_MESSAGES.deferredInterval,
  };
}
