import cron from "node-cron";
import { sendDueApprovalAlerts } from "../services/approvalAlerts.service.js";

// Every minute: re-alerts the Red Cross about broadcasts still awaiting
// approval past their priority's interval (5 / 15 / 60 min for
// EMERGENCY / URGENT / NORMAL) — see services/approvalAlerts.service.js.
// Each tick is one indexed query when nothing is due.
const ESCALATION_CHECK_CRON = "* * * * *";

export function scheduleApprovalEscalation() {
  cron.schedule(ESCALATION_CHECK_CRON, () => {
    sendDueApprovalAlerts().catch((err) => {
      console.error("Approval escalation job failed:", err.message);
    });
  });
}
