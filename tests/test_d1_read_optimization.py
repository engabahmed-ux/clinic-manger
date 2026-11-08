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
        cls.db.executescript((ROOT / "migrations/0003_booking_queue_and_archive_occurrences.sql").read_text())

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
        self.assertEqual(counters["2026-11-08"], 4)

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

    def test_archive_page_uses_archive_order_index_and_booking_point_lookup(self):
        plan = self.db.execute(
            "EXPLAIN QUERY PLAN SELECT b.*, a.appointment_date AS archive_appointment_date FROM booking_archive_occurrences a INNER JOIN bookings b ON b.id = a.booking_id ORDER BY a.archived_at DESC, a.id DESC LIMIT 6 OFFSET 0"
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


if __name__ == "__main__":
    unittest.main()
