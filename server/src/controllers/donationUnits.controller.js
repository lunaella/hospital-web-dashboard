import { randomBytes } from "node:crypto";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hospitalIdParam } from "../utils/hospitalScope.js";
import { broadcast, broadcastToDonors } from "../realtime/hub.js";
import { ratingFor } from "./requests.controller.js";

// Collected units and what happens to them after collection (migration 029).
//
//   collected -> released  (passed testing; lab-confirmed blood type; +1 inventory)
//   collected -> discarded (failed testing / unusable; never in inventory)
//   released  -> issued    (issued to an open request of the same blood type;
//                           -1 inventory, +1 that request's units_fulfilled)
//
// Every transition locks the unit row (and the request row when issuing) and
// re-checks the unit's status inside the transaction, so two staff clicking
// at the same moment can't release or issue the same unit twice.

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export function newUnitCode() {
  return `DU-${randomBytes(4).toString("hex").toUpperCase()}`;
}

const UNIT_SELECT = `
  u.id, u.unit_code AS "unitCode", u.status, u.blood_type AS "bloodType",
  u.hospital_id AS "hospitalId", u.donor_id AS "donorId", d.name AS "donorName", d.donor_code AS "donorCode",
  u.collected_at AS "collectedAt", u.released_at AS "releasedAt", u.discarded_at AS "discardedAt",
  u.discard_reason AS "discardReason", u.issued_at AS "issuedAt",
  u.screening_override AS "screeningOverride", u.screening_note AS "screeningNote",
  cr.request_code AS "creditedRequestCode", ir.request_code AS "issuedRequestCode"`;

const UNIT_FROM = `
  FROM donation_units u
  LEFT JOIN donors d ON d.id = u.donor_id
  LEFT JOIN blood_requests cr ON cr.id = u.request_id
  LEFT JOIN blood_requests ir ON ir.id = u.issued_request_id`;

// GET /api/donation-units?hospitalId=&status=collected,released
export const listDonationUnits = asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  const hospitalId = hospitalIdParam(req);
  if (hospitalId) {
    params.push(hospitalId);
    where.push(`u.hospital_id = $${params.length}`);
  }
  const statuses = String(req.query.status ?? "collected,released")
    .split(",")
    .filter((s) => ["collected", "released", "discarded", "issued"].includes(s));
  if (statuses.length) {
    params.push(statuses);
    where.push(`u.status = ANY($${params.length}::donation_unit_status[])`);
  }
  const { rows } = await pool.query(
    `SELECT ${UNIT_SELECT} ${UNIT_FROM}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY u.collected_at DESC
     LIMIT 200`,
    params
  );
  res.json(rows);
});

async function lockUnit(client, id) {
  const { rows } = await client.query(
    `SELECT id, unit_code AS "unitCode", status, blood_type AS "bloodType", hospital_id AS "hospitalId",
            donor_id AS "donorId", request_id AS "requestId"
     FROM donation_units WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return rows[0];
}

class TransitionError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function inTransaction(res, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err instanceof TransitionError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  } finally {
    client.release();
  }
}

// POST /api/donation-units/:id/release  { bloodType }
// bloodType is the lab's typing of this unit. If it differs from the donor's
// type on file, the donor's record is corrected and the change logged
// (donor_change_log, changed_by 'lab'); either way the donor's blood type is
// marked lab-confirmed.
export const releaseDonationUnit = asyncHandler(async (req, res) => {
  const labType = req.body?.bloodType;
  if (!BLOOD_TYPES.includes(labType)) {
    return res.status(400).json({ error: "Enter the blood type from the lab's typing of this unit." });
  }
  const result = await inTransaction(res, async (client) => {
    const unit = await lockUnit(client, req.params.id);
    if (!unit) throw new TransitionError(404, "Unit not found.");
    if (unit.status !== "collected") {
      throw new TransitionError(409, `This unit is already ${unit.status}.`);
    }

    let bloodTypeCorrected = false;
    if (unit.donorId) {
      const { rows: donorRows } = await client.query(
        `SELECT blood_type AS "bloodType" FROM donors WHERE id = $1 FOR UPDATE`,
        [unit.donorId]
      );
      const onFile = donorRows[0]?.bloodType ?? null;
      if (onFile !== labType) {
        bloodTypeCorrected = onFile !== null;
        await client.query(
          `INSERT INTO donor_change_log (donor_id, field, old_value, new_value, changed_by, admin_id, reason)
           VALUES ($1, 'blood_type', $2, $3, 'lab', $4, $5)`,
          [unit.donorId, onFile, labType, req.admin.id, `Lab typing of unit ${unit.unitCode}`]
        );
      }
      await client.query(
        `UPDATE donors SET blood_type = $1, blood_type_confirmed_at = now(), updated_at = now() WHERE id = $2`,
        [labType, unit.donorId]
      );
    }

    // A request credited at collection for a different (provisional) type
    // no longer matches; drop that link rather than issue the wrong type.
    const keepCredit = unit.bloodType === labType;
    await client.query(
      `UPDATE donation_units
       SET status = 'released', blood_type = $1, released_at = now(), released_by = $2,
           request_id = CASE WHEN $3 THEN request_id ELSE NULL END
       WHERE id = $4`,
      [labType, req.admin.id, keepCredit, unit.id]
    );
    await client.query(
      `INSERT INTO blood_inventory (hospital_id, blood_type, units_available)
       VALUES ($1, $2, 1)
       ON CONFLICT (hospital_id, blood_type)
       DO UPDATE SET units_available = blood_inventory.units_available + 1, updated_at = now()`,
      [unit.hospitalId, labType]
    );
    return { id: unit.id, unitCode: unit.unitCode, status: "released", bloodType: labType, bloodTypeCorrected, hospitalId: unit.hospitalId };
  });
  if (!result) return;
  res.json(result);
  broadcast({ type: "inventory_updated", hospitalId: result.hospitalId });
});

// POST /api/donation-units/:id/discard  { reason }
export const discardDonationUnit = asyncHandler(async (req, res) => {
  const reason = String(req.body?.reason ?? "").trim();
  if (!reason) return res.status(400).json({ error: "Give a reason for discarding the unit." });
  const result = await inTransaction(res, async (client) => {
    const unit = await lockUnit(client, req.params.id);
    if (!unit) throw new TransitionError(404, "Unit not found.");
    if (unit.status !== "collected") {
      throw new TransitionError(409, `Only a unit still awaiting testing can be discarded; this one is ${unit.status}.`);
    }
    await client.query(
      `UPDATE donation_units SET status = 'discarded', discarded_at = now(), discarded_by = $1, discard_reason = $2
       WHERE id = $3`,
      [req.admin.id, reason, unit.id]
    );
    return { id: unit.id, unitCode: unit.unitCode, status: "discarded" };
  });
  if (result) res.json(result);
});

// POST /api/donation-units/:id/issue  { requestCode? }
// Issues a released unit to an open request (the one credited at
// collection when no requestCode is given). Exact blood-type match only.
export const issueDonationUnit = asyncHandler(async (req, res) => {
  const result = await inTransaction(res, async (client) => {
    const unit = await lockUnit(client, req.params.id);
    if (!unit) throw new TransitionError(404, "Unit not found.");
    if (unit.status !== "released") {
      throw new TransitionError(
        409,
        unit.status === "collected"
          ? "This unit hasn't passed testing yet. Release it before issuing it."
          : `This unit is already ${unit.status}.`
      );
    }

    const requestCode = req.body?.requestCode;
    const { rows: requestRows } = await client.query(
      `SELECT id, request_code AS "requestCode", hospital_id AS "hospitalId", blood_type AS "bloodType",
              units_needed AS "unitsNeeded", units_fulfilled AS "unitsFulfilled", priority,
              created_at AS "createdAt", status
       FROM blood_requests
       WHERE ${requestCode ? "request_code = $1" : "id = $1"}
       FOR UPDATE`,
      [requestCode ?? unit.requestId]
    );
    const request = requestRows[0];
    if (!request) {
      throw new TransitionError(400, requestCode ? "Request not found." : "Choose the request to issue this unit to.");
    }
    if (!["OPEN", "PARTIALLY_FULFILLED"].includes(request.status)) {
      throw new TransitionError(409, `${request.requestCode} is ${request.status.toLowerCase().replace("_", " ")}.`);
    }
    if (request.bloodType !== unit.bloodType) {
      throw new TransitionError(409, `${request.requestCode} needs ${request.bloodType}; this unit is ${unit.bloodType}.`);
    }
    if (request.hospitalId !== unit.hospitalId) {
      throw new TransitionError(409, `${request.requestCode} belongs to another hospital.`);
    }

    const { rowCount } = await client.query(
      `UPDATE blood_inventory SET units_available = units_available - 1, updated_at = now()
       WHERE hospital_id = $1 AND blood_type = $2 AND units_available > 0`,
      [unit.hospitalId, unit.bloodType]
    );
    if (rowCount === 0) {
      throw new TransitionError(409, "Inventory shows no units of this type on hand. Check the stock count first.");
    }

    const newFulfilled = Math.min(request.unitsNeeded, request.unitsFulfilled + 1);
    const isNowFulfilled = newFulfilled >= request.unitsNeeded;
    const resolvedAt = isNowFulfilled ? new Date() : null;
    const rating = isNowFulfilled ? ratingFor(request.priority, (resolvedAt - new Date(request.createdAt)) / 60000) : null;
    const { rows: updated } = await client.query(
      `UPDATE blood_requests
       SET units_fulfilled = $1, status = $2,
           resolved_at = COALESCE($3, resolved_at), system_rating = COALESCE($4, system_rating)
       WHERE id = $5
       RETURNING request_code AS "requestCode", hospital_id AS "hospitalId", units_needed AS "unitsNeeded",
                 units_fulfilled AS "unitsFulfilled", status`,
      [newFulfilled, isNowFulfilled ? "FULFILLED" : "PARTIALLY_FULFILLED", resolvedAt, rating, request.id]
    );
    await client.query(
      `UPDATE donation_units SET status = 'issued', issued_at = now(), issued_by = $1, issued_request_id = $2
       WHERE id = $3`,
      [req.admin.id, request.id, unit.id]
    );
    return { id: unit.id, unitCode: unit.unitCode, status: "issued", request: updated[0] };
  });
  if (!result) return;
  res.json(result);
  broadcast({ type: "broadcast_updated", hospitalId: result.request.hospitalId, requestCode: result.request.requestCode, status: result.request.status });
  broadcast({ type: "inventory_updated", hospitalId: result.request.hospitalId });
  broadcastToDonors({ type: "blood_request_updated" });
});
