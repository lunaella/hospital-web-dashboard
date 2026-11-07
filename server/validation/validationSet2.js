// Second, independent set of decision-tree validation profiles (thesis
// revision matrix: "add independent validation profiles covering omitted and
// multiple-risk cases"). None of these repeat a profile from the first
// 41-profile set (ResQ_Decision_Tree_Validation.xlsx).
//
//   V01–V13  cases the first set left out (female high-risk exposure,
//            malaria lived/treated/keyword cases, transfusion/surgery and
//            needle-stick boundaries, over-65 donors, menstrual boundary)
//   V14–V27  two or three risk factors in the same donor
//   V28–V30  eligible controls, so the labeler doesn't see only deferrals
//
// The real label is the medical technologist's, entered blind in
// ResQ_Decision_Tree_Validation_Set2.xlsx. The results recorded in
// validationSet2.json are only what ResQ currently outputs; the tests use
// them to check that the app and the server agree and to catch unintended
// changes, not as ground truth.
//
// Rebuild the JSON (and the app's copy) after changing a profile or a rule:
//   node validation/buildValidationSet2.js

// Compact profile: days are "days before the test date"; null = not asked /
// no. `meds` items are the app's recent-medicine tiles; daysAgo null = the
// donor selected it without a date.
export const PROFILES = [
  // --- cases the first set left out ---
  { id: "V01", tests: "Female donor reporting high-risk exposure (the omitted case)", sex: "female", age: 29, weight: 55, firstTime: true, periodDaysAgo: 20, highRisk: true },
  { id: "V02", tests: "Female returning donor, post-menopausal, high-risk exposure", sex: "female", age: 52, weight: 60, lastDonationDaysAgo: 200, highRisk: true },
  { id: "V03", tests: "Malaria: lived in an endemic area, left 200 days ago", sex: "male", age: 40, weight: 70, firstTime: true, travel: { desc: "Lived in Puerto Princesa, Palawan for 5 years, moved to Lucena", daysAgo: 200 } },
  { id: "V04", tests: "Malaria: finished treatment 150 days ago", sex: "female", age: 27, weight: 56, firstTime: true, periodDaysAgo: 18, travel: { desc: "Had malaria after a trip to Mindoro, finished treatment", daysAgo: 150 } },
  { id: "V05", tests: "Surgery boundary: 364 days ago", sex: "male", age: 35, weight: 72, firstTime: true, transfusionSurgery: { desc: "Appendectomy", daysAgo: 364 } },
  { id: "V06", tests: "Surgery boundary: exactly 365 days ago", sex: "female", age: 31, weight: 58, firstTime: true, periodDaysAgo: 14, transfusionSurgery: { desc: "Cesarean section", daysAgo: 365 } },
  { id: "V07", tests: "Blood transfusion, date not given", sex: "male", age: 28, weight: 66, firstTime: true, transfusionSurgery: { desc: "Blood transfusion after an accident", daysAgo: null } },
  { id: "V08", tests: "Needle-stick boundary: exactly 365 days ago", sex: "female", age: 45, weight: 62, firstTime: true, periodDaysAgo: 12, travel: { desc: "Accidental needle stick at work", daysAgo: 365 } },
  { id: "V09", tests: "Male donor aged 70, healthy, returning", sex: "male", age: 70, weight: 68, lastDonationDaysAgo: 180 },
  { id: "V10", tests: "Female donor aged 17", sex: "female", age: 17, weight: 52, firstTime: true, periodDaysAgo: 15 },
  { id: "V11", tests: "Menstrual boundary: period started exactly 7 days ago", sex: "female", age: 26, weight: 54, firstTime: true, periodDaysAgo: 7 },
  { id: "V12", tests: "Menstrual boundary: period started 6 days ago", sex: "female", age: 24, weight: 53, firstTime: true, periodDaysAgo: 6 },
  { id: "V13", tests: "Malaria keyword: visit to a rural area 100 days ago", sex: "male", age: 33, weight: 69, firstTime: true, travel: { desc: "Visited a rural area in Sultan Kudarat for a week", daysAgo: 100 } },

  // --- two or three risk factors ---
  { id: "V14", tests: "Two: alcohol in past 24 h and tattoo 30 days ago", sex: "male", age: 30, weight: 70, firstTime: true, alcohol: true, tattooDaysAgo: 30 },
  { id: "V15", tests: "Two: not feeling well and no meal", sex: "female", age: 22, weight: 51, firstTime: true, periodDaysAgo: 16, feelsWell: false, ate: false },
  { id: "V16", tests: "Two: age 17 and weight 47 kg", sex: "male", age: 17, weight: 47, firstTime: true },
  { id: "V17", tests: "Two: pregnant and high-risk exposure", sex: "female", age: 30, weight: 63, firstTime: true, pregnant: true, highRisk: true },
  { id: "V18", tests: "Two: malaria-area visit 60 days ago and alcohol", sex: "male", age: 38, weight: 75, firstTime: true, alcohol: true, travel: { desc: "Trip to Palawan, stayed in Coron", daysAgo: 60 } },
  { id: "V19", tests: "Two: active infection and antibiotics 10 days ago", sex: "male", age: 42, weight: 77, firstTime: true, activeInfection: true, meds: [{ name: "Antibiotics", daysAgo: 10 }] },
  { id: "V20", tests: "Two: last donation 30 days ago and surgery 100 days ago", sex: "female", age: 36, weight: 59, lastDonationDaysAgo: 30, periodDaysAgo: 21, transfusionSurgery: { desc: "Gallbladder removal", daysAgo: 100 } },
  { id: "V21", tests: "Three: breastfeeding, period 3 days ago, alcohol", sex: "female", age: 28, weight: 57, firstTime: true, breastfeeding: true, periodDaysAgo: 3, alcohol: true },
  { id: "V22", tests: "Three: uncontrolled asthma, tattoo 200 days ago, high-risk exposure", sex: "male", age: 25, weight: 64, firstTime: true, majorHistory: "Uncontrolled asthma, uses inhaler daily", tattooDaysAgo: 200, highRisk: true },
  { id: "V23", tests: "Two: diabetes on insulin and weight 49 kg", sex: "male", age: 50, weight: 49, firstTime: true, majorHistory: "Diabetic, on insulin" },
  { id: "V24", tests: "Three items all past their window: controlled asthma, tattoo 400 days ago, period 20 days ago", sex: "female", age: 33, weight: 58, firstTime: true, majorHistory: "Asthma, well controlled", tattooDaysAgo: 400, periodDaysAgo: 20 },
  { id: "V25", tests: "Three items all cleared: vaccine 60 days ago, surgery 400 days ago, Hong Kong trip 100 days ago", sex: "male", age: 46, weight: 80, firstTime: true, meds: [{ name: "Vaccines", daysAgo: 60 }], transfusionSurgery: { desc: "Knee arthroscopy", daysAgo: 400 }, travel: { desc: "Holiday in Hong Kong", daysAgo: 100 } },
  { id: "V26", tests: "Two: high-risk exposure, returning donor 120 days ago", sex: "male", age: 39, weight: 73, lastDonationDaysAgo: 120, highRisk: true },
  { id: "V27", tests: "Two: needle stick 90 days ago and transfusion 200 days ago", sex: "female", age: 41, weight: 61, firstTime: true, periodDaysAgo: 25, transfusionSurgery: { desc: "Blood transfusion during childbirth", daysAgo: 200 }, travel: { desc: "Needle stick injury as a nurse", daysAgo: 90 } },

  // --- eligible controls ---
  { id: "V28", tests: "Control: returning male donor, last donation 200 days ago", sex: "male", age: 40, weight: 71, lastDonationDaysAgo: 200 },
  { id: "V29", tests: "Control: first-time female donor, period 15 days ago", sex: "female", age: 22, weight: 52, firstTime: true, periodDaysAgo: 15 },
  { id: "V30", tests: "Female donor aged 66, first time, post-menopausal", sex: "female", age: 66, weight: 57, firstTime: true },
];

// Dates in the JSON are written as "@-N" (N days before the test date) so
// the profiles stay valid on whatever day the tests run. resolveDates turns
// them into real ISO dates relative to `now`.
const ago = (days) => (days == null ? null : `@-${days}`);

export function toHealthScreening(p) {
  const meds = p.meds ?? [];
  return {
    isFirstTimeDonor: p.firstTime === true,
    lastDonationDate: ago(p.lastDonationDaysAgo),
    feelsWellToday: p.feelsWell !== false,
    hasEatenRecently: p.ate !== false,
    hasActiveInfectOrMeds: p.activeInfection === true,
    recentMedProcedures: meds.map((m) => m.name),
    medProcedureDetails: Object.fromEntries(meds.map((m) => [m.name, { date: ago(m.daysAgo) }])),
    hasMajorMedicalHistory: p.majorHistory != null,
    majorMedicalHistoryDesc: p.majorHistory ?? null,
    hasTattsOrPierce: p.tattooDaysAgo != null,
    tattooDate: ago(p.tattooDaysAgo),
    hasTransfusionOrSurgery: p.transfusionSurgery != null,
    transfusionOrSurgeryDate: ago(p.transfusionSurgery?.daysAgo),
    transfusionOrSurgeryDesc: p.transfusionSurgery?.desc ?? null,
    hasTravelOrNeedleStick: p.travel != null,
    travelOrNeedleDate: ago(p.travel?.daysAgo),
    travelOrNeedleDesc: p.travel?.desc ?? null,
    hasAlcoholPast24hr: p.alcohol === true,
    isPregOrNursing: p.sex === "female" ? p.pregnant === true || p.breastfeeding === true : null,
    lastMensPeriodDate: p.sex === "female" ? ago(p.periodDaysAgo) : null,
    hasHighRiskExpo: p.highRisk === true,
  };
}

export function resolveDates(value, now = new Date()) {
  if (typeof value === "string" && value.startsWith("@-")) {
    return new Date(now.getTime() - Number(value.slice(2)) * 86400000).toISOString();
  }
  if (Array.isArray(value)) return value.map((v) => resolveDates(v, now));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDates(v, now)]));
  }
  return value;
}

export function toDonorRow(fixtureProfile, now = new Date()) {
  return {
    age: fixtureProfile.age,
    weightKg: fixtureProfile.weightKg,
    gender: fixtureProfile.gender,
    lastDonationAt: null,
    healthScreening: resolveDates(fixtureProfile.healthScreening, now),
  };
}
