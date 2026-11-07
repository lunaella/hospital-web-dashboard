// Second validation set (validation/validationSet2.js): checks the server
// classifier still gives the recorded result for every profile. The mobile
// app runs the same file (test/validation_set2_test.dart in resq_app), so
// together they check the app and the server agree. The recorded result is
// ResQ's output, not the medical technologist's label.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyDonorRow } from "../src/utils/eligibilityClassifier.js";
import { toDonorRow } from "../validation/validationSet2.js";

const { profiles } = JSON.parse(readFileSync(new URL("../validation/validationSet2.json", import.meta.url)));

test("validation set 2 has 30 profiles", () => {
  assert.equal(profiles.length, 30);
});

for (const p of profiles) {
  test(`${p.id}: ${p.tests}`, () => {
    const result = classifyDonorRow(toDonorRow(p));
    assert.deepEqual(
      { status: result.status, reason: result.reason, daysRemaining: result.daysRemaining },
      p.resq
    );
  });
}
