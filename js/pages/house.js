// Page 3: House Planner. Your expected future, then Stage A (save the deposit), Stage B (size the loan)
// and Stage C (invest and become debt-free). Every number comes from the user; the site adds none.
import { t, formatMoney as eurc, formatWhole as eur, formatCompact, formatMonth } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { esc, parseAmount } from "../components/dom.js";
import { moneyInput } from "../components/money-input.js";
import { monthField } from "../components/month-picker.js";
import { currentMonth, duration } from "../components/format.js";
import { mountChart, chartFigure, baseOptions } from "../components/chart.js";
import * as store from "../store.js";
import { addMonths, isMonthKey, monthsBetween } from "../calc/budget.js";
import { approvedGoals, goalLinesFor } from "../calc/goals.js";
import { AFFORD_OK, AFFORD_MAX } from "../calc/loan.js";
import { inputFromState, prepare, project, loanFigures, supportSweep, todayFactor, loanMonths, RENT_CATEGORY, RETIREMENT_AGE } from "../calc/projection.js";

const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const set = (obj, path, v) => {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = v;
};
const fid = (path) => "f-" + path.replace(/\./g, "-");
const range = (from, to) => (from === to ? formatMonth(from) : t("house.range", { from: formatMonth(from), to: formatMonth(to) }));

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  const $ = (sel) => wrap.querySelector(sel);
  const st = () => store.getState();
  const catName = (c) => (c.builtin ? t("cat." + c.id) : c.name);
  let unmountCharts = [];
  let chartTimer = null;
  let openForm = null; // which "add" form is open: "salary", "cost", "event" or null (only the button shows)
  let lastA = null; // the latest calculation, used by the life-event form
  let evCtx = null; // what the life-event form shows: expenses and free money in the event's first month

  /* ---------- calculation ---------- */

  function analyse() {
    const s = st();
    const today = currentMonth();
    const inp = inputFromState(s, today);
    const prep = prepare(inp);
    const r = project(inp, prep);
    const goals = inp.goals;
    let noGoals = null, goalDelays = [];
    if (goals.length && r.fin.ok) {
      noGoals = project({ ...inp, goals: [] }, prep);
      goalDelays = goals.map((g) => {
        const without = project({ ...inp, goals: goals.filter((x) => x.id !== g.id) }, prep);
        return { name: g.name, delay: without.depositReady && r.depositReady ? monthsBetween(without.depositReady, r.depositReady) : null };
      });
    }
    const idx = Math.max(0, Math.min(prep.H - 1, monthsBetween(inp.start, today)));
    const salaryRef = r.salaryAtPurchase ?? prep.salary[idx];
    const lf = loanFigures(s.house, r.fin, salaryRef);
    const infl = s.house.inflationPct;
    return { s, h: s.house, today, inp, prep, r, noGoals, goalDelays, lf, salaryRef, infl, units: s.house.units, conv: (amount, key) => (s.house.units === "today" ? amount * todayFactor(today, key, infl) : amount) };
  }

  /* ---------- small HTML builders ---------- */

  function num(path, label, { min = 0, max = 1e9, step = "any", unit = "", hint = "" } = {}) {
    const v = get(st().house, path);
    const id = fid(path);
    const input = `<input type="number" id="${id}" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${v ?? ""}" data-path="${path}" ${hint ? `aria-describedby="${id}-h"` : ""}>`;
    return `<div class="field"><label for="${id}">${label}</label>${unit ? `<div class="input-unit">${input}<span aria-hidden="true">${unit}</span></div>` : input}${hint ? `<span class="hint" id="${id}-h">${hint}</span>` : ""}</div>`;
  }

  function radios(path, legend, options, hint = "") {
    const cur = get(st().house, path);
    return `<fieldset class="field"><legend>${legend}</legend><div class="choices">${options.map(([value, label]) =>
      `<label class="choice"><input type="radio" name="r-${path}" value="${value}" data-path="${path}" ${cur === value ? "checked" : ""}><span>${label}</span></label>`).join("")}</div>${hint ? `<span class="hint">${hint}</span>` : ""}</fieldset>`;
  }

  const stat = (label, value, sub = "") => `<div class="stat"><dt>${label}</dt><dd>${value}</dd>${sub ? `<dd class="sub">${sub}</dd>` : ""}</div>`;
  const note = (kind, iconName, html) => `<div class="note ${kind}">${icon(iconName, { size: 18 })}<p>${html}</p></div>`;
  const table = (heads, rows) => `<table class="data-table"><thead><tr>${heads.map((h, i) => `<th scope="col"${i ? ' class="num"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td class="num">${c}</td>` : `<th scope="row">${c}</th>`)).join("")}</tr>`).join("")}</tbody></table>`;

  /* ---------- Life event form: current expenses and room to grow ---------- */

  /** Expenses, salary and free money in the month an event would start. */
  function eventContext(a, startKey) {
    const idx = Math.max(0, Math.min(a.prep.H - 1, monthsBetween(a.inp.start, isMonthKey(startKey) ? startKey : a.inp.start)));
    const key = a.prep.keys[idx];
    const row = a.r.rows.find((r) => r.key === key);
    const salary = a.prep.salary[idx];
    const leftover = row ? row.leftover : salary - a.prep.spend[idx] - goalLinesFor(a.inp.goals, key).total;
    const amounts = {};
    a.prep.categoryIds.forEach((c, k) => { amounts[c] = a.prep.amounts[idx][k]; });
    return { key, salary, leftover, owns: row ? row.owns : false, amounts, total: a.prep.spend[idx], withInstallment: Boolean(row && row.owns) };
  }

  function eventCostsHtml(ctx, typed = {}) {
    const rows = st().categories.map((c) => {
      const cur = ctx.amounts[c.id] ?? 0;
      const replaced = c.id === RENT_CATEGORY && ctx.owns;
      const input = moneyInput({ id: `ev-cost-${c.id}`, value: typed[c.id] ?? "", ariaLabel: t("house.f.evNewFor", { cat: catName(c) }), className: "ev-new", placeholder: replaced ? "–" : String(Math.round(cur)), dataAttrs: `data-cur="${cur}" data-cat="${c.id}" ${replaced ? "disabled" : ""}` });
      return `<tr>
        <th scope="row"><span class="cat"><span class="cat-icon">${icon(c.icon)}</span>${esc(catName(c))}</span></th>
        <td class="num">${replaced ? `<span class="small muted">${t("house.f.evRentReplaced")}</span>` : eur(cur)}</td>
        <td class="num">${input}</td>
        <td class="num" id="ev-diff-${c.id}">–</td>
      </tr>`;
    }).join("");
    return `<div class="table-scroll" role="region" tabindex="0" aria-label="${t("house.f.evTableLabel")}">
      <table class="data-table ev-table">
        <caption class="visually-hidden">${t("house.f.evTableLabel")}</caption>
        <thead><tr><th scope="col">${t("house.f.category")}</th><th scope="col" class="num">${t("house.f.evNow", { month: formatMonth(ctx.key) })}</th><th scope="col" class="num">${t("house.f.evNew")}</th><th scope="col" class="num">${t("house.f.evChange")}</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th scope="row">${t("house.f.evTotal")}</th><td class="num">${eur(ctx.total)}</td><td class="num"></td><td class="num" id="ev-diff-total">–</td></tr></tfoot>
      </table></div>`;
  }

  /** Live lines under the table: how much the event adds to spending and what is left afterwards. */
  function updateEventSummary() {
    if (!evCtx || !$("#ev-summary")) return;
    let delta = 0, any = false;
    for (const el of wrap.querySelectorAll(".ev-new")) {
      const v = parseAmount(el.value);
      const cell = $(`#ev-diff-${el.dataset.cat}`);
      if (v === null || Number.isNaN(v) || el.disabled) { if (cell) cell.textContent = "–"; continue; }
      const d = v - Number(el.dataset.cur);
      delta += d; any = true;
      if (cell) cell.textContent = Math.abs(d) < 0.005 ? t("house.f.evSame") : `${d > 0 ? "+" : "−"}${eur(Math.abs(d))}`;
    }
    const sal = parseAmount($("#ev-salary") ? $("#ev-salary").value : "");
    const salaryChange = sal !== null && !Number.isNaN(sal) ? sal - evCtx.salary : 0;
    const after = evCtx.leftover + salaryChange - delta;
    $("#ev-diff-total").textContent = any ? `${delta > 0.005 ? "+" : delta < -0.005 ? "−" : ""}${eur(Math.abs(delta))}` : "–";
    const month = formatMonth(evCtx.key);
    const what = evCtx.withInstallment ? t("house.f.evFreeInst") : t("house.f.evFree");
    const room = `<p>${t("house.f.evRoom", { month, free: eur(Math.max(0, evCtx.leftover)), what })}</p>`;
    const verdict = !any && salaryChange === 0 ? `<p class="muted">${t("house.f.evTypeHint")}</p>`
      : after >= -0.005 ? `<div class="note note-ok">${icon("circle-check", { size: 18 })}<p>${t("house.f.evOk", { left: eur(Math.max(0, after)) })}</p></div>`
      : `<div class="note note-warn">${icon("triangle-alert", { size: 18 })}<p>${t("house.f.evShort", { short: eur(-after) })}</p></div>`;
    $("#ev-summary").innerHTML = room + verdict;
  }

  /** Rebuilds the cost table for a new start month, keeping what the user already typed. */
  function rebuildEventCosts() {
    if (!lastA) return;
    const typed = {};
    wrap.querySelectorAll(".ev-new").forEach((el) => { if (el.value !== "") typed[el.dataset.cat] = el.value; });
    evCtx = eventContext(lastA, $("#ev-start").value.trim());
    $("#ev-costs").innerHTML = eventCostsHtml(evCtx, typed);
    updateEventSummary();
  }

  /* ---------- Your expected future ---------- */

  function futureHtml(a) {
    const s = st(), h = s.house;
    const start = s.settings.startMonth;
    const cats = s.categories;
    const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
    const salaryList = h.salarySteps.length
      ? `<ul class="simple-list">${h.salarySteps.map((x) => `<li><span>${t("house.f.salaryItem", { month: formatMonth(x.from) })}</span><span class="row"><strong class="num">${eur(x.amount)}</strong><button type="button" class="btn btn-quiet btn-small btn-danger btn-icon" data-action="rm-salary" data-id="${x.id}" aria-label="${t("house.f.removeSalary", { month: formatMonth(x.from) })}">${icon("trash-2", { size: 16 })}</button></span></li>`).join("")}</ul>`
      : `<p class="small muted">${t("house.f.noSalarySteps")}</p>`;
    const costList = h.costSteps.filter((x) => byId[x.catId]).length
      ? `<ul class="simple-list">${h.costSteps.filter((x) => byId[x.catId]).map((x) => `<li><span>${t("house.f.costItem", { cat: esc(catName(byId[x.catId])), month: formatMonth(x.from) })}</span><span class="row"><strong class="num">${eur(x.amount)}</strong><button type="button" class="btn btn-quiet btn-small btn-danger btn-icon" data-action="rm-cost" data-id="${x.id}" aria-label="${esc(t("house.f.removeCost", { cat: catName(byId[x.catId]), month: formatMonth(x.from) }))}">${icon("trash-2", { size: 16 })}</button></span></li>`).join("")}</ul>`
      : `<p class="small muted">${t("house.f.noCostSteps")}</p>`;
    const eventList = h.events.length
      ? `<ul class="simple-list">${h.events.map((e) => {
        const bits = [];
        if (e.salary !== null) bits.push(t("house.f.eventSalary", { amount: eur(e.salary) }));
        for (const [c, v] of Object.entries(e.costs)) if (byId[c]) bits.push(`${esc(catName(byId[c]))} ${eur(v)}`);
        return `<li><span><strong>${esc(e.name)}</strong><br><span class="small muted">${e.end ? range(e.start, addMonths(e.end, -1)) : t("house.f.eventFrom", { month: formatMonth(e.start) })}${bits.length ? " · " + bits.join(", ") : ""}</span></span><button type="button" class="btn btn-quiet btn-small btn-danger btn-icon" data-action="rm-event" data-id="${e.id}" aria-label="${esc(t("house.f.removeEvent", { name: e.name }))}">${icon("trash-2", { size: 16 })}</button></li>`;
      }).join("")}</ul>`
      : `<p class="small muted">${t("house.f.noEvents")}</p>`;
    const catOptions = cats.map((c) => `<option value="${c.id}">${esc(catName(c))}</option>`).join("");
    // Each list ends with just an "add" button. It opens the fields; Enter (or Save) stores the entry and closes them again.
    const addButton = (kind, label) => `<p class="add-row"><button type="button" class="btn" data-action="open-form" data-form="${kind}">${icon("plus", { size: 16 })}${label}</button></p>`;
    const formActions = (saveLabel) => `<p class="small muted">${t("house.f.enterHint")}</p><div class="row"><button class="btn btn-primary" type="submit">${saveLabel}</button><button type="button" class="btn" data-action="close-form">${t("house.f.cancelForm")}</button></div>`;
    const nextMonth = addMonths(currentMonth() < start ? start : currentMonth(), 1);
    evCtx = eventContext(a, nextMonth);
    return `
      <section class="card" aria-labelledby="future-h">
        <div class="card-head">${icon("calendar-clock")}<h2 id="future-h">${t("house.future.title")}</h2></div>
        <p class="muted">${t("house.future.intro")}</p>
        <div class="grid grid-2">
          <div>
            <h3>${icon("briefcase", { size: 18 })} ${t("house.f.salaryTitle")}</h3>
            <p class="small muted">${t("house.f.salaryHelp")}</p>
            ${salaryList}
            ${openForm === "salary" ? `<form id="salary-step-form" class="inline-form" novalidate>
              <div class="form-row">
                ${monthField({ id: "ss-from", label: t("house.f.from"), value: nextMonth, min: start })}
                <div class="field">${moneyInput({ id: "ss-amount", label: t("house.f.newSalary"), value: "", placeholder: "2200" })}</div>
              </div>
              <p class="error" id="ss-error" role="alert"></p>
              ${formActions(t("house.f.saveSalary"))}
            </form>` : addButton("salary", t("house.f.addSalary"))}
          </div>
          <div>
            <h3>${icon("coins", { size: 18 })} ${t("house.f.costTitle")}</h3>
            <p class="small muted">${t("house.f.costHelp")}</p>
            ${costList}
            ${openForm === "cost" ? `<form id="cost-step-form" class="inline-form" novalidate>
              <div class="form-row">
                ${monthField({ id: "cs-from", label: t("house.f.from"), value: nextMonth, min: start })}
                <div class="field"><label for="cs-cat">${t("house.f.category")}</label><select id="cs-cat">${catOptions}</select></div>
                <div class="field">${moneyInput({ id: "cs-amount", label: t("house.f.newAmount"), value: "", placeholder: "400" })}</div>
              </div>
              <p class="error" id="cs-error" role="alert"></p>
              ${formActions(t("house.f.saveCost"))}
            </form>` : addButton("cost", t("house.f.addCost"))}
          </div>
        </div>
        <h3 style="margin-top:var(--space-5)">${icon("users", { size: 18 })} ${t("house.f.eventTitle")}</h3>
        <p class="small muted">${t("house.f.eventHelp")}</p>
        ${eventList}
        ${openForm === "event" ? `<form id="event-form" class="inline-form" novalidate>
          <div class="form-row">
            <div class="field"><label for="ev-name">${t("house.f.eventName")}</label><input type="text" id="ev-name" maxlength="60" autocomplete="off" placeholder="${t("house.f.eventNamePh")}"></div>
            ${monthField({ id: "ev-start", label: t("house.f.eventStart"), value: nextMonth, min: start })}
            ${monthField({ id: "ev-end", label: t("house.f.eventEnd"), value: "", min: start, hint: t("house.f.eventEndHint") })}
            <div class="field">${moneyInput({ id: "ev-salary", label: t("house.f.eventSalaryLabel"), value: "", placeholder: "–" })}<span class="hint">${t("house.f.eventSalaryHint")}</span></div>
          </div>
          <fieldset class="required-box" aria-describedby="ev-costs-help">
            <legend><strong>${t("house.f.eventCosts")}</strong> <span class="badge badge-required">${t("house.f.required")}</span></legend>
            <p id="ev-costs-help"><strong>${t("house.f.evHelpStrong")}</strong> ${t("house.f.evHelp")}</p>
            <div id="ev-costs">${eventCostsHtml(evCtx)}</div>
            <div id="ev-summary" class="stack" aria-live="polite"></div>
          </fieldset>
          <p class="error" id="ev-error" role="alert"></p>
          ${formActions(t("house.f.saveEvent"))}
        </form>` : addButton("event", t("house.f.addEvent"))}
        <h3 style="margin-top:var(--space-5)">${t("house.check.title")}</h3>
        <div id="res-future" aria-live="polite"></div>
      </section>`;
  }

  function futureResult(a) {
    if (!a.r.fin.ok) return note("", "info", t("house.check.needHouse"));
    if (!a.r.problems.length) return note("note-ok", "circle-check", `<strong>${t("house.check.ok")}</strong> ${t("house.check.okDetail")}`);
    const items = a.r.problems.map((p) => `<li>${t(p.kind === "expenses" ? "house.check.expenses" : "house.check.installment", { range: range(p.from, p.to), amount: eur(p.worst), months: p.months })}</li>`).join("");
    return note("note-warn", "triangle-alert", `<strong>${t("house.check.bad", { count: a.r.problems.length })}</strong>`) + `<ul style="margin-top:var(--space-3)">${items}</ul><p class="small muted">${t("house.check.fixHint")}</p>`;
  }

  /* ---------- Stage A ---------- */

  function stageAHtml() {
    const h = st().house;
    const modeLabel = h.mode === "price" ? t("house.a.price") : t("house.a.loanAmount");
    return `
      <section class="card" aria-labelledby="a-h">
        <div class="card-head">${icon("piggy-bank")}<h2 id="a-h">${t("house.a.title")}</h2></div>
        <p class="muted">${t("house.a.intro")}</p>
        <div class="grid grid-2">
          <div class="stack">
            ${radios("mode", t("house.a.mode"), [["price", t("house.a.modePrice")], ["loan", t("house.a.modeLoan")]])}
            ${num("amount", modeLabel, { min: 1, max: 1e8, step: 1000, hint: t("house.a.amountHint") })}
            ${num("ltvPct", t("house.a.ltv"), { min: 1, max: 100, step: 1, unit: "%", hint: t("house.a.ltvHint") })}
            ${num("costsPct", t("house.a.costs"), { min: 0, max: 30, step: 0.5, unit: "%", hint: t("house.a.costsHint") })}
            ${num("buffer", t("house.a.buffer"), { min: 0, max: 1e7, step: 500, hint: t("house.a.bufferHint") })}
          </div>
          <div id="res-a" aria-live="polite"></div>
        </div>
      </section>`;
  }

  function stageAResult(a) {
    const { r, h } = a;
    const f = r.fin;
    if (!f.ok) return note("", "info", t("house.a.enter"));
    const stats = `<dl class="stat-grid">
      ${stat(t("house.a.rPrice"), eur(f.price))}
      ${stat(t("house.a.rLoan"), eur(f.loan), t("house.a.rLoanSub", { pct: Math.round(h.ltvPct) }))}
      ${stat(t("house.a.rDown"), eur(f.down))}
      ${stat(t("house.a.rCosts"), eur(f.costs), t("house.a.rCostsSub", { pct: h.costsPct }))}
      ${stat(t("house.a.rBuffer"), eur(f.buffer))}
      ${stat(t("house.a.rNeeded"), eur(f.cashNeeded))}
    </dl>`;
    if (!r.depositReady) return stats + note("note-warn", "triangle-alert", t("house.a.never", { years: 50 }));
    const wait = monthsBetween(a.today, r.depositReady);
    const when = wait <= 0 ? t("house.a.nowOrPast") : t("house.a.inTime", { time: duration(wait) });
    const bonusYear = Math.round(a.prep.salary[0] * 2 * (a.s.settings.bonusSharePct / 100));
    let goalPart = "";
    if (a.noGoals) {
      const total = a.noGoals.depositReady && r.depositReady ? monthsBetween(a.noGoals.depositReady, r.depositReady) : null;
      const lines = a.goalDelays.map((g) => `<li>${esc(g.name)}: ${g.delay === null ? "–" : g.delay === 0 ? t("house.a.noChange") : g.delay > 0 ? t("house.a.later", { time: duration(g.delay) }) : t("house.a.earlier", { time: duration(-g.delay) })}</li>`).join("");
      goalPart = `<h3 style="margin-top:var(--space-4)">${t("house.a.goalsTitle")}</h3>
        <p>${total === null ? "" : total === 0 ? t("house.a.goalsNone") : total > 0 ? t("house.a.goalsLater", { time: duration(total), without: formatMonth(a.noGoals.depositReady) }) : t("house.a.goalsEarlier", { time: duration(-total), without: formatMonth(a.noGoals.depositReady) })}</p>
        <ul>${lines}</ul>`;
    }
    return `${stats}
      <div class="headline">${icon("badge-check")}<div><p class="stat-label">${t("house.a.readyLabel")}</p><p class="stat-value">${formatMonth(r.depositReady)}</p><p class="stat-sub">${when} · ${t("house.a.buyIn", { month: formatMonth(r.purchase) })}</p></div></div>
      <p class="small muted">${t("house.a.feeds", { bonus: eur(bonusYear), share: a.s.settings.bonusSharePct })}</p>
      ${goalPart}`;
  }

  /* ---------- Stage B ---------- */

  function stageBHtml() {
    const h = st().house;
    const mixed = h.loan.type === "mixed";
    return `
      <section class="card" aria-labelledby="b-h">
        <div class="card-head">${icon("landmark")}<h2 id="b-h">${t("house.b.title")}</h2></div>
        <p class="muted">${t("house.b.intro")}</p>
        <div class="grid grid-2">
          <div class="stack">
            <p id="b-loan" class="small"></p>
            ${radios("loan.type", t("house.b.type"), [["fixed", t("house.b.typeFixed")], ["mixed", t("house.b.typeMixed")]])}
            ${mixed
              ? `<div class="form-row">${num("loan.fixedYears", t("house.b.fixedYears"), { min: 0, max: 40, step: 1 })}${num("loan.fixedRate", t("house.b.fixedRate"), { min: 0, max: 25, step: 0.05, unit: "%" })}${num("loan.variableRate", t("house.b.variableRate"), { min: 0, max: 25, step: 0.05, unit: "%", hint: t("house.b.variableHint") })}</div>`
              : num("loan.rate", t("house.b.rate"), { min: 0, max: 25, step: 0.05, unit: "%", hint: t("house.b.rateHint") })}
            ${num("loan.termYears", t("house.b.term"), { min: 1, max: 40, step: 1, hint: t("house.b.termHint") })}
            ${num("loan.homeCosts", t("house.b.homeCosts"), { min: 0, max: 1e5, step: 10, hint: t("house.b.homeCostsHint") })}
          </div>
          <div id="res-b" aria-live="polite"></div>
        </div>
      </section>`;
  }

  function stageBResult(a) {
    const { lf, r, h } = a;
    const f = r.fin;
    $("#b-loan").innerHTML = f.ok ? t("house.b.loanIs", { amount: eur(f.loan) }) + ` <a href="#/house" data-action="goto-a">${t("house.b.changeInA")}</a>` : "";
    if (!lf) return note("", "info", t("house.a.enter"));
    const mixed = h.loan.type === "mixed";
    const stats = `<dl class="stat-grid">
      ${stat(t("house.b.rInstallment"), eurc(lf.first), mixed ? t("house.b.rFirstYears", { years: h.loan.fixedYears }) : t("house.b.rFixedAll"))}
      ${mixed && lf.later ? stat(t("house.b.rLater"), eurc(lf.later), t("house.b.rLaterSub", { rate: h.loan.variableRate })) : ""}
      ${stat(t("house.b.rInterest"), eur(lf.totalInterest), t("house.b.rInterestSub"))}
    </dl>`;
    const c = lf.check;
    const level = c.level;
    const chip = c.pct === null ? "" : `<div class="note ${level === "ok" ? "note-ok" : level === "tight" ? "note-warn" : "note-danger"}">${icon(level === "ok" ? "circle-check" : "triangle-alert", { size: 18 })}<p><strong>${t("house.b.afford." + level, { pct: c.pct.toFixed(0) })}</strong> ${t("house.b.affordDetail", { limitOk: AFFORD_OK, limitMax: AFFORD_MAX, salary: eur(a.salaryRef), month: r.purchase ? formatMonth(r.purchase) : formatMonth(a.today) })}</p></div>`;
    const max = Math.floor(lf.max35 / 1000) * 1000;
    const sizing = `<p class="small">${t("house.b.max", { loan35: eur(lf.max35), loan40: eur(lf.max40) })}</p>${f.loan > lf.max35 + 1 && max > 0 ? `<p><button type="button" class="btn btn-small" data-action="set-loan" data-amount="${max}">${t("house.b.setLoan", { amount: eur(max) })}</button></p>` : ""}`;
    const first = lf.first, later = lf.later ?? lf.first;
    const fixedM = mixed ? Math.round(h.loan.fixedYears * 12) : 1e9;
    const base = r.purchase ?? addMonths(a.today, 1);
    const years = [...new Set([1, 5, 10, 15, 20, 25, 30, 35, 40].filter((y) => y <= h.loan.termYears).concat(Math.round(h.loan.termYears)))].sort((x, y) => x - y);
    const todayRows = years.map((y) => {
      const key = addMonths(base, (y - 1) * 12);
      const nominal = (y - 1) * 12 + 1 <= fixedM ? first : later;
      return [t("house.b.loanYear", { n: y, year: key.slice(0, 4) }), eurc(nominal), eurc(nominal * todayFactor(a.today, key, a.infl))];
    });
    const warnTerm = h.loan.termYears > 20 ? note("note-warn", "triangle-alert", t("house.b.longTerm")) : "";
    return `${stats}${chip}${sizing}${warnTerm}
      <h3 style="margin-top:var(--space-4)">${t("house.b.todayTitle")}</h3>
      <p class="small muted">${t("house.b.todayIntro", { infl: a.infl })}</p>
      <div class="table-scroll" role="region" tabindex="0" aria-label="${t("house.b.todayTitle")}">${table([t("house.b.colYear"), t("house.b.colNominal"), t("house.b.colToday")], todayRows)}</div>`;
  }

  /* ---------- Stage C ---------- */

  function stageCHtml() {
    const s = st(), h = s.house, sup = h.support;
    const supportFields = !sup.on ? "" : `
      ${radios("support.type", t("house.c.supportType"), [["room", t("house.c.typeRoom")], ["partner", t("house.c.typePartner")]], t("house.c.oneAtATime"))}
      ${sup.type === "room"
        ? `<div class="form-row">${num("support.rent", t("house.c.rent"), { min: 0, max: 1e5, step: 25 })}${num("support.emptyMonths", t("house.c.empty"), { min: 0, max: 12, step: 0.5 })}${num("support.taxPct", t("house.c.rentTax"), { min: 0, max: 60, step: 1, unit: "%", hint: t("house.c.rentTaxHint") })}${num("support.years", t("house.c.years"), { min: 0, max: 50, step: 1, hint: t("house.c.yearsHint") })}</div>`
        : `<div class="form-row">${num("support.partnerAmount", t("house.c.partnerAmount"), { min: 0, max: 1e5, step: 25, hint: t("house.c.partnerHint") })}
            ${monthField({ id: "partner-start", label: t("house.c.partnerStart"), value: sup.partnerStart || s.settings.startMonth, min: s.settings.startMonth, dataAttrs: 'data-month="support.partnerStart"' })}
            ${monthField({ id: "partner-end", label: t("house.c.partnerEnd"), value: sup.partnerEnd || "", min: s.settings.startMonth, hint: t("house.c.partnerEndHint"), dataAttrs: 'data-month="support.partnerEnd"' })}</div>`}
      <p class="small muted">${t("house.c.individual")}</p>`;
    return `
      <section class="card" aria-labelledby="c-h">
        <div class="card-head">${icon("trending-up")}<h2 id="c-h">${t("house.c.title")}</h2></div>
        <p class="muted">${t("house.c.intro")}</p>
        <div class="grid grid-2">
          <div class="stack">
            ${num("invest.sharePct", t("house.c.share"), { min: 0, max: 100, step: 5, unit: "%", hint: t("house.c.shareHint") })}
            <div class="form-row">
              ${num("invest.returnPct", t("house.c.return"), { min: 0, max: 30, step: 0.5, unit: "%", hint: t("house.c.returnHint") })}
              ${num("invest.feePct", t("house.c.fee"), { min: 0, max: 5, step: 0.01, unit: "%" })}
              ${num("invest.taxPct", t("house.c.tax"), { min: 0, max: 60, step: 1, unit: "%", hint: t("house.c.taxHint") })}
            </div>
            <div class="field">
              <label class="choice"><input type="checkbox" id="support-on" data-check="support.on" ${sup.on ? "checked" : ""}><span><strong>${t("house.c.supportOn")}</strong> · ${t("house.c.supportOnHint")}</span></label>
            </div>
            ${supportFields}
          </div>
          <div id="res-c" aria-live="polite"></div>
        </div>
        <div id="charts-c" class="stack-lg" style="margin-top:var(--space-5)"></div>
      </section>`;
  }

  function stageCResult(a) {
    const { r } = a;
    if (!r.fin.ok) return note("", "info", t("house.a.enter"));
    if (!r.depositReady) return note("note-warn", "triangle-alert", t("house.c.noDeposit"));
    if (!r.debtFree) return note("note-warn", "triangle-alert", t("house.c.never"));
    const info = r.debtFreeInfo;
    const months = loanMonths(r);
    const early = monthsBetween(r.debtFree, r.termEnd);
    const headline = `<div class="headline">${icon("badge-check")}<div><p class="stat-label">${t("house.c.debtFreeLabel")}</p><p class="stat-value">${formatMonth(r.debtFree)}</p>
      <p class="stat-sub">${t("house.c.afterBuying", { time: duration(months), month: formatMonth(r.purchase) })}${early > 0 ? " · " + t("house.c.early", { time: duration(early) }) : ""}</p></div></div>`;
    const why = r.debtFreeReason === "portfolio"
      ? `<p>${t("house.c.whyPortfolio", { portfolio: eur(a.conv(info.portfolioAfterTax, r.debtFree)), balance: eur(a.conv(info.balance, r.debtFree)), loanEnd: formatMonth(r.loanEnd || r.termEnd) })}</p>`
      : `<p>${t("house.c.whyPaid")}</p>`;
    const unitsNote = a.units === "today" ? t("house.c.unitsToday", { infl: a.infl }) : t("house.c.unitsFuture");
    const stats = `<dl class="stat-grid">
      ${stat(t("house.c.rPortfolio"), eur(a.conv(info.portfolioAfterTax, r.debtFree)), t("house.c.rPortfolioSub"))}
      ${stat(t("house.c.rBalance"), eur(a.conv(info.balance, r.debtFree)))}
      ${stat(t("house.c.rSurplus"), eur(a.conv(info.surplus, r.debtFree)), t("house.c.rSurplusSub"))}
    </dl>`;
    const adv = `<div class="note">${icon("trending-up", { size: 18 })}<p><strong>${t("house.c.advTitle")}</strong> ${t("house.c.advText", { interest: eur(info.interestAvoidedReal), left: eur(info.surplusReal), infl: a.infl })}</p></div>`;
    return `${headline}${why}${stats}<p class="small muted">${unitsNote}</p>${adv}`;
  }

  function drawCharts(a) {
    unmountCharts.forEach((fn) => fn());
    unmountCharts = [];
    const box = $("#charts-c");
    if (!box) return;
    const { r, units, infl } = a;
    if (!r.fin.ok || !r.depositReady || !r.debtFree) { box.innerHTML = ""; return; }
    const pick = (y) => (units === "today" ? y.real : y.nom);
    const yearsFromBuy = r.years.filter((y) => y.key >= r.purchase.slice(0, 4) + "-01");
    const all = r.years;
    const dfYear = Number(r.debtFree.slice(0, 4));
    const tag = (y) => (y.year === dfYear ? `${y.year} ★` : String(y.year));
    const unitLabel = units === "today" ? t("house.c.unitsTodayShort") : t("house.c.unitsFutureShort");

    const loanRows = yearsFromBuy.map((y) => [tag(y), eur(pick(y).loan), eur(pick(y).investments)]);
    const flowKeys = ["living", "goals", "installment", "invested", "toBank", "bonusSpent"];
    const flowTable = ["pay", ...flowKeys];
    const flowRows = all.map((y) => [String(y.year), ...flowTable.map((k) => eur(pick(y)[k]))]);
    const sweep = supportSweep(a.inp, a.prep, 30);
    const sweepType = a.h.support.type;
    const sweepRows = sweep.map((p) => [String(p.years), p.toDebtFree === null ? "–" : p.toDebtFree.toFixed(1)]);

    const ageHint = a.h.age ? "" : `<div class="note">${icon("info", { size: 18 })}<p>${t("house.c.ageHint", { retire: RETIREMENT_AGE })}</p></div>`;
    const toRetire = Boolean(r.retireKey) && r.endKey === r.retireKey; // charts run until 65, not just until the loan ends
    const loanEndText = formatMonth(r.loanEnd || r.termEnd);
    const loanSum = t(toRetire ? "house.c.chartLoanSumExt" : "house.c.chartLoanSum", { unit: unitLabel, month: formatMonth(r.debtFree), loanEnd: loanEndText, retire: RETIREMENT_AGE });
    const flowSum = t(toRetire ? "house.c.chartFlowSumExt" : "house.c.chartFlowSum", { unit: unitLabel, retire: RETIREMENT_AGE });

    box.innerHTML = ageHint +
      chartFigure({ id: "ch-loan", title: t("house.c.chartLoan"), summary: loanSum, tableLabel: t("house.c.showTable"),
        tableHtml: table([t("house.c.colYear"), t("house.c.colLoan"), t("house.c.colPortfolio")], loanRows) }) +
      chartFigure({ id: "ch-flow", title: t("house.c.chartFlow"), summary: flowSum, tableLabel: t("house.c.showTable"),
        tableHtml: table([t("house.c.colYear"), ...flowTable.map((k) => t("house.c.flow." + k))], flowRows) }) +
      chartFigure({ id: "ch-support", title: t("house.c.chartSupport"), summary: t("house.c.chartSupportSum", { type: t("house.c.sweep." + sweepType) }), tableLabel: t("house.c.showTable"),
        tableHtml: table([t("house.c.colSupportYears"), t("house.c.colToDebtFree")], sweepRows) });

    const yMoney = (v) => formatCompact(v);
    unmountCharts.push(mountChart($("#ch-loan"), (th) => ({
      type: "line",
      data: { labels: yearsFromBuy.map(tag), datasets: [
        { label: t("house.c.colLoan"), data: yearsFromBuy.map((y) => Math.round(pick(y).loan)), borderColor: th.loan, backgroundColor: th.loan, borderDash: [7, 4], borderWidth: 2.5, pointStyle: "rectRot", pointRadius: 4, tension: 0.1 },
        { label: t("house.c.colPortfolio"), data: yearsFromBuy.map((y) => Math.round(pick(y).investments)), borderColor: th.invest, backgroundColor: th.invest, borderWidth: 2.5, pointStyle: "circle", pointRadius: 3, tension: 0.1 },
      ] },
      options: baseOptions(th, yMoney, { tip: eur }),
    })));
    const colours = (th) => ({ living: th.living, goals: th.goals, installment: th.installment, invested: th.invest, toBank: th.bank, bonusSpent: th.bonus });
    unmountCharts.push(mountChart($("#ch-flow"), (th) => {
      const c = colours(th);
      const opts = baseOptions(th, yMoney, { x: { stacked: true }, y: { stacked: true }, tip: eur });
      return {
        type: "bar",
        data: {
          labels: all.map((y) => String(y.year)),
          datasets: [
            ...flowKeys.map((k) => ({ type: "bar", label: t("house.c.flow." + k), data: all.map((y) => Math.round(pick(y)[k])), backgroundColor: c[k], stack: "s", order: 1 })),
            // The line is the ceiling: what you earn in the year. The bars add up to it.
            { type: "line", label: t("house.c.flow.pay"), data: all.map((y) => Math.round(pick(y).pay)), borderColor: th.text, backgroundColor: th.text, borderWidth: 2.5, borderDash: [3, 3], pointStyle: "triangle", pointRadius: 4, order: 0 },
          ],
        },
        options: opts,
      };
    }));
    unmountCharts.push(mountChart($("#ch-support"), (th) => ({
      type: "line",
      data: { labels: sweep.map((p) => String(p.years)), datasets: [
        { label: t("house.c.colToDebtFree"), data: sweep.map((p) => (p.toDebtFree === null ? null : Math.round(p.toDebtFree * 10) / 10)), borderColor: th.bank, backgroundColor: th.bank, borderWidth: 2.5, pointRadius: 3, tension: 0.1 },
      ] },
      options: baseOptions(th, (v) => `${v}`, { x: { title: { display: true, text: t("house.c.colSupportYears"), color: th.muted } }, y: { title: { display: true, text: t("house.c.colToDebtFree"), color: th.muted } } }),
    })));
  }

  /* ---------- page ---------- */

  function toolbarHtml() {
    const h = st().house;
    const btn = (value, label) => `<button type="button" class="btn ${h.units === value ? "btn-primary" : ""}" data-action="units" data-value="${value}" aria-pressed="${h.units === value}">${label}</button>`;
    return `
      <section class="card" aria-labelledby="units-h">
        <h2 id="units-h">${t("house.units.title")}</h2>
        <div class="form-row">
          <div class="field"><span class="label" id="units-l">${t("house.units.show")}</span><div class="row" role="group" aria-labelledby="units-l">${btn("future", t("house.units.future"))}${btn("today", t("house.units.today"))}</div></div>
          ${num("inflationPct", t("house.units.inflation"), { min: 0, max: 20, step: 0.1, unit: "%", hint: t("house.units.inflationHint") })}
          ${num("age", t("house.units.age"), { min: 16, max: 64, step: 1, hint: t("house.units.ageHint", { retire: RETIREMENT_AGE }) })}
        </div>
        <p class="small muted">${t("house.units.note")}</p>
      </section>`;
  }

  function pageHtml() {
    const s = st();
    const head = `<div class="page-head"><h1>${t("house.title")}</h1><p>${t("house.intro")}</p></div>`;
    if (!s.settings.startMonth) {
      return `${head}<section class="card soon-card"><p>${t("house.needBudget")}</p><a class="btn btn-primary" href="#/budget">${t("house.needBudgetCta")}${icon("chevron-right")}</a></section>`;
    }
    lastA = analyse();
    return `${head}<div class="stack-lg">${toolbarHtml()}${futureHtml(lastA)}${stageAHtml()}${stageBHtml()}${stageCHtml()}</div>`;
  }

  function refresh() {
    if (!st().settings.startMonth) return;
    const a = analyse();
    lastA = a;
    $("#res-future").innerHTML = futureResult(a);
    $("#res-a").innerHTML = stageAResult(a);
    $("#res-b").innerHTML = stageBResult(a);
    $("#res-c").innerHTML = stageCResult(a);
    clearTimeout(chartTimer);
    chartTimer = setTimeout(() => drawCharts(a), 250);
  }

  function draw(focusSel) {
    unmountCharts.forEach((fn) => fn());
    unmountCharts = [];
    wrap.innerHTML = pageHtml();
    wrap.querySelectorAll('input[type="month"]').forEach((el) => {
      if (el.type !== "month") el.setAttribute("title", "YYYY-MM");
    });
    refresh();
    updateEventSummary();
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  }

  /* ---------- events ---------- */

  const setError = (id, msg, inputSel) => {
    $(id).textContent = msg;
    const input = $(inputSel);
    if (msg) { input.setAttribute("aria-invalid", "true"); input.focus(); } else input.removeAttribute("aria-invalid");
  };

  const addBtn = (kind) => `[data-action="open-form"][data-form="${kind}"]`;
  /** Closes the open "add" form without saving and puts focus back on its button. */
  function closeForm() {
    const kind = openForm;
    openForm = null;
    draw(kind ? addBtn(kind) : undefined);
  }
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape" && openForm) closeForm(); });

  wrap.addEventListener("click", (e) => {
    const goto = e.target.closest('[data-action="goto-a"]');
    if (goto) { e.preventDefault(); const el = $("#f-amount"); if (el) { el.scrollIntoView({ block: "center" }); el.focus(); } return; }
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const act = btn.dataset.action;
    if (act === "units") {
      store.update((s) => { s.house.units = btn.dataset.value; });
      wrap.querySelectorAll('[data-action="units"]').forEach((b) => {
        const on = b.dataset.value === btn.dataset.value;
        b.setAttribute("aria-pressed", String(on));
        b.classList.toggle("btn-primary", on);
      });
      refresh();
    } else if (act === "open-form") {
      openForm = btn.dataset.form;
      draw({ salary: "#ss-from", cost: "#cs-from", event: "#ev-name" }[openForm]);
    } else if (act === "close-form") closeForm();
    else if (act === "rm-salary") { store.update((s) => { s.house.salarySteps = s.house.salarySteps.filter((x) => x.id !== btn.dataset.id); }); draw(addBtn("salary")); }
    else if (act === "rm-cost") { store.update((s) => { s.house.costSteps = s.house.costSteps.filter((x) => x.id !== btn.dataset.id); }); draw(addBtn("cost")); }
    else if (act === "rm-event") { store.update((s) => { s.house.events = s.house.events.filter((x) => x.id !== btn.dataset.id); }); draw(addBtn("event")); }
    else if (act === "set-loan") {
      store.update((s) => { s.house.mode = "loan"; s.house.amount = Number(btn.dataset.amount); });
      draw("#f-amount");
    }
  });

  wrap.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    const start = st().settings.startMonth;
    if (form.id === "salary-step-form") {
      const from = $("#ss-from").value.trim(), amount = parseAmount($("#ss-amount").value);
      if (!isMonthKey(from) || from < start) return setError("#ss-error", t("house.f.errMonth", { month: formatMonth(start) }), "#ss-from");
      if (!(amount > 0)) return setError("#ss-error", t("house.f.errSalary"), "#ss-amount");
      store.update((s) => {
        s.house.salarySteps = s.house.salarySteps.filter((x) => x.from !== from);
        s.house.salarySteps.push({ id: store.newId(), from, amount });
        s.house.salarySteps.sort((x, y) => x.from.localeCompare(y.from));
      });
      openForm = null;
      draw(addBtn("salary"));
    } else if (form.id === "cost-step-form") {
      const from = $("#cs-from").value.trim(), amount = parseAmount($("#cs-amount").value), catId = $("#cs-cat").value;
      if (!isMonthKey(from) || from < start) return setError("#cs-error", t("house.f.errMonth", { month: formatMonth(start) }), "#cs-from");
      if (amount === null || Number.isNaN(amount)) return setError("#cs-error", t("house.f.errAmount"), "#cs-amount");
      store.update((s) => {
        s.house.costSteps = s.house.costSteps.filter((x) => !(x.from === from && x.catId === catId));
        s.house.costSteps.push({ id: store.newId(), from, catId, amount });
        s.house.costSteps.sort((x, y) => x.from.localeCompare(y.from));
      });
      openForm = null;
      draw(addBtn("cost"));
    } else if (form.id === "event-form") {
      const name = $("#ev-name").value.trim(), startM = $("#ev-start").value.trim(), endRaw = $("#ev-end").value.trim();
      const salaryRaw = parseAmount($("#ev-salary").value);
      if (!name) return setError("#ev-error", t("house.f.errName"), "#ev-name");
      if (!isMonthKey(startM) || startM < start) return setError("#ev-error", t("house.f.errMonth", { month: formatMonth(start) }), "#ev-start");
      if (endRaw && (!isMonthKey(endRaw) || monthsBetween(startM, endRaw) < 1)) return setError("#ev-error", t("house.f.errEnd"), "#ev-end");
      if (Number.isNaN(salaryRaw)) return setError("#ev-error", t("house.f.errSalaryEvent"), "#ev-salary");
      const costs = {};
      for (const c of st().categories) {
        if ($(`#ev-cost-${c.id}`).disabled) continue;
        const v = parseAmount($(`#ev-cost-${c.id}`).value);
        if (Number.isNaN(v)) return setError("#ev-error", t("house.f.errAmount"), `#ev-cost-${c.id}`);
        if (v !== null) costs[c.id] = v;
      }
      if (!Object.keys(costs).length) {
        const first = wrap.querySelector(".ev-new:not(:disabled)");
        return setError("#ev-error", t("house.f.errNoChange"), first ? `#${first.id}` : "#ev-salary");
      }
      store.update((s) => {
        s.house.events.push({ id: store.newId(), name, start: startM, end: endRaw || null, salary: salaryRaw, costs });
        s.house.events.sort((x, y) => x.start.localeCompare(y.start));
      });
      openForm = null;
      draw(addBtn("event"));
    }
  });

  wrap.addEventListener("input", (e) => {
    const el = e.target;
    if (el.classList.contains("ev-new") || el.id === "ev-salary") { updateEventSummary(); return; }
    const path = el.dataset.path;
    if (!path || el.type !== "number") return;
    if (path === "age" && el.value.trim() === "") { // the age can be cleared
      el.removeAttribute("aria-invalid");
      store.update((x) => { x.house.age = null; });
      refresh();
      return;
    }
    const v = parseAmount(el.value);
    if (v === null || Number.isNaN(v) || v < Number(el.min) || v > Number(el.max)) { el.setAttribute("aria-invalid", "true"); return; }
    el.removeAttribute("aria-invalid");
    store.update((s) => set(s.house, path, v));
    refresh();
  });

  wrap.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "ev-start") { rebuildEventCosts(); return; }
    if (el.dataset.path && el.type === "number") {
      el.removeAttribute("aria-invalid");
      el.value = get(st().house, el.dataset.path) ?? ""; // put back the last valid value if the entry was empty or out of range
    } else if (el.dataset.path && el.type === "radio") {
      store.update((s) => set(s.house, el.dataset.path, el.value));
      draw(`input[name="r-${el.dataset.path}"][value="${el.value}"]`);
    } else if (el.dataset.check) {
      store.update((s) => set(s.house, el.dataset.check, el.checked));
      draw(`#${el.id}`);
    } else if (el.dataset.month) {
      const v = el.value.trim();
      const isEnd = el.dataset.month.endsWith("partnerEnd");
      store.update((s) => {
        const sup = s.house.support;
        if (isEnd) {
          const from = sup.partnerStart ?? s.settings.startMonth;
          sup.partnerEnd = isMonthKey(v) && v > from ? v : null; // an end before the start is ignored
        } else {
          sup.partnerStart = isMonthKey(v) ? v : null;
          if (sup.partnerEnd && sup.partnerStart && sup.partnerEnd <= sup.partnerStart) sup.partnerEnd = null;
        }
      });
      draw(`#${el.id}`);
    }
  });

  draw();
  return () => { clearTimeout(chartTimer); unmountCharts.forEach((fn) => fn()); unmountCharts = []; };
}
