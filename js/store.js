// Saved data: one object in localStorage under one versioned key, plus JSON export/import.
import { isMonthKey } from "./calc/budget.js";

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
  { id: "clothing", icon: "shirt", builtin: true },
  { id: "other", icon: "circle-ellipsis", builtin: true },
];

/** Shape of everything we save. goals/house are empty until those pages are built. */
export function emptyState() {
  return {
    version: VERSION,
    settings: { startMonth: null, bonusSharePct: 50, theme: "system" },
    salary: [], // [{ from: "YYYY-MM", amount }]
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    months: {}, // { "YYYY-MM": { planned: { catId: €ish }, actual: { catId: € } } }
    goals: [],
    house: {},
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
      const out = { planned: {}, actual: {} };
      for (const kind of ["planned", "actual"]) {
        for (const [id, v] of Object.entries(m[kind] || {})) if (valid.has(id) && num(v) && v >= 0) out[kind][id] = v;
      }
      s.months[k] = out;
    }
  }
  if (Array.isArray(raw.goals)) s.goals = raw.goals;
  if (raw.house && typeof raw.house === "object") s.house = raw.house;
  return s;
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

export function categoryId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
