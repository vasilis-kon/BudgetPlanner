// Start-up: builds the page frame, handles hash routes, theme, menu, backup export/import.
import { t } from "./i18n/index.js";
import { icon } from "./components/icon.js";
import * as store from "./store.js";
import * as home from "./pages/home.js";
import * as budget from "./pages/budget.js";
import * as tracker from "./pages/tracker.js";
import * as goals from "./pages/goals.js";
import * as house from "./pages/house.js";
import * as overview from "./pages/overview.js";
import * as landing from "./pages/landing.js";
import * as info from "./pages/info.js";

const ROUTES = {
  // Menu order follows the flow: set the baselines, track the month, plan goals, plan the house, then see the results.
  budget: { page: budget, icon: "wallet" },
  tracker: { page: tracker, icon: "receipt" },
  goals: { page: goals, icon: "target" },
  house: { page: house, icon: "house" },
  overview: { page: overview, icon: "chart-line" },
  home: { page: home, icon: "map-pinned" },
  // Pages outside the main menu: reached from the footer, the welcome page and links in the text.
  welcome: { page: landing, nav: false },
  about: { page: info.about, nav: false },
  privacy: { page: info.privacy, nav: false },
  terms: { page: info.terms, nav: false },
  disclaimer: { page: info.disclaimer, nav: false },
};
const DEFAULT_ROUTE = "welcome"; // where the site opens, and where unknown addresses go

const $ = (id) => document.getElementById(id);
let cleanup = null;

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, "").split("?")[0];
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

function renderHeader() {
  const nav = Object.entries(ROUTES)
    .filter(([, r]) => r.nav !== false)
    .map(([name, r]) => `<li><a href="#/${name}" data-route="${name}">${icon(r.icon)}<span>${t("nav." + name)}</span></a></li>`)
    .join("");
  $("site-header").innerHTML = `
    <div class="header-inner">
      <a class="brand" href="#/welcome">${icon("piggy-bank", { size: 24 })}<span>${t("app.name")}</span></a>
      <nav class="main-nav" id="main-nav" aria-label="${t("nav.label")}"><ul>${nav}</ul></nav>
      <div class="header-actions">
        <button type="button" class="btn btn-quiet btn-icon" id="theme-toggle"></button>
        <button type="button" class="btn btn-quiet menu-toggle" id="menu-toggle" aria-expanded="false" aria-controls="main-nav">
          ${icon("menu")}<span>${t("nav.menu")}</span>
        </button>
      </div>
    </div>`;
  $("menu-toggle").addEventListener("click", () => {
    if (wide.matches) setCollapsed(!document.documentElement.classList.contains("nav-collapsed"));
    else setMenu(!$("main-nav").classList.contains("open"));
  });
  $("main-nav").addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("main-nav").classList.contains("open")) { setMenu(false); $("menu-toggle").focus(); }
  });
  wide.addEventListener("change", () => { setMenu(false); syncToggle(); });
  $("theme-toggle").addEventListener("click", toggleTheme);
  updateThemeButton();
  syncToggle();
  setupRailTips();
}

/** In the icon-only sidebar, pointing at (or tabbing to) an icon shows the page's name beside it. */
function setupRailTips() {
  const tip = document.createElement("div");
  tip.className = "nav-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.appendChild(tip);
  const header = $("site-header");
  const hide = () => { tip.hidden = true; };
  const show = (e) => {
    const el = e.target.closest(".main-nav a, .brand, #menu-toggle, #theme-toggle");
    if (!el || !wide.matches || !document.documentElement.classList.contains("nav-collapsed")) return hide();
    const span = el.querySelector("span");
    tip.textContent = (span ? span.textContent : el.getAttribute("aria-label") || el.title || "").trim();
    if (!tip.textContent) return hide();
    const r = el.getBoundingClientRect();
    tip.style.left = `${r.right + 10}px`;
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.hidden = false;
  };
  header.addEventListener("mouseover", show);
  header.addEventListener("mouseout", hide);
  header.addEventListener("focusin", (e) => { if (e.target.matches(":focus-visible")) show(e); });
  header.addEventListener("focusout", hide);
  header.addEventListener("click", hide);
  document.addEventListener("scroll", hide, true);
}

// Wide screens: a sidebar that can shrink to an icon rail (remembered). Narrow screens: a slide-in drawer.
const wide = matchMedia("(min-width: 64rem)");

function setMenu(open) {
  $("main-nav").classList.toggle("open", open);
  syncToggle();
}

function setCollapsed(collapsed) {
  document.documentElement.classList.toggle("nav-collapsed", collapsed);
  try { localStorage.setItem("bp-nav-collapsed", collapsed ? "1" : "0"); } catch (e) {}
  syncToggle();
}

function syncToggle() {
  const btn = $("menu-toggle");
  const expanded = wide.matches
    ? !document.documentElement.classList.contains("nav-collapsed")
    : $("main-nav").classList.contains("open");
  btn.setAttribute("aria-expanded", String(expanded));
  btn.querySelector("svg").outerHTML = icon(wide.matches ? (expanded ? "chevron-left" : "menu") : (expanded ? "x" : "menu"));
}

function isDark() {
  const th = store.getState().settings.theme;
  return th === "dark" || (th === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
}
function applyTheme() {
  const th = store.getState().settings.theme;
  if (th === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", th);
  window.dispatchEvent(new Event("bp-theme")); // charts redraw in the new colours
}
function updateThemeButton() {
  const dark = isDark();
  const label = dark ? t("theme.toggleToLight") : t("theme.toggleToDark");
  const btn = $("theme-toggle");
  btn.innerHTML = icon(dark ? "sun" : "moon");
  btn.setAttribute("aria-label", label);
  btn.title = label;
}
function toggleTheme() {
  store.update((s) => { s.settings.theme = isDark() ? "light" : "dark"; });
  applyTheme();
  updateThemeButton();
}

function renderFooter() {
  $("site-footer").innerHTML = `
    <div class="footer-inner">
      <p class="small muted">${t("footer.saved")}</p>
      <nav class="footer-links small" aria-label="${t("footerLinks.label")}"><ul>
        ${["welcome", "about", "privacy", "terms", "disclaimer"].map((n) => `<li><a href="#/${n}" data-route="${n}">${t("nav." + n)}</a></li>`).join("")}
      </ul></nav>
      <div class="row">
        <button type="button" class="btn btn-small" id="export-btn">${icon("download", { size: 16 })}${t("footer.export")}</button>
        <button type="button" class="btn btn-small" id="import-btn">${icon("upload", { size: 16 })}${t("footer.import")}</button>
        <input type="file" id="import-file" accept="application/json,.json" class="visually-hidden" tabindex="-1" aria-hidden="true">
      </div>
      <p class="small" id="backup-msg" role="status"></p>
    </div>`;
  $("export-btn").addEventListener("click", () => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `budgetplanner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const ok = file.size < 5e6 && store.importJson(await file.text());
    $("backup-msg").textContent = ok ? t("footer.importOk") : t("footer.importBad");
    if (ok) { applyTheme(); updateThemeButton(); render(); }
  });
}

function updateBanner() {
  $("banner").className = store.isStorageOk() ? "" : "banner";
  $("banner").textContent = store.isStorageOk() ? "" : t("footer.storageOff");
}

function render() {
  if (cleanup) { cleanup(); cleanup = null; }
  const name = currentRoute();
  document.querySelectorAll("[data-route]").forEach((a) => {
    if (a.dataset.route === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const main = $("main");
  main.innerHTML = "";
  cleanup = ROUTES[name].page.render(main) || null;
  document.title = `${t("nav." + name)} · ${t("app.name")}`;
  updateBanner();
}

function onHashChange() {
  render();
  window.scrollTo(0, 0);
  const h1 = $("main").querySelector("h1");
  if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); } // announce the new page
}

function start() {
  store.load();
  applyTheme();
  $("skip-link").textContent = t("app.skip");
  // A plain "#main" link would change the route, so move focus by script instead.
  $("skip-link").addEventListener("click", (e) => { e.preventDefault(); $("main").focus(); });
  renderHeader();
  renderFooter();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { updateThemeButton(); window.dispatchEvent(new Event("bp-theme")); });
  store.subscribe(updateBanner);
  // After "Erase all saved data": go back to the default look and menu state.
  window.addEventListener("bp-erased", () => {
    document.documentElement.classList.remove("nav-collapsed");
    applyTheme();
    updateThemeButton();
    syncToggle();
  });
  window.addEventListener("hashchange", onHashChange);
  if (!location.hash) history.replaceState(null, "", "#/" + DEFAULT_ROUTE);
  render();
}

start();
