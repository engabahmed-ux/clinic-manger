# Cloudflare D1 Migration — Code Audit

Audit date: 2026-11-01  
Branch: `feature/cloudflare-d1-migration`  
Audit mode: read-only source inspection plus isolated D1 schema setup. No production application data was read or copied.

## Infrastructure findings
- Repository: `engabahmed-ux/clinic-manger`; production branch: `main`.
- Pages project: `clinic-manger`, Git-connected, Functions enabled.
- Existing realtime Worker: `clinic-realtime`; it exports Durable Object class `ClinicRealtimeHub`.
- Existing Pages Functions publish allow-listed realtime event names through `functions/_shared/realtime.js`.
- Before this work, the connected Cloudflare account had no D1 databases.
- Created isolated D1 database `clinic-manger-migration-sandbox` (UUID `d34dbe2f-b45e-40a6-9bb0-7e8b526b117f`) with no production data.
- Applied `migrations/0001_initial_schema.sql` to that sandbox. The migration created tables and indexes only; no clinic records were inserted.
- Verified SQLite metadata lists the expected tables and indexes. Initial database size after schema creation was approximately 221 KB (including indexes/internal SQLite tables).
- The existing Pages project bindings have not been changed; the D1 database is not yet connected to the live application.

## Firestore collections and proposed D1 mapping

| Existing Firestore collection/document | Observed purpose | Proposed D1 target | Migration notes |
|---|---|---|---|
| `clinicBookings` | Booking, appointment date, patient contact/measurements, queue number, payment, status, reschedule and archive history | `bookings` | Preserve existing IDs, status strings, reschedule history and archive occurrence semantics. |
| `clinicStaff` | Staff role, active flag, display name, permissions, expense mode | `staff` | Firebase Authentication remains authoritative for login initially; D1 stores the clinic role/profile/permissions mirror. |
| `clinicPatients` | Patient login/account linkage, active status, username and linked medical patient | `patient_accounts` | Keep Firebase Auth UIDs unchanged during the initial migration. |
| `clinicPatientUsernames` | Username-to-account lookup and uniqueness | `patient_usernames` | Preserve normalized username keys and active flag. |
| `clinicMedicalPatients` | Medical patient profile and patient number | `medical_patients` | Keep legacy patient IDs stable; search behavior must be tested. |
| `clinicMedicalVisits` | Visits, diagnosis, clinical notes, treatment, follow-up and measurements | `medical_visits` | Sensitive data; strict server authorization and no sensitive realtime payloads. |
| `clinicAccountRecords` | Expenses, categories, financial periods/settlements, custody sessions, handovers, cash additions and settlement history | `account_records` | Polymorphic records are retained in `payload_json` plus indexed common columns initially; accounting invariants need dedicated tests. |
| `clinicLogs` | Doctor event/audit log with expiration | `clinic_logs` | Preserve 30-day retention semantics and avoid sensitive patient details in messages. |
| Singleton settings document (see `functions/api/clinic-management.js`) | `settingsJson`, update timestamp and actor UID | `clinic_settings` | Preserve settings JSON shape to avoid UI changes. |
| `staff-custody-active-session` in `clinicAccountRecords` | Active employee custody lock/session | `account_records` initially | Concurrency is critical. D1 conditional writes/transactions must replace Firestore preconditions atomically. |
| `custody-last-closed` in `clinicAccountRecords` | Last handover summary and settlement boundary | `account_records` initially | Must not reset or resurrect balances incorrectly. |

## Existing API surface observed

- `POST /api/doctor/bookings`: `listDailyAccounts`, `updatePaidAmount`, `archiveList`, `changesSince`, `list`, `restoreArchived`, `archiveDay`, `create`, `update`, `cancel`.
- `POST /api/doctor/accounts`: daily/monthly expense list/create, expense approve/reject, settlement list/preview/finalize, account record list, category creation and entry creation.
- `POST /api/doctor/custody`: `status`, `doctorStatus`, `doctorSettle`, `start`, `handover`, `addCash`.
- `POST /api/doctor/employees`: `list`, `create`, `updateExpenseMode`, `updatePermissions`.
- `POST /api/doctor/patients`: `list`, `searchMedicalPatients`, `resetPassword`, `accountStatus`, and patient-account creation flow.
- `POST /api/doctor/medical-records`: `search`, `resolve`, `history`, `bookingDetails`, `saveVisit`.
- `/api/clinic-management`: settings retrieval/save, logs listing, and event logging.
- `/api/auth/account-type` and `/api/auth/resolve-login`: account resolution and patient username lookup.
- `/api/patient/portal`: patient portal history/data access.
- `/api/public/bookings`: public booking flow.
- Front-end modules call these routes; preserve response shapes during backend migration.

## Important behavior / risk notes

1. Booking documents use string-encoded fields, including amounts and measurements. The D1 adapter must preserve API output types/formatting during the first migration.
2. Booking archive listing includes historical rescheduled occurrences from `archivedRescheduleHistory`, not only records with an archived status. This cannot be simplified to a basic status filter.
3. Custody uses a single active-session lock, a last-closed summary, and history records in the same polymorphic collection. Firestore conditional writes currently provide concurrency conflict behavior; D1 replacement must be transactional and concurrency-tested.
4. Account totals combine bookings and account records. The port must compare existing calculations exactly, including employee attribution and approved/pending/rejected expense rules.
5. Patient account creation touches Firebase Authentication and multiple Firestore records. It is a multi-system workflow and needs compensation/rollback handling; do not blindly port it as a single SQL insert.
6. Patient portal and medical-record endpoints need explicit ownership and staff permission checks on every request.
7. `functions/api/clinic-management.js` attempts to configure Firestore TTL and also performs fallback cleanup. D1 needs an explicit cleanup strategy (scheduled job or bounded cleanup), not a copied TTL assumption.
8. The existing realtime Worker configuration's verification URL points to a Pages preview hostname. Validate and separate preview/production verification endpoints before relying on it for the migrated system.
9. The schema currently preserves source payloads for migration safety. Dedicated columns are indexed only for common filters; schema/queries must be refined against the complete field-level audit before moving records.
10. No source route has been switched to D1 yet. Firebase remains the only active application data source.

## Sandbox schema validation
- Migration file: `migrations/0001_initial_schema.sql`.
- Created tables: `schema_migrations`, `clinic_settings`, `staff`, `bookings`, `patient_accounts`, `patient_usernames`, `medical_patients`, `medical_visits`, `account_records`, `clinic_logs`, `realtime_outbox`, `idempotency_keys`.
- SQL schema creation completed successfully; table/index inventory query succeeded.
- No real patient data, medical records, accounts, or Firebase credentials were copied into D1.

## Remaining before first route is migrated
- Complete field-by-field audit for settings, account records, patient portal, public booking, and auth flows.
- Add a test harness for the schema and data mapper using synthetic fixtures.
- Add a D1 binding to a non-production preview environment only, without replacing/erasing existing preview secrets.
- Implement and test the adapter for one low-risk route before proceeding to bookings or financial writes.
- Test backups/restore, access control, quota failures, and realtime resynchronization.
