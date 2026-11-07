// Monthly Tracker: a spreadsheet-style list of the month's purchases (each with a category icon), and under it
// a table comparing each category with its Budget Plan baseline for that month.
import { t, formatMoney, formatMonth } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { esc, parseAmount } from "../components/dom.js";
import { moneyInput } from "../components/money-input.js";
import { monthField, dayField } from "../components/month-picker.js";
import * as store from "../store.js";
import { addMonths, isMonthKey, itemsFor, actualFor } from "../calc/budget.js";
import { inputFromState, prepare, project, monthPicture, plannedDetail } from "../calc/projection.js";
import { getSelected, setSelected, currentMonth, endMonth, clampMonth } from "../components/selected-month.js";

const catName = (c) => (c.builtin ? t("cat." + c.id) : c.name);
const EPS = 0.005;
const eur = (n) => formatMoney(n).replace(/(\.\d)$/, "$10"); // purchases have cents: €62.40, not €62.4

const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const lastDay = (key) => { const [y, m] = key.split("-").map(Number); return `${key}-${pad(new Date(y, m, 0).getDate())}`; };

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  const $ = (sel) => wrap.querySelector(sel);
  const state = () => store.getState();

  let selected = null;
  let plan = null; // { inp }
  let pic = null; // what the plan says about this month (which categories are replaced by a goal or the home)
  let lastCat = "other"; // the add row remembers the last category and date, like a spreadsheet
  let lastDate = null;

  function computePlan() {
    const inp = inputFromState(state(), currentMonth());
    const prep = prepare(inp);
    plan = { inp };
    pic = monthPicture(inp, prep, project(inp, prep), selected);
  }
  const replacement = (id) => pic.replacedBy[id] || null;
  const baseline = (id) => (replacement(id) ? 0 : plannedDetail(plan.inp, id, selected).amount);
  const replacedText = (rep) => (rep.kind === "home" ? t("budget.expenses.rentReplaced") : t("budget.expenses.goalReplaced", { goal: esc(rep.name) }));
  const defaultDate = () => {
    if (lastDate && lastDate.startsWith(selected)) return lastDate;
    return selected === currentMonth() ? todayIso() : `${selected}-01`;
  };

  /* ---------- numbers ---------- */

  function totals() {
    const st = state();
    const rows = st.categories.map((c) => {
      const base = baseline(c.id);
      const spent = actualFor(st.months, c.id, selected) || 0;
      return { c, base, spent, diff: spent - base };
    });
    // Fixed costs run on their own every month and are paid as planned: the monthly amount of each goal in place (and its
    // ongoing costs) and, once the house is bought, the installment and home running costs. The Budget Plan takes them off
    // free money too, so they count here as both planned and spent.
    const fixed = [
      ...pic.goalLines.lines.map((l) => ({ id: `${l.kind}-${l.id}`, name: l.name, amount: l.amount, icon: l.kind === "goal" ? "target" : "wrench", note: t(l.kind === "goal" ? "tracker.compare.fixedGoal" : "tracker.compare.fixedOngoing") })),
      ...(pic.house ? [
        ...(pic.house.installment > EPS ? [{ id: "installment", name: t("budget.home.installment"), amount: pic.house.installment, icon: "landmark", note: t("tracker.compare.fixedHome") }] : []),
        { id: "home-costs", name: t("budget.home.running"), amount: pic.house.homeCosts, icon: "house", note: t("tracker.compare.fixedHome") },
      ] : []),
    ].filter((f) => f.amount > EPS);
    const fixedTotal = fixed.reduce((a, f) => a + f.amount, 0);
    const base = rows.reduce((a, r) => a + r.base, 0) + fixedTotal;
    const purchases = rows.reduce((a, r) => a + r.spent, 0);
    const spent = purchases + fixedTotal;
    return { rows, fixed, fixedTotal, purchases, base, spent, diff: spent - base, count: itemsFor(st.months, selected).length };
  }

  const diffHtml = (d) => {
    if (Math.abs(d) < EPS) return `<span class="diff none">${t("tracker.compare.on")}</span>`;
    return d > 0 ? `<span class="diff over">+${eur(d)} ${t("tracker.compare.over")}</span>` : `<span class="diff under">−${eur(-d)} ${t("tracker.compare.under")}</span>`;
  };

  /* ---------- HTML pieces ---------- */

  function needPlanHtml() {
    return `
      <div class="page-head"><h1>${t("tracker.title")}</h1><p>${t("tracker.intro")}</p></div>
      <section class="card soon-card"><p>${t("tracker.needBudget")}</p><a class="btn btn-primary" href="#/budget">${t("tracker.needBudgetCta")}${icon("chevron-right")}</a></section>`;
  }

  function statsHtml(tot) {
    const cls = tot.diff > EPS ? "negative" : tot.diff < -EPS ? "positive" : "zero";
    const sub = (tot.count === 0 ? t("tracker.stat.spentSubNone") : tot.count === 1 ? t("tracker.stat.spentSubOne") : t("tracker.stat.spentSub", { count: tot.count }))
      + (tot.fixedTotal > EPS ? " · " + t("tracker.stat.fixedSub", { amount: eur(tot.fixedTotal) }) : "");
    const label = cls === "negative" ? t("tracker.stat.over") : t("tracker.stat.left");
    const note = cls === "negative" ? t("tracker.stat.overSub") : cls === "zero" ? t("tracker.stat.zeroSub") : t("tracker.stat.leftSub");
    return `
      <section class="card" aria-labelledby="stat-spent-l"><p class="stat-label" id="stat-spent-l">${t("tracker.stat.spent", { month: formatMonth(selected) })}</p><p class="stat-value">${eur(tot.spent)}</p><p class="stat-sub">${sub}</p></section>
      <section class="card" aria-labelledby="stat-base-l"><p class="stat-label" id="stat-base-l">${t("tracker.stat.baseline", { month: formatMonth(selected) })}</p><p class="stat-value">${eur(tot.base)}</p><p class="stat-sub">${t(tot.fixedTotal > EPS ? "tracker.stat.baselineSubFixed" : "tracker.stat.baselineSub")}</p></section>
      <section class="card free-card ${cls}" aria-labelledby="stat-left-l"><p class="stat-label" id="stat-left-l">${label}</p><p class="stat-value">${eur(Math.abs(tot.diff))}</p><p class="stat-sub" role="status">${note}</p></section>`;
  }

  function categoryOptions(selectedId) {
    return state().categories.map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${esc(catName(c))}</option>`).join("");
  }
  const iconOf = (id) => { const c = state().categories.find((x) => x.id === id); return icon(c ? c.icon : "circle-ellipsis"); };

  function rowHtml(it, n) {
    const min = `${selected}-01`, max = lastDay(selected);
    const label = it.name || t("tracker.list.untitled", { n });
    return `
      <tr data-id="${it.id}">
        <td class="ledger-icon"><span class="cat-icon" data-icon>${iconOf(it.catId)}</span></td>
        <td data-label="${t("tracker.list.date")}">${dayField({ className: "js-date", label: t("tracker.list.dateOf", { name: label }), value: it.date || "", min, max })}</td>
        <td data-label="${t("tracker.list.name")}"><input type="text" class="js-name" maxlength="80" value="${esc(it.name)}" autocomplete="off" aria-label="${esc(t("tracker.list.nameOf", { n }))}"></td>
        <td data-label="${t("tracker.list.category")}"><select class="js-cat" aria-label="${esc(t("tracker.list.categoryOf", { name: label }))}">${categoryOptions(it.catId)}</select></td>
        <td class="num" data-label="${t("tracker.list.amount")}">${moneyInput({ id: `amt-${it.id}`, value: it.amount, ariaLabel: t("tracker.list.amountOf", { name: label }), className: "js-amount" })}</td>
        <td class="ledger-act"><button type="button" class="btn btn-quiet btn-small btn-danger btn-icon" data-action="remove" data-id="${it.id}" aria-label="${esc(t("tracker.list.removeOf", { name: label }))}">${icon("trash-2", { size: 16 })}</button></td>
      </tr>`;
  }

  function addRowHtml() {
    const min = `${selected}-01`, max = lastDay(selected);
    return `
      <tr class="add-row">
        <td class="ledger-icon"><span class="cat-icon" id="add-icon">${iconOf(lastCat)}</span></td>
        <td data-label="${t("tracker.list.date")}">${dayField({ id: "add-date", label: `${t("tracker.list.newRow")}: ${t("tracker.list.date")}`, value: defaultDate(), min, max })}</td>
        <td data-label="${t("tracker.list.name")}"><input type="text" id="add-name" form="add-form" maxlength="80" autocomplete="off" placeholder="${esc(t("tracker.list.namePh"))}" aria-label="${t("tracker.list.newRow")}: ${t("tracker.list.name")}"></td>
        <td data-label="${t("tracker.list.category")}"><select id="add-cat" form="add-form" aria-label="${t("tracker.list.newRow")}: ${t("tracker.list.category")}">${categoryOptions(lastCat)}</select></td>
        <td class="num" data-label="${t("tracker.list.amount")}">${moneyInput({ id: "add-amount", value: "", ariaLabel: `${t("tracker.list.newRow")}: ${t("tracker.list.amount")}`, dataAttrs: 'form="add-form"' })}</td>
        <td class="ledger-act"><button type="submit" form="add-form" class="btn btn-primary btn-small">${icon("plus", { size: 16 })}${t("tracker.list.add")}</button></td>
      </tr>`;
  }

  function listHtml(tot) {
    const items = itemsFor(state().months, selected);
    return `
      <h2 id="list-h">${t("tracker.list.title")}</h2>
      <p class="muted">${t("tracker.list.intro")}</p>
      <form id="add-form" novalidate></form>
      <p class="error" id="add-error" role="alert"></p>
      <div class="table-wrap">
        <table class="expenses ledger">
          <caption class="visually-hidden">${t("tracker.list.title")} · ${formatMonth(selected)}</caption>
          <thead><tr>
            <th scope="col"><span class="visually-hidden">${t("tracker.list.icon")}</span></th>
            <th scope="col">${t("tracker.list.date")}</th>
            <th scope="col">${t("tracker.list.name")}</th>
            <th scope="col">${t("tracker.list.category")}</th>
            <th scope="col" class="num">${t("tracker.list.amount")}</th>
            <th scope="col"><span class="visually-hidden">${t("tracker.list.remove")}</span></th>
          </tr></thead>
          <tbody>${addRowHtml()}${items.map((it, i) => rowHtml(it, i + 1)).join("")}</tbody>
          <tfoot><tr><th scope="row" colspan="4">${t("tracker.list.total")}</th><td class="num" id="list-total">${eur(tot.purchases)}</td><td></td></tr></tfoot>
        </table>
      </div>
      ${items.length ? "" : `<p class="small muted" id="list-empty">${t("tracker.list.empty")}</p>`}`;
  }

  function compareHtml(tot) {
    const rows = tot.rows.filter((r) => r.base > EPS || r.spent > EPS).map((r) => {
      const rep = replacement(r.c.id);
      const pct = r.base > EPS ? Math.round((r.spent / r.base) * 100) : null;
      const used = pct === null ? `<span class="muted small">${t("tracker.compare.noBaseline")}</span>`
        : `<span class="used"><progress max="100" value="${Math.min(100, pct)}" aria-label="${esc(t("tracker.compare.usedOf", { pct, name: catName(r.c) }))}"></progress><span class="num">${pct}%</span></span>`;
      return `
        <tr>
          <th scope="row"><span class="cat"><span class="cat-icon">${icon(r.c.icon)}</span>${esc(catName(r.c))}</span>${rep ? `<span class="cat-note">${replacedText(rep)}</span>` : ""}</th>
          <td class="num" data-label="${t("tracker.compare.baseline")}">${eur(r.base)}</td>
          <td class="num" data-label="${t("tracker.compare.spent")}">${eur(r.spent)}</td>
          <td class="num" data-label="${t("tracker.compare.difference")}">${diffHtml(r.diff)}</td>
          <td class="num" data-label="${t("tracker.compare.used")}">${used}</td>
        </tr>`;
    }).join("");
    const fixedRows = tot.fixed.map((f) => `
        <tr class="fixed">
          <th scope="row"><span class="cat"><span class="cat-icon">${icon(f.icon)}</span>${esc(f.name)}</span><span class="cat-note">${f.note}</span></th>
          <td class="num" data-label="${t("tracker.compare.baseline")}">${eur(f.amount)}</td>
          <td class="num" data-label="${t("tracker.compare.spent")}">${eur(f.amount)}</td>
          <td class="num" data-label="${t("tracker.compare.difference")}">${diffHtml(0)}</td>
          <td class="num" data-label="${t("tracker.compare.used")}"><span class="muted small">${t("tracker.compare.fixedUsed")}</span></td>
        </tr>`).join("");
    return `
      <h2 id="compare-h">${t("tracker.compare.title")}</h2>
      <p class="muted">${t("tracker.compare.intro", { month: formatMonth(selected) })}</p>
      <div class="table-wrap">
        <table class="expenses compare">
          <caption class="visually-hidden">${t("tracker.compare.title")} · ${formatMonth(selected)}</caption>
          <thead><tr>
            <th scope="col">${t("tracker.compare.category")}</th>
            <th scope="col" class="num">${t("tracker.compare.baseline")}</th>
            <th scope="col" class="num">${t("tracker.compare.spent")}</th>
            <th scope="col" class="num">${t("tracker.compare.difference")}</th>
            <th scope="col" class="num">${t("tracker.compare.used")}</th>
          </tr></thead>
          <tbody>${rows}${fixedRows}</tbody>
          <tfoot><tr>
            <th scope="row">${t("tracker.compare.total")}</th>
            <td class="num">${eur(tot.base)}</td><td class="num">${eur(tot.spent)}</td><td class="num">${diffHtml(tot.diff)}</td><td></td>
          </tr></tfoot>
        </table>
      </div>
      <p class="small muted">${t("tracker.compare.hidden")} <a href="#/budget">${t("tracker.compare.change")}</a></p>`;
  }

  function mainHtml() {
    const st = state();
    const start = st.settings.startMonth, end = endMonth(st);
    const tot = totals();
    return `
      <div class="page-head"><h1>${t("tracker.title")}</h1><p>${t("tracker.intro")}</p></div>
      <div class="stack-lg">
        <section class="card" aria-labelledby="month-h">
          <h2 id="month-h">${formatMonth(selected)}</h2>
          <div class="month-picker">
            <button type="button" class="btn btn-icon" data-action="prev" aria-label="${t("budget.month.prev")}" ${selected <= start ? "disabled" : ""}>${icon("chevron-left")}</button>
            ${monthField({ id: "month-input", label: t("budget.month.label"), value: selected, min: start, max: end })}
            <button type="button" class="btn btn-icon" data-action="next" aria-label="${t("budget.month.next")}" ${selected >= end ? "disabled" : ""}>${icon("chevron-right")}</button>
          </div>
        </section>
        <div class="grid grid-3" id="stats">${statsHtml(tot)}</div>
        <section class="card" id="list-card" aria-labelledby="list-h">${listHtml(tot)}</section>
        <section class="card" id="compare-card" aria-labelledby="compare-h">${compareHtml(tot)}</section>
      </div>`;
  }

  /* ---------- drawing ---------- */

  function draw(focusSel) {
    const st = state();
    if (!st.settings.startMonth) {
      wrap.innerHTML = needPlanHtml();
      return;
    }
    const shared = getSelected();
    selected = clampMonth(st, shared && isMonthKey(shared) ? shared : currentMonth());
    setSelected(selected);
    computePlan();
    wrap.innerHTML = mainHtml();
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  }

  /** Updates the numbers that depend on the list, without redrawing it (so focus and typing are kept). */
  function refresh() {
    const tot = totals();
    $("#stats").innerHTML = statsHtml(tot);
    $("#list-total").textContent = eur(tot.purchases);
    $("#compare-card").innerHTML = compareHtml(tot);
    const empty = $("#list-empty");
    if (empty) empty.remove();
  }

  function setMonth(k) {
    const st = state();
    if (!isMonthKey(k) || k < st.settings.startMonth || k > endMonth(st)) { $("#month-input").value = selected; return; }
    selected = k;
    setSelected(k);
    draw("#month-input");
  }

  const itemOf = (el) => { const tr = el.closest("tr[data-id]"); return tr ? tr.dataset.id : null; };
  const edit = (id, fn) => store.update((s) => { const it = (s.months[selected]?.items || []).find((x) => x.id === id); if (it) fn(it); });

  /* ---------- events ---------- */

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.action;
    if (act === "prev") setMonth(addMonths(selected, -1));
    else if (act === "next") setMonth(addMonths(selected, 1));
    else if (act === "remove") {
      store.update((s) => { const m = s.months[selected]; if (m) m.items = m.items.filter((x) => x.id !== btn.dataset.id); });
      draw("#add-name");
    }
  });

  wrap.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id !== "add-form") return;
    const err = (msg, sel) => { $("#add-error").textContent = msg; const el = $(sel); if (msg) { el.setAttribute("aria-invalid", "true"); el.focus(); } };
    $("#add-amount").removeAttribute("aria-invalid");
    $("#add-date").removeAttribute("aria-invalid");
    const amount = parseAmount($("#add-amount").value);
    if (amount === null || Number.isNaN(amount) || !(amount > 0)) return err(t("tracker.list.amountError"), "#add-amount");
    const date = $("#add-date").value;
    if (date && !(date >= `${selected}-01` && date <= lastDay(selected))) return err(t("tracker.list.dateError", { month: formatMonth(selected) }), "#add-date");
    const catId = $("#add-cat").value;
    const name = $("#add-name").value.trim().slice(0, 80);
    lastCat = catId;
    lastDate = date || null;
    store.update((s) => {
      const m = (s.months[selected] ||= { planned: {}, items: [] });
      m.items.push({ id: store.newId(), date: date || null, name, catId, amount });
    });
    draw("#add-name");
  });

  wrap.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.classList.contains("js-amount")) return;
    const id = itemOf(el);
    const v = parseAmount(el.value);
    if (!id || v === null || Number.isNaN(v) || !(v > 0)) { el.setAttribute("aria-invalid", "true"); return; }
    el.removeAttribute("aria-invalid");
    edit(id, (it) => { it.amount = v; });
    refresh();
  });

  wrap.addEventListener("change", (e) => {
    const el = e.target;
    const cls = el.classList;
    if (el.id === "month-input") return setMonth(el.value);
    if (el.id === "add-cat") { lastCat = el.value; $("#add-icon").innerHTML = iconOf(el.value); return; }
    const id = itemOf(el);
    if (!id) return;
    const item = (state().months[selected]?.items || []).find((x) => x.id === id);
    if (!item) return;
    if (cls.contains("js-name")) edit(id, (it) => { it.name = el.value.trim().slice(0, 80); });
    else if (cls.contains("js-date")) {
      const ok = el.value === "" || (el.value >= `${selected}-01` && el.value <= lastDay(selected));
      if (!ok) { el.value = item.date || ""; return; }
      edit(id, (it) => { it.date = el.value || null; });
    } else if (cls.contains("js-cat")) {
      edit(id, (it) => { it.catId = el.value; });
      el.closest("tr").querySelector("[data-icon]").innerHTML = iconOf(el.value);
      refresh();
    } else if (cls.contains("js-amount")) {
      const v = parseAmount(el.value);
      if (v === null || Number.isNaN(v) || !(v > 0)) { el.value = item.amount; el.removeAttribute("aria-invalid"); }
    }
  });

  draw();
}
