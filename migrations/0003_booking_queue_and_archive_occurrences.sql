-- Normalize queue allocation and archived appointment occurrences.
-- Existing booking and history payloads remain untouched for compatibility.

CREATE TABLE IF NOT EXISTS booking_queue_counters (
  appointment_date TEXT PRIMARY KEY,
  last_queue_number INTEGER NOT NULL DEFAULT 0 CHECK (last_queue_number >= 0),
  updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS booking_reschedule_occurrences (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  from_queue_number TEXT NOT NULL DEFAULT '',
  to_queue_number TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL DEFAULT '',
  archived_at TEXT NOT NULL DEFAULT '',
  archived_by_uid TEXT NOT NULL DEFAULT '',
  archived_by_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_booking_reschedule_from_date
ON booking_reschedule_occurrences(from_date, archived_at);
CREATE INDEX IF NOT EXISTS idx_booking_reschedule_booking
ON booking_reschedule_occurrences(booking_id);

CREATE TABLE IF NOT EXISTS booking_archive_occurrences (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  queue_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  archived_at TEXT NOT NULL DEFAULT '',
  archived_by_uid TEXT NOT NULL DEFAULT '',
  archived_by_name TEXT NOT NULL DEFAULT '',
  is_reschedule INTEGER NOT NULL DEFAULT 0 CHECK (is_reschedule IN (0, 1)),
  reschedule_to_date TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_booking_archive_order
ON booking_archive_occurrences(archived_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_booking_archive_booking
ON booking_archive_occurrences(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_archive_date
ON booking_archive_occurrences(appointment_date, is_reschedule);

INSERT OR IGNORE INTO booking_reschedule_occurrences
(id, booking_id, from_date, to_date, from_queue_number, to_queue_number, occurred_at, created_at)
SELECT
  'legacy:' || b.id || ':' || j.key,
  b.id,
  COALESCE(json_extract(j.value, '$.fromDate'), ''),
  COALESCE(json_extract(j.value, '$.toDate'), ''),
  COALESCE(json_extract(j.value, '$.fromQueueNumber'), ''),
  COALESCE(json_extract(j.value, '$.toQueueNumber'), ''),
  COALESCE(json_extract(j.value, '$.at'), ''),
  COALESCE(b.created_at, '')
FROM bookings b,
json_each(CASE WHEN json_valid(b.reschedule_history_json) THEN b.reschedule_history_json ELSE '[]' END) j
WHERE json_extract(j.value, '$.fromDate') IS NOT NULL
  AND json_extract(j.value, '$.toDate') IS NOT NULL;

UPDATE booking_reschedule_occurrences
SET archived_at = COALESCE(
  (
    SELECT COALESCE(NULLIF(json_extract(a.value, '$.archivedAt'), ''), NULLIF(b.updated_at, ''), b.created_at, '')
    FROM bookings b,
    json_each(CASE WHEN json_valid(b.archived_reschedule_history_json) THEN b.archived_reschedule_history_json ELSE '[]' END) a
    WHERE b.id = booking_reschedule_occurrences.booking_id
      AND json_extract(a.value, '$.fromDate') = booking_reschedule_occurrences.from_date
      AND json_extract(a.value, '$.toDate') = booking_reschedule_occurrences.to_date
      AND COALESCE(json_extract(a.value, '$.at'), '') = booking_reschedule_occurrences.occurred_at
    LIMIT 1
  ),
  ''
)
WHERE EXISTS (
  SELECT 1
  FROM bookings b,
  json_each(CASE WHEN json_valid(b.archived_reschedule_history_json) THEN b.archived_reschedule_history_json ELSE '[]' END) a
  WHERE b.id = booking_reschedule_occurrences.booking_id
    AND json_extract(a.value, '$.fromDate') = booking_reschedule_occurrences.from_date
    AND json_extract(a.value, '$.toDate') = booking_reschedule_occurrences.to_date
    AND COALESCE(json_extract(a.value, '$.at'), '') = booking_reschedule_occurrences.occurred_at
);

WITH queue_numbers AS (
  SELECT substr(appointment_date, 1, 10) AS appointment_date,
         CAST(queue_number AS INTEGER) AS queue_number
  FROM bookings
  WHERE appointment_date <> '' AND CAST(queue_number AS INTEGER) > 0
  UNION ALL
  SELECT json_extract(j.value, '$.fromDate'),
         CAST(json_extract(j.value, '$.fromQueueNumber') AS INTEGER)
  FROM bookings b,
       json_each(CASE WHEN json_valid(b.reschedule_history_json) THEN b.reschedule_history_json ELSE '[]' END) j
  WHERE CAST(json_extract(j.value, '$.fromQueueNumber') AS INTEGER) > 0
  UNION ALL
  SELECT json_extract(j.value, '$.toDate'),
         CAST(json_extract(j.value, '$.toQueueNumber') AS INTEGER)
  FROM bookings b,
       json_each(CASE WHEN json_valid(b.reschedule_history_json) THEN b.reschedule_history_json ELSE '[]' END) j
  WHERE CAST(json_extract(j.value, '$.toQueueNumber') AS INTEGER) > 0
  UNION ALL
  SELECT json_extract(j.value, '$.fromDate'),
         CAST(json_extract(j.value, '$.fromQueueNumber') AS INTEGER)
  FROM bookings b,
       json_each(CASE WHEN json_valid(b.archived_reschedule_history_json) THEN b.archived_reschedule_history_json ELSE '[]' END) j
  WHERE CAST(json_extract(j.value, '$.fromQueueNumber') AS INTEGER) > 0
  UNION ALL
  SELECT json_extract(j.value, '$.toDate'),
         CAST(json_extract(j.value, '$.toQueueNumber') AS INTEGER)
  FROM bookings b,
       json_each(CASE WHEN json_valid(b.archived_reschedule_history_json) THEN b.archived_reschedule_history_json ELSE '[]' END) j
  WHERE CAST(json_extract(j.value, '$.toQueueNumber') AS INTEGER) > 0
)
INSERT INTO booking_queue_counters(appointment_date, last_queue_number, updated_at)
SELECT appointment_date, MAX(queue_number), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM queue_numbers
WHERE appointment_date IS NOT NULL AND appointment_date <> ''
GROUP BY appointment_date
ON CONFLICT(appointment_date) DO UPDATE SET
  last_queue_number = MAX(booking_queue_counters.last_queue_number, excluded.last_queue_number),
  updated_at = excluded.updated_at;

INSERT OR IGNORE INTO booking_archive_occurrences
(id, booking_id, appointment_date, queue_number, status, archived_at, archived_by_uid, archived_by_name, is_reschedule, reschedule_to_date, created_at)
SELECT
  'primary:' || id,
  id,
  substr(appointment_date, 1, 10),
  queue_number,
  status,
  COALESCE(archived_at, json_extract(source_payload_json, '$.archivedAt'), ''),
  archived_by_uid,
  archived_by_name,
  0,
  '',
  created_at
FROM bookings
WHERE is_archived = 1 OR status IN ('archived', 'cancelled');

INSERT OR IGNORE INTO booking_archive_occurrences
(id, booking_id, appointment_date, queue_number, status, archived_at, archived_by_uid, archived_by_name, is_reschedule, reschedule_to_date, created_at)
SELECT
  'history:' || b.id || ':' || j.key,
  b.id,
  json_extract(j.value, '$.fromDate'),
  COALESCE(NULLIF(json_extract(j.value, '$.fromQueueNumber'), ''), b.queue_number, ''),
  'postponed',
  COALESCE(json_extract(j.value, '$.archivedAt'), ''),
  COALESCE(json_extract(j.value, '$.archivedByUid'), ''),
  COALESCE(json_extract(j.value, '$.archivedByName'), ''),
  1,
  COALESCE(json_extract(j.value, '$.toDate'), ''),
  b.created_at
FROM bookings b,
json_each(CASE WHEN json_valid(b.archived_reschedule_history_json) THEN b.archived_reschedule_history_json ELSE '[]' END) j
WHERE json_extract(j.value, '$.fromDate') IS NOT NULL
  AND json_extract(j.value, '$.toDate') IS NOT NULL;

UPDATE bookings
SET completed_at = json_extract(source_payload_json, '$.completedAt')
WHERE status = 'completed'
  AND (completed_at IS NULL OR completed_at = '')
  AND json_valid(source_payload_json)
  AND json_extract(source_payload_json, '$.completedAt') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_status_completed_at
ON bookings(status, completed_at);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0003_booking_queue_and_archive_occurrences', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
