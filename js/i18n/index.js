// Picks the language file and gives pages one helper: t("budget.title", { name: "x" }).
// The language is chosen once, when the page loads: a saved choice, otherwise the browser's language.
// Switching language stores the choice and reloads the page, so every text and number format is rebuilt.
export const LANGS = ["en", "el"];
const LANG_KEY = "bp-lang";

function pickLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch (e) {}
  return String(navigator.language || "").toLowerCase().startsWith("el") ? "el" : "en";
}

export const lang = pickLang();
export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
  location.reload();
}

const dict = (await import(lang === "el" ? "./el.js" : "./en.js")).default;

export function t(path, vars = {}) {
  let v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
  if (v == null) return path; // visible fallback makes a missing key easy to spot
  if (typeof v !== "string") return v; // arrays/objects are returned as-is
  return v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? `{${k}}` : vars[k]));
}

const LOCALE = lang === "el" ? "el-GR" : "en-GB";

const money = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const formatMoney = (n) => money.format(Math.abs(n) < 0.005 ? 0 : n);

const whole = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
/** Whole euros, for projections where cents would be false precision. */
export const formatWhole = (n) => whole.format(Math.abs(n) < 0.5 ? 0 : n);

const compact = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
/** Short money for chart axes: €120K. */
export const formatCompact = (n) => compact.format(n);

const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" });
const monthShortFmt = new Intl.DateTimeFormat(LOCALE, { month: "short", timeZone: "UTC" });
export function formatMonth(key) {
  const [y, m] = key.split("-").map(Number);
  const text = monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
  // Greek month names come out in the nominative ("Νοέμβριος"), but sentences need the accusative ("τον Νοέμβριο").
  return lang === "el" ? text.replace(/ος(?=\s|$)/, "ο") : text;
}
export function formatMonthShort(key) {
  const [y, m] = key.split("-").map(Number);
  return monthShortFmt.format(new Date(Date.UTC(y, m - 1, 1)));
}

const monthNameFmt = new Intl.DateTimeFormat(LOCALE, { month: "long", timeZone: "UTC" });
/** The twelve month names, January first, for dropdowns. */
export const monthNames = () => Array.from({ length: 12 }, (_, i) => monthNameFmt.format(new Date(Date.UTC(2024, i, 1))));

const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-11-07" becomes "7 November 2026". */
export function formatDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return dayFmt.format(new Date(Date.UTC(y, m - 1, d)));
}
