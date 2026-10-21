// Keyword rule tests for medKeywordRules.js, the server copy of the app's
// med_keyword_rules.dart. Run with `npm test` from server/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMajorMedicalHistory, assessTravelOrNeedleStick } from "../src/utils/medKeywordRules.js";

const medical = [
  ["Asthma, well controlled, no recent attacks", "eligible"],
  ["Mild asthma", "eligible"],
  ["Uncontrolled asthma, had an asthma attack last week", "deferred"],
  ["Asthma, on oral steroids", "deferred"],
  ["Asthma", "deferred"], // controllability not stated
  ["Type 2 diabetes controlled with diet and oral medication (metformin)", "eligible"],
  ["Diabetic, on insulin injections", "deferred"],
  ["Diabetes", "deferred"],
  ["Heart disease, had a coronary bypass in 2022", "deferred"],
  ["Epilepsy with occasional seizures", "deferred"],
  ["Hemophilia", "deferred"],
  ["Lupus", "deferred"],
  ["Controlled asthma and heart disease", "deferred"], // any deferring condition wins
  ["Kidney problems", "deferred"], // not on the list
  ["", "deferred"],
  [null, "deferred"],
];

for (const [description, verdict] of medical) {
  test(`major medical: ${JSON.stringify(description)} -> ${verdict}`, () => {
    assert.equal(assessMajorMedicalHistory(description).verdict, verdict);
  });
}

const travel = [
  ["Went to Cebu City for a family vacation", "eligible"],
  ["Business trip to Singapore", "eligible"],
  ["Trip to Palawan, stayed in El Nido", "deferred"],
  ["Visited relatives in a rural area of Palawan", "deferred"],
  ["Accidental needle stick injury while working at a clinic", "deferred"],
  ["Got a tattoo while abroad", "deferred"],
  ["", "deferred"],
  [null, "deferred"],
];

for (const [description, verdict] of travel) {
  test(`travel: ${JSON.stringify(description)} -> ${verdict}`, () => {
    assert.equal(assessTravelOrNeedleStick(description).verdict, verdict);
  });
}

test("travel reports which condition matched", () => {
  assert.deepEqual(assessTravelOrNeedleStick("Trip to Palawan").labels, ["Malaria-Endemic Travel"]);
  assert.deepEqual(assessTravelOrNeedleStick("Needlestick at work").labels, ["Needle Stick / Sharps Exposure"]);
});

test("matching ignores case", () => {
  assert.equal(assessMajorMedicalHistory("ASTHMA, WELL CONTROLLED").verdict, "eligible");
  assert.equal(assessTravelOrNeedleStick("PALAWAN").verdict, "deferred");
});
