import { esc } from "./dom.js";
import { t, monthNames } from "../i18n/index.js";

/**
 * Month and year, or day, month and year (the Greek order), as dropdowns. Typing a date into a browser's date box
 * is awkward, so this is a small element that looks like a few selects but behaves like one field: it has a `value`
 * ("YYYY-MM" or "YYYY-MM-DD", "" when not chosen), it can be focused, and it fires input and change when a full
 * date has been picked. min and max (same format) limit what can be chosen.
 */
class BpDate extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this._day = this.getAttribute("mode") === "day";
    this._min = this.getAttribute("min") || "";
    this._max = this.getAttribute("max") || "";
    this._label = this.getAttribute("label") || "";
    this.setAttribute("role", "group");
    if (this._label) this.setAttribute("aria-label", this._label);
    const mk = (cls, name) => { const s = document.createElement("select"); s.className = cls; s.setAttribute("aria-label", this._label ? `${this._label}: ${name}` : name); return s; };
    this._selD = this._day ? mk("bp-d", t("date.day")) : null;
    this._selM = mk("bp-m", t("date.month"));
    this._selY = mk("bp-y", t("date.year"));
    if (this._selD) this.append(this._selD);
    this.append(this._selM, this._selY);
    this._value = this._clean(this.getAttribute("value") || "");
    this._fill();
    for (const s of [this._selD, this._selM, this._selY]) if (s) s.addEventListener("change", (e) => { e.stopPropagation(); this._picked(); });
    for (const s of [this._selD, this._selM, this._selY]) if (s) s.addEventListener("input", (e) => e.stopPropagation());
  }

  get value() { return this._value ?? this.getAttribute("value") ?? ""; }
  set value(v) { this._value = this._clean(String(v || "")); if (this._built) this._fill(); }
  focus(o) { const s = this._selD || this._selM; if (s) s.focus(o); }

  /** Splits "YYYY-MM[-DD]" into numbers, or null parts. */
  _parts(v) {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v || "");
    return m ? { y: +m[1], m: +m[2], d: m[3] ? +m[3] : 0 } : null;
  }
  _fmt(y, m, d) { const p = (n) => String(n).padStart(2, "0"); return this._day ? `${y}-${p(m)}-${p(d)}` : `${y}-${p(m)}`; }
  _clean(v) {
    const p = this._parts(v);
    if (!p || (this._day && !p.d)) return "";
    let out = this._fmt(p.y, p.m, this._day ? p.d : 0);
    if (this._min && out < this._min) out = this._min;
    if (this._max && out > this._max) out = this._max;
    return out;
  }

  /** Rebuilds the three lists so that only dates between min and max can be chosen, and shows the current value. */
  _fill(chosen) {
    const cur = chosen || this._parts(this._value) || { y: 0, m: 0, d: 0 };
    const lo = this._parts(this._min), hi = this._parts(this._max);
    const thisYear = new Date().getFullYear();
    const y0 = lo ? lo.y : Math.min(cur.y || thisYear, thisYear) - 10;
    const y1 = hi ? hi.y : Math.max(cur.y || thisYear, lo ? lo.y : thisYear) + 40;
    const opt = (v, text, sel) => `<option value="${v}"${sel ? " selected" : ""}>${esc(String(text))}</option>`;
    const blank = (sel) => opt("", t("date.none"), sel);
    let ys = blank(!cur.y);
    for (let y = y0; y <= y1; y++) ys += opt(y, y, y === cur.y);
    this._selY.innerHTML = ys;
    const names = monthNames();
    const mFrom = lo && cur.y === lo.y ? lo.m : 1, mTo = hi && cur.y === hi.y ? hi.m : 12;
    let ms = blank(!cur.m);
    for (let m = mFrom; m <= mTo; m++) ms += opt(m, names[m - 1], m === cur.m);
    this._selM.innerHTML = ms;
    if (this._selD) {
      const days = cur.y && cur.m ? new Date(cur.y, cur.m, 0).getDate() : 31;
      const dFrom = lo && cur.y === lo.y && cur.m === lo.m ? lo.d : 1, dTo = Math.min(days, hi && cur.y === hi.y && cur.m === hi.m ? hi.d : days);
      let ds = blank(!cur.d);
      for (let d = dFrom; d <= dTo; d++) ds += opt(d, d, d === cur.d);
      this._selD.innerHTML = ds;
    }
  }

  _picked() {
    const y = +this._selY.value, m = +this._selM.value, d = this._selD ? +this._selD.value : 0;
    const before = this._value;
    if (y && m && (!this._selD || d)) {
      const dim = new Date(y, m, 0).getDate();
      this._value = this._clean(this._fmt(y, m, this._selD ? Math.min(d, dim) : 0));
    } else this._value = "";
    this._fill(this._parts(this._value) || { y, m, d });
    if (this._value !== before) {
      this.dispatchEvent(new Event("input", { bubbles: true }));
      this.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
}
if (!customElements.get("bp-date")) customElements.define("bp-date", BpDate);

/** A month + year field: two dropdowns. `value`, `min` and `max` are "YYYY-MM". */
export function monthField({ id, label, value, min, max, hint = "", dataAttrs = "" }) {
  return `<div class="field">
    <span class="label" id="${id}-l">${esc(label)}</span>
    <bp-date id="${id}" mode="month" label="${esc(label)}" value="${esc(value || "")}" ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} ${hint ? `aria-describedby="${id}-hint"` : ""} ${dataAttrs}></bp-date>
    ${hint ? `<span class="hint" id="${id}-hint">${esc(hint)}</span>` : ""}
  </div>`;
}

/** A day + month + year field: three dropdowns in the Greek order. `value`, `min` and `max` are "YYYY-MM-DD". */
export function dayField({ id = "", label, value, min, max, className = "", dataAttrs = "" }) {
  return `<bp-date ${id ? `id="${id}"` : ""} mode="day" class="${className}" label="${esc(label)}" value="${esc(value || "")}" ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} ${dataAttrs}></bp-date>`;
}
