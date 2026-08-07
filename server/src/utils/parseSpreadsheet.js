import * as XLSX from "xlsx";

// Minimal RFC 4180-ish CSV parser (quoted fields, embedded commas/newlines,
// "" as an escaped quote) written by hand instead of pulling in a dependency
// for something this small — and, more importantly, so a plain .csv upload
// never touches the xlsx package below. `xlsx` (SheetJS) has a couple of
// known unpatched vulnerabilities (prototype pollution, ReDoS — see `npm
// audit`) in its own parser when fed a maliciously crafted file. These
// import endpoints are admin-only and authenticated, so the exposure is
// already limited, but there's no reason to route CSV content through it
// when the format doesn't need it at all — only real .xlsx/.xls uploads do.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Turns rows-of-arrays into row objects keyed by header, matching the shape
// XLSX.utils.sheet_to_json returns for Excel files, so both formats feed
// identical downstream import logic.
function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  return body.map((cells) => {
    const obj = {};
    header.forEach((key, i) => {
      obj[key.trim()] = (cells[i] ?? "").trim();
    });
    return obj;
  });
}

// Parses an uploaded file buffer into an array of plain row objects keyed by
// header, dispatching on file extension.
export function parseSpreadsheet(buffer, filename) {
  const ext = (filename || "").toLowerCase().split(".").pop();
  if (ext === "csv") {
    return rowsToObjects(parseCsv(buffer.toString("utf8")));
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}
