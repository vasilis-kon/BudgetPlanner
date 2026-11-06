// Placeholder body for pages that are not built yet.
import { t } from "../i18n/index.js";

export function renderSoon(root, key) {
  root.innerHTML = `
    <div class="page-head"><h1>${t(`soon.${key}.title`)}</h1></div>
    <section class="card soon-card">
      <p><span class="badge badge-soon">${t("soon.badge")}</span></p>
      <p>${t(`soon.${key}.text`)}</p>
    </section>`;
}
