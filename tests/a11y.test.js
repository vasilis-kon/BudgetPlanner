// Runs axe-core (WCAG 2.1 A and AA rules) on the pages, in both themes and at two widths.
// Open tests/a11y.html in a browser to check everything, or add ?route=house&theme=dark&w=390 for one case.
import { buildSample } from "./sample.js";

const AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js";
const q = new URLSearchParams(location.search);
const ROUTES = q.get("route") ? [q.get("route")] : ["home", "budget", "tracker", "goals", "house", "overview", "welcome", "about", "privacy", "terms", "disclaimer"];
const VARIANT = q.get("variant") || "full";
const THEMES = q.get("theme") ? [q.get("theme")] : ["light", "dark"];
const WIDTHS = q.get("w") ? [Number(q.get("w"))] : [1200, 390];
const out = document.getElementById("out");
const lines = [];
let total = 0;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const progress = (msg) => { out.textContent = [msg, ...lines].join("\n").replace(/<[^>]*>/g, ""); };
window.addEventListener("error", (e) => progress("Script error: " + e.message));
const frame = document.createElement("iframe");
document.body.appendChild(frame);

async function load(route, w) {
  frame.style.width = w + "px";
  frame.style.height = "900px";
  await new Promise((resolve) => { frame.onload = resolve; frame.src = `../index.html#/${route}`; });
  await wait(1200); // let the page and charts draw
}

async function axeIn(win) {
  if (!win.axe) {
    await new Promise((resolve, reject) => {
      const s = win.document.createElement("script");
      s.src = AXE; s.onload = resolve; s.onerror = () => reject(new Error("axe-core did not load"));
      win.document.head.appendChild(s);
    });
  }
  return win.axe.run(win.document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
}

try {
  for (const theme of THEMES) {
    for (const w of WIDTHS) {
      for (const route of ROUTES) {
        progress(`Checking ${route} · ${theme} · ${w}px`);
        localStorage.setItem("budgetplanner:v1", JSON.stringify(buildSample(VARIANT, { theme })));
        await load(route, w);
        // Open the optional panels so their contents are checked too.
        frame.contentDocument.querySelectorAll("details").forEach((d) => (d.open = true));
        // A blank page would pass trivially, so insist the page really drew.
        const main = frame.contentDocument.querySelector("main");
        if (!main || !main.querySelector("h1") || main.textContent.length < 300) throw new Error(`${route} did not draw any content`);
        // The House Planner's add forms only exist once their button is pressed, so check each one open too.
        const states = route === "house" ? [null, "salary", "cost", "event"] : route === "budget" ? [null, "after-purchase"] : [null];
        for (const state of states) {
          if (state === "after-purchase") { // a month when rent is replaced by the loan
            const d = new Date(); const later = new Date(d.getFullYear(), d.getMonth() + 60, 1);
            const input = frame.contentDocument.querySelector("#month-input");
            input.value = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}`;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await wait(300);
            if (!frame.contentDocument.querySelector("#home-card")) throw new Error("the home card did not appear after the purchase");
          } else if (state) {
            frame.contentDocument.querySelector(`[data-action="open-form"][data-form="${state}"]`).click();
            await wait(300);
            if (!frame.contentDocument.querySelector("form.inline-form")) throw new Error(`the ${state} form did not open`);
          }
          const res = await axeIn(frame.contentWindow);
          const label = `${route}${state === "after-purchase" ? " (a month after the purchase)" : state ? " (" + state + " form open)" : ""} · ${theme} · ${w}px`;
          if (!res.violations.length) lines.push(`<span class="pass">PASS</span> ${label}`);
          for (const v of res.violations) {
            total++;
            lines.push(`<span class="fail">FAIL</span> ${label} · ${v.id} (${v.impact}): ${v.help}\n      ${v.nodes.slice(0, 4).map((n) => n.target.join(" ") + " → " + (n.any[0] || n.all[0] || n.none[0] || {}).message).join("\n      ").replace(/</g, "&lt;")}`);
          }
        }
      }
    }
  }
} catch (e) {
  lines.push(`<span class="fail">ERROR</span> ${String(e.stack || e).replace(/</g, "&lt;")}`);
  total++;
}
out.innerHTML = `<strong class="${total ? "fail" : "pass"}">${total ? total + " problem(s)" : "No WCAG 2.1 A/AA problems found"}</strong>\n\n` + lines.join("\n");
