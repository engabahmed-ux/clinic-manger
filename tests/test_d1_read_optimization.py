import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AccountReadOptimizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(":memory:")
        cls.db.row_factory = sqlite3.Row
        cls.db.executescript((ROOT / "migrations/0001_initial_schema.sql").read_text())
        cls.db.executescript((ROOT / "migrations/0002_account_records_employee_date_index.sql").read_text())

        expenses = [
            ("a-approved", "dailyExpense", "2026-11-08", "100", "approved", "staff-a"),
            ("a-pending", "dailyExpense", "2026-11-08", "25", "pending", "staff-a"),
            ("a-rejected", "dailyExpense", "2026-11-08", "50", "rejected", "staff-a"),
            ("a-next-day", "dailyExpense", "2026-11-09", "75", "approved", "staff-a"),
            ("b-approved", "dailyExpense", "2026-11-08", "200", "approved", "staff-b"),
            ("a-old-month", "dailyExpense", "2026-10-31", "300", "approved", "staff-a"),
        ]
        cls.db.executemany(
            "INSERT INTO account_records (id, record_type, date, amount, status, entered_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(i, t, d, a, s, uid, d + "T12:00:00Z") for i, t, d, a, s, uid in expenses],
        )
        bookings = [
            ("booking-a1", "staff-a", "2026-11-08T09:00:00", "100"),
            ("booking-a2", "staff-a", "2026-11-09T09:00:00", "150"),
            ("booking-b1", "staff-b", "2026-11-08T10:00:00", "400"),
            ("booking-a-old", "staff-a", "2026-10-31T10:00:00", "50"),
        ]
        cls.db.executemany(
            "INSERT INTO bookings (id, payment_entered_by_uid, appointment_date, paid_amount, queue_number, created_at, updated_at) VALUES (?, ?, ?, ?, '1', '2026-11-08T08:00:00Z', '2026-11-08T08:00:00Z')",
            bookings,
        )
        cls.db.execute(
            "INSERT INTO bookings (id, appointment_date, queue_number, status, created_at, updated_at, reschedule_history_json, archived_reschedule_history_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "booking-rescheduled",
                "2026-11-08T12:00:00",
                "3",
                "waiting",
                "2026-11-08T07:00:00Z",
                "2026-11-08T13:00:00Z",
                '[{"fromDate":"2026-11-07","toDate":"2026-11-08","fromQueueNumber":2,"toQueueNumber":3,"at":"2026-11-08T12:00:00Z"}]',
                '[{"fromDate":"2026-11-07","toDate":"2026-11-08","fromQueueNumber":2,"toQueueNumber":3,"at":"2026-11-08T12:00:00Z","archivedAt":"2026-11-08T13:00:00Z","archivedByUid":"test-doctor","archivedByName":"Doctor Test"}]',
            ),
        )
        cls.db.execute(
            "INSERT INTO bookings (id, appointment_date, queue_number, status, is_archived, archived_at, created_at, updated_at) VALUES ('booking-archived','2026-11-08T08:00:00','4','completed',1,'2026-11-08T14:00:00Z','2026-11-08T07:00:00Z','2026-11-08T14:00:00Z')"
        )
        cls.db.execute(
            "INSERT INTO bookings (id, appointment_date, queue_number, status, is_archived, created_at, updated_at) VALUES ('booking-cancelled','2026-11-08T09:00:00','5','cancelled',0,'2026-11-08T07:00:00Z','2026-11-08T14:30:00Z')"
        )
        cls.db.execute(
            "INSERT INTO bookings (id, appointment_date, queue_number, status, created_at, updated_at, reschedule_history_json, archived_reschedule_history_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "booking-archived-history-only",
                "2026-11-09T12:00:00",
                "10",
                "waiting",
                "2026-11-08T07:00:00Z",
                "2026-11-08T13:00:00Z",
                "[]",
                '[{"fromDate":"2026-11-06","toDate":"2026-11-09","fromQueueNumber":9,"toQueueNumber":10,"at":"2026-11-08T12:00:00Z","archivedAt":"2026-11-08T13:00:00Z"}]',
            ),
        )
        cls.db.execute(
            "INSERT INTO account_records (id, record_type, employee_uid, created_at, payload_json) VALUES (?, ?, '', ?, ?)",
            ("legacy-handover", "custodyHandover", "2026-11-08T15:00:00Z", '{"previousEmployeeUid":"staff-a","previousEmployeeName":"Staff A"}'),
        )
        cls.db.execute(
            "INSERT INTO account_records (id, record_type, employee_uid, created_at, payload_json) VALUES (?, ?, ?, ?, ?)",
            ("other-handover", "custodyHandover", "staff-b", "2026-11-08T16:00:00Z", '{"previousEmployeeUid":"staff-b"}'),
        )
        cls.db.executescript((ROOT / "migrations/0003_booking_queue_and_archive_occurrences.sql").read_text())
        cls.db.execute(
            "INSERT INTO account_records (id, record_type, employee_uid, date, period_type, period_key, created_at, payload_json) VALUES (?, ?, '', '', ?, ?, ?, ?)",
            ("legacy-settlement", "settlement", "day", "2026-11-08", "2026-11-08T18:00:00Z", '{"employeeUid":"staff-a","periodType":"day","periodKey":"2026-11-08"}'),
        )
        cls.db.execute(
            "INSERT INTO bookings (id, appointment_date, queue_number, status, created_at, updated_at, archived_reschedule_history_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                "booking-history-no-archived-at",
                "2026-11-09T13:00:00",
                "11",
                "waiting",
                "2026-11-08T07:00:00Z",
                "2026-11-08T17:00:00Z",
                '[{"fromDate":"2026-11-05","toDate":"2026-11-09","fromQueueNumber":8,"toQueueNumber":11,"at":"2026-11-08T12:00:00Z"}]',
            ),
        )
        cls.db.executescript((ROOT / "migrations/0004_custody_employee_lookup_index.sql").read_text())
        cls.db.executescript((ROOT / "migrations/0005_archive_sort_timestamp.sql").read_text())

    def test_daily_expenses_are_scoped_to_selected_day(self):
        rows = self.db.execute(
            "SELECT id FROM account_records WHERE record_type = ? AND date >= ? AND date < ? ORDER BY created_at DESC",
            ("dailyExpense", "2026-11-08", "2026-11-09"),
        ).fetchall()
        self.assertEqual({row["id"] for row in rows}, {"a-approved", "a-pending", "a-rejected", "b-approved"})

    def test_monthly_expenses_are_scoped_to_selected_month(self):
        rows = self.db.execute(
            "SELECT id FROM account_records WHERE record_type = ? AND date >= ? AND date < ?",
            ("dailyExpense", "2026-11-01", "2026-12-01"),
        ).fetchall()
        self.assertEqual(len(rows), 5)
        self.assertNotIn("a-old-month", {row["id"] for row in rows})

    def test_settlement_expenses_are_scoped_to_employee_and_period(self):
        rows = self.db.execute(
            "SELECT id, amount, status FROM account_records WHERE record_type = ? AND date >= ? AND date < ? AND entered_by = ?",
            ("dailyExpense", "2026-11-01", "2026-12-01", "staff-a"),
        ).fetchall()
        self.assertEqual({row["id"] for row in rows}, {"a-approved", "a-pending", "a-rejected", "a-next-day"})

    def test_settlement_bookings_are_scoped_to_employee_and_period(self):
        rows = self.db.execute(
            "SELECT id, paid_amount FROM bookings WHERE payment_entered_by_uid = ? AND appointment_date >= ? AND appointment_date < ?",
            ("staff-a", "2026-11-01", "2026-12-01"),
        ).fetchall()
        self.assertEqual({row["id"] for row in rows}, {"booking-a1", "booking-a2"})

    def test_filtered_expense_query_uses_employee_date_index(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM account_records WHERE record_type = ? AND date >= ? AND date < ? AND entered_by = ?",
            ("dailyExpense", "2026-11-01", "2026-12-01", "staff-a"),
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertIn("idx_account_records_type_entered_by_date", detail)

    def test_daily_query_uses_type_date_index(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM account_records WHERE record_type = ? AND date >= ? AND date < ?",
            ("dailyExpense", "2026-11-08", "2026-11-09"),
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertIn("idx_account_records_type_date", detail)

    def test_queue_counters_backfill_current_and_rescheduled_numbers(self):
        rows = self.db.execute(
            "SELECT appointment_date, last_queue_number FROM booking_queue_counters ORDER BY appointment_date"
        ).fetchall()
        counters = {row["appointment_date"]: row["last_queue_number"] for row in rows}
        self.assertEqual(counters["2026-11-07"], 2)
        self.assertEqual(counters["2026-11-08"], 5)

    def test_queue_counters_include_archived_history_payloads(self):
        rows = self.db.execute(
            "SELECT appointment_date, last_queue_number FROM booking_queue_counters ORDER BY appointment_date"
        ).fetchall()
        counters = {row["appointment_date"]: row["last_queue_number"] for row in rows}
        self.assertEqual(counters["2026-11-06"], 9)
        self.assertEqual(counters["2026-11-09"], 10)

    def test_queue_counter_allocation_is_atomic_and_monotonic(self):
        sql = (
            "INSERT INTO booking_queue_counters (appointment_date,last_queue_number,updated_at) VALUES (?,1,?) "
            "ON CONFLICT(appointment_date) DO UPDATE SET last_queue_number=booking_queue_counters.last_queue_number+1, "
            "updated_at=excluded.updated_at RETURNING last_queue_number"
        )
        first = self.db.execute(sql, ("2026-11-12", "test-1")).fetchone()["last_queue_number"]
        second = self.db.execute(sql, ("2026-11-12", "test-2")).fetchone()["last_queue_number"]
        self.assertEqual((first, second), (1, 2))

    def test_archive_migration_keeps_primary_and_rescheduled_occurrences(self):
        rows = self.db.execute(
            "SELECT id, appointment_date, queue_number, is_reschedule, reschedule_to_date FROM booking_archive_occurrences"
        ).fetchall()
        by_id = {row["id"]: row for row in rows}
        self.assertIn("primary:booking-archived", by_id)
        history = by_id["history:booking-rescheduled:0"]
        self.assertEqual(history["appointment_date"], "2026-11-07")
        self.assertEqual(history["queue_number"], "2")
        self.assertEqual(history["is_reschedule"], 1)
        self.assertEqual(history["reschedule_to_date"], "2026-11-08")

    def test_archive_migration_keeps_cancelled_bookings(self):
        row = self.db.execute(
            "SELECT status, is_reschedule FROM booking_archive_occurrences WHERE id = 'primary:booking-cancelled'"
        ).fetchone()
        self.assertEqual(row["status"], "cancelled")
        self.assertEqual(row["is_reschedule"], 0)

    def test_archive_display_timestamp_stays_empty_while_sort_uses_legacy_fallback(self):
        row = self.db.execute(
            "SELECT archived_at, sort_at FROM booking_archive_occurrences WHERE id = 'history:booking-history-no-archived-at:0'"
        ).fetchone()
        self.assertEqual(row["archived_at"], "")
        self.assertEqual(row["sort_at"], "2026-11-08T17:00:00Z")

    def test_restoring_primary_occurrence_keeps_archived_reschedule_history(self):
        self.db.execute("SAVEPOINT restore_primary_test")
        self.db.execute("UPDATE bookings SET is_archived = 0 WHERE id = 'booking-archived'")
        self.db.execute("DELETE FROM booking_archive_occurrences WHERE id = 'primary:booking-archived' AND is_reschedule = 0")
        rows = self.db.execute(
            "SELECT id FROM booking_archive_occurrences WHERE booking_id = 'booking-rescheduled'"
        ).fetchall()
        self.assertIn("history:booking-rescheduled:0", {row["id"] for row in rows})
        self.db.execute("ROLLBACK TO restore_primary_test")
        self.db.execute("RELEASE restore_primary_test")

    def test_archive_page_uses_archive_order_index_and_booking_point_lookup(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT b.*, a.appointment_date AS archive_appointment_date FROM booking_archive_occurrences a INNER JOIN bookings b ON b.id = a.booking_id ORDER BY a.sort_at DESC, a.id DESC LIMIT 6 OFFSET 0"
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertIn("idx_booking_archive_order", detail)
        self.assertIn("sqlite_autoindex_bookings_1", detail)

    def test_archive_day_finds_current_bookings_by_date_index(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM bookings WHERE appointment_date >= ? AND appointment_date < ? ORDER BY appointment_date ASC, created_at ASC, id ASC",
            ("2026-11-08", "2026-11-09"),
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertTrue("idx_bookings_appointment_date" in detail or "idx_bookings_date_status" in detail)

    def test_reschedule_archive_lookup_uses_date_index(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM booking_reschedule_occurrences WHERE from_date = ? AND archived_at = ?",
            ("2026-11-07", ""),
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertIn("idx_booking_reschedule_from_date", detail)

    def test_custody_migration_backfills_previous_employee_uid(self):
        row = self.db.execute(
            "SELECT employee_uid FROM account_records WHERE id = 'legacy-handover'"
        ).fetchone()
        self.assertEqual(row["employee_uid"], "staff-a")

    def test_legacy_settlement_backfills_employee_and_period_date(self):
        row = self.db.execute(
            "SELECT employee_uid, date FROM account_records WHERE id = 'legacy-settlement'"
        ).fetchone()
        self.assertEqual(row["employee_uid"], "staff-a")
        self.assertEqual(row["date"], "2026-11-08")

    def test_settlement_history_is_scoped_to_employee_and_period(self):
        rows = self.db.execute(
            "SELECT id FROM account_records WHERE record_type = 'settlement' AND employee_uid = ? AND date >= ? AND date < ?",
            ("staff-a", "2026-11-01", "2026-12-01"),
        ).fetchall()
        self.assertEqual({row["id"] for row in rows}, {"legacy-settlement"})

    def test_settlement_query_uses_employee_date_index(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM account_records WHERE record_type = 'settlement' AND employee_uid = ? AND date >= ? AND date < ?",
            ("staff-a", "2026-11-01", "2026-12-01"),
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertIn("idx_account_records_employee_date", detail)

    def test_custody_history_query_is_employee_scoped(self):
        rows = self.db.execute(
            "SELECT id FROM account_records WHERE record_type IN (?, ?) AND employee_uid = ? ORDER BY created_at DESC",
            ("custodyHandover", "custodyDoctorSettlement", "staff-a"),
        ).fetchall()
        self.assertEqual({row["id"] for row in rows}, {"legacy-handover"})

    def test_custody_employee_query_uses_employee_type_index(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT * FROM account_records WHERE record_type IN (?, ?) AND employee_uid = ? ORDER BY created_at DESC",
            ("custodyHandover", "custodyDoctorSettlement", "staff-a"),
        ).fetchall()
        detail = " ".join(row["detail"] for row in plan)
        self.assertIn("idx_account_records_employee_type_created", detail)


if __name__ == "__main__":
    unittest.main()
