// Drives the real pages the way a person would: typing, clicking, submitting. Checks what is saved and shown.
import * as store from "../js/store.js";
import * as goals from "../js/pages/goals.js";
import * as house from "../js/pages/house.js";
import * as budget from "../js/pages/budget.js";
import * as tracker from "../js/pages/tracker.js";
import { setSelected } from "../js/components/selected-month.js";
import * as overview from "../js/pages/overview.js";
import { buildSample } from "./sample.js";
import { addMonths } from "../js/calc/budget.js";
import { inputFromState, project } from "../js/calc/projection.js";

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
  setSelected(null); // every test opens on the current month
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
const addSel = (kind) => `[data-action="open-form"][data-form="${kind}"]`;
const openForm = (kind) => $(addSel(kind)).click(); // the fields only appear once the add button is pressed

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
test("goals: a goal that fits the budget but would overspend once the installment starts cannot be approved", () => {
  start("basic", goals);
  $('[data-action="add"]').click();
  const id = store.getState().goals[0].id;
  type($(`#g-${id}-name`), "Long project");
  commit($(`#g-${id}-start`), plus(70)); commit($(`#g-${id}-target`), plus(82)); type($(`#g-${id}-amount`), "7200"); // 600 a month: fits 700 free, not the 440 left after the installment
  const text = $(`#result-${id}`).textContent;
  is(text.includes("overspend") && text.includes("short by up to"), "explains the overspending: " + text);
  is($(`[data-action="approve"][data-id="${id}"]`).disabled, "approve is disabled");
  type($(`#g-${id}-amount`), "3600"); // 300 a month fits
  is(!$(`[data-action="approve"][data-id="${id}"]`).disabled, "a smaller goal can be approved");
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

test("budget: from the month the loan starts, rent is 0 and the installment and home costs appear instead", () => {
  const st = buildSample("basic");
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)); store.load();
  const purchase = project(inputFromState(store.getState(), plus(0))).purchase;
  stage.innerHTML = ""; budget.render(stage);
  is(!$("#home-card"), "no home card before the house is bought");
  eq($("#planned-rent").value, "600"); is(!$("#planned-rent").disabled, "rent can be edited");
  eq($("#free-card .stat-value").textContent, "€700", "free money before: 2000 - 1300");
  commit($("#month-input"), addMonths(purchase, -1));
  eq($("#planned-rent").value, "600", "the month before the first installment still has rent");
  commit($("#month-input"), purchase);
  is(!!$("#home-card"), "home card appears in the first month of the loan");
  eq($("#planned-rent").value, "0", "rent is 0");
  is($("#planned-rent").disabled, "rent field is locked");
  const card = $("#home-card").textContent;
  is(card.includes("Loan installment") && card.includes("€739.88") && card.includes("€120"), "installment and running costs listed: " + card);
  is($("#expenses-card").textContent.includes("Rent counts as €0"), "explains why rent is 0");
  is(/€44\d/.test($("#free-card .stat-value").textContent), "free money is 2000 - 700 - 120 - 740: " + $("#free-card .stat-value").textContent);
  eq($("#total-planned").textContent, "€700", "the planned total leaves rent out");
  is($("#free-card").textContent.includes("Home"), "free money shows the home term");
  commit($("#month-input"), plus(300)); // long after the loan has ended
  is($("#home-card").textContent.includes("fully repaid") && !$("#home-card").textContent.includes("Loan installment"), "after the loan only the running costs remain");
  eq($("#free-card .stat-value").textContent, "€1,180", "2000 - 700 - 120");
  commit($("#month-input"), plus(0));
  eq($("#planned-rent").value, "600", "back before the purchase, rent is back"); is(!$("#home-card"));
});
test("budget: without a house price nothing changes about rent", () => {
  const st = buildSample("empty");
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)); store.load();
  stage.innerHTML = ""; budget.render(stage);
  commit($("#month-input"), plus(60));
  is(!$("#home-card") && !$("#planned-rent").disabled, "rent stays until a house is planned");
});
test("budget: an over-budget month tells the user how much to cut", () => {
  const st = buildSample("basic"); st.months[Object.keys(st.months)[0]].planned.rent = 1900; // 2,600 of spending on 2,000
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)); store.load();
  stage.innerHTML = ""; budget.render(stage);
  const card = $("#free-card").textContent;
  is(card.includes("over budget") && /Cut at least €6\d\d a month/.test(card), "says how much to cut: " + card.slice(0, 300));
  is(card.includes("eating out") && card.includes("subscriptions"), "points to flexible categories");
});

/* ---- the Monthly Budget follows the whole plan (the bug: planner said fine, budget showed a shortfall) ---- */
const loadBudget = (st) => { localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)); store.load(); stage.innerHTML = ""; budget.render(stage); };
const money = (el) => Number(el.textContent.replace(/[^0-9.\u2212-]/g, "").replace("\u2212", "-"));

test("budget: an expected raise from the House Planner shows in the budget, so the budget and the planner agree", () => {
  const st = buildSample("basic"); st.house.salarySteps = [{ id: "s1", from: plus(10), amount: 2500 }];
  loadBudget(st);
  commit($("#month-input"), plus(0)); // the page remembers the last month viewed
  eq($("#salary-card .stat-value").textContent, "€2,000", "before the raise");
  commit($("#month-input"), plus(12));
  eq($("#salary-card .stat-value").textContent, "€2,500", "after the raise");
  is($("#salary-card").textContent.includes("raise you expected in the House Planner"), "says where the salary comes from");
  eq($("#free-card .stat-value").textContent, "€1,200", "2500 - 1300");
});
test("budget: the exact situation from the bug report no longer contradicts the planner", () => {
  const st = buildSample("basic"); st.house.amount = 300000; st.house.salarySteps = [{ id: "s1", from: plus(24), amount: 3200 }];
  const r = project(inputFromState(buildSample("basic") && (localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)), store.load(), store.getState()), plus(0)));
  eq(r.feasible, true, "the planner says every month is covered");
  budget.render((stage.innerHTML = "", stage));
  for (const k of [plus(30), plus(60), plus(120), plus(200)]) {
    commit($("#month-input"), k);
    is(!$("#free-card").textContent.includes("over budget"), "no shortfall shown in " + k + ": " + $("#free-card .stat-value").textContent);
  }
});
test("budget: a cost step shows in later months; one that starts this month is locked and says why", () => {
  const st = buildSample("basic"); st.house.costSteps = [{ id: "c1", from: plus(10), catId: "groceries", amount: 450 }];
  loadBudget(st);
  commit($("#month-input"), plus(5));
  eq($("#planned-groceries").value, "300"); is(!$("#planned-groceries").disabled, "editable before the step");
  commit($("#month-input"), plus(10));
  eq($("#planned-groceries").value, "450"); is($("#planned-groceries").disabled, "locked in the month the step starts");
  is($("#expenses-card").textContent.includes("cost step"), "the cell explains where 450 comes from");
  commit($("#month-input"), plus(12));
  eq($("#planned-groceries").value, "450", "carried on"); is(!$("#planned-groceries").disabled, "a later month can be edited (it then overrides the step)");
  eq($("#free-card .stat-value").textContent, "€550", "2000 - (1300 + 150)");
});
test("budget: a life event's costs are shown and locked while it lasts, then normal again", () => {
  const st = buildSample("basic");
  st.house.events = [{ id: "e1", name: "Family starts", start: plus(20), end: plus(24), salary: null, costs: { groceries: 500 } }];
  loadBudget(st);
  commit($("#month-input"), plus(21));
  eq($("#planned-groceries").value, "500"); is($("#planned-groceries").disabled, "locked during the event");
  is($("#expenses-card").textContent.includes("Family starts"), "names the event");
  commit($("#month-input"), plus(25));
  eq($("#planned-groceries").value, "300"); is(!$("#planned-groceries").disabled, "back to normal after the event");
});
test("budget: a car replaces transport once it is bought; before that transport is still paid", () => {
  const st = buildSample("basic");
  st.goals = [{ id: "car", approved: true, draft: null, data: { name: "Dream Car", start: plus(1), target: plus(13), amount: 2400, mode: "auto", monthly: null, ongoing: 90, paybackAmount: 0, paybackTo: "deposit", replaces: "transport" } }];
  loadBudget(st);
  commit($("#month-input"), plus(6));
  eq($("#planned-transport").value, "80"); is(!$("#planned-transport").disabled, "transport still paid while saving for the car");
  commit($("#month-input"), plus(13));
  eq($("#planned-transport").value, "0", "transport is 0 from the month the car is bought"); is($("#planned-transport").disabled, "locked");
  is($("#expenses-card").textContent.includes("Dream Car") && $("#expenses-card").textContent.includes("replaces it"), "explains it");
  is($("#goals-card").textContent.includes("€90"), "the car's running costs are paid instead");
  eq($("#free-card .stat-value").textContent, "€690", "2000 - (1300 - 80 transport) - 90 running costs");
});
test("budget: a custom category replaced by a goal is cleaned up when the category is removed", () => {
  const st = buildSample("basic");
  st.categories.push({ id: "cx9", name: "Taxi", icon: "car", builtin: false });
  st.goals = [{ id: "car", approved: true, draft: null, data: { name: "Car", start: plus(1), target: plus(13), amount: 2400, mode: "auto", monthly: null, ongoing: 0, paybackAmount: 0, paybackTo: "deposit", replaces: "cx9" } }];
  loadBudget(st);
  $('[data-action="remove-cat"][data-id="cx9"]').click();
  eq(store.getState().goals[0].data.replaces, null);
});
test("budget: the free money on screen matches the House Planner in every month of a full plan", () => {
  const st = buildSample("full");
  loadBudget(st);
  const inp = inputFromState(store.getState(), plus(0));
  const r = project(inp);
  is(r.rows.length > 120, "a long plan");
  let checked = 0;
  for (let i = 0; i < r.rows.length; i += 4) {
    const row = r.rows[i];
    if (row.key > addMonths(buildSample("full").settings.startMonth, 359)) break; // the month picker's range
    if ((store.getState().months[row.key]?.items || []).length) continue; // real spending logged in a month is counted by the planner but not by the plan page
    commit($("#month-input"), row.key);
    const shown = money($("#free-card .stat-value"));
    if (Math.abs(shown - row.leftover) > 0.011) throw new Error(`${row.key}: budget page shows ${shown}, planner has ${row.leftover.toFixed(2)}`);
    checked++;
  }
  is(checked > 60, "checked many months: " + checked);
});

/* ---------- Goals: the "replaces" choice ---------- */
test("goals: a goal can replace an expense, and the choice is saved and shown", () => {
  start("basic", goals);
  $('[data-action="add"]').click();
  const id = store.getState().goals[0].id;
  type($(`#g-${id}-name`), "Dream Car");
  commit($(`#g-${id}-start`), plus(2)); commit($(`#g-${id}-target`), plus(14)); type($(`#g-${id}-amount`), "2400"); type($(`#g-${id}-ongoing`), "90");
  const select = $(`#g-${id}-replaces`);
  is(!!select && select.querySelector('option[value="transport"]'), "the form offers the categories");
  is(select.closest(".field").textContent.includes("For a car, choose Transport"), "the hint explains the car case");
  commit(select, "transport");
  eq(store.getState().goals[0].draft.replaces, "transport", "saved in the draft");
  $(`[data-action="approve"][data-id="${id}"]`).click();
  eq(store.getState().goals[0].data.replaces, "transport");
  is($("article").textContent.includes("Replaces") && $("article").textContent.includes("Transport counts as €0"), "the approved goal says what it replaces");
});

/* ---------- House Planner ---------- */
test("house: add a salary step and a cost step", () => {
  start("basic", house);
  openForm("salary");
  type($("#ss-amount"), "2500");
  commit($("#ss-from"), plus(24));
  submit($("#salary-step-form"));
  eq(store.getState().house.salarySteps.length, 1); eq(store.getState().house.salarySteps[0].amount, 2500);
  is($("#future-h").closest("section").textContent.includes("€2,500"), "listed");
  openForm("cost");
  commit($("#cs-cat"), "groceries");
  type($("#cs-amount"), "450");
  commit($("#cs-from"), plus(30));
  submit($("#cost-step-form"));
  eq(store.getState().house.costSteps.length, 1); eq(store.getState().house.costSteps[0].catId, "groceries");
});
test("house: a salary step must be above zero and not before the plan", () => {
  start("basic", house);
  openForm("salary");
  type($("#ss-amount"), "0");
  commit($("#ss-from"), plus(5));
  submit($("#salary-step-form"));
  eq(store.getState().house.salarySteps.length, 0, "rejected");
  is($("#ss-error").textContent.length > 0, "error message shown");
});
test("house: an event that would overspend is refused and tells the user to cut expenses", () => {
  start("basic", house);
  openForm("event");
  type($("#ev-name"), "Unemployed"); commit($("#ev-start"), plus(70)); commit($("#ev-end"), plus(74));
  type($("#ev-salary"), "0"); type($("#ev-cost-groceries"), "250");
  submit($("#event-form"));
  eq(store.getState().house.events.length, 0, "not saved");
  const err = $("#ev-error").textContent;
  is(err.includes("cannot overspend") && /short by up to €\d/.test(err), "message with the amount: " + err);
  is(!!$("#event-form"), "the form stays open so the amounts can be cut");
});
test("house: the same kind of event is accepted once expenses are cut enough", () => {
  start("basic", house);
  openForm("event");
  type($("#ev-name"), "Reduced hours"); commit($("#ev-start"), plus(70)); commit($("#ev-end"), plus(74));
  type($("#ev-salary"), "1500");
  for (const c of ["eating", "leisure", "subscriptions", "other"]) type($(`#ev-cost-${c}`), "0");
  submit($("#event-form"));
  eq(store.getState().house.events.length, 1);
  is(!$("#res-future").textContent.includes("cannot be covered"), "the installment check is clean");
  $('[data-action="rm-event"]').click();
  eq(store.getState().house.events.length, 0);
});
test("house: a cost step or a salary step that would overspend is refused", () => {
  start("basic", house);
  openForm("cost"); commit($("#cs-cat"), "groceries"); commit($("#cs-from"), plus(12)); type($("#cs-amount"), "5000");
  $("#cost-step-form").requestSubmit();
  eq(store.getState().house.costSteps.length, 0); is($("#cs-error").textContent.includes("cannot overspend"), "cost step refused");
  openForm("salary"); commit($("#ss-from"), plus(12)); type($("#ss-amount"), "900");
  $("#salary-step-form").requestSubmit();
  eq(store.getState().house.salarySteps.length, 0); is($("#ss-error").textContent.includes("cannot overspend"), "a salary below expenses is refused");
});
test("house: a plan that already overspends shows the red box with what to cut, and hides the dates", () => {
  start("short", house);
  const box = $("#res-overspend");
  is(box.textContent.includes("Your plan overspends"), "red box shown");
  is(/Cut at least €\d/.test(box.textContent), "says how much to cut");
  is(box.textContent.includes("essential") || box.textContent.includes("flexible"), "lists categories");
  is(!$("#res-c").textContent.includes("You are debt-free in"), "no debt-free date while overspending");
  is($("#res-c").textContent.includes("overspends"), "says why");
  is($("#res-b").textContent.includes("cannot afford this installment"), "the installment is called unaffordable");
  is($("#res-a").textContent.includes("Deposit ready in"), "the deposit date is still valid (only the installment overspends)");
});
test("house: fixing the overspending (a smaller house) brings the results back", () => {
  start("short", house);
  type($("#f-amount"), "150000");
  eq($("#res-overspend").textContent.trim(), "", "red box gone");
  is($("#res-c").textContent.includes("You are debt-free in"), "debt-free date is back");
});
test("house: an event needs a name and at least one change", () => {
  start("basic", house);
  openForm("event");
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
  openForm("event");
  const box = $(".required-box");
  is(!!box, "the cost changes box exists and is styled as required");
  is(box.querySelector("legend").textContent.includes("Required"), "it says Required");
  is(box.querySelector("legend strong"), "the heading is bold");
  is(!box.closest("details"), "it is not tucked away in a collapsed panel");
  is(!/optional/i.test(box.textContent), "nothing in it calls the costs optional");
});
test("house: the event form shows current expenses, per category, and the free money", () => {
  start("basic", house);
  openForm("event");
  const text = $("#ev-costs").textContent;
  for (const w of ["Rent / mortgage", "Groceries", "Utilities & bills", "Total expenses"]) is(text.includes(w), "table lists " + w);
  is(text.includes("€600") && text.includes("€300"), "current rent and groceries amounts shown");
  const sum = $("#ev-summary").textContent;
  is(sum.includes("a month free"), "free money shown: " + sum);
  is(sum.includes("how much you can add to spending"), "explains it is the room to increase spending");
});
test("house: typing cost changes shows the change per category and what is left", () => {
  start("basic", house);
  openForm("event");
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
  openForm("event");
  type($("#ev-cost-groceries"), "300");
  type($("#ev-salary"), "1000");
  is($("#ev-summary").textContent.includes("short by"), "a salary drop with unchanged costs leaves the budget short");
  type($("#ev-salary"), "3000");
  is($("#ev-summary").textContent.includes("still have"), "a raise leaves room");
});
test("house: choosing another start month refreshes the current expenses and keeps what was typed", () => {
  start("basic", house);
  // A cost step already raises groceries from this month on.
  openForm("cost");
  type($("#cs-amount"), "450"); commit($("#cs-cat"), "groceries"); commit($("#cs-from"), plus(10)); submit($("#cost-step-form"));
  openForm("event");
  is($("#ev-costs").textContent.includes("€300"), "before the step groceries are 300");
  type($("#ev-cost-utilities"), "200");
  commit($("#ev-start"), plus(12));
  is($("#ev-costs").textContent.includes("€450"), "after the step groceries are 450: " + $("#ev-costs").textContent.slice(0, 200));
  eq($("#ev-cost-utilities").value, "200", "typed value kept");
});
test("house: an event with cost changes is saved with them", () => {
  start("basic", house);
  openForm("event");
  type($("#ev-name"), "Family starts");
  commit($("#ev-start"), plus(30));
  type($("#ev-cost-groceries"), "500");
  type($("#ev-cost-utilities"), "170");
  submit($("#event-form"));
  const ev = store.getState().house.events[0];
  eq(ev.name, "Family starts"); eq(ev.costs.groceries, 500); eq(ev.costs.utilities, 170);
});

/* ---- the add buttons: fields appear on demand, saving closes them ---- */
test("house: salary steps, cost steps and life events start as just an add button", () => {
  start("basic", house);
  for (const id of ["#ss-from", "#ss-amount", "#cs-from", "#cs-amount", "#ev-name", "#ev-start", ".required-box"]) is(!$(id), id + " must not show before its button is pressed");
  for (const k of ["salary", "cost", "event"]) is(!!$(addSel(k)), k + " add button is there");
});
test("house: Add salary step opens the fields; saving closes them and leaves the button below the saved step", () => {
  start("basic", house);
  openForm("salary");
  is(!!$("#ss-from") && !!$("#ss-amount"), "fields open");
  is(!$(addSel("salary")), "the button is replaced by the open form");
  eq(document.activeElement.id, "ss-from", "focus goes to the first field");
  const form = $("#salary-step-form");
  is(!!form.querySelector('button[type="submit"]'), "the form has a submit button, so Enter in a field saves it");
  commit($("#ss-from"), plus(24));
  type($("#ss-amount"), "2600");
  form.requestSubmit(); // what pressing Enter in a field does
  eq(store.getState().house.salarySteps.length, 1);
  is(!$("#salary-step-form"), "the fields close after saving");
  const list = $("#future-h").closest("section").querySelector(".simple-list");
  is(list && list.textContent.includes("€2,600"), "the saved step is listed");
  const button = $(addSel("salary"));
  is(button && (list.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING), "the add button sits below the saved step");
});
test("house: a second salary step opens fresh fields below the first", () => {
  start("basic", house);
  openForm("salary"); commit($("#ss-from"), plus(12)); type($("#ss-amount"), "2300"); $("#salary-step-form").requestSubmit();
  openForm("salary");
  eq($("#ss-amount").value, "", "the amount box starts empty again");
  commit($("#ss-from"), plus(36)); type($("#ss-amount"), "2700"); $("#salary-step-form").requestSubmit();
  eq(store.getState().house.salarySteps.length, 2);
  eq($$(".simple-list")[0].querySelectorAll("li").length, 2, "both steps are listed");
});
test("house: cost steps work the same way", () => {
  start("basic", house);
  openForm("cost");
  commit($("#cs-cat"), "transport"); commit($("#cs-from"), plus(18)); type($("#cs-amount"), "150");
  $("#cost-step-form").requestSubmit();
  eq(store.getState().house.costSteps.length, 1);
  is(!$("#cost-step-form") && !!$(addSel("cost")), "form closed and the button is back");
});
test("house: a saved life event closes the form and the button moves below it", () => {
  start("basic", house);
  openForm("event");
  type($("#ev-name"), "Family starts"); commit($("#ev-start"), plus(30)); type($("#ev-cost-groceries"), "500");
  $("#event-form").requestSubmit();
  eq(store.getState().house.events.length, 1);
  is(!$("#event-form") && !$(".required-box"), "the whole form is gone");
  const section = $("#future-h").closest("section");
  const list = [...section.querySelectorAll(".simple-list")].find((l) => l.textContent.includes("Family starts"));
  const button = $(addSel("event"));
  is(list && button && (list.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING), "the add button sits below the saved event");
});
test("house: an invalid entry keeps the form open with the message", () => {
  start("basic", house);
  openForm("salary");
  type($("#ss-amount"), "");
  $("#salary-step-form").requestSubmit();
  is(!!$("#salary-step-form"), "still open");
  is($("#ss-error").textContent.length > 0, "message shown");
  eq(store.getState().house.salarySteps.length, 0);
});
test("house: Cancel and Escape close an open form without saving", () => {
  start("basic", house);
  openForm("salary"); type($("#ss-amount"), "3000");
  $('[data-action="close-form"]').click();
  is(!$("#salary-step-form") && !!$(addSel("salary")), "closed by Cancel");
  eq(store.getState().house.salarySteps.length, 0, "nothing saved");
  openForm("event");
  $("#ev-name").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  is(!$("#event-form") && !!$(addSel("event")), "closed by Escape");
  eq(store.getState().house.events.length, 0);
});
test("house: only one add form is open at a time", () => {
  start("basic", house);
  openForm("salary");
  openForm("cost");
  is(!$("#salary-step-form") && !!$("#cost-step-form"), "opening another form replaces the first");
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
  is(rowsWith > rowsWithout + 5, `more years with an age: ${rowsWithout} -> ${rowsWith}`);
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

/* ---------- Monthly Tracker ---------- */
const rowsOf = () => $$("tr[data-id]");
const cmp = (id) => $$(".compare tbody tr").find((r) => r.textContent.includes(id));
const firstMonth = () => Object.keys(store.getState().months)[0];
test("tracker: add a purchase with a category, see its icon, and see it in the comparison", () => {
  start("empty", tracker);
  is($("#list-empty"), "an empty month says so");
  eq(rowsOf().length, 0);
  type($("#add-name"), "Tickets to London");
  commit($("#add-cat"), "travel");
  is($("#add-icon").innerHTML.includes("svg"), "the add row shows the category icon");
  type($("#add-amount"), "180");
  submit($("#add-form"));
  const it = store.getState().months[firstMonth()].items[0];
  eq(it.name, "Tickets to London"); eq(it.catId, "travel"); eq(it.amount, 180);
  eq(rowsOf().length, 1, "one row");
  is(rowsOf()[0].querySelector(".cat-icon").innerHTML === $("#add-icon").innerHTML, "the row's icon is the travel icon");
  is(rowsOf()[0].querySelector(".js-cat").value === "travel", "the category is selected in the row");
  eq($("#list-total").textContent, "€180");
  const row = cmp("Travel");
  is(row && row.textContent.includes("no baseline") && row.textContent.includes("€180") && row.textContent.includes("over baseline"), "travel is over a zero baseline: " + (row && row.textContent));
  is($("#add-name").value === "" && $("#add-amount").value === "", "the add row is cleared and ready for the next purchase");
  eq($("#add-cat").value, "travel", "the last category is remembered");
});
test("tracker: an amount is required; nothing is saved without one", () => {
  start("empty", tracker);
  type($("#add-name"), "Mystery");
  submit($("#add-form"));
  is($("#add-error").textContent.length > 0 && $("#add-amount").getAttribute("aria-invalid") === "true", "an error is shown on the amount");
  eq(rowsOf().length, 0);
});
test("tracker: editing a row updates the totals, and the comparison reads the baselines from the Budget Plan", () => {
  start("basic", tracker);
  eq(rowsOf().length, 3, "sample purchases");
  const groceries = rowsOf().find((r) => r.querySelector(".js-name").value === "Supermarket");
  is(cmp("Groceries").textContent.includes("€300") && cmp("Groceries").textContent.includes("€62.40") && cmp("Groceries").textContent.includes("under baseline"), "groceries: 62.40 of a 300 baseline");
  type(groceries.querySelector(".js-amount"), "340");
  is(cmp("Groceries").textContent.includes("+€40") && cmp("Groceries").textContent.includes("over baseline"), "groceries now over by 40: " + cmp("Groceries").textContent);
  eq($("#list-total").textContent, "€555", "340 + 35 + 180");
  commit(groceries.querySelector(".js-cat"), "eating");
  is(groceries.querySelector(".cat-icon").innerHTML.includes("svg"), "the icon follows the category");
  is(cmp("Eating out").textContent.includes("€375"), "eating out now has 340 + 35");
  eq(store.getState().months[firstMonth()].items.find((i) => i.name === "Supermarket").catId, "eating", "saved");
});
test("tracker: deleting a row takes it out of the saved data and the totals", () => {
  start("basic", tracker);
  rowsOf()[0].querySelector('[data-action="remove"]').click();
  eq(rowsOf().length, 2);
  eq(store.getState().months[firstMonth()].items.length, 2);
});
test("tracker: other months have their own list but the same baselines carry forward", () => {
  start("basic", tracker);
  commit($("#month-input"), plus(2));
  eq(rowsOf().length, 0, "nothing logged two months on");
  is($(".compare tbody").textContent.includes("€300"), "the groceries baseline carries forward");
  eq($("#add-date").value, `${plus(2)}-01`, "the add row starts on the first of the month");
  type($("#add-amount"), "25"); submit($("#add-form"));
  eq(rowsOf().length, 1);
  commit($("#month-input"), plus(0));
  eq(rowsOf().length, 3, "back to the first month");
});
test("tracker: a date outside the month is refused", () => {
  start("empty", tracker);
  commit($("#add-date"), `${plus(3)}-10`);
  type($("#add-amount"), "10"); submit($("#add-form"));
  is($("#add-error").textContent.includes("inside"), "date error shown");
  eq(rowsOf().length, 0);
});
test("tracker: dropping a category moves its logged purchases to Other", () => {
  const st = buildSample("empty");
  st.categories.push({ id: "cx1", name: "Pets", icon: "paw-print", builtin: false });
  const k = Object.keys(st.months)[0];
  st.months[k].items = [{ id: "p1", date: null, name: "Food", catId: "cx1", amount: 30 }];
  localStorage.setItem(store.STORAGE_KEY, JSON.stringify(st)); store.load();
  stage.innerHTML = ""; budget.render(stage);
  $('[data-action="remove-cat"][data-id="cx1"]').click();
  eq(store.getState().months[k].items[0].catId, "other", "kept, under Other");
});
test("tracker: without a plan it asks you to set up the Budget Plan first", () => {
  store.eraseAll(); stage.innerHTML = ""; tracker.render(stage);
  is(stage.textContent.includes("set up your Budget Plan first") && !!$('a[href="#/budget"]'), "prompt with a link");
});

const failed = results.filter((r) => !r.ok);
document.getElementById("out").innerHTML =
  `<strong class="${failed.length ? "fail" : "pass"}">${results.length - failed.length}/${results.length} passed${failed.length ? ", " + failed.length + " FAILED" : ""}</strong>\n\n` +
  results.map((r) => `<span class="${r.ok ? "pass" : "fail"}">${r.ok ? "PASS" : "FAIL"}</span> ${r.name}${r.ok ? "" : "\n      → " + String(r.msg).replace(/</g, "&lt;")}`).join("\n");
