# Cloudflare-native clinic data cutover

## Target architecture

- Cloudflare D1 is the system of record for clinic operational and medical data.
- Firebase Authentication remains the identity provider for doctor, staff, and patient sign-in, password verification, token issuance, and account security.
- Firebase Auth UIDs remain stable primary identifiers in D1. Do not move passwords, password hashes, refresh tokens, or Firebase credentials into D1.
- After cutover, Firebase Firestore must not be used for patient, booking, medical, settings, account, custody, expense, or audit-log reads/writes.
- Pages Functions validate Firebase ID tokens, then authorize the UID against D1 role/profile/permission records. Firebase account-type lookups must not read Firestore after the D1 authorization mirror is established.
- The browser must access clinic data only through authenticated Pages API routes. Never expose D1 bindings or permit direct browser SQL access.

## Isolated rollout resources

- Git branch: feature/cloudflare-native-data
- D1 database: clinic-manager-cloudflare-native
- D1 database UUID: 281c52d7-58cf-46c6-8368-24849ef87469
- Pages preview binding: CLINIC_DB_NATIVE
- Existing preview binding CLINIC_DB remains unchanged for rollback during implementation.
- Production environment and main branch are intentionally untouched.

## Data domains to move

1. clinic settings
2. bookings, queue numbers, payment state, reschedule and archive history
3. medical patient profiles
4. medical visits, diagnoses, treatment, measurements and follow-up
5. patient account/profile linkage and username lookup (identity/password remain Firebase Auth)
6. staff profiles, active state, role and permissions
7. financial records, expenses, categories, custody sessions, handovers, cash additions, settlement records and financial periods
8. clinic audit logs and retention metadata
9. public booking submissions and patient portal data

The existing schema in migrations/0001_initial_schema.sql is the initial compatibility schema. Before bulk import, field-level mapping and round-trip serialization must be verified against every API contract. Preserve source document IDs and source payloads during the first copy.

## Required cutover sequence

1. Finish schema/field mapping and fixture tests.
2. Build an idempotent, resumable Firestore-to-D1 importer. Read only from Firestore; write only to the isolated D1 database. Keep source data untouched. Verify counts, IDs, checksums, references, and pagination completion for every collection.
3. Port authentication-adjacent authorization to Firebase token verification + D1 role/permission lookup. Firebase Auth remains the only identity/password system.
4. Port low-risk settings and staff/profile reads/writes, then bookings and patient/medical records, then financial/custody routes with transaction and concurrency tests.
5. Port patient portal and public booking routes. Ensure no operational Firestore fallback remains after each route cutover.
6. Replace Firestore-backed realtime/version reads with D1-backed event/version checks and preserve current realtime behavior.
7. Verify every Firestore request in the application source is either an explicitly retained Firebase Authentication request or removed from operational data paths.
8. Run full regression tests and compare business totals before any production cutover.

## Safety and acceptance criteria

- Never delete or modify source Firestore data during migration.
- Never copy Firebase passwords, ID tokens, refresh tokens, or service-account secrets into D1.
- Never write patient names, phone numbers, diagnoses, or clinical notes into realtime payloads or logs.
- All API routes enforce doctor/staff permissions and patient ownership server-side.
- Custody/settlement writes use atomic D1 transactions or conditional updates; no balance reset, duplicate settlement, or stale handover.
- Preserve existing UI and response shapes unless a necessary API contract change is documented.
- A route is not considered migrated until tests prove its reads and writes use D1 exclusively.
- Do not merge, switch production traffic, or disable Firestore until explicit owner approval.
