import type { Exercise, Play, TrainingSession } from "@shared/schema";
import { addMinutesToClock } from "./time";

// jsPDF is only pulled in when a coach actually exports something — no
// reason to ship it in the main bundle for a feature most sessions never use.
export async function exportSessionPlanPdf(
  session: TrainingSession,
  exercises: Exercise[],
  plays: Play[],
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const marginX = 48;
  const marginBottom = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = 56;

  const ensureSpace = (next: number) => {
    if (y + next > pageHeight - marginBottom) {
      doc.addPage();
      y = 56;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(session.name, marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  const dateLabel = new Date(`${session.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.text(`${dateLabel}  ·  ${session.time}  ·  ${session.duration} min`, marginX, y);
  y += 30;
  doc.setTextColor(20);

  if (session.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    ensureSpace(16);
    doc.text("Notes", marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(session.notes, maxWidth) as string[];
    ensureSpace(lines.length * 14);
    doc.text(lines, marginX, y);
    y += lines.length * 14 + 16;
  }

  const selectedExercises = (session.exerciseIds ?? [])
    .map((id) => exercises.find((ex) => ex.id.toString() === id))
    .filter((ex): ex is Exercise => !!ex);

  if (selectedExercises.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    ensureSpace(20);
    doc.text("Practice Timeline", marginX, y);
    y += 22;

    let cumulative = 0;
    for (const ex of selectedExercises) {
      const start = cumulative;
      cumulative += ex.duration;
      const clockStart = addMinutesToClock(session.time, start);
      const clockEnd = addMinutesToClock(session.time, cumulative);
      const timeLabel = clockStart && clockEnd ? `${clockStart} – ${clockEnd}` : `${start}–${cumulative} min`;

      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text(ex.name, marginX, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(120);
      doc.text(`${timeLabel}   ·   ${ex.category}   ·   ${ex.duration} min`, marginX, y + 13);
      y += 26;

      if (ex.description) {
        doc.setFontSize(9.5);
        doc.setTextColor(70);
        const descLines = doc.splitTextToSize(ex.description, maxWidth - 12) as string[];
        ensureSpace(descLines.length * 12);
        doc.text(descLines, marginX + 12, y);
        y += descLines.length * 12 + 6;
      }
      y += 6;
    }
    y += 6;
  }

  const selectedPlays = (session.playIds ?? [])
    .map((id) => plays.find((p) => p.id.toString() === id))
    .filter((p): p is Play => !!p);

  if (selectedPlays.length > 0) {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text("Plays to Practice", marginX, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const play of selectedPlays) {
      ensureSpace(16);
      doc.text(`•  ${play.name}  (${play.category})`, marginX, y);
      y += 16;
    }
  }

  const fileSlug = session.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
  doc.save(`${fileSlug}-plan.pdf`);
}
