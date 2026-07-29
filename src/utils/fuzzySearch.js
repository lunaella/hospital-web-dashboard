// Lightweight fuzzy matcher (subsequence match, same idea used by VS Code's
// command palette / fuzzy finders): every character of the query must appear
// in the target, in order, but not necessarily contiguously. This lets
// "srhjnk" match "Sarah Jenkins", "req92" match "REQ-9012", etc.
export function fuzzyMatch(query, target) {
  if (!query) return true;
  if (!target) return false;

  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();

  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

// Convenience helper: true if the query fuzzy-matches ANY of the given
// fields (e.g. request id, blood type, ward, donor name).
export function fuzzyMatchAny(query, fields) {
  if (!query) return true;
  return fields.some((field) => fuzzyMatch(query, String(field ?? "")));
}
