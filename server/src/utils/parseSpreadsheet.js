import * as XLSX from "xlsx";
import { normalizeHeader } from "./importHelpers.js";

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
  return rows;
}

// How many leading rows to consider when hunting for the real header row —
// generous enough for a title line, a "Generated on ..." note, and a couple
// of blank rows above the actual columns, without scanning the whole file.
const MAX_HEADER_SEARCH_ROWS = 15;

// Real hospital exports routinely have a title row, an export-date note, or
// blank spacer rows above the actual column headers — so row 0 isn't always
// the header. This scores each of the first few rows by how many cells
// normalize-match a header alias we actually recognize for this import type
// (knownAliases, from importHelpers.js's DONOR_ALIASES etc.) and picks the
// best-scoring row. Falls back to row 0 if nothing scores >0, so a file
// whose headers we don't recognize at all still gets a best-effort attempt
// instead of silently returning zero rows — the per-field validation in
// import.controller.js will surface a clear "missing name/phone" style error
// per row either way.
function findHeaderRowIndex(rows, knownAliases) {
  const targets = new Set((knownAliases || []).map(normalizeHeader));
  if (targets.size === 0) return 0;

  let bestIndex = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, MAX_HEADER_SEARCH_ROWS); i++) {
    const score = rows[i].reduce((count, cell) => (targets.has(normalizeHeader(cell)) ? count + 1 : count), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

// Turns rows-of-arrays into row objects keyed by header, matching the shape
// XLSX.utils.sheet_to_json returns for Excel files, so both formats feed
// identical downstream import logic. Rows above the detected header (title/
// note/blank rows) and fully-blank rows in the body are both dropped.
function rowsToObjects(rows, knownAliases) {
  const nonBlank = rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));
  if (nonBlank.length === 0) return [];

  const headerIdx = findHeaderRowIndex(nonBlank, knownAliases);
  const header = nonBlank[headerIdx];
  const body = nonBlank.slice(headerIdx + 1);

  return body.map((cells) => {
    const obj = {};
    header.forEach((key, i) => {
      const label = String(key ?? "").trim();
      if (!label) return; // unnamed/blank header cell — nothing to key on
      obj[label] = String(cells[i] ?? "").trim();
    });
    return obj;
  });
}

// Excel's "Save As CSV (UTF-8)" prepends a byte-order-mark to the file.
// Left in place, it silently glues itself onto the first header cell (e.g.
// "﻿Name"), which then fails every alias lookup for that column —
// a real, common cause of an otherwise-correct file's first column
// (usually Name) coming back empty for every row.
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Parses an uploaded file buffer into an array of plain row objects keyed by
// header, dispatching on file extension. `knownAliases` — the flattened
// list of header names this import type recognizes (see
// importHelpers.js's flattenAliases) — is used only to locate the real
// header row among any title/note/blank rows above it; the actual field
// lookups still happen via field()'s own alias matching downstream.
export function parseSpreadsheet(buffer, filename, knownAliases = []) {
  const ext = (filename || "").toLowerCase().split(".").pop();
  if (ext === "csv") {
    return rowsToObjects(parseCsv(stripBom(buffer.toString("utf8"))), knownAliases);
  }
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  return rowsToObjects(rawRows, knownAliases);
}
