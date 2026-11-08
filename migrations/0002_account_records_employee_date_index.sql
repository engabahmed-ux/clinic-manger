-- Narrow expense queries to one employee and a requested date range.
-- Existing indexes continue to support doctor-wide daily/monthly reads.
CREATE INDEX IF NOT EXISTS idx_account_records_type_entered_by_date
ON account_records(record_type, entered_by, date);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0002_account_records_employee_date_index', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
