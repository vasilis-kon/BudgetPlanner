// Tiny DOM helpers shared by pages.

/** Escapes text before it goes into an HTML string (custom category names come from the user). */
export function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Reads a money field. Returns null when empty, NaN when invalid or negative, otherwise the number. */
export function parseAmount(text) {
  const s = String(text).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}
