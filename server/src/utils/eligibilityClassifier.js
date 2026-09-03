// Ported from resq_app/lib/utils/algo/decision_tree_class.dart's
// DecisionTreeClassifier — same rule-based decision tree, same node order,
// same thresholds, kept as a faithful line-by-line port (not reinvented)
// so a donor's status here can never quietly drift from what their own app
// shows. The mobile app is still the source of truth for a donor's actual
// screening answers (health_screening JSONB, written at registration/
// retake) — this module just re-evaluates those same answers server-side,
// for whenever a hospital staffer scanning a donor's QR pass needs an
// instant, official read instead of trusting a client-cached status.

const MIN_DONATION_INTERVAL_DAYS = 90;
const TATTOO_DEFERRAL_WINDOW_DAYS = 365;

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
const CLINICAL_REVIEW_REASONS = new Set(["deferredMedical", "deferredClinicalRisk"]);

const REASON_MESSAGES = {
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

// Mirrors DecisionTreeClassifier.classify(): same seven nodes, evaluated in
// the same order, first match wins. Returns { reason: null } for eligible.
function runDecisionTree(npt) {
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
