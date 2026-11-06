// Tests for the pure money logic in js/calc/ and the data cleaning in js/store.js.
// No test framework: each test throws on failure and the page lists PASS/FAIL.
import { addMonths, monthsBetween, summarizeMonth } from "../js/calc/budget.js";
import { pmt, createLoan, loanSummary, affordability, loanForPayment } from "../js/calc/loan.js";
import { goalPlan, goalContribution, goalLinesFor, checkGoal, approvedGoals, replacedCategories, budgetFreeFn } from "../js/calc/goals.js";
import { prepare, project, houseFinance, inputFromState, supportSweep, loanMonths, todayFactor, newShortfalls, cutAdvice, isFlexible, monthPicture, plannedDetail } from "../js/calc/projection.js";
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
  const at = r.rows.find((x) => x.key === r.debtFree);
  is(at.investments >= at.loan - 0.01, "in the debt-free month the portfolio covers the loan still owed");
});
test("the month before debt-free the portfolio did not yet cover the loan", () => {
  const r = run(baseState());
  const before = r.rows[r.rows.findIndex((x) => x.key === r.debtFree) - 1];
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
  eq(last.key, r.endKey); eq(r.endKey, r.loanEnd);
  near(last.nom.loan, 0, 0.01, "the loan is repaid by its installments at the end");
  near(last.nom.bank, last.nom.depositSavings + last.nom.buffer + last.nom.goalFunds + last.nom.unspent, 1e-6, "bank parts");
});
test("saved money from the deposit stage: purchase pays down payment and costs from the pot", () => {
  const r = run(baseState());
  const before = r.rows.find((x) => x.key === r.depositReady);
  const after = r.rows.find((x) => x.key === r.purchase);
  is(before.depositSavings >= 45500, "pot must reach the cash needed");
  near(after.buffer, 5000, 400, "buffer remains after purchase");
});

/* ---------- retirement view (until age 65), pay line and net worth ---------- */
import { retirementKey } from "../js/calc/projection.js";

const withAge = (age) => { const st = baseState(); st.house.age = age; return st; };
test("retirement key: age 30 means 35 years from today; 65 or unknown means none", () => {
  eq(retirementKey(TODAY, 30), addMonths(TODAY, 35 * 12));
  eq(retirementKey(TODAY, 64), addMonths(TODAY, 12));
  eq(retirementKey(TODAY, 65), null); eq(retirementKey(TODAY, null), null);
});
test("with an age, the projection runs on after debt-free until the user is 65", () => {
  const r = run(withAge(30));
  is(r.extended, "should be extended");
  eq(r.endKey, addMonths(TODAY, 35 * 12));
  eq(r.retireKey, r.endKey);
  is(r.rows.length === monthsBetween(TODAY, r.endKey) + 1, "one row for every month until 65, got " + r.rows.length);
  eq(r.years[r.years.length - 1].key, r.endKey);
});
test("without an age the projection runs on after debt-free until the loan ends", () => {
  const r = run(baseState());
  eq(r.extended, true); eq(r.endKey, r.loanEnd);
  is(r.loanEnd > r.debtFree, "the loan ends after the debt-free declaration");
  eq(r.loanEnd, r.termEnd, "no early repayment, so it ends with the term");
});
test("the debt-free date is the same with or without the age", () => {
  const a = run(baseState()), b = run(withAge(30));
  eq(b.debtFree, a.debtFree); eq(b.purchase, a.purchase); eq(b.depositReady, a.depositReady);
});
test("debt-free is only a declaration: nothing is sold and the portfolio keeps growing", () => {
  const r = run(withAge(30));
  const at = r.rows.findIndex((x) => x.key === r.debtFree);
  for (let i = at; i < r.rows.length - 1; i++) {
    is(r.rows[i + 1].investments >= r.rows[i].investments - 0.01, `portfolio fell between ${r.rows[i].key} and ${r.rows[i + 1].key}`);
  }
  is(r.rows[at + 1].gross > r.rows[at].gross, "gross portfolio grows right after the declaration");
});
test("the loan keeps being paid after debt-free: same installment, balance falling every month until it ends", () => {
  const r = run(baseState());
  const at = r.rows.findIndex((x) => x.key === r.debtFree);
  const first = r.rows.find((x) => x.owns).installment;
  const during = r.rows.slice(at).filter((x) => x.key <= r.loanEnd);
  is(during.length > 60, "many months of installments remain after debt-free: " + during.length);
  for (let i = 0; i < during.length; i++) {
    near(during[i].installment, first, 0.01, "installment at " + during[i].key);
    is(during[i].loan > 0 || during[i].key === r.loanEnd, "loan still owed at " + during[i].key);
    if (i) is(during[i].loan < during[i - 1].loan, "balance must fall at " + during[i].key);
  }
  near(r.rows.find((x) => x.key === r.loanEnd).loan, 0, 0.01, "zero at the end");
  const afterEnd = r.rows.filter((x) => x.key > r.loanEnd);
  is(afterEnd.every((x) => x.installment === 0 && x.loan === 0), "no installment once the loan has ended");
});
test("after debt-free the loan balance is still owed in the following months", () => {
  const r = run(withAge(30));
  const next = r.rows.find((x) => x.key === addMonths(r.debtFree, 1));
  is(next.loan > 1000, "loan still owed: " + Math.round(next.loan));
  near(next.loan, r.debtFreeInfo.balance, r.debtFreeInfo.balance * 0.02, "about the same balance, one installment lower");
});
test("net worth carries on smoothly through the debt-free month", () => {
  const r = run(withAge(30));
  const at = r.rows.findIndex((x) => x.key === r.debtFree);
  const before = r.rows[at], next = r.rows[at + 1];
  is(next.netWorth > before.netWorth && next.netWorth - before.netWorth < 3000, `net worth ${Math.round(before.netWorth)} -> ${Math.round(next.netWorth)}`);
});
test("after debt-free the installment is still paid out of your salary each month", () => {
  const r = run(withAge(30));
  const post = r.rows.find((x) => x.key === addMonths(r.debtFree, 2));
  near(post.leftover, 2000 - 300 - 120 - 739.88, 1, "salary - groceries - home costs - installment");
});
test("once the loan has ended the full free money is left", () => {
  const r = run(withAge(30));
  const post = r.rows.find((x) => x.key === addMonths(r.loanEnd, 3));
  near(post.leftover, 2000 - 300 - 120, 0.01, "salary - groceries - home costs");
});
test("net worth drops by the purchase costs when the house is bought, nothing else", () => {
  const r = run(baseState());
  const before = r.rows.find((x) => x.key === r.depositReady), buy = r.rows.find((x) => x.key === r.purchase);
  const drop = before.netWorth - buy.netWorth;
  is(drop > 9000 && drop < 12500, "purchase costs are 10,500, drop was " + Math.round(drop));
});
test("the home counts at its purchase price from the month it is bought", () => {
  const r = run(baseState());
  eq(r.rows.find((x) => x.key === r.depositReady).home, 0);
  eq(r.rows.find((x) => x.key === r.purchase).home, 150000);
});
test("yearly pay is 12 salaries plus the three bonuses (14 salaries) in a full year", () => {
  const r = run(baseState());
  const y = r.years.find((x) => x.year === 2028);
  near(y.nom.pay, 2000 * 14, 0.01, "2000 x 14");
  const sum = y.nom.living + y.nom.goals + y.nom.installment + y.nom.invested + y.nom.toBank + y.nom.bonusSpent;
  near(sum, y.nom.pay, 0.01, "the bars add up to the pay line");
});
test("pay line follows salary steps", () => {
  const st = withAge(30); st.house.salarySteps = [{ id: "s1", from: "2029-01", amount: 2500 }];
  const r = run(st);
  near(r.years.find((x) => x.year === 2029).nom.pay, 2500 * 14, 0.01);
});
test("per-category amounts for the life-event form: current amounts and total agree", () => {
  const prep = prepare(inputFromState(baseState(), TODAY));
  const i = 5;
  near(prep.amounts[i].reduce((a, b) => a + b, 0), prep.spend[i], 1e-9);
  eq(prep.categoryIds.length, prep.amounts[i].length);
  eq(prep.amounts[i][prep.categoryIds.indexOf("rent")], 600);
});
test("in today's euros the retirement-year net worth is smaller than in future euros", () => {
  const r = run(withAge(30));
  const last = r.years[r.years.length - 1];
  is(last.real.netWorth < last.nom.netWorth, "deflated value must be smaller");
});

/* ---------- the Monthly Budget and the House Planner are one plan ---------- */
/** A plan with every kind of change: an expected raise, a cost step, a life event, and a car that replaces transport. */
function richState() {
  const st = baseState();
  st.months[TODAY].planned = { rent: 600, groceries: 300, transport: 100, utilities: 120 };
  st.goals = [{ id: "car", approved: true, draft: null, data: goalFields({ name: "Car", start: "2027-01", target: "2028-01", amount: 3600, ongoing: 90, replaces: "transport" }) }];
  st.house.salarySteps = [{ id: "s1", from: "2031-09", amount: 2500 }];
  st.house.costSteps = [{ id: "c1", from: "2030-01", catId: "groceries", amount: 350 }];
  st.house.events = [{ id: "e1", name: "Reduced hours", start: "2033-01", end: "2033-05", salary: 1800, costs: { groceries: 250 } }];
  st.house.age = 40;
  return st;
}
test("the Monthly Budget shows the same free money as the House Planner in every month", () => {
  const st = richState(); const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  is(r.rows.length > 200, "a long plan to compare");
  for (const row of r.rows) {
    const pic = monthPicture(inp, prep, r, row.key);
    if (Math.abs(pic.free - row.leftover) > 0.01) throw new Error(`${row.key}: budget page ${pic.free.toFixed(2)} vs planner ${row.leftover.toFixed(2)}`);
  }
});
test("the Monthly Budget uses the expected salary step, cost step and life event, like the planner", () => {
  const st = richState(); const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  const pic = (k) => monthPicture(inp, prep, r, k);
  eq(pic("2031-08").salary, 2000); eq(pic("2031-09").salary, 2500, "salary step shows in the budget");
  eq(pic("2031-09").salaryFrom.kind, "step"); eq(pic("2031-08").salaryFrom, null);
  eq(pic("2033-02").salary, 1800, "the life event's salary shows"); eq(pic("2033-02").salaryFrom.kind, "event");
  eq(pic("2033-06").salary, 2500, "back to the raised salary after the event");
  eq(plannedDetail(inp, "groceries", "2029-12").amount, 300); eq(plannedDetail(inp, "groceries", "2030-01").amount, 350);
  eq(plannedDetail(inp, "groceries", "2033-02").amount, 250); eq(plannedDetail(inp, "groceries", "2033-02").source, "event");
  eq(plannedDetail(inp, "groceries", "2030-01").source, "step"); eq(plannedDetail(inp, "groceries", "2030-01").stepFrom, "2030-01");
});
test("the scenario from the bug report: salary step makes the month affordable, so the budget must not show a shortfall", () => {
  const st = baseState(); st.house.amount = 300000; st.house.salarySteps = [{ id: "s1", from: "2030-01", amount: 3200 }];
  const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  eq(r.feasible, true, "the planner says every month is covered");
  for (const row of r.rows) is(monthPicture(inp, prep, r, row.key).free >= -0.01, "budget page agrees at " + row.key);
});
test("plannedDetail agrees with the planner's own amounts for every future month and category", () => {
  const st = richState(); const inp = inputFromState(st, TODAY); const prep = prepare(inp);
  for (let i = 1; i < 200; i++) for (let k = 0; k < prep.categoryIds.length; k++) {
    const d = plannedDetail(inp, prep.categoryIds[k], prep.keys[i]).amount;
    if (Math.abs(d - prep.amounts[i][k]) > 1e-9) throw new Error(`${prep.keys[i]} ${prep.categoryIds[k]}: ${d} vs ${prep.amounts[i][k]}`);
  }
});
test("a goal can replace an expense: a car replaces transport from the month it is bought", () => {
  const st = richState(); const inp = inputFromState(st, TODAY);
  const withCar = project(inp);
  const noReplace = richState(); noReplace.goals[0].data.replaces = null;
  const without = project(inputFromState(noReplace, TODAY));
  const at = (r, k) => r.rows.find((x) => x.key === k);
  near(at(withCar, "2027-12").spend, at(without, "2027-12").spend, 1e-9, "before the car is bought transport is still paid");
  near(at(without, "2028-01").spend - at(withCar, "2028-01").spend, 100, 1e-9, "from the car's month transport counts as zero");
  near(at(without, "2029-05").spend - at(withCar, "2029-05").spend, 100, 1e-9, "and it stays zero");
  is(at(withCar, "2028-06").ongoing === 90, "the car's running costs are still paid");
});
test("the car's replaced transport shows as zero in the Monthly Budget too, from the same month", () => {
  const st = richState(); const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  eq(monthPicture(inp, prep, r, "2027-12").replacedBy.transport, undefined);
  eq(monthPicture(inp, prep, r, "2028-01").replacedBy.transport.kind, "goal");
  eq(monthPicture(inp, prep, r, "2028-01").replacedBy.transport.name, "Car");
  const a = monthPicture(inp, prep, r, "2027-12"), b = monthPicture(inp, prep, r, "2028-01");
  near(a.spent - b.spent, 100, 1e-9, "100 less is spent");
});
test("a goal that replaces rent does not take rent off twice once the house is bought", () => {
  const mk = (replaces) => { const st = baseState(); st.goals = [{ id: "g", approved: true, draft: null, data: goalFields({ name: "Move in", start: "2027-01", target: "2027-07", amount: 600, replaces }) }]; return project(inputFromState(st, TODAY)); };
  const a = mk(null), b = mk("rent");
  const key = addMonths(a.purchase, 5);
  near(a.rows.find((x) => x.key === key).spend, b.rows.find((x) => x.key === key).spend, 1e-9, "same spend after the purchase");
  is(a.rows.find((x) => x.key === "2027-09").spend - b.rows.find((x) => x.key === "2027-09").spend === 600, "but before the purchase it removes rent");
});
test("replacedCategories lists only goals that have been reached", () => {
  const goals = approvedGoals(richState().goals);
  eq(replacedCategories(goals, "2027-12").size, 0); eq(replacedCategories(goals, "2028-01").get("transport"), "Car");
  eq(replacedCategories([{ ...goals[0], replaces: null }], "2030-01").size, 0);
});
test("the goal fit check counts the expense that another goal replaces", () => {
  const st = richState(); const goals = approvedGoals(st.goals);
  const budget = { salarySteps: st.salary, categoryIds: st.categories.map((c) => c.id), months: st.months, bonusSharePct: 50 };
  const free = budgetFreeFn(budget, goals, "other");
  // Month before the car: 300 still being saved. Month after: that saving has stopped (+300), transport is gone (+100), running costs begin (-90).
  near(free("2028-02") - free("2027-12"), 300 + 100 - 90, 1e-9, "saving stops, transport gone, running costs added");
});
test("cut advice does not list an expense a goal has replaced", () => {
  const st = richState(); st.months[TODAY].planned.rent = 1900; // overspends before the house
  const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  const p = r.problems.find((x) => x.from >= "2028-01") || r.problems[0];
  is(r.problems.length > 0, "overspending exists");
  const a = cutAdvice(inp, prep, r, { ...p, worstKey: "2028-03", worst: p.worst });
  is(!a.categories.some((c) => c.id === "transport"), "transport is not offered as something to cut after the car");
});
test("a goal's replaced category is kept when valid and dropped when not", () => {
  const ok = goalFields({ name: "Car", replaces: "transport" }); eq(ok.replaces, "transport");
  eq(goalFields({ name: "Car", replaces: "bad id!" }).replaces, null); eq(goalFields({ name: "Car" }).replaces, null);
});

/* ---------- rent becomes zero once the loan is being paid ---------- */
test("budget: with the house, rent counts as zero and the installment and home costs take its place", () => {
  const b = { salarySteps: [{ from: TODAY, amount: 2000 }], categoryIds: ["rent", "groceries"], months: { [TODAY]: { planned: { rent: 600, groceries: 300 }, actual: {} } }, bonusSharePct: 50 };
  near(summarizeMonth(b, TODAY).free, 1100, 1e-9);
  const s = summarizeMonth({ ...b, skipCategories: ["rent"], houseTotal: 860 }, TODAY);
  near(s.spent, 300, 1e-9, "rent is not in expenses"); near(s.planned, 300, 1e-9); eq(s.houseTotal, 860);
  near(s.free, 2000 - 300 - 860, 1e-9);
});
test("the Monthly Budget and the House Planner agree on free money once the loan has started", () => {
  const st = baseState(); const r = run(st);
  const key = addMonths(r.purchase, 3);
  const row = r.rows.find((x) => x.key === key);
  const free = summarizeMonth({ salarySteps: st.salary, categoryIds: st.categories.map((c) => c.id), months: st.months, bonusSharePct: 50, houseTotal: row.installment + st.house.loan.homeCosts, skipCategories: ["rent"] }, key).free;
  near(free, row.leftover, 0.01, "budget page vs planner");
});

/* ---------- overspending is not allowed ---------- */
const shortState = () => { const st = baseState(); st.house.amount = 350000; return st; }; // installment about 1,730, plus 420 of costs, on a 2,000 salary
test("a plan whose installment is more than the salary allows is flagged, with the short months listed", () => {
  const r = run(shortState());
  eq(r.feasible, false);
  const p = r.problems.find((x) => x.kind === "installment");
  is(!!p && p.worst > 100, "installment shortfall found");
  is(Object.keys(r.shortByMonth).length === p.months, "one entry per short month");
  is(Object.keys(r.shortByMonth).every((k) => k >= TODAY), "only months from today on");
});
test("a plan that covers every month is feasible and has no short months", () => {
  const r = run(baseState());
  eq(r.feasible, true); eq(Object.keys(r.shortByMonth).length, 0);
});
test("expenses above salary are flagged even before a house price is entered", () => {
  const st = baseState(); st.house.amount = null; st.months[TODAY].planned.rent = 1800; // 2,100 of spending on 2,000
  const r = run(st);
  eq(r.feasible, false); eq(r.problems[0].kind, "expenses"); near(r.problems[0].worst, 100, 0.01, "short by");
});
test("months that are already past are not flagged (they cannot be changed)", () => {
  const st = baseState(); st.settings.startMonth = "2026-01"; st.salary = [{ from: "2026-01", amount: 2000 }];
  st.months = { "2026-03": { planned: { rent: 3000 }, actual: {} }, "2026-11": { planned: { rent: 600, groceries: 300 }, actual: {} } };
  st.house.amount = null;
  eq(run(st).feasible, true);
});
test("newShortfalls reports only months a change adds or makes worse", () => {
  const before = { "2030-01": 100, "2030-03": 40 };
  const after = { "2030-01": 100, "2030-02": 50, "2030-03": 60 };
  const w = newShortfalls(before, after);
  eq(w.length, 1); eq(w[0].from, "2030-02"); eq(w[0].to, "2030-03"); eq(w[0].months, 2); eq(w[0].worst, 60);
  eq(newShortfalls(after, before).length, 0, "an improvement adds nothing");
});
test("cut advice: biggest categories first, flexible ones marked, rent left out once the house is owned", () => {
  const st = shortState(); const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  const a = cutAdvice(inp, prep, r, r.problems.find((x) => x.kind === "installment"));
  eq(a.owns, true); is(!a.categories.some((c) => c.id === "rent"), "rent is replaced by home costs");
  for (let i = 1; i < a.categories.length; i++) is(a.categories[i - 1].amount >= a.categories[i].amount, "sorted");
  eq(a.enough, false, "300 of groceries is essential, so cutting flexible spending cannot fix this");
  near(a.needed, r.problems[0].worst, 1e-9);
});
test("cut advice before the purchase lists rent and counts only flexible spending as easy to cut", () => {
  const st = baseState(); st.house.amount = null;
  st.months[TODAY].planned = { rent: 1700, groceries: 300, eating: 150, leisure: 100 }; // 2,250 on 2,000
  const inp = inputFromState(st, TODAY); const prep = prepare(inp); const r = project(inp, prep);
  const a = cutAdvice(inp, prep, r, r.problems[0]);
  is(a.categories.some((c) => c.id === "rent"), "rent is listed before the purchase");
  eq(a.flexibleTotal, 250); eq(a.enough, true, "250 of flexible spending covers a 250 gap");
  is(isFlexible("eating") && isFlexible("my-custom-category") && !isFlexible("rent") && !isFlexible("groceries"), "flexible means everything except the essentials");
});
test("roadmap leaves out the dates that rest on overspending", () => {
  const st = shortState(); const inp = inputFromState(st, TODAY); const r = project(inp);
  const kinds = buildRoadmap({ today: TODAY, goals: [], events: [], result: r }).map((i) => i.kind);
  is(kinds.includes("deposit") && kinds.includes("purchase"), "the deposit date is still valid");
  is(!kinds.includes("debtFree") && !kinds.includes("loanEnd"), "debt-free and loan end are hidden");
  const st2 = baseState(); st2.months[TODAY].planned.rent = 2200; // overspends before buying
  const inp2 = inputFromState(st2, TODAY);
  const kinds2 = buildRoadmap({ today: TODAY, goals: [], events: [], result: project(inp2) }).map((i) => i.kind);
  is(!kinds2.includes("deposit") && !kinds2.includes("debtFree"), "nothing after the plan starts to overspend is shown");
});

/* ---------- saved data ---------- */
test("age is kept when valid and dropped when not", () => {
  const st = baseState();
  const ok = JSON.parse(JSON.stringify(st)); ok.house.age = 34;
  eq(sanitize(ok).house.age, 34);
  for (const bad of [70, 12, "x", -3]) { const b = JSON.parse(JSON.stringify(st)); b.house.age = bad; eq(sanitize(b).house.age, null, "age " + bad); }
});
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
  for (const k of ["goal", "event", "deposit", "purchase", "debtFree", "loanEnd"]) is(kinds.includes(k), "missing " + k);
  for (let i = 1; i < items.length; i++) is(items[i - 1].key <= items[i].key, "not sorted at " + i);
  eq(items[items.length - 1].kind, "loanEnd", "the loan's last installment closes the roadmap");
});
test("roadmap: debt-free and loan end dates match the projection, and debt-free comes first", () => {
  const st = fullState();
  const inp = inputFromState(st, TODAY);
  const r = project(inp);
  const items = buildRoadmap({ today: TODAY, goals: inp.goals, events: st.house.events, result: r });
  eq(items.find((i) => i.kind === "debtFree").key, r.debtFree);
  eq(items.find((i) => i.kind === "loanEnd").key, r.loanEnd);
  is(r.debtFree < r.loanEnd, "debt-free is declared before the loan ends");
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
  for (const k of ["pay", "living", "goals", "installment", "invested", "toBank", "bonusSpent"]) if (lookup("house.c.flow." + k) === undefined) missing.push("house.c.flow." + k);
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
