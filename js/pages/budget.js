// Page 1: Monthly Budget. Salary, expense categories, planned vs actual, bonus share, free money.
import { t, formatMoney as eur, formatMonth, formatMonthShort } from "../i18n/index.js";
import { icon, PICKABLE } from "../components/icon.js";
import { esc, parseAmount } from "../components/dom.js";
import { moneyInput } from "../components/money-input.js";
import { monthField } from "../components/month-picker.js";
import * as store from "../store.js";
import {
  BONUS_MONTHS, addMonths, isMonthKey, monthKey, parseMonth,
  salaryFor, plannedFor, actualFor, summarizeMonth, bonusFor, splitBonus,
} from "../calc/budget.js";
import { approvedGoals, goalLinesFor } from "../calc/goals.js";

const PLAN_MONTHS = 360; // the month picker covers 30 years from the start month
let selected = null; // month being viewed; kept while moving between pages

const catName = (c) => (c.builtin ? t("cat." + c.id) : c.name);
const currentMonth = () => { const d = new Date(); return monthKey(d.getFullYear(), d.getMonth() + 1); };
const endMonth = (st) => addMonths(st.settings.startMonth, PLAN_MONTHS - 1);
const clampMonth = (st, k) => { const a = st.settings.startMonth, b = endMonth(st); return k < a ? a : k > b ? b : k; };

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  let salaryFormOpen = false;
  const $ = (sel) => wrap.querySelector(sel);

  const state = () => store.getState();
  /** Lines approved goals add to the selected month: monthly allocations and ongoing costs. */
  const goalLines = () => goalLinesFor(approvedGoals(state().goals), selected);
  const summary = () => {
    const st = state();
    return summarizeMonth(
      { salarySteps: st.salary, categoryIds: st.categories.map((c) => c.id), months: st.months, bonusSharePct: st.settings.bonusSharePct, goalTotal: goalLines().total },
      selected
    );
  };

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
    const total = state().categories.length;
    const cls = sum.free > 0.005 ? "positive" : sum.free < -0.005 ? "negative" : "zero";
    const status = cls === "positive" ? t("budget.free.positive") : cls === "zero" ? t("budget.free.zero") : t("budget.free.negative", { amount: eur(-sum.free) });
    const basis = sum.loggedCount === 0 ? t("budget.free.basisPlan")
      : sum.loggedCount < total ? t("budget.free.basisMixed", { logged: sum.loggedCount, total })
      : t("budget.free.basisActual");
    return {
      cls,
      html: `
        <div class="card-head">${icon("wallet")}<h2 id="free-h">${t("budget.free.title")}</h2></div>
        <p class="stat-label">${t("budget.free.label")}</p>
        <p class="stat-value">${eur(sum.free)}</p>
        <p class="stat-sub" role="status">${icon(cls === "positive" ? "check" : "triangle-alert", { size: 16 })} ${status}</p>
        <p class="stat-sub">${basis}</p>
        <p class="stat-sub">${t("budget.free.salary")} ${eur(sum.salary)} − ${t("budget.free.spent")} ${eur(sum.spent)} − ${t("budget.free.goals")} ${eur(sum.goalTotal)}</p>
        <p class="stat-sub">${t("budget.free.goalsNote")}</p>`,
    };
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
      <p class="stat-sub">${t("budget.salary.note")}</p>
      <p style="margin-top:var(--space-3)"><button type="button" class="btn" data-action="salary-open" aria-expanded="${salaryFormOpen}" ${salaryFormOpen ? 'aria-controls="salary-form"' : ""}>${t("budget.salary.change", { month: monthName })}</button></p>
      ${form}
      <h3 class="small" style="margin-top:var(--space-4)">${t("budget.salary.history")}</h3>
      <ul class="simple-list">${list}</ul>
      <p class="small muted" style="margin-top:var(--space-2)">${t("budget.salary.earlierNote")}</p>`;
  }

  function diffHtml(catId) {
    const st = state();
    const a = actualFor(st.months, catId, selected);
    if (a === null) return `<span class="diff none">${t("budget.expenses.notLogged")}</span>`;
    const d = a - plannedFor(st.months, catId, selected).amount;
    if (Math.abs(d) < 0.005) return `<span class="diff none">${t("budget.expenses.onPlan")}</span>`;
    return d > 0
      ? `<span class="diff over">+${eur(d)} ${t("budget.expenses.over")}</span>`
      : `<span class="diff under">−${eur(-d)} ${t("budget.expenses.under")}</span>`;
  }

  function plannedAttrs(cat) {
    const p = plannedFor(state().months, cat.id, selected);
    const inherited = p.from !== null && p.from !== selected;
    const base = t("budget.expenses.plannedFor", { name: catName(cat) });
    return {
      value: p.from === null ? "" : p.amount,
      inherited,
      label: inherited ? `${base} (${t("budget.expenses.carried", { month: formatMonth(p.from) })})` : base,
    };
  }

  function expensesHtml() {
    const st = state();
    const rows = st.categories.map((c) => {
      const p = plannedAttrs(c);
      const a = actualFor(st.months, c.id, selected);
      return `
        <tr>
          <th scope="row"><span class="cat"><span class="cat-icon">${icon(c.icon)}</span>${esc(catName(c))}</span></th>
          <td class="num" data-label="${t("budget.expenses.planned")}">${moneyInput({ id: `planned-${c.id}`, value: p.value, ariaLabel: p.label, className: p.inherited ? "js-planned inherited" : "js-planned", dataAttrs: `data-cat="${c.id}"` })}</td>
          <td class="num" data-label="${t("budget.expenses.actual")}">${moneyInput({ id: `actual-${c.id}`, value: a, ariaLabel: t("budget.expenses.actualFor", { name: catName(c) }), className: "js-actual", dataAttrs: `data-cat="${c.id}"` })}</td>
          <td class="num" data-label="${t("budget.expenses.difference")}" id="diff-${c.id}">${diffHtml(c.id)}</td>
        </tr>`;
    }).join("");
    return `
      <h2 id="exp-h">${t("budget.expenses.title")}</h2>
      <p class="muted">${t("budget.expenses.intro")}</p>
      <p class="small muted">${t("budget.expenses.carriedHint")}</p>
      <div class="table-wrap">
        <table class="expenses">
          <caption class="visually-hidden">${t("budget.expenses.title")} · ${formatMonth(selected)}</caption>
          <thead><tr>
            <th scope="col">${t("budget.expenses.category")}</th>
            <th scope="col" class="num">${t("budget.expenses.planned")}</th>
            <th scope="col" class="num">${t("budget.expenses.actual")}</th>
            <th scope="col" class="num">${t("budget.expenses.difference")}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <th scope="row">${t("budget.expenses.total")}</th>
            <td class="num" id="total-planned"></td><td class="num" id="total-actual"></td><td class="num" id="total-diff"></td>
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
      const b = bonusFor(st.salary, key);
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
      selected = clampMonth(st, selected && isMonthKey(selected) ? selected : currentMonth());
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
    const st = state();
    const sum = summary();
    const free = freeInner(sum);
    const card = $("#free-card");
    card.className = `card free-card ${free.cls}`;
    card.innerHTML = free.html;
    let diff = 0;
    for (const c of st.categories) {
      const cell = $(`#diff-${c.id}`);
      if (cell) cell.innerHTML = diffHtml(c.id);
      const a = actualFor(st.months, c.id, selected);
      if (a !== null) diff += a - plannedFor(st.months, c.id, selected).amount;
    }
    $("#total-planned").textContent = eur(sum.planned);
    $("#total-actual").textContent = sum.loggedCount ? eur(sum.actual) : "–";
    $("#total-diff").innerHTML = sum.loggedCount
      ? `<span class="diff ${diff > 0.005 ? "over" : diff < -0.005 ? "under" : "none"}">${diff > 0.005 ? "+" : diff < -0.005 ? "−" : ""}${eur(Math.abs(diff))}</span>` : "–";
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
        for (const m of Object.values(s.months)) { delete m.planned[cat.id]; delete m.actual[cat.id]; }
        // Expected cost changes in the House Planner that point at this category go too.
        s.house.costSteps = s.house.costSteps.filter((x) => x.catId !== cat.id);
        for (const e of s.house.events) delete e.costs[cat.id];
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
    if (el.classList.contains("js-planned") || el.classList.contains("js-actual")) {
      const kind = el.classList.contains("js-planned") ? "planned" : "actual";
      const v = parseAmount(el.value);
      if (Number.isNaN(v)) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
      store.update((s) => {
        const m = (s.months[selected] ||= { planned: {}, actual: {} });
        if (v === null) delete m[kind][el.dataset.cat]; else m[kind][el.dataset.cat] = v;
      });
      if (kind === "planned" && v !== null) el.classList.remove("inherited");
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
