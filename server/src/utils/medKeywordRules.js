// Ported from resq_app/lib/utils/helpers/med_keyword_rules.dart's
// MedicalKeywordRules — same condition table, same keywords, same verdict
// logic, so the free-text Major Medical History and Travel/Needle-Stick
// descriptions a donor gave in the app are judged identically here
// (eligibilityClassifier.js). Only the verdict and matched condition labels
// are kept; the app's highlight offsets aren't needed server-side.

const MAJOR_MEDICAL_CONDITIONS = [
  {
    label: "Asthma",
    triggerKeywords: ["asthma"],
    deferralKeywords: [
      "severe attack",
      "asthma attack",
      "oral steroid",
      "injected steroid",
      "steroid",
      "unmanaged",
      "difficult to manage",
      "uncontrolled asthma",
      "severe asthma",
    ],
    eligibleKeywords: ["controlled", "mild", "no symptoms", "manageable"],
  },
  {
    label: "Heart Disease",
    triggerKeywords: ["heart disease", "cardiac", "heart attack", "coronary"],
    alwaysDeferred: true,
  },
  {
    label: "Diabetes",
    triggerKeywords: ["diabetes", "diabetic"],
    deferralKeywords: ["insulin", "uncontrolled", "high blood sugar", "beef insulin"],
    eligibleKeywords: ["metformin", "oral medication", "diet controlled", "diet-controlled", "controlled"],
  },
  {
    label: "Neurological Disorder",
    triggerKeywords: ["epilepsy", "seizure", "seizures", "neurological disorder"],
    alwaysDeferred: true,
  },
  {
    label: "Blood/Bleeding/Clotting Disorder",
    triggerKeywords: ["bleeding disorder", "clotting disorder", "hemophilia", "blood disorder", "thrombophilia"],
    alwaysDeferred: true,
  },
  {
    label: "Severe Skin Condition",
    triggerKeywords: ["severe skin condition", "severe psoriasis", "severe eczema", "skin infection"],
    alwaysDeferred: true,
  },
  {
    label: "Autoimmune/Immunosuppressive Disorder",
    triggerKeywords: ["autoimmune", "lupus", "immunosuppressive", "rheumatoid arthritis", "immunocompromised"],
    alwaysDeferred: true,
  },
];

const TRAVEL_CONDITIONS = [
  {
    label: "Malaria-Endemic Travel",
    triggerKeywords: ["malaria", "palawan", "mindoro", "romblon", "endemic area", "rural area"],
    alwaysDeferred: true,
  },
  {
    label: "Needle Stick / Sharps Exposure",
    triggerKeywords: [
      "needle stick",
      "needlestick",
      "accidental needle",
      "someone else's blood",
      "exposure to blood",
      "sharps injury",
      "percutaneous",
    ],
    alwaysDeferred: true,
  },
  {
    label: "Tattoo / Piercing (Commercial Shop)",
    triggerKeywords: ["tattoo", "piercing", "ear piercing", "body piercing"],
    alwaysDeferred: true,
  },
];

// Same lists as the app's malariaExposureOf: had the disease (date = end
// of treatment), lived there (date = when they left), otherwise a visit.
const MALARIA_TREATED_KEYWORDS = [
  "had malaria",
  "treated",
  "treatment",
  "recovered",
  "diagnosed",
  "infected",
  "got malaria",
  "nagka-malaria",
  "nagkamalaria",
];
const MALARIA_LIVED_KEYWORDS = ["lived", "live in", "living", "resident", "reside", "grew up", "moved from", "nakatira", "tumira"];

// "visited" | "lived" | "treated" — only meaningful when the description
// matched "Malaria-Endemic Travel".
export function malariaExposureOf(description) {
  const lower = String(description ?? "").toLowerCase();
  if (lower.includes("malaria") && MALARIA_TREATED_KEYWORDS.some((kw) => lower.includes(kw))) return "treated";
  if (MALARIA_LIVED_KEYWORDS.some((kw) => lower.includes(kw))) return "lived";
  return "visited";
}

// Returns { verdict: "eligible" | "deferred", labels: [matched condition labels] }.
function assess(description, rules, { noMentionVerdict, defaultWhenNoTriggerMatches = "deferred" }) {
  if (description == null || String(description).trim() === "") {
    return { verdict: noMentionVerdict, labels: [] };
  }

  const lower = String(description).toLowerCase();
  const labels = [];
  // Starts unset so a controlled condition can still clear it (same fix as
  // the app's _assess).
  let overallVerdict = null;

  for (const rule of rules) {
    if (!rule.triggerKeywords.some((kw) => lower.includes(kw))) continue;
    labels.push(rule.label);

    let ruleVerdict;
    if (rule.alwaysDeferred) {
      ruleVerdict = "deferred";
    } else if ((rule.deferralKeywords || []).some((kw) => lower.includes(kw))) {
      ruleVerdict = "deferred";
    } else if ((rule.eligibleKeywords || []).some((kw) => lower.includes(kw))) {
      ruleVerdict = "eligible";
    } else {
      // Mentioned but controllability is unclear from the text — err
      // conservative rather than assume it's fine.
      ruleVerdict = "deferred";
    }

    if (ruleVerdict === "deferred") {
      overallVerdict = "deferred";
    } else if (overallVerdict !== "deferred") {
      overallVerdict = "eligible";
    }
  }

  return { verdict: overallVerdict ?? defaultWhenNoTriggerMatches, labels };
}

// A flagged condition with no description always defers pending review.
export function assessMajorMedicalHistory(description) {
  return assess(description, MAJOR_MEDICAL_CONDITIONS, { noMentionVerdict: "deferred" });
}

// Travel that mentions none of the risk keywords is treated as low-risk
// (non-endemic city) and doesn't defer.
export function assessTravelOrNeedleStick(description) {
  return assess(description, TRAVEL_CONDITIONS, {
    noMentionVerdict: "deferred",
    defaultWhenNoTriggerMatches: "eligible",
  });
}
