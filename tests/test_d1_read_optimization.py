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
            "INSERT INTO bookings (id, payment_entered_by_uid, appointment_date, paid_amount) VALUES (?, ?, ?, ?)",
            bookings,
        )
        settlements = [
            ("settled-day", "settlement", "2026-11-08", "staff-a", "day", "2026-11-08"),
            ("settled-old", "settlement", "2026-11-07", "staff-a", "day", "2026-11-07"),
        ]
        cls.db.executemany(
            "INSERT INTO account_records (id, record_type, date, employee_uid, period_type, period_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(i, t, d, uid, pt, pk, d + "T18:00:00Z") for i, t, d, uid, pt, pk in settlements],
        )

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
            "SELECT id, amount, status FROM account_records WHERE record_type = ? AND entered_by = ? AND date >= ? AND date < ?",
            ("dailyExpense", "staff-a", "2026-11-01", "2026-12-01"),
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


if __name__ == "__main__":
    unittest.main()
