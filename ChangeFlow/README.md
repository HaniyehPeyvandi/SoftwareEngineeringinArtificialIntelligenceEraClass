# ChangeFlow

An academic backend MVP for employees to propose Change Requests and independent Reviewers to
approve them or request changes. A dual-role user cannot approve or return their own request.
The workflow is Draft → PendingReview → Approved, with a ChangesRequested → revision →
PendingReview loop. [Validation evidence](specs/001-change-request-workflow/validation.md)
records actual checks and their limits; historical failures are retained.

All 57 planned tasks are complete within the approved academic scope. The final clean-install
copy passed typecheck/build and 1639 tests with no failures/skips, including the six assignment
scenarios and 140 real-worker race rounds. An isolated real TCP/SQLite quickstart passed 35
expected HTTP checks. No release or GitHub publication is part of this verification.

## Run locally

Use Windows with Node.js **v22.23.4**, npm **10.9.9**, and a writable local disk. The package pins
Node `>=22.23.4 <23` and npm `>=10.9.9 <11`. From this directory, follow the complete
[PowerShell quickstart](specs/001-change-request-workflow/quickstart.md). It covers private
configuration, initialization, generated demo credentials, HTTP operations and SQLite inspection.

The locked better-sqlite3 13.2.0 package includes a Windows x64 native binary. npm 10's clean
installation can infer an unwanted node-gyp build from its binding.gyp while missing the package's
`gypfile: false` metadata. The documented install avoids that automatic build and explicitly runs
the required esbuild postinstall; it does not disable TLS verification or alter the lockfile:

```powershell
npm ci --ignore-scripts --engine-strict --no-fund --offline=false --fetch-retries=0 --fetch-timeout=30000
npm rebuild esbuild --offline=false --fetch-retries=0 --fetch-timeout=30000
npm run typecheck
npm run build
npm test -- --maxWorkers=2
```

Set a private `JWT_SECRET_BASE64` before database commands. `.env.example` deliberately has an
empty secret. `npm run db:init` initializes a schema without resetting data. `npm run db:seed`
creates only missing demo accounts and displays their generated passwords once locally:
`requester-a`, `requester-b`, `reviewer-a`, `reviewer-b`, and `dual-role`. Save credentials privately;
seed reruns preserve existing passwords, disabled state, revoked roles and requests.

Start with `npm run dev` for watch mode, or after building:

```powershell
node --env-file-if-exists=.env dist/src/server.js
```

There is no `npm start` script. Startup does not initialize or seed automatically. Bind defaults
to `127.0.0.1:3000`; use Ctrl+C to stop normally. No external database or frontend is required.

## API

All bodies and responses use JSON. Every operation except login requires `Authorization: Bearer`
with a valid JWT; login returns `accessToken`, `tokenType` and `expiresIn=900`. Exact strict schemas,
headers, error codes and precedence are in the [HTTP contract](specs/001-change-request-workflow/contracts/README.md)
and [OpenAPI](specs/001-change-request-workflow/contracts/openapi.json).

| Method / path | Permission and behavior |
| --- | --- |
| POST `/api/auth/login` | Active local account and password. |
| POST `/api/change-requests` | Current Requester; create owned Draft, Version 1. |
| GET `/api/change-requests/mine` | Current Requester; own requests, all statuses. |
| GET `/api/change-requests/pending-review` | Current Reviewer; other users' PendingReview only. |
| GET `/api/change-requests/{id}` | Owner + Requester in any status; independent Reviewer in PendingReview. |
| PUT `/api/change-requests/{id}` | Owner + Requester; replace title/description/reason in Draft or ChangesRequested. |
| POST `/api/change-requests/{id}/submit` | Owner + Requester; Draft/ChangesRequested → PendingReview. |
| POST `/api/change-requests/{id}/approve` | Independent current Reviewer; PendingReview → Approved. |
| POST `/api/change-requests/{id}/request-changes` | Independent current Reviewer; PendingReview → ChangesRequested, required comment. |

Create accepts exactly `title`, `description`, `reason`. Edit additionally requires `version`;
Submit/Approve accept exactly `version`; RequestChanges accepts exactly `version`, `comment`.
Text is required and non-whitespace, with post-trim Unicode-code-point maxima 200/5000/2000/2000
respectively. Valid original text is preserved; no normalization or truncation. The latest
reviewer comment survives Edit, Submit and Approve, and is replaced only on a successful return.

## Security and concurrency

JWTs establish identity only. Each protected operation reloads active state and current roles
from SQLite inside its transaction. Role revocation affects later transactions using existing
tokens; an operation ordered before revocation may finish. Passwords use salted asynchronous
scrypt. Signing keys, hashes, tokens, credentials and local databases must stay private.

Business rules/services, HTTP adapters and concrete persistence are separate modules in one
application. Mutations use synchronous IMMEDIATE transactions and atomic conditional Version,
status and ownership predicates. Accepted edits/transitions increment Version once and respond
after commit. Stale intent is `409 VERSION_CONFLICT`; callers retrieve permitted current state
and make a new decision. Invalid current status is `409 INVALID_STATUS`. Lock timeout is
`503 STORAGE_BUSY`, never proof of a stale conflict. Safe-integer exhaustion is rejected without
wraparound. Rejected operations preserve persisted business state.

## Verification and limits

`npm test` is non-watch; `--maxWorkers=2` limits file-worker resource use without skipping tests
or replacing independent-worker races. Critical cases inspect actual temporary SQLite files
through independent connections. Six assignment scenarios AT-01–AT-06, required SV-01–SV-05,
all-state authorization, text/contract checks and reopen durability are represented. Seven race
fixture pairs run 20 coordinated rounds each, including both first-writer orders. Optional SV-06
arbitrary persistence-failure injection is separately reported rather than assumed to pass.

This is a local low-volume academic service, not a production deployment. Synchronous SQLite
can block the event loop; there is no scale/availability SLA, distributed operation, backup
service, audit history, pagination/search, role-administration API, registration, password reset
or refresh/logout revocation feature. Loopback HTTP assumes trusted local access; TLS and
Internet-facing credential-abuse controls are outside scope. Distinct 403/404 responses can reveal
existence, but not protected content. JSON envelopes are limited to 128 KiB independently of
trimmed text limits. Direct database maintenance is trusted and can bypass application rules.

Native compatibility must be verified on any other platform. The lockfile references the artifact
registry used by the assessment environment; other machines need access to those URLs. A public
registry install, other architectures, power-loss durability and every possible race schedule are
not established by the local checks. No Frontend, AI, RAG, MCP or Multi-Agent product is included.

## SDD artifact index

| Artifact | Purpose |
| --- | --- |
| [Constitution](.specify/memory/constitution.md) | Twelve governing principles. |
| [Specification and clarifications](specs/001-change-request-workflow/spec.md) | Approved FR/AS/AT/SV/SC requirements and product decisions. |
| [Requirements checklist](specs/001-change-request-workflow/checklists/requirements.md) | Read-only specification-quality gate. |
| [Implementation plan](specs/001-change-request-workflow/plan.md) | Approved architecture and incremental approach. |
| [Research/decisions](specs/001-change-request-workflow/research.md) | Alternatives, rationale and tradeoffs. |
| [Data model](specs/001-change-request-workflow/data-model.md) | Fourteen qualified database columns, invariants and transactions. |
| [HTTP contract](specs/001-change-request-workflow/contracts/README.md) / [OpenAPI](specs/001-change-request-workflow/contracts/openapi.json) | Nine operations, schemas and errors. |
| [Test design](specs/001-change-request-workflow/test-design.md) | Mandatory, supplementary and real-worker verification obligations. |
| [Tasks](specs/001-change-request-workflow/tasks.md) | 57 dependency-ordered tasks and observed completion state. |
| [Quickstart](specs/001-change-request-workflow/quickstart.md) | Reproducible setup and local HTTP/database journey. |
| [Validation and final traceability](specs/001-change-request-workflow/validation.md) | Actual commands/results, initial failures, final audit and limitations. |
| [Earlier analysis runs](docs/reports/analyze.md) | Historical document-only reviews, not application test evidence. |
| [Setup report](docs/reports/setup-phase-1.md) / [early foundation report](docs/reports/foundation-t005-t009.md) | Earlier scoped implementation evidence. |

The data model's 14 distinct database fields and OpenAPI's 15 constrained text/Version property
occurrences count different things; the final validation audit explains both. Planning-time
statements in retained design/analysis artifacts describe their original phase. Current execution
and completion claims come from tasks and validation, not those historical statements.
