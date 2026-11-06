// Drives the real pages the way a person would: typing, clicking, submitting. Checks what is saved and shown.
import * as store from "../js/store.js";
import * as goals from "../js/pages/goals.js";
import * as house from "../js/pages/house.js";
import * as budget from "../js/pages/budget.js";
import * as overview from "../js/pages/overview.js";
import { buildSample } from "./sample.js";

const results = [];
const stage = document.getElementById("stage");
const test = (name, fn) => {
  try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, msg: (e.stack || e.message).split("\n").slice(0, 3).join(" | ") }); }
};
const is = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, what = "") => { if (a !== b) throw new Error(`${what} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

const now = new Date();
const plus = (n) => { const d = new Date(now.getFullYear(), now.getMonth() + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const $ = (sel) => stage.querySelector(sel);
const $$ = (sel) => [...stage.querySelectorAll(sel)];

function start(variant, page) {
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(buildSample(variant)));
  store.load();
  stage.innerHTML = "";
  return page.render(stage);
}
const type = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); };
const commit = (el, value) => { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
const pick = (el) => { el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
window.confirm = () => true;

/* ---------- Goals ---------- */
test("goals: add a goal, fill it in, see it fit, approve it", () => {
  start("basic", goals);
  $('[data-action="add"]').click();
  eq(store.getState().goals.length, 1, "goal count");
  const id = store.getState().goals[0].id;
  type($(`#g-${id}-name`), "Wedding");
  commit($(`#g-${id}-start`), plus(2));
  commit($(`#g-${id}-target`), plus(14));
  type($(`#g-${id}-amount`), "3600");
  is($(`#result-${id}`).textContent.includes("It fits"), "should fit: " + $(`#result-${id}`).textContent);
  is($(`#result-${id}`).textContent.includes("€300 a month"), "monthly amount is 3600/12 = 300");
  is($(`#result-${id}`).textContent.includes("deposit"), "deposit effect is shown");
  const approve = $(`[data-action="approve"][data-id="${id}"]`);
  is(!approve.disabled, "approve is enabled");
  approve.click();
  const g = store.getState().goals[0];
  eq(g.approved, true, "approved"); eq(g.data.name, "Wedding"); eq(g.data.amount, 3600); eq(g.draft, null);
  is($("article").textContent.includes("Approved"), "approved badge shows");
});
test("goals: a goal that does not fit cannot be approved and offers a way out", () => {
  start("basic", goals);
  $('[data-action="add"]').click();
  const id = store.getState().goals[0].id;
  type($(`#g-${id}-name`), "Yacht");
  commit($(`#g-${id}-start`), plus(1));
  commit($(`#g-${id}-target`), plus(5));
  type($(`#g-${id}-amount`), "40000");
  const text = $(`#result-${id}`).textContent;
  is(text.includes("does not fit"), "must say it does not fit");
  is($(`[data-action="approve"][data-id="${id}"]`).disabled, "approve must be disabled");
  const later = $(`[data-action="use-later"][data-id="${id}"]`);
  is(!!later, "a later target is suggested");
  later.click();
  const d = store.getState().goals[0].draft;
  is(d.target > plus(5), "target moved later: " + d.target);
  is($(`#result-${id}`).textContent.includes("It fits"), "now fits");
});
test("goals: nothing is approved without a name", () => {
  start("basic", goals);
  $('[data-action="add"]').click();
  const id = store.getState().goals[0].id;
  commit($(`#g-${id}-start`), plus(1));
  commit($(`#g-${id}-target`), plus(13));
  type($(`#g-${id}-amount`), "1200");
  is($(`[data-action="approve"][data-id="${id}"]`).disabled, "approve disabled without a name");
});
test("goals: own monthly amount shows the reach date", () => {
  start("basic", goals);
  $('[data-action="add"]').click();
  const id = store.getState().goals[0].id;
  type($(`#g-${id}-name`), "Laptop");
  commit($(`#g-${id}-start`), plus(1));
  type($(`#g-${id}-amount`), "1000");
  pick($(`input[name="mode-${id}"][value="custom"]`));
  type($(`#g-${id}-monthly`), "250");
  const text = $(`#result-${id}`).textContent;
  is(/reaches the goal in/.test(text), "reach date shown: " + text);
  is(text.includes("4 months"), "1000 / 250 = 4 months");
});
test("goals: editing an approved goal keeps the old version until approved again", () => {
  start("full", goals);
  const before = store.getState().goals.find((g) => g.id === "car").data.amount;
  $('[data-action="edit"][data-id="car"]').click();
  type($("#g-car-amount"), "999999");
  eq(store.getState().goals.find((g) => g.id === "car").data.amount, before, "committed amount untouched while editing");
  is($('[data-action="approve"][data-id="car"]').disabled, "too big, cannot approve");
  $('[data-action="cancel-edit"][data-id="car"]').click();
  eq(store.getState().goals.find((g) => g.id === "car").draft, null, "draft dropped");
});
test("goals: removing a goal takes it away", () => {
  start("full", goals);
  const n = store.getState().goals.length;
  $('[data-action="remove"][data-id="wed"]').click();
  eq(store.getState().goals.length, n - 1);
});
test("budget: an approved goal appears as a line and lowers free money", () => {
  const st = buildSample("full");
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st));
  store.load();
  // Open the month the Dream Car runs in, using the page's month picker.
  stage.innerHTML = "";
  budget.render(stage);
  const input = $("#month-input");
  const freeBefore = $("#free-card .stat-value").textContent;
  commit(input, plus(5));
  is($("#goals-card").textContent.includes("Dream Car"), "goal line shows in a month it runs");
  is($("#goals-card").textContent.includes("€300"), "with its monthly amount");
  is($("#free-card").textContent.includes("Goals"), "free money shows the goals term");
  commit($("#month-input"), plus(0));
  eq($("#free-card .stat-value").textContent, freeBefore, "free money back to normal before the goal starts");
});

/* ---------- House Planner ---------- */
test("house: add a salary step and a cost step", () => {
  start("basic", house);
  type($("#ss-amount"), "2500");
  commit($("#ss-from"), plus(24));
  submit($("#salary-step-form"));
  eq(store.getState().house.salarySteps.length, 1); eq(store.getState().house.salarySteps[0].amount, 2500);
  is($("#future-h").closest("section").textContent.includes("€2,500"), "listed");
  commit($("#cs-cat"), "groceries");
  type($("#cs-amount"), "450");
  commit($("#cs-from"), plus(30));
  submit($("#cost-step-form"));
  eq(store.getState().house.costSteps.length, 1); eq(store.getState().house.costSteps[0].catId, "groceries");
});
test("house: a salary step must be above zero and not before the plan", () => {
  start("basic", house);
  type($("#ss-amount"), "0");
  commit($("#ss-from"), plus(5));
  submit($("#salary-step-form"));
  eq(store.getState().house.salarySteps.length, 0, "rejected");
  is($("#ss-error").textContent.length > 0, "error message shown");
});
test("house: add an unemployment event and see the installment check flag it", () => {
  start("basic", house);
  type($("#ev-name"), "Unemployed");
  commit($("#ev-start"), plus(70));
  commit($("#ev-end"), plus(74));
  type($("#ev-salary"), "0");
  type($("#ev-cost-groceries"), "250");
  submit($("#event-form"));
  const ev = store.getState().house.events;
  eq(ev.length, 1); eq(ev[0].salary, 0); eq(ev[0].name, "Unemployed"); eq(ev[0].costs.groceries, 250);
  is($("#res-future").textContent.includes("cannot be covered"), "check flags the months: " + $("#res-future").textContent);
  $('[data-action="rm-event"]').click();
  eq(store.getState().house.events.length, 0);
});
test("house: an event needs a name and at least one change", () => {
  start("basic", house);
  commit($("#ev-start"), plus(10));
  submit($("#event-form"));
  eq(store.getState().house.events.length, 0, "no name");
  type($("#ev-name"), "Nothing happens");
  submit($("#event-form"));
  eq(store.getState().house.events.length, 0, "no change");
  is($("#ev-error").textContent.length > 0, "error shown");
  // A salary change alone is not enough: cost changes are required.
  type($("#ev-salary"), "0");
  submit($("#event-form"));
  eq(store.getState().house.events.length, 0, "salary alone is refused");
  is($("#ev-error").textContent.includes("Cost changes are required"), "error says cost changes are required");
});
test("house: the cost changes box is marked as required", () => {
  start("basic", house);
  const box = $(".required-box");
  is(!!box, "the cost changes box exists and is styled as required");
  is(box.querySelector("legend").textContent.includes("Required"), "it says Required");
  is(box.querySelector("legend strong"), "the heading is bold");
  is(!box.closest("details"), "it is not tucked away in a collapsed panel");
  is(!/optional/i.test(box.textContent), "nothing in it calls the costs optional");
});
test("house: the event form shows current expenses, per category, and the free money", () => {
  start("basic", house);
  const text = $("#ev-costs").textContent;
  for (const w of ["Rent / mortgage", "Groceries", "Utilities & bills", "Total expenses"]) is(text.includes(w), "table lists " + w);
  is(text.includes("€600") && text.includes("€300"), "current rent and groceries amounts shown");
  const sum = $("#ev-summary").textContent;
  is(sum.includes("a month free"), "free money shown: " + sum);
  is(sum.includes("how much you can add to spending"), "explains it is the room to increase spending");
});
test("house: typing cost changes shows the change per category and what is left", () => {
  start("basic", house);
  type($("#ev-cost-groceries"), "400");
  is($("#ev-diff-groceries").textContent.includes("+€100"), "groceries +100: " + $("#ev-diff-groceries").textContent);
  is($("#ev-diff-total").textContent.includes("+€100"), "total +100");
  is($("#ev-summary").textContent.includes("still have"), "within free money");
  type($("#ev-cost-groceries"), "5000");
  is($("#ev-summary").textContent.includes("short by"), "too much spending is flagged: " + $("#ev-summary").textContent);
  type($("#ev-cost-groceries"), "300");
  is($("#ev-diff-groceries").textContent.includes("no change"), "same amount is no change");
});
test("house: a higher event salary adds to the room, a lower one takes from it", () => {
  start("basic", house);
  type($("#ev-cost-groceries"), "300");
  type($("#ev-salary"), "1000");
  is($("#ev-summary").textContent.includes("short by"), "a salary drop with unchanged costs leaves the budget short");
  type($("#ev-salary"), "3000");
  is($("#ev-summary").textContent.includes("still have"), "a raise leaves room");
});
test("house: choosing another start month refreshes the current expenses and keeps what was typed", () => {
  start("basic", house);
  // A cost step already raises groceries from this month on.
  type($("#cs-amount"), "450"); commit($("#cs-cat"), "groceries"); commit($("#cs-from"), plus(10)); submit($("#cost-step-form"));
  is($("#ev-costs").textContent.includes("€300"), "before the step groceries are 300");
  type($("#ev-cost-utilities"), "200");
  commit($("#ev-start"), plus(12));
  is($("#ev-costs").textContent.includes("€450"), "after the step groceries are 450: " + $("#ev-costs").textContent.slice(0, 200));
  eq($("#ev-cost-utilities").value, "200", "typed value kept");
});
test("house: an event with cost changes is saved with them", () => {
  start("basic", house);
  type($("#ev-name"), "Family starts");
  commit($("#ev-start"), plus(30));
  type($("#ev-cost-groceries"), "500");
  type($("#ev-cost-utilities"), "170");
  submit($("#event-form"));
  const ev = store.getState().house.events[0];
  eq(ev.name, "Family starts"); eq(ev.costs.groceries, 500); eq(ev.costs.utilities, 170);
});

/* ---- age and the view until 65 ---- */
test("house: the age can be entered, is saved, and can be cleared", () => {
  start("basic", house);
  eq(store.getState().house.age, null);
  type($("#f-age"), "31");
  eq(store.getState().house.age, 31);
  type($("#f-age"), "");
  eq(store.getState().house.age, null, "cleared");
  type($("#f-age"), "70");
  eq(store.getState().house.age, null, "70 is refused");
  eq($("#f-age").getAttribute("aria-invalid"), "true");
});
test("overview: without an age it asks for one; with an age it runs until 65 and shows net worth", () => {
  start("basic", overview);
  is($("main, div").textContent.includes("Add your age"), "asks for the age");
  const rowsWithout = $$(".data-table tbody tr").length;
  const st = buildSample("basic"); st.house.age = 30;
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)); store.load();
  stage.innerHTML = ""; overview.render(stage);
  const rowsWith = $$(".data-table tbody tr").length;
  is(rowsWith > rowsWithout + 10, `many more years with an age: ${rowsWithout} -> ${rowsWith}`);
  const lastYear = Number($(".data-table tbody tr:last-child th").textContent.slice(0, 4));
  eq(lastYear, new Date().getFullYear() + 35, "last row is the year the user turns 65");
  is($(".data-table thead").textContent.includes("Net worth"), "net worth column");
  is($(".data-table thead").textContent.includes("Home"), "home column");
  is(stage.textContent.includes("Net worth at 65"), "net worth at 65 shown");
  is(!stage.textContent.includes("Add your age in the House Planner"), "the hint is gone once the age is known");
});
test("house: editing the price changes the cash needed and the deposit date", () => {
  start("basic", house);
  const before = $("#res-a").textContent;
  type($("#f-amount"), "250000");
  eq(store.getState().house.amount, 250000);
  const after = $("#res-a").textContent;
  is(before !== after, "results changed");
  is(after.includes("€250,000"), "new price shown");
});
test("house: a value out of range is refused and flagged", () => {
  start("basic", house);
  type($("#f-ltvPct"), "500");
  eq(store.getState().house.ltvPct, 80, "unchanged");
  eq($("#f-ltvPct").getAttribute("aria-invalid"), "true");
  commit($("#f-ltvPct"), "");
  eq($("#f-ltvPct").value, "80", "restored on leaving the field");
});
test("house: choosing the loan amount instead of the price works backwards", () => {
  start("basic", house);
  pick($('input[name="r-mode"][value="loan"]'));
  eq(store.getState().house.mode, "loan");
  type($("#f-amount"), "120000");
  is($("#res-a").textContent.includes("€150,000"), "price worked out as 120000 / 0.8");
});
test("house: switching to a mixed loan shows the extra fields", () => {
  start("basic", house);
  pick($('input[name="r-loan.type"][value="mixed"]'));
  is(!!$("#f-loan-fixedYears") && !!$("#f-loan-variableRate"), "fixed years and variable rate fields appear");
  is(!$("#f-loan-rate"), "single rate field gone");
  is($("#res-b").textContent.includes("after the fixed period"), "later installment shown");
});
test("house: support income switches on and only one type shows at a time", () => {
  start("basic", house);
  is(!$("#f-support-rent"), "hidden while off");
  const box = $("#support-on");
  box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true }));
  is(!!$("#f-support-rent"), "room fields appear");
  pick($('input[name="r-support.type"][value="partner"]'));
  is(!!$("#f-support-partnerAmount") && !$("#f-support-rent"), "partner fields replace room fields");
});
test("house: room rent brings the debt-free date forward", () => {
  start("basic", house);
  const text = () => $("#res-c").textContent.match(/You are debt-free in\s*([A-Za-z]+ \d{4})/)?.[1];
  const without = text();
  const box = $("#support-on"); box.checked = true; box.dispatchEvent(new Event("change", { bubbles: true }));
  const withRent = text();
  is(without && withRent && withRent !== without, `date should change: ${without} -> ${withRent}`);
});
test("house: today's euros toggle changes the figures", () => {
  start("basic", house);
  const before = $("#res-c").textContent;
  $('[data-action="units"][data-value="today"]').click();
  eq(store.getState().house.units, "today");
  is($("#res-c").textContent !== before, "figures changed");
  eq($('[data-action="units"][data-value="today"]').getAttribute("aria-pressed"), "true");
});
test("house: the loan can be set to the bank's 35% limit", () => {
  start("basic", house);
  type($("#f-amount"), "300000"); // far above what 2000 a month supports
  const btn = $('[data-action="set-loan"]');
  is(!!btn, "button offered when the loan is above the limit");
  btn.click();
  eq(store.getState().house.mode, "loan");
  is(store.getState().house.amount < 300000 * 0.8, "loan lowered");
});

/* ---------- Overview and saved data ---------- */
test("overview: the units toggle is shared and the table follows it", () => {
  start("full", overview);
  const first = $(".data-table tbody tr:last-child td:nth-child(6)").textContent;
  $('[data-units="today"]').click();
  eq(store.getState().house.units, "today");
  const second = $(".data-table tbody tr:last-child td:nth-child(6)").textContent;
  is(first !== second, "numbers changed to today's euros");
});
test("changes are saved to localStorage and survive a reload", () => {
  start("basic", house);
  type($("#f-amount"), "180000");
  const raw = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
  eq(raw.house.amount, 180000);
  store.load();
  eq(store.getState().house.amount, 180000);
});
test("removing a category also removes cost steps and event costs that point at it", () => {
  const st = buildSample("full");
  st.categories.push({ id: "cx1", name: "Pets", icon: "paw-print", builtin: false });
  st.house.costSteps.push({ id: "cs9", from: plus(10), catId: "cx1", amount: 50 });
  st.house.events[0].costs.cx1 = 20;
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st));
  store.load();
  stage.innerHTML = "";
  budget.render(stage);
  $('[data-action="remove-cat"][data-id="cx1"]').click();
  const h = store.getState().house;
  is(!h.costSteps.some((x) => x.catId === "cx1"), "cost step removed");
  is(!("cx1" in h.events[0].costs), "event cost removed");
});

const failed = results.filter((r) => !r.ok);
document.getElementById("out").innerHTML =
  `<strong class="${failed.length ? "fail" : "pass"}">${results.length - failed.length}/${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}</strong>\n\n` +
  results.map((r) => `<span class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</span> ${r.name}${r.ok ? "" : "\n      → " + String(r.msg).replace(/</g, "&lt;")}`).join("\n");
