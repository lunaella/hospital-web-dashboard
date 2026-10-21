// Decision tree tests for eligibilityClassifier.js. The cases follow the 41
// donor profiles in ResQ_Decision_Tree_Validation.xlsx (P01–P41), so the
// dashboard, QR scan and broadcast targeting stay in step with the app's
// DecisionTreeClassifier. Run with `npm test` from server/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { canDonateNow, classifyDonorRow, donorEligibility } from "../src/utils/eligibilityClassifier.js";

// Local midnight n days ago, as an ISO string — what the app's date pickers
// save into health_screening.
function daysAgo(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

// A healthy first-time donor (P01), with overrides for the donor row and
// its health_screening answers.
function donor({ screening = {}, ...row } = {}) {
  return {
    age: 25,
    weightKg: "55.00",
    gender: "female",
    lastDonationAt: null,
    ...row,
    healthScreening: {
      isFirstTimeDonor: true,
      lastDonationDate: null,
      feelsWellToday: true,
      hasEatenRecently: true,
      hasTattsOrPierce: false,
      tattooDate: null,
      hasAlcoholPast24hr: false,
      hasActiveInfectOrMeds: false,
      recentMedProcedures: [],
      medProcedureDetails: {},
      hasMajorMedicalHistory: false,
      majorMedicalHistoryDesc: null,
      hasTransfusionOrSurgery: false,
      transfusionOrSurgeryDate: null,
      hasTravelOrNeedleStick: false,
      travelOrNeedleDate: null,
      travelOrNeedleDesc: null,
      isPregOrNursing: row.gender === "male" ? null : false,
      lastMensPeriodDate: row.gender === "male" ? null : daysAgo(20),
      hasHighRiskExpo: row.gender === "male" ? false : null,
      ...screening,
    },
  };
}

const male = (overrides = {}) => donor({ gender: "male", weightKg: "68.00", ...overrides });
const meds = (dates) => ({
  recentMedProcedures: Object.keys(dates),
  medProcedureDetails: Object.fromEntries(
    Object.entries(dates).map(([k, d]) => [k, { date: d, dosageOrReason: null }]),
  ),
});

// [id, description, donor row, expected status, expected reason, expected days remaining]
const cases = [
  ["P01", "baseline first-time donor", donor(), "ELIGIBLE"],
  ["P02", "last donation 120 days ago", male({ screening: { isFirstTimeDonor: false, lastDonationDate: daysAgo(120) } }), "ELIGIBLE"],
  ["P03", "exactly 18", male({ age: 18 }), "ELIGIBLE"],
  ["P04", "exactly 65", donor({ age: 65 }), "ELIGIBLE"],
  ["P05", "exactly 50 kg", male({ weightKg: "50.00" }), "ELIGIBLE"],
  ["P06", "last donation exactly 90 days ago", donor({ screening: { isFirstTimeDonor: false, lastDonationDate: daysAgo(90) } }), "ELIGIBLE"],
  ["P07", "antibiotics exactly 28 days ago", male({ screening: meds({ Antibiotics: daysAgo(28) }) }), "ELIGIBLE"],
  ["P08", "tattoo exactly 365 days ago", donor({ screening: { hasTattsOrPierce: true, tattooDate: daysAgo(365) } }), "ELIGIBLE"],
  ["P09", "surgery 400 days ago", male({ screening: { hasTransfusionOrSurgery: true, transfusionOrSurgeryDate: daysAgo(400) } }), "ELIGIBLE"],
  ["P10", "travel to a non-endemic city", male({ screening: { hasTravelOrNeedleStick: true, travelOrNeedleDesc: "Went to Cebu City for a family vacation", travelOrNeedleDate: daysAgo(30) } }), "ELIGIBLE"],
  ["P11", "asthma described as controlled", donor({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Asthma, well controlled, no recent attacks" } }), "ELIGIBLE"],
  ["P12", "diabetes on diet and metformin", male({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Type 2 diabetes controlled with diet and oral medication (metformin)" } }), "ELIGIBLE"],
  ["P13", "last period 10 days ago", donor({ screening: { lastMensPeriodDate: daysAgo(10) } }), "ELIGIBLE"],
  ["P14", "malaria-endemic travel 200 days ago", donor({ screening: { hasTravelOrNeedleStick: true, travelOrNeedleDesc: "Trip to Palawan, stayed in El Nido", travelOrNeedleDate: daysAgo(200) } }), "ELIGIBLE"],

  ["P15", "not feeling well", male({ screening: { feelsWellToday: false } }), "DEFERRED", "deferredNotWell"],
  ["P16", "no meal in 4–6 hours", donor({ screening: { hasEatenRecently: false } }), "DEFERRED", "deferredFasting"],
  ["P17", "49.5 kg", male({ weightKg: "49.50" }), "DEFERRED", "deferredWeight"],
  ["P18", "17 years old", donor({ age: 17 }), "DEFERRED", "deferredAge"],
  ["P19", "66 years old", male({ age: 66 }), "DEFERRED", "deferredAge"],
  ["P20", "last donation 89 days ago", donor({ screening: { isFirstTimeDonor: false, lastDonationDate: daysAgo(89) } }), "DEFERRED", "deferredInterval", 1],
  ["P21", "last donation 30 days ago", male({ screening: { isFirstTimeDonor: false, lastDonationDate: daysAgo(30) } }), "DEFERRED", "deferredInterval", 60],
  ["P22", "active infection or medication", donor({ screening: { hasActiveInfectOrMeds: true } }), "CLINICAL_REVIEW", "deferredMedical"],
  ["P23", "antibiotics 27 days ago", male({ screening: meds({ Antibiotics: daysAgo(27) }) }), "DEFERRED", "deferredRecentProcedure", 1],
  ["P24", "dental work with no date", donor({ screening: meds({ "Dental Work": null }) }), "DEFERRED", "deferredRecentProcedure"],
  ["P25", "aspirin 10 days ago and vaccine 60 days ago", male({ screening: meds({ Aspirin: daysAgo(10), Vaccines: daysAgo(60) }) }), "DEFERRED", "deferredRecentProcedure", 18],
  ["P26", "heart disease", male({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Heart disease, had a coronary bypass in 2022" } }), "CLINICAL_REVIEW", "deferredMajorMedical"],
  ["P27", "epilepsy", donor({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Epilepsy with occasional seizures" } }), "CLINICAL_REVIEW", "deferredMajorMedical"],
  ["P28", "uncontrolled asthma", male({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Uncontrolled asthma, had an asthma attack last week" } }), "CLINICAL_REVIEW", "deferredMajorMedical"],
  ["P29", "tattoo 364 days ago", donor({ screening: { hasTattsOrPierce: true, tattooDate: daysAgo(364) } }), "DEFERRED", "deferredTattsPierce", 1],
  ["P30", "tattoo 30 days ago", male({ screening: { hasTattsOrPierce: true, tattooDate: daysAgo(30) } }), "DEFERRED", "deferredTattsPierce", 335],
  ["P31", "piercing with no date", donor({ screening: { hasTattsOrPierce: true, tattooDate: null } }), "DEFERRED", "deferredTattsPierce"],
  ["P32", "transfusion 100 days ago", male({ screening: { hasTransfusionOrSurgery: true, transfusionOrSurgeryDate: daysAgo(100) } }), "DEFERRED", "deferredTransfusionSurgery", 265],
  ["P33", "malaria-endemic travel 60 days ago", donor({ screening: { hasTravelOrNeedleStick: true, travelOrNeedleDesc: "Visited relatives in a rural area of Palawan", travelOrNeedleDate: daysAgo(60) } }), "DEFERRED", "deferredTravelNeedle", 120],
  ["P34", "needle-stick 90 days ago", donor({ screening: { hasTravelOrNeedleStick: true, travelOrNeedleDesc: "Accidental needle stick injury while working at a clinic", travelOrNeedleDate: daysAgo(90) } }), "DEFERRED", "deferredTravelNeedle", 275],
  ["P35", "alcohol in the past 24 hours", male({ screening: { hasAlcoholPast24hr: true } }), "DEFERRED", "deferredAlcohol"],
  ["P36", "pregnant", donor({ screening: { isPregOrNursing: true } }), "DEFERRED", "deferredMaternal"],
  ["P37", "breastfeeding", donor({ screening: { isPregOrNursing: true } }), "DEFERRED", "deferredMaternal"],
  ["P38", "last period 3 days ago", donor({ screening: { lastMensPeriodDate: daysAgo(3) } }), "DEFERRED", "deferredMensCycle", 4],
  ["P39", "high-risk exposure", male({ screening: { hasHighRiskExpo: true } }), "CLINICAL_REVIEW", "deferredClinicalRisk"],
  ["P40", "48 kg and tattoo 30 days ago (weight is checked first)", male({ weightKg: "48.00", screening: { hasTattsOrPierce: true, tattooDate: daysAgo(30) } }), "DEFERRED", "deferredWeight"],
  ["P41", "diabetes on insulin", male({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Diabetic, on insulin injections" } }), "CLINICAL_REVIEW", "deferredMajorMedical"],
];

for (const [id, description, row, status, reason = null, days = null] of cases) {
  test(`${id}: ${description}`, () => {
    const result = classifyDonorRow(row);
    assert.equal(result.status, status);
    assert.equal(result.reason, reason);
    assert.equal(result.daysRemaining, days);
    assert.equal(canDonateNow(row), status === "ELIGIBLE");
  });
}

test("every deferral reason has a staff-facing message", () => {
  for (const [, , row, status] of cases) {
    if (status === "ELIGIBLE") continue;
    const { message } = classifyDonorRow(row);
    assert.ok(message && message !== "Deferred.", `missing message for ${classifyDonorRow(row).reason}`);
  }
});

test("a timed deferral gets a clearance date; a clinical review does not", () => {
  const timed = classifyDonorRow(male({ screening: { hasTattsOrPierce: true, tattooDate: daysAgo(30) } }));
  assert.ok(timed.clearanceDate);
  const review = classifyDonorRow(male({ screening: { hasHighRiskExpo: true } }));
  assert.equal(review.clearanceDate, null);
});

test("a flagged condition with no description defers pending review", () => {
  const result = classifyDonorRow(donor({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "" } }));
  assert.equal(result.reason, "deferredMajorMedical");
});

test("a condition that isn't on the keyword list defers pending review", () => {
  const result = classifyDonorRow(donor({ screening: { hasMajorMedicalHistory: true, majorMedicalHistoryDesc: "Kidney problems" } }));
  assert.equal(result.reason, "deferredMajorMedical");
});

test("travel flagged with no description defers", () => {
  const result = classifyDonorRow(male({ screening: { hasTravelOrNeedleStick: true, travelOrNeedleDate: daysAgo(30) } }));
  assert.equal(result.reason, "deferredTravelNeedle");
});

test("a transfusion or surgery with no date defers", () => {
  const result = classifyDonorRow(male({ screening: { hasTransfusionOrSurgery: true } }));
  assert.equal(result.reason, "deferredTransfusionSurgery");
  assert.equal(result.daysRemaining, null);
});

test("a hospital-recorded donation overrides a first-time self-report", () => {
  const row = donor({ lastDonationAt: daysAgo(30) });
  const result = classifyDonorRow(row);
  assert.equal(result.reason, "deferredInterval");
  assert.equal(result.daysRemaining, 60);
});

test("a screening saved before the newer questions existed still classifies", () => {
  const row = donor();
  for (const key of ["feelsWellToday", "hasEatenRecently", "recentMedProcedures", "medProcedureDetails", "hasMajorMedicalHistory", "hasTransfusionOrSurgery", "hasTravelOrNeedleStick"]) {
    delete row.healthScreening[key];
  }
  assert.equal(classifyDonorRow(row).status, "ELIGIBLE");
});

test("no screening on file falls back to the 90-day rule", () => {
  const walkIn = { age: null, weightKg: null, gender: null, healthScreening: null, lastDonationAt: null };
  assert.equal(classifyDonorRow(walkIn).status, "UNKNOWN");
  assert.equal(canDonateNow(walkIn), true);

  const recent = { ...walkIn, lastDonationAt: daysAgo(30) };
  const eligibility = donorEligibility(recent);
  assert.equal(eligibility.isEligible, false);
  assert.equal(eligibility.lockReason, "deferredInterval");
  assert.equal(eligibility.daysUntilEligible, 60);
});

test("an incomplete screening is UNKNOWN, not eligible by mistake", () => {
  const row = donor();
  delete row.healthScreening.hasAlcoholPast24hr;
  assert.equal(classifyDonorRow(row).status, "UNKNOWN");
});
