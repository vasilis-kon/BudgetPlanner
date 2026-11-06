// The red box shown wherever a plan overspends: which months, by how much, and where to cut.
// A plan that spends more than it earns is not a plan, so this replaces the dates and charts that rest on it.
import { t, formatWhole as eur, formatMonth } from "../i18n/index.js";
import { icon } from "./icon.js";
import { esc } from "./dom.js";
import { cutAdvice } from "../calc/projection.js";

const MAX_PERIODS = 4;
const range = (from, to) => (from === to ? formatMonth(from) : t("house.range", { from: formatMonth(from), to: formatMonth(to) }));

/**
 * `ctx` is { inp, prep, r, categories } where r comes from project() and categories is the saved category list.
 * Returns "" when nothing is overspent. `onHouse` leaves out the link back to the House Planner.
 */
export function overspendHtml({ inp, prep, r, categories }, { onHouse = false } = {}) {
  if (!r.problems.length) return "";
  const nameOf = (id) => {
    const c = categories.find((x) => x.id === id);
    return c ? (c.builtin ? t("cat." + c.id) : c.name) : id;
  };
  const periods = r.problems.slice(0, MAX_PERIODS).map((p) => {
    const a = cutAdvice(inp, prep, r, p);
    const list = a.categories.slice(0, 6).map((c) => `<li><span>${esc(nameOf(c.id))} <span class="badge ${c.flexible ? "badge-flex" : ""}">${t(c.flexible ? "overspend.flexible" : "overspend.essential")}</span></span><strong class="num">${eur(c.amount)}</strong></li>`).join("");
    const lead = !a.categories.some((c) => c.flexible) ? t("overspend.noFlexible", { month: formatMonth(a.key) })
      : a.enough ? t("overspend.cutEnough", { flex: eur(a.flexibleTotal), month: formatMonth(a.key) })
      : t("overspend.cutNotEnough", { flex: eur(a.flexibleTotal), month: formatMonth(a.key) });
    return `
      <section class="overspend-period" aria-label="${esc(range(p.from, p.to))}">
        <h3>${range(p.from, p.to)}: ${t("overspend.shortBy", { amount: eur(p.worst) })}</h3>
        <p>${t(p.kind === "expenses" ? "overspend.periodExpenses" : "overspend.periodInstallment", { months: p.months })}</p>
        <p><strong>${t("overspend.cut", { amount: eur(Math.ceil(p.worst)) })}</strong> ${lead}</p>
        <ul class="cut-list">${list}</ul>
        <p class="small">${t(p.kind === "expenses" ? "overspend.leversExpenses" : "overspend.leversInstallment")}</p>
      </section>`;
  }).join("");
  const more = r.problems.length > MAX_PERIODS ? `<p class="small muted">${t("overspend.more", { count: r.problems.length - MAX_PERIODS })}</p>` : "";
  return `
    <section class="card card-danger" role="alert" aria-labelledby="over-h">
      <div class="card-head">${icon("triangle-alert")}<h2 id="over-h">${t("overspend.title")}</h2></div>
      <p><strong>${t("overspend.intro")}</strong></p>
      <p class="small">${t("overspend.hidden")}</p>
      <div class="stack-lg">${periods}</div>
      ${more}
      <div class="row" style="margin-top:var(--space-4)">
        <a class="btn btn-primary" href="#/budget">${t("overspend.linkBudget")}</a>
        ${onHouse ? "" : `<a class="btn" href="#/house">${t("overspend.linkHouse")}</a>`}
      </div>
    </section>`;
}
