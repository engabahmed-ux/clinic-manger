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
  async run() {
    this.database.writes.push({ sql: this.sql, params: this.params });
    return { success: true, meta: { changes: 1 } };
  }
}

class MockD1 {
  constructor(staff) {
    this.staff = staff;
    this.queueCounters = new Map();
    this.bookings = {};
    this.bookingListRows = [];
    this.archiveCurrentRows = [];
    this.rescheduleRows = [];
    this.archivePageRows = [];
    this.reads = [];
    this.writes = [];
    this.batches = [];
  }
  prepare(sql) { return new MockStatement(this, sql); }
  async batch(statements) {
    this.batches.push(statements.map(statement => ({ sql: statement.sql, params: statement.params })));
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
  first(sql, params) {
    this.reads.push({ sql, params });
    if (sql.includes("FROM staff WHERE uid = ?")) return this.staff[params[0]] || null;
    if (sql.includes("booking_queue_counters")) {
      const date = params[0];
      const next = (this.queueCounters.get(date) || 0) + 1;
      this.queueCounters.set(date, next);
      return { last_queue_number: next };
    }
    if (sql.includes("FROM bookings WHERE id = ?")) return this.bookings[params[0]] || null;
    if (sql.includes("FROM account_records WHERE id = ?")) return null;
    return null;
  }
  all(sql, params) {
    this.reads.push({ sql, params });
    if (sql.includes("FROM bookings WHERE appointment_date")) return this.archiveCurrentRows;
    if (sql.includes("FROM booking_reschedule_occurrences")) return this.rescheduleRows;
    if (sql.includes("FROM booking_archive_occurrences a INNER JOIN bookings b")) return this.archivePageRows;
    if (sql.includes("FROM bookings ORDER BY")) return this.bookingListRows;
    return [];
  }
}

function bookingRow(id, appointmentDate, queueNumber, status = "waiting") {
  return {
    id,
    patient_name: "Synthetic Patient",
    patient_id: "",
    patient_phone: "TEST-000",
    appointment_date: appointmentDate,
    service: "Synthetic Service",
    service_price: "100",
    paid_amount: "0",
    queue_number: queueNumber,
    status,
    is_archived: 0,
    archived_at: "",
    archived_by_uid: "",
    archived_by_name: "",
    reschedule_history_json: "[]",
    archived_reschedule_history_json: "[]",
    created_at: "2026-11-08T08:00:00Z",
    updated_at: "2026-11-08T08:00:00Z",
    source_payload_json: "{}"
  };
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
    database,
    waitUntil() {},
    request: null
  };
}

async function invoke(handler, uid, body, staff = {}, token = "synthetic-token", configureDatabase = null) {
  const ctx = context(uid, staff);
  if (typeof configureDatabase === "function") configureDatabase(ctx.database);
  ctx.request = new Request("https://clinic.test/api", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const response = await handler(ctx);
  return { status: response.status, body: await response.json(), database: ctx.database };
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

test("creating a booking allocates a queue number without scanning the bookings table", async () => {
  const result = await invoke(bookingsRequest, DOCTOR_UID, {
    action: "create",
    booking: {
      patientName: "Synthetic Patient",
      patientPhone: "TEST-101",
      appointmentDate: "2026-11-08T09:00:00",
      service: "Synthetic Service",
      servicePrice: "100"
    }
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.booking.queueNumber, "1");
  assert.equal(result.database.queueCounters.get("2026-11-08"), 1);
  assert.equal(result.database.reads.some(read => read.sql.includes("SELECT * FROM bookings ORDER BY")), false);
  assert.equal(result.database.writes.some(write => write.sql.includes("INSERT INTO bookings")), true);
});

test("rescheduling uses an atomic counter and writes its history without a full booking scan", async () => {
  const uid = DOCTOR_UID;
  const result = await invoke(bookingsRequest, uid, {
    action: "update",
    booking: { id: "synthetic-reschedule", appointmentDate: "2026-11-09T09:00:00" }
  }, {}, "synthetic-token", database => {
    database.bookings["synthetic-reschedule"] = bookingRow("synthetic-reschedule", "2026-11-08T09:00:00", "2");
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.booking.appointmentDate, "2026-11-09T09:00:00");
  assert.equal(result.body.booking.queueNumber, "1");
  const statements = result.database.batches.flat();
  assert.equal(statements.some(statement => statement.sql.includes("INSERT INTO booking_reschedule_occurrences")), true);
  assert.equal(result.database.reads.some(read => read.sql.includes("SELECT * FROM bookings ORDER BY")), false);
});

test("cancelling a booking writes its primary archive occurrence in the same D1 batch", async () => {
  const result = await invoke(bookingsRequest, DOCTOR_UID, {
    action: "cancel",
    id: "synthetic-cancel"
  }, {}, "synthetic-token", database => {
    database.bookings["synthetic-cancel"] = bookingRow("synthetic-cancel", "2026-11-08T10:00:00", "3");
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.booking.status, "cancelled");
  const statements = result.database.batches.flat();
  const archive = statements.find(statement => statement.sql.includes("INSERT OR REPLACE INTO booking_archive_occurrences"));
  assert.ok(archive);
  assert.equal(archive.params[0], "primary:synthetic-cancel");
  assert.equal(archive.params[4], "cancelled");
});

test("archiving a day uses date and history indexes instead of listing all bookings", async () => {
  const result = await invoke(bookingsRequest, DOCTOR_UID, {
    action: "archiveDay",
    date: "2026-11-08"
  }, {}, "synthetic-token", database => {
    database.archiveCurrentRows = [bookingRow("synthetic-current", "2026-11-08T10:00:00", "4")];
    database.rescheduleRows = [{
      id: "synthetic-occurrence",
      booking_id: "synthetic-history",
      from_date: "2026-11-08",
      to_date: "2026-11-09",
      from_queue_number: "5",
      to_queue_number: "1",
      occurred_at: "2026-11-07T10:00:00Z"
    }];
    database.bookings["synthetic-history"] = bookingRow("synthetic-history", "2026-11-09T10:00:00", "1");
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.archivedCount, 2);
  const statements = result.database.batches.flat();
  assert.equal(statements.some(statement => statement.sql.includes("INSERT OR REPLACE INTO booking_archive_occurrences") && statement.params[0] === "primary:synthetic-current"), true);
  assert.equal(statements.some(statement => statement.sql.includes("INSERT OR REPLACE INTO booking_archive_occurrences") && statement.params[0] === "history:synthetic-occurrence"), true);
  assert.equal(result.database.reads.some(read => read.sql.includes("SELECT * FROM bookings ORDER BY")), false);
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
