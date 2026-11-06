# BudgetPlanner

A budgeting and first-home planning website for **salaried employees in Greece**.

## Who it's for

- Employed at a private company with a known, exact net monthly salary, paid as 14 salaries a year.
- First-time home buyers with no other property or assets that affect their taxes.
- **Not covered:** self-employed people and freelancers. The site does no tax calculations; you enter your net salary and it is taken as given.

The full specification is in [docs/website-map.md](docs/website-map.md).

## Status

| Page | What it does |
| --- | --- |
| Home | Your roadmap: goals, life events, deposit ready, house purchase, end of the fixed-rate period and debt-free on one timeline, with a "you are here" marker. Each step opens the page it belongs to. |
| Monthly Budget | Salary (changes apply from a chosen month), categories with icons, planned vs. actual, bonus share, free money, and the lines approved goals add. |
| Goals | Any number of goals. Each is checked against free money, shows how it moves the deposit date, and joins the budget once approved. |
| House Planner | Your expected future (salary steps, cost steps, life events with required cost changes, installment check), then Stage A save the deposit, Stage B size the loan, Stage C invest until debt-free, with charts. Enter your age and the charts run until 65. |
| Overview | Bank, investments, home, loan and net worth at the end of each year (until 65 once you enter your age), one timeline bar, and a year-by-year table. |

You are debt-free in the first month your investments, after tax on gains, cover what is still owed on the loan: you could pay it all off if you wanted to. The plan does not sell anything. The installments keep paying the loan down, and the loan and the portfolio are tracked until the loan ends (or you are 65).

## How it works

A static site: plain HTML, CSS and JavaScript (ES modules). There is no build step and no server.
Data stays in your browser's `localStorage` (one key, `budgetplanner:v1`). Use **Export backup** / **Import backup** in the footer to keep a JSON copy.

```
index.html          one page, hash routes (#/home, #/budget, #/goals, #/house, #/overview)
css/                tokens.css (colours, type, spacing), base, layout, components
js/app.js           start-up and router
js/store.js         saved data, load/save, export/import
js/calc/            money logic as pure functions (no DOM): budget, goals, loan, projection, roadmap
js/pages/           one file per page
js/components/      shared UI pieces (icons, money input, month field, charts, formatting)
js/vendor/          Chart.js 4.4.7, copied in so the site needs no CDN
tests/              calculation, page, interaction and accessibility checks (see below)
js/i18n/en.js       all interface text
legacy/             the first prototype
```

Icons are from [Lucide](https://lucide.dev) (v0.468.0), copied into `js/components/icon.js`. Charts use [Chart.js](https://www.chartjs.org) 4.4.7, kept in `js/vendor/` at that exact version.

## Run it locally

ES modules do not load from `file://`, so opening `index.html` by double-clicking will show a blank page. Start any local web server in this folder:

```
python -m http.server 8000
```

then open <http://localhost:8000>. (Alternatives: `npx serve`, or the VS Code "Live Server" extension.)

## Run the checks

With the local server running, open these pages in a browser. Each lists PASS or FAIL lines.

| Page | Checks |
| --- | --- |
| <http://localhost:8000/tests/> | The money maths (loan, goals, projection, roadmap) and that every piece of interface text exists |
| <http://localhost:8000/tests/pages.html> | Every page draws from sample data without errors |
| <http://localhost:8000/tests/interact.html> | Typing, clicking and submitting in the real pages |
| <http://localhost:8000/tests/a11y.html> | WCAG 2.1 A/AA accessibility (axe-core, needs internet) in light and dark mode, laptop and phone width |
| <http://localhost:8000/tests/overflow.html> | Nothing is wider than a phone screen |

`tests/seed.html?route=house&variant=full` fills the browser with a sample plan (it overwrites your saved data, so use a spare browser profile).

## Publish on GitHub Pages

1. Create a repository on GitHub and push this folder to it (the `main` branch).
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose branch `main` and folder `/ (root)`, then **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

Hash routes mean every page works on GitHub Pages without extra setup, and all paths in the site are relative, so it works in a sub-folder URL.
