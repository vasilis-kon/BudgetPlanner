// Pure budget maths. No DOM, no storage: everything takes plain data and returns plain data.
// Months are strings "YYYY-MM" (they sort correctly as text).

/** Bonus salaries as a multiple of one net salary, keyed by calendar month number. */
export const BONUS_MONTHS = {
  4: { id: "easter", multiple: 0.5 },
  8: { id: "summer", multiple: 0.5 },
  12: { id: "christmas", multiple: 1 },
};

export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return { year: y, month: m };
}

export function isMonthKey(v) {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function addMonths(key, n) {
  const { year, month } = parseMonth(key);
  const idx = year * 12 + (month - 1) + n;
  return monthKey(Math.floor(idx / 12), (idx % 12) + 1);
}

/** Whole months from a to b (negative if b is earlier). */
export function monthsBetween(a, b) {
  const pa = parseMonth(a), pb = parseMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Net salary in force in a month: the latest step that starts on or before it. */
export function salaryFor(steps, key) {
  if (!steps.length) return 0;
  const sorted = [...steps].sort((a, b) => a.from.localeCompare(b.from));
  let amount = sorted[0].amount; // months before the first step use the first amount
  for (const s of sorted) {
    if (s.from <= key) amount = s.amount;
    else break;
  }
  return amount;
}

/** The bonus salary paid in a month, or null. */
export function bonusFor(steps, key) {
  const b = BONUS_MONTHS[parseMonth(key).month];
  if (!b) return null;
  const amount = salaryFor(steps, key) * b.multiple;
  return { id: b.id, amount };
}

/** The bonus paid in a month when the salary in force is already known (it may come from the House Planner). */
export function bonusForSalary(salary, key) {
  const b = BONUS_MONTHS[parseMonth(key).month];
  return b ? { id: b.id, amount: salary * b.multiple } : null;
}

/** Splits a bonus into the saved part and the part assumed spent. */
export function splitBonus(bonusAmount, sharePct) {
  const share = Math.min(100, Math.max(0, sharePct)) / 100;
  const saved = bonusAmount * share;
  return { saved, spent: bonusAmount - saved };
}

/**
 * Planned amount for a category in a month. A month's own entry wins; otherwise the
 * most recent earlier entry carries forward unchanged (no inflation is ever added).
 * Returns { amount, from } where `from` is the month it came from (null if none).
 */
export function plannedFor(months, catId, key) {
  let bestKey = null;
  for (const k of Object.keys(months)) {
    if (k <= key && isNum(months[k]?.planned?.[catId]) && (bestKey === null || k > bestKey)) bestKey = k;
  }
  return bestKey === null
    ? { amount: 0, from: null }
    : { amount: months[bestKey].planned[catId], from: bestKey };
}

/** Actual logged for a category in a month, or null if nothing was logged. */
export function actualFor(months, catId, key) {
  const v = months[key]?.actual?.[catId];
  return isNum(v) ? v : null;
}

/** What counts as spent: the actual if logged, otherwise the plan. */
export function effectiveSpend(months, catId, key) {
  const a = actualFor(months, catId, key);
  return a !== null ? a : plannedFor(months, catId, key).amount;
}

/**
 * Everything the Monthly Budget page shows for one month.
 * `goalTotal` is what approved goals take out of the month (monthly allocations and ongoing costs).
 * Once the house is bought, `skipCategories` (rent) count as zero and `houseTotal` (the loan installment and the
 * home running costs) takes their place.
 */
export function summarizeMonth({ salarySteps, categoryIds, months, bonusSharePct, goalTotal = 0, houseTotal = 0, skipCategories = [], salaryOverride = null, plannedOverride = null }, key) {
  const salary = salaryOverride !== null ? salaryOverride : salaryFor(salarySteps, key);
  let planned = 0, actual = 0, spent = 0, loggedCount = 0;
  for (const id of categoryIds) {
    if (skipCategories.includes(id)) continue;
    const p = plannedOverride ? plannedOverride(id) : plannedFor(months, id, key).amount;
    const a = actualFor(months, id, key);
    planned += p;
    if (a !== null) { actual += a; loggedCount++; }
    spent += a !== null ? a : p;
  }
  const bonus = salaryOverride !== null ? bonusForSalary(salary, key) : bonusFor(salarySteps, key);
  return {
    salary,
    planned,
    actual,
    spent,
    loggedCount,
    goalTotal,
    houseTotal,
    free: salary - spent - goalTotal - houseTotal,
    freeIfPlanned: salary - planned - goalTotal - houseTotal,
    bonus: bonus && { ...bonus, ...splitBonus(bonus.amount, bonusSharePct) },
  };
}
