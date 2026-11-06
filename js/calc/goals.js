// Pure goal maths. A goal saves a fixed amount every month from its start month until it is
// reached, takes that amount out of the Monthly Budget's free money, then (optionally) adds an
// ongoing monthly cost and a one-time payback. No inflation is ever added.
import { addMonths, isMonthKey, monthsBetween, summarizeMonth } from "./budget.js";

const EPS = 0.005;

/** Where the one-time payback may go. */
export const PAYBACK_TARGETS = ["deposit", "loan", "invest"];

/**
 * Turns a goal's fields into a plan.
 * mode "auto": the monthly amount is amount / months between start and target.
 * mode "custom": the user's own monthly amount; the goal is reached when the pot is full.
 * `reach` is the month the goal is reached (money is spent then; no contribution is made in it).
 */
export function goalPlan(d) {
  const bad = { valid: false, n: 0, monthly: 0, reach: null };
  if (!d || !isMonthKey(d.start) || !(d.amount > 0)) return bad;
  if (d.mode === "custom") {
    if (!(d.monthly > 0)) return bad;
    const n = Math.max(1, Math.ceil(d.amount / d.monthly - 1e-9));
    return { valid: true, n, monthly: d.monthly, reach: addMonths(d.start, n) };
  }
  if (!isMonthKey(d.target)) return bad;
  const n = monthsBetween(d.start, d.target);
  if (n < 1) return bad;
  return { valid: true, n, monthly: d.amount / n, reach: d.target };
}

/** What a goal sets aside in a given month (the last month takes only what is still missing). */
export function goalContribution(plan, d, key) {
  if (!plan.valid) return 0;
  const idx = monthsBetween(d.start, key);
  if (idx < 0 || idx >= plan.n) return 0;
  return idx === plan.n - 1 ? Math.max(0, d.amount - plan.monthly * (plan.n - 1)) : plan.monthly;
}

/** The month the one-time payback arrives: the month after the goal is reached. */
export function paybackMonth(plan) {
  return plan.valid ? addMonths(plan.reach, 1) : null;
}

/** Goals that count in the plan, as flat objects. */
export function approvedGoals(goals) {
  return (goals || []).filter((g) => g.approved && g.data).map((g) => ({ id: g.id, ...g.data }));
}

/**
 * Lines goals add to one month of the budget: the monthly allocation while a goal runs,
 * and its ongoing cost from the month it is reached.
 */
export function goalLinesFor(goals, key) {
  const lines = [];
  let total = 0;
  for (const g of goals) {
    const plan = goalPlan(g);
    if (!plan.valid) continue;
    const c = goalContribution(plan, g, key);
    if (c > 0) { lines.push({ kind: "goal", id: g.id, name: g.name, amount: c }); total += c; }
    if (g.ongoing > 0 && key >= plan.reach) { lines.push({ kind: "ongoing", id: g.id, name: g.name, amount: g.ongoing }); total += g.ongoing; }
  }
  return { lines, total };
}

/** Free money per month from the Monthly Budget alone, minus every approved goal except `excludeId`. */
export function budgetFreeFn(budget, goals, excludeId) {
  const others = goals.filter((g) => g.id !== excludeId);
  return (key) => summarizeMonth(budget, key).free - goalLinesFor(others, key).total;
}

/**
 * Checks a goal against free money in every month it runs.
 * Returns whether it fits, how far short it is, and two ways out (a later target, a lower amount).
 */
export function checkGoal(d, freeFor, { horizon = 360 } = {}) {
  const plan = goalPlan(d);
  if (!plan.valid) return { valid: false, plan, ok: false, short: [], worst: 0, suggestLater: null, suggestAmount: null };
  const short = [];
  let worst = 0;
  for (let i = 0; i < plan.n; i++) {
    const key = addMonths(d.start, i);
    const need = goalContribution(plan, d, key);
    const free = freeFor(key);
    if (need > free + EPS) {
      const by = need - Math.max(0, free);
      short.push({ key, free, need, by });
      worst = Math.max(worst, by);
    }
  }
  const ok = short.length === 0;
  let suggestLater = null, suggestAmount = null;
  if (!ok) {
    // Smallest number of months at which the (smaller) monthly amount fits every month so far.
    let minFree = Infinity;
    for (let n = 1; n <= horizon; n++) {
      minFree = Math.min(minFree, freeFor(addMonths(d.start, n - 1)));
      if (n > plan.n && minFree > EPS && d.amount / n <= minFree + EPS) {
        suggestLater = { target: addMonths(d.start, n), months: n, monthly: d.amount / n };
        break;
      }
    }
    // Largest amount that fits in the months the goal already runs.
    let min = Infinity;
    for (let i = 0; i < plan.n; i++) min = Math.min(min, freeFor(addMonths(d.start, i)));
    if (min > EPS) suggestAmount = { amount: Math.floor(min * plan.n), monthly: min };
  }
  return { valid: true, plan, ok, short, worst, suggestLater, suggestAmount };
}
