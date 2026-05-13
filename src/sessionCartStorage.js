/**
 * localStorage key — one My program list per browser profile on this device
 * (survives closing the tab; not synced across devices).
 */
export const PROGRAM_CART_STORAGE_KEY = "netsci_personal_program_cart_v1";

/**
 * @typedef {{ kind: 'parallel'|'poster'|'lightning', id: string, title: string, day: string, time: string, speaker: string, sessionLabel: string, addedAt?: string }} CartItem
 */

/** @returns {CartItem[]} */
export function readCartFromStorage() {
  if (typeof localStorage === "undefined") return [];
  try {
    let raw = localStorage.getItem(PROGRAM_CART_STORAGE_KEY);
    if (!raw && typeof sessionStorage !== "undefined") {
      raw = sessionStorage.getItem(PROGRAM_CART_STORAGE_KEY);
      if (raw) {
        try {
          localStorage.setItem(PROGRAM_CART_STORAGE_KEY, raw);
          sessionStorage.removeItem(PROGRAM_CART_STORAGE_KEY);
        } catch {
          /* quota / private mode */
        }
      }
    }
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** @param {CartItem[]} items */
export function writeCartToStorage(items) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PROGRAM_CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode */
  }
}

export function cartItemKey(kind, id) {
  return `${kind}:${String(id)}`;
}

/** @param {string} cell */
function csvEscape(cell) {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {CartItem[]} items
 * @param {(a: CartItem, b: CartItem) => number} sortFn
 */
export function exportCartCsv(items, sortFn) {
  const sorted = [...items].sort(sortFn);
  const header = ["Kind", "Day", "Time", "Session", "Title", "Speaker", "Id"];
  const lines = [header.join(",")];
  for (const it of sorted) {
    lines.push(
      [
        csvEscape(it.kind),
        csvEscape(it.day),
        csvEscape(it.time),
        csvEscape(it.sessionLabel),
        csvEscape(it.title),
        csvEscape(it.speaker),
        csvEscape(it.id),
      ].join(",")
    );
  }
  return lines.join("\r\n");
}

/**
 * @param {CartItem[]} items
 * @param {(a: CartItem, b: CartItem) => number} sortFn
 * @param {{ title?: string }} meta
 */
export function exportCartJson(items, sortFn, meta = {}) {
  const sorted = [...items].sort(sortFn);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: meta.title || "NetSci 2026 Program",
      note: "Saved in this browser on this device (localStorage); not synced elsewhere.",
      items: sorted,
    },
    null,
    2
  );
}

export function triggerDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
