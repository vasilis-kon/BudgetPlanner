// Small formatting helpers shared by the pages.
import { t } from "../i18n/index.js";
import { monthKey } from "../calc/budget.js";

/** The month the user is in right now, as "YYYY-MM". */
export function currentMonth() {
  const d = new Date();
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/** "3 years 2 months", "1 year", "5 months". */
export function duration(totalMonths) {
  const n = Math.max(0, Math.round(totalMonths));
  const y = Math.floor(n / 12), m = n % 12;
  const parts = [];
  if (y) parts.push(t(y === 1 ? "time.year" : "time.years", { n: y }));
  if (m || !y) parts.push(t(m === 1 ? "time.month" : "time.months", { n: m }));
  return parts.join(" ");
}

/** The amount in today's euros when `units` is "today", otherwise as it is. */
export function inUnits(amount, factor, units) {
  return units === "today" ? amount * factor : amount;
}
