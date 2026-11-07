// Page 4: Overview. Where the user's money sits at the end of each year, from the first salary to debt-free.
import { noticeHtml } from "../components/notice.js";
import { t, formatWhole as eur, formatCompact, formatMonth } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { esc } from "../components/dom.js";
import { currentMonth, duration } from "../components/format.js";
import { mountChart, chartFigure, baseOptions } from "../components/chart.js";
import { overspendHtml } from "../components/overspend.js";
import * as store from "../store.js";
import { monthsBetween } from "../calc/budget.js";
import { inputFromState, prepare, project, projectSavings, loanMonths, RETIREMENT_AGE } from "../calc/projection.js";

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  let unmount = [];

  const headFor = (savingsOnly) => `<div class="page-head"><h1>${t("overview.title")}</h1><p>${t(savingsOnly ? "overview.sv.intro" : "overview.intro")}</p>${noticeHtml()}</div>`;
  const head = headFor(false);
  const prompt = (text, href, cta) => `${head}<section class="card soon-card"><p>${text}</p><a class="btn btn-primary" href="${href}">${cta}${icon("chevron-right")}</a></section>`;

  /** The Financial Overview for someone who skips the House Planner: savings and goals from the budget alone. */
  function drawSavings(s, inp, prep, today) {
    const rs = projectSavings(inp, prep);
    const units = s.house.units;
    const infl = s.house.inflationPct;
    const pick = (y) => (units === "today" ? y.real : y.nom);
    const btn = (value, label) => `<button type="button" class="btn ${units === value ? "btn-primary" : ""}" data-units="${value}" aria-pressed="${units === value}">${label}</button>`;
    const unitLabel = units === "today" ? t("house.c.unitsTodayShort") : t("house.c.unitsFutureShort");
    const nowRow = rs.rows.find((x) => x.key >= today) || rs.rows[rs.rows.length - 1];
    const last = rs.years[rs.years.length - 1];
    const done = rs.reached.filter((g) => g.key <= today).length;
    const next = rs.reached.find((g) => g.key > today);
    const goalsSub = !rs.reached.length ? t("overview.sv.sGoalsNone") : next ? t("overview.sv.sGoalsNext", { name: esc(next.name), month: formatMonth(next.key) }) : t("overview.sv.sGoalsAll");
    const range = rs.retireKey ? t("overview.sv.rangeAge", { retire: RETIREMENT_AGE, month: formatMonth(rs.endKey) }) : t("overview.sv.rangeAhead", { years: Math.round(monthsBetween(today, rs.endKey) / 12) });
    const stats = `<dl class="stat-grid">
      <div class="stat"><dt>${t("overview.sv.sFree")}</dt><dd>${eur(nowRow ? nowRow.leftover : 0)}</dd><dd class="sub">${t("overview.sv.sFreeSub")}</dd></div>
      <div class="stat"><dt>${t("overview.sv.sInvest")}</dt><dd>${rs.investPct > 0 ? `${Math.round(rs.investPct * 100) / 100}%` : t("overview.sv.sInvestNone")}</dd><dd class="sub">${rs.investPct > 0 ? t("overview.sv.sInvestSub", { amount: eur(Math.max(0, nowRow ? nowRow.leftover : 0) * rs.investPct / 100) }) : `<a href="#/budget">${t("overview.sv.sInvestLink")}</a>`}</dd></div>
      <div class="stat"><dt>${t("overview.sv.sSaved", { month: formatMonth(rs.endKey) })}</dt><dd>${eur(pick(last).netWorth)}</dd><dd class="sub">${t("overview.sv.sSavedSub")}</dd></div>
      <div class="stat"><dt>${t("overview.sv.sGoals")}</dt><dd>${t("overview.sv.sGoalsVal", { done, total: rs.reached.length })}</dd><dd class="sub">${goalsSub}</dd></div>
    </dl>`;
    const rows = rs.years.map((y) => {
      const v = pick(y);
      return `<tr><th scope="row">${y.year}</th><td class="num">${eur(v.savings)}</td><td class="num">${eur(v.investments)}</td><td class="num">${eur(v.goalFunds)}</td><td class="num"><strong>${eur(v.netWorth)}</strong></td></tr>`;
    }).join("");
    const tableHtml = `<table class="data-table">
      <thead><tr><th scope="col">${t("overview.colYear")}</th><th scope="col" class="num">${t("overview.sv.colSavings")}</th><th scope="col" class="num">${t("overview.sv.colInvest")}</th><th scope="col" class="num">${t("overview.sv.colGoals")}</th><th scope="col" class="num">${t("overview.sv.colTotal")}</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    wrap.innerHTML = `
      ${headFor(true)}
      <div class="stack-lg">
        <section class="card" aria-labelledby="ov-units">
          <h2 id="ov-units">${t("house.units.title")}</h2>
          <div class="row" role="group" aria-label="${t("house.units.show")}">${btn("future", t("house.units.future"))}${btn("today", t("house.units.today"))}</div>
          <p class="small muted">${units === "today" ? t("house.c.unitsToday", { infl }) : t("house.c.unitsFuture")} <a href="#/house">${t("overview.changeInflation")}</a></p>
        </section>
        <section class="card" aria-labelledby="sv-now">
          <h2 id="sv-now">${t("overview.sv.title")}</h2>
          ${stats}
          <p class="small muted">${range}</p>
        </section>
        <section class="card" aria-labelledby="ov-chart">
          <h2 id="ov-chart">${t("overview.sv.chartTitle")}</h2>
          ${chartFigure({ id: "ch-ov", title: t("overview.sv.chartCaption"), summary: t("overview.sv.chartSum", { unit: unitLabel }), tableLabel: "", tableHtml: null, height: 340 })}
        </section>
        <section class="card" aria-labelledby="ov-table">
          <h2 id="ov-table">${t("overview.tableTitle")}</h2>
          <p class="small muted">${t("overview.sv.tableNote", { unit: unitLabel })}</p>
          <div class="table-scroll" role="region" tabindex="0" aria-label="${t("overview.tableTitle")}">${tableHtml}</div>
        </section>
        <div class="note">
          ${icon("house", { size: 18 })}
          <p><strong>${t("overview.sv.houseTitle")}</strong> ${t("overview.sv.houseText")} <a href="#/house">${t("overview.needHouseCta")}</a></p>
        </div>
      </div>`;
    const money = (v) => formatCompact(v);
    unmount.push(mountChart(wrap.querySelector("#ch-ov"), (th) => ({
      type: "bar",
      data: {
        labels: rs.years.map((y) => String(y.year)),
        datasets: [
          { type: "bar", label: t("overview.sv.colSavings"), data: rs.years.map((y) => Math.round(pick(y).savings)), backgroundColor: th.bank, stack: "money", order: 2 },
          { type: "bar", label: t("overview.sv.colInvest"), data: rs.years.map((y) => Math.round(pick(y).investments)), backgroundColor: th.invest, stack: "money", order: 2 },
          { type: "bar", label: t("overview.sv.colGoals"), data: rs.years.map((y) => Math.round(pick(y).goalFunds)), backgroundColor: th.fund, stack: "money", order: 2 },
          { type: "line", label: t("overview.sv.colTotal"), data: rs.years.map((y) => Math.round(pick(y).netWorth)), borderColor: th.text, backgroundColor: th.text, borderWidth: 3, pointStyle: "triangle", pointRadius: 4, order: 0 },
        ],
      },
      options: baseOptions(th, money, { x: { stacked: true }, y: { stacked: true }, tip: eur }),
    })));
  }

  function draw() {
    unmount.forEach((fn) => fn());
    unmount = [];
    const s = store.getState();
    if (!s.settings.startMonth) { wrap.innerHTML = prompt(t("overview.needBudget"), "#/budget", t("overview.needBudgetCta")); return; }
    const today = currentMonth();
    const inp = inputFromState(s, today);
    const prep = prepare(inp);
    const r = project(inp, prep);
    if (r.problems.length) { // a plan that overspends is not shown: say what to cut instead
      wrap.innerHTML = headFor(!r.fin.ok) + overspendHtml({ inp, prep, r, categories: s.categories });
      return;
    }
    if (!r.fin.ok) { drawSavings(s, inp, prep, today); return; } // no house plan: budget and goals only
    if (!r.depositReady || !r.debtFree) {
      const text = !r.depositReady ? t("overview.noDeposit") : t("overview.noDebtFree");
      wrap.innerHTML = prompt(text, "#/house", t("overview.needHouseCta"));
      return;
    }

    const units = s.house.units;
    const infl = s.house.inflationPct;
    const pick = (y) => (units === "today" ? y.real : y.nom);
    const btn = (value, label) => `<button type="button" class="btn ${units === value ? "btn-primary" : ""}" data-units="${value}" aria-pressed="${units === value}">${label}</button>`;

    // One bar for the whole plan: saving, then loan plus investing, then debt-free.
    const saveMonths = monthsBetween(r.start, r.purchase);
    const loanLen = monthsBetween(r.purchase, r.debtFree) + 1;
    const growMonths = Math.max(0, monthsBetween(r.debtFree, r.endKey)); // after the declaration the loan and portfolio are still tracked
    const toRetire = Boolean(r.retireKey) && r.endKey === r.retireKey;
    const total = saveMonths + loanLen + growMonths;
    const hereRaw = monthsBetween(r.start, today) / total;
    const here = Math.max(0, Math.min(1, hereRaw));
    const bar = `
      <div class="timeline-bar" style="--here:${here.toFixed(3)}">
        <div class="phase phase-save" style="flex:${Math.max(1, saveMonths)}"><strong>${t("overview.phaseSave")}</strong><span>${formatMonth(r.start)} – ${formatMonth(r.depositReady)}</span><span>${duration(saveMonths)}</span></div>
        <div class="phase phase-loan" style="flex:${Math.max(1, loanLen)}"><strong>${t("overview.phaseLoan")}</strong><span>${formatMonth(r.purchase)} – ${formatMonth(r.debtFree)}</span><span>${duration(loanLen)}</span></div>
        <div class="phase phase-free ${growMonths ? "phase-free-mid" : ""}"><strong>${icon("badge-check", { size: 18 })} ${t("overview.phaseFree")}</strong><span>${formatMonth(r.debtFree)}</span></div>
        ${growMonths ? `<div class="phase phase-grow" style="flex:${Math.max(1, growMonths)}"><strong>${t(toRetire ? "overview.phaseGrowAge" : "overview.phaseGrow", { retire: RETIREMENT_AGE })}</strong><span>${formatMonth(r.debtFree)} – ${formatMonth(r.endKey)}</span><span>${duration(growMonths)}</span>${r.loanEnd && r.loanEnd > r.debtFree ? `<span>${t("overview.loanEnds", { month: formatMonth(r.loanEnd) })}</span>` : ""}</div>` : ""}
        ${hereRaw >= 0 && hereRaw <= 1 ? `<span class="here-pin" aria-hidden="true">${icon("map-pin", { size: 18 })}</span>` : ""}
      </div>
      <p class="small muted">${hereRaw < 0 ? t("overview.hereBefore", { month: formatMonth(r.start) }) : hereRaw > 1 ? t("overview.hereAfter") : t("overview.here", { month: formatMonth(today), pct: Math.round(here * 100) })}</p>`;

    const info = r.debtFreeInfo;
    const stats = `<dl class="stat-grid">
      <div class="stat"><dt>${t("overview.sDeposit")}</dt><dd>${formatMonth(r.depositReady)}</dd></div>
      <div class="stat"><dt>${t("overview.sBuy")}</dt><dd>${formatMonth(r.purchase)}</dd></div>
      <div class="stat"><dt>${t("overview.sFree")}</dt><dd>${formatMonth(r.debtFree)}</dd><dd class="sub">${t("overview.sFreeSub", { time: duration(loanMonths(r)) })}</dd></div>
      <div class="stat"><dt>${t("overview.sLeft")}</dt><dd>${eur(units === "today" ? info.surplusReal : info.surplus)}</dd><dd class="sub">${t("overview.sLeftSub")}</dd></div>
      <div class="stat"><dt>${t(toRetire ? "overview.sWorthAge" : "overview.sWorth", { retire: RETIREMENT_AGE })}</dt><dd>${eur(pick(r.years[r.years.length - 1]).netWorth)}</dd><dd class="sub">${t("overview.sWorthSub", { month: formatMonth(r.endKey) })}</dd></div>
    </dl>`;
    const ageHint = s.house.age ? "" : `<div class="note" style="margin-top:var(--space-3)">${icon("info", { size: 18 })}<p>${t("overview.ageHint", { retire: RETIREMENT_AGE })} <a href="#/house">${t("overview.ageLink")}</a></p></div>`;

    const years = r.years;
    const dfYear = Number(r.debtFree.slice(0, 4));
    const label = (y) => (y.year === dfYear ? t("overview.lastYear", { year: y.year, month: formatMonth(r.debtFree).split(" ")[0] }) : String(y.year));
    const rows = years.map((y) => {
      const v = pick(y);
      return `<tr><th scope="row">${label(y)}</th><td class="num">${eur(v.depositSavings)}</td><td class="num">${eur(v.buffer + v.unspent)}</td><td class="num">${eur(v.goalFunds)}</td><td class="num">${eur(v.investments)}</td><td class="num">${eur(v.home)}</td><td class="num">${eur(v.loan)}</td><td class="num"><strong>${eur(v.netWorth)}</strong></td></tr>`;
    }).join("");
    const tableHtml = `<table class="data-table">
      <thead><tr><th scope="col">${t("overview.colYear")}</th><th scope="col" class="num">${t("overview.colDeposit")}</th><th scope="col" class="num">${t("overview.colBank")}</th><th scope="col" class="num">${t("overview.colFunds")}</th><th scope="col" class="num">${t("overview.colInvest")}</th><th scope="col" class="num">${t("overview.colHome")}</th><th scope="col" class="num">${t("overview.colLoan")}</th><th scope="col" class="num">${t("overview.colNetWorth")}</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    const unitLabel = units === "today" ? t("house.c.unitsTodayShort") : t("house.c.unitsFutureShort");

    wrap.innerHTML = `
      ${head}
      <div class="stack-lg">
        <section class="card" aria-labelledby="ov-units">
          <h2 id="ov-units">${t("house.units.title")}</h2>
          <div class="row" role="group" aria-label="${t("house.units.show")}">${btn("future", t("house.units.future"))}${btn("today", t("house.units.today"))}</div>
          <p class="small muted">${units === "today" ? t("house.c.unitsToday", { infl }) : t("house.c.unitsFuture")} <a href="#/house">${t("overview.changeInflation")}</a></p>
        </section>
        <section class="card" aria-labelledby="ov-bar">
          <h2 id="ov-bar">${t("overview.barTitle")}</h2>
          ${bar}
          ${stats}
          ${ageHint}
        </section>
        <section class="card" aria-labelledby="ov-chart">
          <h2 id="ov-chart">${t("overview.chartTitle")}</h2>
          ${chartFigure({ id: "ch-ov", title: t("overview.chartCaption"), summary: t("overview.chartSum", { unit: unitLabel, retire: RETIREMENT_AGE }), tableLabel: "", tableHtml: null, height: 380 })}
        </section>
        <section class="card" aria-labelledby="ov-table">
          <h2 id="ov-table">${t("overview.tableTitle")}</h2>
          <p class="small muted">${t(toRetire ? "overview.tableNoteExt" : "overview.tableNote", { unit: unitLabel, retire: RETIREMENT_AGE })}</p>
          <div class="table-scroll" role="region" tabindex="0" aria-label="${t("overview.tableTitle")}">${tableHtml}</div>
        </section>
      </div>`;

    const money = (v) => formatCompact(v);
    unmount.push(mountChart(wrap.querySelector("#ch-ov"), (th) => {
      const column = (labelKey, key, colour) => ({ type: "bar", label: t(labelKey), data: years.map((y) => Math.round(key === "bank" ? pick(y).buffer + pick(y).unspent : pick(y)[key])), backgroundColor: colour, stack: "money", order: 2 });
      const opts = baseOptions(th, money, { x: { stacked: true }, y: { stacked: true }, tip: eur });
      return {
        type: "bar",
        data: {
          labels: years.map((y) => String(y.year)),
          datasets: [
            column("overview.colDeposit", "depositSavings", th.bank),
            column("overview.colBank", "bank", th.buffer),
            column("overview.colFunds", "goalFunds", th.fund),
            column("overview.colInvest", "investments", th.invest),
            column("overview.colHome", "home", th.installment),
            { type: "line", label: t("overview.colNetWorth"), data: years.map((y) => Math.round(pick(y).netWorth)), borderColor: th.text, backgroundColor: th.text, borderWidth: 3, pointStyle: "triangle", pointRadius: 4, order: 0 },
            { type: "line", label: t("overview.colLoan"), data: years.map((y) => (y.key >= r.purchase ? Math.round(pick(y).loan) : null)), borderColor: th.loan, backgroundColor: th.loan, borderDash: [7, 4], borderWidth: 2.5, pointStyle: "rectRot", pointRadius: 4, order: 1 },
          ],
        },
        options: opts,
      };
    }));
  }

  wrap.addEventListener("click", (e) => {
    const b = e.target.closest("[data-units]");
    if (!b) return;
    store.update((s) => { s.house.units = b.dataset.units; });
    draw();
    const again = wrap.querySelector(`[data-units="${b.dataset.units}"]`);
    if (again) again.focus();
  });

  draw();
  return () => { unmount.forEach((fn) => fn()); unmount = []; };
}
