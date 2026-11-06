import { t } from "../i18n/index.js";
import { icon } from "../components/icon.js";

export function render(root) {
  const yes = t("home.whoYes").map((x) => `<li>${x}</li>`).join("");
  root.innerHTML = `
    <div class="page-head"><h1>${t("home.title")}</h1></div>
    <div class="stack-lg">
      <section class="card" aria-labelledby="who-h">
        <div class="card-head">${icon("info")}<h2 id="who-h">${t("home.whoTitle")}</h2></div>
        <p>${t("home.whoIntro")}</p>
        <ul>${yes}</ul>
        <p class="muted">${t("home.whoNo")}</p>
        <a class="btn btn-primary" href="#/budget">${t("home.startCta")}${icon("chevron-right")}</a>
      </section>
      <section class="card" aria-labelledby="road-h">
        <div class="card-head">${icon("map-pinned")}<h2 id="road-h">${t("home.roadmapTitle")}</h2><span class="badge badge-soon">${t("soon.badge")}</span></div>
        <p class="muted">${t("home.roadmapSoon")}</p>
      </section>
    </div>`;
}
