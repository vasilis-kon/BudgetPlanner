// Budget Plan: the baselines. Salary, what you expect to spend per category (carried forward until changed), goals, bonus share, free money.
import { t, formatMoney as eur, formatMonth, formatMonthShort } from "../i18n/index.js";
import { icon, PICKABLE } from "../components/icon.js";
import { esc, parseAmount } from "../components/dom.js";
import { moneyInput } from "../components/money-input.js";
import { monthField } from "../components/month-picker.js";
import * as store from "../store.js";
import {
  BONUS_MONTHS, addMonths, isMonthKey, monthKey, monthsBetween, parseMonth,
  bonusForSalary, splitBonus,
} from "../calc/budget.js";
import { inputFromState, prepare, project, monthPicture, plannedDetail } from "../calc/projection.js";
import { PLAN_MONTHS, getSelected, setSelected, currentMonth, endMonth, clampMonth } from "../components/selected-month.js";

let selected = null; // month being viewed (mirrors the shared selected month)

const catName = (c) => (c.builtin ? t("cat." + c.id) : c.name);

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  let salaryFormOpen = false;
  const $ = (sel) => wrap.querySelector(sel);

  const state = () => store.getState();

  /* ---------- the plan behind each month: the very numbers the House Planner uses ---------- */
  let plan = null; // { inp, prep, r }
  let pic = null; // what the selected month looks like (salary, planned amounts, goals, home, replaced expenses, free money)
  let drawnKey = ""; // which expenses were replaced when this month was drawn
  function computePlan() {
    const st = state();
    if (!st.settings.startMonth) { plan = null; pic = null; return; }
    const inp = inputFromState(st, currentMonth());
    const prep = prepare(inp);
    plan = { inp, prep, r: project(inp, prep) };
    pic = monthPicture(inp, prep, plan.r, selected);
  }
  const replacedKey = () => Object.keys(pic.replacedBy).sort().join(",");
  const replacement = (catId) => pic.replacedBy[catId] || null;
  const replacedText = (rep) => (rep.kind === "home" ? t("budget.expenses.rentReplaced") : t("budget.expenses.goalReplaced", { goal: esc(rep.name) }));
  const salaryOn = (key) => plan.prep.salary[Math.max(0, Math.min(plan.prep.H - 1, monthsBetween(plan.inp.start, key)))];
  const goalLines = () => pic.goalLines;
  const summary = () => pic;

  /* ---------- HTML pieces ---------- */

  function setupHtml() {
    return `
      <div class="page-head"><h1>${t("budget.title")}</h1><p>${t("budget.intro")}</p></div>
      <section class="card" aria-labelledby="setup-h" style="max-width:40rem">
        <h2 id="setup-h">${t("budget.setup.title")}</h2>
        <p class="muted">${t("budget.setup.text")}</p>
        <form id="setup-form" class="stack" novalidate>
          ${monthField({ id: "setup-start", label: t("budget.setup.startLabel"), value: currentMonth() })}
          <div class="field">
            ${moneyInput({ id: "setup-salary", label: t("budget.setup.salaryLabel"), value: "", required: true, min: 0, placeholder: "1500" })}
          </div>
          <p class="error" id="setup-error" role="alert"></p>
          <div><button class="btn btn-primary" type="submit">${t("budget.setup.submit")}</button></div>
        </form>
      </section>`;
  }

  function freeInner(sum) {
    const free = sum.freeIfPlanned; // this page is the plan: what is left once every baseline is spent
    const cls = free > 0.005 ? "positive" : free < -0.005 ? "negative" : "zero";
    const status = cls === "positive" ? t("budget.free.positive") : cls === "zero" ? t("budget.free.zero") : t("budget.free.negative", { amount: eur(-free) });
    const basis = t("budget.free.basisPlan");
    return {
      cls,
      html: `
        <div class="card-head">${icon("wallet")}<h2 id="free-h">${t("budget.free.title")}</h2></div>
        <p class="stat-label">${t("budget.free.label")}</p>
        <p class="stat-value">${eur(free)}</p>
        <p class="stat-sub" role="status">${icon(cls === "positive" ? "check" : "triangle-alert", { size: 16 })} ${status}</p>
        ${cls === "negative" && selected >= currentMonth() ? `<p class="stat-sub"><strong>${t("budget.free.cutAdvice", { amount: eur(Math.ceil(-free)) })}</strong></p>` : ""}
        <p class="stat-sub">${basis}</p>
        <p class="stat-sub">${t("budget.free.salary")} ${eur(sum.salary)} − ${t("budget.free.spent")} ${eur(sum.planned)} − ${t("budget.free.goals")} ${eur(sum.goalTotal)}${sum.houseTotal > 0 ? ` − ${t("budget.free.home")} ${eur(sum.houseTotal)}` : ""}</p>
        <p class="stat-sub">${t("budget.free.goalsNote")}</p>`,
    };
  }

  function homeHtml() {
    const hf = pic.house;
    if (!hf) return "";
    const rows = [];
    if (hf.installment > 0.005) rows.push(`<li><span class="left"><span class="cat-icon">${icon("landmark")}</span><span>${t("budget.home.installment")}</span></span><strong class="num">${eur(hf.installment)}</strong></li>`);
    rows.push(`<li><span class="left"><span class="cat-icon">${icon("house")}</span><span>${t("budget.home.running")}</span></span><strong class="num">${eur(hf.homeCosts)}</strong></li>`);
    return `
      <section class="card" id="home-card" aria-labelledby="home-h">
        <div class="card-head">${icon("house")}<h2 id="home-h">${t("budget.home.title")}</h2></div>
        <p class="muted">${t("budget.home.intro", { purchase: formatMonth(hf.purchase) })}</p>
        <ul class="simple-list">${rows.join("")}</ul>
        ${hf.installment > 0.005 ? "" : `<p class="small muted">${t("budget.home.loanEnded")}</p>`}
        <p class="stat-sub"><strong>${t("budget.home.total")}: ${eur(hf.installment + hf.homeCosts)}</strong> · <a href="#/house">${t("budget.home.link")}</a></p>
      </section>`;
  }

  function goalsHtml() {
    const { lines, total } = goalLines();
    if (!lines.length) {
      return `
        <div class="card-head">${icon("target")}<h2 id="goals-h">${t("budget.goals.title")}</h2></div>
        <p class="muted">${t("budget.goals.none")} <a href="#/goals">${t("budget.goals.link")}</a></p>`;
    }
    const rows = lines.map((l) => `
      <li>
        <span class="left"><span class="cat-icon">${icon(l.kind === "goal" ? "target" : "wrench")}</span><span>${esc(l.name)} <span class="muted small">· ${t(l.kind === "goal" ? "budget.goals.kindGoal" : "budget.goals.kindOngoing")}</span></span></span>
        <strong class="num">${eur(l.amount)}</strong>
      </li>`).join("");
    return `
      <div class="card-head">${icon("target")}<h2 id="goals-h">${t("budget.goals.title")}</h2></div>
      <p class="muted">${t("budget.goals.intro", { month: formatMonth(selected) })}</p>
      <ul class="simple-list">${rows}</ul>
      <p class="stat-sub"><strong>${t("budget.goals.total")}: ${eur(total)}</strong> · <a href="#/goals">${t("budget.goals.manage")}</a></p>`;
  }

  function salaryHtml(sum) {
    const st = state();
    const steps = [...st.salary].sort((a, b) => a.from.localeCompare(b.from));
    const first = steps[0] && steps[0].from;
    const monthName = formatMonth(selected);
    const list = steps.map((x) => `
      <li>
        <span>${x.from === first ? t("budget.salary.initial") + " · " : ""}${t("budget.salary.from", { month: formatMonth(x.from) })}</span>
        <span class="row"><strong class="num">${eur(x.amount)}</strong>
        ${x.from === first ? "" : `<button type="button" class="btn btn-quiet btn-small btn-danger btn-icon" data-action="remove-salary" data-from="${x.from}" aria-label="${t("budget.salary.remove", { month: formatMonth(x.from) })}">${icon("trash-2", { size: 16 })}</button>`}</span>
      </li>`).join("");
    const form = salaryFormOpen ? `
      <form id="salary-form" class="inline-form" novalidate>
        <div class="field">
          ${moneyInput({ id: "salary-new", label: t("budget.salary.newLabel"), value: "", required: true, placeholder: String(sum.salary), dataAttrs: 'aria-describedby="salary-error"' })}
          <span class="error" id="salary-error" role="alert"></span>
        </div>
        <div class="row">
          <button type="submit" class="btn btn-primary">${t("budget.salary.apply", { month: monthName })}</button>
          <button type="button" class="btn" data-action="salary-cancel">${t("budget.salary.cancel")}</button>
        </div>
      </form>` : "";
    return `
      <div class="card-head">${icon("landmark")}<h2 id="salary-h">${t("budget.salary.title")}</h2></div>
      <p class="stat-label">${t("budget.salary.current", { month: monthName })}</p>
      <p class="stat-value">${eur(sum.salary)}</p>
      ${sum.salaryFrom ? `<div class="note" style="margin:var(--space-2) 0">${icon("info", { size: 18 })}<p>${sum.salaryFrom.kind === "event" ? t("budget.salary.fromEvent", { name: esc(sum.salaryFrom.name) }) : t("budget.salary.fromStep")} <a href="#/house">${t("budget.salary.openHouse")}</a></p></div>` : ""}
      <p class="stat-sub">${t("budget.salary.note")}</p>
      <p style="margin-top:var(--space-3)"><button type="button" class="btn" data-action="salary-open" aria-expanded="${salaryFormOpen}" ${salaryFormOpen ? 'aria-controls="salary-form"' : ""}>${t("budget.salary.change", { month: monthName })}</button></p>
      ${form}
      <h3 class="small" style="margin-top:var(--space-4)">${t("budget.salary.history")}</h3>
      <ul class="simple-list">${list}</ul>
      <p class="small muted" style="margin-top:var(--space-2)">${t("budget.salary.earlierNote")}</p>`;
  }

  function plannedAttrs(cat) {
    const d = plannedDetail(plan.inp, cat.id, selected);
    const base = t("budget.expenses.plannedFor", { name: catName(cat) });
    // A life event always wins, and so does a cost step that starts this very month: those amounts are changed in the House Planner.
    const locked = d.source === "event" || (d.source === "step" && d.stepFrom === selected);
    let note = "", inherited = false;
    if (d.source === "event") note = t("budget.expenses.fromEvent", { name: d.event });
    else if (d.source === "step") { note = t("budget.expenses.fromStep", { month: formatMonth(d.stepFrom) }); inherited = d.stepFrom !== selected; }
    else inherited = d.budgetFrom !== null && d.budgetFrom !== selected;
    const carried = d.source === "budget" && inherited ? ` (${t("budget.expenses.carried", { month: formatMonth(d.budgetFrom) })})` : "";
    return {
      value: d.source === "budget" && d.budgetFrom === null ? "" : d.amount,
      inherited, locked, note,
      label: `${base}${carried}${note ? ` (${note})` : ""}`,
    };
  }

  function expensesHtml() {
    const st = state();
    const rows = st.categories.map((c) => {
      const rep = replacement(c.id);
      if (rep) { // €0: rent once the loan is being paid, or an expense a reached goal replaces (a car replaces transport)
        const label = `${catName(c)}: ${replacedText(rep)}`;
        return `
        <tr>
          <th scope="row"><span class="cat"><span class="cat-icon">${icon(c.icon)}</span>${esc(catName(c))}</span></th>
          <td class="num" data-label="${t("budget.expenses.planned")}">${moneyInput({ id: `planned-${c.id}`, value: 0, ariaLabel: label, dataAttrs: "disabled" })}</td>
        </tr>`;
      }
      const p = plannedAttrs(c);
      return `
        <tr>
          <th scope="row"><span class="cat"><span class="cat-icon">${icon(c.icon)}</span>${esc(catName(c))}</span>${p.note ? `<span class="cat-note">${esc(p.note)}</span>` : ""}</th>
          <td class="num" data-label="${t("budget.expenses.planned")}">${moneyInput({ id: `planned-${c.id}`, value: p.value, ariaLabel: p.label, className: p.locked ? "" : p.inherited ? "js-planned inherited" : "js-planned", dataAttrs: `data-cat="${c.id}" ${p.locked ? "disabled" : ""}` })}</td>
        </tr>`;
    }).join("");
    return `
      <h2 id="exp-h">${t("budget.expenses.title")}</h2>
      <p class="muted">${t("budget.expenses.intro")}</p>
      <p class="small muted">${t("budget.expenses.carriedHint")}</p>
      <p class="small"><a href="#/tracker">${t("budget.expenses.trackerLink")}</a></p>
      ${Object.entries(pic.replacedBy).map(([id, rep]) => {
        const c = st.categories.find((x) => x.id === id);
        if (!c) return "";
        const text = rep.kind === "home" ? t("budget.expenses.rentZero", { month: formatMonth(pic.house.purchase) }) : t("budget.expenses.goalZero", { cat: esc(catName(c)), goal: esc(rep.name) });
        return `<div class="note" style="margin-bottom:var(--space-3)">${icon("info", { size: 18 })}<p>${text}</p></div>`;
      }).join("")}
      <div class="table-wrap">
        <table class="expenses">
          <caption class="visually-hidden">${t("budget.expenses.title")} · ${formatMonth(selected)}</caption>
          <thead><tr>
            <th scope="col">${t("budget.expenses.category")}</th>
            <th scope="col" class="num">${t("budget.expenses.planned")}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <th scope="row">${t("budget.expenses.total")}</th>
            <td class="num" id="total-planned"></td>
          </tr></tfoot>
        </table>
      </div>`;
  }

  function bonusBodyHtml(sum) {
    const st = state();
    const pct = st.settings.bonusSharePct;
    const now = sum.bonus
      ? `<div class="note" style="margin-bottom:var(--space-3)">${icon("info", { size: 18 })}<p><strong>${t("budget.bonus.thisMonth")}.</strong> ${t("budget.bonus.thisMonthText", { name: t("budget.bonus." + sum.bonus.id), amount: eur(sum.bonus.amount), saved: eur(sum.bonus.saved), spent: eur(sum.bonus.spent) })}</p></div>`
      : `<p class="small muted">${t("budget.bonus.none")}</p>`;
    const { year } = parseMonth(selected);
    const rows = Object.keys(BONUS_MONTHS).map(Number).sort((a, b) => a - b).map((m) => {
      const key = monthKey(year, m);
      if (key < st.settings.startMonth || key > endMonth(st)) return "";
      const b = bonusForSalary(salaryOn(key), key);
      const sp = splitBonus(b.amount, pct);
      return `<tr class="${key === selected ? "current" : ""}">
        <td>${t("budget.bonus.row", { name: t("budget.bonus." + b.id), month: formatMonthShort(key) })}</td>
        <td class="num">${eur(b.amount)}</td><td class="num">${eur(sp.saved)}</td><td class="num">${eur(sp.spent)}</td></tr>`;
    }).join("");
    const table = rows ? `
      <h3 class="small">${t("budget.bonus.yearTitle", { year })}</h3>
      <table class="bonus-table">
        <thead><tr><th scope="col">${t("budget.bonus.title")}</th><th scope="col" class="num">€</th><th scope="col" class="num">${t("budget.bonus.saved")}</th><th scope="col" class="num">${t("budget.bonus.spent")}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>` : "";
    return `${now}${table}<p class="small muted" style="margin-top:var(--space-3)">${t("budget.bonus.notIncluded")}</p>`;
  }

  function categoriesHtml() {
    const st = state();
    const custom = st.categories.filter((c) => !c.builtin);
    const list = custom.length
      ? `<ul class="simple-list">${custom.map((c) => `
          <li><span class="left"><span class="cat-icon">${icon(c.icon)}</span><span>${esc(c.name)}</span></span>
          <button type="button" class="btn btn-quiet btn-small btn-danger btn-icon" data-action="remove-cat" data-id="${c.id}" aria-label="${esc(t("budget.categories.remove", { name: c.name }))}">${icon("trash-2", { size: 16 })}</button></li>`).join("")}</ul>`
      : `<p class="small muted">${t("budget.categories.none")}</p>`;
    const picks = PICKABLE.map((n, i) => `
      <label><input type="radio" name="cat-icon" value="${n}" ${i === 0 ? "checked" : ""}>${icon(n)}<span class="visually-hidden">${t("iconName." + n)}</span></label>`).join("");
    return `
      <h2 id="cat-h">${t("budget.categories.title")}</h2>
      <p class="muted">${t("budget.categories.intro")}</p>
      <div class="grid grid-2">
        <form id="cat-form" class="stack" novalidate>
          <h3>${t("budget.categories.add")}</h3>
          <div class="field">
            <label for="cat-name">${t("budget.categories.nameLabel")}</label>
            <input type="text" id="cat-name" maxlength="40" autocomplete="off" aria-describedby="cat-error">
            <span class="error" id="cat-error" role="alert"></span>
          </div>
          <fieldset class="field"><legend>${t("budget.categories.iconLabel")}</legend><div class="icon-picker">${picks}</div></fieldset>
          <div><button class="btn btn-primary" type="submit">${icon("plus", { size: 18 })}${t("budget.categories.submit")}</button></div>
        </form>
        <div><h3>${t("budget.categories.custom")}</h3>${list}</div>
      </div>`;
  }

  function mainHtml() {
    const st = state();
    const start = st.settings.startMonth, end = endMonth(st);
    const sum = summary();
    const free = freeInner(sum);
    return `
      <div class="page-head"><h1>${t("budget.title")}</h1><p>${t("budget.intro")}</p></div>
      <div class="stack-lg">
        <section class="card" aria-labelledby="month-h">
          <h2 id="month-h">${formatMonth(selected)}</h2>
          <div class="month-picker">
            <button type="button" class="btn btn-icon" data-action="prev" aria-label="${t("budget.month.prev")}" ${selected <= start ? "disabled" : ""}>${icon("chevron-left")}</button>
            ${monthField({ id: "month-input", label: t("budget.month.label"), value: selected, min: start, max: end })}
            <button type="button" class="btn btn-icon" data-action="next" aria-label="${t("budget.month.next")}" ${selected >= end ? "disabled" : ""}>${icon("chevron-right")}</button>
          </div>
        </section>
        <div class="grid grid-2">
          <section class="card free-card ${free.cls}" id="free-card" aria-labelledby="free-h">${free.html}</section>
          <section class="card" id="salary-card" aria-labelledby="salary-h">${salaryHtml(sum)}</section>
        </div>
        ${homeHtml()}
        <section class="card" id="goals-card" aria-labelledby="goals-h">${goalsHtml()}</section>
        <section class="card" id="expenses-card" aria-labelledby="exp-h">${expensesHtml()}</section>
        <section class="card" aria-labelledby="bonus-h">
          <div class="card-head">${icon("gift")}<h2 id="bonus-h">${t("budget.bonus.title")}</h2></div>
          <p class="muted">${t("budget.bonus.intro")}</p>
          <div class="field" style="max-width:18rem">
            <label for="bonus-share">${t("budget.bonus.shareLabel")}</label>
            <div class="input-unit"><input type="number" id="bonus-share" min="0" max="100" step="1" inputmode="numeric" value="${st.settings.bonusSharePct}"><span aria-hidden="true">%</span></div>
          </div>
          <p class="small muted" style="margin-top:var(--space-3)">${t("budget.bonus.goesTo")}</p>
          <div id="bonus-body">${bonusBodyHtml(sum)}</div>
        </section>
        <section class="card" id="categories-card" aria-labelledby="cat-h">${categoriesHtml()}</section>
        <details class="card">
          <summary><strong>${t("budget.month.startLabel")} ${formatMonth(start)}</strong></summary>
          <div class="stack" style="margin-top:var(--space-3)">
            ${monthField({ id: "start-input", label: t("budget.month.startLabel"), value: start })}
            <p class="small muted">${t("budget.month.range", { years: PLAN_MONTHS / 12 })}</p>
          </div>
        </details>
      </div>`;
  }

  /* ---------- drawing ---------- */

  function draw(focusSel) {
    const st = state();
    if (!st.settings.startMonth) {
      wrap.innerHTML = setupHtml();
    } else {
      const shared = getSelected();
      selected = clampMonth(st, shared && isMonthKey(shared) ? shared : currentMonth());
      setSelected(selected);
      computePlan();
      drawnKey = replacedKey();
      wrap.innerHTML = mainHtml();
      refresh();
    }
    wrap.querySelectorAll('input[type="month"]').forEach((el) => {
      if (el.type !== "month") el.setAttribute("title", "YYYY-MM"); // browsers without a month picker
    });
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  }

  /** Updates the numbers that change while typing, without redrawing (so focus is kept). */
  function refresh() {
    computePlan(); // what you plan to spend decides when you can buy, which can change what this month looks like
    if (replacedKey() !== drawnKey) {
      const id = document.activeElement && wrap.contains(document.activeElement) ? document.activeElement.id : "";
      draw(id ? `#${id}` : undefined);
      return;
    }
    const sum = summary();
    const free = freeInner(sum);
    const card = $("#free-card");
    card.className = `card free-card ${free.cls}`;
    card.innerHTML = free.html;
    $("#total-planned").textContent = eur(sum.planned);
  }

  function syncPlannedInput(input) {
    const cat = state().categories.find((c) => c.id === input.dataset.cat);
    const p = plannedAttrs(cat);
    input.value = p.value;
    input.classList.toggle("inherited", p.inherited);
    input.setAttribute("aria-label", p.label);
  }

  function setMonth(k) {
    const st = state();
    if (!isMonthKey(k) || k < st.settings.startMonth || k > endMonth(st)) { $("#month-input").value = selected; return; }
    selected = k;
    setSelected(k);
    salaryFormOpen = false;
    draw("#month-input");
  }

  /* ---------- events ---------- */

  const setError = (id, msg, inputSel) => {
    $(id).textContent = msg;
    const input = $(inputSel);
    if (msg) { input.setAttribute("aria-invalid", "true"); input.focus(); } else input.removeAttribute("aria-invalid");
  };

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.action;
    if (act === "prev") setMonth(addMonths(selected, -1));
    else if (act === "next") setMonth(addMonths(selected, 1));
    else if (act === "salary-open") { salaryFormOpen = !salaryFormOpen; draw(salaryFormOpen ? "#salary-new" : '[data-action="salary-open"]'); }
    else if (act === "salary-cancel") { salaryFormOpen = false; draw('[data-action="salary-open"]'); }
    else if (act === "remove-salary") {
      store.update((s) => { s.salary = s.salary.filter((x) => x.from !== btn.dataset.from); });
      draw('[data-action="salary-open"]');
    } else if (act === "remove-cat") {
      const cat = state().categories.find((c) => c.id === btn.dataset.id);
      if (!cat || !window.confirm(t("budget.categories.removeConfirm", { name: cat.name }))) return;
      store.update((s) => {
        s.categories = s.categories.filter((c) => c.id !== cat.id);
        for (const m of Object.values(s.months)) {
          delete m.planned[cat.id];
          for (const it of m.items) if (it.catId === cat.id) it.catId = "other"; // logged expenses are kept, under Other
        }
        // Expected cost changes in the House Planner that point at this category go too.
        s.house.costSteps = s.house.costSteps.filter((x) => x.catId !== cat.id);
        for (const e of s.house.events) delete e.costs[cat.id];
        for (const g of s.goals) { // a goal that replaced this expense no longer does
          if (g.data && g.data.replaces === cat.id) g.data.replaces = null;
          if (g.draft && g.draft.replaces === cat.id) g.draft.replaces = null;
        }
      });
      draw("#cat-name");
    }
  });

  wrap.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.id === "setup-form") {
      const start = $("#setup-start").value.trim();
      const salary = parseAmount($("#setup-salary").value);
      if (!isMonthKey(start)) return setError("#setup-error", t("budget.setup.startError"), "#setup-start");
      if (!(salary > 0)) return setError("#setup-error", t("budget.setup.salaryError"), "#setup-salary");
      store.update((s) => { s.settings.startMonth = start; s.salary = [{ from: start, amount: salary }]; });
      selected = clampMonth(state(), currentMonth());
      setSelected(selected);
      draw("#month-input");
    } else if (form.id === "salary-form") {
      const v = parseAmount($("#salary-new").value);
      if (!(v > 0)) return setError("#salary-error", t("budget.salary.error"), "#salary-new");
      store.update((s) => {
        const i = s.salary.findIndex((x) => x.from === selected);
        if (i >= 0) s.salary[i].amount = v; else s.salary.push({ from: selected, amount: v });
        s.salary.sort((a, b) => a.from.localeCompare(b.from));
      });
      salaryFormOpen = false;
      draw('[data-action="salary-open"]');
    } else if (form.id === "cat-form") {
      const name = $("#cat-name").value.trim();
      const st = state();
      if (!name) return setError("#cat-error", t("budget.categories.nameError"), "#cat-name");
      if (st.categories.some((c) => catName(c).toLowerCase() === name.toLowerCase())) return setError("#cat-error", t("budget.categories.dupError"), "#cat-name");
      const chosen = (form.querySelector('input[name="cat-icon"]:checked') || {}).value || "circle-ellipsis";
      store.update((s) => { s.categories.push({ id: store.categoryId(), name, icon: chosen, builtin: false }); });
      draw("#cat-name");
    }
  });

  wrap.addEventListener("input", (e) => {
    const el = e.target;
    if (el.classList.contains("js-planned")) {
      const v = parseAmount(el.value);
      if (Number.isNaN(v)) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
      store.update((s) => {
        const m = (s.months[selected] ||= { planned: {}, items: [] });
        if (v === null) delete m.planned[el.dataset.cat]; else m.planned[el.dataset.cat] = v;
      });
      if (v !== null) el.classList.remove("inherited");
      refresh();
    } else if (el.id === "bonus-share") {
      const v = parseAmount(el.value);
      if (v === null || Number.isNaN(v) || v > 100) return;
      store.update((s) => { s.settings.bonusSharePct = v; });
      $("#bonus-body").innerHTML = bonusBodyHtml(summary());
    }
  });

  wrap.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "month-input") setMonth(el.value);
    else if (el.id === "start-input") {
      if (!isMonthKey(el.value)) { el.value = state().settings.startMonth; return; }
      store.update((s) => { s.settings.startMonth = el.value; });
      selected = clampMonth(state(), selected);
      setSelected(selected);
      draw("#start-input");
    } else if (el.classList.contains("js-planned") && el.value.trim() === "") syncPlannedInput(el);
    else if (el.id === "bonus-share") {
      const v = parseAmount(el.value);
      const ok = v !== null && !Number.isNaN(v) && v <= 100;
      el.value = ok ? v : state().settings.bonusSharePct; // restore a valid value if the entry was empty or out of range
      if (!ok) $("#bonus-body").innerHTML = bonusBodyHtml(summary());
    }
  });

  draw();
}
