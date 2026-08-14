import type { Player, PlayerEvaluationTestHistory, PlayerGameStatsSummary, DrillAttempt } from "@shared/schema";
import { buildSeasonReportSummary } from "./seasonReport";

function deltaLabel(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return "±0";
}

// jsPDF is only pulled in when a coach actually exports something — same
// lazy-import pattern as exportSessionPdf.ts and exportPlayPdf.tsx, so it
// never inflates the bundle every player profile page pays for on load.
export async function exportSeasonReportPdf(
  player: Player,
  attendanceStats: { total: number; present: number; rate: number },
  evaluationHistory: PlayerEvaluationTestHistory[],
  gameStats: PlayerGameStatsSummary | undefined,
  drillAttempts: DrillAttempt[],
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

  const sectionHeading = (label: string) => {
    ensureSpace(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20);
    doc.text(label, marginX, y);
    y += 20;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(player.name, marginX, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  const subtitleParts = [player.position, "Season Report"].filter((p): p is string => !!p);
  const generatedLabel = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  doc.text(`${subtitleParts.join(" · ")}  ·  Generated ${generatedLabel}`, marginX, y);
  y += 30;
  doc.setTextColor(20);

  sectionHeading("Attendance");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(
    attendanceStats.total > 0
      ? `${attendanceStats.rate}% attendance — present for ${attendanceStats.present} of ${attendanceStats.total} sessions`
      : "No attendance recorded yet.",
    marginX,
    y,
  );
  y += 26;

  const { evaluationProgress, overallShooting, topDrills } = buildSeasonReportSummary(evaluationHistory, drillAttempts);

  sectionHeading("Evaluations");
  if (evaluationProgress.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text("No evaluation results recorded yet.", marginX, y);
    y += 26;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    for (const row of evaluationProgress) {
      ensureSpace(16);
      doc.text(
        `${row.testName}:  Score ${row.firstScore} → ${row.latestScore} (${deltaLabel(row.scoreDelta)})   [${row.first} → ${row.latest} ${row.unit}]`,
        marginX,
        y,
      );
      y += 16;
    }
    y += 10;
  }

  sectionHeading("Shooting & Drills");
  if (!overallShooting) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text("No drill attempts logged yet.", marginX, y);
    y += 26;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(`Overall: ${overallShooting.pct}% (${overallShooting.made}/${overallShooting.total})`, marginX, y);
    y += 18;
    for (const drill of topDrills) {
      ensureSpace(15);
      doc.setFontSize(9.5);
      doc.setTextColor(90);
      doc.text(`•  ${drill.drillName}: ${drill.pct}% (${drill.made}/${drill.total})`, marginX + 4, y);
      y += 15;
    }
    doc.setTextColor(20);
    y += 10;
  }

  sectionHeading("Game Stats");
  if (!gameStats || gameStats.gamesPlayed === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text("No games logged yet.", marginX, y);
    y += 26;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(`${gameStats.gamesPlayed} game${gameStats.gamesPlayed === 1 ? "" : "s"} played`, marginX, y);
    y += 16;
    const statLine = `PTS ${gameStats.points}   REB ${gameStats.rebounds}   AST ${gameStats.assists}   STL ${gameStats.steals}   BLK ${gameStats.blocks}   TO ${gameStats.turnovers}   PF ${gameStats.fouls}`;
    const lines = doc.splitTextToSize(statLine, maxWidth) as string[];
    ensureSpace(lines.length * 14);
    doc.text(lines, marginX, y);
    y += lines.length * 14;
  }

  const fileSlug = player.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "player";
  doc.save(`${fileSlug}-season-report.pdf`);
}
