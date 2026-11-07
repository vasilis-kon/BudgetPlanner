// Chart.js (vendored, exact version 4.4.7) loaded on first use, plus theme-aware helpers.
// Every chart sits beside a data table, so the numbers never live only in a picture.
import { esc } from "./dom.js";

const SRC = "js/vendor/chart-4.4.7.umd.min.js";
let loading = null;

export function loadChart() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.onload = () => resolve(window.Chart);
      s.onerror = () => { loading = null; reject(new Error("Chart.js did not load")); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Colours read from the current theme, so charts match light and dark mode. */
export function chartTheme() {
  return {
    text: css("--text"), muted: css("--text-muted"), grid: css("--border"), surface: css("--surface"),
    living: css("--c-living"), goals: css("--c-goals"), installment: css("--c-installment"),
    invest: css("--c-invest"), bank: css("--c-bank"), bonus: css("--c-bonus"), loan: css("--c-loan"),
    buffer: css("--c-buffer"), fund: css("--c-fund"),
  };
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Shared look for axes, legend and tooltips. `yFormat` formats the money axis. */
export function baseOptions(theme, yFormat, extra = {}) {
  if (window.Chart) window.Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion() ? false : { duration: 250 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { position: "bottom", labels: { color: theme.text, usePointStyle: true, boxWidth: 10, padding: 14, font: { size: 13 } } },
      tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${(extra.tip || yFormat)(c.parsed.y)}` } },
    },
    scales: {
      x: { ticks: { color: theme.muted, maxRotation: 0, autoSkipPadding: 12 }, grid: { color: theme.grid }, ...(extra.x || {}) },
      y: { ticks: { color: theme.muted, callback: (v) => yFormat(v) }, grid: { color: theme.grid }, ...(extra.y || {}) },
    },
  };
}

/**
 * Draws a chart and redraws it when the theme changes. `build(theme)` returns a Chart.js config.
 * Returns a function that removes the chart.
 */
export function mountChart(canvas, build) {
  let chart = null;
  let dead = false;
  const draw = () => {
    if (dead || !canvas.isConnected) return;
    loadChart().then((Chart) => {
      if (dead) return;
      if (chart) chart.destroy();
      chart = new Chart(canvas, build(chartTheme()));
    }).catch(() => {
      const box = canvas.parentElement;
      if (box) box.innerHTML = `<p class="muted small">Chart could not load. The table below has the same numbers.</p>`;
    });
  };
  window.addEventListener("bp-theme", draw);
  draw();
  return () => { dead = true; window.removeEventListener("bp-theme", draw); if (chart) chart.destroy(); };
}

/** A chart with a title, a text summary and the same data as a collapsible table. */
export function chartFigure({ id, title, summary, tableHtml, tableLabel, height = 300 }) {
  return `
    <figure class="chart" aria-labelledby="${id}-t">
      <figcaption id="${id}-t" class="chart-title">${esc(title)}</figcaption>
      <p class="small muted">${summary}</p>
      <div class="chart-box" style="height:${height}px"><canvas id="${id}" role="img" aria-label="${esc(title)}. ${esc(summary.replace(/<[^>]*>/g, ""))}"></canvas></div>
      ${tableHtml ? `<details class="chart-data"><summary>${esc(tableLabel)}</summary><div class="table-scroll" role="region" tabindex="0" aria-label="${esc(title)}">${tableHtml}</div></details>` : ""}
    </figure>`;
}
