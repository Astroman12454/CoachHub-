import { createRoot } from "react-dom/client";
import PlayDiagram from "@/components/PlayDiagram";
import type { Token, Drawing } from "@shared/schema";

interface ExportablePlay {
  name: string;
  category: string;
  courtType: string;
  notes?: string | null;
}

interface ExportableStep {
  tokens: Token[];
  drawings: Drawing[];
}

const RENDER_WIDTH = 700;

// Mounts one PlayDiagram off-screen (not display:none — html2canvas can't
// capture an element that never laid out), lets it paint, snapshots it with
// html2canvas, then tears the mount down. Sequential per step rather than
// all at once, so there's never more than one detached root alive.
async function captureStepImage(
  courtType: "full" | "half",
  step: ExportableStep,
  html2canvas: typeof import("html2canvas").default,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const aspectHeight = courtType === "full" ? 188 : 94;
  const renderHeight = Math.round(RENDER_WIDTH * (aspectHeight / 100));

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${RENDER_WIDTH}px`;
  container.style.height = `${renderHeight}px`;
  document.body.appendChild(container);

  const root = createRoot(container);
  try {
    await new Promise<void>((resolve) => {
      root.render(
        <PlayDiagram courtType={courtType} tokens={step.tokens} drawings={step.drawings} className="w-full h-full" />,
      );
      // Two frames: one for React to commit, one for the browser to paint
      // before html2canvas reads the DOM.
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    // JPEG rather than PNG: the court is always an opaque fill (no
    // transparency to preserve), and PNG's lossless encoding of all those
    // anti-aliased edges/text made a 3-step play balloon to 10+ MB — too
    // big to realistically email or message. JPEG at 0.85 quality is
    // visually indistinguishable here and roughly a tenth of the size.
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), width: canvas.width, height: canvas.height };
  } finally {
    root.unmount();
    container.remove();
  }
}

// jsPDF and html2canvas are only pulled in when a coach actually exports a
// play — no reason to ship ~450KB of PDF/canvas libraries in the main bundle
// for a feature most visits never use.
export async function exportPlayPdf(play: ExportablePlay, steps: ExportableStep[]): Promise<void> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 48;
  const marginBottom = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(play.name, marginX, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(90);
  const courtLabel = play.courtType === "full" ? "Full Court" : "Half Court";
  doc.text(`${play.category.charAt(0).toUpperCase()}${play.category.slice(1)}  ·  ${courtLabel}`, marginX, y);
  y += 20;
  doc.setTextColor(20);

  if (play.notes) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    const lines = doc.splitTextToSize(play.notes, maxWidth) as string[];
    doc.text(lines, marginX, y);
    y += lines.length * 14 + 10;
  }

  const courtType: "full" | "half" = play.courtType === "full" ? "full" : "half";
  // Scaled against a full page's worth of height (as if the step were
  // starting fresh) rather than whatever's left on the current page — the
  // page-break check right below is what actually decides whether to start
  // a new page, so this keeps every step's diagram the same size regardless
  // of where it lands.
  const labelHeight = 14;
  const stepSpacing = 24;
  const fullPageImageHeight = pageHeight - marginBottom - 56 - labelHeight;

  for (let i = 0; i < steps.length; i++) {
    const { dataUrl, width, height } = await captureStepImage(courtType, steps[i], html2canvas);
    const scale = Math.min(maxWidth / width, fullPageImageHeight / height);
    const displayWidth = width * scale;
    const displayHeight = height * scale;

    if (y + labelHeight + displayHeight + stepSpacing > pageHeight - marginBottom) {
      doc.addPage();
      y = 56;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Step ${i + 1}`, marginX, y);
    y += labelHeight;

    doc.addImage(dataUrl, "JPEG", marginX, y, displayWidth, displayHeight);
    y += displayHeight + stepSpacing;
  }

  const fileSlug = play.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "play";
  doc.save(`${fileSlug}-play.pdf`);
}
