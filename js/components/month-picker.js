import { esc } from "./dom.js";

/** A month + year field. Browsers without <input type="month"> get a YYYY-MM text box instead. */
export function monthField({ id, label, value, min, max, hint = "", dataAttrs = "" }) {
  return `<div class="field">
    <label for="${id}">${esc(label)}</label>
    <input type="month" id="${id}" value="${esc(value || "")}" ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} pattern="\\d{4}-\\d{2}" placeholder="YYYY-MM" ${hint ? `aria-describedby="${id}-hint"` : ""} ${dataAttrs}>
    ${hint ? `<span class="hint" id="${id}-hint">${esc(hint)}</span>` : ""}
  </div>`;
}
