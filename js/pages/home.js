// Page 0: Home. The roadmap: goals, life events, deposit, purchase and debt-free on one timeline,
// with a "you are here" marker. Each milestone links to the page it belongs to.
import { t, formatMoney as eur, formatMonth } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { esc } from "../components/dom.js";
import { overspendHtml } from "../components/overspend.js";
import { currentMonth, duration } from "../components/format.js";
import * as store from "../store.js";
import { monthsBetween, addMonths } from "../calc/budget.js";
import { inputFromState, prepare, project, loanMonths } from "../calc/projection.js";
import { buildRoadmap, hereIndex } from "../calc/roadmap.js";

const ICONS = { goal: "target", event: "calendar-clock", deposit: "piggy-bank", purchase: "key-round", fixedEnd: "hourglass", debtFree: "badge-check", loanEnd: "circle-check" };

function milestone(it, today) {
  const pct = Math.round((it.progress ?? 0) * 100);
  let title = "", detail = "", progress = "";
  if (it.kind === "goal") {
    title = t("home.m.goal", { name: esc(it.name) });
    detail = t("home.m.goalDetail", { amount: eur(it.amount), monthly: eur(it.monthly), from: formatMonth(it.start) });
    progress = `<span class="ms-progress"><progress max="100" value="${pct}" aria-label="${esc(t("home.m.goalProgress", { name: it.name }))}"></progress><span class="small">${t("home.m.saved", { pct })}</span></span>`;
  } else if (it.kind === "event") {
    title = t("home.m.event", { name: esc(it.name) });
    detail = it.end ? t("home.m.eventRange", { from: formatMonth(it.key), to: formatMonth(addMonths(it.end, -1)) }) : t("home.m.eventFrom", { from: formatMonth(it.key) });
  } else if (it.kind === "deposit") {
    title = t("home.m.deposit");
    detail = t("home.m.depositDetail", { amount: eur(it.cashNeeded) });
    progress = `<span class="ms-progress"><progress max="100" value="${pct}" aria-label="${t("home.m.depositProgress")}"></progress><span class="small">${t("home.m.saved", { pct })}</span></span>`;
  } else if (it.kind === "purchase") {
    title = t("home.m.purchase");
    detail = t("home.m.purchaseDetail");
  } else if (it.kind === "fixedEnd") {
    title = t("home.m.fixedEnd");
    detail = t("home.m.fixedEndDetail");
  } else if (it.kind === "debtFree") {
    title = t("home.m.debtFree");
    detail = t(it.reason === "portfolio" ? "home.m.debtFreePortfolio" : "home.m.debtFreePaid");
  } else if (it.kind === "loanEnd") {
    title = t("home.m.loanEnd");
    detail = t("home.m.loanEndDetail");
  }
  const state = it.done ? t("home.done") : it.key === today ? t("home.thisMonth") : "";
  return `
    <li class="ms ms-${it.kind} ${it.done ? "done" : ""}">
      <a class="ms-link" href="${it.href}">
        <span class="ms-dot" aria-hidden="true">${icon(it.done ? "check" : ICONS[it.kind], { size: 18 })}</span>
        <span class="ms-body">
          <span class="ms-date">${formatMonth(it.key)}${state ? ` <span class="badge ${it.done ? "" : "badge-soon"}">${state}</span>` : ""}</span>
          <strong class="ms-title">${title}</strong>
          <span class="ms-detail">${detail}</span>
          ${progress}
          <span class="ms-open small">${t("home.openPage", { page: t("nav." + it.href.slice(2)) })}${icon("arrow-right", { size: 14 })}</span>
        </span>
      </a>
    </li>`;
}

export function render(root) {
  const s = store.getState();
  const today = currentMonth();
  const started = Boolean(s.settings.startMonth);
  const yes = t("home.whoYes").map((x) => `<li>${x}</li>`).join("");
  const who = (open) => `
    <${open ? "section" : "details"} class="card" ${open ? 'aria-labelledby="who-h"' : ""}>
      ${open ? `<div class="card-head">${icon("info")}<h2 id="who-h">${t("home.whoTitle")}</h2></div>` : `<summary><strong id="who-h">${t("home.whoTitle")}</strong></summary><div style="margin-top:var(--space-3)">`}
      <p>${t("home.whoIntro")}</p>
      <ul>${yes}</ul>
      <p class="muted">${t("home.whoNo")}</p>
      ${open ? `<a class="btn btn-primary" href="#/budget">${t("home.startCta")}${icon("chevron-right")}</a>` : "</div>"}
    </${open ? "section" : "details"}>`;

  if (!started) {
    root.innerHTML = `
      <div class="page-head"><h1>${t("home.title")}</h1></div>
      <div class="stack-lg">
        ${who(true)}
        <section class="card" aria-labelledby="road-h">
          <div class="card-head">${icon("map-pinned")}<h2 id="road-h">${t("home.roadmapTitle")}</h2></div>
          <p class="muted">${t("home.roadmapEmpty")}</p>
          <ol class="steps">${t("home.steps").map((x) => `<li>${x}</li>`).join("")}</ol>
        </section>
      </div>`;
    return;
  }

  const inp = inputFromState(s, today);
  const prep = prepare(inp);
  const r = project(inp, prep);
  const items = buildRoadmap({ today, goals: inp.goals, events: s.house.events, result: r });
  const at = hereIndex(items, today);
  const here = `
    <li class="ms here" aria-current="step">
      <span class="ms-dot" aria-hidden="true">${icon("map-pin", { size: 18 })}</span>
      <span class="ms-body"><strong class="ms-title">${t("home.here")}</strong><span class="ms-date">${formatMonth(today)}</span></span>
    </li>`;
  const list = [...items.slice(0, at).map((it) => milestone(it, today)), here, ...items.slice(at).map((it) => milestone(it, today))].join("");

  let summary = "";
  if (r.fin.ok && r.feasible && r.depositReady && r.debtFree) {
    summary = `<dl class="stat-grid">
      <div class="stat"><dt>${t("home.sDeposit")}</dt><dd>${formatMonth(r.depositReady)}</dd></div>
      <div class="stat"><dt>${t("home.sBuy")}</dt><dd>${formatMonth(r.purchase)}</dd></div>
      <div class="stat"><dt>${t("home.sFree")}</dt><dd>${formatMonth(r.debtFree)}</dd><dd class="sub">${t("home.sFreeSub", { time: duration(Math.max(0, monthsBetween(today, r.debtFree))) })}</dd></div>
    </dl>`;
  }
  const hints = [];
  if (!r.fin.ok) hints.push(`<div class="note">${icon("info", { size: 18 })}<p>${t("home.hintHouse")} <a href="#/house">${t("home.hintHouseLink")}</a></p></div>`);
  else if (!r.depositReady && !r.problems.length) hints.push(`<div class="note note-warn">${icon("triangle-alert", { size: 18 })}<p>${t("home.hintNoDeposit")} <a href="#/house">${t("home.hintHouseLink")}</a></p></div>`);
  if (!inp.goals.length) hints.push(`<div class="note">${icon("info", { size: 18 })}<p>${t("home.hintGoals")} <a href="#/goals">${t("home.hintGoalsLink")}</a></p></div>`);

  root.innerHTML = `
    <div class="page-head"><h1>${t("home.title")}</h1><p>${t("home.intro")}</p></div>
    <div class="stack-lg">
      ${overspendHtml({ inp, prep, r, categories: s.categories })}
      <section class="card" aria-labelledby="road-h">
        <div class="card-head">${icon("map-pinned")}<h2 id="road-h">${t("home.roadmapTitle")}</h2></div>
        ${summary}
        ${hints.length ? `<div class="stack" style="margin:var(--space-4) 0">${hints.join("")}</div>` : ""}
        <ol class="roadmap" aria-label="${t("home.roadmapTitle")}">${list}</ol>
      </section>
      ${who(false)}
    </div>`;
}
