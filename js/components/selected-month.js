// The month being viewed. Shared by the Budget Plan and the Monthly Tracker, so moving between them keeps the month.
import { addMonths, monthKey } from "../calc/budget.js";

export const PLAN_MONTHS = 360; // the month picker covers 30 years from the start month
let selected = null;

export const getSelected = () => selected;
export const setSelected = (k) => { selected = k; };
export const currentMonth = () => { const d = new Date(); return monthKey(d.getFullYear(), d.getMonth() + 1); };
export const endMonth = (st) => addMonths(st.settings.startMonth, PLAN_MONTHS - 1);
export const clampMonth = (st, k) => { const a = st.settings.startMonth, b = endMonth(st); return k < a ? a : k > b ? b : k; };
