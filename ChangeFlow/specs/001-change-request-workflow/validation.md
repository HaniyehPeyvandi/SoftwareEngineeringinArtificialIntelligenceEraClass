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

<a id="reviewer-test-authoring-t028-t033"></a>

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

<a id="reviewer-implementation-t034-t038"></a>

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

<a id="concurrency-test-authoring-t039-t042"></a>

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

<a id="coordinated-concurrency-implementation-t043-t045"></a>

## Coordinated concurrency implementation (T043–T045)

Date: 2026-11-23. Environment: Windows, Node.js v22.23.4, npm 10.9.9.
Scope: implement the T043 worker/harness dependency, investigate demonstrated T044 defects,
and execute the T045 verification gate. Earlier authoring failures above remain historical runs.
No T046 or later implementation is included in this increment.

### Implementation and isolation

Added tests/support/race-worker.ts and tests/support/race-harness.ts. Each scenario starts two
actual Node worker threads with distinct thread IDs and independently opened better-sqlite3
connections to the same real fixture file. Each thread constructs the existing Express app and
uses Supertest HTTP requests. Existing fixture assertion connections independently inspect saved
SQLite rows in the unchanged integration tests. Promise.all is used only to await independent
workers, not to substitute same-event-loop requests for real competing writers.

The worker uses the installed tsx ESM registration API inside a clean thread, without inheriting
Vitest loaders or importing Vitest at runtime. Production schema, routes, authentication, business
rules and SQL operations are reused. Actual login-issued JWTs remain inside workers and are reused
after maintenance; tokens/passwords are not returned in outcomes or event traces.

Test-only observation wraps the real driver transaction callable on each worker's connection.
The native driver's BEGIN IMMEDIATE, production callback, COMMIT and rollback still execute;
no business result, SQL mutation or HTTP outcome is mocked. The observation records reservation,
successful callback completion, commit attempt, native commit return or completed rollback.
Read/login transactions remain unchanged. The transaction property wrapper preserves callable,
default, deferred, immediate and exclusive behavior needed by the existing application.

SharedArrayBuffer/Atomics gates permit synchronous pauses inside worker callbacks while the parent
continues handling IPC. The first writer pauses after its real reservation. The second worker
reports begin-attempt immediately before invoking the native IMMEDIATE wrapper; the parent then
releases the first writer without waiting for a blocked second reservation. Native SQLite orders
the actual writes. A second notification gate delays reporting the second acquired reservation
until the parent has received the first native COMMIT event, preventing cross-port delivery order
from corrupting the evidence trace. It does not fabricate a reservation or commit.

Permission-order scenarios use real bound maintenance SQL in the existing IMMEDIATE helper on
the other worker. Both mutation-first and maintenance-first schedules keep their original JWT,
then retry on the same worker after maintenance commits. Lock scenarios hold a real IMMEDIATE
reservation for BEGIN contention, or BEGIN+SELECT SHARED reader lock for COMMIT contention. The
reader/writer lock remains held until the HTTP failure returns, then is released via IPC.
Healthy races use 1000 ms busy timeout; the separate busy tests use 100 ms on their worker
connections. No sleep-only scheduling, raised healthy timeout, or automatic command replay occurs.

RPC startup/errors and barrier waits have explicit deadlines. Finally cleanup releases gates,
requests rollback/connection closure, and awaits worker termination before fixture teardown.
Forced termination is the fallback if graceful closure cannot finish. The existing Windows fixture
cleanup still closes all independently tracked assertion/application connections before removal.

### Executed checks and initial corrections

| Command/check | Observed outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Exit 0; expected feature/planning artifacts available. |
| Read-only checklist scan | requirements.md: 17 checked, 0 unchecked; PASS; unchanged. |
| `git rev-parse --git-dir` | Expected nonzero detection: original local project still has no Git metadata. Existing .gitignore reviewed; private package requires no publish ignore changes. |
| `Test-Path .specify/extensions.yml` before/after work | False; no implementation hooks configured. |
| Initial `npm run typecheck` | Exit 1: TS6196 unused HttpCommand import in race-harness.ts and TS2339 driver Transaction declaration lacks .database in race-worker.ts. Both were harness typing defects. |
| Corrected `npm run typecheck` | Exit 0 after removing the unused import and using the actual db connection for the wrapper's database property. No production change. |
| `npm test -- tests/integration/concurrency.test.ts tests/integration/role-revocation.test.ts tests/integration/storage-conflicts.test.ts -t 'round 1/20\|create: revokeRole,\|create: (begin\|commit)' --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/race-smoke-results.json` | Exit 0: 13 selected tests passed, 0 failed; 199 tests unselected by the explicit name filter out of 212 discovered. No test source was skipped or modified. |
| `npm run build` | Exit 0. |
| `node --version` / `npm --version` | v22.23.4 / 10.9.9. |

The smoke selection executed seven first-round race cases, four create permission checks
(two sequential and two worker orderings), and two create lock cases. It was an infrastructure
diagnostic, not the full 20-round gate. JSON's 199 pending tests in that filtered command are
unselected cases, not passing evidence or a waiver of subsequent unfiltered checks.

Vitest commands used approved escalation because the Windows sandbox previously blocked worker
startup. No dependency installation or toolchain/configuration change was required. Runner JSON
under node_modules/.cache remains local ignored evidence; credentials are not included in this
report. No successful build/test result is inferred from earlier reports.

### Complete focused gate and observed concurrency evidence

`npm test -- tests/integration/at-06-stale-version.test.ts tests/integration/concurrency.test.ts tests/integration/role-revocation.test.ts tests/integration/storage-conflicts.test.ts --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/race-focused-results.json`
completed with exit 0: **214 passed, 0 failed, 0 pending/skipped, 0 todo**, four files, without
a name filter. The JSON results and all seven repetition/winner groups were inspected.

| Focused file | Passed | Failed |
| --- | ---: | ---: |
| tests/integration/at-06-stale-version.test.ts | 2 | 0 |
| tests/integration/concurrency.test.ts | 140 | 0 |
| tests/integration/role-revocation.test.ts | 38 | 0 |
| tests/integration/storage-conflicts.test.ts | 34 | 0 |
| Total | 214 | 0 |

The passing real-worker race matrix is:

| Fixture pair | Passing rounds | Command 1 wins | Command 2 wins | Required HTTP pair in every round |
| --- | ---: | ---: | ---: | --- |
| Draft edit/edit | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| ChangesRequested edit/edit | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| Draft edit/Submit | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| ChangesRequested edit/Submit | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| Approve/RequestChanges | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| Approve/Approve | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| RequestChanges/RequestChanges | 20 | 10 | 10 | 200 / 409 VERSION_CONFLICT |
| Total | 140 | 70 | 70 | No 503 accepted as a healthy race |

Each round asserts distinct actual worker/thread and connection identities, IPC ordering around
real reservations and commit, both HTTP outcomes, exactly one Version increment and the complete
winning row through the independent assertion connection. Whole snapshots also verify untouched
other rows, users and roles. Losing proposal/comment values cannot be mixed into winning state.
Fresh-state reads and deliberate subsequent actions succeed only where the resulting status and
permissions allow; otherwise safe FORBIDDEN/INVALID_STATUS outcomes leave committed state intact.
Passing tests exercise all 20 required rounds per pair, not a count inferred from only authored
scenario names. The bounded SC-004 repetition target is met by this focused run.

The 38 permission tests comprise 18 sequential existing-token checks and 20 real-worker orderings:
five mutations × role removal/disablement × both first-writer choices. Maintenance-first gives
403/401 with no mutation; mutation-first allows the single authorized 201/200 before maintenance
commits. Every post-maintenance retry reuses the original JWT/worker and is denied without further
state changes. Snapshot assertions include the expected role/active-state maintenance change.

The 34 storage tests comprise 24 safe-Version checks and 10 actual begin/commit lock cases across
all five mutations. Both lock stages return 503 STORAGE_BUSY, rather than 409 or success, with
complete unchanged persisted state. Commit-stage tests observe the successful mutation callback,
native COMMIT attempt and completed rollback while the independent reader holds its SHARED lock.
After lock release and worker cleanup, a deliberate new HTTP operation succeeds at the original
Version, confirming no partial commit or lingering lock. These 503 checks are separate from the
140 healthy races and do not inflate that race-success count.

Both AT-06 variants also pass, asserting newer committed content survives the stale HTTP update.
The 170 former T043-dependency failures all execute successfully in this focused run; no missing
worker dependency or blocked case remains in this gate.

### T044 production review

No production defect was demonstrated by the focused gate, so no production module was changed.
Existing IMMEDIATE ordering, current-role lookup, bound conditional Version/status/owner predicates,
one-affected-row checks and real driver rollback behavior satisfy the executed cases. Healthy-race
losers can be rejected at the Version precondition before the UPDATE; this report does not claim
that every zero-row/invariant-failure branch was independently fault-injected. Optional SV-06
arbitrary persistence failure injection is not claimed. T044 does not add speculative safeguards
or change error precedence in otherwise passing business code.

### Full regression gate

`npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/race-full-results.json`
completed with exit 0: **1067 passed, 0 failed, 0 pending/skipped, 0 todo**, 23 files.
The JSON report confirms all old regression files and every new worker case pass. No test source
was weakened, deleted, skipped or inverted. All six mandatory assignment scenarios pass, including
AT-06 in both editable statuses. No blocked or expected-failing case remains in the current suite.

| File | Passed | Failed |
| --- | ---: | ---: |
| tests/integration/at-01-create-draft.test.ts | 1 | 0 |
| tests/integration/at-02-submit.test.ts | 1 | 0 |
| tests/integration/at-03-self-approval.test.ts | 1 | 0 |
| tests/integration/at-04-approve.test.ts | 1 | 0 |
| tests/integration/at-05-approved-edit.test.ts | 1 | 0 |
| tests/integration/at-06-stale-version.test.ts | 2 | 0 |
| tests/integration/auth.test.ts | 11 | 0 |
| tests/integration/bootstrap.test.ts | 6 | 0 |
| tests/integration/concurrency.test.ts | 140 | 0 |
| tests/integration/owner-contract.test.ts | 38 | 0 |
| tests/integration/owner-permissions.test.ts | 78 | 0 |
| tests/integration/proposal-validation.test.ts | 297 | 0 |
| tests/integration/request-changes.test.ts | 64 | 0 |
| tests/integration/reviewer-contract.test.ts | 42 | 0 |
| tests/integration/reviewer-permissions.test.ts | 76 | 0 |
| tests/integration/role-revocation.test.ts | 38 | 0 |
| tests/integration/storage-conflicts.test.ts | 34 | 0 |
| tests/unit/foundation.test.ts | 41 | 0 |
| tests/unit/http-errors.test.ts | 4 | 0 |
| tests/unit/jwt.test.ts | 20 | 0 |
| tests/unit/owner-rules.test.ts | 48 | 0 |
| tests/unit/reviewer-rules.test.ts | 54 | 0 |
| tests/unit/text.test.ts | 69 | 0 |
| Total | 1067 | 0 |

The full run repeats all 140 coordinated rounds, the 20 permission orderings and 10 lock cases;
it is not inferred from the focused command. The previous 897 passes remain passing and the
170 previously blocked cases now pass. Both unfiltered commands have zero skipped/todo tests.
The two initial harness typing errors were corrected before these runs; no automated behavior
test failed in this implementation increment. No production fix was needed or fabricated.

### Exact changed files, final scope and limitations

| File | Change |
| --- | --- |
| tests/support/race-worker.ts | Added actual independent application/SQLite worker, HTTP login/commands, native transaction observation, synchronous shared-memory barriers, real maintenance/locks and connection closure. |
| tests/support/race-harness.ts | Added typed worker RPC, parent-sequenced IPC coordination, deterministic first-writer selection, commit acknowledgement, same-JWT permission orderings, lock orchestration, deadlines and awaited cleanup. |
| specs/001-change-request-workflow/tasks.md | Marked only T043–T045 newly complete; updated current evidence/status while preserving later pending tasks. |
| specs/001-change-request-workflow/validation.md | Appended actual commands, initial typing failures/fixes, complete focused/full results, evidence matrix and limitations; earlier reports retained unchanged. |

SHA-256 comparison against the 93-file starting baseline confirms exactly those four paths differ:
two added files, two updated documents, no deletions. All pre-existing tests, fixture/support
helpers, production business/database/HTTP/authentication modules, package/lockfile, configuration,
constitution, functional specification, plan, data model, contracts and other planning artifacts
are unchanged. Build output and runner JSON are ignored local artifacts. No deployment or GitHub
publication was performed for this implementation increment.

T043–T045 acceptance conditions pass; T001–T045 are checked out of 57 tasks and T046–T057 remain
unchecked. The scoped User Story 4 gate and bounded SC-004 repetitions are verified. No remaining
failure, missing harness dependency or blocker exists in the current checks. This does not declare
the entire MVP/delivery complete: the subsequent resubmission/lifecycle, contract/release and
delivery gates remain later tasks even where current tests already cover parts of those flows.

Evidence applies to this Windows/Node/SQLite environment and the defined bounded scenarios, not
production throughput or every possible schedule. Explicit begin/commit contention and native
rollback were exercised; arbitrary fault injection, forced worker-crash/IPC-loss paths and all
deadline cleanup fallbacks were not separately fault-injected. Their implemented error handling
must not be reported as fully tested failure-recovery coverage. These limits do not substitute
503 outcomes for healthy-race success or waive any executed assertion.

Post-implementation extension-hook check found no extensions.yml. Implementation stopped after
T045 as requested; T046 or later tasks were not started.

<a id="revision-lifecycle-verification-t046-t050"></a>

## Revision lifecycle verification (T046–T050)

Date: 2026-11-23. Scope: User Story 3 tests and shared test fixtures only, following
AS-06/14/15/16/27, FR-004/005/008/014/015/018, and SV-02 with relevant SV-03/04/05 regressions.
Earlier validation entries above remain historical evidence, including their original failures.
The starting suite had 1067 passing tests; this increment adds 37 tests in three files.

### Prerequisites and environment

`.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
completed successfully and identified this feature's existing documents. The read-only
requirements checklist had 17 checked items and zero unchecked items. No AGENTS.md was found;
no extension hooks are configured (`.specify/extensions.yml` is absent). Existing ignore rules
cover dependencies, generated build output, credentials/environment files, SQLite files, logs,
and temporary artifacts; no ignore-file or package change was required.

`node --version` returned `v22.23.4`; `npm --version` returned `10.9.9` on Windows.
The local project has no Git metadata (`git rev-parse --git-dir` reports it is not a repository).
No commit, publication, dependency installation, schema change, endpoint, or business operation
was added by this increment.

### Added tests and persisted-state evidence

| Task / file | Tests | Verified behavior |
| --- | ---: | --- |
| T046: `tests/integration/resubmission.test.ts` | 14 | Full fresh-create journey; independent prepared ChangesRequested journey; original-owner-only editing/resubmission; current Requester role and active-user checks with existing JWTs; multiple owner edits; terminal Approved denial. |
| T047: `tests/integration/comment-retention.test.ts` | 16 | C1 retention, later C2 replacement, C2 retention through approval; raw padded Unicode comments at the 2000-code-point boundary; missing/null/blank/overlength later feedback rejected; stale Edit/Submit/Approve/RequestChanges; current-Version invalid review decisions; owner feedback overrides rejected. |
| T048: `tests/integration/revision-visibility.test.ts` | 7 | Owner GET/mine in all states and after edits; unrelated Requester denial; Reviewer pending-list filtering; both independent Reviewers lose GET access after return/approval; resubmission restores pending visibility; dual-role owner visibility/self-review denials; owner Requester revocation cannot be bypassed with the remaining Reviewer role. |
| Total | 37 | Each relevant HTTP result is checked against independently observed committed SQLite state. |

T049 adds `tests/support/revision-cycle.ts`. This test-only fixture composes the existing
Create/Edit/Submit/RequestChanges/Approve HTTP paths using `ownerContext`; it does not call a new
service or manufacture legal workflow transitions with SQL. Shared assertions compare exact
response representations, response statuses, no-store headers, creation Location/identity, and
complete snapshots from the fixture's separate read-only SQLite assertion connection.
All columns, row counts, unrelated requests, users and role memberships are compared. Reads,
rejections and stale commands must leave the complete snapshot unchanged. Error responses have
the approved shape and no protected content; 401 checks include the Bearer challenge.

The fresh journey explicitly asserts Draft V1 → PendingReview V2 → ChangesRequested V3 →
edited ChangesRequested V4 → PendingReview V5 → Approved V6. The original requester and revised
proposal remain intact, and feedback survives each edit/transition. The independently prepared
ChangesRequested case also edits/resubmits/approves without relying on the create/return path.
The two-return journey reaches Approved V9: C1 is retained through the first resubmission,
successful return C2 replaces it atomically, then edits/resubmission/approval retain C2.
Strict response/row comparisons expose only the latest comment, with no invented history.

Padded astral and combining-sequence comments both contain exactly 2000 code points after trim;
their original whitespace and Unicode text survive storage and subsequent transitions without
normalization or truncation. A 2001-astral-code-point later comment is rejected without replacing
C1; the request can then be approved while retaining C1. Broader existing text-boundary tests
remain unchanged and are part of the full regression gate.

Role-revocation/disable fixtures use a separate maintenance connection and real committed
transactions after a successful HTTP return, then reuse the original JWT. No role-management
endpoint or cached authorization role was added. Existing real-worker concurrency infrastructure
is reused unchanged; these lifecycle tests do not substitute single-event-loop calls for races.

### Executed verification commands

| Command | Exit | Observed result |
| --- | ---: | --- |
| `npm run typecheck` | 0 | Strict project-wide typecheck passed, including all new tests/helper. |
| `npm run build` | 0 | Existing application TypeScript build passed. |
| `npm test -- tests/integration/resubmission.test.ts tests/integration/comment-retention.test.ts tests/integration/revision-visibility.test.ts` | 0 | 37 passed, 0 failed/skipped; 3 files. Reported duration 17.27 s. |
| `npm test` | 0 | 1104 passed, 0 failed/skipped; 26 files. Start 00:34:23 local time; reported duration 472.40 s. |

Vitest commands run outside the restricted Windows process sandbox to allow child processes,
HTTP listeners and temporary SQLite fixtures. The tests use their isolated databases, never the
local demo database. Typecheck/build used the existing configuration without installing packages.
No typecheck, build, focused or full-suite behavioral failure occurred. No production defect was
demonstrated or fixed, and no tests were weakened, skipped or deleted. The full suite includes
the original 1067 cases plus all 37 new lifecycle cases. AT-01 through AT-06 pass, including
both AT-06 editable-state variants. All 140 real-worker race rounds execute successfully again,
alongside current-role ordering, disabled-user, lock-timeout/rollback and Version-exhaustion
regressions. Those outcomes are from this full execution, not inferred from earlier reports.
Healthy races still require 200/409 VERSION_CONFLICT; 503 STORAGE_BUSY is not counted as a
successful stale-Version conflict. Existing race infrastructure and assertions are unchanged.

### Final files, completion and limitations

| File | Change |
| --- | --- |
| `tests/integration/resubmission.test.ts` | Added 14 full/prepared revision-cycle, ownership, current-permission and terminal-state tests. |
| `tests/integration/comment-retention.test.ts` | Added 16 latest-feedback lifecycle, Unicode boundary, invalid/stale preservation and owner-override tests. |
| `tests/integration/revision-visibility.test.ts` | Added 7 owner/reviewer visibility and dual-role regression tests. |
| `tests/support/revision-cycle.ts` | Added reusable legal HTTP steps with complete independent committed-state assertions. |
| `specs/001-change-request-workflow/tasks.md` | Marked only T046–T050 newly complete; linked current evidence and retained T051–T057 pending. |
| `specs/001-change-request-workflow/validation.md` | Appended this run's actual commands, results, coverage, scope and limitations without rewriting prior evidence. |

The final SHA-256 scope audit against the 95-file starting snapshot confirms exactly four new
test/helper files and two changed documents, with no deletions. All pre-existing production code,
tests/support fixtures, configuration, package/lockfile, constitution, specification, plan,
research, data model and API contracts remain unchanged. Build output is ignored local output.
No credentials or demo database content are added to these artifacts.

T046–T050 acceptance conditions are verified: all 50 tasks through T050 are checked and the
seven T051–T057 tasks remain unchecked. There are no remaining test failures or blockers in
this scoped increment. The complete MVP delivery is still unfinished. The later authorization
matrix, schema-conformance, reconnect durability, clean-install/manual journey, delivery docs
and final audit gates were not started here; their completion is not implied by these passes.
Optional SV-06 arbitrary persistence-failure injection was not run in this increment.
Evidence applies to this Windows/Node/SQLite environment and the executed bounded schedules;
it does not establish production throughput or every possible race/failure schedule.

The post-implementation hook check again found no `.specify/extensions.yml`. Implementation
stopped after T050; no T051 or later work, GitHub publication or application logic change occurred.

<a id="authorization-contract-and-durability-verification-t051-t053"></a>

## Authorization, contract and durability verification (T051–T053)

Date: 2026-11-23. Scope: the three requested cross-cutting integration-test tasks only.
Starting verified suite: 1104 passing tests in 26 files. This increment adds 535 tests in
three files without changing application code, dependencies, existing tests or API contracts.
T054's clean-install/release gate and all subsequent delivery tasks are outside this increment.

### Prerequisites and environment

`.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`
completed with exit 0 and identified this feature and its existing planning documents.
The read-only requirements checklist has 17 checked items, zero unchecked items. No AGENTS.md
was found, and `.specify/extensions.yml` is absent. Existing ignore rules cover dependencies,
build output, local credentials/environment files, SQLite files and temporary/log artifacts.
No additional ignore file or package-publishing configuration was needed.
`git rev-parse --git-dir` reports that the local project is not a Git repository; no Git action
was performed. `node --version` returned `v22.23.4`; `npm --version` returned `10.9.9` on Windows.

### T051: authorization and error-precedence matrix

`tests/integration/authorization-matrix.test.ts` adds 377 tests. Each case has a new isolated
real SQLite fixture and uses existing HTTP/authentication helpers. The table covers all eight
protected operations: Create, mine, pending-review, GET, Edit, Submit, Approve, RequestChanges.
Login is public and is checked separately in the OpenAPI and credential/durability cases.

Resource cases cover all four statuses and owner, unrelated Requester, independent Reviewer,
independent dual-role user, dual-role owner, no-role, anonymous, disabled, revoked owner,
revoked Reviewer, newly disabled owner and deleted token-subject profiles. Expected outcomes
come from explicit test tables and the approved contract, not production authorization helpers.
Role deletion, disabling and subject deletion are actual committed fixture-maintenance writes;
subsequent operations reuse the pre-existing JWT. Successful calls compare complete response
representations and independent persisted snapshots, including list filtering and ownership.
Denied calls compare the complete before/after snapshot, not just the status column.

Separate cases verify saved V3 against submitted V2/V3/V4 across all mutation/state pairs,
including invalid text. Authorized stale/future Versions give 409 VERSION_CONFLICT before
status/text checks; a current Version in a forbidden state gives 409 INVALID_STATUS; present
invalid text in an allowed state gives 422. Ownership/self-review denial precedes Version and
state. Other cases establish JWT-before-malformed-envelope/path, shape-before-current-role,
role-before-missing-resource, 404 for authorized missing IDs, 401 for inactive/missing subjects,
and 503 STORAGE_UNAVAILABLE for safe-Version exhaustion without any write or wraparound.
Error bodies have the approved exact shape/code and safe field issues, without protected IDs,
proposal text, feedback or password hashes; 401 includes WWW-Authenticate: Bearer.

### T052: HTTP conformance against the actual OpenAPI document

`tests/integration/contract-conformance.test.ts` adds 154 tests. It loads
`contracts/openapi.json` directly and pins the nine approved operation identifiers. Every
operation has a real successful request, request-schema checks where applicable, a declared
status/response-schema check and independent SQLite assertions. All declared response headers
are checked; no-store, JSON response media, creation Location and 401 Bearer challenge are
explicitly verified. Protected-operation 401/403, login INVALID_CREDENTIALS, missing/malformed
ID 404/400, stale 409, validation 422, and Version-exhaustion 503 responses are covered.

Strict-body cases exercise each required key missing, null and wrong-type, additional protected
properties, invalid Versions, malformed JSON, 128-KiB envelope overflow and wrong request media.
Safe maximum Version is accepted as transport and then rejected as stale against saved V1;
when actually persisted at the maximum it fails to advance safely with 503 and no state change.
Text cases derive each limit from the checked-in annotations, independently pin their intended
200/5000/2000 values, and exercise blank, padded exact maximum and maximum+1 strings using both
astral and combining code points. Accepted strings remain exactly unchanged in responses and
actual SQLite text; input raw maxLength is not imposed.

The local assertion walker supports exactly the contract's current JSON Schema vocabulary
($ref, types including nullable/integer, required/additionalProperties, properties/items,
enum/const, minimum/maximum, UUID format) plus the documented trimmed-code-point annotations.
It fails on unsupported keywords rather than silently ignoring future constraints, and does
not import production validators. It is test-only, not a general OpenAPI validation library.
Passing these cases does not claim exhaustive generation of every possible schema instance or
fault injection of every declared 500/503 error path. Existing sanitization and real storage-busy
tests remain applicable regression coverage.

**Constrained-property metric correction:** direct enumeration of the unchanged OpenAPI schemas
finds **15 constrained schema-property occurrences**: CreateBody 3, EditBody 4, VersionBody 1,
ReturnBody 2 and ChangeRequest 5 (3 + 4 + 1 + 2 + 5 = 15). Earlier document-only reports recorded
14/14. Those historical
reports are preserved; this run uses the directly verified count of 15, with every occurrence
checked. This changes no product constraint, requirement, schema or approved API behavior.

### T053: actual connection closure, reopen and idempotent bootstrap

`tests/integration/persistence.test.ts` adds 4 tests. The test-local durable client uses existing
HTTP routes and real login tokens, then closes both application and independent assertion
connections before each reopen. No other connection to that fixture file remains open at a
reopen checkpoint. It constructs a fresh app/connection and a fresh independent assertion
connection; the same valid JWTs continue to identify users, while SQLite supplies current roles.
Each successful mutation is checked both before and after closure/reopen against the complete
expected snapshot. Schema metadata, schema version, foreign keys, DELETE journal, FULL sync,
foreign_key_check and integrity_check are also checked on reopened connections.

The first test commits and restarts after each step of Draft V1 → PendingReview V2 →
ChangesRequested/C1 V3 → owner revision V4 → PendingReview V5 → ChangesRequested/C2 V6 →
owner revision V7 → PendingReview V8 → Approved V9. Proposal/owner and raw Unicode feedback
retention/replacement survive every restart. Owner GET remains allowed and Reviewer GET is
denied after approval. A separate case proves rejected stale and invalid edits remain unchanged
after reopen. Another reruns both file and schema initialization repeatedly against all four
prepared states, preserving complete users/roles/requests and schema definitions.

The final test uses a separate initially empty temporary database and the real demo seeder.
It generates five private credentials, creates/revises/submits/returns/approves through HTTP,
commits Requester and Reviewer role revocations and disables a different account. Seed reruns
before/after close/reopen and repeated initialization return no new credentials and preserve
all snapshots, including encoded password records, ownership, Versions and retained feedback.
Original passwords still authenticate active accounts; the disabled account remains denied.
Existing JWTs cannot recover the revoked permissions. Generated passwords/tokens/hashes are
not copied into this report, source constants or logs.

### Actual commands, failures and fixes

| Command / run | Exit | Observed result |
| --- | ---: | --- |
| `npm run typecheck` (initial T052 authoring) | 1 | TS1005 at contract-conformance.test.ts:24: missing closing parenthesis in test operation enumeration. |
| `npm run typecheck` (after syntax fix; after T053 authoring; after focused-run fixes) | 0 each | Three successful strict typecheck executions covering all authored tests. |
| `npm run build` (before first focused result; after final test corrections) | 0 each | Two successful application TypeScript builds; no production source was changed. |
| `npm test -- tests/integration/authorization-matrix.test.ts tests/integration/contract-conformance.test.ts tests/integration/persistence.test.ts --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/t051-t053-focused.json` | 1 | 531 passed, 4 failed, 0 skipped/todo; 3 files. |
| `npm test -- tests/integration/authorization-matrix.test.ts tests/integration/contract-conformance.test.ts tests/integration/persistence.test.ts --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/t051-t053-focused-final.json` | 0 | 535 passed, 0 failed/skipped/todo; 3 files: authorization 377, contract 154, persistence 4. |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/t051-t053-regression.json` | 0 | 1639 passed, 0 failed/skipped/todo; 29 files. JSON reports success=true and confirms every existing and new file passed. |

The first focused run had exactly four test-authoring failures: the hardcoded old count of 14
versus actual 15, plus three durability-fixture logins that sent an entire fixture user object
with extra keys. The API correctly returned 400 for those strict-body violations. Fixes were
limited to the newly authored tests: count the actual contract occurrences and send only
username/password at fixture login. The successfully passing real-demo seed case already used
the exact credential shape. No production defect was demonstrated, and no application change,
weakened assertion, skip, deletion or API relaxation was used to obtain the corrected passes.

Vitest runs use the approved process-sandbox exception for child processes, local HTTP and
isolated temporary SQLite files. Reports are ignored local runner artifacts under node_modules;
they are not application source or committed delivery evidence. A read-only report-summary
extraction command initially had a PowerShell pipeline syntax error; corrected extraction
succeeded without rerunning or altering any test result. The earlier failures remain recorded
above; they do not remain unresolved failures in the final verified suite.

### Full regression result, final scope and limits

The complete regression command executed all 1104 pre-existing cases plus the 535 new cases,
with zero failures, skipped/pending cases or todo entries. All mandatory assignment tests pass:
AT-01 creation (1), AT-02 Submit (1), AT-03 self-approval denial (1), AT-04 approval (1),
AT-05 Approved edit denial (1), AT-06 stale Version (2 editable-state cases). Their pre-existing
HTTP and independent-SQLite assertions are unchanged. The concurrency file again passes all
140 separately coordinated worker rounds; role-revocation tests pass 38/38 and storage-conflict
tests pass 34/34, including real lock/rollback and safe-Version behavior. Healthy races continue
to require one accepted mutation and one 409 VERSION_CONFLICT, never 503 as conflict evidence.
All earlier owner, Reviewer, revision-cycle, authentication, bootstrap and pure-rule tests pass.
These are this run's observed results, not reuse of the previous 1104-test passing report.

| Changed file | Final change |
| --- | --- |
| `tests/integration/authorization-matrix.test.ts` | Added 377 explicit actor/operation/state and precedence/state-preservation cases. |
| `tests/integration/contract-conformance.test.ts` | Added 154 direct OpenAPI request/response/error/header/Unicode/Version checks. |
| `tests/integration/persistence.test.ts` | Added 4 real connection-lifecycle, initialization and demo-seed durability cases. |
| `specs/001-change-request-workflow/tasks.md` | Marked only T051–T053 newly complete, updated current evidence, retained T054–T057 pending. |
| `specs/001-change-request-workflow/validation.md` | Appended commands, actual initial failures/fixes, passing results, metric correction and limitations; earlier reports preserved. |

The final SHA-256 comparison against the 99-file starting snapshot confirms exactly three
added test files and two changed documents, with no deletions. All production code, previous
tests/support helpers, package/lockfile, configuration, constitution, specification, plan,
research, data model, OpenAPI and other approved artifacts remain unchanged. Native packages
were used as already installed; no fresh installation or dependency-resolution claim is made.
No demo database or credentials were modified/published, and no new endpoint, product feature,
architecture or dependency was introduced.

T051–T053 acceptance conditions are verified. Task markers now show T001–T053 complete and
T054–T057 pending; implementation stops after T053. No unresolved failure or blocker remains
for this scope. The complete MVP/delivery is not declared finished: no T054 clean install or
release-evidence reconciliation, T055 manual quickstart run, T056 delivery-document update or
T057 final constitution/traceability audit was started. Running full regressions for this
increment does not by itself complete those later tasks. Optional SV-06 arbitrary pre-commit
persistence-failure injection was not added or claimed passing.

Durability evidence proves committed state survives orderly connection closure, reinitialization
and reopening on this Windows/Node/SQLite environment; it does not simulate power loss, disk
corruption or process crashes. The schema assertion walker is limited as described above, and
bounded race repetitions do not prove every possible schedule or production throughput.
The post-implementation hook check again found no `.specify/extensions.yml`.

<a id="final-delivery-verification-t054-t057"></a>

## Final delivery verification (T054–T057)

Date: 2026-11-23. Scope: clean dependency verification, full regression, isolated real HTTP
quickstart, delivery documentation, constitution compliance and final traceability. Earlier
sections remain historical evidence, including failures; no GitHub push or release was made.
Prerequisites passed; the read-only checklist remains 17 checked/zero unchecked. No AGENTS.md or
extension hooks were found. Existing ignore rules cover dependencies, build output, local
databases, environment files and credentials. No local Git metadata exists.

### T054: actual installation attempts and recovery

| Executed command / attempt | Location and exit | Observed result |
| --- | --- | --- |
| `npm ci` | Main, sandbox: 1 | EBUSY removing has-tostringtag; npm cache-log write denied. |
| `npm ci` | Main, permitted process exception: 1 | Cleanup EBUSY on has-symbols; inferred node-gyp rebuild could not download Node headers: SELF_SIGNED_CERT_IN_CHAIN. Python 3.12.10 was found; source compilation did not complete. |
| Process-scoped NODE_OPTIONS appended `--use-system-ca`, then `npm ci` | Main: interrupted, exit 1 | Supported trust-store option tried; no completion observed before interruption. Neither source compilation nor certificate recovery is claimed successful. No global setting or TLS verification was disabled. |
| `npm ci --ignore-scripts --engine-strict --no-fund --offline=false --fetch-retries=0 --fetch-timeout=30000` | Main: 1 | EBUSY on has-symbols remained. Permitted process inspection found no leftover npm/node-gyp install child; no unrelated process was stopped. |
| `npm install --ignore-scripts --engine-strict --no-fund --offline=false --fetch-retries=0 --fetch-timeout=30000` | Main: 0 | Recovery restored dependencies in place: 141 added, 4 changed. This was not the clean-install gate. |
| Restore original package-lock.json from its pre-recovery copy | Main: 0 | Recovery altered only better-sqlite3.hasInstallScript metadata. Original file restored; original versions and lockfile hash preserved. |
| `npm ci --ignore-scripts --engine-strict --no-fund --offline=false --fetch-retries=0 --fetch-timeout=30000` | Fresh build/clean-verification: 0 | Clean locked installation added 144 packages; no old node_modules copied. |
| `npm rebuild esbuild --offline=false --fetch-retries=0 --fetch-timeout=30000` | Main and clean: 0 each | Required esbuild postinstall executed successfully in both. |

The clean directory's resolved absolute path was checked to remain inside this workspace and
not already exist. Package/config files, src, scripts, tests and specs were copied; no .env,
local databases, credentials, previous dependencies or compiled output were copied. SHA-256
comparison passed for 56 source/test/configuration/package/contract files between main and clean
workspaces, including the original lockfile. The full gate below ran against that fresh install,
not a falsely claimed clean reinstall of the locked main node_modules directory.

The installed better-sqlite3 manifest declares gypfile:false and bundles a Windows x64 native
binary. Inspection of npm 10's local Arborist source showed how missing gypfile metadata can
infer a source build from binding.gyp; the lock entry does not preserve that manifest flag.
The documented procedure avoids the unnecessary build, runs esbuild's required postinstall,
and then checks the actual native/compiler/runner paths. The lock's only required Windows
install-script package is esbuild; fsevents is optional for macOS. No needed lifecycle result
is silently assumed. Normal-install/source-build failures remain recorded, and source compiler
compatibility is unverified; TLS verification was never turned off.

### Actual versions and verification commands

Node v22.23.4, npm 10.9.9, win32 x64 were observed directly. `npm ls --depth=0` returned exit 0
in both workspaces: Express 5.3.0, better-sqlite3 13.2.0, jose 6.2.18, TypeScript 7.0.2,
tsx 4.23.15, Vitest 5.1.1, Supertest 7.3.2, @types/node 22.20.5, @types/express 5.0.6,
@types/better-sqlite3 9.6.0 and @types/supertest 7.2.1. Clean-tree inspection confirmed Vite
8.3.8, esbuild 0.28.2, Rolldown/MSVC x64 binding 1.2.19 and TypeScript Windows x64 binary 7.0.2.
These are installed versions, not latest-release claims. SQLite 3.54.1 loaded in both workspaces.

| Command / check | Location, exit and actual outcome |
| --- | --- |
| `node --version`; `npm --version` | Main, 0 each; v22.23.4 / 10.9.9. |
| Native SQLite open/query/close smoke using SELECT sqlite_version() | Main and clean, 0 each; native loaded, SQLite 3.54.1 on win32 x64. In-memory smoke alone is not workflow persistence evidence. |
| `npm ls --depth=0` | Main and clean, 0 each; versions above. |
| `npm ls vite esbuild rolldown @rolldown/binding-win32-x64-msvc @typescript/typescript-win32-x64` | Clean, 0; native toolchain versions above. |
| `npm run typecheck` | Main and clean, 0 each; strict checks pass. |
| `npm run build` | Main and clean, 0 each; application/scripts compile. |
| `npm test -- --maxWorkers=2 --reporter=json --outputFile=node_modules/.cache/delivery-full.json` | Clean, 0; **1639 passed, 0 failed, 0 skipped/pending, 0 todo; 29 files; success=true**. |
| `node build/verify-quickstart.mjs` | Main, 0; 35 real TCP HTTP checks, independent SQLite assertions, actual init/seed scripts, restart and built CLI checks; temporary database cleaned. |
| Node schema/OpenAPI enumeration, task-graph and documentation-file-link audit | Main, 0; 14 database columns, 15 text/Version occurrences, 57 unique tasks, no missing predecessors/cycles or broken local file links. |
| Environment-example comparison | Main, 0; uncommented values unchanged from baseline, signing-secret value empty. |
| `node build/audit-delivery.mjs` | Main, 0; 57 complete/0 pending, valid dependency graph, 63 local file/section links resolve, FR18/AS29/AT6/required-SV5/SC6/principles12 mapped, zero checked secret/token patterns, no hooks. |

Tests/TCP commands used the permitted Windows process exception for local HTTP, independent
workers and private temporary SQLite files. Runner JSON, the clean copy, compiled output and
the generated verification aid remain ignored local artifacts. No credential-bearing output
was copied into this evidence. Diagnostic attempts to read a rolled-back package directory,
parse the lockfile's empty root key with PowerShell 5, inspect processes inside the sandbox,
and apply two invalid documentation patches failed and were corrected; they did not change
application behavior or manufacture a test outcome.

### Separate mandatory assignment results

All six run as distinct named scenarios with actual HTTP and independent SQLite assertions.
The names below are files under tests/integration; no case is skipped or inferred from another.

| ID / file | Actual result | HTTP and persisted-state evidence |
| --- | --- | --- |
| AT-01 / at-01-create-draft.test.ts | 1 passed | 201/Location; exactly one new owned Draft V1 with supplied content and NULL feedback. |
| AT-02 / at-02-submit.test.ts | 1 passed | 200 PendingReview V2; same owner/content/feedback saved. |
| AT-03 / at-03-self-approval.test.ts | 1 passed | Dual-role owner gets 403; complete PendingReview row and count unchanged. |
| AT-04 / at-04-approve.test.ts | 1 passed | Independent Reviewer gets 200 Approved; exact next Version and preserved content/owner/comment saved. |
| AT-05 / at-05-approved-edit.test.ts | 1 passed | Current-Version Approved edit gets 409 INVALID_STATUS; complete row unchanged. |
| AT-06 / at-06-stale-version.test.ts | 2 passed | Draft and ChangesRequested: winning edit 200, stale edit 409 VERSION_CONFLICT; complete newer row retained. |

### Required supplementary results and optional disposition

Groups overlap; no invented exclusive SV test counts are reported. Every listed file passed in
the clean full run, including all critical persisted-state assertions.

| Group | Verified evidence |
| --- | --- |
| SV-01 | proposal-validation (297), owner-contract (38), unit/text (69), plus contract-conformance (154): required/blank/typed/bounded proposal fields, overrides, trim/Unicode, both editable states and saved-content Submit validation. |
| SV-02 | request-changes (64), resubmission (14), comment-retention (16), revision-visibility (7), persistence (4): feedback required/retained/replaced, full legal cycles, owner reads and rejection preservation. |
| SV-03 | authorization-matrix (377), auth (11), unit/jwt (20), owner/reviewer-permissions (78/76), role-revocation (38): all actors/operations/states, forged/expired claims, current roles, self-review and visibility. |
| SV-04 | authorization-matrix and owner/reviewer rule/permission tests: all disallowed status combinations and distinct stale versus current-status failures; no persisted changes after rejection. |
| SV-05 | concurrency (140), at-06-stale-version (2), role-revocation (38), storage-conflicts (34): real independent workers, deterministic first-writer order, explicit recovery, role ordering, begin/commit lock timeout/rollback and safe Version exhaustion. |
| SV-06 optional | **Not executed as a dedicated arbitrary pre-commit failure-injection scenario.** Required real busy/commit rollback cases ran under SV-05; they are not relabeled as an additional optional pass. No persistence-failures.test.ts was added. This optional disposition does not block the required delivery. |

Seven independent-worker fixture pairs each passed 20 rounds: Draft edit/edit, ChangesRequested
edit/edit, Draft edit/Submit, ChangesRequested edit/Submit, Approve/RequestChanges, Approve/Approve
and RequestChanges/RequestChanges. Each alternates the reserved first writer, ten wins in each
direction. Every healthy pair requires exactly one 200 and one 409 VERSION_CONFLICT, one Version
increment and a complete legal persisted winner. No 503 STORAGE_BUSY is counted as a passing race.
All earlier 1639 cases remain present; none was weakened, deleted, skipped or marked todo.

### T055: executed isolated quickstart

The generated local aid `build/verify-quickstart.mjs` uses the production compiled server,
real loopback TCP/fetch and independent read-only SQLite snapshots, not Supertest or mocks.
It creates a new private temporary file and invokes the actual `npm run db:init` and
`npm run db:seed` scripts (both exit 0). Five random demo passwords are captured only in memory;
five logins return 200 with the token contract. No tokens, passwords, signing keys, salts or
hashes are emitted in its sanitized result. Every critical call compares complete persisted
snapshots, including unaffected users/roles/requests; rejected calls must change nothing.

| Observed quickstart steps | HTTP / actual state |
| --- | --- |
| Create, owner GET/mine, Reviewer Draft denial | 201 Draft V1, NULL feedback; owner reads 200, Reviewer 403; independent inserted-row/count checks. |
| Draft Edit, stale Edit, Submit | 200 Draft V2; stale V1 gives 409 VERSION_CONFLICT and unchanged V2; Submit gives 200 PendingReview V3. |
| Pending list/GET, RequestChanges, returned visibility | Reviewer list/GET 200; return 200 ChangesRequested V4 with exact Unicode comment; Reviewer GET 403, owner GET 200 with feedback. |
| Owner Edit, Resubmit, independent Reviewer B Approve | 200 ChangesRequested V5 → PendingReview V6 → Approved V7; original owner, revised content and raw latest comment persist at each step. |
| Approved/ownership denials | Owner GET 200, Reviewer GET 403, valid owner edit 409 INVALID_STATUS, unrelated Requester GET 403; rows unchanged. |
| Dual-role own create/Submit then both decisions | 201 Draft V1 → 200 PendingReview V2; self-approval and self-return both 403, complete row unchanged. |
| Committed role revocation/disable using maintenance connection | Existing Reviewer JWT list gives 403; existing disabled Requester JWT mine gives 401; no business-row changes. |
| Seed/init reruns and restart | Both scripts exit 0 again; no new credential output and complete saved users/hashes/roles/requests preserved. Original active password still logs in. |
| Built CLI entry | Actual `node --env-file-if-exists=.env dist/src/server.js` starts on an isolated real port, serves saved Approved V7 with 200, and enforces revoked Reviewer role with 403. |

There were **35 successful expected HTTP checks**, including expected denials; this is not 35
Vitest tests and is not added to 1639. The production startServer lifecycle closed gracefully
and reopened with fresh connections and unchanged saved state. A separate owned built-CLI child
was stopped with SIGTERM: observed exitCode=null/signal=SIGTERM. Windows process termination is
not claimed as evidence that a Unix-style graceful signal handler ran. State was inspected again
after its exit. Integrity check returned ok. Final rows were original-owner Approved V7 with
retained comment and dual-role PendingReview V2. All connections/listeners/owned children closed,
the temporary directory was path-checked and removed, and the aid reported cleaned=true.
No pre-existing demo file, account or .env was changed. Watch-mode `npm run dev` is documented
from the existing script; an interactive watch session was not separately executed here.

### T056: delivery documents

Created README.md with actual install/run commands, all nine endpoints, current authorization,
atomic concurrency/error semantics, security assumptions, known limits and a complete SDD index.
Updated .env.example comments only; existing four configuration values and the empty secret
are unchanged. Replaced quickstart's obsolete unimplemented claims with the verified install
procedure, private setup, initialization/seeding, HTTP/database/role/restart steps and caveats.
All local file links resolve. Original normative constitution/specification/plan/research/data
model/contracts remain unchanged; planning-time statements in retained design/analysis artifacts
are historical phase records, while tasks and validation record current implementation evidence.

### T057: 14 database fields versus 15 OpenAPI occurrences

Actual SQLite table_info enumeration after applying the production schema found **14 distinct
qualified database columns**: users.{id,username,password_hash,active} (4),
user_roles.{user_id,role} (2), change_requests.{id,title,description,reason,requester_id,status,
version,reviewer_comment} (8). These are the canonical typed/identity/relationship/business
field definitions cited by the task audit, not fourteen text-input fields.

Direct enumeration found **15 constrained OpenAPI text/Version property occurrences**:
CreateBody.{title,description,reason} (3), EditBody.{title,description,reason,version} (4),
VersionBody.version (1, defined once and reused by Submit/Approve), ReturnBody.{version,comment}
(2), ChangeRequest.{title,description,reason,version,reviewerComment} (5). Eleven text constraints
plus four safe-Version constraints make 15. Repeated input/output definitions count separately;
database identity/credential/role fields are outside that particular count. UUID/status/token
constraints also exist and are not included in the 15 text/Version metric.

Thus **14/14 database definitions and 15/15 OpenAPI occurrences are both applicable**, with
different denominators. The T051–T053 authoring failure applied the old count to the wrong set;
its historical explanation is preserved above and clarified here. No schema or product limit
was changed to reconcile them.

### Final functional requirement traceability

All test names below are actual files under tests/integration unless prefixed unit/. Source
names are under src; change-requests refers to business/change-requests.ts, store/database to
persistence/store.ts and persistence/database.ts. Each referenced file passed in the clean run.

| ID | Implementation / passing verification |
| --- | --- |
| FR-001 | business/auth, http/auth and rules/current transaction lookup; auth, unit/jwt, authorization-matrix, role-revocation. |
| FR-002 | create service/store INSERT, UUID/owner/Draft/V1; at-01-create-draft, owner-contract. |
| FR-003 | business/text and saved-content Submit validation; proposal-validation, contract-conformance, unit/text. |
| FR-004 | owner rules/conditional Edit in both editable states; owner-permissions, resubmission, at-05-approved-edit, authorization-matrix. |
| FR-005 | owner rules/conditional Submit; at-02-submit, resubmission, authorization-matrix. |
| FR-006 | independent Reviewer approval rules/SQL; at-04-approve, reviewer-permissions, comment-retention. |
| FR-007 | owner comparison including dual roles and SQL non-owner predicate; at-03-self-approval, authorization-matrix, unit/reviewer-rules. |
| FR-008 | validated atomic return, self-return ban, feedback retention/replacement; request-changes, comment-retention, revision-visibility, resubmission. |
| FR-009 | explicit state rules/terminal Approved; authorization-matrix, owner/reviewer-permissions, unit/owner-rules, unit/reviewer-rules. |
| FR-010 | strict HTTP bodies and server-owned identity/status; owner-contract, proposal-validation, contract-conformance. |
| FR-011 | current identity/roles and saved preconditions in service-owned transactions; role-revocation, authorization-matrix, concurrency. |
| FR-012 | bound atomic Version/status/owner predicates and affected-row checks; at-06-stale-version, concurrency, storage-conflicts. |
| FR-013 | commit-before-response, rollback and reopen durability; all AT cases, persistence, concurrency, storage-conflicts. |
| FR-014 | owner+Requester all-status GET/mine; revision-visibility, owner-permissions, authorization-matrix. |
| FR-015 | independent PendingReview-only GET/list; reviewer-contract, reviewer-permissions, revision-visibility. |
| FR-016 | stable safe errors/ordering; authorization-matrix, contract-conformance, unit/http-errors, concurrency recovery. |
| FR-017 | separate mandatory AT-01–AT-06 plus required SV-01–SV-05, HTTP and independent SQLite; tables above. |
| FR-018 | canonical trimmed code-point measurement and exact raw text preservation; unit/text, proposal-validation, request-changes, contract-conformance. |

### Final acceptance-scenario traceability

| ID | Passing executable evidence |
| --- | --- |
| AS-01 | at-01-create-draft; owner-contract: owned Draft creation/retrieval. |
| AS-02 | proposal-validation; owner-permissions: Draft proposal edits. |
| AS-03 | at-02-submit; resubmission: valid Draft Submit. |
| AS-04 | proposal-validation; unit/text: missing/empty/whitespace fields, including saved-content Submit. |
| AS-05 | owner-contract; proposal-validation: rejected ownership/status overrides. |
| AS-06 | reviewer-contract; reviewer-permissions; revision-visibility: pending-only reads and dual-role owner access. |
| AS-07 | at-04-approve: independent approval. |
| AS-08 | request-changes; resubmission: comment/status/Version atomically saved. |
| AS-09 | at-03-self-approval; authorization-matrix: dual-role self-approval denied. |
| AS-10 | authorization-matrix; unit/jwt; auth: unauthenticated protection. |
| AS-11 | authorization-matrix; owner/reviewer-permissions: required current roles for each operation. |
| AS-12 | owner-permissions; authorization-matrix; resubmission: non-owner edits/Submits denied. |
| AS-13 | authorization-matrix; owner/reviewer rules/permissions: every forbidden operation/state and repeated transition. |
| AS-14 | resubmission; comment-retention: returned-owner edits. |
| AS-15 | resubmission; persistence: revised resubmission retains owner/content/comment. |
| AS-16 | revision-visibility; authorization-matrix: owner all-status reads and unrelated Requester denial. |
| AS-17 | concurrency: edit/edit, both editable statuses, 20 rounds each. |
| AS-18 | concurrency: approve/return, approve/approve and return/return, 20 rounds each. |
| AS-19 | concurrency: edit/Submit, both editable statuses, 20 rounds each. |
| AS-20 | role-revocation; authorization-matrix; concurrency: current permissions and saved state. |
| AS-21 | concurrency; at-06-stale-version: fresh inspection and deliberate recovery, no automatic replay. |
| AS-22 | authorization-matrix missing-UUID cases; owner/reviewer contracts/permissions: missing requests. Historical test titles using AS-22 for revocation do not redefine this canonical scenario. |
| AS-23 | reviewer-permissions; authorization-matrix; revision-visibility: self-return denied. |
| AS-24 | both at-06-stale-version variants: complete newer row retained. |
| AS-25 | at-05-approved-edit; authorization-matrix: current-Version Approved edit denied. |
| AS-26 | request-changes; contract-conformance: missing/empty/whitespace feedback separately rejected. |
| AS-27 | comment-retention; resubmission; persistence: latest comment retained/replaced and failure-preserved. |
| AS-28 | proposal-validation; request-changes; contract-conformance: max/max+1 acceptance/rejection. |
| AS-29 | unit/text; proposal-validation; request-changes; contract-conformance: trimming, interior spaces, astral/combining count and preserved storage. |

### Success criteria in the executed evaluation set

| ID | Outcome and bounded evidence |
| --- | --- |
| SC-001 | Met: valid owner create/edit/Submit and revision journeys pass, including real TCP V1–V7 and prepared returned fixtures. |
| SC-002 | Met: all four allowed transitions and all disallowed operation/status combinations pass their expected outcomes with unchanged state on denial. |
| SC-003 | Met: zero successful self-approvals; dual-role/self-return/unauthorized combinations denied without protected disclosure. |
| SC-004 | Met: both AT-06 variants and 140 real-worker rounds pass, exactly one winner/conflict each, both first-writer orders, no overwrite. |
| SC-005 | Met: all six assignment scenarios and required critical supplementary coverage pass HTTP plus actual-SQLite assertions; 18/18 FRs and 29/29 ASs mapped. |
| SC-006 | Met: distinguishable safe rejection categories, permitted fresh-state inspection, correction/resubmission and explicit conflict recovery pass without added admin workflow or automatic replay. |

These are requirements/evaluation results, not a line/branch-coverage percentage, universal
scheduler proof or production throughput claim. Overlapping groups are not summed as unique tests.

### Constitution compliance and completion

| Principle | Final audit evidence |
| --- | --- |
| I — Spec first | Approved clarified specification/plan precede implementation; no new product decision here. |
| II — Simplicity | One package, three concrete layers, three tables; no ORM or speculative architecture. |
| III — Separation | Pure business rules/text and service transactions separate from Express and concrete SQL. |
| IV — Server access | JWT verifies subject; current active state/roles checked per transaction; actor/revocation suites pass. |
| V — No self-approval | AT-03, dual-role matrix and SQL independent-owner predicates; no exception. |
| VI — Preconditions | Identity/roles, existence, owner/independence, Version, status, text, conditional write, commit; rejected state preserved. |
| VII — Lost updates | Atomic conditional increments and IMMEDIATE writes, real races; Create inserts unique owned V1 because no prior Version exists. |
| VIII — Critical tests | All AT/required SV coverage, real independent assertions/workers, pure rules and reopen checks pass. |
| IX — Consistency | Normative behavior aligned with actual contracts/tests; current delivery docs updated, earlier phase records retained as history. |
| X — Decisions/limits | Research alternatives retained; native/registry/local-service/testing limitations explicit. |
| XI — MVP scope | Nine backend operations; no frontend, AI, RAG, MCP or Multi-Agent product feature. Verification workers are test infrastructure only. |
| XII — Truth | Failed/aborted installation attempts, actual results, optional non-execution and limits explicit; no invented evidence. |

No constitution conflict or unresolved required functional failure was detected. All 57 task IDs
are unique; dependency audit found no missing predecessor or cycle. Local documentation file
links resolve. Final task markers and the file-scope/security audit are reconciled below before
reporting completion. No runtime source, automated test behavior or dependency version changed;
only delivery documentation and comments in the non-secret environment example changed.
Therefore the just-executed clean full gate remains applicable without a redundant rerun.

Limitations remain: the supported prebuilt clean-install path passed, while plain npm ci in the
locked main directory/source-build path did not; artifact-registry access is required; other
platforms/compiler paths are unverified. Local synchronous SQLite/HTTP is not a production TLS,
scale, backup, audit-history or credential-abuse system. Bounded races and orderly reopen tests
do not prove all schedules, power-loss behavior or disk-failure recovery. Optional SV-06 and an
interactive watch-mode session were not executed. None of these is silently reported passing.

### Final files and task state

Changed delivery files: README.md (new), .env.example (comments only),
specs/001-change-request-workflow/quickstart.md, tasks.md and validation.md. Explicit evidence
anchors were added for Unicode-range headings so task links resolve reliably; no historical
test result or metric was rewritten. The final file audit excludes the explicitly ignored build,
dist and dependency directories; a first collector accidentally included the clean-copy artifacts
and exceeded its JSON output limit, then was corrected. This was not a test failure.

Final scope comparison against the 102-file starting snapshot confirms one added document,
four modified delivery files and no deletions. Application code, automated tests/fixtures,
package.json, original package-lock.json, TypeScript/Vitest configuration, constitution,
functional specification, plan, research, data model and API contracts remain unchanged.
The final environment example contains no signing key, and delivered documentation contains no
generated password, JWT or credential-bearing database/log. No existing demo data was changed.
All T001–T057 markers are checked: 57 complete, zero pending. No required blocker remains for
the approved academic MVP, with the installation-path and other limitations recorded above.
The post-implementation hook check found no .specify/extensions.yml. Work stops after T057;
no GitHub push, release, extra feature or dependency upgrade was performed.
