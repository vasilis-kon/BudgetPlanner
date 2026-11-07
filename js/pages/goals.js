// Page 2: Goals. Add any number of goals; each is checked against free money, shows how it moves the
// deposit date, and only reaches the Monthly Budget once the user approves it.
import { t, formatMoney as eur, formatMonth } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { esc, parseAmount } from "../components/dom.js";
import { moneyInput } from "../components/money-input.js";
import { monthField } from "../components/month-picker.js";
import { currentMonth, duration } from "../components/format.js";
import * as store from "../store.js";
import { addMonths, isMonthKey, monthsBetween } from "../calc/budget.js";
import { checkGoal, budgetFreeFn, approvedGoals, goalContribution, goalLinesFor, paybackMonth } from "../calc/goals.js";
import { inputFromState, prepare, project, newShortfalls } from "../calc/projection.js";

const NUMERIC = new Set(["amount", "monthly", "ongoing", "paybackAmount"]);
const OPTIONAL = new Set(["ongoing", "paybackAmount"]); // empty means 0

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  const $ = (sel) => wrap.querySelector(sel);
  const st = () => store.getState();

  /* ---------- what every goal is checked against ---------- */

  function context() {
    const s = st();
    const inp = inputFromState(s, currentMonth());
    return {
      s,
      today: inp.today,
      inp,
      prep: prepare(inp),
      budget: { salarySteps: s.salary, categoryIds: s.categories.map((c) => c.id), months: s.months, bonusSharePct: s.settings.bonusSharePct },
      approved: approvedGoals(s.goals),
    };
  }

  /** Fit check, monthly amount and effect on the deposit date for one goal's fields. */
  function analyse(c, g, f) {
    const d = { id: g.id, ...f };
    const free = budgetFreeFn(c.budget, c.approved, g.id);
    const check = checkGoal(d, free);
    const out = { d, check, houseSet: false, delay: null, blocked: false, minLeft: null, overspend: [] };
    if (!check.valid) return out;
    let minLeft = Infinity;
    for (let i = 0; i < check.plan.n; i++) {
      const key = addMonths(d.start, i);
      minLeft = Math.min(minLeft, free(key) - goalContribution(check.plan, d, key));
    }
    out.minLeft = minLeft;
    const others = c.approved.filter((x) => x.id !== g.id);
    const without = project({ ...c.inp, goals: others }, c.prep);
    const withIt = project({ ...c.inp, goals: [...others, d] }, c.prep);
    out.houseSet = without.fin.ok;
    // Overspending this goal would add later on (for example once the installment starts), which the plan does not allow.
    out.overspend = newShortfalls(without.shortByMonth, withIt.shortByMonth);
    if (without.fin.ok) {
      out.delay = without.depositReady && withIt.depositReady ? monthsBetween(without.depositReady, withIt.depositReady) : undefined;
      if (f.paybackAmount > 0 && withIt.purchase && paybackMonth(check.plan) >= withIt.purchase) out.blocked = true;
    }
    return out;
  }

  function delayText(name, a) {
    if (!a.check.valid) return "";
    if (!a.houseSet) return `<p class="small muted">${t("goals.delay.noHouse")} <a href="#/house">${t("goals.delay.noHouseLink")}</a></p>`;
    if (a.delay === undefined) return `<p class="small muted">${t("goals.delay.unknown")}</p>`;
    const n = Math.abs(a.delay);
    const label = esc(name || t("goals.unnamed"));
    const text = a.delay === 0 ? t("goals.delay.none", { name: label })
      : a.delay > 0 ? t("goals.delay.later", { name: label, time: duration(n) })
      : t("goals.delay.earlier", { name: label, time: duration(n) });
    return `<p class="delay">${icon("hourglass", { size: 18 })}<span>${text}</span></p>`;
  }

  /* ---------- HTML ---------- */

  function resultHtml(c, g, f) {
    const a = analyse(c, g, f);
    const plan = a.check.plan;
    const startMin = c.s.settings.startMonth;
    let body;
    if (f.start && f.start < startMin) {
      body = `<div class="note note-warn">${icon("triangle-alert", { size: 18 })}<p>${t("goals.check.beforePlan", { month: formatMonth(startMin) })}</p></div>`;
    } else if (f.mode === "auto" && f.start && f.target && monthsBetween(f.start, f.target) < 1) {
      body = `<div class="note note-warn">${icon("triangle-alert", { size: 18 })}<p>${t("goals.check.targetAfterStart")}</p></div>`;
    } else if (!a.check.valid) {
      body = `<p class="muted">${t(f.mode === "custom" ? "goals.check.incompleteCustom" : "goals.check.incomplete")}</p>`;
    } else {
      const head = f.mode === "custom"
        ? t("goals.check.customReach", { monthly: eur(plan.monthly), month: formatMonth(plan.reach), time: duration(plan.n) })
        : t("goals.check.allocation", { monthly: eur(plan.monthly), time: duration(plan.n), from: formatMonth(f.start), to: formatMonth(f.target) });
      let verdict;
      if (a.check.ok) {
        verdict = `<div class="note note-ok">${icon("circle-check", { size: 18 })}<p><strong>${t("goals.check.fits")}</strong> ${t("goals.check.fitsDetail", { left: eur(Math.max(0, a.minLeft)) })}</p></div>`;
      } else {
        const first = a.check.short[0];
        const worst = a.check.short.reduce((m, x) => (x.by > m.by ? x : m), a.check.short[0]);
        const sugg = [];
        if (a.check.suggestLater) sugg.push(`<button type="button" class="btn btn-small" data-action="use-later" data-id="${g.id}">${t("goals.check.useLater", { month: formatMonth(a.check.suggestLater.target), monthly: eur(a.check.suggestLater.monthly) })}</button>`);
        if (a.check.suggestAmount && f.mode === "auto") sugg.push(`<button type="button" class="btn btn-small" data-action="use-amount" data-id="${g.id}">${t("goals.check.useAmount", { amount: eur(a.check.suggestAmount.amount) })}</button>`);
        verdict = `<div class="note note-warn">${icon("triangle-alert", { size: 18 })}<p><strong>${t("goals.check.noFit")}</strong> ${t("goals.check.noFitDetail", { count: a.check.short.length, first: formatMonth(first.key), by: eur(worst.by), worstMonth: formatMonth(worst.key) })}</p></div>
          <p class="small">${t(sugg.length ? "goals.check.suggest" : "goals.check.noSuggest")}</p>
          ${sugg.length ? `<div class="row">${sugg.join("")}</div>` : ""}`;
      }
      const over = a.overspend.length
        ? (() => { const p = a.overspend.reduce((m, x) => (x.worst > m.worst ? x : m), a.overspend[0]); return `<div class="note note-danger">${icon("triangle-alert", { size: 18 })}<p><strong>${t("goals.check.overspendTitle")}</strong> ${t("goals.check.overspend", { by: eur(Math.ceil(p.worst)), range: p.from === p.to ? formatMonth(p.from) : t("house.range", { from: formatMonth(p.from), to: formatMonth(p.to) }) })}</p></div>`; })()
        : "";
      body = `<p class="stat-sub" style="margin-top:0"><strong>${head}</strong></p>${verdict}${over}${delayText(f.name, a)}`;
    }
    const nameOk = f.name.trim() !== "";
    const canApprove = a.check.valid && a.check.ok && nameOk && !a.overspend.length && !(f.start && f.start < startMin);
    return `
      <div class="goal-result" id="result-${g.id}" role="status" aria-live="polite">
        ${body}
        ${a.check.valid && a.check.ok && !nameOk ? `<p class="small muted">${t("goals.check.needName")}</p>` : ""}
      </div>
      <div class="row" style="margin-top:var(--space-3)">
        <button type="button" class="btn btn-primary" data-action="approve" data-id="${g.id}" ${canApprove ? "" : "disabled"}>${icon("check", { size: 18 })}${t(g.approved ? "goals.approveChanges" : "goals.approve")}</button>
        ${g.approved ? `<button type="button" class="btn" data-action="cancel-edit" data-id="${g.id}">${t("goals.cancelEdit")}</button>` : ""}
        <button type="button" class="btn btn-quiet btn-danger" data-action="remove" data-id="${g.id}">${icon("trash-2", { size: 16 })}${t("goals.remove")}</button>
      </div>`;
  }

  function formHtml(c, g) {
    const f = g.draft;
    const id = (n) => `g-${g.id}-${n}`;
    const da = (field) => `data-goal="${g.id}" data-field="${field}"`;
    const startMin = c.s.settings.startMonth;
    const a = analyse(c, g, f);
    const pbMonth = a.check.valid ? paybackMonth(a.check.plan) : null;
    const choice = (name, value, checked, labelText, extra = "", disabled = false) =>
      `<label class="choice"><input type="radio" name="${name}-${g.id}" value="${value}" ${da(name === "pb" ? "paybackTo" : name)} ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${labelText}</span></label>${extra}`;
    return `
      <article class="card goal-card" aria-labelledby="${id("h")}">
        <div class="card-head">${icon("target")}<h2 id="${id("h")}">${f.name.trim() ? esc(f.name) : t("goals.newGoal")}</h2>${g.approved ? `<span class="badge">${t("goals.editing")}</span>` : `<span class="badge badge-soon">${t("goals.draft")}</span>`}</div>
        <div class="grid grid-2">
          <div class="stack">
            <div class="field">
              <label for="${id("name")}">${t("goals.f.name")}</label>
              <input type="text" id="${id("name")}" maxlength="60" autocomplete="off" value="${esc(f.name)}" placeholder="${t("goals.f.namePh")}" ${da("name")}>
            </div>
            <div class="form-row">
              ${monthField({ id: id("start"), label: t("goals.f.start"), value: f.start, min: startMin, dataAttrs: da("start") })}
              ${f.mode === "auto" ? monthField({ id: id("target"), label: t("goals.f.target"), value: f.target, min: f.start || startMin, dataAttrs: da("target") }) : ""}
            </div>
            <div class="field">${moneyInput({ id: id("amount"), label: t("goals.f.amount"), value: f.amount, placeholder: "5000", dataAttrs: `${da("amount")} aria-describedby="${id("amount")}-h"` })}<span class="hint" id="${id("amount")}-h">${t("goals.f.amountHint")}</span></div>
            <fieldset class="field">
              <legend>${t("goals.f.howLegend")}</legend>
              <div class="choices">
                ${choice("mode", "auto", f.mode === "auto", t("goals.f.modeAuto"))}
                ${choice("mode", "custom", f.mode === "custom", t("goals.f.modeCustom"))}
              </div>
            </fieldset>
            ${f.mode === "custom" ? `<div class="field">${moneyInput({ id: id("monthly"), label: t("goals.f.monthly"), value: f.monthly, placeholder: "200", dataAttrs: da("monthly") })}</div>` : ""}
          </div>
          <div class="stack">
            <div class="field">${moneyInput({ id: id("ongoing"), label: t("goals.f.ongoing"), value: f.ongoing || "", placeholder: "0", dataAttrs: `${da("ongoing")} aria-describedby="${id("ongoing")}-h"` })}<span class="hint" id="${id("ongoing")}-h">${t("goals.f.ongoingHint")}</span></div>
            <div class="field">
              <label for="${id("replaces")}">${t("goals.f.replaces")}</label>
              <select id="${id("replaces")}" ${da("replaces")} aria-describedby="${id("replaces")}-h">
                <option value="">${t("goals.f.replacesNone")}</option>
                ${c.s.categories.map((x) => `<option value="${x.id}" ${f.replaces === x.id ? "selected" : ""}>${esc(x.builtin ? t("cat." + x.id) : x.name)}</option>`).join("")}
              </select>
              <span class="hint" id="${id("replaces")}-h">${t("goals.f.replacesHint")}</span>
            </div>
            <div class="field">${moneyInput({ id: id("paybackAmount"), label: t("goals.f.payback"), value: f.paybackAmount || "", placeholder: "0", dataAttrs: `${da("paybackAmount")} aria-describedby="${id("paybackAmount")}-h"` })}<span class="hint" id="${id("paybackAmount")}-h">${t("goals.f.paybackHint", { when: pbMonth ? formatMonth(pbMonth) : t("goals.f.paybackWhenUnknown") })}</span></div>
            <fieldset class="field">
              <legend>${t("goals.f.paybackTo")}</legend>
              <div class="choices">
                ${choice("pb", "deposit", f.paybackTo === "deposit", t("goals.f.toDeposit"), a.blocked ? `<p class="hint" style="margin:0 0 var(--space-2) 2rem">${t("goals.f.depositBlocked")}</p>` : "")}
                ${choice("pb", "loan", f.paybackTo === "loan", t("goals.f.toLoan"))}
                ${choice("pb", "invest", f.paybackTo === "invest", t("goals.f.toInvest"))}
              </div>
            </fieldset>
          </div>
        </div>
        <div class="stack" style="margin-top:var(--space-4)">
          <h3>${t("goals.checkTitle")}</h3>
          <div id="result-wrap-${g.id}">${resultHtml(c, g, f)}</div>
        </div>
      </article>`;
  }

  function summaryHtml(c, g) {
    const f = g.data;
    const a = analyse(c, g, f);
    const plan = a.check.plan;
    const facts = [
      [t("goals.s.runs"), `${formatMonth(f.start)} → ${formatMonth(plan.reach)}`],
      [t("goals.s.amount"), eur(f.amount)],
      [t("goals.s.monthly"), `${eur(plan.monthly)} · ${duration(plan.n)}`],
    ];
    if (f.replaces) {
      const cat = c.s.categories.find((x) => x.id === f.replaces);
      if (cat) facts.push([t("goals.s.replaces"), t("goals.s.replacesText", { cat: esc(cat.builtin ? t("cat." + cat.id) : cat.name), month: formatMonth(plan.reach) })]);
    }
    if (f.ongoing > 0) facts.push([t("goals.s.ongoing"), t("goals.s.ongoingText", { amount: eur(f.ongoing), month: formatMonth(plan.reach) })]);
    if (f.paybackAmount > 0) facts.push([t("goals.s.payback"), t("goals.s.paybackText", { amount: eur(f.paybackAmount), month: formatMonth(paybackMonth(plan)), to: t("goals.f.to_" + f.paybackTo) })]);
    const pbNote = a.blocked && f.paybackTo === "deposit" ? `<p class="small muted">${t("goals.s.paybackFallback")}</p>` : "";
    return `
      <article class="card goal-card" aria-labelledby="g-${g.id}-h">
        <div class="card-head">${icon("target")}<h2 id="g-${g.id}-h">${esc(f.name)}</h2><span class="badge">${t("goals.approved")}</span></div>
        <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
        ${delayText(f.name, a)}${pbNote}
        <div class="row">
          <button type="button" class="btn" data-action="edit" data-id="${g.id}">${icon("pencil", { size: 16 })}${t("goals.edit")}</button>
          <button type="button" class="btn btn-quiet btn-danger" data-action="remove" data-id="${g.id}">${icon("trash-2", { size: 16 })}${t("goals.remove")}</button>
        </div>
      </article>`;
  }

  function totalsHtml(c) {
    if (!c.approved.length) return "";
    const total = c.approved.length;
    // The busiest month: when the goals together take the most out of free money.
    let peak = 0, peakMonth = c.today;
    for (let i = 0; i < 360; i++) {
      const key = addMonths(c.today, i);
      const sum = goalLinesFor(c.approved, key).total;
      if (sum > peak + 0.005) { peak = sum; peakMonth = key; }
    }
    const none = project({ ...c.inp, goals: [] }, c.prep);
    const all = project(c.inp, c.prep);
    let delay = "";
    if (none.fin.ok) {
      if (none.depositReady && all.depositReady) {
        const d = monthsBetween(none.depositReady, all.depositReady);
        delay = `<p class="delay">${icon("hourglass", { size: 18 })}<span>${d === 0 ? t("goals.total.noMove") : d > 0 ? t("goals.total.later", { time: duration(d) }) : t("goals.total.earlier", { time: duration(-d) })}</span></p>`;
      } else delay = `<p class="small muted">${t("goals.delay.unknown")}</p>`;
    } else delay = `<p class="small muted">${t("goals.delay.noHouse")} <a href="#/house">${t("goals.delay.noHouseLink")}</a></p>`;
    return `
      <section class="card" aria-labelledby="tot-h">
        <h2 id="tot-h">${t("goals.total.title")}</h2>
        <p>${t("goals.total.text", { count: total, amount: eur(peak), month: formatMonth(peakMonth) })}</p>
        ${delay}
        <p class="small muted">${t("goals.total.note")}</p>
      </section>`;
  }

  function pageHtml(c) {
    if (!c.s.settings.startMonth) {
      return `
        <div class="page-head"><h1>${t("goals.title")}</h1><p>${t("goals.intro")}</p></div>
        <section class="card soon-card"><p>${t("goals.needBudget")}</p><a class="btn btn-primary" href="#/budget">${t("goals.needBudgetCta")}${icon("chevron-right")}</a></section>`;
    }
    const cards = c.s.goals.map((g) => (g.draft ? formHtml(c, g) : summaryHtml(c, g))).join("");
    return `
      <div class="page-head"><h1>${t("goals.title")}</h1><p>${t("goals.intro")}</p></div>
      <div class="stack-lg">
        <div><button type="button" class="btn btn-primary" data-action="add">${icon("plus", { size: 18 })}${t("goals.add")}</button></div>
        ${c.s.goals.length ? cards : `<section class="card"><p class="muted">${t("goals.empty")}</p></section>`}
        ${totalsHtml(c)}
      </div>`;
  }

  /* ---------- drawing ---------- */

  function draw(focusSel) {
    wrap.innerHTML = pageHtml(context());
    if (focusSel) { const el = $(focusSel); if (el) el.focus(); }
  }

  /** Only the check panel changes while typing, so the field keeps focus. */
  function refreshResult(id) {
    const g = st().goals.find((x) => x.id === id);
    const box = $(`#result-wrap-${id}`);
    if (g && g.draft && box) box.innerHTML = resultHtml(context(), g, g.draft);
  }

  /* ---------- events ---------- */

  const goalOf = (id) => st().goals.find((x) => x.id === id);

  function setField(id, field, raw) {
    store.update((s) => {
      const d = s.goals.find((x) => x.id === id).draft;
      if (field === "name") d.name = raw.slice(0, 60);
      else if (field === "start" || field === "target") d[field] = isMonthKey(raw) ? raw : null;
      else if (NUMERIC.has(field)) {
        const v = parseAmount(raw);
        d[field] = v === null || Number.isNaN(v) ? (OPTIONAL.has(field) ? 0 : null) : v;
      } else if (field === "mode") d.mode = raw === "custom" ? "custom" : "auto";
      else if (field === "replaces") d.replaces = raw || null;
      else if (field === "paybackTo") d.paybackTo = raw;
    });
  }

  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.action, id = btn.dataset.id;
    const s = st();
    if (act === "add") {
      const newId = store.newId();
      const start = currentMonth() < s.settings.startMonth ? s.settings.startMonth : currentMonth();
      store.update((x) => x.goals.push({ id: newId, approved: false, data: null, draft: store.goalFields({ start, mode: "auto" }) }));
      draw(`#g-${newId}-name`);
    } else if (act === "edit") {
      store.update((x) => { const g = x.goals.find((y) => y.id === id); g.draft = store.goalFields(g.data); });
      draw(`#g-${id}-name`);
    } else if (act === "cancel-edit") {
      store.update((x) => { x.goals.find((y) => y.id === id).draft = null; });
      draw(`[data-action="edit"][data-id="${id}"]`);
    } else if (act === "remove") {
      const g = goalOf(id);
      const name = (g.draft || g.data).name.trim() || t("goals.unnamed");
      if (!window.confirm(t("goals.removeConfirm", { name }))) return;
      store.update((x) => { x.goals = x.goals.filter((y) => y.id !== id); });
      draw('[data-action="add"]');
    } else if (act === "approve") {
      const g = goalOf(id);
      const c = context();
      const a = analyse(c, g, g.draft);
      if (!a.check.valid || !a.check.ok || a.overspend.length || !g.draft.name.trim()) return;
      store.update((x) => { const y = x.goals.find((z) => z.id === id); y.data = store.goalFields(y.draft); y.approved = true; y.draft = null; });
      draw(`[data-action="edit"][data-id="${id}"]`);
    } else if (act === "use-later") {
      const g = goalOf(id);
      const a = analyse(context(), g, g.draft);
      if (!a.check.suggestLater) return;
      const sl = a.check.suggestLater;
      store.update((x) => {
        const d = x.goals.find((y) => y.id === id).draft;
        if (d.mode === "custom") d.monthly = Math.ceil(sl.monthly); else d.target = sl.target;
      });
      draw(`#g-${id}-name`);
    } else if (act === "use-amount") {
      const g = goalOf(id);
      const a = analyse(context(), g, g.draft);
      if (!a.check.suggestAmount) return;
      store.update((x) => { x.goals.find((y) => y.id === id).draft.amount = a.check.suggestAmount.amount; });
      draw(`#g-${id}-amount`);
    }
  });

  wrap.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.goal || el.type === "radio") return;
    const field = el.dataset.field;
    if (NUMERIC.has(field)) {
      const v = parseAmount(el.value);
      if (Number.isNaN(v)) { el.setAttribute("aria-invalid", "true"); return; }
      el.removeAttribute("aria-invalid");
    }
    setField(el.dataset.goal, field, el.value);
    if (field === "name") { const h = $(`#g-${el.dataset.goal}-h`); if (h) h.textContent = el.value.trim() || t("goals.newGoal"); }
    refreshResult(el.dataset.goal);
  });

  wrap.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.dataset.goal) return;
    const id = el.dataset.goal;
    if (el.type === "radio") {
      setField(id, el.dataset.field, el.value);
      if (el.dataset.field === "mode") draw(`#g-${id}-${el.value === "custom" ? "monthly" : "target"}`);
      else refreshResult(id);
    } else if (el.tagName === "BP-DATE") {
      setField(id, el.dataset.field, el.value);
      draw(`#${el.id}`);
    } else if (el.tagName === "SELECT") {
      setField(id, el.dataset.field, el.value);
      refreshResult(id);
    }
  });

  draw();
}
