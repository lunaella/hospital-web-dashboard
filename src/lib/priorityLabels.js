// What people see for a blood request's priority. The stored values stay
// EMERGENCY / URGENT / NORMAL (request_priority, server/db/schema.sql);
// these are the priority terms hospital blood request forms use. Keep in
// sync with server/src/utils/priorityLabels.js.
export const PRIORITY_LABEL = {
  EMERGENCY: "STAT",
  URGENT: "ASAP",
  NORMAL: "Routine",
};

export function priorityLabel(priority) {
  return PRIORITY_LABEL[priority] ?? priority;
}
