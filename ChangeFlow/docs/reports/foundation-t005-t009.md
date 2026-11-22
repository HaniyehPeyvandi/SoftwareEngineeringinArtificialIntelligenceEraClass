# Scoped foundation implementation: T005–T009

Date: 2026-11-22. Skill: `speckit-implement`. Scope ends at T009.
Environment rechecked: Node.js v22.23.4, npm 10.9.9, Windows.

## Exact files changed

Created:

- `src/business/rules.ts`
- `src/config.ts`
- `src/persistence/database.ts`
- `src/persistence/store.ts`
- `tests/support/database.ts`
- `tests/unit/foundation.test.ts`
- `docs/reports/foundation-t005-t009.md` (this report)

Updated: `specs/001-change-request-workflow/tasks.md`, for scoped status, evidence link,
and T005–T009 completion markers. T001–T004 remain complete; T010–T057 remain unchecked.

Package/configuration files, dependencies, lockfile, constitution, specification, planning
documents, data model, contracts, checklists, and previous reports were preserved.

## Implemented and verified

| Task | Implementation and focused evidence |
| --- | --- |
| T005 | Approved role/status/operation types and the contract's 13 error codes with safe messages. No Express/SQLite imports in business code. Contract-code equality checked. HTTP error mapping and workflow guards remain later work. |
| T006 | Explicit environment loading; loopback/port/path defaults; validated host and port; local persistent database paths; rejection of empty, memory, URI, network-share, NUL, and directory settings; canonical base64 key with at least 32 decoded bytes. Fixed issuer/audience/900-second lifetime. Configuration errors name the field without echoing values. Randomness of an operator-supplied secret cannot be established by validation; operators must generate it securely as planned. |
| T007 | Three STRICT tables with required fields, active/role/status constraints, safe integer Version, structural comment constraints, case-sensitive usernames, role cascade and requester deletion restriction; both specified indexes and column order. Per-connection foreign keys, DELETE journal, FULL synchronous, 1000 ms busy timeout. Explicit atomic user_version=1 initialization; repeated initialization preserves data, unsupported versions fail, partial initialization rolls back. Read-only DEFERRED scopes and IMMEDIATE writes reject nesting/async callbacks. Returned promises and thrown/commit failures roll back. |
| T008 | Bound credential and identity/role queries, using the caller's existing transaction. Each call reads current rows; no identity/role result cache. Inactive identities are returned for the future business layer to decide access. Verified committed role/active changes through another connection are visible on the next transaction, case-sensitive lookup, and injection-shaped values. Storage errors distinguish busy/unavailable/invariant faults without leaking SQL, paths, or values. |
| T009 | Fresh real temporary SQLite files independent of demo environment; seven controlled users including dual-role, no-role, and disabled identities; four prepared request statuses. Random fixture passwords and independent salts with real asynchronous scrypt preparation outside transactions. Separate read-only assertion connections and consistent all-table snapshots. Additional connections are tracked; cleanup rolls back open transactions, closes connections, checks the owned temporary path, and removes files with Windows retries. Verified separate fixtures, persisted reopen state, and repeated cleanup. |

Schema enforces structural invariants, not Unicode text validation or allowed workflow operations.
Those business rules and atomic Version-conditional application mutations remain later tasks.
The prepared status rows are direct test fixtures, not evidence of successful transitions.

Callers must apply `withStorageErrors` around the complete `readTransaction`/`writeTransaction`
call, including BEGIN and COMMIT. Individual query error translation alone cannot cover commit
failure. Focused tests exercised actual writer-reservation and COMMIT lock failures through
separate real connections; both returned STORAGE_BUSY and preserved committed snapshots.
These are foundation checks, not the future HTTP/worker race scenarios.

Fixture-only password records use `scrypt$32768$8$3$<base64-salt>$<base64-derived-key>`;
salt length is 16 bytes, derived key 64 bytes, maxmem 64 MiB. T011 must implement production
credential handling consistently; no production hashing, password verification, or JWT issuance
was implemented here. Test-only credentials are neither logged nor committed as data.

## Commands and actual outcomes

| Command/check | Observed outcome |
| --- | --- |
| `& .specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks` | Returned the expected feature path and required planning documents. |
| Read-only checklist scan | `requirements.md`: 17 checked, 0 unchecked; PASS. Checklist unchanged. |
| `git rev-parse --git-dir` | No Git repository. Existing ignore entries inspected directly; no claim of a Git ignore verification. |
| `Test-Path .specify/extensions.yml` (before and after implementation) | False; no pre/post extension hooks configured. |
| `node --version` | v22.23.4 |
| `npm --version` | 10.9.9 |
| Initial `npm run typecheck` | Exit 1: TS7034/TS7005/TS7053 for an untyped fixture preparation array. Fixed with an explicit local type. |
| `npm run typecheck` after the fix | Exit 0. |
| Initial `npm test -- tests/unit/foundation.test.ts` inside sandbox | Exit 1; worker could not spawn (`EPERM`), followed by worker termination timeout. No tests executed in that attempt. |
| Same focused test command with approved sandbox escalation | Exit 1; 40 passed, 1 failed, 41 total. Failure was an incorrectly escaped UNC literal in test data (one leading backslash is a local rooted path). Corrected the literal without changing production path behavior. |
| Final `npm run typecheck` | Exit 0, following the test correction and additional index/fixture assertions. |
| Final `npm test -- tests/unit/foundation.test.ts` with approved escalation | Exit 0; 1 file passed, 41 tests passed, no skipped tests. Vitest reported duration 13.14 seconds. |

Final read-only scope checks compare file hashes with the pre-implementation baseline and verify
that only T001–T009 are checked out of 57 tasks. They also check the absence of later-task source
files and the preservation of existing package/configuration and approved document files.

## Limits and disposition

No unresolved blocker for T005–T009 remains. The passing count refers only to focused foundation
tests. No HTTP endpoints, application factory/server, login/JWT implementation, demo seed command,
or workflow service exists. AT-01–AT-06, HTTP-plus-SQLite acceptance coverage, real concurrent-worker
SV-05 tests, and the foundation completion gate T016 have not been implemented or executed.
No dependency installation, application build, full-suite acceptance run, or manual HTTP journey
was performed during this increment. The application is not yet functional.

Stop at T009 as requested; no T010 or later task is marked complete.
