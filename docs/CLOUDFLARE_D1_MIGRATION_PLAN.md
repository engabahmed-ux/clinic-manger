# Cloudflare D1 Migration Plan — Clinic Manager

## Status
- Work branch: `feature/cloudflare-d1-migration`
- Base branch: `feature/firestore-read-optimization`
- Production branch: `main` (must not be changed without explicit approval)
- Scope: audit first, then migrate in isolated stages; no production data writes during development.

## Non-negotiable safety rules
1. Preserve the existing clinic UI, roles, API contracts, booking rules, medical-record behavior, custody/settlement accounting, and archive behavior unless a migration requirement makes a change necessary.
2. Do not delete or modify the existing Firestore project, Firebase Authentication users, production Pages project, production branch, or existing realtime Worker during migration.
3. Use a separate D1 database and isolated preview environment for all initial implementation and testing.
4. Do not copy real patient or medical data into test fixtures. Use synthetic test data.
5. Do not move secrets into source control or expose tokens, service-account credentials, or medical details in logs.
6. Do not merge to `main`, switch production traffic, or retire Firebase until the owner explicitly approves after test results.
7. Every migration stage must have a rollback path and measurable acceptance criteria.

## Initial read-only infrastructure audit (2026-11-01)
- GitHub repository: `engabahmed-ux/clinic-manger`.
- Default / production branch: `main`.
- Existing working branch found: `feature/firestore-read-optimization`.
- Cloudflare Pages project: `clinic-manger`, connected to the GitHub repository, production branch `main`, Functions enabled.
- The latest Pages deployment observed for the existing project was a preview deployment from `feature/firestore-read-optimization`; production was not changed during this audit.
- Existing Cloudflare Worker: `clinic-realtime`, which uses a Durable Object class named `ClinicRealtimeHub`.
- D1 database listing for the connected Cloudflare account returned no databases at audit time.
- Existing application backend includes Pages Functions for authentication/account type, clinic management, bookings, custody/accounts, employees, medical records, patients, and patient portal.
- Existing server-side functions call Firebase Identity Toolkit and Google Cloud/Firestore APIs using configured Cloudflare secrets. The browser also uses Firebase Authentication.
- Existing real-time event publishing is already implemented in `functions/_shared/realtime.js`; a separate Durable Object WebSocket worker is present in `realtime/worker.js`.
- The current realtime worker configuration points its verification URL at a Pages preview host. This must be reviewed before any realtime changes; do not change it as part of the initial read-only audit.
- No application code or production Cloudflare resource was changed as part of the read-only audit. This document and the isolated migration branch are the initial migration artifacts.

## Architecture target (proposed, subject to code audit)
- Cloudflare Pages: existing front end and Pages Functions during the staged migration.
- Cloudflare D1: relational storage for migrated clinic data.
- Cloudflare Workers / Pages Functions: all authorized database access; browser clients must never receive direct database credentials.
- Existing Firebase Authentication: retained initially. Server-side token verification and clinic role/permission checks remain mandatory.
- Durable Objects + WebSockets: retain/reuse the existing real-time channel where practical; publish only non-sensitive change notifications and re-fetch authorized records via the API.
- Cloudflare R2: optional for future medical attachments, only after a separate privacy, access-control, retention, and backup review.
- Firebase and D1 must not both accept independent writes for the same record. A clear single-writer cutover plan is required before any real-data migration.

## Work plan and acceptance gates

### Stage 1 — Complete code and data-flow audit
- [x] Inventory the main Firestore collections and their primary consumers; field-by-field audit remains in progress for less common flows.
- [ ] Inventory every Firebase Authentication flow, staff/doctor permission check, patient portal flow, and user lifecycle operation.
- [ ] Inventory all API actions and browser call sites; record response shapes and error handling.
- [ ] Trace booking statuses, queue numbering, postponement/rescheduling, archive rules, and calendar counts.
- [ ] Trace custody, opening balance, exam receipts, expenses, handover, settlement, and audit history.
- [ ] Trace medical-record and patient-history access boundaries.
- [ ] Review realtime authentication, broadcast authorization, reconnect behavior, and missed-event recovery.
- [ ] Record current file sizes and line counts before editing any existing code.
- Acceptance: written mapping from every Firebase collection/API action to its D1 table/API implementation, plus a list of behaviors that must remain identical.

### Stage 2 — Data model and migration design
- [ ] Design normalized tables and indexes based on actual code and document shapes, not assumptions.
- [x] Draft initial table IDs, defaults, indexed filters, and ISO timestamp representation; final schema review remains open.
- [ ] Define transaction boundaries for booking updates and financial operations.
- [ ] Define idempotency rules for repeated requests and concurrent updates.
- [ ] Define privacy-safe logs and retention requirements.
- [x] Create initial SQL migration file and apply it to the isolated D1 sandbox; reversible down-migration and fixture suite remain to be added.
- Acceptance: schema reviewed against all real code paths; no production data copied.

### Stage 3 — D1 sandbox and backend adapter
- [x] Created dedicated D1 database `clinic-manger-migration-sandbox` (UUID `d34dbe2f-b45e-40a6-9bb0-7e8b526b117f`) for migration testing only.
- [x] Added `CLINIC_DB` binding to the Pages preview environment only and re-read the configuration to verify all existing preview secret names and compatibility settings were preserved; production has no D1 binding.
- [x] Added server-only D1 adapter `functions/_shared/d1.js` and doctor-only diagnostic endpoint `functions/api/doctor/d1-health.js`; authenticated runtime verification is pending.
- [ ] Add explicit query limits, pagination, prepared statements, and indexes.
- [ ] Keep existing Firebase-backed routes working until each route has parity tests.
- Acceptance: migrations apply cleanly in a disposable environment; no production binding or secret changed.

### Stage 4 — Port features in small groups
- [ ] Start with low-risk clinic settings and lookup/read paths.
- [ ] Port patient and booking reads/writes with parity tests.
- [ ] Port medical records and patient portal with authorization tests.
- [ ] Port employees, accounts, custody, expenses, handover, and settlement with invariant tests.
- [ ] Port archive and event logs.
- [ ] Preserve current API contracts wherever possible to minimize front-end edits.
- Acceptance: each feature group passes tests before the next group begins; no unrelated UI changes.

### Stage 5 — Real-time integration
- [ ] Keep Durable Object messages limited to allow-listed event names and non-sensitive metadata.
- [ ] Verify that only authorized sessions can subscribe or publish.
- [ ] Publish after successful D1 commit, never before.
- [ ] Re-fetch changed data through the authenticated API.
- [ ] Add a reliable resync path for disconnects and missed events.
- [ ] Avoid periodic polling where real-time events provide sufficient freshness.
- Acceptance: multi-client tests confirm prompt updates, reconnect/resync, and no unauthorized data leakage.

### Stage 6 — Security, performance, and correctness testing
- [ ] Verify every API route enforces server-side identity and permission checks.
- [ ] Test expired tokens, forged roles, cross-user access, repeated financial requests, and invalid input.
- [ ] Test booking status transitions, queue behavior, archives, medical history, and patient portal.
- [ ] Test custody invariants using synthetic balances and settlements.
- [ ] Load-test with 10, 25, 50, and (if appropriate) 100 synthetic users.
- [ ] Measure Workers requests, D1 rows read/written, CPU time, latency, WebSocket reconnects, and error rates.
- [ ] Simulate quota/DB failures and verify clear error handling without silent data loss.
- Acceptance: documented test results and observed usage below limits with a safety margin.

### Stage 7 — Backup and recovery
- [ ] Configure a backup/export process appropriate for D1 and clinic data.
- [ ] Store backups separately with restricted access.
- [ ] Perform a restore drill and compare record counts and financial totals.
- [ ] Document recovery point and recovery time expectations.
- Acceptance: a restore is demonstrated successfully before any real-data cutover.

### Stage 8 — Controlled cutover (approval required)
- [ ] Create and verify a final backup.
- [ ] Choose a maintenance/cutover window and define a single authoritative writer.
- [ ] Validate record counts, patient/booking IDs, medical records, and financial totals.
- [ ] Switch traffic only after owner approval.
- [ ] Keep the old system available for rollback; do not delete Firebase resources.
- [ ] Monitor errors and usage after cutover.
- Acceptance: owner explicitly approves production switch and later approves any retirement of Firebase.

## Current known risks / questions to resolve in code audit
- Firestore collection/document schemas are currently encoded across multiple Pages Functions; a migration cannot safely infer the full schema from collection names alone.
- Patient account creation and identity operations currently involve Firebase Authentication; these require a separate plan if Firebase Authentication is ever retired.
- The existing Durable Object Worker has its own deployment/configuration and verification URL; realtime security and environment separation must be verified.
- D1 row-read/write counts are not the same as SQL query counts. Real usage must be measured on representative synthetic workloads.
- The free-tier quota is not an uptime guarantee; quota exhaustion and database failures must be handled explicitly.

## Implementation log
- 2026-11-01: Created isolated branch and migration plan. No production code, database, secrets, or traffic changed.


## Progress update — 2026-11-01
- Created branch `feature/cloudflare-d1-migration` from `feature/firestore-read-optimization`.
- Added `docs/CLOUDFLARE_D1_AUDIT.md` with the observed collection-to-table mapping, route inventory, and migration risks.
- Added `migrations/0001_initial_schema.sql`; successfully applied it to the isolated D1 sandbox and verified table/index inventory.
- Added `functions/_shared/d1.js` and a doctor-UID-restricted diagnostic route at `functions/api/doctor/d1-health.js`. The endpoint uses the existing Firebase API-key setting only to validate the signed-in user; it returns schema version and table counts, not patient data.
- Added the `CLINIC_DB` D1 binding to Pages preview only. Verified that the preview's existing secret names and compatibility settings remained unchanged; production still has no D1 binding.
- The new preview deployment `https://47df37f8.clinic-manger.pages.dev` completed build and deploy successfully.
- No real clinic data was copied, and no production Pages bindings, Firebase resources, production traffic, or `main`-branch files were changed.
- Next gate: verify unauthenticated requests are rejected and the doctor-only endpoint returns the expected D1 schema/counts; then add parity tests before selecting the first existing read-only feature for migration.
