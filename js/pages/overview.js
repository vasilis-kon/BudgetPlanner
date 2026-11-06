// Page 4: Overview. Where the user's money sits at the end of each year, from the first salary to debt-free.
import { t, formatWhole as eur, formatCompact, formatMonth } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { currentMonth, duration } from "../components/format.js";
import { mountChart, chartFigure, baseOptions } from "../components/chart.js";
import * as store from "../store.js";
import { monthsBetween } from "../calc/budget.js";
import { inputFromState, prepare, project, loanMonths } from "../calc/projection.js";

export function render(root) {
  const wrap = document.createElement("div");
  root.appendChild(wrap);
  let unmount = [];

  const head = `<div class="page-head"><h1>${t("overview.title")}</h1><p>${t("overview.intro")}</p></div>`;
  const prompt = (text, href, cta) => `${head}<section class="card soon-card"><p>${text}</p><a class="btn btn-primary" href="${href}">${cta}${icon("chevron-right")}</a></section>`;

  function draw() {
    unmount.forEach((fn) => fn());
    unmount = [];
    const s = store.getState();
    if (!s.settings.startMonth) { wrap.innerHTML = prompt(t("overview.needBudget"), "#/budget", t("overview.needBudgetCta")); return; }
    const today = currentMonth();
    const inp = inputFromState(s, today);
    const r = project(inp, prepare(inp));
    if (!r.fin.ok || !r.depositReady || !r.debtFree) {
      const text = !r.fin.ok ? t("overview.needHouse") : !r.depositReady ? t("overview.noDeposit") : t("overview.noDebtFree");
      wrap.innerHTML = prompt(text, "#/house", t("overview.needHouseCta"));
      return;
    }

    const units = s.house.units;
    const infl = s.house.inflationPct;
    const pick = (y) => (units === "today" ? y.real : y.nom);
    const btn = (value, label) => `<button type="button" class="btn ${units === value ? "btn-primary" : ""}" data-units="${value}" aria-pressed="${units === value}">${label}</button>`;

    // One bar for the whole plan: saving, then loan plus investing, then debt-free.
    const total = monthsBetween(r.start, r.debtFree) + 1;
    const saveMonths = monthsBetween(r.start, r.purchase);
    const loanLen = total - saveMonths;
    const hereRaw = monthsBetween(r.start, today) / total;
    const here = Math.max(0, Math.min(1, hereRaw));
    const bar = `
      <div class="timeline-bar" style="--here:${here.toFixed(3)}">
        <div class="phase phase-save" style="flex:${Math.max(1, saveMonths)}"><strong>${t("overview.phaseSave")}</strong><span>${formatMonth(r.start)} – ${formatMonth(r.depositReady)}</span><span>${duration(saveMonths)}</span></div>
        <div class="phase phase-loan" style="flex:${Math.max(1, loanLen)}"><strong>${t("overview.phaseLoan")}</strong><span>${formatMonth(r.purchase)} – ${formatMonth(r.debtFree)}</span><span>${duration(loanLen)}</span></div>
        <div class="phase phase-free"><strong>${icon("badge-check", { size: 18 })} ${t("overview.phaseFree")}</strong><span>${formatMonth(r.debtFree)}</span></div>
        ${hereRaw >= 0 && hereRaw <= 1 ? `<span class="here-pin" aria-hidden="true">${icon("map-pin", { size: 18 })}</span>` : ""}
      </div>
      <p class="small muted">${hereRaw < 0 ? t("overview.hereBefore", { month: formatMonth(r.start) }) : hereRaw > 1 ? t("overview.hereAfter") : t("overview.here", { month: formatMonth(today), pct: Math.round(here * 100) })}</p>`;

    const info = r.debtFreeInfo;
    const stats = `<dl class="stat-grid">
      <div class="stat"><dt>${t("overview.sDeposit")}</dt><dd>${formatMonth(r.depositReady)}</dd></div>
      <div class="stat"><dt>${t("overview.sBuy")}</dt><dd>${formatMonth(r.purchase)}</dd></div>
      <div class="stat"><dt>${t("overview.sFree")}</dt><dd>${formatMonth(r.debtFree)}</dd><dd class="sub">${t("overview.sFreeSub", { time: duration(loanMonths(r)) })}</dd></div>
      <div class="stat"><dt>${t("overview.sLeft")}</dt><dd>${eur(units === "today" ? info.surplusReal : info.surplus)}</dd><dd class="sub">${t("overview.sLeftSub")}</dd></div>
    </dl>`;

    const years = r.years;
    const label = (y) => (y.key === r.debtFree ? t("overview.lastYear", { year: y.year, month: formatMonth(y.key).split(" ")[0] }) : String(y.year));
    const rows = years.map((y) => {
      const v = pick(y);
      return `<tr><th scope="row">${label(y)}</th><td class="num">${eur(v.depositSavings)}</td><td class="num">${eur(v.buffer)}</td><td class="num">${eur(v.goalFunds)}</td><td class="num">${eur(v.unspent)}</td><td class="num">${eur(v.investments)}</td><td class="num">${eur(v.loan)}</td></tr>`;
    }).join("");
    const tableHtml = `<table class="data-table">
      <thead><tr><th scope="col">${t("overview.colYear")}</th><th scope="col" class="num">${t("overview.colDeposit")}</th><th scope="col" class="num">${t("overview.colBuffer")}</th><th scope="col" class="num">${t("overview.colFunds")}</th><th scope="col" class="num">${t("overview.colUnspent")}</th><th scope="col" class="num">${t("overview.colInvest")}</th><th scope="col" class="num">${t("overview.colLoan")}</th></tr></thead>
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
        </section>
        <section class="card" aria-labelledby="ov-chart">
          <h2 id="ov-chart">${t("overview.chartTitle")}</h2>
          ${chartFigure({ id: "ch-ov", title: t("overview.chartCaption"), summary: t("overview.chartSum", { unit: unitLabel }), tableLabel: "", tableHtml: null, height: 380 })}
        </section>
        <section class="card" aria-labelledby="ov-table">
          <h2 id="ov-table">${t("overview.tableTitle")}</h2>
          <p class="small muted">${t("overview.tableNote", { unit: unitLabel })}</p>
          <div class="table-scroll" role="region" tabindex="0" aria-label="${t("overview.tableTitle")}">${tableHtml}</div>
        </section>
      </div>`;

    const money = (v) => formatCompact(v);
    unmount.push(mountChart(wrap.querySelector("#ch-ov"), (th) => {
      const column = (labelKey, key, colour) => ({ type: "bar", label: t(labelKey), data: years.map((y) => Math.round(pick(y)[key])), backgroundColor: colour, stack: "money", order: 2 });
      const opts = baseOptions(th, money, { x: { stacked: true }, y: { stacked: true }, tip: eur });
      return {
        type: "bar",
        data: {
          labels: years.map((y) => String(y.year)),
          datasets: [
            column("overview.colDeposit", "depositSavings", th.bank),
            column("overview.colBuffer", "buffer", th.buffer),
            column("overview.colFunds", "goalFunds", th.fund),
            column("overview.colUnspent", "unspent", th.living),
            column("overview.colInvest", "investments", th.invest),
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
