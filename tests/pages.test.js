// Smoke tests: draw every page with sample data and make sure nothing throws and the key content is there.
import * as store from "../js/store.js";
import * as home from "../js/pages/home.js";
import * as budget from "../js/pages/budget.js";
import * as goals from "../js/pages/goals.js";
import * as house from "../js/pages/house.js";
import * as overview from "../js/pages/overview.js";
import * as landing from "../js/pages/landing.js";
import * as info from "../js/pages/info.js";
import { buildSample } from "./sample.js";

const PAGES = { home, budget, goals, house, overview, welcome: landing, about: info.about, privacy: info.privacy, terms: info.terms, disclaimer: info.disclaimer };
const results = [];
const stage = document.getElementById("stage");

function load(variant) {
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(buildSample(variant)));
  store.load();
}

function drawPage(name) {
  stage.innerHTML = "";
  const cleanup = PAGES[name].render(stage);
  const text = stage.textContent;
  const html = stage.innerHTML;
  if (typeof cleanup === "function") cleanup();
  return { text, html, root: stage };
}

function check(name, variant, expectations) {
  const label = `${name} page · ${variant} data`;
  try {
    load(variant);
    const out = drawPage(name);
    if (!out.root.querySelector("h1")) throw new Error("no <h1>");
    if (/\{\w+\}/.test(out.text)) throw new Error("an unfilled {placeholder} is showing: " + out.text.match(/.{20}\{\w+\}.{20}/)?.[0]);
    if (/\b(?:home|goals|house|overview|budget|welcome|about|privacy|terms|disclaimer|notice|info)\.[a-z]+\.[A-Za-z.]+/.test(out.text)) throw new Error("a missing text key is showing: " + out.text.match(/\b(?:home|goals|house|overview|budget|welcome|about|privacy|terms|disclaimer|notice|info)\.[a-z]+\.[A-Za-z.]+/)[0]);
    if (/NaN|undefined|Infinity/.test(out.text)) throw new Error("NaN/undefined/Infinity is showing: " + out.text.match(/.{25}(?:NaN|undefined|Infinity).{25}/)?.[0]);
    for (const [what, fn] of Object.entries(expectations || {})) if (!fn(out)) throw new Error("expected: " + what);
    results.push({ name: label, ok: true });
  } catch (e) {
    results.push({ name: label, ok: false, msg: (e.stack || e.message).split("\n").slice(0, 4).join(" | ") });
  }
}

for (const variant of ["empty", "basic", "full", "short"]) {
  for (const name of Object.keys(PAGES)) {
    const expect = {};
    if (name === "home" && variant === "full") {
      expect["roadmap lists the you-are-here marker"] = (o) => o.text.includes("You are here");
      expect["roadmap shows Debt-free"] = (o) => o.text.includes("Debt-free");
      expect["roadmap shows both goals"] = (o) => o.text.includes("Dream Car") && o.text.includes("Wedding");
      expect["roadmap shows the life event"] = (o) => o.text.includes("Family starts");
      expect["roadmap shows the loan being fully repaid after debt-free"] = (o) => o.text.indexOf("Debt-free") < o.text.indexOf("Loan fully repaid") && o.text.includes("Nothing is sold");
      expect["roadmap has progress bars"] = (o) => o.root.querySelectorAll("progress").length >= 2;
    }
    if (variant === "short" && name === "house") {
      expect["house shows the red box"] = (o) => !!o.root.querySelector(".card-danger") && o.text.includes("Your plan overspends");
      expect["house says how much to cut"] = (o) => /Cut at least €\d/.test(o.text);
      expect["no debt-free date"] = (o) => !o.text.includes("You are debt-free in");
      expect["no charts"] = (o) => !o.root.querySelector("canvas");
    }
    if (variant === "short" && name === "overview") {
      expect["overview shows the red box instead of the plan"] = (o) => o.text.includes("Your plan overspends") && !o.root.querySelector(".data-table");
    }
    if (variant === "short" && name === "home") {
      expect["home shows the red box"] = (o) => o.text.includes("Your plan overspends");
      expect["home hides debt-free and loan end"] = (o) => !o.text.includes("Loan fully repaid") && !o.text.includes("Open Overview");
    }
    if ((variant === "full" || variant === "basic") && ["house", "overview", "home"].includes(name)) {
      expect["a plan that covers its costs shows no red box"] = (o) => !o.root.querySelector(".card-danger");
    }
    if (name === "welcome") {
      expect["welcome shows the right call to action"] = (o) => o.text.includes("Open your roadmap") && !o.text.includes("Start planning");
      expect["welcome has a how-it-works list of 3 steps"] = (o) => o.root.querySelectorAll(".how li").length === 3;
      expect["every screenshot has alt text, a size and a file"] = (o) => [...o.root.querySelectorAll("img.shot")].length === 4 && [...o.root.querySelectorAll("img.shot")].every((i) => i.alt.length > 20 && i.width && i.height && /assets\/screens\/\w+\.webp$/.test(i.getAttribute("src")));
      expect["welcome has FAQ and privacy link"] = (o) => o.root.querySelectorAll("details").length === 4 && !!o.root.querySelector('a[href="#/privacy"]');
    }
    if (name === "privacy") {
      expect["privacy says nothing leaves the device"] = (o) => o.text.includes("never sent to us") && o.text.includes("no analytics");
      expect["privacy names what is stored"] = (o) => o.text.includes("budgetplanner:v1") && o.text.includes("bp-nav-collapsed");
      expect["privacy has the erase button"] = (o) => !!o.root.querySelector("#erase-btn");
    }
    if (name === "terms") expect["terms cover warranty and liability"] = (o) => o.text.includes("No warranty") && o.text.includes("Limit of liability");
    if (name === "disclaimer") {
      expect["disclaimer says not financial advice"] = (o) => o.text.includes("Not financial advice") && o.text.includes("does not calculate your taxes");
      expect["disclaimer shows the review date"] = (o) => o.text.includes("last reviewed on 7 November 2026");
      expect["disclaimer table lists every default and matches the planner"] = (o) => o.root.querySelectorAll(".assumptions tbody tr").length === 13 && o.text.includes("4.2%") && o.text.includes("3.5% for 5 years, then 4.5%");
    }
    if (name === "about") {
      expect["about names the owner and links GitHub"] = (o) => o.text.includes("Vasileios Konstas") && !!o.root.querySelector('a[href*="github.com"]');
      expect["feedback form needs a message"] = (o) => {
        const f = o.root.querySelector("#fb-form");
        f.dispatchEvent(new Event("submit", { cancelable: true }));
        return o.root.querySelector("#fb-err").textContent.length > 0;
      };
    }
    if ((variant === "full" || variant === "basic") && ["house", "overview", "home"].includes(name)) {
      expect["page carries the not-advice notice with a date"] = (o) => !!o.root.querySelector(".notice") && o.text.includes("not financial advice") && o.text.includes("7 November 2026");
    }
    if (name === "home" && variant === "empty") expect["who this is for note shows"] = (o) => o.text.includes("Who this is for");
    if (name === "goals" && variant === "full") {
      expect["both approved goals and the draft show"] = (o) => o.text.includes("Dream Car") && o.text.includes("Big trip");
      expect["draft shows a check result"] = (o) => !!o.root.querySelector(".goal-result");
    }
    if (name === "house" && variant === "full") {
      expect["stage A shows deposit ready"] = (o) => o.text.includes("Deposit ready in");
      expect["stage B shows an installment"] = (o) => o.text.includes("Monthly installment");
      expect["stage C shows debt-free"] = (o) => o.text.includes("You are debt-free in");
    }
    if (name === "overview" && variant === "full") {
      expect["overview has the year table"] = (o) => o.root.querySelectorAll(".data-table tbody tr").length >= 5;
      expect["overview has a chart canvas"] = (o) => !!o.root.querySelector("canvas");
      expect["overview shows net worth at 65"] = (o) => o.text.includes("Net worth at 65");
    }
    if (name === "budget" && variant === "full") expect["budget shows goal lines section"] = (o) => o.text.includes("Goals this month");
    check(name, variant, expect);
  }
}

// Switching to today's euros and back must not break either page.
try {
  load("full");
  store.update((s) => { s.house.units = "today"; });
  for (const name of ["house", "overview"]) drawPage(name);
  results.push({ name: "house and overview draw in today's euros", ok: true });
} catch (e) {
  results.push({ name: "house and overview draw in today's euros", ok: false, msg: e.stack });
}

// The charts are drawn on a timer, so wait for them and look at what they were given.
try {
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "../js/vendor/chart-4.4.7.umd.min.js"; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
  const year65 = new Date().getFullYear() + 35; // the sample user is 30
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const labelsOf = (id) => window.Chart.getChart(stage.querySelector("#" + id)).data.labels.map(String);

  load("full");
  stage.innerHTML = "";
  const cleanup = house.render(stage);
  await wait(1200);
  const flow = window.Chart.getChart(stage.querySelector("#ch-flow"));
  const pay = flow.data.datasets.find((d) => d.label === "Yearly pay (14 salaries)");
  if (!pay || pay.type !== "line") throw new Error("the pay line is missing from the pay chart");
  const bars = flow.data.datasets.filter((d) => d.type === "bar");
  if (bars.length !== 6) throw new Error("expected 6 bars, got " + bars.length);
  // In every full year the bars (all but a negative 'to the bank') add up to the pay line.
  const i = flow.data.labels.indexOf(String(new Date().getFullYear() + 3));
  const sum = bars.reduce((a, d) => a + d.data[i], 0);
  if (Math.abs(sum - pay.data[i]) > 12) throw new Error(`bars ${sum} vs pay line ${pay.data[i]}`);
  if (labelsOf("ch-flow").at(-1) !== String(year65)) throw new Error("pay chart should end in " + year65 + ", ends in " + labelsOf("ch-flow").at(-1));
  if (labelsOf("ch-loan").at(-1) !== String(year65)) throw new Error("loan chart should end in " + year65);
  results.push({ name: "house charts: pay line drawn, bars add up to it, charts run until age 65", ok: true });
  cleanup();

  load("full");
  stage.innerHTML = "";
  const clean2 = overview.render(stage);
  await wait(800);
  const ov = window.Chart.getChart(stage.querySelector("#ch-ov"));
  const names = ov.data.datasets.map((d) => d.label);
  for (const n of ["Net worth", "Home (purchase price)", "Loan balance"]) if (!names.includes(n)) throw new Error("overview chart lacks " + n);
  if (ov.data.labels.at(-1) !== String(year65)) throw new Error("overview chart should end in " + year65);
  const worth = ov.data.datasets.find((d) => d.label === "Net worth").data;
  if (!(worth.at(-1) > worth[0])) throw new Error("net worth should grow over the years");
  // The loan keeps shrinking after the portfolio first covers it, instead of vanishing.
  const loanLine = ov.data.datasets.find((d) => d.label === "Loan balance").data;
  const invest = ov.data.datasets.find((d) => d.label === "Investments after tax").data;
  const cross = loanLine.findIndex((v, k) => v !== null && invest[k] >= v);
  if (cross < 0 || !(loanLine[cross + 1] > 0) || !(loanLine[cross + 1] < loanLine[cross])) throw new Error("the loan should still be owed, and smaller, the year after debt-free: " + JSON.stringify(loanLine.slice(cross, cross + 3)));
  if (loanLine.at(-1) !== 0) throw new Error("the loan should be repaid by the end");
  results.push({ name: "overview chart: net worth line and home column, running until age 65", ok: true });
  clean2();
} catch (e) {
  results.push({ name: "charts draw with the expected data", ok: false, msg: e.message || String(e) });
}

// A first-time visitor (nothing saved yet) is invited to start; erasing everything gets back to that state.
try {
  load("full");
  store.eraseAll();
  if (store.getState().settings.startMonth) throw new Error("eraseAll should clear the plan");
  if (localStorage.getItem(store.STORAGE_KEY)) throw new Error("eraseAll should remove the saved data");
  stage.innerHTML = "";
  landing.render(stage);
  if (!stage.textContent.includes("Start planning") || stage.textContent.includes("Open your roadmap")) throw new Error("a new visitor should see Start planning");
  results.push({ name: "welcome page: first-time visitor sees Start planning after erasing saved data", ok: true });
} catch (e) {
  results.push({ name: "welcome page: first-time visitor sees Start planning after erasing saved data", ok: false, msg: e.message || String(e) });
}

const failed = results.filter((r) => !r.ok);
document.getElementById("out").innerHTML =
  `<strong class="${failed.length ? "fail" : "pass"}">${results.length - failed.length}/${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}</strong>\n\n` +
  results.map((r) => `<span class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</span> ${r.name}${r.ok ? "" : "\n      → " + String(r.msg).replace(/</g, "&lt;")}`).join("\n");
