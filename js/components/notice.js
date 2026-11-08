// The short "estimates, not advice" notice shown on pages that project the future.
import { t, formatDay } from "../i18n/index.js";
import { icon } from "./icon.js";
import { SITE } from "../config.js";

export function noticeHtml() {
  return `<div class="note notice">${icon("info", { size: 18 })}<p>${t("notice.text", { date: formatDay(SITE.assumptionsUpdated) })} <a href="#/disclaimer">${t("notice.link")}</a></p></div>`;
}

/** Explains "debt-free status" wherever the plan reaches it. */
export function debtFreeNoteHtml() {
  return `<div class="note">${icon("badge-check", { size: 18 })}<p><strong>${t("debtFreeNote.title")}</strong> ${t("debtFreeNote.text")}</p></div>`;
}
