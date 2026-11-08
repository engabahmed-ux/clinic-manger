-- Preserve the legacy displayed archivedAt value while keeping the old fallback sort order.
ALTER TABLE booking_archive_occurrences
ADD COLUMN sort_at TEXT NOT NULL DEFAULT '';

UPDATE booking_archive_occurrences
SET sort_at = COALESCE(
  NULLIF(archived_at, ''),
  (SELECT NULLIF(b.updated_at, '') FROM bookings b WHERE b.id = booking_archive_occurrences.booking_id),
  created_at,
  ''
);

DROP INDEX IF EXISTS idx_booking_archive_order;
CREATE INDEX IF NOT EXISTS idx_booking_archive_order
ON booking_archive_occurrences(sort_at DESC, created_at ASC, booking_id ASC, is_reschedule ASC, id ASC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('0005_archive_sort_timestamp', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
