// Saved data: one object in localStorage under one versioned key, plus JSON export/import.
import { isMonthKey, monthsBetween } from "./calc/budget.js";
import { goalPlan, PAYBACK_TARGETS } from "./calc/goals.js";

export const STORAGE_KEY = "budgetplanner:v1";
export const VERSION = 1;

export const DEFAULT_CATEGORIES = [
  { id: "rent", icon: "house", builtin: true },
  { id: "groceries", icon: "shopping-basket", builtin: true },
  { id: "utilities", icon: "zap", builtin: true },
  { id: "transport", icon: "bus", builtin: true },
  { id: "health", icon: "heart-pulse", builtin: true },
  { id: "eating", icon: "utensils", builtin: true },
  { id: "subscriptions", icon: "repeat", builtin: true },
  { id: "leisure", icon: "ticket", builtin: true },
  { id: "travel", icon: "plane", builtin: true },
  { id: "clothing", icon: "shirt", builtin: true },
  { id: "other", icon: "circle-ellipsis", builtin: true },
];

/** Starting values for the House Planner. `amount` stays empty until the user enters a price or loan. */
export function defaultHouse() {
  return {
    active: false, // the House Planner is optional: nothing about a house counts until the user switches it on
    mode: "price", // which figure the user enters: "price" or "loan"
    amount: null,
    ltvPct: 80,
    costsPct: 7,
    buffer: 5000,
    loan: { type: "fixed", termYears: 20, rate: 4.2, fixedYears: 5, fixedRate: 3.5, variableRate: 4.5, homeCosts: 120 },
    invest: { sharePct: 50, returnPct: 8, feePct: 0.07, taxPct: 15 },
    support: { on: false, type: "room", rent: 400, emptyMonths: 1, taxPct: 15, years: 20, partnerAmount: 300, partnerStart: null, partnerEnd: null },
    age: null, // the user's age today; the charts run until 65 (retirement in Greece) once it is known
    inflationPct: 2.5, // only used to show amounts in today's euros
    units: "future", // "future" or "today"
    salarySteps: [], // [{ id, from, amount }] expected new net salary from a month
    costSteps: [], // [{ id, from, catId, amount }] expected new monthly amount for a category from a month
    events: [], // [{ id, name, start, end|null, salary|null, costs: { catId: amount } }]
  };
}

/** Shape of everything we save. */
export function emptyState() {
  return {
    version: VERSION,
    settings: { startMonth: null, bonusSharePct: 50, investPct: 0, theme: "system" },
    salary: [], // [{ from: "YYYY-MM", amount }]
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    months: {}, // { "YYYY-MM": { planned: { catId: € baseline from this month }, items: [{ id, date: "YYYY-MM-DD"|null, name, catId, amount }] } }
    goals: [], // [{ id, approved, data: goal fields | null, draft: goal fields | null }]
    house: defaultHouse(),
  };
}

let state = emptyState();
let storageOk = true;
const listeners = new Set();

const num = (v) => typeof v === "number" && Number.isFinite(v);

/** Checks an unknown object and returns a clean state, or null if it cannot be used. */
export function sanitize(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== VERSION) return null;
  const s = emptyState();
  const st = raw.settings || {};
  s.settings.startMonth = isMonthKey(st.startMonth) ? st.startMonth : null;
  s.settings.bonusSharePct = num(st.bonusSharePct) ? Math.min(100, Math.max(0, st.bonusSharePct)) : 50;
  s.settings.investPct = num(st.investPct) ? Math.min(100, Math.max(0, Math.round(st.investPct * 100) / 100)) : 0;
  s.settings.theme = ["light", "dark", "system"].includes(st.theme) ? st.theme : "system";
  if (Array.isArray(raw.salary)) {
    s.salary = raw.salary
      .filter((x) => x && isMonthKey(x.from) && num(x.amount) && x.amount > 0)
      .map((x) => ({ from: x.from, amount: x.amount }));
  }
  if (Array.isArray(raw.categories)) {
    const seen = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
    for (const c of raw.categories) {
      if (c && !c.builtin && typeof c.id === "string" && typeof c.name === "string" && c.name.trim() && !seen.has(c.id)) {
        seen.add(c.id);
        s.categories.push({ id: c.id, name: c.name.trim().slice(0, 40), icon: typeof c.icon === "string" ? c.icon : "circle-ellipsis", builtin: false });
      }
    }
  }
  const valid = new Set(s.categories.map((c) => c.id));
  if (raw.months && typeof raw.months === "object") {
    for (const [k, m] of Object.entries(raw.months)) {
      if (!isMonthKey(k) || !m || typeof m !== "object") continue;
      const out = { planned: {}, items: [] };
      for (const [id, v] of Object.entries(m.planned || {})) if (valid.has(id) && num(v) && v >= 0) out.planned[id] = v;
      // Older backups kept one "actual" total per category: it becomes a single logged item.
      for (const [id, v] of Object.entries(m.actual || {})) {
        if (valid.has(id) && num(v) && v > 0) out.items.push({ id: newId(), date: null, name: "Logged total", catId: id, amount: v });
      }
      const seen = new Set();
      for (const it of Array.isArray(m.items) ? m.items : []) {
        if (!it || typeof it !== "object" || !valid.has(it.catId) || !num(it.amount) || it.amount <= 0 || it.amount > 1e9) continue;
        let id = idOf(it.id);
        while (seen.has(id)) id = newId();
        seen.add(id);
        out.items.push({
          id,
          date: typeof it.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.date) && it.date.startsWith(k) ? it.date : null,
          name: text(it.name, 80),
          catId: it.catId,
          amount: Math.round(it.amount * 100) / 100,
        });
      }
      s.months[k] = out;
    }
  }
  s.goals = sanitizeGoals(raw.goals);
  s.house = sanitizeHouse(raw.house, valid);
  return s;
}

/* ---------- goals and house: clean any object into the exact shape the pages expect ---------- */

const clamp = (v, lo, hi, fallback) => (num(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
const monthOrNull = (v) => (isMonthKey(v) ? v : null);
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOf = (v) => (typeof v === "string" && /^[\w-]{1,40}$/.test(v) ? v : newId());
const amountOrNull = (v) => (num(v) && v >= 0 ? Math.round(v * 100) / 100 : null);

export function goalFields(f) {
  f = f && typeof f === "object" ? f : {};
  return {
    name: text(f.name, 60),
    start: monthOrNull(f.start),
    target: monthOrNull(f.target),
    amount: amountOrNull(f.amount),
    mode: f.mode === "custom" ? "custom" : "auto",
    monthly: amountOrNull(f.monthly),
    ongoing: amountOrNull(f.ongoing) ?? 0,
    paybackAmount: amountOrNull(f.paybackAmount) ?? 0,
    paybackTo: PAYBACK_TARGETS.includes(f.paybackTo) ? f.paybackTo : "deposit",
    replaces: typeof f.replaces === "string" && /^[\w-]{1,40}$/.test(f.replaces) ? f.replaces : null, // an expense category this goal replaces once reached
  };
}

export function sanitizeGoals(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const g of raw) {
    if (!g || typeof g !== "object") continue;
    let id = idOf(g.id);
    while (seen.has(id)) id = newId();
    seen.add(id);
    let data = g.data ? goalFields(g.data) : null;
    let draft = g.draft ? goalFields(g.draft) : null;
    let approved = g.approved === true && data !== null && data.name !== "" && goalPlan(data).valid;
    if (!approved) { draft = draft || data || goalFields({}); data = null; }
    out.push({ id, approved, data: approved ? data : null, draft });
  }
  return out;
}

function stepList(raw, build) {
  return (Array.isArray(raw) ? raw : []).map(build).filter(Boolean).sort((a, b) => a.from.localeCompare(b.from));
}

export function sanitizeHouse(raw, validCats) {
  const d = defaultHouse();
  const h = raw && typeof raw === "object" ? raw : {};
  const L = h.loan || {}, I = h.invest || {}, S = h.support || {};
  const cats = validCats || new Set();
  d.mode = h.mode === "loan" ? "loan" : "price";
  d.amount = num(h.amount) && h.amount > 0 ? h.amount : null;
  // Older saves had no switch: a plan with a price was a house plan.
  d.active = typeof h.active === "boolean" ? h.active : d.amount !== null;
  d.ltvPct = clamp(h.ltvPct, 1, 100, d.ltvPct);
  d.costsPct = clamp(h.costsPct, 0, 30, d.costsPct);
  d.buffer = clamp(h.buffer, 0, 1e7, d.buffer);
  d.loan = {
    type: L.type === "mixed" ? "mixed" : "fixed",
    termYears: clamp(L.termYears, 1, 40, d.loan.termYears),
    rate: clamp(L.rate, 0, 25, d.loan.rate),
    fixedYears: clamp(L.fixedYears, 0, 40, d.loan.fixedYears),
    fixedRate: clamp(L.fixedRate, 0, 25, d.loan.fixedRate),
    variableRate: clamp(L.variableRate, 0, 25, d.loan.variableRate),
    homeCosts: clamp(L.homeCosts, 0, 1e5, d.loan.homeCosts),
  };
  d.invest = {
    sharePct: clamp(I.sharePct, 0, 100, d.invest.sharePct),
    returnPct: clamp(I.returnPct, -20, 30, d.invest.returnPct),
    feePct: clamp(I.feePct, 0, 5, d.invest.feePct),
    taxPct: clamp(I.taxPct, 0, 60, d.invest.taxPct),
  };
  const ps = monthOrNull(S.partnerStart), pe = monthOrNull(S.partnerEnd);
  d.support = {
    on: S.on === true,
    type: S.type === "partner" ? "partner" : "room",
    rent: clamp(S.rent, 0, 1e5, d.support.rent),
    emptyMonths: clamp(S.emptyMonths, 0, 12, d.support.emptyMonths),
    taxPct: clamp(S.taxPct, 0, 60, d.support.taxPct),
    years: clamp(S.years, 0, 50, d.support.years),
    partnerAmount: clamp(S.partnerAmount, 0, 1e5, d.support.partnerAmount),
    partnerStart: ps,
    partnerEnd: ps && pe && pe > ps ? pe : null,
  };
  d.age = num(h.age) && h.age >= 16 && h.age < 65 ? Math.round(h.age) : null;
  d.inflationPct = clamp(h.inflationPct, 0, 20, d.inflationPct);
  d.units = h.units === "today" ? "today" : "future";
  d.salarySteps = stepList(h.salarySteps, (x) =>
    x && isMonthKey(x.from) && num(x.amount) && x.amount > 0 ? { id: idOf(x.id), from: x.from, amount: x.amount } : null);
  d.costSteps = stepList(h.costSteps, (x) =>
    x && isMonthKey(x.from) && cats.has(x.catId) && num(x.amount) && x.amount >= 0 ? { id: idOf(x.id), from: x.from, catId: x.catId, amount: x.amount } : null);
  d.events = (Array.isArray(h.events) ? h.events : []).map((e) => {
    if (!e || !isMonthKey(e.start) || !text(e.name, 60)) return null;
    const costs = {};
    for (const [c, v] of Object.entries(e.costs || {})) if (cats.has(c) && num(v) && v >= 0) costs[c] = v;
    const end = isMonthKey(e.end) && monthsBetween(e.start, e.end) > 0 ? e.end : null;
    return { id: idOf(e.id), name: text(e.name, 60), start: e.start, end, salary: num(e.salary) && e.salary >= 0 ? e.salary : null, costs };
  }).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
  return d;
}

export function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) state = sanitize(JSON.parse(text)) || emptyState();
  } catch (e) {
    storageOk = false; // blocked or corrupted: carry on in memory
  }
  return state;
}

export function getState() {
  return state;
}
export const isStorageOk = () => storageOk;

/** Change the data inside fn, then save and tell listeners. */
export function update(fn) {
  fn(state);
  persist();
  listeners.forEach((l) => l(state));
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

/** Returns true if the text was a valid backup (and replaces the saved data). */
export function importJson(text) {
  let clean = null;
  try {
    clean = sanitize(JSON.parse(text));
  } catch (e) {
    return false;
  }
  if (!clean) return false;
  update((s) => Object.assign(s, clean));
  return true;
}

/** Removes everything this site saved in the browser and starts from an empty plan. */
export function eraseAll() {
  state = emptyState();
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("bp-nav-collapsed");
    localStorage.removeItem("bp-lang");
  } catch (e) {}
  listeners.forEach((l) => l(state));
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function categoryId() {
  return "c" + newId();
}
