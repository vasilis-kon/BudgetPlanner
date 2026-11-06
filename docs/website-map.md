# BudgetPlanner — Website Map

Last updated: 6 Nov 2026 (retirement view, life-event cost changes and pay line added) · Source of truth for what the site does. Live version: https://claude.ai/artifact/S6yzuSjPv1yt2TUAdX2cDe

## Who it's for

BudgetPlanner helps salaried employees in Greece plan their monthly budget, save for personal goals and buy their first home. The site says this plainly on the start page and repeats it in the wording of each step.

- **Employed at a private company** with a known, exact net monthly salary, paid as 14 salaries a year.
- **First-time home buyers** with no other property or assets that affect their taxes.
- **Not covered:** self-employed people and freelancers, since their income and taxes need deeper modelling.
- **No tax calculations.** Users enter their net salary and the site takes it as given. The only tax figure is one editable rate on room-rental income.

## Rules that apply everywhere

| Topic | Rule |
| --- | --- |
| Currency and market | Euros, Greek rules only (14 salaries, Greek bank lending limits, Greek purchase costs). |
| Language | English only for now. All text kept in one place so a Greek version can be added later. |
| Accounts | No sign-ins yet. Data is saved in the user's browser. |
| Inflation | No automatic inflation on the budget, goals or installment. Inflation shows up through what users actually spend, which they log in the Monthly Budget. |
| Salary | Salary never rises automatically. It changes only when the user sets a new amount from a given month; earlier months keep the old amount. |
| Monthly obligations | The budget, goals and loan installment are covered by the 12 regular salaries only, as banks assume. |
| Bonus salaries | In the Christmas, Easter and summer bonus months, the user sets the share of the bonus that is saved. Before the house is bought it goes to the deposit (shown as the first priority); after, it goes to investments. The rest is assumed spent on gifts and holidays. |
| Money views | The investment and house planner can show amounts in future euros or in today's money. |
| Devices | Laptop layout first, built responsive from the start so every page also works on a phone. |

## Site map

```
                 ┌──────────────────────────────────────────────┐
                 │ 0 · Home — your roadmap                      │
                 │ goals, deposit, purchase, debt-free on one   │
                 │ timeline with a "you are here" marker        │
                 └──────────────────────────────────────────────┘
                        ▲                         ▲
┌─────────────────────┐ │   ┌─────────────────────────────────────┐
│ 1 · Monthly Budget  │─┘   │ 3 · House Planner (main feature)    │
│ salary, expenses,   │────▶│   A · Save the deposit              │
│ goal lines, bonus   │     │   B · Size the loan                 │
└─────────────────────┘     │   C · Invest and become debt-free   │
   free ▼      ▲ approved   └─────────────────────────────────────┘
┌─────────────────────┐                   │
│ 2 · Goals           │                   │
└─────────────────────┘                   │
          └──────────────┬────────────────┘
                         ▼
          ┌──────────────────────────────────────┐
          │ 4 · Overview — bank, investments,    │
          │ loan year by year                    │
          └──────────────────────────────────────┘
```

The budget's free money goes to approved goals first; what remains funds the deposit, then the loan and investing. Home and the Overview read from all pages.

## Page 0 — Home: your roadmap

The first page is a timeline of the user's plan from today to debt-free, with a "you are here" marker that moves as time passes.

- **Milestones:** each goal (with a progress bar), life events, deposit ready, house purchase, end of the fixed-rate period, debt-free.
- New goals and life events appear on the roadmap as soon as they are added.
- Clicking a milestone opens the page it belongs to.
- Short "who this is for" note for first-time visitors.

## Page 1 — Monthly Budget

The starting point: what comes in, what goes out, and what is left each month.

- **Net salary,** shown at the top. Changing it applies from the chosen month onward.
- **Expense categories** (rent, food, bills, transport and so on), one list shared by every month: a main set provided by the site, plus any the user adds. Each category has an icon shown next to every expense row (for example a basket for groceries); custom categories pick one from a set. Every expense, planned or actual, belongs to a category, so months can be compared and projected. Amounts stay as entered; no automatic inflation.
- **Goal lines,** added automatically when the user approves a goal. They appear only in the months that goal runs, then drop off.
- **Planned vs. actual:** each month the user logs what they actually spent per category next to the plan. Rising prices show up here as higher actual spending.
- **Ongoing costs from reached goals** (for example car running costs), joining expenses from the goal date.
- **Bonus share:** the percentage of each bonus salary that is saved, with a note on where it goes (deposit first, then investments).
- **Readout:** monthly free money after expenses and goals, and a month picker to see any future month's budget.

## Page 2 — Goals

No goals are built in. The user clicks **Add a goal** and a new goal box appears; any number of goals can run at once.

**Each goal box holds:**

- Goal name (free text, for example "Wedding" or "Dream Car")
- Start month and target month
- Amount needed at the target date (the final amount, no inflation added)
- Optional ongoing monthly cost after the goal is reached
- Optional one-time payback after the goal (for example wedding cash gifts), sent to the deposit (default; not available once the house is bought), paying down the loan, or investments

**How a goal is added:**

1. The site works out a fixed monthly amount: the goal amount divided by the months between start and target.
2. It checks that amount against the free money in the Monthly Budget for every month of the goal.
3. If it doesn't fit, the site says so and by how much, and suggests a later target or a lower amount.
4. If it fits, the site shows the monthly allocation and asks the user to approve.
5. On approval, the amount is added to the Monthly Budget for the goal's months only.
6. The user can type their own monthly amount instead. The site then shows the date the goal will be reached, with the same check.

**Effect on the house:** every time a goal is added or changed, the site shows how far the deposit date moves, for example "Adding Dream Car delays your deposit by 7 months." When a goal ends, its monthly amount returns to the free budget; money is not moved between goals.

## Page 3 — House Planner (main feature)

Three stages in order, from first savings to a fully paid house. Each stage starts where the previous one ends.

**Your expected future (set up with the user first)**

The projection runs on the user's own expectations, not automatic growth:

- **Salary steps:** expected raises or job changes, each a new net salary from a chosen month.
- **Cost steps:** expected changes per expense category from a chosen month, for example groceries up when a family starts. Several changes can be grouped as one life event with a start and optional end, for example "Family starts, 2032" or "Unemployed, 4 months" (salary drops, then returns). The site gives no estimates: the user enters every number. **Cost changes are required for a life event** (a salary change alone is not enough). The form shows the user's current expenses per category for the event's first month and how much free money they have, so they can see how much spending can rise, and it updates live as they type.
- Months with no step keep the last known salary and category amounts.
- **Installment check:** after any step or life event, the site checks every month can still cover expenses and the installment, and flags the months that can't.

**Stage A — Save the deposit**

- Inputs: house price or loan amount, bank financing (LTV, usually up to 80%), purchase costs (% of price), emergency buffer.
- Fed by the Monthly Budget's free money plus the bonus share.
- Shows the cash needed, the date the deposit is ready, and how goals push that date back.

**Stage B — Size the loan**

- Loan type: fixed rate for the whole term (for example government schemes like My Home 2), or fixed for some years then variable (fixed years, fixed rate, and the variable rate the bank quotes now). Other inputs: loan amount, term (20 years or less recommended), home running costs (ENFIA, insurance, upkeep) that replace rent.
- Shows the monthly installment (fixed in euros for the whole term) and the bank's affordability check (installment under about 35–40% of the user's own net salary, regular salaries only; a partner's income never counts).
- Shows the installment in today's money, shrinking as inflation rises.

**Stage C — Invest and become debt-free**

- A share of leftover salary, plus the bonus share, goes into an S&P 500 ETF (return, fee and tax on gains are editable).
- **Support income** (switch on or off), one type at a time:
  - Renting out a room: monthly rent, empty months a year, one editable tax rate, how many years.
  - A working spouse or partner: fixed monthly contribution to investments (a safe minimum they can count on), start month (for example after the wedding), optional end.
- Shows when the portfolio, after tax, can pay off the remaining loan, and the advantage of investing in today's money.
- Charts: loan balance vs. portfolio, where the salary goes each year, years of support income vs. years to debt-free.
- The "where the salary goes" chart draws a line for the year's total pay (14 salaries), the most that can be spent, so the user sees how close the bars come to it.
- **Retirement view:** the user enters their age. The loan-vs-portfolio and pay charts then continue after debt-free until age 65, the retirement age in Greece. At debt-free the loan is paid off by selling part of the portfolio; after that there is no installment and the rest keeps growing.

**Support income rules (decided)**

- Room rent or a partner's contribution, never both at once.
- The plan is individual: only the user's income counts for the loan. A partner adds to investments only.
- A partner's contribution is a fixed monthly amount.

## Page 4 — Overview

One view of where the user's money sits at the end of each year, from the first salary to the end of the plan.

- **Bank:** deposit savings, emergency buffer, goal funds and unspent salary.
- **Investments:** the ETF portfolio after tax on gains.
- **Loan:** remaining balance.
- A single timeline bar: saving the deposit, then loan plus investing, then debt-free.
- Toggle between future euros and today's money, plus a year-by-year table.
- **Net worth:** with the user's age known, the Overview runs until age 65. It adds the home (at its purchase price; the site assumes no price growth) and a net worth line: bank plus investments plus home, minus the loan.

## Not in this version

- Sign-ins and accounts
- Greek language version (planned)
- Self-employed and freelance income, and any tax calculation beyond the rental rate
- Buyers who already own property
- Bank or CSV import of expenses
- Moving money between goals

## Technical setup (for GitHub Pages)

- Hosted as a static site on GitHub Pages, straight from the repository: no server, no build step.
- Plain HTML, CSS and JavaScript (ES modules). One `index.html` with hash routes (`#/home`, `#/budget`, `#/goals`, `#/house`, `#/overview`) so every page works on GitHub Pages without extra setup.
- All money logic in pure functions (`js/calc/`), separate from the page code, so it can be tested and reused.
- Data saved in `localStorage` under one versioned key, with export/import as JSON as a backup.
- All interface text in `js/i18n/en.js`, ready for a Greek file later.
- Icons from one open-source set (Lucide), charts from one library (Chart.js), both pinned to an exact version.

```
BudgetPlanner/
├── index.html
├── README.md
├── .gitignore
├── css/          tokens.css, base.css, layout.css, components.css
├── js/
│   ├── app.js        start-up and router
│   ├── store.js      saved data, load/save, export/import
│   ├── calc/         budget.js, goals.js, loan.js, projection.js
│   ├── pages/        home.js, budget.js, goals.js, house.js, overview.js
│   ├── components/   shared UI pieces (icon, money input, modal…)
│   └── i18n/en.js    all interface text
├── assets/       icons, favicon
├── docs/         website-map.md (this file)
└── legacy/       the first prototype (greece-house-plan.html, clear-saved-inputs.html)
```
