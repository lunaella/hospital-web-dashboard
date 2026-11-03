// What people see for a blood request's priority. The stored values stay
// EMERGENCY / URGENT / NORMAL (request_priority, schema.sql); these are the
// priority terms hospital blood request forms use.
export const PRIORITY_LABEL = {
  EMERGENCY: "STAT",
  URGENT: "ASAP",
  NORMAL: "Routine",
};

export function priorityLabel(priority) {
  return PRIORITY_LABEL[priority] ?? priority;
}

// Maps a priority typed by a person (an import file's Priority column) to
// the stored value, accepting either the labels or the stored names.
export function priorityFromInput(raw) {
  const value = String(raw || "").trim().toUpperCase();
  const fromLabel = Object.entries(PRIORITY_LABEL).find(([, label]) => label.toUpperCase() === value);
  return fromLabel ? fromLabel[0] : value;
}
