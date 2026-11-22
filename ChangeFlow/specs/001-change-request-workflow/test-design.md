# ChangeFlow Verification Design

Design obligations, not executed tests. Source IDs refer to [spec.md](spec.md); HTTP expectations
come from [contracts/README.md](contracts/README.md). Use Vitest, Supertest, and actual SQLite via
better-sqlite3. No real application build/test results exist at planning time.

## Harness and evidence

- Create a fresh temporary database file per isolated test fixture. Apply the same planned schema
  initializer used by the app. No shared demo data, no test-wide rollback that masks commit behavior.
- Construct an Express application with explicit config/store; ordinary tests use Supertest without
  a fixed listening port. Close all connections before removing temporary files on Windows.
- Seed controlled Requester A/B, Reviewer A/B, dual-role owner, active no-role, and disabled users.
  Passwords use real scrypt with unique salts. Test credentials are isolated fixtures, not committed
  demo passwords. Obtain real JWTs via login for critical HTTP cases.
- Inspect actual rows through a separate assertion connection after each HTTP operation finishes.
  Compare id, proposal fields, requester_id, status, reviewer_comment, and version. Creation checks
  row count and new identity. Rejections compare complete before/after snapshots and row count.
- Success requires committed state; response equality alone and a subsequent GET are insufficient.
  Assert response status, error code where relevant, schema, and body values against SQLite.
  Do not assert literal message wording. Never use persistence mocks for AT-01 through AT-06.
- Retain command, exit status, test names, and actual observed failures/limitations as implementation
  evidence. A written scenario or passing document check is not a passing application test.

## Six mandatory assignment tests

Each row is a separate named integration test, preserving the exact assignment ID and purpose.

| Test ID | Preparation and HTTP operation | HTTP assertions | Independent SQLite assertions |
| --- | --- | --- | --- |
| AT-01 | Login Requester A; POST /api/change-requests with valid title/description/reason. | 201, Location identifies returned UUID, Draft, requesterId=A, version=1, reviewerComment=null. | Exactly one new row; all supplied text preserved, correct owner, Draft, Version 1, NULL comment. |
| AT-02 | Owned complete Draft at Version 1; POST its /submit with version=1. | 200, PendingReview, version=2, unchanged content/owner. | Same row PendingReview, Version 2; content/owner/comment unchanged. |
| AT-03 | Dual-role owner and own PendingReview at current Version; POST /approve. | 403 FORBIDDEN, no protected row in error. | Every field and row count unchanged; no approval persisted. |
| AT-04 | Requester A owns PendingReview; independent Reviewer A POSTs /approve with current Version. | 200, Approved, Version advances once, proposal/owner/comment retained. | Approved and exact returned Version persisted; all other fields unchanged. |
| AT-05 | Approved request owned by active Requester A; PUT otherwise-valid edited content and current Version. | 409 INVALID_STATUS, not a permissions or stale-version failure. | Entire Approved row, proposal, owner, comment, and Version unchanged. |
| AT-06 | Owner reads V1 of Draft; valid PUT persists different text as V2; second PUT carries V1. | First 200/V2; second 409 VERSION_CONFLICT with no current row leaked. | Winning V2 and complete newer proposal remain unchanged; exactly one increment; no silent overwrite. |

AT-06 is deterministic stale-intent coverage; it does not itself establish simultaneous lock
contention. Test AT-05 independently with all three editable fields and AT-06 in both editable
statuses as additional cases. All six must run, not be inferred from a combined happy-path test.

## Supplementary coverage required by specification/constitution

| Spec group | Detailed integration and rule coverage | Requirement / acceptance trace |
| --- | --- | --- |
| SV-01 | Draft and ChangesRequested edits; each required field missing/null/wrong type (400), empty/whitespace (422), max/max+1; rejected owner/status/version overrides (400). Verify saved state and no truncation. | FR-002 to FR-005, FR-010, FR-018; AS-01 to AS-05, AS-28/29 |
| SV-02 | Independent RequestChanges with valid comment; latest comment readable by owner, not editable by owner. Empty/missing/overlong feedback rejects. Revise/resubmit retains C1; approve retains C1; next successful return replaces C1 with C2. Reject/failure preserves prior comment. | FR-004/005/006/008/013/014/015/018; AS-06/08/14/15/16/26/27/28/29 |
| SV-03 | Every protected operation with no token, wrong signature/algorithm/issuer/audience, expired/missing claims; inactive/missing subject (401), active no-role/wrong-role (403). Owner/non-owner and dual-role combinations; self-return/self-approval; reviewer forbidden reads of other users' Draft/ChangesRequested/Approved. | FR-001/004 to FR-008/011/014 to FR-016; AS-06/09 to AS-12/16/20/22/23 |
| SV-04 | Each Edit/Submit/Approve/RequestChanges × four-status combination, with current Version and correct actor to isolate status. Repeated action with old Version gives VERSION_CONFLICT; current Version in invalid status gives INVALID_STATUS. | FR-009/011/012/016; AS-13 |
| SV-05 | Real competing writers and sequential stale intents as described below; conflict recovery uses fresh GET and deliberate new action, never replay. | FR-011 to FR-013/016; AS-17 to AS-21/24 |

Unit tests exercise pure workflow authorization and text validation with independent expected
results; integration tests prove route enforcement and persistence. Do not mirror private helper
implementations as the only expected-value source. Test UTF-16 astral characters as one code point,
base+combining mark as two, interior whitespace as counted, and surrounding spaces/tab/newline/NBSP/
BOM as trimmed for measurement. For each field test exact maximum and maximum+1 after trim,
including padded maximum values, and both encoding patterns. HTTP and persisted text must preserve
the original strings. Isolated malformed-surrogate JSON produces 400 without lossy saved text.

Submit revalidates saved proposal text even though normal writes cannot create invalid content.
For that defense-in-depth test only, insert a deliberately invalid fixture directly into SQLite;
assert Submit rejects without persisting a transition. This fixture is not a supported creation path.

## Current permissions and role revocation

Issue a valid token, commit deletion of its required role with a maintenance/test connection,
then reuse the same token. Expect 403 and unchanged request state; owner access requires the
Requester role even for a dual-role user. Disabling the user gives 401. Forged role claims never
grant permissions. A seed rerun must not restore the revoked role or replace password hashes.

Coordinate a writer transaction versus a revocation in separate workers. Assert serialization:
revocation committed first causes denial; an operation already holding the writer reservation
may commit before revocation. Assert the recorded ordering rather than claim revocation can undo
an earlier operation. Use snapshot-consistent read tests to ensure no unauthorized content escapes.

## Genuine concurrency fixtures

Use two Node workers/processes with independent database connections and application instances
pointed at one temporary file. Prepare the same initial Version for both, then release commands
through an IPC barrier. Route operations through HTTP/Supertest within each worker. The parent
receives both HTTP outcomes and reads the final SQLite row after both complete. The test harness
is not an additional deployed service or Multi-Agent product capability.

Exercise edit/edit (both editable statuses), edit/Submit (both editable statuses), Approve/
RequestChanges, Approve/Approve, and RequestChanges/RequestChanges. Valid comment is supplied to
each return. Under a healthy database, require exactly one 200 and one 409 VERSION_CONFLICT;
assert one Version increment and a complete legal winning state. The losing comment/content
must not be mixed into the winner. Run 20 repetitions per fixture pair (SC-004), and deliberately
control both winning orders for differing actions. Do not rely on scheduler luck or sleeps alone.
The winner's transaction must complete before the competing writer's busy timeout; barriers must
not pause an acquired transaction waiting for the blocked second writer (deadlock).

Separately hold an IMMEDIATE transaction in a worker past a shorter test busy timeout and attempt
an HTTP mutation from another worker. Expect 503 STORAGE_BUSY, not stale-version 409, and no change
from the failed operation. Release locks with IPC and clean up in finally blocks. Promise.all on
one synchronous event loop tests stale versions but does not prove overlapping writers.

## Persistence and failure coverage

- Reopen the database after successful creation/submission/review and verify durable row state.
- Cover missing IDs (404), forbidden IDs (403), and absence of protected content in both bodies.
- For optional SV-06, introduce a controlled SQLite failure inside the real transaction after the
  update but before commit; assert no success response and full rollback through the assertion
  connection. A temporary test trigger or test-only store wrapper can induce failure; no public
  fault endpoint. This remains optional, unlike critical state assertions on all required tests.
- Test known storage-unavailable response mapping and unexpected-error sanitization. Never use
  a mocked success to assert durable commit, or treat an operational lock timeout as a winning race.

## Traceability and completion

| Requirements | Planned coverage |
| --- | --- |
| FR-001 | Login/JWT/current-user tests, SV-03, role-revocation fixtures |
| FR-002, FR-003 | AT-01, SV-01 and Unicode/limits fixtures |
| FR-004, FR-005 | AT-02, AT-05, SV-01/02/03/04 |
| FR-006, FR-007, FR-008 | AT-03/04, SV-02/03/04, comment cycle fixtures |
| FR-009, FR-010 | AT-01/02/04/05, SV-01/04 |
| FR-011, FR-012 | AT-02/04/06, SV-03/05, revocation and busy tests |
| FR-013 | Independent SQLite assertions throughout; reopen persistence; optional SV-06 |
| FR-014, FR-015 | SV-02/03 read-access and empty-list cases |
| FR-016 | Error/status/shape assertions throughout, no resource data in denied/conflict bodies |
| FR-017 | Separate AT-01 through AT-06 plus required SV-01 through SV-05 |
| FR-018 | SV-01/02, AS-28/29 boundary/Unicode/trim tests |

SC-001/002/003/006 are evaluated through complete allowed/denied journeys; SC-004 through repeated
coordinated pairs and AT-06; SC-005 through this coverage and independent persistence assertions.
Future validation commands: typecheck, build, full non-watch test run, and contract/schema review.
Record actual counts and failures only after implementation; do not infer completion from this plan.
