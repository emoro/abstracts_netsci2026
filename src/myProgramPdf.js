import { jsPDF } from "jspdf";
import {
  computeOverlappingMyProgramKeys,
  formatProgramDayShortLabel,
  parseProgramDayKey,
  parseTimeMinutes,
} from "./programUtils";
import { cartItemKey } from "./sessionCartStorage";

function kindLabel(k) {
  if (k === "poster") return "Poster";
  if (k === "lightning") return "Lightning";
  return "Parallel";
}

function safeLine(s) {
  return String(s ?? "").replace(/\r?\n/g, " ");
}

function groupCartByDay(items) {
  const map = new Map();
  for (const it of items) {
    const day = it.day || "";
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(it);
  }
  const days = [...map.keys()].sort(
    (a, b) => parseProgramDayKey(a) - parseProgramDayKey(b) || a.localeCompare(b)
  );
  for (const d of days) {
    map.get(d).sort((a, b) => parseTimeMinutes(a.time) - parseTimeMinutes(b.time));
  }
  return days.map((day) => ({ day, items: map.get(day) }));
}

function lineHeightMm(fontPt, factor) {
  return ((fontPt * factor) / 72) * 25.4;
}

function ensureSpace(doc, y, needMm, pageH, margin, footerReserve) {
  if (y + needMm <= pageH - footerReserve) return y;
  doc.addPage();
  return margin + 10;
}

/** Same asset as the app header (`ProgramView` / `NetworkView`). */
async function loadConferenceLogoMm() {
  if (typeof window === "undefined" || typeof Image === "undefined") return null;
  const base = import.meta.env.BASE_URL || "/";
  let logoUrl;
  try {
    logoUrl = new URL("netsci2026_logo.png", new URL(base, window.location.origin)).href;
  } catch {
    return null;
  }
  try {
    const res = await fetch(logoUrl, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo decode"));
      img.src = objUrl;
    });
    URL.revokeObjectURL(objUrl);
    const maxH = 11;
    const maxW = 48;
    let h = maxH;
    let w = (img.naturalWidth / img.naturalHeight) * h;
    if (w > maxW) {
      w = maxW;
      h = (img.naturalHeight / img.naturalWidth) * w;
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch {
      return null;
    }
    return { dataUrl, w, h };
  } catch {
    return null;
  }
}

function measureLeftColWidthMm(doc, dayItems) {
  let w = 0;
  for (const it of dayItems) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.7);
    w = Math.max(w, doc.getTextWidth(safeLine(it.time || "—")));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    w = Math.max(w, doc.getTextWidth(kindLabel(it.kind).toUpperCase()));
  }
  return Math.min(34, w + 3.4);
}

/**
 * Same column layout as the My program list on the web (and your screenshot):
 * left: time (bold), kind (small caps); right: title, speaker, session.
 * No Remove, no boxes.
 */
export async function downloadMyProgramPdf(program, items) {
  if (!items.length) return;
  if (!program || typeof program !== "object") {
    throw new Error("Program data is not loaded.");
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const colGap = 3.2;
  const footerReserve = 12;

  const overlapKeys = computeOverlappingMyProgramKeys(items, program);
  const byDay = groupCartByDay(items);

  const lhTime = lineHeightMm(8.7, 1.32);
  const lhKind = lineHeightMm(6.2, 1.25);
  const lhTitle = lineHeightMm(9.9, 1.22);
  const lhSpeaker = lineHeightMm(8, 1.32);
  const lhSession = lineHeightMm(7.6, 1.3);
  const lhOverlap = lineHeightMm(7, 1.25);

  const logo = await loadConferenceLogoMm();
  const logoTop = 9;
  if (logo) {
    doc.addImage(logo.dataUrl, "PNG", margin, logoTop, logo.w, logo.h);
  }

  const titleX = margin + (logo ? logo.w + 3.5 : 0);
  const titleBaseline = logo ? logoTop + logo.h * 0.62 : 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text("NetSci 2026 — My program", titleX, titleBaseline);

  let y = Math.max(titleBaseline + 7, logo ? logoTop + logo.h + 3 : titleBaseline + 8);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`Generated ${new Date().toLocaleString()} · ${items.length} items`, margin, y);
  y += 11;
  doc.setTextColor(0, 0, 0);

  for (const { day, items: dayItems } of byDay) {
    const leftColW = measureLeftColWidthMm(doc, dayItems);
    const xLeft = margin;
    const xRight = margin + leftColW + colGap;
    const textW = Math.max(42, contentW - leftColW - colGap);

    const dayTitle = day ? formatProgramDayShortLabel(day, program) : "Saved items";
    y = ensureSpace(doc, y, lineHeightMm(11, 1.4) + lineHeightMm(7.9, 1.4) + 6, pageH, margin, footerReserve);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(51, 51, 51);
    doc.text(safeLine(dayTitle), margin, y);
    y += lineHeightMm(11, 1.35) + 0.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.9);
    doc.setTextColor(119, 119, 119);
    doc.text(
      `${dayItems.length} ${dayItems.length === 1 ? "saved item" : "saved items"}`,
      margin,
      y
    );
    y += lineHeightMm(7.9, 1.35) + 3.5;
    doc.setTextColor(0, 0, 0);

    for (const it of dayItems) {
      const overlaps = overlapKeys.has(cartItemKey(it.kind, it.id));
      const timeStr = safeLine(it.time || "—");
      const kindStr = kindLabel(it.kind).toUpperCase();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.9);
      const titleLines = doc.splitTextToSize(safeLine(it.title) || "—", textW);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const speakerLines = it.speaker
        ? doc.splitTextToSize(safeLine(it.speaker), textW)
        : [];

      doc.setFontSize(7.6);
      const sessionLines = it.sessionLabel
        ? doc.splitTextToSize(safeLine(it.sessionLabel), textW)
        : [];

      const speakerBlockH = speakerLines.length
        ? speakerLines.length * lhSpeaker + 0.35
        : 0;
      const sessionBlockH = sessionLines.length
        ? sessionLines.length * lhSession + 0.35
        : 0;
      const overlapH = overlaps ? lhOverlap + 0.35 : 0;

      const row1H = Math.max(lhTime, titleLines.length ? lhTitle : 0);
      let estBody;
      if (titleLines.length <= 1) {
        const row2H = speakerLines.length
          ? Math.max(lhKind, lhSpeaker)
          : sessionLines.length || overlaps
            ? Math.max(lhKind, lhSession)
            : lhKind;
        estBody = row1H + 0.35 + row2H + sessionBlockH + overlapH;
        if (
          titleLines.length === 1 &&
          !speakerLines.length &&
          (sessionLines.length || overlaps)
        ) {
          estBody = Math.max(
            lhTime + 0.35 + lhKind,
            lhTitle + 0.35 + sessionBlockH + overlapH
          );
        }
      } else {
        estBody =
          titleLines.length * lhTitle +
          0.4 +
          speakerBlockH +
          sessionBlockH +
          overlapH;
      }
      const estH = estBody + 6;
      y = ensureSpace(doc, y, estH, pageH, margin, footerReserve);

      const y0 = y;
      const yKind = y0 + lhTime + 0.35;
      let ySpeakerStart;
      if (titleLines.length === 1) {
        ySpeakerStart = speakerLines.length ? yKind : y0 + lhTitle + 0.35;
      } else {
        ySpeakerStart = y0 + titleLines.length * lhTitle + 0.4;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.7);
      doc.setTextColor(102, 102, 102);
      doc.text(timeStr, xLeft, y0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.9);
      doc.setTextColor(51, 51, 51);
      doc.text(titleLines, xRight, y0);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.setTextColor(153, 153, 153);
      doc.text(kindStr, xLeft, yKind);

      let yR = ySpeakerStart;
      if (speakerLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(102, 102, 102);
        doc.text(speakerLines, xRight, yR);
        yR += speakerLines.length * lhSpeaker + 0.35;
      }

      if (sessionLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.6);
        doc.setTextColor(102, 102, 102);
        doc.text(sessionLines, xRight, yR);
        yR += sessionLines.length * lhSession + 0.35;
      }

      if (overlaps) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(180, 83, 9);
        doc.text("Overlap", xRight, yR + 0.5);
        yR += lhOverlap + 0.3;
      }

      const leftColBottom = yKind + lhKind;
      const titleColBottom = y0 + titleLines.length * lhTitle;
      y = Math.max(leftColBottom, yR, titleColBottom) + 3.8;
    }

    y += 2;
  }

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 8, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  doc.save(`netsci2026-my-program-${stamp}.pdf`);
}
