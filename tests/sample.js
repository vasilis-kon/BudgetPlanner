// Sample saved data for tests and for tests/seed.html. Months are relative to today so the plan always
// starts "now". Variants: "empty" (budget only), "basic" (plus a house price), "full" (goals, steps, events, support).
export function buildSample(variant = "full", { theme = "system", now = new Date() } = {}) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const plus = (n) => key(new Date(now.getFullYear(), now.getMonth() + n, 1));
  const start = key(now);
  const state = {
    version: 1,
    settings: { startMonth: start, bonusSharePct: 50, theme },
    salary: [{ from: start, amount: 2000 }],
    categories: [
      { id: "rent", icon: "house", builtin: true }, { id: "groceries", icon: "shopping-basket", builtin: true },
      { id: "utilities", icon: "zap", builtin: true }, { id: "transport", icon: "bus", builtin: true },
      { id: "health", icon: "heart-pulse", builtin: true }, { id: "eating", icon: "utensils", builtin: true },
      { id: "subscriptions", icon: "repeat", builtin: true }, { id: "leisure", icon: "ticket", builtin: true },
      { id: "clothing", icon: "shirt", builtin: true }, { id: "other", icon: "circle-ellipsis", builtin: true },
    ],
    months: { [start]: { planned: { rent: 600, groceries: 300, utilities: 120, transport: 80, eating: 60, subscriptions: 20, leisure: 80, other: 40 }, actual: {} } },
    goals: [],
    house: {},
  };
  if (variant !== "empty") state.house = { mode: "price", amount: 150000, ltvPct: 80, costsPct: 7, buffer: 5000 };
  if (variant === "full") {
    state.goals = [
      { id: "car", approved: true, draft: null, data: { name: "Dream Car", start: plus(3), target: plus(15), amount: 3600, mode: "auto", monthly: null, ongoing: 90, paybackAmount: 0, paybackTo: "deposit" } },
      { id: "wed", approved: true, draft: null, data: { name: "Wedding", start: plus(12), target: plus(36), amount: 9600, mode: "auto", monthly: null, ongoing: 0, paybackAmount: 3000, paybackTo: "deposit" } },
      { id: "trip", approved: false, data: null, draft: { name: "Big trip", start: plus(1), target: plus(5), amount: 9000, mode: "auto", monthly: null, ongoing: 0, paybackAmount: 0, paybackTo: "deposit" } },
    ];
    state.house.salarySteps = [{ id: "s1", from: plus(30), amount: 2300 }];
    state.house.costSteps = [{ id: "c1", from: plus(40), catId: "utilities", amount: 140 }];
    state.house.events = [{ id: "e1", name: "Family starts", start: plus(60), end: null, salary: null, costs: { groceries: 450 } },
      { id: "e2", name: "Unemployed", start: plus(90), end: plus(94), salary: 0, costs: {} }];
    state.house.support = { on: true, type: "room", rent: 350, emptyMonths: 1, taxPct: 15, years: 15 };
  }
  return state;
}
