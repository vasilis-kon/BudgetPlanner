# BudgetPlanner

A budgeting and first-home planning website for **salaried employees in Greece**.

## Who it's for

- Employed at a private company with a known, exact net monthly salary, paid as 14 salaries a year.
- First-time home buyers with no other property or assets that affect their taxes.
- **Not covered:** self-employed people and freelancers. The site does no tax calculations; you enter your net salary and it is taken as given.

The full specification is in [docs/website-map.md](docs/website-map.md).

## Status

| Page | State |
| --- | --- |
| Home | "Who this is for" note; roadmap timeline still to come |
| Monthly Budget | Built |
| Goals, House Planner, Overview | Placeholders |

## How it works

A static site: plain HTML, CSS and JavaScript (ES modules). There is no build step and no server.
Data stays in your browser's `localStorage` (one key, `budgetplanner:v1`). Use **Export backup** / **Import backup** in the footer to keep a JSON copy.

```
index.html          one page, hash routes (#/home, #/budget, #/goals, #/house, #/overview)
css/                tokens.css (colours, type, spacing), base, layout, components
js/app.js           start-up and router
js/store.js         saved data, load/save, export/import
js/calc/            money logic as pure functions (no DOM)
js/pages/           one file per page
js/components/      shared UI pieces (icons, money input, month field)
js/i18n/en.js       all interface text
legacy/             the first prototype
```

Icons are from [Lucide](https://lucide.dev) (v0.468.0), copied into `js/components/icon.js`. Charts will use Chart.js at an exact pinned version once they are needed.

## Run it locally

ES modules do not load from `file://`, so opening `index.html` by double-clicking will show a blank page. Start any local web server in this folder:

```
python -m http.server 8000
```

then open <http://localhost:8000>. (Alternatives: `npx serve`, or the VS Code "Live Server" extension.)

## Publish on GitHub Pages

1. Create a repository on GitHub and push this folder to it (the `main` branch).
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose branch `main` and folder `/ (root)`, then **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

Hash routes mean every page works on GitHub Pages without extra setup, and all paths in the site are relative, so it works in a sub-folder URL.
