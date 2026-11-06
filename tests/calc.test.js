// Tests for the pure money logic in js/calc/ and the data cleaning in js/store.js.
// No test framework: each test throws on failure and the page lists PASS/FAIL.
import { addMonths, monthsBetween, summarizeMonth } from "../js/calc/budget.js";
import { pmt, createLoan, loanSummary, affordability, loanForPayment } from "../js/calc/loan.js";
import { goalPlan, goalContribution, goalLinesFor, checkGoal, approvedGoals } from "../js/calc/goals.js";
import { prepare, project, houseFinance, inputFromState, supportSweep, loanMonths, todayFactor } from "../js/calc/projection.js";
import { emptyState, sanitize, defaultHouse, goalFields } from "../js/store.js";

const results = [];
const test = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, msg: e.message }); }
};
const near = (a, b, tol, what = "") => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what} expected ${b} ± ${tol}, got ${a}`); };
const is = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (a, b, what = "") => { if (a !== b) throw new Error(`${what} expected ${b}, got ${a}`); };

const TODAY = "2026-11";

/** A typical user: €2,000 net salary, €600 rent + €300 groceries, wants a €150,000 home. */
function baseState(over = {}) {
  const st = emptyState();
  st.settings.startMonth = TODAY;
  st.salary = [{ from: TODAY, amount: 2000 }];
  st.months[TODAY] = { planned: { rent: 600, groceries: 300 }, actual: {} };
  st.house.amount = 150000;
  Object.assign(st, over);
  return st;
}
const run = (st, extra = {}) => {
  const inp = { ...inputFromState(st, TODAY), ...extra };
  return project(inp);
};

/* ---------- loan ---------- */
test("pmt: €120,000 at 4.2% over 20 years is about €740 a month", () => near(pmt(120000, 4.2, 240), 740, 1));
test("pmt: zero interest divides evenly", () => near(pmt(12000, 0, 12), 1000, 1e-9));
test("loanForPayment inverts pmt", () => near(loanForPayment(pmt(100000, 3.5, 300), 3.5, 300), 100000, 1e-6));
test("fixed loan: pays off exactly at the end of the term", () => {
  const l = createLoan({ amount: 120000, termYears: 20, type: "fixed", rate: 4.2 });
  let s;
  for (let k = 1; k <= 240; k++) s = l.step();
  near(l.balance, 0, 0.01, "balance");
  near(l.installment, 740, 1, "installment");
  eq(s.k, 240);
});
test("fixed loan: installment never changes", () => {
  const l = createLoan({ amount: 90000, termYears: 15, type: "fixed", rate: 3 });
  const first = l.installment;
  for (let k = 1; k <= 100; k++) { l.step(); near(l.installment, first, 1e-9, "installment"); }
});
test("mixed loan: installment is recalculated once, when the fixed period ends", () => {
  const p = { amount: 100000, termYears: 20, type: "mixed", fixedYears: 5, fixedRate: 3, variableRate: 5, rate: 4 };
  const l = createLoan(p);
  const first = l.installment;
  for (let k = 1; k <= 60; k++) { const s = l.step(); near(s.installment, first, 1e-9, "fixed phase"); }
  const s61 = l.step();
  is(s61.installment > first, "variable rate is higher, so the installment must rise");
  for (let k = 62; k <= 240; k++) l.step();
  near(l.balance, 0, 0.01, "balance at end");
  const sum = loanSummary(p);
  near(sum.first, first, 1e-9);
  near(sum.later, s61.installment, 1e-9);
});
test("extra repayment shortens the loan and keeps the installment", () => {
  const l = createLoan({ amount: 100000, termYears: 20, type: "fixed", rate: 4 });
  const A = l.installment;
  l.step(20000);
  near(l.installment, A, 1e-9);
  let k = 1;
  while (l.balance > 0) { l.step(); k++; }
  // 80,000 left at 4% with the same installment clears in about 174 months, so well over 5 years are saved.
  is(k >= 170 && k <= 180, "expected about 175 months, got " + k);
});
test("affordability bands: 35% ok, 40% tight, above that over", () => {
  eq(affordability(700, 2000).level, "ok");
  eq(affordability(760, 2000).level, "tight");
  eq(affordability(900, 2000).level, "over");
});
test("loan clone continues independently", () => {
  const l = createLoan({ amount: 50000, termYears: 10, type: "fixed", rate: 4 });
  l.step();
  const c = l.clone();
  c.step(); c.step();
  eq(l.k, 1); eq(c.k, 3);
});

/* ---------- goals ---------- */
const G = { id: "g1", name: "Wedding", start: "2027-01", target: "2027-12", amount: 6000, mode: "auto", monthly: null, ongoing: 0, paybackAmount: 0, paybackTo: "deposit" };
test("goal plan (auto): amount divided by months between start and target", () => {
  const p = goalPlan({ ...G, target: "2028-01" });
  eq(p.n, 12); near(p.monthly, 500, 1e-9); eq(p.reach, "2028-01");
});
test("goal contribution covers exactly the goal's months", () => {
  const d = { ...G, target: "2028-01" };
  const p = goalPlan(d);
  eq(goalContribution(p, d, "2026-12"), 0);
  near(goalContribution(p, d, "2027-01"), 500, 1e-9);
  near(goalContribution(p, d, "2027-12"), 500, 1e-9);
  eq(goalContribution(p, d, "2028-01"), 0);
  let sum = 0;
  for (let i = 0; i < 24; i++) sum += goalContribution(p, d, addMonths("2026-12", i));
  near(sum, 6000, 1e-6, "total");
});
test("goal plan (custom): own monthly amount gives the reach date", () => {
  const p = goalPlan({ ...G, mode: "custom", monthly: 400 });
  eq(p.n, 15); eq(p.reach, "2028-04");
  const d = { ...G, mode: "custom", monthly: 400 };
  let sum = 0;
  for (let i = 0; i < 20; i++) sum += goalContribution(p, d, addMonths("2027-01", i));
  near(sum, 6000, 1e-6, "total incl. the smaller last month");
});
test("goal that does not fit: reports the shortfall and a later target", () => {
  const d = { ...G, target: "2028-01" };
  const r = checkGoal(d, () => 300);
  is(!r.ok, "must not fit"); near(r.worst, 200, 1e-9, "shortfall");
  eq(r.suggestLater.months, 20); eq(r.suggestLater.target, "2028-09");
  eq(r.suggestAmount.amount, 3600);
});
test("goal that fits is approved as is", () => {
  const r = checkGoal({ ...G, target: "2028-01" }, () => 800);
  is(r.ok, "should fit"); eq(r.short.length, 0);
});
test("goal lines: allocation while running, ongoing cost after", () => {
  const d = { ...G, target: "2027-04", amount: 300, ongoing: 50 };
  eq(goalLinesFor([d], "2027-02").total, 100);
  eq(goalLinesFor([d], "2027-04").total, 50);
  eq(goalLinesFor([d], "2026-12").total, 0);
});
test("budget free money drops by what goals take", () => {
  const b = { salarySteps: [{ from: TODAY, amount: 2000 }], categoryIds: ["rent"], months: { [TODAY]: { planned: { rent: 600 }, actual: {} } }, bonusSharePct: 50 };
  near(summarizeMonth(b, TODAY).free, 1400, 1e-9);
  near(summarizeMonth({ ...b, goalTotal: 250 }, TODAY).free, 1150, 1e-9);
});

/* ---------- projection ---------- */
test("house finance from price: LTV, costs and buffer", () => {
  const f = houseFinance({ ...defaultHouse(), amount: 150000 });
  near(f.loan, 120000, 1e-6); near(f.down, 30000, 1e-6); near(f.costs, 10500, 1e-6); near(f.cashNeeded, 45500, 1e-6);
});
test("house finance from loan amount works backwards to the price", () => {
  const f = houseFinance({ ...defaultHouse(), mode: "loan", amount: 120000 });
  near(f.price, 150000, 1e-6);
});
test("no price entered: projection stays empty", () => {
  const st = baseState(); st.house.amount = null;
  const r = run(st);
  is(!r.fin.ok && r.rows.length === 0, "should be empty");
});
test("deposit ready after roughly three years", () => {
  const r = run(baseState());
  is(r.depositReady !== null, "deposit date missing");
  const m = monthsBetween(TODAY, r.depositReady);
  is(m >= 33 && m <= 37, "expected about 35 months, got " + m);
  eq(r.purchase, addMonths(r.depositReady, 1));
});
test("debt-free comes after purchase, before the loan term ends, and the portfolio covers the balance", () => {
  const r = run(baseState());
  is(r.debtFree !== null, "no debt-free month");
  is(r.debtFree > r.purchase, "debt-free must follow the purchase");
  is(r.debtFree <= r.termEnd, "debt-free no later than the end of the term");
  eq(r.debtFreeReason, "portfolio");
  is(r.debtFreeInfo.portfolioAfterTax >= r.debtFreeInfo.balance - 0.01, "portfolio must cover the balance");
  const last = r.rows[r.rows.length - 1];
  eq(last.key, r.debtFree);
});
test("the month before debt-free the portfolio did not yet cover the loan", () => {
  const r = run(baseState());
  const before = r.rows[r.rows.length - 2];
  is(before.investments < before.loan, "portfolio " + before.investments + " vs loan " + before.loan);
});
test("rent stops at purchase and home costs plus installment start", () => {
  const r = run(baseState());
  const pre = r.rows.find((x) => x.key === r.depositReady);
  const post = r.rows.find((x) => x.key === r.purchase);
  near(pre.spend, 900, 1e-6, "spend before");
  near(post.spend, 300 + 120, 1e-6, "groceries + home running costs");
  near(post.installment, 740, 1, "installment");
});
test("installment stays fixed in euros for the whole loan", () => {
  const r = run(baseState());
  const inst = r.rows.filter((x) => x.owns).map((x) => x.installment);
  inst.forEach((v) => near(v, inst[0], 0.01, "installment"));
});
test("pay is fully accounted for each year (salary + bonus = where it went)", () => {
  const r = run(baseState());
  const y = r.years.find((x) => x.year === 2028);
  const rows = r.rows.filter((x) => x.key.startsWith("2028"));
  const pay = rows.reduce((a, x) => a + x.salary + x.bonus, 0);
  const f = y.nom;
  near(f.living + f.goals + f.installment + f.invested + f.toBank + f.bonusSpent, pay, 0.01, "flows vs pay");
});
test("bonus share: saved part reaches the deposit before purchase", () => {
  const a = run(baseState());
  const st = baseState(); st.settings.bonusSharePct = 0;
  const b = run(st);
  is(monthsBetween(a.depositReady, b.depositReady) > 0, "no bonus saved should be slower");
});
test("an approved goal delays the deposit and that delay is measurable", () => {
  const without = run(baseState());
  const st = baseState();
  st.goals = [{ id: "g1", approved: true, data: goalFields({ ...G, name: "Car", start: "2027-01", target: "2028-01", amount: 6000 }), draft: null }];
  const withGoal = run(st);
  const delay = monthsBetween(without.depositReady, withGoal.depositReady);
  is(delay >= 4 && delay <= 6, "6000 over free money of ~1100+bonus should delay about 5 months, got " + delay);
});
test("goal payback to the deposit moves the deposit earlier than no payback", () => {
  const mk = (pay) => {
    const st = baseState();
    st.goals = [{ id: "g1", approved: true, data: goalFields({ ...G, name: "Wedding", start: "2027-01", target: "2028-01", amount: 6000, paybackAmount: pay, paybackTo: "deposit" }), draft: null }];
    return run(st);
  };
  is(monthsBetween(mk(5000).depositReady, mk(0).depositReady) > 0, "payback should speed the deposit up");
});
test("goal payback arriving after the purchase cannot go to the deposit", () => {
  const st = baseState();
  st.goals = [{ id: "g1", approved: true, data: goalFields({ name: "Late", start: "2036-01", target: "2037-01", amount: 3000, paybackAmount: 1000, paybackTo: "deposit" }), draft: null }];
  const r = run(st);
  is(r.paybackFallbacks.includes("g1"), "should fall back to investments");
});
test("goal ongoing cost reduces leftover after it is reached", () => {
  const st = baseState();
  st.goals = [{ id: "g1", approved: true, data: goalFields({ name: "Car", start: "2027-01", target: "2027-07", amount: 3000, ongoing: 150 }), draft: null }];
  const r = run(st);
  const row = r.rows.find((x) => x.key === "2027-08");
  near(row.ongoing, 150, 1e-9);
});
test("unemployment event: salary drops then returns, and the months are flagged", () => {
  const st = baseState();
  st.house.events = [{ id: "e1", name: "Unemployed", start: "2030-01", end: "2030-05", salary: 0, costs: {} }];
  const inp = inputFromState(st, TODAY);
  const prep = prepare(inp);
  const idx = (k) => monthsBetween(TODAY, k);
  eq(prep.salary[idx("2029-12")], 2000);
  eq(prep.salary[idx("2030-01")], 0);
  eq(prep.salary[idx("2030-04")], 0);
  eq(prep.salary[idx("2030-05")], 2000);
  const r = project(inp, prep);
  is(r.problems.length >= 1, "unemployed months must be flagged");
  eq(r.problems[0].from, "2030-01");
  eq(r.problems[0].months, 4);
});
test("expected salary step raises salary only from that month", () => {
  const st = baseState();
  st.house.salarySteps = [{ id: "s1", from: "2028-01", amount: 2500 }];
  const prep = prepare(inputFromState(st, TODAY));
  eq(prep.salary[monthsBetween(TODAY, "2027-12")], 2000);
  eq(prep.salary[monthsBetween(TODAY, "2028-01")], 2500);
});
test("cost step changes a category from its month, nothing before", () => {
  const st = baseState();
  st.house.costSteps = [{ id: "c1", from: "2029-01", catId: "groceries", amount: 450 }];
  const prep = prepare(inputFromState(st, TODAY));
  const at = (k) => prep.spend[monthsBetween(TODAY, k)];
  eq(at("2028-12"), 900);
  eq(at("2029-01"), 1050);
});
test("no automatic salary growth or inflation: spend and salary are flat without steps", () => {
  const prep = prepare(inputFromState(baseState(), TODAY));
  is(prep.salary.every((s) => s === 2000), "salary must stay 2000");
  is(prep.spend.every((s) => s === 900), "spend must stay 900");
});
test("room rent speeds up debt-free; partner contribution does too", () => {
  const base = run(baseState());
  const st = baseState(); st.house.support = { ...st.house.support, on: true, type: "room", rent: 400, years: 20 };
  const room = run(st);
  is(room.debtFree < base.debtFree, "room rent should bring debt-free earlier");
  const st2 = baseState(); st2.house.support = { ...st2.house.support, on: true, type: "partner", partnerAmount: 500, partnerStart: "2029-01", partnerEnd: null };
  const partner = run(st2);
  is(partner.debtFree < base.debtFree, "partner contribution should bring debt-free earlier");
});
test("room rent counts only for the chosen number of years from purchase", () => {
  const mk = (years) => { const st = baseState(); st.house.support = { ...st.house.support, on: true, type: "room", years }; return run(st); };
  const none = mk(0), five = mk(5), twenty = mk(20);
  is(none.debtFree >= five.debtFree && five.debtFree >= twenty.debtFree, "more years of rent should never be slower");
});
test("support sweep returns years-to-debt-free that never get worse with more support years", () => {
  const st = baseState(); st.house.support = { ...st.house.support, on: true, type: "room" };
  const inp = inputFromState(st, TODAY);
  const pts = supportSweep(inp, prepare(inp), 10);
  eq(pts.length, 11);
  for (let i = 1; i < pts.length; i++) is(pts[i].toDebtFree <= pts[i - 1].toDebtFree + 1e-9, "year " + i);
});
test("a salary too low to ever fund the deposit gives no purchase date", () => {
  const st = baseState(); st.salary = [{ from: TODAY, amount: 900 }];
  const r = run(st);
  eq(r.depositReady, null); eq(r.debtFree, null);
});
test("higher price takes longer", () => {
  const a = run(baseState());
  const st = baseState(); st.house.amount = 220000;
  const b = run(st);
  is(b.depositReady > a.depositReady, "dearer house, later deposit");
});
test("today's euros: factor shrinks with time and is 1 today", () => {
  near(todayFactor(TODAY, TODAY, 2.5), 1, 1e-12);
  near(todayFactor(TODAY, addMonths(TODAY, 120), 2.5), Math.pow(1.025, -10), 1e-9);
});
test("loan months and fixed end for a mixed loan", () => {
  const st = baseState();
  st.house.loan = { ...st.house.loan, type: "mixed", fixedYears: 5 };
  const r = run(st);
  eq(r.fixedEnd, addMonths(r.purchase, 60));
  is(r.loanLaterInstallment > r.loanFirstInstallment, "variable 4.5% vs fixed 3.5%");
  is(loanMonths(r) > 0, "loan months");
});
test("overview rows: last year ends at debt-free and bank is never double counted", () => {
  const r = run(baseState());
  const last = r.years[r.years.length - 1];
  eq(last.key, r.debtFree);
  near(last.nom.bank, last.nom.depositSavings + last.nom.buffer + last.nom.goalFunds + last.nom.unspent, 1e-6, "bank parts");
});
test("saved money from the deposit stage: purchase pays down payment and costs from the pot", () => {
  const r = run(baseState());
  const before = r.rows.find((x) => x.key === r.depositReady);
  const after = r.rows.find((x) => x.key === r.purchase);
  is(before.depositSavings >= 45500, "pot must reach the cash needed");
  near(after.buffer, 5000, 400, "buffer remains after purchase");
});

/* ---------- saved data ---------- */
test("a fresh state survives a save and load unchanged", () => {
  const st = baseState();
  const back = sanitize(JSON.parse(JSON.stringify(st)));
  eq(JSON.stringify(back.house), JSON.stringify(st.house));
  eq(back.salary.length, 1);
});
test("old saved data with an empty house and goals still loads", () => {
  const old = { version: 1, settings: { startMonth: "2026-11", bonusSharePct: 50, theme: "system" }, salary: [{ from: "2026-11", amount: 1800 }], months: {}, goals: [], house: {} };
  const s = sanitize(old);
  is(s !== null, "must load");
  eq(s.house.amount, null); eq(s.house.loan.termYears, 20);
});
test("bad numbers in a backup are cleaned, not trusted", () => {
  const st = baseState();
  const raw = JSON.parse(JSON.stringify(st));
  raw.house.ltvPct = 5000; raw.house.loan.termYears = -3; raw.house.invest.sharePct = "lots";
  raw.house.events = [{ name: "x", start: "bad" }, { id: "e", name: "ok", start: "2030-01", end: "2029-01", salary: -5, costs: { rent: 10, nope: 5 } }];
  const s = sanitize(raw);
  eq(s.house.ltvPct, 100); eq(s.house.loan.termYears, 1); eq(s.house.invest.sharePct, 50);
  eq(s.house.events.length, 1); eq(s.house.events[0].end, null); eq(s.house.events[0].salary, null);
  eq(Object.keys(s.house.events[0].costs).join(), "rent");
});
test("goal that is approved but incomplete goes back to draft", () => {
  const s = sanitize({ version: 1, settings: {}, salary: [], months: {}, goals: [{ id: "a", approved: true, data: { name: "X" } }], house: {} });
  eq(s.goals[0].approved, false); is(s.goals[0].draft !== null, "draft kept");
});
test("approvedGoals lists only approved goals with their id", () => {
  const list = approvedGoals([{ id: "a", approved: true, data: { name: "A" } }, { id: "b", approved: false, data: null, draft: {} }]);
  eq(list.length, 1); eq(list[0].id, "a");
});

/* ---------- roadmap ---------- */
import { buildRoadmap, hereIndex } from "../js/calc/roadmap.js";

function fullState() {
  const st = baseState();
  st.goals = [
    { id: "g1", approved: true, data: goalFields({ ...G, name: "Car", start: "2027-01", target: "2028-01", amount: 3600 }), draft: null },
  ];
  st.house.events = [{ id: "e1", name: "Family starts", start: "2032-01", end: null, salary: null, costs: { groceries: 450 } }];
  return st;
}
test("roadmap lists goals, events, deposit, purchase and debt-free in date order", () => {
  const st = fullState();
  const inp = inputFromState(st, TODAY);
  const r = project(inp);
  const items = buildRoadmap({ today: TODAY, goals: inp.goals, events: st.house.events, result: r });
  const kinds = items.map((i) => i.kind);
  for (const k of ["goal", "event", "deposit", "purchase", "debtFree"]) is(kinds.includes(k), "missing " + k);
  for (let i = 1; i < items.length; i++) is(items[i - 1].key <= items[i].key, "not sorted at " + i);
  eq(items[items.length - 1].kind, "debtFree");
});
test("roadmap: debt-free is the last milestone and its date matches the projection", () => {
  const st = fullState();
  const inp = inputFromState(st, TODAY);
  const r = project(inp);
  const items = buildRoadmap({ today: TODAY, goals: inp.goals, events: st.house.events, result: r });
  eq(items[items.length - 1].key, r.debtFree);
});
test("roadmap: you-are-here marker sits before the first milestone that is not in the past", () => {
  const st = fullState();
  const inp = inputFromState(st, "2028-06");
  const r = project(inp);
  const items = buildRoadmap({ today: "2028-06", goals: inp.goals, events: [], result: r });
  const at = hereIndex(items, "2028-06");
  is(items.slice(0, at).every((i) => i.key < "2028-06"), "everything before the marker is past");
  is(items.slice(at).every((i) => i.key >= "2028-06"), "everything after is now or later");
});
test("roadmap: goal progress grows with time and is capped at 100%", () => {
  const st = fullState();
  const goal = approvedGoals(st.goals);
  const at = (today) => buildRoadmap({ today, goals: goal, events: [], result: null }).find((i) => i.kind === "goal").progress;
  eq(at("2026-11"), 0);
  near(at("2027-06"), 6 / 12, 1e-9, "after 6 of 12 months");
  eq(at("2030-01"), 1);
});
test("roadmap: deposit progress rises towards 100% and is done once the deposit is ready", () => {
  const st = fullState();
  const inp = inputFromState(st, "2028-01");
  const r = project(inp);
  const dep = buildRoadmap({ today: "2028-01", goals: [], events: [], result: r }).find((i) => i.kind === "deposit");
  is(dep.progress > 0 && dep.progress < 1, "partway: " + dep.progress);
  const after = buildRoadmap({ today: addMonths(r.depositReady, 2), goals: [], events: [], result: r }).find((i) => i.kind === "deposit");
  eq(after.progress, 1); eq(after.done, true);
});
test("roadmap without a house still shows goals and events", () => {
  const st = fullState(); st.house.amount = null;
  const inp = inputFromState(st, TODAY);
  const items = buildRoadmap({ today: TODAY, goals: inp.goals, events: st.house.events, result: project(inp) });
  eq(items.map((i) => i.kind).join(), "goal,event");
});

/* ---------- interface text: every key the code asks for exists ---------- */
const dict = (await import("../js/i18n/en.js")).default;
const lookup = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), dict);
{
  const files = ["app.js", "pages/home.js", "pages/budget.js", "pages/goals.js", "pages/house.js", "pages/overview.js", "components/chart.js", "components/format.js"];
  const missing = [];
  for (const f of files) {
    const src = await (await fetch("../js/" + f)).text();
    for (const m of src.matchAll(/"((?:home|goals|house|overview|budget|nav|footer|theme|time|cat|app)\.[\w.]*\w)"/g)) {
      if (!m[1].endsWith("_") && lookup(m[1]) === undefined) missing.push(`${f}: ${m[1]}`);
    }
  }
  // Keys built at run time
  for (const k of ["ok", "tight", "over"]) if (lookup("house.b.afford." + k) === undefined) missing.push("house.b.afford." + k);
  for (const k of ["living", "goals", "installment", "invested", "toBank", "bonusSpent"]) if (lookup("house.c.flow." + k) === undefined) missing.push("house.c.flow." + k);
  for (const k of ["room", "partner"]) if (lookup("house.c.sweep." + k) === undefined) missing.push("house.c.sweep." + k);
  for (const k of ["deposit", "loan", "invest"]) if (lookup("goals.f.to_" + k) === undefined) missing.push("goals.f.to_" + k);
  for (const k of ["rent", "groceries", "utilities", "transport", "health", "eating", "subscriptions", "leisure", "clothing", "other"]) if (lookup("cat." + k) === undefined) missing.push("cat." + k);
  results.push({ name: "every interface-text key used in the code exists in en.js", ok: missing.length === 0, msg: "missing: " + missing.join(", ") });
}

/* ---------- report ---------- */
const failed = results.filter((r) => !r.ok);
document.getElementById("out").innerHTML =
  `<strong class="${failed.length ? "fail" : "pass"}">${results.length - failed.length}/${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}</strong>\n\n` +
  results.map((r) => `<span class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</span> ${r.name.replace(/</g, "&lt;")}${r.ok ? "" : "\n      → " + String(r.msg).replace(/</g, "&lt;")}`).join("\n");
