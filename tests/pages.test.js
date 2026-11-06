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

const failed = results.filter((r) => !r.ok);
document.getElementById("out").innerHTML =
  `<strong class="${failed.length ? "fail" : "pass"}">${results.length - failed.length}/${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}</strong>\n\n` +
  results.map((r) => `<span class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</span> ${r.name}${r.ok ? "" : "\n      → " + String(r.msg).replace(/</g, "&lt;")}`).join("\n");
