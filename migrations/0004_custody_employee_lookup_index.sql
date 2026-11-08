-- Make custody history queryable by employee without scanning every employee record.
UPDATE account_records
SET employee_uid = json_extract(payload_json, '$.previousEmployeeUid')
WHERE record_type = 'custodyHandover'
  AND (employee_uid IS NULL OR employee_uid = '')
  AND json_valid(payload_json)
  AND json_extract(payload_json, '$.previousEmployeeUid') IS NOT NULL;

UPDATE account_records
SET employee_uid = json_extract(payload_json, '$.employeeUid')
WHERE record_type IN ('settlement', 'custodyDoctorSettlement')
  AND (employee_uid IS NULL OR employee_uid = '')
  AND json_valid(payload_json)
  AND json_extract(payload_json, '$.employeeUid') IS NOT NULL;

UPDATE account_records
SET date = period_key
WHERE record_type = 'settlement'
  AND (date IS NULL OR date = '')
  AND period_key IS NOT NULL
  AND period_key <> '';

CREATE INDEX IF NOT EXISTS idx_account_records_employee_type_created
ON account_records(employee_uid, record_type, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0004_custody_employee_lookup_index', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
