-- Clinic Manager D1 migration sandbox schema.
-- This migration creates structure only; it contains no patient data.
-- Keep source document IDs stable during any future migration.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clinic_settings (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT,
  updated_by_uid TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'staff',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  permissions_json TEXT NOT NULL DEFAULT '{}',
  expense_mode TEXT NOT NULL DEFAULT 'approval',
  created_at TEXT,
  updated_at TEXT,
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  patient_name TEXT NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL DEFAULT '',
  patient_phone TEXT NOT NULL DEFAULT '',
  blood_pressure TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  blood_sugar TEXT NOT NULL DEFAULT '',
  pre_visit_notes TEXT NOT NULL DEFAULT '',
  appointment_date TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  service_price TEXT NOT NULL DEFAULT '0',
  paid_amount TEXT NOT NULL DEFAULT '0',
  completed_fee TEXT NOT NULL DEFAULT '',
  completed_at TEXT NOT NULL DEFAULT '',
  completed_by_uid TEXT NOT NULL DEFAULT '',
  completed_by_name TEXT NOT NULL DEFAULT '',
  payment_entered_by_uid TEXT NOT NULL DEFAULT '',
  payment_entered_by_name TEXT NOT NULL DEFAULT '',
  payment_updated_at TEXT NOT NULL DEFAULT '',
  reschedule_history_json TEXT NOT NULL DEFAULT '[]',
  archived_reschedule_history_json TEXT NOT NULL DEFAULT '[]',
  queue_number TEXT NOT NULL DEFAULT '',
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_at TEXT NOT NULL DEFAULT '',
  archived_by_uid TEXT NOT NULL DEFAULT '',
  archived_by_name TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_bookings_appointment_date ON bookings(appointment_date);
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(appointment_date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_updated_at ON bookings(updated_at);
CREATE INDEX IF NOT EXISTS idx_bookings_archive ON bookings(is_archived, status, appointment_date);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_employee ON bookings(payment_entered_by_uid, appointment_date);
CREATE INDEX IF NOT EXISTS idx_bookings_patient_id ON bookings(patient_id);

CREATE TABLE IF NOT EXISTS patient_accounts (
  uid TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'patient',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  patient_id TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  username_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_patient_accounts_patient_id ON patient_accounts(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_accounts_active ON patient_accounts(active);

CREATE TABLE IF NOT EXISTS patient_usernames (
  username_key TEXT PRIMARY KEY,
  uid TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT '',
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_patient_usernames_uid ON patient_usernames(uid);

CREATE TABLE IF NOT EXISTS medical_patients (
  id TEXT PRIMARY KEY,
  patient_number TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  birth_date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_medical_patients_number ON medical_patients(patient_number);
CREATE INDEX IF NOT EXISTS idx_medical_patients_name ON medical_patients(display_name);
CREATE INDEX IF NOT EXISTS idx_medical_patients_phone ON medical_patients(phone);

CREATE TABLE IF NOT EXISTS medical_visits (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL DEFAULT '',
  booking_id TEXT NOT NULL DEFAULT '',
  visit_date TEXT NOT NULL DEFAULT '',
  queue_number TEXT NOT NULL DEFAULT '',
  blood_pressure TEXT NOT NULL DEFAULT '',
  weight TEXT NOT NULL DEFAULT '',
  blood_sugar TEXT NOT NULL DEFAULT '',
  pre_visit_notes TEXT NOT NULL DEFAULT '',
  diagnosis TEXT NOT NULL DEFAULT '',
  clinical_notes TEXT NOT NULL DEFAULT '',
  treatment TEXT NOT NULL DEFAULT '',
  follow_up TEXT NOT NULL DEFAULT '',
  follow_up_notes TEXT NOT NULL DEFAULT '',
  follow_up_days TEXT NOT NULL DEFAULT '',
  follow_up_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_medical_visits_patient_date ON medical_visits(patient_id, visit_date);
CREATE INDEX IF NOT EXISTS idx_medical_visits_booking_id ON medical_visits(booking_id);

-- Existing Firestore account records are polymorphic (expenses, categories,
-- custody sessions/handovers/settlements, and financial periods). The payload
-- preserves fields during the first migration; indexed columns serve common filters.
CREATE TABLE IF NOT EXISTS account_records (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL DEFAULT '',
  person_name TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  entered_by TEXT NOT NULL DEFAULT '',
  entered_by_name TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  approved_by_name TEXT NOT NULL DEFAULT '',
  approved_at TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT NOT NULL DEFAULT '',
  reviewed_by_name TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT NOT NULL DEFAULT '',
  period_type TEXT NOT NULL DEFAULT '',
  period_key TEXT NOT NULL DEFAULT '',
  employee_uid TEXT NOT NULL DEFAULT '',
  employee_name TEXT NOT NULL DEFAULT '',
  closed_by TEXT NOT NULL DEFAULT '',
  closed_by_name TEXT NOT NULL DEFAULT '',
  closed_at TEXT NOT NULL DEFAULT '',
  total_receipts TEXT NOT NULL DEFAULT '',
  total_expenses TEXT NOT NULL DEFAULT '',
  net_total TEXT NOT NULL DEFAULT '',
  booking_count TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_account_records_type_date ON account_records(record_type, date);
CREATE INDEX IF NOT EXISTS idx_account_records_type_status ON account_records(record_type, status);
CREATE INDEX IF NOT EXISTS idx_account_records_employee_date ON account_records(employee_uid, date);
CREATE INDEX IF NOT EXISTS idx_account_records_period ON account_records(period_type, period_key);
CREATE INDEX IF NOT EXISTS idx_account_records_created_at ON account_records(created_at);

CREATE TABLE IF NOT EXISTS clinic_logs (
  id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL DEFAULT '',
  actor_name TEXT NOT NULL DEFAULT '',
  actor_type TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL DEFAULT '',
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  source_payload_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_clinic_logs_expiry ON clinic_logs(expires_at);
CREATE INDEX IF NOT EXISTS idx_clinic_logs_created ON clinic_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_clinic_logs_area_level ON clinic_logs(area, level);

-- Durable outbox: change notifications are enqueued only after successful writes.
-- Notifications must contain event metadata only, never patient/medical details.
CREATE TABLE IF NOT EXISTS realtime_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  delivered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_realtime_outbox_pending ON realtime_outbox(delivered_at, id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  response_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  PRIMARY KEY (scope, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0001_initial_schema', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
