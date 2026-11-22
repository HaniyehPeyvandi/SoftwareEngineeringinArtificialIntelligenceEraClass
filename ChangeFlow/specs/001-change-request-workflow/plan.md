# Implementation Plan: ChangeFlow MVP

**Branch**: `001-change-request-workflow` (Spec Kit feature identifier; no Git branch created)
| **Date**: 2026-11-22 | **Spec**: [spec.md](spec.md)

**Input**: Finalized specification at `specs/001-change-request-workflow/spec.md`.
**Status**: Phase 0 research and Phase 1 design complete; application implementation deferred.

## Summary

Build a local backend REST API for employees to create, edit, submit, and revise Change Requests,
and independent Reviewers to approve or return them with required feedback. Preserve every confirmed
clarification and product text constraint.

Use the requested Node.js/TypeScript, Express, SQLite/better-sqlite3, JWT, and Vitest/Supertest stack.
One application separates HTTP handling, business rules/services, and concrete SQL persistence.
Mutations reload current permissions inside IMMEDIATE transactions and use atomic Version-conditional
updates. No application source, dependency manifest, migrations, database, or tests are implemented.

## Technical Context

**Language/Version**: Node.js 22 LTS; installed baseline v22.23.4 with npm 10.9.9 on Windows.
TypeScript strict mode, ESM. Record exact Node-22-compatible package versions in the implementation
lockfile after dependency resolution and native compatibility checks. Runtime/npm version commands
were verified; dependency installation, native loading, builds, and tests have not been performed.

**Primary Dependencies**: Express 5, better-sqlite3, jose; Node crypto.scrypt. Development:
TypeScript, tsx, Vitest, Supertest, and required type declarations.

**Storage**: One local SQLite file, three tables; foreign keys enabled, rollback journal DELETE,
synchronous FULL, 1000 ms busy timeout. Version starts at 1; [data-model.md](data-model.md).

**Testing**: Vitest rule tests and Supertest integration using real temporary SQLite files and
independent assertion connections. Separate workers/connections establish genuine writer races.

**Target Platform**: Local Windows assessment/development and compatible Node environments.
Bind 127.0.0.1 by default; database on local disk. Native-addon prerequisites must be verified.

**Project Type**: One backend REST service; no frontend, AI, RAG, MCP, or Multi-Agent product features.

**Performance Goals**: Correct bounded academic workflows; no production throughput/latency SLA.
SC-004 requires 20 repetitions per coordinated conflict pair with one legal winner and no loss.
Database lock waiting is bounded to 1000 ms; report lock failures separately from stale writes.

**Constraints**: No unnecessary abstractions. JWT lifetime 15 minutes; current database roles
authorize every operation. Text maxima are code points after surrounding trim. JSON envelope:
128 KiB. No application implementation at this stage.

**Scale/Scope**: Five demo users: two Requesters, two Reviewers, one dual-role user. Small local
dataset; no distributed deployment, pagination/search, role-administration API, or audit history.

## Constitution Check

Pre-research gate: PASS against the finalized specification and requested stack.
Post-design gate: PASS at design level, supported below; not a claim of verified runtime behavior.

| Principle | Pre-research assessment | Post-design evidence |
| --- | --- | --- |
| I. SDD | Final specification exists | No implementation yet; tasks follow this plan |
| II. Simplicity | One process suffices | R-01/R-02; concrete modules, no ORM or DI container |
| III. Separation | HTTP, rules, SQL boundaries required | Service-owned transactions and proposed layout |
| IV. Server access control | Identity and current roles required | R-04; per-operation SQLite role lookup |
| V. No self-approval | Absolute ban including dual-role owners | FR-007, AT-03; non-owner review predicate |
| VI. Preconditions | Validate actor, ownership, status | Same-transaction checks; self-return denied too |
| VII. Concurrency | Version plus atomic writes required | R-03; conditional increment; stale 409 |
| VIII. Tests | HTTP plus actual persisted-state evidence | test-design.md, AT-01–06 and SV-01–05 |
| IX. Consistency | Preserve FR/AS/AT identifiers | Contracts/data/test mapping for FR-001–018 |
| X. Decisions | Record rationale and limitations | research.md R-01–08 and limitations below |
| XI. Scope | Backend MVP only | No excluded product capability or extra admin endpoints |
| XII. Truthful evidence | No invented results | Future commands distinguished from document checks |

No gate failures, unresolved planning questions, or constitution exceptions remain.

## Project Structure

### Documentation (this feature)

```text
specs/001-change-request-workflow/
  spec.md
  checklists/requirements.md
  plan.md
  research.md
  data-model.md
  contracts/
    README.md
    openapi.json
  test-design.md
  quickstart.md
```

tasks.md belongs to the next `$speckit-tasks` phase and is not generated here.

### Source Code (repository root)

Proposed future layout only; no listed application paths are created during planning.

```text
src/
  app.ts                    # app factory, dependency wiring; no listen side effect
  server.ts                 # load config, open store, listen, graceful close
  config.ts                 # validated environment and local defaults
  http/
    auth.ts                 # verify JWT; extract subject only
    routes.ts               # shape checks and HTTP translation
    errors.ts               # sanitized error mapping
  business/
    auth.ts                 # credential checks and token issue
    change-requests.ts      # services own transaction scope
    rules.ts                # pure role/owner/state checks
    text.ts                 # canonical Unicode validator
  persistence/
    database.ts             # settings, transaction helpers, schema initialization
    store.ts                # concrete prepared queries; no workflow decisions
scripts/
  init-db.ts
  seed-demo.ts
tests/
  unit/
  integration/
  support/                  # isolated fixtures and worker barriers
```

**Structure Decision**: One package. Ordinary function injection of config/store supports testing.
Business code does not import Express; persistence does not decide allowed workflows. Services
pass permitted status/ownership predicates to named store operations. No generic repository
interfaces, ORM, event bus, CQRS, separate services, or framework hierarchy.

## Complexity Tracking

No constitution violations or complexity exceptions. IMMEDIATE transactions and separate-worker
race fixtures are necessary for explicit integrity requirements. Planning research assistance does
not add a Multi-Agent application feature.

## Phase 0 — Research Outcome

[research.md](research.md) records R-01–08 with decisions, rationale, alternatives, and primary
documentation links. Research assistance informed the design; primary pages were verified directly.
No unresolved design placeholders remain. Dependency installation/native compatibility and actual
package versions are future implementation checks, not assumed successes.

Alternatives include Node 24/26 LTS, Fastify/NestJS, PostgreSQL/ORM, WAL, session authentication,
role-bearing JWTs, asymmetric signing, Argon2id/bcrypt, raw string-length checks, PATCH/ETags, and
mock-only tests. Each rejection is tied to the MVP or a confirmed requirement.

## Phase 1 — Design

### Authentication and current permissions

Seed five local users with generated credentials, per-user random salts, and securely encoded
scrypt hashes: N=32768, r=8, p=3, 64-byte derived key, salt at least 16 bytes, maxmem 64 MiB.
Derive asynchronously outside transactions, compare equal-length keys with timingSafeEqual,
and return generic invalid-credentials errors. Rerunning seed preserves roles and passwords.

jose verifies HS256 only, fixed issuer changeflow, audience changeflow-api, UUID sub, iat, exp,
and 15-minute lifetime. Use a random secret of at least 32 decoded bytes. No role claim authorizes.
The business service reloads active user and roles for every operation in its database transaction.
Revocation committed before the transaction is observed even with an unexpired token. Missing/
inactive subject is 401; removed required role is 403. An operation ordered first can finish;
revocation does not retroactively cancel it. Read snapshots enforce consistent identity/visibility.

No registration, password reset, refresh tokens, or role-management HTTP feature is added. Password
hashing and JWT signing never hold SQLite write locks. R-04/R-05 compare alternatives.

### Operations and transaction boundaries

Create derives requesterId/Draft/Version 1 from the server. Edit/Submit require owner and current
Requester role in Draft or ChangesRequested. Approve/RequestChanges require current Reviewer,
PendingReview, and actor different from requester, even if the owner has both roles.

Inside a synchronous IMMEDIATE transaction: reload identity/roles; load request; check ownership/
independence; compare Version; validate status and content; execute one conditional write; inspect
saved row; commit. Predicate matches id, expected Version, allowed status, and owner/non-owner.
Increment Version once in the same statement and require exactly one affected row. No async work,
await, password derivation, or network call in callbacks. Emit success only after commit.

Outdated Version gives 409 VERSION_CONFLICT. A current Version in a forbidden status gives
409 INVALID_STATUS. Authorization precedes either; errors contain no protected row. A zero-row
conditional write is never success. All failures roll back; SQLite busy timeout is 503 STORAGE_BUSY,
not a stale Version. Other known persistence failures map to sanitized 503, unexpected faults to
500. Callers retrieve permitted current state and decide again; no automatic command replay.

### Text and reviewer feedback

One validator measures a trimmed copy in Unicode code points: Title 200, Description 5000,
Reason 2000, required reviewer comment 2000. Reject blank, overlength, non-string, or malformed
Unicode transport values appropriately. Preserve supplied valid text; do not normalize, truncate,
count bytes/UTF-16/graphemes, or use SQLite trim. R-06 defines exact technical whitespace handling.

RequestChanges saves status, Version increment, and required latest comment together. Preserve
comment through owner edits/resubmission/approval; replace only on another successful return.
Owners read it in every status. No comment history. Failed operations preserve all prior fields.

### API contracts

[contracts/README.md](contracts/README.md) and [openapi.json](contracts/openapi.json) define nine
operations, strict request/response schemas, permissions, transitions, auth, errors, and recovery.
Use JSON camelCase; version is the specification's integer Version. PUT replaces proposal fields;
named POST actions enforce lifecycle. Owner/status overrides are 400. Create returns 201, accepted
mutations/reads 200, present invalid text 422, malformed envelopes 400, body size 413, media type 415.

Owner lists/read access cover own requests in all statuses; Reviewer-only access covers others'
PendingReview only. Authorized mutation responses may return the saved result, without granting
later GET access after a request leaves PendingReview. Conflict bodies do not expose current
content, comment, or Version. OpenAPI post-trim annotations avoid invalid raw maxLength checks.

### Verification and incremental sequencing

[test-design.md](test-design.md) maps FR-001–018 and success criteria to tests. Preserve six
individual AT cases: Draft creation, Submit, dual-role self-approval denial, independent approval,
Approved-edit denial, and outdated-Version rejection. Every critical test asserts HTTP and actual
SQLite state via a separate connection. Supplementary tests cover authorization/current roles,
all state combinations, comment cycles, Unicode/boundaries, reopen persistence, and real races.
SV-06 injected persistence failure remains optional.

Race workers share one temporary file but use separate connections/application instances and IPC
barriers. Promise.all on one synchronous event loop alone is not overlap evidence. Repeat each
SC-004 pair 20 times; force both orders for differing actions. Test lock timeout separately from
healthy one-winner/one-conflict behavior.

Suggested dependency order for later task generation:
1. Toolchain, schema/config, app factory, test fixtures, credential bootstrap, JWT/current-role checks.
2. Owner create/read/edit with Unicode validation and atomic Version safeguards; AT-01.
3. Submit and status/ownership denial coverage; AT-02/AT-05.
4. Independent review, required comments, revisions/resubmission; AT-03/AT-04 and SV coverage.
5. AT-06, coordinated writer/revocation races, persistence/contract checks, and real validation evidence.

Every increment includes its relevant tests; concurrency protection begins with the first mutation.
These are sequencing guidelines, not application implementation or a generated tasks.md.

## Known Limitations and Validation Status

- Local low-volume single-process demo; synchronous database/busy waiting blocks the event loop.
  No availability SLA, scaling, backup system, distributed operation, or production load claims.
- Loopback HTTP only by default. External exposure requires separate TLS, credential-abuse,
  deployment, and operational work; no such system is silently added.
- No immediate logout token invalidation. Short token expiry and current DB active/role checks
  govern access; a transaction ordered before revocation can finish.
- Distinct forbidden/nonexistent status codes can reveal existence but no protected content.
- Controlled local maintenance is trusted. Direct database tampering bypasses application rules.
- 128 KiB envelopes limit extremely padded text independently of the trimmed product maxima.
- Version is a JavaScript-safe integer; no wraparound. Overflow fails without changes.
- Actual package versions, native builds, typecheck/build/test outcomes, performance, and database
  evidence must be established during implementation. No dependencies installed or server run here.

Next: `$speckit-tasks`. [quickstart.md](quickstart.md) provides future setup/run/validation commands,
explicitly labeled as unexecuted.
