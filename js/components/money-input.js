import { esc } from "./dom.js";

/** A number field for euro amounts. Pass a visible label (`label`) or an `ariaLabel` for table cells. */
export function moneyInput({ id, value, label = "", ariaLabel = "", className = "", dataAttrs = "", required = false, min = 0, placeholder = "0" }) {
  const v = value === null || value === undefined || value === "" ? "" : String(value);
  const lab = label ? `<label for="${id}">${esc(label)}</label>` : "";
  const aria = ariaLabel ? ` aria-label="${esc(ariaLabel)}"` : "";
  return `${lab}<input type="number" id="${id}" inputmode="decimal" min="${min}" step="0.01" value="${esc(v)}" placeholder="${placeholder}"${aria}${required ? " required" : ""}${className ? ` class="${className}"` : ""} ${dataAttrs}>`;
}
