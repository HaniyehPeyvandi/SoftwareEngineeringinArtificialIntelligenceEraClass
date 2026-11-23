---
description: "Dependency-ordered implementation tasks for the ChangeFlow academic MVP"
---

# Tasks: ChangeFlow MVP

**Input**: Design documents in `specs/001-change-request-workflow/`.
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts](contracts/README.md), [OpenAPI](contracts/openapi.json),
[test-design.md](test-design.md), [quickstart.md](quickstart.md), and the
[constitution](../../.specify/memory/constitution.md).
**Status**: T001–T057 complete for the approved academic MVP. Final clean-copy suite: 1639 passed, 0 failed/skipped/todo; all six AT scenarios and 140 real-worker race rounds pass. Real TCP quickstart, delivery documentation and final traceability/constitution audit are verified. Installation-path and other bounded-environment limitations are recorded in validation.md. No push or release was performed.
Setup evidence: [Phase 1 report](../../docs/reports/setup-phase-1.md).
T005–T009 evidence: [Scoped foundation report](../../docs/reports/foundation-t005-t009.md).
T010–T016 evidence: [Foundation validation](validation.md).
T017–T021 evidence: [Owner test authoring](validation.md#owner-test-authoring-t017-t021); completion means tests written/executed, not behavior passing.
T022–T027 evidence: [Requester implementation](validation.md#requester-implementation-t022-t027); AT-01/AT-02 and all 614 tests at that gate passed.
T028–T033 evidence: [Reviewer test authoring](validation.md#reviewer-test-authoring-t028-t033); historical authoring gate had 663 passes and 190 expected failures, now resolved at T038.
T034–T038 evidence: [Reviewer implementation](validation.md#reviewer-implementation-t034-t038); typecheck/build and all 853 tests at that gate passed, including AT-01–AT-05 and independent persisted-state assertions.
T039–T042 evidence: [Concurrency test authoring](validation.md#concurrency-test-authoring-t039-t042); historical gate had 44 new passes and 170 missing-T043 failures, now resolved at T045.
T043–T045 evidence: [Coordinated concurrency implementation](validation.md#coordinated-concurrency-implementation-t043-t045); typecheck/build passed; focused suite 214/214 and full suite 1067/1067 passed. All seven race pairs pass 20 rounds with both winning orders, plus revocation, lock/rollback and Version checks. No production fix was required.
T046–T050 evidence: [Revision lifecycle verification](validation.md#revision-lifecycle-verification-t046-t050); typecheck/build passed; focused US3 suite 37/37 and full suite 1104/1104 passed. Full and independently prepared revision cycles, comment retention/replacement and read boundaries are verified through HTTP and independent SQLite snapshots. No production fix was required.
T051–T053 evidence: [Authorization, contract and durability verification](validation.md#authorization-contract-and-durability-verification-t051-t053); typecheck/build passed; new focused suite 535/535 and full regressions 1639/1639 passed. Initial test-authoring failures and the directly counted 15 constrained schema-property occurrences are documented. No production or contract changes were needed; this is not the later T054 clean-install/delivery gate.
T054–T057 evidence: [Final delivery verification](validation.md#final-delivery-verification-t054-t057); supported clean install plus explicit esbuild postinstall passed in a fresh hash-matched directory, typecheck/build passed in both workspaces, and the full clean suite passed 1639/1639. The real TCP/SQLite journey passed 35 expected HTTP checks and actual init/seed/restart/CLI checks. All FR/AS/AT/required-SV/SC coverage and 12 constitution principles are audited. Earlier plain-install failures are retained; optional SV-06 was not executed. Canonical metrics are 14 distinct database fields and 15 OpenAPI text/Version property occurrences.
**Feature identifier**: `001-change-request-workflow`; no Git branch is created by this command.

**Tests**: Required by the specification and constitution. AT-01 through AT-06 are six independent
mandatory assignment scenarios. SV-01 through SV-05 and critical HTTP-plus-actual-SQLite assertions
are mandatory for this project. SV-06 injected persistence failure is optional and is not a hidden
acceptance blocker. Definitions and exact expected outcomes live in test-design.md and the contract.

**Organization**: Setup, foundation, then original story labels in priority order: US1 (P1),
US2 (P1), US4 (P1), US3 (P2), and final validation. US4 is intentionally before US3; its tests use
prepared ChangesRequested fixtures, so it does not depend on the US3 demonstration journey.

## Format: `[ID] [P?] [Story] Description`

- Every actionable task has a completion checkbox, stable sequential ID, exact file paths, and
  explicit predecessor IDs. Checked tasks reflect scoped verification, not complete application validation.
- `[P]` permits concurrent work only after every listed prerequisite and the phase-entry gate is
  complete. Tasks in an identified wave modify different files. It does not authorize bypassing
  dependencies or concurrent edits to shared modules.
- Story tags are exactly the IDs in spec.md. Setup, foundation, and final tasks have no story tag.
- Constrained fields use explicit Entity.field citations to their canonical definitions in
  data-model.md. Implement those definitions; do not create a second inconsistent constraints list.

## Path Conventions

Application paths (`src/`, `scripts/`, `tests/`, package/config files) are relative to repository
root. Linked design documents and `validation.md` are relative to this feature directory.
The schema remains in `src/persistence/database.ts` per the minimal plan; no migration framework
or additional service architecture is introduced. `validation.md` is a future implementation
evidence log, not an artifact created or populated with invented results by this command.

### Completion Rules for Implementation and Test Tasks

All mutation tasks use the transaction ordering in data-model.md: current identity/roles,
existence, ownership/independence, expected Version, status, text validation, conditional write,
then commit. Create uses a server-controlled INSERT in the same IMMEDIATE transaction; it has
no existing Version to compare. Edit and transition UPDATEs must match Version, permitted status,
and owner/non-owner predicates, increment Version atomically, and affect exactly one row. No
await or external work occurs in these callbacks. Emit success only after commit; failures roll
back. Stale Version and invalid status are distinct 409 codes; lock timeout is 503, not 409.
Protected reads reload identity/roles and retrieve authorized data within one read snapshot.

Every critical integration test asserts the HTTP status/error or success body AND actual SQLite
rows through an independent assertion connection. Rejections compare complete before/after
snapshots and row counts; a GET or persistence mock is insufficient. Use real login-issued JWTs
for AT-01–06. Test-authoring tasks may precede their harness implementation, but execution gates
must wait for every helper and production dependency; authored tests are not passing evidence.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the requested toolchain and safe local configuration conventions.
**Entry**: Final specification and plan are available; no application code exists.

- [X] T001 Initialize the single-package ESM toolchain in `package.json` and `package-lock.json` using plan.md/R-01 dependencies; define the planned build/typecheck/test/dev/db:init/db:seed scripts and record installed versions/native-addon compatibility rather than assuming success. (Depends on: none.)
- [X] T002 [P] Configure strict Node-compatible TypeScript compilation and development/test source inclusion in `tsconfig.json`. (Depends on: T001.)
- [X] T003 [P] Configure isolated Node-environment Vitest discovery and non-watch execution in `vitest.config.ts`; keep test databases separate from the demo database. (Depends on: T001.)
- [X] T004 [P] Add local generated-artifact/credential exclusions and a non-secret configuration example in `.gitignore` and `.env.example`, following quickstart.md without real keys or passwords. (Depends on: T001.)

**Checkpoint**: Toolchain/configuration files exist; dependencies and script interfaces are explicit.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared identity, persistence, transactions, app wiring, and real-database test fixtures.
**Critical gate**: Complete Phase 1 and then this phase before any user-story implementation.
Authentication tests may use test-only middleware handlers; never add public diagnostic endpoints.

- [X] T005 [P] Define the shared typed business-error vocabulary and operation/role/status types in `src/business/rules.ts`, following the contract without importing Express or SQLite. (Depends on: T002, T003, T004.)
- [X] T006 [P] Implement environment validation and local defaults in `src/config.ts` using research.md R-04 and quickstart.md, rejecting missing/weak signing secrets and invalid database settings. (Depends on: T002, T003, T004.)
- [X] T007 Implement connection settings, idempotent versioned schema initialization, structural constraints/indexes, and synchronous read/IMMEDIATE-write transaction helpers in `src/persistence/database.ts`; use canonical definitions from [data-model.md § users](data-model.md#users): `users.id`, `users.username`, `users.password_hash`, `users.active`; [§ user_roles](data-model.md#user_roles): `user_roles.user_id`, `user_roles.role`; and [§ change_requests](data-model.md#change_requests): `change_requests.id`, `change_requests.title`, `change_requests.description`, `change_requests.reason`, `change_requests.requester_id`, `change_requests.status`, `change_requests.version`, `change_requests.reviewer_comment`. Keep Unicode validation in the business layer. (Depends on: T005, T006.)
- [X] T008 Implement bound identity/role queries and safe persistence error translation in `src/persistence/store.ts`, applying [data-model.md](data-model.md#users) definitions `users.id`, `users.username`, `users.password_hash`, `users.active` and [data-model.md](data-model.md#user_roles) definitions `user_roles.user_id`, `user_roles.role`; permit lookup from the operation's current transaction and never cache authorization. (Depends on: T007.)
- [X] T009 Build real temporary-file fixtures, controlled users/all-status request fixtures, independent row snapshots, and reliable connection cleanup in `tests/support/database.ts`; use data-model.md and test-design.md, with no mocked critical persistence. (Depends on: T008.)
- [X] T010 Write login/current-identity/JWT contract tests in `tests/integration/auth.test.ts` and middleware-only token-verification tests in `tests/unit/jwt.test.ts` from research.md R-04/R-05 and test-design.md; test-only protected handlers must not become product endpoints. (Depends on: T009.)
- [X] T011 Implement asynchronous scrypt credential verification, generic failures/dummy derivation, constant-time comparison, active-user recheck, and jose token issue/verification helpers in `src/business/auth.ts` per R-04/R-05; canonical credential fields: [data-model.md](data-model.md#users) `users.username`, `users.password_hash`, `users.active`, `users.id`. (Depends on: T010.)
- [X] T012 [P] Implement explicit schema initialization and idempotent demo bootstrap in `scripts/init-db.ts` and `scripts/seed-demo.ts`, using [data-model.md](data-model.md#users) `users.id`, `users.username`, `users.password_hash`, `users.active` and [data-model.md](data-model.md#user_roles) `user_roles.user_id`, `user_roles.role`; generate credentials only for absent demo users and never reset passwords or revoked roles. (Depends on: T011.)
- [X] T013 [P] Implement signature/claim verification and subject-only bearer middleware in `src/http/auth.ts` using R-04; leave current-role enforcement to transactional business services. (Depends on: T011.)
- [X] T014 Wire the injectable app factory, login route, protected JSON/shape handling, sanitized error mapping, no-store responses, and graceful local server lifecycle in `src/app.ts`, `src/http/routes.ts`, `src/http/errors.ts`, and `src/server.ts`, following contracts/README.md and keeping business logic out of handlers. (Depends on: T012, T013.)
- [X] T015 Complete bootstrap/reopen and authentication integration checks in `tests/integration/bootstrap.test.ts` and `tests/integration/auth.test.ts`, including persisted hashes/salts, no hash leakage, disabled/unknown users, forged/expired claims, and seed reruns that preserve revoked memberships. (Depends on: T014.)
- [X] T016 Run the foundation's typecheck/build and executable auth/bootstrap tests; record actual commands, outcomes, native compatibility, and any blockers in `specs/001-change-request-workflow/validation.md` before opening story phases. (Depends on: T015.)

**Checkpoint**: T016 passes required foundation checks, or honestly records a blocker and leaves
dependent tasks unstarted. A new worker/test process may obtain its own connection; none shares
an in-memory database as proof of cross-connection persistence.

---

## Phase 3: User Story 1 - Prepare and Submit My Request (Priority: P1)

**Goal**: An employee creates, reads, edits, and submits an owned request with correct permissions,
text validation, and atomic Version protection from the first write.
**Independent Test**: Starting with a Requester account, create/edit/Submit, verify HTTP and actual
SQLite state at each step, and prove denied/invalid attempts preserve the prior row. AT-01/AT-02.
**Entry**: T016. This is the first usable increment, not the complete assignment MVP.

### Tests for User Story 1 (required)

**Verification status**: T027 passed the existing owner tests plus one added malformed-URL
regression. AT-01/AT-02 pass. The earlier expected failures remain in the validation history.

- [X] T017 [P] [US1] Write owner-endpoint contract tests in `tests/integration/owner-contract.test.ts` for POST /change-requests, GET /mine, GET /{id}, PUT /{id}, and POST /{id}/submit using contracts/openapi.json; include strict bodies, headers, empty lists, and version shape errors. (Depends on: T016.)
- [X] T018 [P] [US1] Write the separate AT-01 Draft-creation test in `tests/integration/at-01-create-draft.test.ts`, asserting HTTP response/Location and actual inserted SQLite row/count through the assertion connection (AS-01; FR-002/010/012/013/017). (Depends on: T016.)
- [X] T019 [P] [US1] Write the separate AT-02 valid-Submit test in `tests/integration/at-02-submit.test.ts`, asserting HTTP and persisted status/Version/content/owner/comment (AS-03; FR-005/009/012/013/017). (Depends on: T016.)
- [X] T020 [P] [US1] Write canonical proposal-text unit/boundary tests in `tests/unit/text.test.ts` and HTTP/actual-SQLite cases in `tests/integration/proposal-validation.test.ts` for creation, both editable statuses, and Submit; cover each field's exact maximum/maximum-plus-one, padded limits, interior whitespace, astral versus combining code points, trim whitespace including NBSP/BOM, and malformed-surrogate transport rejection. Include AS-04/28/29 and the deliberately invalid saved-content Submit fixture (SV-01; FR-003/018). (Depends on: T016.)
- [X] T021 [P] [US1] Write owner-access/ownership/role/status and immutability tests in `tests/integration/owner-permissions.test.ts` and pure rule cases in `tests/unit/owner-rules.test.ts`, including dual-role non-owners, no-role/disabled actors, missing IDs, protected field overrides, and all owner statuses (AS-05/10/11/12/13/16/22). (Depends on: T016.)

### Implementation for User Story 1

- [X] T022 [P] [US1] Implement the canonical transport/text validator in `src/business/text.ts` from [data-model.md § Text rules](data-model.md#text-rules) and canonical fields [data-model.md](data-model.md#change_requests) `change_requests.title`, `change_requests.description`, `change_requests.reason`, `change_requests.reviewer_comment`; preserve accepted text and use the researched trim/code-point semantics, without duplicating limits elsewhere. (Depends on: T017, T018, T019, T020, T021.)
- [X] T023 [P] [US1] Implement request insert, owner/ID reads, and conditional owner edit/Submit persistence in `src/persistence/store.ts` using [data-model.md](data-model.md#change_requests) `change_requests.id`, `change_requests.title`, `change_requests.description`, `change_requests.reason`, `change_requests.requester_id`, `change_requests.status`, `change_requests.version`, `change_requests.reviewer_comment`; bind values, preserve unaffected fields, check changed-row counts, and never fall back to unconditional writes. (Depends on: T017, T018, T019, T020, T021.)
- [X] T024 [P] [US1] Implement current Requester/owner/read/edit/Submit state rules in `src/business/rules.ts` from data-model.md transaction ordering and transitions, including both editable statuses and denial of protected field overrides (FR-001/004/005/009/010/011/014). (Depends on: T017, T018, T019, T020, T021.)
- [X] T025 [US1] Implement Create/owner-read/list/Edit/Submit services in `src/business/change-requests.ts` using the completion rules above: snapshot-consistent reads and synchronous IMMEDIATE mutations with current-role, owner, Version, status, and content checks. Preserve latest feedback using [data-model.md](data-model.md#change_requests) definitions `change_requests.requester_id`, `change_requests.status`, `change_requests.version`, `change_requests.reviewer_comment`; commit before success and expose no protected state in failures. (Depends on: T022, T023, T024.)
- [X] T026 [US1] Bind the five owner HTTP operations and response mappings in `src/http/routes.ts` using contracts/README.md; keep handlers limited to request-shape checks, service delegation, and HTTP translation. (Depends on: T025.)
- [X] T027 [US1] Run US1 unit/HTTP/actual-SQLite checks and record observed outcomes in `specs/001-change-request-workflow/validation.md`; confirm AT-01/AT-02, owner retrieval/edit/Submit, Unicode boundaries, and initial atomic Version safeguards before dependent phases. (Depends on: T026.)

**Checkpoint**: Owner operations work against real SQLite; no unconditional write path is permitted.
Draft and ChangesRequested edit/Submit share these operations; US3 later verifies the complete cycle.

---

## Phase 4: User Story 2 - Review a Submitted Request (Priority: P1)

**Goal**: Independent reviewers inspect PendingReview requests, approve them, or return them with
required feedback. Owners cannot approve or request changes on their own submissions.
**Independent Test**: Seed other-owned PendingReview requests, exercise each decision separately,
and inspect HTTP plus actual SQLite state; test AT-03/AT-04/AT-05 and denied reviewer reads.
**Entry**: T027. Direct database fixtures isolate review from the employee journey.

### Tests for User Story 2 (required)

- [x] T028 [P] [US2] Write reviewer list/decision contract tests in `tests/integration/reviewer-contract.test.ts` for GET /pending-review and POST /{id}/approve and /request-changes, including allowed mutation responses and forbidden subsequent GET access after leaving PendingReview. (Depends on: T027.)
- [x] T029 [P] [US2] Write the separate AT-03 dual-role owner self-approval rejection test in `tests/integration/at-03-self-approval.test.ts`, asserting HTTP 403 and unchanged complete SQLite state (AS-09; FR-001/007/011/013/017). (Depends on: T027.)
- [x] T030 [P] [US2] Write the separate AT-04 independent approval test in `tests/integration/at-04-approve.test.ts`, asserting HTTP success and actual SQLite status/Version with unchanged proposal, owner, and latest comment (AS-07; FR-006/009/012/013/017). (Depends on: T027.)
- [x] T031 [P] [US2] Write the separate AT-05 Approved-edit rejection test in `tests/integration/at-05-approved-edit.test.ts` using an owner, valid content, and current Version to isolate invalid status; assert HTTP 409 INVALID_STATUS and unchanged SQLite row (AS-25; FR-004/009/013/017). (Depends on: T027.)
- [x] T032 [P] [US2] Write current Reviewer/read-scope/self-return denial tests in `tests/integration/reviewer-permissions.test.ts` and pure decision rules in `tests/unit/reviewer-rules.test.ts`, covering dual-role owners, all four starting statuses, current roles, and no protected disclosure (AS-06/10/11/13/23; SV-03/04). (Depends on: T027.)
- [x] T033 [P] [US2] Write required-comment/return tests in `tests/integration/request-changes.test.ts`, including missing/empty/whitespace-only values, exact-maximum/overlength feedback, padded and astral/combining text, owner visibility, and forbidden owner comment mutation. Assert HTTP and actual SQLite status/comment/Version together on success, and the complete unchanged prior row on rejection (AS-08/26/28/29; SV-02; FR-008/018). (Depends on: T027.)

### Implementation for User Story 2

- [x] T034 [P] [US2] Implement pending-other-user reads and conditional review persistence in `src/persistence/store.ts` using [data-model.md](data-model.md#change_requests) `change_requests.requester_id`, `change_requests.status`, `change_requests.version`, `change_requests.reviewer_comment`; return decision writes preserve proposal content and replace feedback only on RequestChanges. (Depends on: T028, T029, T030, T031, T032, T033.)
- [x] T035 [P] [US2] Implement independent-review and Reviewer read-scope rules in `src/business/rules.ts` from data-model.md/FR-006/007/008/015, with unconditional owner denial for both decision types and correct owner-read fallback for dual-role users. (Depends on: T028, T029, T030, T031, T032, T033.)
- [x] T036 [US2] Implement reviewer-list/read/Approve/RequestChanges services in `src/business/change-requests.ts` using the completion rules above: consistent read snapshots and synchronous IMMEDIATE decisions with current-role/independence/Version/status validation. Apply [data-model.md](data-model.md#change_requests) definitions `change_requests.status`, `change_requests.version`, `change_requests.reviewer_comment`; save return feedback/status/Version atomically, preserve feedback on approval, and deny both self-review actions even for dual-role users. (Depends on: T034, T035.)
- [x] T037 [US2] Bind reviewer HTTP operations and shared GET visibility in `src/http/routes.ts` per contracts/README.md; distinguish authorized mutation results from later read permissions, and preserve strict errors and no-store behavior. (Depends on: T036.)
- [x] T038 [US2] Run US2 checks plus US1 regressions and record actual results in `specs/001-change-request-workflow/validation.md`, including AT-03/04/05, self-return denial, latest-feedback behavior, and the current-Version status matrix. (Depends on: T037.)

**Checkpoint**: Both independent review outcomes and both self-review denials are enforced.
Required feedback persists atomically and does not grant broader post-decision GET access.

---

## Phase 5: User Story 4 - Preserve Newer Work During Conflicts (Priority: P1)

**Goal**: Prove stale-intent protection, current permissions, and real transactional contention.
**Independent Test**: From prepared editable/PendingReview states, run two actions against the
same Version, inspect both HTTP outcomes and the final SQLite row, and exercise AT-06 separately.
**Entry**: T038. Atomic safety was implemented in US1/US2; this phase tests and hardens it.
The worker harness is test infrastructure, not an added deployed or Multi-Agent product system.

### Tests for User Story 4 (required)

- [x] T039 [P] [US4] Write the separate AT-06 outdated-Version test in `tests/integration/at-06-stale-version.test.ts` for each editable status; assert the winning HTTP update, stale HTTP 409 VERSION_CONFLICT, and unchanged winning SQLite content/status/comment/Version (AS-24; FR-011/012/013/016/017). (Depends on: T038.)
- [x] T040 [P] [US4] Write coordinated race/recovery cases in `tests/integration/concurrency.test.ts`: edit/edit and edit/Submit in both editable states, Approve/RequestChanges, Approve/Approve, and RequestChanges/RequestChanges. Require HTTP 200/409 VERSION_CONFLICT and one complete winning SQLite change, no mixed content/comment, fresh-state recovery, and the SC-004 repetition target with both winning orders for differing actions; use separate workers/connections (SV-05; AS-17–21). (Depends on: T038.)
- [x] T041 [P] [US4] Write role-revocation/disable tests in `tests/integration/role-revocation.test.ts` using existing tokens, committed maintenance changes, and both controlled transaction orderings; assert denial after revocation and unchanged actual SQLite state (AS-20; FR-001/011; SV-03/05). (Depends on: T038.)
- [x] T042 [P] [US4] Write separate lock-timeout/commit-lock and safe-Version-exhaustion checks in `tests/integration/storage-conflicts.test.ts`; assert documented 503 outcomes, rollback/no accepted mutation, no 409 misclassification, and unchanged actual SQLite state (FR-012/013/016). (Depends on: T038.)

### Implementation for User Story 4

- [x] T043 [US4] Implement independent application workers/connections and IPC barriers in `tests/support/race-worker.ts` and `tests/support/race-harness.ts`, using the existing TypeScript toolchain and shared fixture database file. Return both HTTP outcomes, force both orders without sleeps-only scheduling, fail visibly on worker startup/timeout, and release locks/close workers in cleanup; never hold a writer reservation waiting for a blocked second writer's barrier acknowledgement. (Depends on: T039, T040, T041, T042.)
- [x] T044 [US4] Complete any failing atomic-write/role-ordering/zero-row/commit-rollback safeguards in `src/persistence/database.ts`, `src/persistence/store.ts`, and `src/business/change-requests.ts` against the explicit cases above and [data-model.md](data-model.md#change_requests) `change_requests.version`, `change_requests.status`, `change_requests.requester_id`, `change_requests.reviewer_comment`; retain the guards already present from US1/US2 and never add automatic replay. (Depends on: T043.)
- [x] T045 [US4] Run AT-06 and all SV-05 pairs for the SC-004 repetition target, plus revocation/busy tests and earlier story regressions; record both HTTP outcomes and final SQLite comparisons in `specs/001-change-request-workflow/validation.md` without treating busy failures as successful race validation. (Depends on: T044.)

**Checkpoint**: AT-06 and every specified race pair meet the contract; role revocation order and
storage contention are distinguished. A 503 busy failure does not satisfy the healthy race target.

---

## Phase 6: User Story 3 - Revise and Resubmit a Returned Request (Priority: P2)

**Goal**: Verify the complete return/revision/resubmission loop and latest-comment lifecycle.
**Independent Test**: Start with an owned ChangesRequested fixture, edit/resubmit, and check
saved content, original ownership, comment, status, and Version; separately test repeated cycles.
**Entry**: T045 for the chosen sequence. Shared production operations are already implemented by
T025/T026 and T036/T037; reuse them rather than add another workflow API or service layer.

### Tests for User Story 3 (required)

- [X] T046 [P] [US3] Write the complete return/edit/resubmit journey in `tests/integration/resubmission.test.ts`, verifying original owner, revised content, preserved latest comment, valid status changes, current roles, and each committed Version through HTTP and actual SQLite (AS-14/15; SV-02). (Depends on: T045.)
- [X] T047 [P] [US3] Write latest-comment lifecycle tests in `tests/integration/comment-retention.test.ts`, including retention through owner edits/resubmission/approval, replacement on the next successful return, and preservation after invalid/stale decisions (AS-27; SV-02). (Depends on: T045.)
- [X] T048 [P] [US3] Write owner all-status feedback reads and reviewer post-transition denial regression cases in `tests/integration/revision-visibility.test.ts`, asserting both denied content disclosure and unchanged actual SQLite state (AS-06/16; FR-014/015). (Depends on: T045.)

### Implementation and Integration for User Story 3

- [X] T049 [US3] Add reusable legal multi-cycle fixtures in `tests/support/revision-cycle.ts` using existing HTTP operations and independent database snapshots; integrate the US1 edit/Submit and US2 return/approval paths under [data-model.md](data-model.md#change_requests) `change_requests.reviewer_comment`, `change_requests.status`, `change_requests.version`, without inventing another endpoint, history model, or duplicate service layer. (Depends on: T046, T047, T048.)
- [X] T050 [US3] Run US3 independently from prepared ChangesRequested fixtures and as a full HTTP journey; record actual results and earlier-story regressions in `specs/001-change-request-workflow/validation.md`. Shared production operations already delivered by US1/US2 must satisfy the cycle; fix only demonstrated failures in their existing modules. (Depends on: T049.)

**Checkpoint**: The returned-request journey, latest-comment retention/replacement, and read
boundaries work independently from prepared fixtures and through the full HTTP sequence.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Close coverage gaps, prove durability/contract consistency, execute actual checks,
and reconcile documentation. No unrelated features, speculative abstraction, or optimization work.
**Entry**: T050; all four stories are required for the complete ChangeFlow MVP.

- [X] T051 [P] Complete the full protected-operation/actor/state/error precedence matrix in `tests/integration/authorization-matrix.test.ts`, covering all endpoints, stale versus invalid-status outcomes, forbidden and missing IDs, role revocation, and zero protected content in denial/conflict errors (FR-001/009/011/014/015/016; SV-03/04). (Depends on: T050.)
- [X] T052 [P] Validate the implemented request/response/error schemas and nine operations against `specs/001-change-request-workflow/contracts/openapi.json` in `tests/integration/contract-conformance.test.ts`, including post-trim annotations, safe integer Versions, envelope/media errors, Location, and no-store headers; do not enforce raw maxLength on padded input. (Depends on: T050.)
- [X] T053 [P] Add close/reopen durability and initialization-idempotence checks in `tests/integration/persistence.test.ts` for creation/submission/decisions and retained/replaced feedback, asserting actual saved SQLite rows and roles after reconnect (FR-013; test-design.md persistence coverage). (Depends on: T050.)
- [X] T054 Run clean dependency installation, typecheck, build, and the complete non-watch test suite from `package.json`; capture real versions/commands/exits/counts/failures in `specs/001-change-request-workflow/validation.md`. Record each AT-01 through AT-06 result separately, confirm none is skipped, and identify its HTTP and actual-SQLite assertions; record required SV-01–05 outcomes and explicit disposition of optional SV-06 rather than silently reporting it passed. (Depends on: T051, T052, T053.)
- [X] T055 Execute the implemented setup/manual HTTP/database/role-revocation journey in `specs/001-change-request-workflow/quickstart.md` against an isolated demo file and record observed evidence in `specs/001-change-request-workflow/validation.md`; protect demo data and credentials. (Depends on: T054.)
- [X] T056 Reconcile actual setup/scripts/native prerequisites and limitations in `README.md`, `.env.example`, and `specs/001-change-request-workflow/quickstart.md`. Add a README delivery index linking constitution, spec/clarifications, plan, research/decisions, data model, API contracts, test design, tasks, quickstart, and validation evidence; align documents with verified behavior without silently amending approved requirements or adding a packaging system. (Depends on: T055.)
- [X] T057 Audit constitution compliance and final FR-001–018/AS-01–29/AT-01–06/SV/SC traceability in `specs/001-change-request-workflow/validation.md` and `specs/001-change-request-workflow/tasks.md`; resolve inconsistencies and mark only genuinely completed tasks. If this audit or T055/T056 causes code/test/configuration fixes, rerun affected tests and the required typecheck/build/full-suite gates against the final revision; otherwise validate changed documentation/links only. Retain all blocked/failed outcomes and do not reuse earlier passing evidence for changed behavior. (Depends on: T056.)

**Optional SV-06**: A controlled pre-commit persistence-failure test may later be added under
`tests/integration/persistence-failures.test.ts` using a real transaction/test-only trigger or
wrapper, following test-design.md. It is not one of the 57 mandatory tasks. Record whether it
was run or not run; never report it passing without execution. Durable-state assertions for
required scenarios remain mandatory regardless of this optional test.

**Checkpoint**: All required behavior is implemented, traced, and supported by actual validation
evidence. Failed/blocked required checks prevent a fully validated completion claim.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Setup T001–T004
  -> Foundation T005–T016
  -> US1 (P1) T017–T027
  -> US2 (P1) T028–T038
  -> US4 (P1) T039–T045
  -> US3 (P2) T046–T050
  -> Final validation T051–T057
```

Every task's predecessor list is authoritative within this conservative sequence. Read each
phase-entry gate as an additional dependency. T001 precedes the three setup peers; T005/T006
precede database/store/bootstrap/app work. T012/T013 can share a wave only after T011.

### User Story Dependencies

| Story | Shared implementation dependencies | Why it remains independently testable |
| --- | --- | --- |
| US1 | Foundation | Requester account and owned fixtures suffice |
| US2 | US1 entity/Version/read and HTTP infrastructure | Seed PendingReview/Approved fixtures; no live Submit journey required |
| US4 | US1 mutations and US2 review operations | Seed each starting status and use separate worker connections |
| US3 | US1 editable operations and US2 return/comment operations; scheduled after US4 | Seed ChangesRequested and verify revision loop; no new endpoint needed |

The selected sequence serializes shared `rules.ts`, `store.ts`, `change-requests.ts`, and
`routes.ts` edits across story phases. Do not interpret story independence as permission to
edit those files concurrently. US3's functional prerequisites are US1/US2; its T045 gate is the
chosen priority order, not a newly invented product dependency.

### Within Each User Story

Write the specified tests before its implementation/integration work. Establish executable
fixtures/imports and record observed behavioral failures before claiming a red test; a missing
module or unavailable native addon is a setup blocker, not proof of the intended rule failure.
Then implement/complete the smallest change, run relevant checks, and record observed results.
If an operation shared from an earlier story already passes a later test, retain it unchanged
and record that result rather than fabricate a failure or create duplicate production logic.

### Parallel Opportunities

There are 33 marked tasks across these safe waves; wave prerequisites must already be complete:

| Wave | Prerequisite | Parallel tasks / distinct files |
| --- | --- | --- |
| Setup | T001 | T002, T003, T004 |
| Shared primitives | Phase 1 | T005, T006 |
| Bootstrap / bearer | T011 | T012, T013 |
| US1 tests | T016 | T017–T021 |
| US1 concrete components | T017–T021 | T022, T023, T024 |
| US2 tests | T027 | T028–T033 |
| US2 concrete components | T028–T033 | T034, T035 |
| US4 tests | T038 | T039–T042 |
| US3 tests | T045 | T046–T048 |
| Final coverage | T050 | T051, T052, T053 |

---

## Parallel Example: User Story 1

After T016, author T018 in `tests/integration/at-01-create-draft.test.ts` alongside T019 in
`tests/integration/at-02-submit.test.ts`. After all US1 test tasks are authored, T022 in
`src/business/text.ts`, T023 in `src/persistence/store.ts`, and T024 in
`src/business/rules.ts` may proceed independently. Join before T025 services.

## Parallel Example: User Story 2

After T027, author T029 self-approval and T030 independent-approval tests in their distinct AT files.
After T028–T033, T034 SQL work and T035 pure rules may run together. Join before T036 services.

## Parallel Example: User Story 4

After T038, author T039 deterministic stale-Version tests and T041 revocation-order tests in separate
files. They can describe the planned worker interface; T043 later implements that shared fixture.
Do not concurrently alter the harness from several test tasks or count not-yet-runnable tests as
completed validation. T045 runs everything after T043/T044.
T040–T042 author tests against the planned harness interface; their execution requires T043.
T039 is the deterministic stale-write case and can run without contention workers once its test exists.

## Parallel Example: User Story 3

After T045, author T046 `resubmission.test.ts` and T047 `comment-retention.test.ts` alongside T048
visibility tests. Join for the shared cycle helper T049 and the actual validation T050.
Tests that import the shared cycle helper are not runnable until T049; writing them earlier
does not reverse the dependency of the execution gate or require a circular implementation order.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Complete Setup/Foundation, then US1, and inspect the employee create/edit/Submit increment.
It is a useful first demonstration, but it is not the complete assignment MVP: review, self-review
prevention, stale-Version proof, and the return/resubmit journey are all still required.
Do not claim assignment completion, deploy externally, or skip the later safety/coverage gates.

### Incremental Delivery

Complete the priority sequence US1 -> US2 -> US4 -> US3, preserving working behavior and adding
the required tests at each step. Test the owner's returned-state operations from prepared fixtures
as soon as those shared operations are written. Run each phase gate once the relevant changes
are ready; repeat wider checks only for a new change, failure, or unresolved concern.

### Parallel Team Strategy

Use only the explicit same-phase waves above when multiple implementers are available. Assign
different files and join before shared services/routes. This document describes opportunities;
it does not start agents, require a team, or add any Multi-Agent feature.

### Coverage and Assignment Traceability

| Scope | Implementing / verification tasks |
| --- | --- |
| FR-001 | T008–T015, T021/T024–T026, T032/T035–T037, T041/T044/T051 |
| FR-002, FR-003 | T007, T018, T020, T022/T023/T025/T026 |
| FR-004, FR-005 | T019–T027, T031, T046/T049/T050 |
| FR-006, FR-007, FR-008 | T028–T038, T047/T049/T050 |
| FR-009, FR-010 | T007, T017/T021/T023–T026, T031/T032/T035–T037, T051 |
| FR-011, FR-012 | T007/T008, T023–T027, T034–T045, T051/T052 |
| FR-013 | Independent SQLite snapshots throughout; T009, T018/T019, T029–T031, T039–T050, T053 |
| FR-014, FR-015 | T021/T023–T026, T028/T032/T034–T037, T048/T050/T051 |
| FR-016 | T005/T014, T017/T021/T026, T028/T032/T037, T039–T045, T051/T052 |
| FR-017 | T018/T019/T029/T030/T031/T039, all required SV tasks and T054–T057 |
| FR-018 | T020/T022, T033/T036/T037, T052 |
| AT-01 / AT-02 | T018 / T019; runnable gate T027 |
| AT-03 / AT-04 / AT-05 | T029 / T030 / T031; runnable gate T038 |
| AT-06 | T039; runnable gate T045 |
| SV-01 / SV-02 | T020–T027 / T028/T033–T038 and T046–T050 |
| SV-03 / SV-04 | T010/T015/T021/T032/T041/T048/T051 / T021/T032/T051 |
| SV-05 | T039–T045, with actual coordinated repetitions at T045 |
| Optional SV-06 | Optional separate follow-up described above; disposition in T054 |
| SC-001 / SC-002 / SC-003 | Owner/revision journeys / status matrix / authorization and self-review cases |
| SC-004 / SC-005 / SC-006 | T040/T043/T045 / full FR and persisted-state coverage / rejection and recovery journeys |

### Mandatory Test Implementation and Verification Map

Each row is independently required. Business/SQL/HTTP task references identify the behavior under
test; the test task creates its automation; the gate executes it and records actual evidence.

| Assignment scenario | Behavior implementation | Automated test task | Execution / evidence |
| --- | --- | --- | --- |
| AT-01 Draft creation | T007, T023–T026 | T018 | T027; final T054/T057 |
| AT-02 valid Submit | T023–T026 | T019 | T027; final T054/T057 |
| AT-03 dual-role self-approval denial | T034–T037 | T029 | T038; final T054/T057 |
| AT-04 independent approval | T034–T037 | T030 | T038; final T054/T057 |
| AT-05 Approved-edit denial | T024–T026; Approved fixture T009 | T031 | T038; final T054/T057 |
| AT-06 outdated-Version rejection | T007, T023/T025, T034/T036; hardening T044 | T039 | T045; final T054/T057 |

## Notes

- Canonical constrained fields are cited in T007 for all entities and again in their relevant
  implementing business/store tasks. Their definitions must not be weakened for a test shortcut.
- Build/test outcomes and completion markers may be added only after execution during implementation.
- Keep all five confirmed clarifications, explicit product limits, and exact six assignment tests.
- No frontend, AI, RAG, MCP, Multi-Agent product, or other excluded feature is authorized.
- Only this task document is created by the tasks phase. Next recommended command:
  `$speckit-analyze` for consistency review before `$speckit-implement`.
