import type { TrainingSession } from "@shared/schema";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// jsPDF is only pulled in when a coach actually exports something — same
// lazy-import pattern as exportSessionPdf.ts. English-only text, matching
// every other PDF export in the app (exportSessionPdf, exportPlayPdf,
// exportSeasonReportPdf) — none of them are i18n-aware yet, and mixing a
// translated exercise/session name into an otherwise-English document would
// read as broken rather than localized.
export async function exportWeeklySchedulePdf(
  weekDates: Date[],
  sessionsByDate: Map<string, TrainingSession[]>,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const marginX = 48;
  const marginBottom = 48;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 56;

  const ensureSpace = (next: number) => {
    if (y + next > pageHeight - marginBottom) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Weekly Schedule", marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  const rangeLabel = `${weekDates[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} – ${weekDates[6].toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}`;
  doc.text(rangeLabel, marginX, y);
  y += 30;
  doc.setTextColor(20);

  weekDates.forEach((date, index) => {
    const dateKey = date.toISOString().split("T")[0];
    const daySessions = (sessionsByDate.get(dateKey) ?? []).slice().sort((a, b) => a.time.localeCompare(b.time));

    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(`${DAY_NAMES[index]}, ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, marginX, y);
    y += 18;

    if (daySessions.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(140);
      doc.text("No sessions scheduled", marginX + 12, y);
      y += 18;
    } else {
      for (const session of daySessions) {
        ensureSpace(16);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.setTextColor(20);
        doc.text(session.time, marginX + 12, y);
        doc.setFont("helvetica", "normal");
        doc.text(session.name, marginX + 60, y);
        doc.setFontSize(9.5);
        doc.setTextColor(120);
        doc.text(`${session.duration} min  ·  ${session.status ?? "scheduled"}`, marginX + 60, y + 12);
        y += 28;
      }
    }
    y += 6;
  });

  const fileSlug = `${weekDates[0].toISOString().split("T")[0]}-weekly-schedule`;
  doc.save(`${fileSlug}.pdf`);
}
