// Smoke tests: draw every page with sample data and make sure nothing throws and the key content is there.
import * as store from "../js/store.js";
import * as home from "../js/pages/home.js";
import * as budget from "../js/pages/budget.js";
import * as goals from "../js/pages/goals.js";
import * as house from "../js/pages/house.js";
import * as overview from "../js/pages/overview.js";
import { buildSample } from "./sample.js";

const PAGES = { home, budget, goals, house, overview };
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
    if (/\b(?:home|goals|house|overview|budget)\.[a-z]+\.[A-Za-z.]+/.test(out.text)) throw new Error("a missing text key is showing: " + out.text.match(/\b(?:home|goals|house|overview|budget)\.[a-z]+\.[A-Za-z.]+/)[0]);
    if (/NaN|undefined|Infinity/.test(out.text)) throw new Error("NaN/undefined/Infinity is showing: " + out.text.match(/.{25}(?:NaN|undefined|Infinity).{25}/)?.[0]);
    for (const [what, fn] of Object.entries(expectations || {})) if (!fn(out)) throw new Error("expected: " + what);
    results.push({ name: label, ok: true });
  } catch (e) {
    results.push({ name: label, ok: false, msg: (e.stack || e.message).split("\n").slice(0, 4).join(" | ") });
  }
}

for (const variant of ["empty", "basic", "full"]) {
  for (const name of Object.keys(PAGES)) {
    const expect = {};
    if (name === "home" && variant === "full") {
      expect["roadmap lists the you-are-here marker"] = (o) => o.text.includes("You are here");
      expect["roadmap shows Debt-free"] = (o) => o.text.includes("Debt-free");
      expect["roadmap shows both goals"] = (o) => o.text.includes("Dream Car") && o.text.includes("Wedding");
      expect["roadmap shows the life event"] = (o) => o.text.includes("Family starts");
      expect["roadmap has progress bars"] = (o) => o.root.querySelectorAll("progress").length >= 2;
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
  results.push({ name: "overview chart: net worth line and home column, running until age 65", ok: true });
  clean2();
} catch (e) {
  results.push({ name: "charts draw with the expected data", ok: false, msg: e.message || String(e) });
}

const failed = results.filter((r) => !r.ok);
document.getElementById("out").innerHTML =
  `<strong class="${failed.length ? "fail" : "pass"}">${results.length - failed.length}/${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}</strong>\n\n` +
  results.map((r) => `<span class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</span> ${r.name}${r.ok ? "" : "\n      → " + String(r.msg).replace(/</g, "&lt;")}`).join("\n");
