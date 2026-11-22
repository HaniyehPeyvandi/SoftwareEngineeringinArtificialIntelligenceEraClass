# ChangeFlow Planned Validation Guide

These commands are the intended interface after implementation. No package.json, source files,
database, seed script, or tests exist yet; commands below have NOT been executed. This planning
document is not evidence of a working application.

## Prerequisites and setup

- Node.js 22 LTS; the current Windows baseline is Node.js v22.23.4 and npm 10.9.9, confirmed by
  `node --version` and `npm --version`. These version checks do not validate application compatibility.
  See [research.md](research.md#node-22-compatibility-review) for documented dependency support.
  better-sqlite3 still requires a matching Windows native binary or a successful local build;
  record the resolved versions, architecture, and any compiler requirements during implementation.
- Local disk writable for a SQLite file; use a temporary path for tests. No external database.
- A cryptographically random JWT secret containing at least 32 bytes after base64 decoding.
  Supply JWT_SECRET_BASE64, DATABASE_PATH, HOST=127.0.0.1, and PORT=3000 through environment
  variables. Never commit the secret or generated demo passwords.

From the repository root, after application artifacts have been implemented:

```text
npm ci
npm run db:init
npm run db:seed
npm run typecheck
npm run build
npm test -- --run
npm run dev
```

The implementation phase initially creates package.json and package-lock.json; npm ci applies
after that lockfile exists. Scripts are required planned outputs, not currently available commands.
Resolve direct/transitive dependencies for Node.js 22.23.4, including the Vite version used by Vitest,
and use Node 22 type declarations. Pin the versions actually installed; documentation-level engine
support is not evidence of a successful install, native module load, build, or test run.
db:init applies versioned schema initialization without deleting data; db:seed adds absent demo
users and displays generated credentials once. Reruns preserve hashes, requests, and role changes.
Test runs use independent temporary databases regardless of DATABASE_PATH for the running demo.

## Manual HTTP journey

Use any HTTP client with JSON bodies and Authorization: Bearer tokens. The exact envelopes and
permissions are in [contracts/README.md](contracts/README.md) and
[openapi.json](contracts/openapi.json); do not invent additional endpoints.

1. Login as a generated Requester through POST /api/auth/login; expect 200 and a 900-second token.
2. POST /api/change-requests with valid title, description, and reason. Expect 201 Draft,
   server-owned requesterId, version=1, reviewerComment=null, and Location pointing to its ID.
3. PUT the owned request with all three editable fields and version=1. Expect 200, retained Draft,
   and version=2. Save a stale copy of version=1 for the next step.
4. Retry a different PUT with version=1. Expect 409 VERSION_CONFLICT. Owner GET must still show
   the winning version=2; independently inspect SQLite as described below to verify persistence.
5. Submit with version=2. Expect PendingReview/version=3. Login as an independent Reviewer and
   retrieve the pending list. The owner's Drafts must never appear there.
6. RequestChanges with version=3 and a non-whitespace comment. Expect ChangesRequested/version=4.
   Owner reads the same comment, edits (version=5), and resubmits (version=6); comment is retained.
7. Independently approve with version=6. Expect Approved/version=7 and retained latest comment.
   Owner GET remains allowed; Reviewer-only GET of the Approved request is 403.
8. Owner attempts a valid content edit with version=7. Expect 409 INVALID_STATUS and no changes.
9. On a separate dual-role user's own PendingReview request, attempt Approve and RequestChanges.
   Both must return 403 even with correct Version and a valid return comment.

## Required automated evidence

Run the six separately named AT-01 through AT-06 integration tests and required supplementary
groups from [test-design.md](test-design.md). Each critical test must assert HTTP status/body AND
read actual SQLite state through a separate connection. An HTTP GET alone is not database evidence.
Confirm comment retention/replacement, denied reads, role revocation using an existing token,
exact-max/max+1 text, padded input, astral/combining Unicode, and no silent truncation.

For manual inspection, use a SQLite viewer/CLI if installed, or the independent better-sqlite3
inspection connection used by the integration suite. Inspect change_requests for id, title,
description, reason, requester_id, status, reviewer_comment, and version after each critical step.
Compare rejected operations against before snapshots and check row counts. Reopen the database
to verify persistence across connection closure. Never include passwords, hashes, or JWT secrets
in saved evidence.

True race tests use separate workers/connections and barriers, not only simultaneous promises.
Run the SC-004 20-repetition cases and inspect both outcomes and final row. Test lock timeout as
503 separately from stale-Version 409. Optional injected persistence failure must roll back fully.

## Role freshness demonstration and shutdown

Using a local database maintenance connection or controlled test fixture, delete a user's required
role and commit. Reuse their previously issued token: subsequent protected operations requiring
that role must return 403 with no changes. Setting active=0 must give 401. Do not add a role-editing
HTTP endpoint. Never modify demo roles implicitly on seed reruns.

Stop the server normally; close its SQLite connection. Reopen with the same DATABASE_PATH and
confirm saved requests remain. Only remove files explicitly created by a test fixture after all
workers/connections close; never point destructive test cleanup at the demo database.

Record the command, exit status, observed response/database comparisons, and limitations of every
check actually run. No expected result in this guide is a claim that validation has passed.
