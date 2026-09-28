import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Builds the Reports "Export PDF" file directly from the same data the
// screen already fetched — real text and tables, not a screenshot of the
// dashboard. The old implementation was just `window.print()` on the live,
// fixed-1440px, absolutely-positioned page: no print stylesheet reflowed
// it, so the browser's print/PDF renderer rasterized the whole layout at
// whatever scale it decided on, producing the blurry, tiny-text, badly
// paginated PDF this replaces. Nothing here touches the DOM at all.

const PAGE_MARGIN = 40;
const BRAND_RED = [155, 27, 32]; // #9B1B20
const MUTED = [120, 120, 120];
const INK = [20, 20, 20];

function newDoc() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  return doc;
}

function pageBottom(doc) {
  return doc.internal.pageSize.getHeight() - PAGE_MARGIN;
}

function pageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function ensureSpace(doc, y, needed) {
  if (y + needed > pageBottom(doc)) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function sectionTitle(doc, y, title) {
  y = ensureSpace(doc, y, 30);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(title, PAGE_MARGIN, y);
  doc.setDrawColor(...BRAND_RED);
  doc.setLineWidth(1.2);
  doc.line(PAGE_MARGIN, y + 5, pageWidth(doc) - PAGE_MARGIN, y + 5);
  return y + 22;
}

function paragraph(doc, y, text, { fontSize = 10, color = INK, bold = false } = {}) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  const maxWidth = pageWidth(doc) - PAGE_MARGIN * 2;
  const lines = doc.splitTextToSize(text, maxWidth);
  y = ensureSpace(doc, y, lines.length * (fontSize + 3));
  doc.text(lines, PAGE_MARGIN, y);
  return y + lines.length * (fontSize + 3) + 4;
}

function table(doc, y, head, body, columnStyles) {
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    head: [head],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK, lineColor: [220, 220, 220] },
    headStyles: { fillColor: BRAND_RED, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 245, 245] },
    columnStyles,
  });
  return doc.lastAutoTable.finalY + 20;
}

function footer(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      "ResQ — Philippine Red Cross Quezon Chapter — Confidential, internal use only",
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 18
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth(doc) - PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 18,
      { align: "right" }
    );
  }
}

function formatDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function exportReportPdf({
  hospitalName,
  dateRange,
  priorityFilter,
  kpiCards,
  fulfillmentRatePct,
  responseSummary,
  responseTimeSeries,
  fulfillmentBreakdown,
  forecastHeadline,
  advisoryText,
  fulfillmentLog,
  completedRequests,
}) {
  const doc = newDoc();
  let y = PAGE_MARGIN;

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND_RED);
  doc.text("ResQ Analytics Report", PAGE_MARGIN, y);
  y += 24;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const generatedAt = new Date().toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  doc.text(`Hospital: ${hospitalName || "All Hospitals"}`, PAGE_MARGIN, y);
  y += 14;
  doc.text(
    `Range: ${dateRange || "Last 30 days"}   ·   Priority filter: ${
      priorityFilter && priorityFilter !== "all" ? priorityFilter : "All"
    }`,
    PAGE_MARGIN,
    y
  );
  y += 14;
  doc.text(`Generated: ${generatedAt}`, PAGE_MARGIN, y);
  y += 26;

  // Key metrics
  y = sectionTitle(doc, y, "Key Metrics");
  const metricRows = [
    ...(kpiCards || []).map((c) => [
      c.label,
      c.value,
      c.trendPct == null ? "—" : `${c.trendPct > 0 ? "+" : ""}${c.trendPct}%`,
    ]),
    ["Fulfillment Rate (24h)", fulfillmentRatePct != null ? `${fulfillmentRatePct}%` : "—", "—"],
  ];
  y = table(doc, y, ["Metric", "Value", "Trend"], metricRows, {
    0: { cellWidth: 260 },
    1: { cellWidth: 140 },
    2: { cellWidth: 100 },
  });

  // Donor response time
  y = sectionTitle(doc, y, "Donor Response Time");
  y = paragraph(doc, y, responseSummary || "No response-time data available for this range.");
  if (responseTimeSeries?.length) {
    y = table(
      doc,
      y,
      ["Date", "Avg. Response (min)"],
      responseTimeSeries.map((d) => [
        new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        d.avgMinutes == null ? "—" : Math.round(d.avgMinutes).toLocaleString(),
      ]),
      { 0: { cellWidth: 150 }, 1: { cellWidth: 150 } }
    );
  }

  // Fulfillment breakdown
  if (fulfillmentBreakdown?.length) {
    y = sectionTitle(doc, y, "Fulfillment Breakdown by Priority");
    y = table(
      doc,
      y,
      ["Priority", "Share of Requests"],
      fulfillmentBreakdown.map((b) => [b.label, b.value]),
      { 0: { cellWidth: 200 }, 1: { cellWidth: 200 } }
    );
  }

  // Demand forecast
  y = sectionTitle(doc, y, "Demand Forecast");
  y = paragraph(doc, y, forecastHeadline || "No forecast available.");
  y = paragraph(doc, y, advisoryText || "", { color: BRAND_RED, bold: true });

  // Recent fulfillment log
  if (fulfillmentLog?.length) {
    y = sectionTitle(doc, y, "Recent Fulfillment Log");
    y = table(
      doc,
      y,
      ["Request ID", "Blood Type", "Priority", "Time to Confirm", "Rating"],
      fulfillmentLog.map((r) => [
        r.reqId ?? "—",
        r.blood ?? "—",
        r.priority ? r.priority.charAt(0) + r.priority.slice(1).toLowerCase() : "—",
        r.time ?? "—",
        r.rating ?? "Pending",
      ]),
      { 0: { cellWidth: 100 }, 1: { cellWidth: 85 }, 2: { cellWidth: 85 }, 3: { cellWidth: 105 }, 4: { cellWidth: 80 } }
    );
  }

  // Completed requests
  if (completedRequests?.length) {
    y = sectionTitle(doc, y, "Completed Requests");
    y = table(
      doc,
      y,
      ["Request ID", "Hospital", "Blood Type", "Qty", "Requested", "Fulfilled", "Assigned Donor(s)", "Status"],
      completedRequests.map((r) => [
        r.requestId ?? "—",
        r.hospital ?? "—",
        r.bloodType ?? "—",
        r.quantityRequested ?? "—",
        formatDateShort(r.requestDate),
        formatDateShort(r.fulfillmentDate),
        r.assignedDonors?.length ? r.assignedDonors.join(", ") : "—",
        r.status ?? "—",
      ]),
      {
        0: { cellWidth: 58 },
        1: { cellWidth: 75 },
        2: { cellWidth: 48 },
        3: { cellWidth: 28 },
        4: { cellWidth: 55 },
        5: { cellWidth: 55 },
        6: { cellWidth: 98 },
        7: { cellWidth: 48 },
      }
    );
  }

  footer(doc);

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`ResQ-Analytics-Report-${stamp}.pdf`);
}
