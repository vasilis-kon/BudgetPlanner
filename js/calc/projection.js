// The plan, month by month: salary and costs (with the user's expected changes), goals, the deposit,
// the loan, the ETF portfolio and the end point: debt-free. Pure functions: plain data in, plain data out.
//
// Debt-free is a declaration, not a sale: the month the after-tax portfolio covers the loan still owed,
// the user could pay it all off. Nothing is sold; installments keep running and both the loan and the
// portfolio are tracked until the loan ends (or until age 65, whichever is later).
//
// Rules from docs/website-map.md that this file implements:
//  - No automatic inflation or salary growth. Money views in "today's euros" only deflate the result.
//  - Bills, goals and the installment are paid from the 12 regular salaries.
//  - A saved share of each bonus goes to the deposit before the house is bought, to investments after.
//  - Free money goes to approved goals first; what remains funds the deposit, then the loan and investing.
//  - Debt-free = the portfolio, after tax on gains, covers the loan balance still owed.
import {
  BONUS_MONTHS, addMonths, monthsBetween, parseMonth, salaryFor, plannedFor, actualFor,
} from "./budget.js";
import { goalPlan, goalContribution, paybackMonth, approvedGoals } from "./goals.js";
import { createLoan, loanSummary, affordability, loanForPayment, AFFORD_OK, AFFORD_MAX } from "./loan.js";

export const HORIZON = 600; // months simulated from the plan start (50 years)
const EPS = 0.005;
export const RENT_CATEGORY = "rent";
export const RETIREMENT_AGE = 65; // retirement age in Greece: the net worth view runs until then

/** The month the user turns 65, or null if their age is not known. */
export function retirementKey(today, age) {
  return age > 0 && age < RETIREMENT_AGE ? addMonths(today, (RETIREMENT_AGE - age) * 12) : null;
}

/** Everything the projection needs, taken from the saved state. */
export function inputFromState(st, today) {
  return {
    today,
    start: st.settings.startMonth,
    salarySteps: st.salary,
    categoryIds: st.categories.map((c) => c.id),
    months: st.months,
    bonusSharePct: st.settings.bonusSharePct,
    goals: approvedGoals(st.goals),
    house: st.house,
    endKey: retirementKey(today, st.house.age), // keep going after debt-free until this month (age 65)
  };
}

/** Price, loan, deposit and cash needed, from whichever of price or loan the user entered. */
export function houseFinance(h) {
  if (!(h.amount > 0)) return { ok: false };
  const ltv = Math.min(1, Math.max(0.01, h.ltvPct / 100));
  const price = h.mode === "loan" ? h.amount / ltv : h.amount;
  const loan = h.mode === "loan" ? h.amount : h.amount * ltv;
  const down = Math.max(0, price - loan);
  const costs = (price * h.costsPct) / 100;
  const buffer = Math.max(0, h.buffer);
  return { ok: true, price, loan, down, costs, buffer, cashNeeded: down + costs + buffer };
}

/** Multiplier that turns an amount in `key` into today's euros. */
export function todayFactor(today, key, inflationPct) {
  const m = Math.max(0, monthsBetween(today, key));
  return Math.pow(1 + inflationPct / 100, -m / 12);
}

const eventActive = (e, key) => e.start <= key && (e.end === null || key < e.end);

/**
 * Work that does not depend on the house or goals: salary and each category's amount for every month,
 * after the user's expected salary steps, cost steps and life events. Reusable across many projections.
 */
export function prepare(inp) {
  const { start, today, salarySteps, categoryIds, months, house } = inp;
  const H = inp.horizon || Math.max(HORIZON, inp.endKey ? monthsBetween(start, inp.endKey) + 1 : 0);
  const keys = new Array(H);
  for (let i = 0; i < H; i++) keys[i] = addMonths(start, i);

  const allSalary = [...salarySteps, ...(house.salarySteps || [])];
  const events = [...(house.events || [])].sort((a, b) => a.start.localeCompare(b.start));
  const stepsByCat = {};
  for (const s of [...(house.costSteps || [])].sort((a, b) => a.from.localeCompare(b.from))) (stepsByCat[s.catId] ||= []).push(s);

  const salary = new Array(H), spend = new Array(H), rent = new Array(H), amounts = new Array(H);
  for (let i = 0; i < H; i++) {
    const key = keys[i];
    const active = events.filter((e) => eventActive(e, key));
    let s = salaryFor(allSalary, key);
    for (const e of active) if (e.salary !== null) s = e.salary;
    salary[i] = s;

    let total = 0, rentAmt = 0;
    const each = [];
    for (const c of categoryIds) {
      let amount;
      const actual = key <= today ? actualFor(months, c, key) : null;
      if (actual !== null) amount = actual;
      else {
        const p = plannedFor(months, c, key);
        amount = p.amount;
        let from = p.from;
        for (const st of stepsByCat[c] || []) {
          if (st.from <= key && (from === null || st.from >= from)) { amount = st.amount; from = st.from; }
        }
        for (const e of active) if (e.costs && e.costs[c] !== undefined) amount = e.costs[c];
      }
      total += amount;
      each.push(amount);
      if (c === RENT_CATEGORY) rentAmt = amount;
    }
    spend[i] = total;
    rent[i] = rentAmt;
    amounts[i] = each; // per category, in the order of categoryIds
  }
  return { H, keys, salary, spend, rent, amounts, categoryIds };
}

/** Joins runs of consecutive months with the same kind into ranges. */
function groupProblems(flags) {
  const out = [];
  for (const f of flags) {
    const last = out[out.length - 1];
    if (last && last.kind === f.kind && addMonths(last.to, 1) === f.key) {
      last.to = f.key;
      last.worst = Math.max(last.worst, f.short);
      last.months++;
    } else out.push({ kind: f.kind, from: f.key, to: f.key, worst: f.short, months: 1 });
  }
  return out;
}

const ZERO_FLOWS = () => ({ pay: 0, living: 0, goals: 0, installment: 0, invested: 0, toBank: 0, bonusSpent: 0, support: 0 });

/**
 * Runs the plan. Returns the key dates (deposit ready, purchase, fixed period end, debt-free), year-end
 * snapshots for the Overview, the months that cannot be covered, and the headline figures.
 */
export function project(inp, prep = prepare(inp)) {
  const { today, house, goals, bonusSharePct } = inp;
  const fin = houseFinance(house);
  const H = prep.H;
  const infl = house.inflationPct;
  const out = {
    fin, start: inp.start, today, rows: [], years: [], problems: [],
    depositReady: null, purchase: null, fixedEnd: null, termEnd: null, debtFree: null, debtFreeReason: null,
    endKey: null, retireKey: inp.endKey || null, extended: false, loanEnd: null, debtFreeInfo: null, loanFirstInstallment: null, loanLaterInstallment: null,
    salaryAtPurchase: null, paybackFallbacks: [],
  };
  if (!fin.ok) return out;

  const loanParams = { ...house.loan, amount: fin.loan };
  const goalDefs = goals.map((g) => ({ g, plan: goalPlan(g) })).filter((x) => x.plan.valid);
  const monthlyReturn = Math.pow(1 + (house.invest.returnPct - house.invest.feePct) / 100, 1 / 12) - 1;
  const taxRate = house.invest.taxPct / 100;
  const share = house.invest.sharePct / 100;
  const bonusShare = Math.min(100, Math.max(0, bonusSharePct)) / 100;
  const sup = house.support;
  const fallbackSeen = new Set();

  let cash = 0, P = 0, basis = 0, loan = null, pendingLoanPrepay = 0;
  const funds = new Map(goalDefs.map((x) => [x.g.id, 0]));
  const flags = [];
  let yearFlows = ZERO_FLOWS(), yearFlowsReal = ZERO_FLOWS();

  const pushYear = (row) => {
    const f = todayFactor(today, row.key, infl);
    const snap = (k) => ({
      depositSavings: row.depositSavings * k, buffer: row.buffer * k, goalFunds: row.goalFunds * k,
      unspent: row.unspent * k, bank: row.bank * k, investments: row.investments * k, loan: row.loan * k,
      home: row.home * k, netWorth: row.netWorth * k,
    });
    out.years.push({ year: Number(row.key.slice(0, 4)), key: row.key, nom: { ...snap(1), ...yearFlows }, real: { ...snap(f), ...yearFlowsReal } });
    yearFlows = ZERO_FLOWS(); yearFlowsReal = ZERO_FLOWS();
  };

  for (let i = 0; i < H; i++) {
    const key = prep.keys[i];
    const { month } = parseMonth(key);
    const fac = todayFactor(today, key, infl);
    const owns = out.purchase !== null && key >= out.purchase;
    const salary = prep.salary[i];
    const bm = BONUS_MONTHS[month];
    const bonus = bm ? salary * bm.multiple : 0;
    const bonusSaved = bonus * bonusShare;
    const bonusSpent = bonus - bonusSaved;

    // Goals: allocations, ongoing costs, paybacks.
    let goalContrib = 0, ongoing = 0, payDeposit = 0, payInvest = 0, payLoan = 0;
    for (const { g, plan } of goalDefs) {
      const c = goalContribution(plan, g, key);
      goalContrib += c;
      funds.set(g.id, funds.get(g.id) + c);
      if (key >= plan.reach) { ongoing += g.ongoing || 0; funds.set(g.id, 0); }
      if (g.paybackAmount > 0 && key === paybackMonth(plan)) {
        let to = g.paybackTo;
        if (to === "deposit" && owns) { to = "invest"; if (!fallbackSeen.has(g.id)) { fallbackSeen.add(g.id); out.paybackFallbacks.push(g.id); } }
        if (to === "deposit") payDeposit += g.paybackAmount;
        else if (to === "loan") { if (loan) payLoan += g.paybackAmount; else pendingLoanPrepay += g.paybackAmount; }
        else payInvest += g.paybackAmount;
      }
    }

    // Support income.
    let partner = 0, room = 0;
    if (sup.on && sup.type === "partner" && key >= (sup.partnerStart ?? inp.start) && (sup.partnerEnd === null || key < sup.partnerEnd)) partner = sup.partnerAmount;

    let spendNow = prep.spend[i];
    let installment = 0, interest = 0, leftover, toBank, investedSalary = 0, short = 0, shortKind = null;

    if (!owns) {
      leftover = salary - spendNow - goalContrib - ongoing;
      toBank = leftover + bonusSaved; // free money and the saved bonus both build the deposit
      cash += toBank + payDeposit;
      const add = partner + payInvest;
      P = P * (1 + monthlyReturn) + add; basis += add;
      if (leftover < -EPS) { short = -leftover; shortKind = "expenses"; }
      if (out.depositReady === null && cash >= fin.cashNeeded) { out.depositReady = key; out.purchase = addMonths(key, 1); }
    } else {
      if (key === out.purchase) {
        cash -= fin.down + fin.costs;
        loan = createLoan(loanParams);
        out.loanFirstInstallment = loan.installment;
        out.salaryAtPurchase = salary;
        const T = loan.terms;
        out.termEnd = addMonths(key, T.n - 1);
        if (T.mixed && T.fixedMonths < T.n) out.fixedEnd = addMonths(key, T.fixedMonths);
      }
      spendNow = spendNow - prep.rent[i] + house.loan.homeCosts;
      const firstMonth = key === out.purchase;
      if (loan) { // after debt-free the loan is gone and there is no installment
        const step = loan.step(payLoan + (firstMonth ? pendingLoanPrepay : 0));
        if (firstMonth) pendingLoanPrepay = 0;
        if (out.loanLaterInstallment === null && loan.terms.mixed && step.k === loan.terms.fixedMonths + 1) out.loanLaterInstallment = step.installment;
        installment = step.payment; interest = step.interest;
      }
      if (sup.on && sup.type === "room" && monthsBetween(out.purchase, key) < sup.years * 12) {
        room = (sup.rent * (12 - sup.emptyMonths)) / 12 * (1 - sup.taxPct / 100);
      }
      leftover = salary - spendNow - goalContrib - ongoing - installment;
      investedSalary = Math.max(0, leftover) * share + bonusSaved;
      toBank = leftover - Math.max(0, leftover) * share;
      cash += toBank;
      const add = investedSalary + partner + room + payInvest;
      P = P * (1 + monthlyReturn) + add; basis += add;
      if (leftover < -EPS) { short = -leftover; shortKind = "installment"; }
    }

    if (short > 0 && key >= today) flags.push({ key, kind: shortKind, short });

    const gross = P;
    const afterTax = P - Math.max(0, P - basis) * taxRate;
    const goalFunds = [...funds.values()].reduce((a, b) => a + b, 0);
    const bufferNow = owns ? Math.min(fin.buffer, Math.max(0, cash)) : 0;
    const home = owns ? fin.price : 0; // the home at its purchase price: the site assumes no growth
    const loanBalance = loan ? loan.balance : 0;
    const row = {
      key, salary, bonus, spend: spendNow, goalContrib, ongoing, installment, interest, leftover,
      depositSavings: owns ? 0 : cash, buffer: bufferNow, unspent: owns ? cash - bufferNow : 0, goalFunds,
      bank: cash + goalFunds, investments: afterTax, gross, loan: loanBalance, owns,
      home, netWorth: cash + goalFunds + afterTax + home - loanBalance,
    };
    out.rows.push(row);

    // Where this month's pay went. Salary and bonus together equal these parts (paybacks and support income are extra).
    const flow = {
      pay: salary + bonus, living: spendNow + ongoing, goals: goalContrib, installment, invested: investedSalary,
      toBank, bonusSpent, support: partner + room,
    };
    for (const k of Object.keys(yearFlows)) { yearFlows[k] += flow[k]; yearFlowsReal[k] += flow[k] * fac; }

    // The loan is fully repaid by the installments (it may happen long after the debt-free declaration).
    if (owns && loan && loan.balance < EPS && out.loanEnd === null) out.loanEnd = key;

    // Debt-free: the loan is gone, or the portfolio after tax covers what is still owed. This only declares it;
    // the loan keeps being paid and nothing is sold.
    if (owns && loan && out.debtFree === null) {
      const paidOff = loan.balance < EPS;
      if (paidOff || afterTax >= loan.balance) {
        out.debtFree = key;
        out.debtFreeReason = paidOff ? "paid" : "portfolio";
        const rest = loan.clone();
        let remaining = 0, remainingReal = 0, k = 0;
        while (rest.balance > EPS && k < 1200) {
          const st2 = rest.step();
          const f = todayFactor(today, addMonths(key, ++k), infl);
          remaining += st2.interest; remainingReal += st2.interest * f;
        }
        // What paying it all off at this point would leave and save. It is not done in the plan.
        out.debtFreeInfo = {
          balance: loan.balance, portfolioAfterTax: afterTax, surplus: afterTax - loan.balance,
          surplusReal: (afterTax - loan.balance) * fac, interestAvoided: remaining, interestAvoidedReal: remainingReal,
        };
      }
    }

    // Keep tracking while the loan is still owed, or until the retirement month if the age is known.
    const keepGoing = (Boolean(inp.endKey) && key < inp.endKey) || (Boolean(loan) && loan.balance > EPS);
    if (out.debtFree !== null && keepGoing) out.extended = true;
    const finished = out.debtFree !== null && !keepGoing;
    if (month === 12 || finished || i === H - 1) pushYear(row);
    if (finished) break;
  }

  out.endKey = out.rows.length ? out.rows[out.rows.length - 1].key : null;
  out.problems = groupProblems(flags);
  return out;
}

/** Affordability and installment figures for Stage B, independent of when the house is bought. */
export function loanFigures(house, fin, netSalary) {
  if (!fin.ok) return null;
  const params = { ...house.loan, amount: fin.loan };
  const sum = loanSummary(params);
  const worst = Math.max(sum.first, sum.later ?? 0);
  const rateForMax = house.loan.type === "mixed" ? Math.max(house.loan.fixedRate, house.loan.variableRate) : house.loan.rate;
  const months = Math.round(house.loan.termYears * 12);
  return {
    ...sum,
    check: affordability(worst, netSalary),
    checkFirst: affordability(sum.first, netSalary),
    max35: netSalary > 0 ? loanForPayment((netSalary * AFFORD_OK) / 100, rateForMax, months) : 0,
    max40: netSalary > 0 ? loanForPayment((netSalary * AFFORD_MAX) / 100, rateForMax, months) : 0,
  };
}

/**
 * Years to debt-free (counted from purchase) for different lengths of support income.
 * Room rent: rented for 0..maxYears years. Partner: contributing for 0..maxYears years from the start month.
 */
export function supportSweep(inp, prep, maxYears = 30) {
  const base = inp.house;
  const type = base.support.type;
  const points = [];
  for (let y = 0; y <= maxYears; y++) {
    const support = { ...base.support, on: y > 0 };
    if (type === "room") support.years = y;
    else if (y > 0) support.partnerEnd = addMonths(base.support.partnerStart ?? inp.start, y * 12);
    const r = project({ ...inp, house: { ...base, support } }, prep);
    points.push({ years: y, toDebtFree: r.debtFree && r.purchase ? (monthsBetween(r.purchase, r.debtFree) + 1) / 12 : null });
  }
  return points;
}

/** Whole months from the purchase month to debt-free, counting both ends of the loan (null if none). */
export function loanMonths(r) {
  return r.purchase && r.debtFree ? monthsBetween(r.purchase, r.debtFree) + 1 : null;
}
