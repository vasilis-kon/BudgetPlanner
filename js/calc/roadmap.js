// Builds the roadmap shown on the Home page: every milestone on one timeline, from today to debt-free.
import { addMonths } from "./budget.js";
import { goalPlan, goalContribution } from "./goals.js";

const ORDER = { goal: 0, event: 1, deposit: 2, purchase: 3, fixedEnd: 4, debtFree: 5, loanEnd: 6 };

/**
 * Milestones in date order. Each has a `key` (month), a `kind`, where it links to, and for goals and the
 * deposit a `progress` between 0 and 1. `done` is true for months already past.
 * `goals` are the approved goals as flat objects; `events` are the life events; `result` comes from project().
 */
export function buildRoadmap({ today, goals, events, result }) {
  const items = [];

  for (const g of goals) {
    const plan = goalPlan(g);
    if (!plan.valid) continue;
    let saved = 0;
    for (let i = 0; i < plan.n; i++) {
      const key = addMonths(g.start, i);
      if (key <= today) saved += goalContribution(plan, g, key);
    }
    items.push({ kind: "goal", id: g.id, key: plan.reach, name: g.name, start: g.start, amount: g.amount, monthly: plan.monthly, progress: Math.min(1, saved / g.amount), href: "#/goals" });
  }

  for (const e of events) items.push({ kind: "event", id: e.id, key: e.start, name: e.name, end: e.end, href: "#/house" });

  if (result && result.fin && result.fin.ok) {
    if (result.depositReady) {
      let progress = 0;
      if (today >= result.depositReady) progress = 1;
      else {
        const row = result.rows.find((r) => r.key === today);
        if (row) progress = Math.max(0, Math.min(1, row.depositSavings / result.fin.cashNeeded));
      }
      items.push({ kind: "deposit", key: result.depositReady, cashNeeded: result.fin.cashNeeded, progress, href: "#/house" });
    }
    if (result.purchase) items.push({ kind: "purchase", key: result.purchase, href: "#/house" });
    if (result.fixedEnd && result.endKey && result.fixedEnd <= result.endKey) items.push({ kind: "fixedEnd", key: result.fixedEnd, href: "#/house" });
    if (result.debtFree) items.push({ kind: "debtFree", key: result.debtFree, reason: result.debtFreeReason, href: "#/overview" });
    // The loan keeps being paid after the debt-free declaration; its last installment is a milestone too.
    if (result.debtFree && result.loanEnd && result.loanEnd > result.debtFree) items.push({ kind: "loanEnd", key: result.loanEnd, href: "#/overview" });
  }

  items.sort((a, b) => a.key.localeCompare(b.key) || ORDER[a.kind] - ORDER[b.kind]);
  for (const it of items) it.done = it.key < today;
  return items;
}

/** Index of the first milestone that is not in the past: the "you are here" marker goes just before it. */
export function hereIndex(items, today) {
  const i = items.findIndex((it) => it.key >= today);
  return i === -1 ? items.length : i;
}
