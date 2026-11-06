// Pure loan maths: monthly installment, a stepper that walks the loan month by month,
// and the bank's affordability check. No DOM, no storage.

/** Level monthly payment that clears `principal` in `months` at `annualPct` interest. */
export function pmt(principal, annualPct, months) {
  if (!(principal > 0) || !(months > 0)) return 0;
  const i = annualPct / 100 / 12;
  return i > 0 ? (principal * i) / (1 - Math.pow(1 + i, -months)) : principal / months;
}

/** Largest loan whose level payment is `payment` (the inverse of pmt). */
export function loanForPayment(payment, annualPct, months) {
  if (!(payment > 0) || !(months > 0)) return 0;
  const i = annualPct / 100 / 12;
  return i > 0 ? (payment * (1 - Math.pow(1 + i, -months))) / i : payment * months;
}

/**
 * Terms used by the stepper.
 * type "fixed": one rate for the whole term (`rate`).
 * type "mixed": `fixedRate` for `fixedYears`, then `variableRate` (the rate the bank quotes today).
 */
export function loanTerms(p) {
  const n = Math.max(1, Math.round(p.termYears * 12));
  const mixed = p.type === "mixed";
  const fixedMonths = mixed ? Math.min(n, Math.max(0, Math.round(p.fixedYears * 12))) : n;
  return {
    n,
    mixed,
    fixedMonths,
    firstRate: mixed ? p.fixedRate : p.rate,
    laterRate: mixed ? p.variableRate : p.rate,
  };
}

/**
 * Walks a loan one month at a time. Each step() pays the installment, then any extra
 * repayment. The installment is fixed in euros; on a "mixed" loan it is worked out again
 * once, when the fixed period ends, from the balance then left and the variable rate.
 */
export function createLoan(p) {
  const T = loanTerms(p);
  const state = { balance: p.amount, k: 0, installment: pmt(p.amount, T.firstRate, T.n) };
  const api = {
    terms: T,
    get balance() { return state.balance; },
    get k() { return state.k; },
    get installment() { return state.installment; },
    /** Rate in force during loan month k (1-based). */
    rateFor: (k) => (k <= T.fixedMonths ? T.firstRate : T.laterRate),
    step(prepay = 0) {
      state.k++;
      if (T.mixed && state.k === T.fixedMonths + 1 && state.k <= T.n) {
        state.installment = pmt(state.balance, T.laterRate, T.n - T.fixedMonths);
      }
      const rate = api.rateFor(state.k);
      const interest = (state.balance * rate) / 100 / 12;
      const owed = state.balance + interest;
      const lastMonth = state.k >= T.n;
      const payment = lastMonth ? owed : Math.min(state.installment, owed);
      state.balance = Math.max(0, owed - payment);
      if (state.balance < 0.005) state.balance = 0;
      let prepaid = 0;
      if (prepay > 0 && state.balance > 0) {
        prepaid = Math.min(prepay, state.balance);
        state.balance -= prepaid;
      }
      return { k: state.k, interest, payment, principal: payment - interest, prepaid, balance: state.balance, installment: state.installment };
    },
    clone() {
      const c = createLoan(p);
      c._set(state.balance, state.k, state.installment);
      return c;
    },
    _set(balance, k, installment) {
      state.balance = balance; state.k = k; state.installment = installment;
    },
  };
  return api;
}

/** The whole schedule with no extra repayments: first/later installment and total interest. */
export function loanSummary(p) {
  const loan = createLoan(p);
  const T = loan.terms;
  const first = loan.installment;
  let later = null, interest = 0, payments = 0;
  for (let k = 1; k <= T.n && (k === 1 || loan.balance > 0); k++) {
    const s = loan.step();
    if (T.mixed && k === T.fixedMonths + 1) later = s.installment;
    interest += s.interest;
    payments += s.payment;
  }
  return { first, later, totalInterest: interest, totalPaid: payments, months: T.n };
}

/** Bank affordability: the installment as a share of the user's own net salary (regular salaries only). */
export const AFFORD_OK = 35;
export const AFFORD_MAX = 40;

export function affordability(installment, netSalary) {
  if (!(netSalary > 0)) return { pct: null, level: "unknown" };
  const pct = (installment / netSalary) * 100;
  return { pct, level: pct <= AFFORD_OK ? "ok" : pct <= AFFORD_MAX ? "tight" : "over" };
}
