// Welcome page: what the site is, how it works, who it is for and why it is private.
// New visitors land here; returning visitors with a plan land on the roadmap instead.
import { t } from "../i18n/index.js";
import { icon } from "../components/icon.js";
import * as store from "../store.js";

const SHOT = { width: 1200, height: 750 };
const img = (name, alt, extra = "") =>
  `<img class="shot" src="assets/screens/${name}.webp" alt="${alt}" width="${SHOT.width}" height="${SHOT.height}" ${extra}>`;

export function render(root) {
  const started = Boolean(store.getState().settings.startMonth);
  const cta = started
    ? `<a class="btn btn-primary btn-lg" href="#/home">${t("welcome.ctaBack")}${icon("chevron-right")}</a>`
    : `<a class="btn btn-primary btn-lg" href="#/budget">${t("welcome.ctaNew")}${icon("chevron-right")}</a>`;
  const trustIcons = ["lock", "shield-check", "badge-check"];

  root.innerHTML = `
    <div class="stack-lg welcome">
      <section class="hero" aria-labelledby="hero-h">
        <div class="hero-text">
          <p class="eyebrow">${t("welcome.eyebrow")}</p>
          <h1 id="hero-h">${t("welcome.title")}</h1>
          <p class="lead">${t("welcome.lead")}</p>
          <div class="row">${cta}</div>
          <ul class="trust">${t("welcome.trust").map((x, i) => `<li>${icon(trustIcons[i], { size: 18 })}<span>${x}</span></li>`).join("")}</ul>
        </div>
        <div class="hero-media">${img("overview", t("welcome.heroAlt"))}</div>
      </section>

      <section aria-labelledby="how-h">
        <h2 id="how-h">${t("welcome.howTitle")}</h2>
        <p class="muted">${t("welcome.stepsNote")}</p>
        <ol class="grid grid-3 how">
          ${t("welcome.steps").map((s, i) => `<li class="card"><span class="how-n" aria-hidden="true">${i + 1}</span><h3>${s.t}</h3><p>${s.d}</p></li>`).join("")}
        </ol>
      </section>

      <section aria-labelledby="feat-h">
        <h2 id="feat-h">${t("welcome.featuresTitle")}</h2>
        <p class="muted">${t("welcome.sampleNote")}</p>
        <div class="stack-lg">
          ${t("welcome.features").map((f) => `
            <article class="feature">
              <div class="feature-text"><h3>${f.t}</h3><p>${f.d}</p></div>
              <div class="feature-media">${img(f.img, f.alt, 'loading="lazy"')}</div>
            </article>`).join("")}
        </div>
      </section>

      <section class="card" aria-labelledby="who-h">
        <h2 id="who-h">${t("welcome.whoTitle")}</h2>
        <ul>${t("welcome.whoYes").map((x) => `<li>${x}</li>`).join("")}</ul>
        <p class="muted">${t("welcome.whoNo")}</p>
      </section>

      <section class="card privacy-band" aria-labelledby="priv-h">
        <div class="card-head">${icon("lock")}<h2 id="priv-h">${t("welcome.privacyTitle")}</h2></div>
        <p>${t("welcome.privacyText")}</p>
        <a href="#/privacy">${t("welcome.privacyLink")}</a>
      </section>

      <section aria-labelledby="faq-h">
        <h2 id="faq-h">${t("welcome.faqTitle")}</h2>
        <div class="faq">
          ${t("welcome.faq").map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join("")}
        </div>
      </section>

      <section class="final-cta" aria-labelledby="final-h">
        <h2 id="final-h">${t("welcome.finalTitle")}</h2>
        ${cta}
      </section>
    </div>`;
}
