/**
 * Server-only D1 adapter for the staged clinic migration.
 *
 * This module is intentionally not wired into existing routes yet. Route
 * cutover happens one feature at a time after parity tests. Never import this
 * module into browser code and never expose the D1 binding to clients.
 */

const DEFAULT_BINDING_NAME = "CLINIC_DB_NATIVE";

export function getClinicDatabase(env, bindingName = DEFAULT_BINDING_NAME) {
  const database = env?.[bindingName];
  if (!database || typeof database.prepare !== "function" || typeof database.batch !== "function") {
    throw new Error("Clinic D1 database binding is not configured for this environment.");
  }
  return database;
}

function statement(database, sql, params = []) {
  if (typeof sql !== "string" || !sql.trim()) {
    throw new TypeError("A non-empty SQL statement is required.");
  }
  const prepared = database.prepare(sql);
  return Array.isArray(params) && params.length ? prepared.bind(...params) : prepared;
}

export async function d1All(database, sql, params = []) {
  const result = await statement(database, sql, params).all();
  if (!result?.success) throw new Error("Clinic database query failed.");
  return Array.isArray(result.results) ? result.results : [];
}

export async function d1First(database, sql, params = []) {
  const result = await statement(database, sql, params).first();
  return result ?? null;
}

export async function d1Run(database, sql, params = []) {
  const result = await statement(database, sql, params).run();
  if (!result?.success) throw new Error("Clinic database write failed.");
  return result;
}

/**
 * D1 batch executes prepared statements as one transactional batch. Callers
 * must build every statement with bound parameters, never interpolate values
 * into SQL strings.
 *
 * Each item: { sql: string, params?: unknown[] }
 */
export async function d1Batch(database, statements) {
  if (!Array.isArray(statements) || statements.length === 0) {
    throw new TypeError("At least one database statement is required.");
  }
  const prepared = statements.map(item => {
    if (!item || typeof item.sql !== "string") {
      throw new TypeError("Every batch item must contain a SQL statement.");
    }
    return statement(database, item.sql, item.params || []);
  });
  const results = await database.batch(prepared);
  if (!Array.isArray(results) || results.some(result => !result?.success)) {
    throw new Error("Clinic database transaction failed.");
  }
  return results;
}

/**
 * Append an allow-listed realtime event to the outbox in the same D1 batch
 * as the data change. Payloads must never include patient names, phone
 * numbers, diagnoses, notes, tokens, or other sensitive details.
 */
export function realtimeOutboxStatement(eventName, createdAt = new Date().toISOString(), payload = {}) {
  const allowed = new Set([
    "booking_created",
    "booking_updated",
    "booking_status_changed",
    "booking_cancelled",
    "accounts_changed",
    "custody_changed",
    "patient_changed",
    "medical_record_changed",
    "clinic_settings_changed"
  ]);
  if (!allowed.has(eventName)) throw new TypeError("Realtime event is not allowed.");
  return {
    sql: "INSERT INTO realtime_outbox (event_name, payload_json, created_at, delivered_at) VALUES (?, ?, ?, NULL)",
    params: [eventName, JSON.stringify(payload && typeof payload === "object" ? payload : {}), createdAt]
  };
}

export async function getClinicDatabaseHealth(env) {
  const database = getClinicDatabase(env);
  const row = await d1First(
    database,
    "SELECT version, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 1"
  );
  const counts = await d1First(
    database,
    "SELECT " +
      "(SELECT COUNT(*) FROM bookings) AS bookings, " +
      "(SELECT COUNT(*) FROM medical_patients) AS medical_patients, " +
      "(SELECT COUNT(*) FROM medical_visits) AS medical_visits, " +
      "(SELECT COUNT(*) FROM account_records) AS account_records"
  );
  return {
    ok: true,
    schemaVersion: row?.version || null,
    schemaAppliedAt: row?.applied_at || null,
    recordCounts: counts || {}
  };
}
