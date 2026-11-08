import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as bookingsRequest } from "../functions/api/doctor/bookings.js";
import { onRequest as accountsRequest } from "../functions/api/doctor/accounts.js";
import { onRequestPost as custodyRequest } from "../functions/api/doctor/custody.js";

const DOCTOR_UID = "8fUdGutQHRau3RXQIrRtZUqQ9Nm1";
let currentUid = "";
let rejectToken = false;

globalThis.fetch = async (url, options = {}) => {
  if (String(url).includes("identitytoolkit.googleapis.com")) {
    if (rejectToken) return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ users: [{ localId: currentUid, email: "synthetic@example.invalid" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response("{}", { status: 200 });
};

class MockStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.params = [];
  }
  bind(...params) { this.params = params; return this; }
  async first() { return this.database.first(this.sql, this.params); }
  async all() { return { success: true, results: this.database.all(this.sql, this.params) }; }
  async run() { return { success: true, meta: { changes: 1 } }; }
}

class MockD1 {
  constructor(staff) {
    this.staff = staff;
    this.queueCounters = new Map();
  }
  prepare(sql) { return new MockStatement(this, sql); }
  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
  first(sql, params) {
    if (sql.includes("FROM staff WHERE uid = ?")) return this.staff[params[0]] || null;
    if (sql.includes("booking_queue_counters")) {
      const date = params[0];
      const next = (this.queueCounters.get(date) || 0) + 1;
      this.queueCounters.set(date, next);
      return { last_queue_number: next };
    }
    if (sql.includes("FROM bookings WHERE id = ?")) return null;
    if (sql.includes("FROM account_records WHERE id = ?")) return null;
    return null;
  }
  all() { return []; }
}

function staffRow(uid, bookings, accounts, active = 1) {
  return {
    uid,
    role: "staff",
    active,
    display_name: "Synthetic Staff",
    permissions_json: JSON.stringify({ bookings, accounts }),
    expense_mode: "approval"
  };
}

function context(uid, staff = {}) {
  currentUid = uid;
  const database = new MockD1(staff);
  const env = {
    FIREBASE_API_KEY: "synthetic-test-key",
    CLINIC_DB: database,
    CLINIC_DB_NATIVE: database
  };
  return {
    env,
    waitUntil() {},
    request: null
  };
}

async function invoke(handler, uid, body, staff = {}, token = "synthetic-token") {
  const ctx = context(uid, staff);
  ctx.request = new Request("https://clinic.test/api", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const response = await handler(ctx);
  return { status: response.status, body: await response.json() };
}

test("all nine staff permission combinations enforce independent booking and account rights", async () => {
  const levels = ["none", "view", "edit"];
  for (const bookingPermission of levels) {
    for (const accountPermission of levels) {
      const uid = "staff-" + bookingPermission + "-" + accountPermission;
      const staff = { [uid]: staffRow(uid, bookingPermission, accountPermission) };

      const bookingList = await invoke(bookingsRequest, uid, { action: "list" }, staff);
      assert.equal(
        bookingList.status,
        bookingPermission === "none" ? 403 : 200,
        "booking list for " + bookingPermission + "/" + accountPermission
      );

      const bookingUpdate = await invoke(bookingsRequest, uid, {
        action: "update",
        booking: { id: "missing-synthetic-booking", notes: "test" }
      }, staff);
      assert.equal(
        bookingUpdate.status,
        bookingPermission === "edit" ? 404 : 403,
        "booking edit for " + bookingPermission + "/" + accountPermission
      );

      const accountList = await invoke(accountsRequest, uid, {
        action: "listDailyExpenses",
        date: "2026-11-08"
      }, staff);
      assert.equal(
        accountList.status,
        accountPermission === "none" ? 403 : 200,
        "account list for " + bookingPermission + "/" + accountPermission
      );

      const expenseCreate = await invoke(accountsRequest, uid, {
        action: "createDailyExpense",
        entry: {
          description: "Synthetic permission test",
          amount: "5.00",
          date: "2026-11-08",
          notes: "Synthetic only"
        }
      }, staff);
      assert.equal(
        expenseCreate.status,
        accountPermission === "edit" ? 201 : 403,
        "expense create for " + bookingPermission + "/" + accountPermission
      );

      const custodyCash = await invoke(custodyRequest, uid, {
        action: "addCash",
        amount: 5,
        notes: "Synthetic permission test"
      }, staff);
      assert.equal(
        custodyCash.status,
        accountPermission === "edit" ? 409 : 403,
        "custody cash permission for " + bookingPermission + "/" + accountPermission
      );
    }
  }
});

test("active staff can read their own custody status without account edit rights", async () => {
  const uid = "staff-status-view";
  const result = await invoke(
    custodyRequest,
    uid,
    { action: "status", date: "2026-11-08" },
    { [uid]: staffRow(uid, "view", "none") }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.active, false);
});

test("doctor-only routes reject staff even when staff has edit permissions", async () => {
  const uid = "staff-doctor-route";
  const staff = { [uid]: staffRow(uid, "edit", "edit") };
  const result = await invoke(custodyRequest, uid, { action: "doctorStatus" }, staff);
  assert.equal(result.status, 403);
  const settlement = await invoke(accountsRequest, uid, { action: "listSettlements", month: "2026-11" }, staff);
  assert.equal(settlement.status, 403);
});

test("doctor identity retains access to doctor booking, accounts, and custody views", async () => {
  const bookings = await invoke(bookingsRequest, DOCTOR_UID, { action: "list" });
  const accounts = await invoke(accountsRequest, DOCTOR_UID, { action: "listSettlements", month: "2026-11" });
  const custody = await invoke(custodyRequest, DOCTOR_UID, { action: "doctorStatus" });
  assert.equal(bookings.status, 200);
  assert.equal(accounts.status, 200);
  assert.equal(custody.status, 200);
});

test("inactive and unregistered staff are denied by all three APIs", async () => {
  const inactiveUid = "inactive-staff";
  const inactive = { [inactiveUid]: staffRow(inactiveUid, "edit", "edit", 0) };
  for (const handler of [bookingsRequest, accountsRequest, custodyRequest]) {
    const deniedInactive = await invoke(handler, inactiveUid, { action: handler === custodyRequest ? "status" : "list" }, inactive);
    assert.equal(deniedInactive.status, 403);
    const deniedUnknown = await invoke(handler, "unknown-staff", { action: handler === custodyRequest ? "status" : "list" });
    assert.equal(deniedUnknown.status, 403);
  }
});

test("missing and invalid Firebase tokens are rejected", async () => {
  const uid = "staff-token-test";
  const staff = { [uid]: staffRow(uid, "view", "view") };
  const missing = await invoke(bookingsRequest, uid, { action: "list" }, staff, "");
  assert.equal(missing.status, 401);

  rejectToken = true;
  const invalid = await invoke(bookingsRequest, uid, { action: "list" }, staff);
  assert.equal(invalid.status, 401);
  rejectToken = false;
});
