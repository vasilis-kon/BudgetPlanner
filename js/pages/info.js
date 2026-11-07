// Plain pages: About and contact, Privacy policy, Terms of use, Disclaimer and assumptions.
import { t, formatDay, formatMoney as eur } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import { esc } from "../components/dom.js";
import * as store from "../store.js";
import { SITE } from "../config.js";

const fill = (s) => s.replaceAll("{owner}", esc(SITE.owner));

function sectionsHtml(sections) {
  return sections.map((s) => `
    <section class="prose-sec">
      <h2>${s.h}</h2>
      ${(s.p || []).map((p) => `<p>${fill(p)}</p>`).join("")}
      ${s.ul ? `<ul>${s.ul.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
      ${(s.p2 || []).map((p) => `<p>${fill(p)}</p>`).join("")}
    </section>`).join("");
}

function head(key, date) {
  const stamp = date ? `<p class="meta">${t("info.updated", { date: formatDay(date) })}</p>` : "";
  return `<div class="page-head"><h1>${t(key + ".title")}</h1>${stamp}</div>`;
}

export const terms = {
  render(root) {
    root.innerHTML = `${head("terms", SITE.legalUpdated)}<div class="prose">${sectionsHtml(t("terms.sections"))}</div>`;
  },
};

export const privacy = {
  render(root) {
    root.innerHTML = `
      ${head("privacy", SITE.legalUpdated)}
      <div class="prose">
        ${sectionsHtml(t("privacy.sections"))}
        <section class="card erase" aria-labelledby="erase-h">
          <h2 id="erase-h">${t("privacy.eraseTitle")}</h2>
          <p>${t("privacy.eraseText")}</p>
          <button type="button" class="btn btn-danger" id="erase-btn">${icon("trash-2", { size: 18 })}${t("privacy.eraseBtn")}</button>
          <p class="small" id="erase-msg" role="status"></p>
        </section>
      </div>`;
    root.querySelector("#erase-btn").addEventListener("click", () => {
      if (!confirm(t("privacy.eraseConfirm"))) return;
      store.eraseAll();
      window.dispatchEvent(new Event("bp-erased"));
      root.querySelector("#erase-msg").textContent = t("privacy.eraseDone");
    });
  },
};

export const disclaimer = {
  render(root) {
    const h = store.defaultHouse();
    const R = t("disclaimer.rows");
    const pct = (n) => `${n}%`;
    const rows = [
      [R.ltv, pct(h.ltvPct)],
      [R.costs, pct(h.costsPct)],
      [R.buffer, eur(h.buffer)],
      [R.termYears, t("time.years", { n: h.loan.termYears })],
      [R.fixed, pct(h.loan.rate)],
      [R.fixedThenVariable, t("disclaimer.fixedValue", { fixed: h.loan.fixedRate, years: h.loan.fixedYears, variable: h.loan.variableRate })],
      [R.homeCosts, eur(h.loan.homeCosts)],
      [R.returnPct, pct(h.invest.returnPct)],
      [R.feePct, pct(h.invest.feePct)],
      [R.taxPct, pct(h.invest.taxPct)],
      [R.rentTax, pct(h.support.taxPct)],
      [R.inflation, pct(h.inflationPct)],
      [R.retire, t("disclaimer.retireValue")],
    ];
    const cols = t("disclaimer.cols");
    root.innerHTML = `
      ${head("disclaimer", null)}
      <div class="prose">
        <p class="lead-text">${t("disclaimer.lead")}</p>
        ${sectionsHtml(t("disclaimer.sections"))}
        <section class="prose-sec" aria-labelledby="assump-h">
          <h2 id="assump-h">${t("disclaimer.tableTitle")}</h2>
          <p>${t("disclaimer.tableLead")}</p>
          <div class="table-scroll" tabindex="0" role="region" aria-labelledby="assump-h">
            <table class="data-table assumptions">
              <thead><tr><th scope="col">${cols[0]}</th><th scope="col">${cols[1]}</th></tr></thead>
              <tbody>${rows.map(([a, b]) => `<tr><th scope="row">${a}</th><td>${b}</td></tr>`).join("")}</tbody>
            </table>
          </div>
          <p class="meta">${t("disclaimer.updated", { date: formatDay(SITE.assumptionsUpdated) })}</p>
        </section>
      </div>`;
  },
};

export const about = {
  render(root) {
    const newTab = `<span class="visually-hidden"> ${t("about.newTab")}</span>`;
    const email = SITE.contactEmail
      ? `<li>${icon("mail", { size: 18 })}<span>${t("about.emailLabel")}: <a href="mailto:${esc(SITE.contactEmail)}">${esc(SITE.contactEmail)}</a></span></li>`
      : "";
    const types = t("about.types");
    root.innerHTML = `
      ${head("about", null)}
      <div class="prose">
        ${sectionsHtml(t("about.sections"))}
        <section class="prose-sec" aria-labelledby="contact-h">
          <h2 id="contact-h">${t("about.contactTitle")}</h2>
          <p>${t("about.contactText")}</p>
          <ul class="contact-list">
            ${email}
            <li>${icon("message-square", { size: 18 })}<span><a href="${esc(SITE.issues)}" target="_blank" rel="noopener">${t("about.githubLabel")}${newTab}</a></span></li>
            <li>${icon("book-open", { size: 18 })}<span><a href="${esc(SITE.repo)}" target="_blank" rel="noopener">${t("about.sourceLabel")}${newTab}</a></span></li>
          </ul>
        </section>
        <section class="card" aria-labelledby="fb-h">
          <h2 id="fb-h">${t("about.formTitle")}</h2>
          <p>${t("about.formIntro")}</p>
          <form id="fb-form" class="stack" novalidate>
            <div class="field">
              <label for="fb-type">${t("about.typeLabel")}</label>
              <select id="fb-type">${Object.entries(types).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
            </div>
            <div class="field">
              <label for="fb-msg">${t("about.messageLabel")}</label>
              <textarea id="fb-msg" rows="6" maxlength="2000" aria-describedby="fb-hint fb-err"></textarea>
              <span class="hint" id="fb-hint">${t("about.messageHint")}</span>
              <span class="error" id="fb-err" role="alert"></span>
            </div>
            <div><button type="submit" class="btn btn-primary">${t("about.send")}${newTab}</button></div>
          </form>
        </section>
      </div>`;
    const form = root.querySelector("#fb-form");
    const msg = root.querySelector("#fb-msg");
    const err = root.querySelector("#fb-err");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = msg.value.trim();
      if (!text) {
        err.textContent = t("about.messageError");
        msg.setAttribute("aria-invalid", "true");
        msg.focus();
        return;
      }
      err.textContent = "";
      msg.removeAttribute("aria-invalid");
      const type = root.querySelector("#fb-type").value;
      const title = `[${types[type]}] ${text.replace(/\s+/g, " ").slice(0, 60)}`;
      const url = `${SITE.issues}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
      window.open(url, "_blank", "noopener");
    });
  },
};
