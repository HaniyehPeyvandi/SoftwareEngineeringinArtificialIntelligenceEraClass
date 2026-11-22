# ChangeFlow implementation validation

## Foundation increment: T010–T016

Date: 2026-11-22. Scope authorized: T010–T016 only. Environment: Windows x64,
Node.js v22.23.4, npm 10.9.9. Earlier evidence remains in the
[setup report](../../docs/reports/setup-phase-1.md) and
[T005–T009 report](../../docs/reports/foundation-t005-t009.md).

Result: foundation gate passes for the implemented scope. T001–T016 are complete;
T017–T057 remain pending. This is not completion of the Change Request MVP.

### Files changed

Created production files:

- `src/business/auth.ts`
- `src/http/auth.ts`
- `src/http/errors.ts`
- `src/http/routes.ts`
- `src/app.ts`
- `src/server.ts`
- `scripts/init-db.ts`
- `scripts/seed-demo.ts`

Created tests:

- `tests/unit/jwt.test.ts`
- `tests/unit/http-errors.test.ts`
- `tests/integration/auth.test.ts`
- `tests/integration/bootstrap.test.ts`

Updated `tests/support/database.ts` to reuse production password hashing instead of duplicating
the existing scrypt implementation. Existing fixture isolation/snapshot/cleanup behavior remains.
Updated `specs/001-change-request-workflow/tasks.md` for scoped status, evidence link, and seven
completion markers. Created this `specs/001-change-request-workflow/validation.md`.
Build output was generated under ignored `dist/`.

No dependencies were installed or changed. Package manifest, lockfile, TypeScript/Vitest settings,
ignore/environment files, approved requirements, constitution, plans, contracts, and previous
reports were preserved. No real demo database or `.env` was created.

### Implementation and test coverage

| Task | Implemented behavior and observed verification |
| --- | --- |
| T010 | Login/JWT/current-identity tests written before implementation. Missing imports were not represented as a behavioral red test. Test-only protected Express handlers are confined to tests. |
| T011 | Real asynchronous scrypt with N=32768, r=8, p=3, 64-byte keys, random 16-byte salts, 64 MiB maxmem. Unknown/corrupt records still perform a bounded dummy derivation. Equal-length keys use timingSafeEqual. Password text is neither trimmed nor normalized. Login fetches credentials in read scope, derives outside the transaction, rechecks identity/active state/password record afterward, then signs outside SQLite scope. Wrong passwords, unknown users, and disabled users have indistinguishable INVALID_CREDENTIALS responses. |
| T011/T013 | HS256 only, fixed issuer/audience, UUID subject, required integer iat/exp and 900-second lifetime. Tests reject missing/incorrect/future/expired claims, invalid subjects, foreign signatures, other algorithms, unsigned/malformed tokens, and malformed bearer headers. Middleware exposes subject only, including when a signed token contains role claims. |
| T012 | Explicit initialization and five-user seed CLI. Password preparation occurs outside transactions; one IMMEDIATE transaction rechecks absence and inserts only new accounts and roles. Credentials are displayed only by explicit CLI on creation, after commit. Reruns return no old passwords and preserve user IDs, hashes, active state, revoked roles, and requests. Missing-account replenishment changes only that account. Reopen/idempotence assertions inspect actual SQLite through an independent connection. |
| T014 | Injectable Express app with login as its only product endpoint; no listen side effect on import. JWT verification precedes protected JSON handling. JSON bodies have a 128 KiB limit, required media type, strict login keys/types, and malformed Unicode rejection. Errors use the approved envelope, safe messages, no-store, and Bearer challenge where applicable. Storage failures and unexpected exceptions are sanitized. |
| T014 | Server opens an existing initialized file; it does not initialize or seed on startup. Real listener test checks HTTP response, empty persisted users, draining close, database closure, and repeated close. CLI installs SIGINT/SIGTERM handlers using that close function; delivery of OS signals itself was not exercised. |
| T015 | Real login-issued tokens, committed role revocation with an existing token (403), disable/delete denial (401), and no-role denial despite signed Reviewer claims. Tests independently inspect SQLite and confirm rejected/login/read operations preserve saved state. A controlled disable during asynchronous derivation verifies post-hash active recheck without a held transaction. |
| T015 | Seeded credentials log in; independent Node crypto recomputation validates one persisted scrypt record. All five persisted salts are distinct. Response schemas contain no credential hashes, salts, passwords, or signing secrets. Fixture secrets/credentials are randomly generated and remain in memory. |

Production identity lookup and role decisions reuse existing store queries and transaction helpers.
The current-identity business helper must be invoked inside each operation's transaction; JWT role
claims never authorize. Future services must keep protected data access within that same scope.
Whole transaction calls are wrapped in withStorageErrors so BEGIN/COMMIT failures are included.

### Executed commands and outcomes

| Command/check | Observed result |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Expected feature and planning documents found. |
| Read-only checklist scan | requirements.md: 17 checked, zero unchecked; PASS. |
| `git rev-parse --git-dir` | Expected nonzero Git detection: this directory is not a Git repository. Existing ignore entries were reviewed directly. |
| `Test-Path .specify/extensions.yml` before/after work | False; no extension hooks configured. |
| `node --version` | v22.23.4 |
| `npm --version` | 10.9.9 |
| `npm ls --depth=0` | Exit 0; pinned dependencies unchanged, versions below. |
| `npm run typecheck` after initial implementation | Exit 0. |
| `npm run typecheck` with initial complete foundation tests | Exit 0. |
| `npm run build` | Exit 0; TypeScript emitted the production modules/scripts to dist/. No production source changed afterward. |
| First `npm test` | Exit 0; 4 files passed, 77 tests passed; reported duration 37.12 seconds. |
| `npm run typecheck` after additional identity/sanitization coverage | Exit 0. |
| Final `npm test` | Exit 0; 5 files passed, 82 tests passed; reported duration 45.23 seconds. Zero failures or skips. |

Both test runs used approved sandbox escalation because the same environment previously blocked
Vitest/child-process startup with EPERM. No new sandboxed test attempt is claimed for this run.
No failing typecheck, build, or test result occurred in this increment. Additional coverage was
added after the first passing run; that earlier 77-test result is preserved separately.

Final executed test inventory:

| File | Passed tests |
| --- | ---: |
| tests/unit/foundation.test.ts | 41 |
| tests/unit/jwt.test.ts | 20 |
| tests/unit/http-errors.test.ts | 4 |
| tests/integration/auth.test.ts | 11 |
| tests/integration/bootstrap.test.ts | 6 |
| Total | 82 |

Bootstrap integration also executed the actual `npm run db:init` once and `npm run db:seed`
twice, each through the installed npm CLI in a child process with a private temporary DATABASE_PATH
and a random in-memory signing secret. All three commands exited 0. It asserted persisted state
and first-run versus rerun output semantics. Child stdout containing disposable generated demo
passwords was captured privately, not printed or saved in reports. Other bootstrap tests invoke
the exported implementation directly; no command was run against a real demo database.

Compiled-module and native smoke command (exit 0):

```powershell
node --input-type=module -e "import assert from 'node:assert/strict'; import Database from 'better-sqlite3'; import { createApp } from './dist/src/app.js'; import { startServer } from './dist/src/server.js'; import { initializeDatabaseFile } from './dist/scripts/init-db.js'; import { seedDemoUsers } from './dist/scripts/seed-demo.js'; for (const fn of [createApp,startServer,initializeDatabaseFile,seedDemoUsers]) assert.equal(typeof fn,'function'); const db=new Database(':memory:'); try { console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,...db.prepare('SELECT sqlite_version() AS sqliteVersion').get(),compiledImports:'passed'})); } finally { db.close(); }"
```

Observed: `node=v22.23.4`, `platform=win32`, `arch=x64`, `sqliteVersion=3.54.1`,
`compiledImports=passed`. The integration suite also used real temporary SQLite files.
No local native compilation or clean dependency installation was performed in this increment.

Resolved direct packages rechecked: Express 5.3.0, better-sqlite3 13.2.0, jose 6.2.18,
TypeScript 7.0.2, tsx 4.23.15, Vitest 5.1.1, Supertest 7.3.2, @types/node 22.20.5,
@types/express 5.0.6, @types/better-sqlite3 9.6.0, @types/supertest 7.2.1.

Final read-only scope/hash checks verify existing configuration and approved documents are
unchanged, exactly T001–T016 are checked, all 41 later tasks remain pending, and no workflow
service, text-validation module, workflow handlers, or test-only product endpoints were added.

### Remaining limitations and unexecuted work

No unresolved blocker remains for T010–T016. Authentication/bootstrap and their foundation tests
are functional within the verified scope; the Change Request application is incomplete.

- Create/Edit/Submit/Approve/RequestChanges and all user-story endpoints/services are absent.
- AT-01–AT-06 and full SV-01–SV-05 acceptance coverage have not been implemented or run. Real
  concurrent-worker workflow/role-ordering races remain later work. Passing foundation tests
  do not demonstrate those requirements. Optional SV-06 is not run.
- No complete employee journey, production load/security claim, deployment, frontend, or
  excluded feature is delivered. Only local isolated tests/CLI runs were used.
- A token does not implement immediate logout. Current SQLite active state/roles govern
  subsequent operations; in-progress transaction ordering remains as planned.
- Password derivation holds no SQLite transaction. Initial and post-derivation checks are
  separate read snapshots; later protected operations still recheck current identity/roles.
- Current-role tests use test-only handlers. There is no public current-identity/role-management
  endpoint. Middleware itself performs cryptographic identity verification only.
- Scrypt tests assert actual work factors and outcomes, not constant-time wall-clock equality.
  Native loading is verified on this Windows x64 host, not other platforms/toolchains.
- Remaining product validation, final clean install/full delivery gates, README reconciliation,
  and manual quickstart journey belong to later authorized tasks.

Implementation stopped after T016.

## Owner test authoring: T017-T021

Date: 2026-11-22. Authorized scope: tests only, T017–T021. The earlier passing foundation
run above is preserved separately. This increment deliberately leaves owner behavior unimplemented.

**Disposition:** T017–T021 authoring requirements are complete. AT-01 and AT-02 fail. No User
Story, acceptance gate, or later implementation task is declared complete. The suite is red.

### Exact files changed

Created:

- `tests/integration/owner-contract.test.ts` (T017)
- `tests/integration/at-01-create-draft.test.ts` (T018)
- `tests/integration/at-02-submit.test.ts` (T019)
- `tests/unit/text.test.ts` (T020)
- `tests/integration/proposal-validation.test.ts` (T020)
- `tests/unit/owner-rules.test.ts` (T021)
- `tests/integration/owner-permissions.test.ts` (T021)
- `tests/support/owner.ts` (small shared real-file/login fixture helper)
- `tests/support/proposal-cases.ts` (shared independent product examples)

Updated only `specs/001-change-request-workflow/tasks.md` and this validation log.
Machine-readable run reports were generated under ignored `node_modules/.cache/`.
No production source, persistence methods, HTTP routes, schema, package/configuration files,
existing foundation tests, approved requirements, or API contracts were changed.

### Authored coverage and test isolation

| Task | Coverage |
| --- | --- |
| T017 | Five owner endpoints; OpenAPI field sets; strict bodies; response fields, JSON/no-store/relative Location headers; all-status owner reads; sorted owner list and empty list; editable Draft/ChangesRequested content replacement; returned Submit with retained comment; malformed UUIDs and missing/nonpositive/fractional/unsafe/wrong-type Version; media, malformed JSON and envelope limits. |
| T018 | One individually named AT-01: real login-issued token, HTTP 201/Location/Draft/V1/null feedback and exact proposal/owner; independent inserted row and row-count checks; existing rows/users/roles unchanged. |
| T019 | One individually named AT-02: owned complete Draft V1, valid Submit, HTTP 200 PendingReview V2; independently persisted content/owner/comment retained, exactly one increment and unchanged row count/other rows/users/roles. |
| T020 | Independent expected limits Title 200/Description 5000/Reason 2000; unit and HTTP matrices for Create, Edit in Draft/ChangesRequested, and Submit from both states. Exact/max+1, padded limits, blank/missing/non-string, NBSP/BOM/ASCII whitespace, astral and combining code points, interior whitespace, no normalization/truncation, and malformed-surrogate transport cases. Submit deliberately seeds invalid saved text to require revalidation. |
| T021 | Owner/non-owner and dual-role cases; authenticated no-role, wrong-role, disabled and anonymous actors; current-role revocation; owner reads in all four states; Read/Edit/Submit ownership; Edit/Submit allowed/denied states and Version-before-status precedence; protected Create/PUT fields, with valid-looking override values; missing IDs with a known-resource positive control. Pure owner-branch identity/role/ownership/state/Version rules. |

The helper creates a private seeded template using the existing fixture and password helpers.
Active test identities obtain actual JWTs through HTTP login. Disabled-user tests use the existing
token-issuance helper because disabled users cannot log in. Each HTTP test gets a **new temporary
SQLite file** with committed copies of controlled users, roles, and prepared requests, an explicit
app/database binding, and a separate read-only assertion connection. The template and each file
are cleaned up with the existing connection/path cleanup helpers. No shared demo database, mock
persistence, test-wide rollback, fixed port, or production diagnostic endpoint is introduced.

Only fixture setup writes SQL; it does not implement or simulate application operations. Copies
of test JWTs identify the copied users but never cache roles or authorization decisions.

The unit authoring interfaces are `validateText(field, value): string` in the future T022 module,
and `assertOwnerOperation(identity, operation, resource?, expectedVersion?): void` in T024 rules.
Valid text must be returned unchanged; failures use BusinessError codes. The guard's Read case is
the owner-specific branch, not an amendment to independent Reviewer PendingReview access.
The tests probe availability and explicitly fail when those functions are absent. They do not add
stubs, mark tests skipped/expected-to-fail, or create production implementations.

### Commands and observed results

| Command/check | Actual outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Expected feature/planning documents found. |
| Read-only checklist scan | requirements.md: 17 checked, 0 unchecked; PASS; unchanged. |
| `git rev-parse --git-dir` | Expected nonzero detection: no Git repository; existing ignore settings reviewed directly. |
| `Test-Path .specify/extensions.yml` before/after work | False; no hooks configured. |
| Initial `npm run typecheck` | Exit 1, TS2345: helper body typed unknown could include null, outside Supertest's declared send argument type. This was a genuine authoring defect, not an expected business failure. |
| `npm run typecheck` after narrowing the helper body to string/object | Exit 0. |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/owner-authoring-results.json` | Exit 1: 613 tests executed, **107 passed / 506 failed / 0 pending / 0 todo**. Five files passed and seven failed. |
| Read-only JSON failure classification | All 506 failures classified: 389 missing owner-route responses (404 where an implemented route is required), 69 missing T022 validator, 48 missing T024 owner guard. Zero unexpected failure categories. All test cases were collected/executed; no hook/import/worker startup failure appeared. |
| Final `npm run typecheck` after stronger protected-field fixture values | Exit 0. |
| `npm test -- tests/integration/owner-permissions.test.ts --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/owner-permissions-final.json` | Exit 1: 78 tests, **5 passed / 73 failed / 0 pending**. All 73 failures remain missing owner routes; zero unexpected failure categories. |

Both behavioral commands used approved sandbox escalation because this Windows sandbox previously
blocked Vitest child processes. Two workers limit unnecessary fixture/password-derivation contention;
no committed runner setting was changed. No fresh sandbox/environment defect was observed.

The permissions-only rerun followed a test-data change: protected-field cases now send valid-looking
UUIDs, Approved status and role arrays, so invalid value shapes cannot substitute for protection.
No production code or other tests changed after the full run. The full run was not repeated after
that isolated refinement; its affected file was rerun as shown. Historical and final-file results
are reported separately rather than represented as a new full-suite run.

Full-run file counts:

| Test file/group | Passed | Failed |
| --- | ---: | ---: |
| Existing five foundation files | 82 | 0 |
| owner-contract.test.ts | 2 | 35 |
| at-01-create-draft.test.ts | 0 | 1 |
| at-02-submit.test.ts | 0 | 1 |
| proposal-validation.test.ts | 18 | 279 |
| text.test.ts | 0 | 69 |
| owner-permissions.test.ts | 5 | 73 |
| owner-rules.test.ts | 0 | 48 |
| Total | 107 | 506 |

New tests alone: 531 authored, 25 passed, 506 failed. The 25 passes are contract-document checks
and already-existing anonymous authentication/media/JSON/Unicode transport protections. They
do not demonstrate implemented owner endpoints, ownership enforcement, or proposal business rules.

AT-01 and AT-02 each executed and failed on HTTP 404 instead of 201/200. Each test collected an
independent SQLite snapshot after the response. Their success-state assertions are present but
not reached after that failing HTTP assertion; no successful creation/submission or passing
persisted-state acceptance evidence is claimed. Missing-ID tests first require a known owner
GET to return 200, preventing a catch-all 404 from masquerading as correct missing-resource behavior.

### Scope and remaining work

Read-only hash/scope checks verify all production files, existing fixtures/tests, configuration,
contracts and approved planning inputs are unchanged; only T001–T021 are checked out of 57 tasks.
T017–T021 checks mean test authoring is finished, **not** that their behavior passes. T022–T057
remain pending; in particular, T027 and the User Story 1 checkpoint are unfulfilled.

No build was run in this tests-only increment; the earlier foundation build result above is
historical. No dependency installation, workflow implementation, real race harness, manual journey,
or full MVP validation was performed. Expected missing behavior remains a delivery blocker for
the User Story, while the test-authoring scope itself has no unresolved test/environment defect.

Implementation stopped after T021 as requested.

## Requester implementation: T022-T027

Date: 2026-11-22. Authorized scope: T022–T027 only. Environment rechecked:
Node.js v22.23.4 / npm 10.9.9 on Windows. Earlier foundation and test-authoring results above
remain separate historical runs, including their failures.

**Result:** T022–T027 pass their scoped acceptance criteria. Final run: **614 passed, 0 failed,
0 pending, 0 todo**, across 12 files. **AT-01 and AT-02 each pass**, with HTTP and independent
actual SQLite assertions reached. T001–T027 are complete; T028–T057 remain unchecked.

### Exact changed files

Created:

- `src/business/text.ts`
- `src/business/change-requests.ts`

Updated:

- `src/business/rules.ts`
- `src/persistence/store.ts`
- `src/http/routes.ts`
- `src/app.ts`
- `src/http/errors.ts`
- `tests/integration/owner-contract.test.ts` — one added malformed-percent-encoding regression;
  existing tests/assertions were not weakened or deleted.
- `specs/001-change-request-workflow/tasks.md`
- `specs/001-change-request-workflow/validation.md` — this appended section.

Generated: ignored `dist/` output and machine-readable reports in `node_modules/.cache/`.
No dependencies were installed. Package/configuration files, schema/transaction helpers,
authentication implementation, existing fixtures, other tests, approved requirements, API
contracts and planning decisions were preserved. No demo database or real credentials were created.

### Verified implementation

| Task | Behavior and verification |
| --- | --- |
| T022 | One canonical validator uses ECMAScript trim on a measurement copy and Unicode code-point counting, returning original text. Required/blank/overlength and malformed/non-string cases have the specified errors. Title/Description/Reason limits are 200/5000/2000; the canonical future comment limit is 2000. Transport Unicode checking was moved from routes into this shared module, preserving login behavior and rejecting malformed JSON strings/keys before storage. Unit and HTTP boundary matrices pass, including astral, combining, NBSP/BOM, interior/surrounding whitespace, no normalization/truncation, and invalid saved-content Submit. |
| T023 | Bound Draft insertion with server-controlled owner/status/Version/null feedback; ID/owner reads and sorted lists. Edit/Submit each use exactly one conditional UPDATE matching ID, owner, expected Version, and Draft/ChangesRequested, incrementing Version once in the same SQL statement. No unconditional fallback exists. Proposal-only Edit and status-only Submit leave owner/feedback unchanged. SQL predicates also prevent an unsafe Version increment. Services require exactly one changed row. |
| T024 | Pure Requester/current-identity/ownership rules follow role, existence, ownership, Version, status ordering. Both editable states are supported; PendingReview/Approved Edit/Submit reject. Stale intent precedes invalid status for an otherwise authorized caller. Dual roles do not permit non-owner editing/submission or owner access without Requester. Protected fields are rejected by strict body/proposal validation, never silently ignored. |
| T025 | Services own synchronous IMMEDIATE scopes for Create/Edit/Submit and read snapshots for retrieval/listing. Current identity and roles are reloaded from SQLite inside each scope; no JWT role authority or cached authorization. Text validation, conditional writes and saved-result reads remain in the mutation transaction; success reaches HTTP only after commit. Whole-scope error translation includes BEGIN/COMMIT. Safe Version exhaustion returns STORAGE_UNAVAILABLE rather than overflowing. |
| T026 | Added POST /api/change-requests, GET /mine, GET /{id}, PUT /{id}, POST /{id}/submit. Static /mine precedes the UUID route. Existing JWT-first JSON/media/size handling remains. Handlers check shape/UUID/safe positive Version, delegate business operations and return the approved status/body/Location. No Reviewer routes or generic status setter were added. |
| T027 | Existing 531 US1 cases pass, plus one added URL regression: 532 US1 tests. All 82 existing foundation regressions pass. Rejections inspect unchanged actual database snapshots, and successful mutations check saved fields/Version/comment through an independent read-only connection. |

Explicit AT results:

- **AT-01: PASS.** Real login-issued JWT; HTTP 201, relative Location, exact Draft response;
  independently persisted new row with unchanged supplied text, authenticated owner, Version 1,
  NULL feedback; row count increases by one and other rows/users/roles are unchanged.
- **AT-02: PASS.** Owned complete Draft V1; HTTP 200 PendingReview V2; independently persisted
  row has exactly that status/Version and unchanged content/owner/comment; row count and other
  data are unchanged.

These are separate executed tests, not results inferred from another journey or a mocked store.

### Actual commands, failures and outcomes

| Command/check | Observed outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Expected feature and planning documents available. |
| Read-only checklist scan | requirements.md: 17 checked, zero unchecked; PASS, unchanged. |
| `git rev-parse --git-dir` | Expected nonzero detection: directory is not a Git repository. Existing ignore entries inspected directly. |
| `Test-Path .specify/extensions.yml` before/after implementation | False; no extension hooks configured. |
| Initial `npm run typecheck` | Exit 0. |
| Initial `npm run build` | Exit 0. |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/us1-implementation-results.json` | Exit 0: all 613 existing tests passed, 0 failed/pending/todo, 12 files. Includes all 82 foundation tests and both AT tests. |
| `npm test -- tests/integration/owner-contract.test.ts --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/us1-uri-before-fix.json` | Exit 1: 37 passed, 1 failed, 38 total. Newly added malformed-percent-encoding regression observed HTTP 500 instead of required 400. This was a genuine error-mapping defect, not an expected missing feature. |
| Final `npm run typecheck` | Exit 0 after fixing the URIError mapping. |
| Final `npm run build` | Exit 0 after the same fix. |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/us1-final-results.json` | Exit 0: **614 passed, 0 failed, 0 pending, 0 todo**, all 12 files passed. |
| `node --version` / `npm --version` | v22.23.4 / 10.9.9. |

The URI regression demonstrated Express path-decoding errors reaching the generic server-fault
adapter. Mapping URIError to safe INVALID_REQUEST/400 fixes that Requester input boundary; the
final full run includes the added test. No original assertion was changed to obtain green results.

Vitest commands used approved sandbox escalation because this Windows sandbox previously blocked
worker/CLI process startup. No new environment failure occurred. Two workers were specified only
on the command line; runner configuration is unchanged. Builds and tests were rerun against the
final production revision after the error-mapping fix.

Final per-file results:

| File | Passed | Failed |
| --- | ---: | ---: |
| tests/integration/at-01-create-draft.test.ts | 1 | 0 |
| tests/integration/at-02-submit.test.ts | 1 | 0 |
| tests/integration/owner-contract.test.ts | 38 | 0 |
| tests/integration/owner-permissions.test.ts | 78 | 0 |
| tests/integration/proposal-validation.test.ts | 297 | 0 |
| tests/unit/owner-rules.test.ts | 48 | 0 |
| tests/unit/text.test.ts | 69 | 0 |
| tests/integration/auth.test.ts | 11 | 0 |
| tests/integration/bootstrap.test.ts | 6 | 0 |
| tests/unit/foundation.test.ts | 41 | 0 |
| tests/unit/http-errors.test.ts | 4 | 0 |
| tests/unit/jwt.test.ts | 20 | 0 |
| Total | 614 | 0 |

Final hash/scope checks confirm all original tests except the file with the single added
regression are byte-for-byte unchanged, approved documents/configuration remain unchanged,
and exactly T001–T027 are checked out of 57 tasks. No Reviewer method/route was implemented.

### Remaining limitations and expected failures

No unresolved blocker or remaining expected failure exists in the **current** User Story 1 /
foundation suite. Earlier 506 missing-implementation failures are historical and now resolved.

- Reviewer pending lists/independent reads, Approve, and RequestChanges remain unimplemented;
  current ID reads implement the owner branch only. Their final contracted behavior belongs
  to T028 onward and is not declared complete.
- AT-03–AT-06 have not been implemented/run as their mandatory acceptance tests. Existing stale
  Version/state tests establish initial guards but do not replace AT-06 or real competing-worker
  race coverage. No healthy race/revocation ordering or SC-004 repetition target is claimed.
- ChangesRequested Edit/Submit is verified from prepared real-file fixtures. The complete
  Reviewer return/revision/resubmission cycle and approval/comment-replacement lifecycle await
  later tasks. Initial comment preservation on owner Edit/Submit is verified now.
- Final clean-install, manual quickstart, complete contract/permission matrices, delivery review,
  README reconciliation and full MVP validation remain later work. No deployment, frontend,
  excluded feature, production-scale claim or new architecture was introduced.

Implementation stopped after T027 as requested.

## Reviewer test authoring (T028–T033)

Date: 2026-11-22. Environment observed again: Windows, Node.js v22.23.4, npm 10.9.9.
Scope: author and execute only the six Reviewer test tasks following completed T027.
No production source, SQL store methods, business operations, HTTP routes, dependencies,
configuration, constitution, specification, or API contracts were changed.

T028–T033 are complete as **test-authoring tasks**, not passing Reviewer implementation.
T034–T057 remain unchecked. The User Story 2 checkpoint and complete MVP are not satisfied.

### Exact files added or updated

| File | Change and traceability |
| --- | --- |
| tests/integration/reviewer-contract.test.ts | Added T028: strict OpenAPI VersionBody/ReturnBody, pending-only independent sorted/empty list, authorized read, exact decision representations, post-decision GET denial/list removal, Version/shape/UUID/JSON/media/envelope checks; FR-006/008/015/016. |
| tests/integration/at-03-self-approval.test.ts | Added T029: separate AT-03; real logged-in dual-role owner, current Version, required 403 FORBIDDEN, complete unchanged SQLite snapshot; AS-09, FR-001/007/011/013/017. |
| tests/integration/at-04-approve.test.ts | Added T030: separate AT-04; independent Reviewer, required 200 Approved, exactly one Version increment and retained proposal/owner/latest comment in HTTP and SQLite; AS-07, FR-006/009/012/013/017. |
| tests/integration/at-05-approved-edit.test.ts | Added T031: separate AT-05; owner, valid changed proposal and current Version isolate the Approved status rule, required 409 INVALID_STATUS and complete unchanged SQLite snapshot; AS-25, FR-004/009/013/017. |
| tests/integration/reviewer-permissions.test.ts | Added T032: Reviewer-only access, no-role/Requester/anonymous/disabled/invalid-signature denials, committed role grant/revocation and identity disable/delete with existing tokens, read scope/owner fallback, self-approval/self-return, all four states, Version-before-status and independence-before-Version ordering, safe errors; SV-03/04, AS-06/10/11/13/23. |
| tests/unit/reviewer-rules.test.ts | Added T032: pure independent-review branch tests, no HTTP/persistence dependency. Test-first assertReviewerOperation interface parallels the existing owner guard; missing T035 implementation fails explicitly at function availability rather than breaking discovery/typecheck. |
| tests/integration/request-changes.test.ts | Added T033: required feedback, 2000/2001 code-point limits, trim/astral/combining/interior-whitespace/malformed-surrogate cases with absent and retained C1, atomic C1-to-C2 replacement, owner visibility and forbidden comment mutation, retention through Edit/Submit/Approve, unchanged rejected operations; SV-02, AS-08/14/15/26/27/28/29, FR-008/013/014/018. |
| specs/001-change-request-workflow/tasks.md | Marked only T028–T033 newly complete; updated status/evidence to distinguish test authoring and expected failures from behavior completion. |
| specs/001-change-request-workflow/validation.md | Appended this actual execution report; earlier runs preserved. |

### Fixtures and acceptance assertions

Reused existing tests/support/owner.ts, database.ts, and proposal-cases.ts without changes.
Each HTTP test gets a fresh real SQLite file, existing schema, independently readable committed
fixtures, and actual bearer authentication. The fixture template supplies only test users and
their already-hashed passwords; no demo database or authorization-result cache is used.
The independent read-only assertion connection inspects actual persisted rows after HTTP
completion. Rejections compare complete users/roles/requests snapshots; successful mutations
compare the whole expected snapshot, including row count, all proposal fields, owner, status,
comment, and Version. Subsequent GET checks supplement, rather than replace, SQL assertions.

Direct bound SQL is confined to test fixture preparation and committed identity/role maintenance.
Every decision under test goes through HTTP; there is no test implementation of Approve or
RequestChanges. Comment validation uses the independent 23-case product matrix at limit 2000,
once with no previous comment and once with retained C1. Valid text must remain byte-for-byte
unchanged as a JavaScript string, including surrounding whitespace and decomposed sequences.
The C1-to-C2 lifecycle test is authored but fails at its first unimplemented review decision;
later success assertions in that test have not executed successfully.

### Commands and observed outcomes

| Command/check | Observed outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Exit 0; expected feature and planning artifacts available. |
| Read-only checklist scan | requirements.md: 17 checked, 0 unchecked; PASS; file unchanged. |
| `git rev-parse --git-dir` | Expected nonzero detection: workspace is not a Git repository. Existing .gitignore inspected; private package does not require publish ignores. |
| `Test-Path .specify/extensions.yml` before/after authoring | False; no implementation hooks configured. |
| `npm run typecheck` | Exit 0 with all seven new test files present. |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/reviewer-authoring-results.json` | Exit 1: **853 total, 663 passed, 190 failed, 0 pending/skipped, 0 todo**, 19 test files. |
| JSON result inspection | Every failure inspected by assertion-message category; all correspond to missing Reviewer implementation described below. All original 614 tests passed. No fixture setup, discovery, import, cleanup, or environment defect observed. |
| `rg -n '\.(skip|todo|fails)\b'` over the seven new files | No matches (rg exit 1 denotes no matches); no expected-failure inversion or skipped tests. |
| SHA-256 baseline comparison | All original production, tests/support, existing tests, configuration, requirements and contracts unchanged; only the seven added tests and two report/task documents differ. |
| `node --version` / `npm --version` | v22.23.4 / 10.9.9. |

Vitest used approved escalation for Windows worker/process startup, as required by the previously
observed sandbox limitation. No installation or dependency/configuration change was necessary.
No application build was run in this tests-only increment; the earlier successful build is
historical evidence, not a newly executed build. The generated JSON report is local ignored
runner output under node_modules/.cache, not an additional source/delivery file.

### Exact per-file results

| File | Passed | Failed |
| --- | ---: | ---: |
| tests/integration/reviewer-contract.test.ts | 7 | 35 |
| tests/integration/at-03-self-approval.test.ts | 0 | 1 |
| tests/integration/at-04-approve.test.ts | 0 | 1 |
| tests/integration/at-05-approved-edit.test.ts | 1 | 0 |
| tests/integration/reviewer-permissions.test.ts | 24 | 52 |
| tests/integration/request-changes.test.ts | 17 | 47 |
| tests/unit/reviewer-rules.test.ts | 0 | 54 |
| New tests subtotal | 49 | 190 |
| tests/integration/at-01-create-draft.test.ts | 1 | 0 |
| tests/integration/at-02-submit.test.ts | 1 | 0 |
| tests/integration/owner-contract.test.ts | 38 | 0 |
| tests/integration/owner-permissions.test.ts | 78 | 0 |
| tests/integration/proposal-validation.test.ts | 297 | 0 |
| tests/unit/owner-rules.test.ts | 48 | 0 |
| tests/unit/text.test.ts | 69 | 0 |
| tests/integration/auth.test.ts | 11 | 0 |
| tests/integration/bootstrap.test.ts | 6 | 0 |
| tests/unit/foundation.test.ts | 41 | 0 |
| tests/unit/http-errors.test.ts | 4 | 0 |
| tests/unit/jwt.test.ts | 20 | 0 |
| Existing regression subtotal | 614 | 0 |
| Total | 663 | 190 |

### Failure classification and remaining limitations

All 190 failures remain ordinary failing assertions, not passing acceptance evidence:

| Observed missing implementation | Failures | Explanation |
| --- | ---: | --- |
| Decision HTTP 404 | 123 | Approve/RequestChanges routes do not exist. Expected cases require 200/400/401/403/409/422. Includes AT-03 (404 instead of 403) and AT-04 (404 instead of 200). |
| Pending-list HTTP 400 | 10 | Missing static pending-review route reaches the owner UUID handler; expected list/current-role outcomes are 200/401/403. |
| Independent read HTTP 403 | 3 | Existing GET implements only owner access; authorized independent Reviewer reads should return 200. |
| Missing pure Reviewer guard | 54 | T035 assertReviewerOperation is intentionally absent. Test-first interface availability checks fail explicitly. |
| Total | 190 | No unrelated failure category observed. |

AT-03's complete unchanged-state assertion passed before its HTTP assertion failed; 404 does not
establish the required self-approval policy. AT-04 captures actual SQLite state, but its required
success and persisted Approved assertions are not passing. **AT-05 passes**, verifying the
existing Approved-edit rule with both HTTP and independent complete database-state assertions.
AT-01 and AT-02 continue to pass unchanged. Shared transport/identity denials and existing owner
comment protections account for some passing new cases; they do not prove Reviewer functionality.
The two absent-ID decision cases currently pass via the catch-all 404; they must be assessed with
the positive decision cases at T038 and cannot establish that a decision route exists.

No environment or test-authoring blocker remains. Reviewer behavior remains deliberately
unimplemented and the suite deliberately red until authorized T034–T038 work. Real competing-worker
races, transactional revocation orderings, AT-06, persistence-failure injection and final delivery
validation remain their later tasks; sequential maintenance tests here make no race-proof claim.
No existing assertions were weakened, deleted, skipped or inverted. Only T001–T033 are checked
out of 57 tasks; the six new checkmarks represent completed authoring, not a green US2 gate.

Stopped after T033. T034 and all later implementation tasks were not started.

## Reviewer implementation (T034–T038)

Date: 2026-11-22. Observed environment: Windows, Node.js v22.23.4, npm 10.9.9.
Scope: implement the existing Reviewer test requirements from T028–T033, using the approved
schema, authentication, transaction helpers, business errors, canonical text validator and
HTTP contract. Earlier authoring results above remain historical evidence.

### Exact files changed and behavior

| File | Change |
| --- | --- |
| src/persistence/store.ts | T034: bound pending-review query excludes the actor's own requests and sorts by ID; two conditional decision UPDATEs match ID, expected Version, PendingReview status, independent requester identity, and safe increment bound. Both increment once; only RequestChanges replaces reviewer_comment. Existing transaction requirement retained. |
| src/business/rules.ts | T035: pure assertReviewerOperation and ReviewerOperation type; current active identity/current Reviewer role, existence, unconditional independent-review checks, Version-before-status ordering, PendingReview-only Reviewer reads and decisions. Existing owner guard preserved. |
| src/business/change-requests.ts | T036: snapshot-consistent pending list/shared reads and synchronous IMMEDIATE Approve/RequestChanges services. Reload roles within the transaction; shared GET uses owner+Requester access before the independent Reviewer branch. Validate comment through existing validateText, check safe Version advancement, require one updated row, read result within the transaction, and return only after commit. |
| src/http/routes.ts | T037: static pending-review route precedes the UUID route; shared GET invokes authorized read service; strict Approve VersionBody and RequestChanges ReturnBody delegate to services. Existing JWT, JSON, UUID/Version, error/no-store handling reused. |
| specs/001-change-request-workflow/tasks.md | T038: scoped completion markers/status and evidence link, contingent on actual verification below. |
| specs/001-change-request-workflow/validation.md | T038: this appended execution report. |

No new dependencies, tables, endpoints outside the approved contract, infrastructure layers or
excluded product features were introduced. Existing tests and fixture helpers were not edited.

### Transaction, permission and feedback review

- Protected reads load current identity/roles and authorized data in one existing read transaction.
  The pending list contains only other owners' PendingReview requests. Shared GET preserves
  owner+Requester access in every status, including dual-role owners; independent Reviewer access
  ends when the request leaves PendingReview. Reviewer-only owners cannot use that branch.
- Both decisions enter the existing synchronous IMMEDIATE transaction before current identity/role
  lookup. Independence is checked before Version/status, forbidding both self-approval and
  self-return even for dual-role users. An otherwise authorized stale Version yields 409
  VERSION_CONFLICT; current Version in an invalid status yields 409 INVALID_STATUS.
- The conditional SQL predicates repeat Version, PendingReview and non-owner checks. Proposal
  fields and requester_id are never assigned by a decision. Approved status/Version are written
  together while preserving feedback; ChangesRequested status/comment/Version are written together.
  Exactly one affected row is required. Existing safe-Version and storage-error safeguards apply.
- RequestChanges requires a string containing non-whitespace text, with at most 2000 Unicode code
  points after surrounding trim. Existing validator preserves the original text, counts astral
  characters once and combining code points separately, and rejects malformed Unicode. HTTP
  shape checks remain separate from service text validation.
- The transaction wrapper completes COMMIT before the service returns to res.json. The authorized
  mutation response uses the saved result directly, without applying the narrower subsequent GET
  permission. Exceptions propagate through the existing rollback/storage/error handling; there
  is no automatic replay or cached role result.

These are implementation review observations supported by the tests below, not evidence of the
later coordinated concurrency/commit-failure experiments. Those remain outside this increment.

### Executed checks

| Command/check | Observed outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Exit 0; expected feature and required planning artifacts available. |
| Read-only checklist scan | requirements.md: 17 checked, 0 unchecked; PASS; unchanged. |
| `git rev-parse --git-dir` | Expected nonzero repository detection: workspace is not a Git repository. Existing .gitignore inspected; no missing relevant exclusions found. Package remains private. |
| `Test-Path .specify/extensions.yml` before/after implementation | False; no implementation hooks configured. |
| `npm run typecheck` | Exit 0. |
| `npm run build` | Exit 0. |
| `npm test -- tests/integration/reviewer-contract.test.ts tests/integration/at-03-self-approval.test.ts tests/integration/at-04-approve.test.ts tests/integration/at-05-approved-edit.test.ts tests/integration/reviewer-permissions.test.ts tests/integration/request-changes.test.ts tests/unit/reviewer-rules.test.ts --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/reviewer-implementation-focused.json` | Exit 0: **239 passed, 0 failed, 0 pending/skipped, 0 todo**, 7 files. |
| `node --version` / `npm --version` | v22.23.4 / 10.9.9. |

Focused per-file results: reviewer-contract 42; AT-03 1; AT-04 1; AT-05 1;
reviewer-permissions 76; request-changes 64; reviewer-rules 54. All passed.

Vitest used approved escalation for Windows child-process startup and real temporary SQLite files,
following the previously observed sandbox restriction. No new environment failure occurred.
Runner JSON files under ignored node_modules/.cache are local execution evidence, not delivery
source files. No dependency installation was needed.

### Full regression results and resolved failures

`npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/reviewer-implementation-full.json`
completed with exit 0: **853 passed, 0 failed, 0 pending/skipped, 0 todo**, 19 files.
All 614 pre-Reviewer tests remain passing, together with all 239 Reviewer tests. No checks in
this implementation increment failed, and no tests were edited, deleted, skipped or inverted.

| File | Passed | Failed |
| --- | ---: | ---: |
| tests/integration/at-01-create-draft.test.ts | 1 | 0 |
| tests/integration/at-02-submit.test.ts | 1 | 0 |
| tests/integration/at-03-self-approval.test.ts | 1 | 0 |
| tests/integration/at-04-approve.test.ts | 1 | 0 |
| tests/integration/at-05-approved-edit.test.ts | 1 | 0 |
| tests/integration/auth.test.ts | 11 | 0 |
| tests/integration/bootstrap.test.ts | 6 | 0 |
| tests/integration/owner-contract.test.ts | 38 | 0 |
| tests/integration/owner-permissions.test.ts | 78 | 0 |
| tests/integration/proposal-validation.test.ts | 297 | 0 |
| tests/integration/request-changes.test.ts | 64 | 0 |
| tests/integration/reviewer-contract.test.ts | 42 | 0 |
| tests/integration/reviewer-permissions.test.ts | 76 | 0 |
| tests/unit/foundation.test.ts | 41 | 0 |
| tests/unit/http-errors.test.ts | 4 | 0 |
| tests/unit/jwt.test.ts | 20 | 0 |
| tests/unit/owner-rules.test.ts | 48 | 0 |
| tests/unit/reviewer-rules.test.ts | 54 | 0 |
| tests/unit/text.test.ts | 69 | 0 |
| Total | 853 | 0 |

All 190 failures from the earlier T028–T033 authoring run are now resolved:

| Historical failure category | Count resolved | Implemented correction |
| --- | ---: | --- |
| Decision route catch-all 404 | 123 | Registered strict decision routes and transactional services with the required success, authorization, validation and conflict outcomes. |
| Static pending list reached UUID handler (400) | 10 | Registered current-Reviewer pending list before the ID route. |
| Independent pending read forbidden (403) | 3 | Shared GET now dispatches to owner or independent Reviewer permission branch. |
| Missing pure Reviewer guard | 54 | Implemented assertReviewerOperation with independence, Version, status and read-scope rules. |
| Total | 190 | Existing assertions retained unchanged. |

AT-03 now returns 403 FORBIDDEN for the dual-role owner and verifies complete unchanged actual
SQLite state. AT-04 now returns 200 Approved with Version +1 and verifies the committed row,
retained latest comment, unchanged proposal/owner and untouched other rows/users/roles. AT-05
continues to verify 409 INVALID_STATUS for a valid current-Version owner edit of Approved and
complete unchanged state. AT-01 and AT-02 remain passing. All critical tests use existing real
temporary files and independent assertion connections; response equality or GET is not the sole
persistence evidence.

Passing Reviewer tests also establish both self-review denials, all four starting states with
current and stale Versions, current-role grant/revocation and disabled/deleted subjects with
existing tokens, pending-list/read visibility, post-decision GET denial, original Unicode text
preservation and feedback limits, atomic latest-comment replacement, owner Edit/Submit and
approval feedback retention, and unchanged complete snapshots after rejected operations.

### Final scope and remaining work

SHA-256 comparisons against the 88-file starting baseline confirm exactly the six files listed
above changed. All existing tests, fixtures, schema/transaction/authentication helpers,
configuration, dependencies/lockfile, constitution, specification, planning documents and API
contracts are unchanged. Generated build output and local runner JSON remain ignored artifacts.
No file was added or deleted. T001–T038 are checked out of 57 tasks; T039–T057 remain unchecked.

T034–T038 acceptance conditions and the scoped User Story 2 gate pass. No unresolved failure,
expected failure or blocker remains in the current suite. This is not final MVP delivery:
AT-06, real coordinated workers/race orderings, contention/commit-failure experiments, SC-004
repetitions and later verification/delivery work have not been executed. Sequential stale and
role-maintenance checks do not substitute for those later concurrency tests. The HTTP response
after commit is implemented using the existing transaction wrapper; no new injected commit-failure
experiment is claimed here.

Implementation stopped after T038 as requested. T039 or later tasks were not started.

## Concurrency test authoring (T039–T042)

Date: 2026-11-22. Observed environment: Windows, Node.js v22.23.4, npm 10.9.9.
Scope: test authoring only, following the completed T038 gate. The executable independent-worker
harness and worker modules belong to T043 and deliberately remain absent. Neither production
code nor the existing tests/fixtures/configuration were changed.

### Exact added and updated files

| File | Change and traceability |
| --- | --- |
| tests/integration/at-06-stale-version.test.ts | T039: separate mandatory AT-06 cases for Draft and ChangesRequested; original GET, successful newer PUT, stale PUT with 409 VERSION_CONFLICT, complete independent committed-state comparisons, retained status/owner/comment and no error disclosure; AS-24, FR-011/012/013/016/017. |
| tests/integration/concurrency.test.ts | T040: seven fixture pairs, 20 separately named rounds each, alternating the reserved writer. Covers edit/edit and edit/Submit in both editable statuses, Approve/RequestChanges, Approve/Approve, RequestChanges/RequestChanges. Requires distinct worker/connection identities, actual overlapping transaction events, exact 200/409 outcomes, whole winning row/snapshot, no mixed proposal/feedback, and deliberate recovery after fresh reads; SV-05, AS-17–21, SC-004. |
| tests/integration/role-revocation.test.ts | T041: committed role deletion/disablement on a maintenance connection with existing tokens for all nine protected operation branches, plus both controlled worker transaction orderings for all five mutations. Requires authentication before maintenance, same-token retry after maintenance, no retroactive rejection of a transaction ordered first, and actual expected whole SQLite state; AS-20, FR-001/011, SV-03/05. |
| tests/integration/storage-conflicts.test.ts | T042: six applicable mutation/status combinations at Version exhaustion, stale-before-exhaustion precedence, unsafe client Version, and the final safe increment. Separate begin-lock and commit-lock scenarios for all five mutations require 503 STORAGE_BUSY, no committed mutation/partial state, IPC lock release and deliberate recovery; FR-012/013/016. |
| tests/support/race-contract.ts | Shared test-first types, assertions and dynamic dependency loader for T040–T042. Specifies createRaceHarness, separate workers/connections, HTTP commands, parent-sequenced IPC events, controlled reservation ordering, same-token maintenance retry, lock stages, deadlines, and awaited cleanup. No worker, scheduling, lock implementation or simulated result is supplied. |
| specs/001-change-request-workflow/tasks.md | Scoped authoring status/completion markers and evidence link. Implementation/concurrency validation gates remain distinct. |
| specs/001-change-request-workflow/validation.md | This appended actual execution report; earlier reports remain separate historical runs. |

### Authoring review and dependency contract

Existing ownerContext/database fixtures supply a fresh real SQLite file for every HTTP test,
real login-issued bearer tokens, and a separate read-only assertion connection. AT-06 compares
the complete snapshot after the winning edit, then confirms that exact snapshot survives the
stale write. Sequential permission tests use an additional committed maintenance connection;
they reuse the existing JWT and inspect persisted users/roles/requests, not just HTTP output.
Version-boundary cases also compare actual whole snapshots or the exact single accepted change.

Worker-dependent tests dynamically require both tests/support/race-harness.ts and race-worker.ts.
Their absence raises a named T043DependencyUnavailable error containing
T043_DEPENDENCY_UNAVAILABLE. It fails the individual test visibly instead of skipping, marking it
as todo/expected-failure, importing a missing module at discovery, or substituting a local stub.
The loader/helper defines only the interface needed to author the tests; T043 is not implemented.

The harness contract requires HTTP operations in independent application workers connected to
the same fixture file. A writer holding IMMEDIATE is released when the other worker reports
begin-attempt, without waiting for that blocked worker to acquire a reservation. Parent-sequenced
IPC events must establish reservation/attempt/commit ordering. Healthy races use the approved
1000 ms busy timeout and require exactly one 200 and one 409 VERSION_CONFLICT; 503 is a failure,
never a successful race outcome. Twenty rounds per pair alternate the requested winner so both
orders have explicit assertions. This is authored coverage, not an executed SC-004 result.

Permission-order cases require the worker's JWT to exist before maintenance, then require a
post-maintenance retry using the same JWT and worker, without re-login. Mutation-first ordering
allows one legal committed mutation before role removal/disablement; maintenance-first denies
it. Both must deny subsequent attempts and produce only the expected maintenance/business state.

Separate contention cases specify a test-only shorter 100 ms busy timeout. Begin contention holds
an independent IMMEDIATE reservation. Commit contention holds a reader's SHARED lock, requires
the mutation to reach UPDATE/COMMIT, then requires rollback and no success. IPC release and
awaited harness.close() in finally precede fixture cleanup. Timeout/startup/IPC failures must
remain visible. Test helper types do not execute these worker/lock mechanisms.

### Checks executed

| Command/check | Observed outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Exit 0; expected feature/planning documents available. |
| Read-only checklist scan | requirements.md: 17 checked, 0 unchecked; PASS; unchanged. |
| `git rev-parse --git-dir` | Expected nonzero repository detection: workspace is not a Git repository. Existing .gitignore inspected; package remains private. |
| `Test-Path .specify/extensions.yml` before/after authoring | False; no implementation hooks configured. |
| `npm run typecheck` | Exit 0 with all five added TypeScript files present. |
| `Test-Path tests/support/race-harness.ts` / `Test-Path tests/support/race-worker.ts` | Both False; T043 dependency unavailable. |
| `rg -n '\.(skip|todo|fails)\b'` over the five added files | No matches; no skipped or inverted-failure tests authored. |
| `node --version` / `npm --version` | v22.23.4 / 10.9.9. |

No application build or dependency installation was run in this tests-only increment. Earlier
successful builds remain historical evidence. Vitest uses approved escalation for Windows worker
startup and real temporary SQLite files, following the previously observed sandbox restriction.

### Actual test results

`npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/concurrency-authoring-results.json`
completed with exit 1: **1067 total, 897 passed, 170 failed, 0 pending/skipped, 0 todo**, 23 files.
The ignored local JSON output was inspected for every failure-message category and per-file counts.

| Test group/file | Passed | Failed | Dependency-blocked subset of failures |
| --- | ---: | ---: | ---: |
| tests/integration/at-06-stale-version.test.ts | 2 | 0 | 0 |
| tests/integration/concurrency.test.ts | 0 | 140 | 140 |
| tests/integration/role-revocation.test.ts | 18 | 20 | 20 |
| tests/integration/storage-conflicts.test.ts | 24 | 10 | 10 |
| New-test subtotal | 44 | 170 | 170 |
| All 19 existing test files, unchanged | 853 | 0 | 0 |
| Full suite | 897 | 170 | 170 |

Blocked counts are a classification of the 170 ordinary failed tests, not additional test cases
or Vitest skips. All 170 have the same first failure message:

```text
T043DependencyUnavailable: T043_DEPENDENCY_UNAVAILABLE: independent race-harness.ts/race-worker.ts are not implemented; no concurrency behavior executed.
```

The blocked breakdown is 140 race rounds (seven pairs × 20), 20 permission-order cases (five
mutations × two maintenance types × both orderings), and 10 contention cases (five mutations ×
begin/commit). These tests were discovered and entered, but failed at the dependency loader before
any coordinated worker behavior or downstream HTTP/state assertions executed. No worker rounds,
ordering guarantees, begin-lock timeout, commit-lock rollback, lock recovery or SC-004 repetition
success is claimed. Availability is deliberately not supplied by a fake implementation.

The 44 passing new tests are:

- AT-06 in both Draft and ChangesRequested: newer HTTP update saved exactly once; stale update
  returns 409 VERSION_CONFLICT and preserves the complete newer independent SQLite snapshot.
- Eighteen existing-token permission checks: role deletion and disablement for all nine protected
  operation branches. The maintenance change commits on its own connection; later calls reuse
  their previous token, return 403/401 respectively, and preserve all post-maintenance state.
- Twenty-four Version checks: six mutation/status combinations each cover current Version at
  MAX_SAFE_INTEGER (503 STORAGE_UNAVAILABLE), stale Version before exhaustion (409 VERSION_CONFLICT),
  unsafe supplied Version (400 INVALID_REQUEST), and a successful final increment from MAX−1 to
  MAX. Responses and actual whole SQLite snapshots/rows are checked; no unsafe increment occurs.

AT-01 through AT-05 remain passing, and AT-06 now passes in its two required editable-state
variants. This establishes the six mandatory scenarios in the current suite; it does not replace
the separate real-concurrency requirements. No test-authoring, discovery, fixture, cleanup,
environment or production-behavior failure was observed among executable checks. The assertions
beyond the unavailable harness have not been behaviorally validated and may require corrections
when T043 enables them; typechecking is not proof of their future runtime behavior.

### Scope audit, completion meaning and blockers

SHA-256 comparison against the 88-file starting baseline verifies that only the five new test
files/helper and the two task/validation documents listed above differ. All existing production
business, persistence and HTTP implementation, tests, support helpers, configuration, dependency
lockfile, constitution, specification, plan, data model, contracts and other planning artifacts
remain unchanged. Nothing was deleted; no existing assertion was weakened, skipped or inverted.
Generated runner JSON remains ignored under node_modules/.cache.

T039–T042 meet their **test-authoring** conditions: test cases and expected HTTP/state/worker
ordering assertions are written, typechecked, discovered, and attempted. Only those four tasks
are newly checked. T001–T042 are checked out of 57 tasks; T043–T057 remain unchecked. The specific
remaining blocker is the intentionally unimplemented T043 race harness/worker dependency, which
prevents behavioral execution of 170 cases. No unrelated implementation blocker was observed.
This is not a green full-suite run, not completion of User Story 4, and not a successful T045
concurrency validation gate. T043/T044 implementation and T045 actual coordinated validation
remain later work.

Stopped after T042 as requested. No executable race harness, worker, production change or T043+
implementation was started. Post-implementation extension-hook check again found no extensions.yml.
