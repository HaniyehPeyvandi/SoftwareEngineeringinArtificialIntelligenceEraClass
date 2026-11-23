# ChangeFlow final convergence review

**Date:** 2026-11-23 (Asia/Tehran). **Outcome:** converged for the approved academic MVP.

This review compared the current implementation and retained execution evidence with the approved
requirements. It did not implement changes or rerun dependency installation, builds, automated
tests, or the TCP quickstart. Earlier failures and optional non-execution remain part of the record.

## Evidence reviewed and method

- [Constitution](../../.specify/memory/constitution.md), all twelve principles.
- [Finalized specification](../../specs/001-change-request-workflow/spec.md), including confirmed
  clarifications, FR-001–FR-018, AS-01–AS-29, AT-01–AT-06, required SV-01–SV-05 and SC-001–SC-006.
- [Plan](../../specs/001-change-request-workflow/plan.md),
  [research R-01–R-08](../../specs/001-change-request-workflow/research.md),
  [data model](../../specs/001-change-request-workflow/data-model.md),
  [HTTP contract](../../specs/001-change-request-workflow/contracts/README.md),
  [OpenAPI](../../specs/001-change-request-workflow/contracts/openapi.json),
  [test design](../../specs/001-change-request-workflow/test-design.md), and all
  [57 tasks](../../specs/001-change-request-workflow/tasks.md), regardless of their checkboxes.
- Actual `src/app.ts`, `src/config.ts`, `src/server.ts`, business authentication/rules/text/services,
  HTTP authentication/routes/errors, SQLite schema/transactions/store, and initialization/seeding
  scripts. Package manifest/lock, TypeScript/Vitest settings, ignore rules and environment example
  were checked against the planned structure and setup obligations.
- Actual mandatory tests, authorization/contract/validation/persistence/revision suites and shared
  fixtures; concurrency, role-ordering and storage-conflict assertions; independent-worker harness
  and worker implementation. These were assessed alongside the retained results, not inferred
  passing from task markers.
- [Validation history and final delivery evidence](../../specs/001-change-request-workflow/validation.md#final-delivery-verification-t054-t057),
  [README](../../README.md), [quickstart](../../specs/001-change-request-workflow/quickstart.md), and
  earlier setup/foundation/analysis reports for phase provenance.
- Retained local runner JSON at `build/clean-verification/node_modules/.cache/delivery-full.json`
  and generated TCP verification aid at `build/verify-quickstart.mjs`. Both are ignored local
  artifacts, not promised published files. The 35 TCP outcomes are recorded in validation.md;
  inspecting the aid is not a new execution or an independent replay of those outcomes.

Fresh read-only checks in this Converge phase:

1. Spec Kit prerequisite script returned the expected feature directory and required artifacts;
   no extension-hook configuration was present.
2. Parsed the actual retained Vitest JSON: `success=true`, **1639 passed, 0 failed, 0 pending/skipped,
   0 todo**, across 29 test files. The six named assignment files contain seven passing cases
   because AT-06 covers both editable states. The concurrency file contains 140 passing rounds.
3. SHA-256 comparison found **56/56 identical files** between the current project and tested clean
   copy: all source, scripts and tests, package files, TypeScript/Vitest settings and OpenAPI.
   Thus no changed behavior was found that invalidates the retained full-suite evidence.
4. Parsed all task entries and dependencies: **57 unique, 57 checked, zero pending, no missing
   predecessor IDs and no cycles**. Inspected implementations and recorded gates for their scope.
5. Enumerated nine OpenAPI operations and 15 constrained text/Version property occurrences.
   Inspected the three-table schema's 14 qualified columns and its structural constraints.
6. Inspected installed better-sqlite3 metadata/native-file presence and locked lifecycle entries:
   version 13.2.0, `gypfile:false`, bundled `prebuilds/win32-x64.node`; required esbuild lifecycle
   entry and optional macOS-only fsevents entry. File presence alone is not a native-load test.

Runner JSON SHA-256: `ec1c1ff0abd64015d1c3d8d745d5416a2ad08bfe9521174fbc93da246df21907`.
These checks corroborate retained evidence; they are not a new 1639-test run or a formal attestation.
A first inline Node inspection command failed because PowerShell stripped its quotes; the corrected
stdin script completed. That diagnostic failure was not an application or test failure.

## Functional requirement coverage

Status **verified** below means implemented behavior inspected and corresponding passing execution
evidence present for the bounded evaluation set. Test filenames are under `tests/integration/`
unless identified as unit tests. Coverage is requirements traceability, not measured line coverage.

| Requirement | Actual implementation and verification reviewed | Status |
| --- | --- | --- |
| FR-001 | Subject-only JWT middleware; current active user/roles queried inside service transactions; auth/JWT, authorization-matrix and role-revocation tests. | Verified |
| FR-002 | Create service derives owner/UUID/Draft/V1; bound INSERT; AT-01 independently checks inserted row and count. | Verified |
| FR-003 | Canonical required proposal validator and saved-content validation on Submit; proposal-validation and unit/text. | Verified |
| FR-004 | Owner/current Requester checks and conditional Edit in Draft/ChangesRequested; owner-permissions, resubmission, AT-05. | Verified |
| FR-005 | Conditional Submit from either editable state; AT-02 and resubmission. | Verified |
| FR-006 | Independent current Reviewer approval, PendingReview predicate and atomic increment; AT-04 and reviewer-permissions. | Verified |
| FR-007 | Persisted requester comparison overrides dual roles; SQL non-owner predicate; AT-03 and authorization-matrix. | Verified |
| FR-008 | Required validated comment and independent return; status/comment/Version saved together; request-changes and comment-retention. | Verified |
| FR-009 | Explicit four-state rules, terminal Approved and no generic status setter; all-state matrix and owner/reviewer rules. | Verified |
| FR-010 | Exact request shapes reject protected fields; owner never updated; owner-contract, proposal-validation and contract-conformance. | Verified |
| FR-011 | Current authorization and saved preconditions inside IMMEDIATE mutations; role-revocation tests exercise both transaction orders. | Verified |
| FR-012 | Version/status/ownership SQL predicates, one increment, affected-row checks and safe exhaustion; AT-06, concurrency and storage-conflicts. | Verified |
| FR-013 | Commit before response; real rollback on lock/commit failure; independent full snapshots and close/reopen persistence tests. Optional arbitrary fault injection remains separate. | Verified |
| FR-014 | Owner plus current Requester GET/mine in all statuses, including feedback; revision-visibility and authorization-matrix. | Verified |
| FR-015 | Other users' PendingReview-only Reviewer GET/list, self-exclusion and post-transition denial; reviewer-contract/permissions and revision-visibility. | Verified |
| FR-016 | Distinct sanitized errors, auth/shape/precondition precedence, no protected row in conflicts; matrix, contract-conformance and unit/http-errors. | Verified |
| FR-017 | Six individually named mandatory scenarios and required supplementary groups, with HTTP plus independent real SQLite assertions. | Verified |
| FR-018 | Trim-copy Unicode code-point measurement, nonblank/max limits, original text preserved; unit/text, proposal-validation, request-changes and contract-conformance. | Verified |

**18/18 FRs have implementation and verification mappings (100%).**

## Acceptance scenarios and success criteria

| Acceptance scenarios | Concrete verification reviewed | Status |
| --- | --- | --- |
| AS-01–AS-05 | AT-01/02, owner-contract, proposal-validation: create/edit/Submit, required text and protected-field rejection. | Verified |
| AS-06–AS-09 | Reviewer contract/permissions, request-changes, AT-03/04: read scope, independent decisions, atomic feedback and dual-role self-approval denial. | Verified |
| AS-10–AS-13 | Authorization matrix, JWT, owner/reviewer rules and permissions: authentication, roles, ownership and every invalid operation/state combination. | Verified |
| AS-14–AS-16 | Resubmission, comment-retention, revision-visibility and persistence: returned-owner revision, resubmission and all-status owner visibility. | Verified |
| AS-17–AS-19 | Seven race fixture pairs, 20 rounds each, with independent workers/connections and complete persisted winner assertions. | Verified |
| AS-20 | Role-revocation and matrix tests: existing JWTs, disabled actors and both serialized transaction orders. | Verified |
| AS-21 | Concurrency tests explicitly inspect current permitted state and make a deliberate new action; no automatic replay. | Verified |
| AS-22 | Matrix missing-UUID cases and owner/reviewer contracts: 404 where authorized, no insertion/disclosure. Historical revocation test titles do not redefine this ID. | Verified |
| AS-23–AS-25 | Reviewer/matrix self-return denial, both AT-06 variants, AT-05 Approved-edit rejection; unchanged complete rows. | Verified |
| AS-26–AS-29 | Separate missing/blank comment cases, retention/replacement cycles, all four text maxima/max+1 and whitespace/astral/combining cases. | Verified |

**29/29 acceptance scenarios mapped.**

| Criterion | Evaluation evidence and boundary | Status |
| --- | --- | --- |
| SC-001 | Valid creation/edit/submission and complete return/revision journeys; persisted original owner/content, including documented TCP journey. | Met in evaluation set |
| SC-002 | All four allowed transitions and all forbidden operation/status combinations checked with saved-state assertions. | Met in evaluation set |
| SC-003 | Self-approval/self-return and unauthorized combinations denied, including dual-role owners; safe errors/visibility checks. | Met in evaluation set |
| SC-004 | AT-06 both states plus 140 independent-worker rounds; one 200/one 409 VERSION_CONFLICT, both reserved-writer orders, no mixed/lost content. | Met in evaluation set |
| SC-005 | All six assignment scenarios and critical required SV coverage have HTTP and independent SQLite assertions; FR/AS/text-boundary traceability present. | Met in evaluation set |
| SC-006 | Distinct rejection categories, permitted current-state inspection, deliberate conflict recovery and correction/resubmission without added administrator workflow. | Met in evaluation set |

**6/6 success criteria mapped (100%).** Percentages describe the defined evaluation set, not all
possible inputs, schedules or production workloads.

## Mandatory and supplementary execution evidence

| ID | Actual test file/group | Retained result and state assertion |
| --- | --- | --- |
| AT-01 | at-01-create-draft.test.ts | 1 pass; 201/Location, new owned Draft V1, exact content/NULL comment and count. |
| AT-02 | at-02-submit.test.ts | 1 pass; 200 PendingReview V2, content/owner/comment retained. |
| AT-03 | at-03-self-approval.test.ts | 1 pass; dual-role owner 403, complete database snapshot unchanged. |
| AT-04 | at-04-approve.test.ts | 1 pass; independent Reviewer 200 Approved, one increment, other fields preserved. |
| AT-05 | at-05-approved-edit.test.ts | 1 pass; current-Version edit 409 INVALID_STATUS, complete snapshot unchanged. |
| AT-06 | at-06-stale-version.test.ts | 2 passes; Draft and ChangesRequested newer edits retained after stale 409 VERSION_CONFLICT. |
| SV-01 | proposal-validation, owner-contract, unit/text and contract-conformance | Required/protected fields, both editable states, saved Submit content and Unicode limits; passing evidence present. |
| SV-02 | request-changes, resubmission, comment-retention, revision-visibility and persistence | Required feedback, legal multi-cycle retention/replacement, owner reads and rejected-row preservation; passing evidence present. |
| SV-03 | auth/JWT, authorization-matrix, owner/reviewer permissions and role-revocation | Current roles/active state, ownership, independent review and safe reads/errors; passing evidence present. |
| SV-04 | All-state authorization matrix and owner/reviewer rule/permission suites | Disallowed transitions and repeated actions isolated from stale-Version precedence; passing evidence present. |
| SV-05 | concurrency (140), role-revocation (38), storage-conflicts (34), AT-06 (2) | Real workers/connections, both orderings, rollback/busy separation, exhaustion and deliberate recovery; passing evidence present. |
| SV-06 (optional) | Dedicated arbitrary pre-commit fault injection | Not executed; no additional pass claimed and no corrective task required. |

SV groups overlap and are not summed as exclusive test counts. Independent assertion connections
read the real temporary SQLite file after HTTP completion; full snapshots include unrelated rows,
users and roles. Worker tests use actual production HTTP/services and native transactions. The
test-only wrapper observes reservation/commit and coordinates IPC/Atomics barriers; it does not
simulate SQL outcomes. It acknowledges commit notifications to avoid cross-worker message-order
artifacts. Every healthy race requires 200/409; 503 STORAGE_BUSY cannot satisfy that assertion.

The seven 20-round pairs are Draft edit/edit, ChangesRequested edit/edit, Draft edit/Submit,
ChangesRequested edit/Submit, Approve/RequestChanges, Approve/Approve and RequestChanges/RequestChanges.
Each alternates the reserved writer, ten rounds per direction. Begin/commit lock timeout tests
separately use a shorter test timeout and verify rollback, unchanged rows and deliberate recovery.

## Plan, task and constitution assessment

All eight research decisions are reflected in current files: Node/Express ESM toolchain (R-01),
minimal concrete separation (R-02), SQLite atomic concurrency (R-03), subject/current permissions
(R-04), asynchronous scrypt/idempotent demo identities (R-05), canonical text preservation (R-06),
nine strict HTTP operations (R-07) and real-database/worker verification (R-08). No ORM, extra
workflow endpoint, frontend, AI, RAG, MCP or Multi-Agent product feature was found in the implemented
application scope. Test workers and development skills are tooling, not deployed product features.

T001–T057 are supported by their actual files and scoped validation gates. Historical red tests
remain documented as authoring-stage outcomes; the latest JSON has no remaining failed cases.
T044's conditional defect-fix obligation is satisfied by verification of existing safeguards;
it does not require an unnecessary production change when no defect was demonstrated.

| Constitution principle | Review conclusion |
| --- | --- |
| I: Specification first | Approved requirements/design and incremental authoring evidence present; no new behavior decision introduced here. |
| II: Simplicity | One package, concrete modules, three tables and necessary test infrastructure. |
| III: Separation | HTTP delegates; pure rules/text and transactional services separate from SQL. |
| IV: Server access control | JWT subject verified; current SQLite roles/active state govern each protected operation. |
| V: No self-approval | Identity comparison and SQL non-owner guard; explicit dual-role critical test. |
| VI: Validate operations | Transactional preconditions, read snapshots, commit-before-response and unchanged rejected state. |
| VII: Lost updates | Atomic conditional increments and explicit conflicts, with real race evidence. |
| VIII: Critical verification | Required business/auth/state/concurrency tests inspect actual committed state independently. |
| IX: Artifact consistency | Normative behavior aligns across spec/contracts/code/tests; current delivery status is in tasks/validation. Planning-time statements are retained phase records. |
| X: Decisions and limits | Alternatives and bounded deployment/installation/verification limitations documented. |
| XI: MVP scope | Only the approved backend workflow and supporting authentication/bootstrap. |
| XII: Truthful evidence | Failed/aborted installs retained; optional and unexecuted checks explicitly distinguished. |

**No constitution conflicts detected.** This review assesses current artifacts and documented
sequence, not an independently reconstructed Git history or formal security certification.

## Findings

| ID | Gap type | Severity | Source/evidence | Decision |
| --- | --- | --- | --- | --- |
| None | None | None | Current implementation, contracts, test assertions and retained results reviewed above. | No actionable findings detected; no corrective tasks needed. |

Actionable counts: missing **0**, partial **0**, contradicts **0**, unrequested **0**;
CRITICAL **0**, HIGH **0**, MEDIUM **0**, LOW **0**. The following limitations are not mislabeled
as implementation defects or new required work.

## Installation reproducibility and remaining limitations

| Item | Concrete evidence and disposition |
| --- | --- |
| Environment limitation: plain npm ci | Final validation records EBUSY cleanup failures and an inferred node-gyp rebuild blocked by SELF_SIGNED_CERT_IN_CHAIN. A process-local system-CA attempt was interrupted, not passed. Plain installation/source compilation remains unverified; no new successful run is invented here. |
| Verified bounded workaround | Fresh `build/clean-verification` used `npm ci --ignore-scripts --engine-strict --no-fund --offline=false --fetch-retries=0 --fetch-timeout=30000`, then explicit `npm rebuild esbuild --offline=false --fetch-retries=0 --fetch-timeout=30000`, both recorded exit 0. Main in-place npm install recovery is explicitly not called a clean gate. Original lock restored; current 56-file comparison is identical. |
| Native/toolchain scope | Validation records SQLite 3.54.1 native load, installed versions, typecheck/build in both trees and the full clean-tree suite. Current metadata supports the documented bundled Windows x64 path; other architectures and source compiler/header/TLS paths are not established. TLS verification was not disabled. |
| Registry portability | Lockfile references the assessment artifact registry. Access from another machine and a public-registry installation were not verified. This limits portability; it is disclosed in README/quickstart rather than hidden by a completion claim. |
| TCP evidence retention | 35 real TCP checks and CLI/init/seed/restart results are documented; local verification aid inspected. No new TCP run or separately retained raw TCP result file is claimed. These 35 checks are not added to the 1639 automated tests. |
| Optional improvement | Dedicated SV-06 arbitrary pre-commit fault injection remains optional and unexecuted. Existing required native commit-lock rollback tests do not become an invented SV-06 pass. |
| Bounded verification | 140 controlled rounds prove the specified evaluation, not every possible schedule, power-loss durability, arbitrary disk failure or production load. Reopen durability is orderly close/reopen evidence. |
| Local demo security/operations | Loopback HTTP, synchronous SQLite and trusted local maintenance are the approved boundary. Internet TLS/abuse controls, backups, scaling, token logout infrastructure and account administration are outside scope. Distinct 403/404 can reveal existence; protected content is withheld. |
| Lifecycle/watch limits | startServer close/reopen was exercised in recorded evidence; Windows CLI termination is not proof of Unix-style signal-handler execution. Interactive watch mode was not separately executed. |
| Evidence portability | Runner JSON, clean copy and verification aids are ignored local artifacts. Published validation is a sanitized execution record, not a guaranteed archived machine-output bundle. Reproduction requires the documented environment, registry access and actual reruns. |

The metrics have different denominators: **14 distinct qualified SQLite columns** means four
`users`, two `user_roles`, eight `change_requests` columns. **15 OpenAPI text/Version property
occurrences** means CreateBody 3 + EditBody 4 + VersionBody 1 + ReturnBody 2 + ChangeRequest 5.
The latter comprises eleven text annotations and four Version ranges, with repeated input/output
definitions counted separately. UUID/status/token constraints also exist outside that count.
Neither number is a code-coverage percentage; no approved constraint was changed to reconcile them.

## Final decision and next steps

**Converged: the implementation satisfies the specification, plan and tasks within the approved
academic MVP and the documented verification boundaries.** All 18 FRs, 29 ASs, six mandatory ATs,
five required SV groups and six SCs have implementation/verification coverage. No required
unverified behavior or actionable implementation gap was detected in this review.

No corrective tasks were needed. `tasks.md` remains byte-for-byte unchanged, with no empty
Convergence phase and no new completion claims. Existing validation evidence remains unchanged.
Only this report is added; application code, tests, configuration and approved SDD artifacts are
not modified. No installation, build, test, push or release is performed during Converge.

Next: human review/academic assessment using README, quickstart and the linked validation evidence.
No further implementation pass is required for the specified scope. On a different environment,
verify registry access, execute the documented installation procedure and rerun typecheck, build
and the full suite before claiming that environment verified. Optional SV-06 or broader deployment
work requires a separate scoped request and truthful new evidence.
