# ChangeFlow Technical Decisions

Date: 2026-11-22. Status: design research complete; runtime baseline updated to the installed
Node.js v22.23.4/npm 10.9.9 on Windows. Version commands were verified; no dependencies installed
or application checks executed. Decisions implement [spec.md](spec.md), including all confirmed clarifications.
Primary documentation was consulted for the mechanisms below. Package patch versions and native
binary compatibility must be recorded in the lockfile and verified during implementation.

## R-01 — Runtime and HTTP framework

**Decision:** Node.js 22 LTS, using the installed v22.23.4 with npm 10.9.9 on Windows; TypeScript
in strict mode, ESM, Express 5. Use TypeScript compilation for production output and tsx for
development/seed commands. Resolve maintained releases compatible with this Node 22 baseline
at implementation time and commit package-lock.json; do not invent installed or tested versions.

**Rationale:** Node 22 is an LTS line in the official release table and is already installed in
the assessment environment. Its available capabilities cover this academic MVP without a runtime
upgrade. Official dependency documentation/manifests reviewed below identify compatible options;
no product behavior or architecture relies on Node 24-only features. Express matches the requested
stack and provides sufficient routing/error handling. This avoids an unnecessary environment
change while keeping the same security, concurrency, and test design.
[Node releases](https://nodejs.org/en/about/previous-releases),
[Express errors](https://expressjs.com/en/guide/error-handling/).

**Alternatives:** Node 24 LTS (the previous plan) and Node 26 LTS provide newer runtime baselines
but require changing the installed environment without a demonstrated MVP requirement. Revisit
them if support lifetime or verified dependency requirements justify an upgrade; do not upgrade
silently. Express 4 needs more explicit asynchronous error forwarding. Fastify changes the requested
stack; NestJS adds unnecessary layers. No runtime downgrade below the selected Node 22 baseline
is planned.

### Node 22 compatibility review

Review date: 2026-11-22. The local `node --version` and `npm --version` commands returned
`v22.23.4` and `10.9.9`. These are environment observations only. No package.json or lockfile exists
yet, and the earlier plan selected Express 5 but did not select exact dependency versions.
The releases below are concrete documentation examples showing compatible options, not newly
pinned versions, claims about the latest release, or a verified dependency tree.

| Dependency / examined release | Official support evidence | Assessment for Node.js 22.23.4 |
| --- | --- | --- |
| Express 5; 5.1.0 manifest | Node >=18 in the [Express installation guide](https://expressjs.com/en/starter/installing/) and [tagged manifest](https://raw.githubusercontent.com/expressjs/express/v5.1.0/package.json) | Meets documented runtime requirement. |
| better-sqlite3 12.4.1 | [Tagged manifest](https://raw.githubusercontent.com/WiseLibs/better-sqlite3/v12.4.1/package.json) explicitly includes 22.x | Engine range accepts Node 22; matching Windows native binary/local compilation and module loading remain unverified. |
| jose 6.x; 6.1.3 manifest | [Maintainer documentation](https://github.com/panva/jose#supported-runtimes) lists Node.js and v6 ESM/Web API support; [tagged manifest](https://raw.githubusercontent.com/panva/jose/v6.1.3/package.json) exports the ESM implementation | Node 22 supplies the runtime APIs for the planned ESM/HS256 design. This is documentation-based support, not a JWT execution test. The CommonJS require(esm) footnote is not a requirement for this ESM application. |
| TypeScript 5.9.3 | [Tagged compiler manifest](https://raw.githubusercontent.com/microsoft/TypeScript/v5.9.3/package.json) specifies Node >=14.17 | Meets compiler engine requirement. Choose Node 22 type declarations; compilation remains unverified. |
| Vitest 4.0.18 | [Tagged manifest](https://raw.githubusercontent.com/vitest-dev/vitest/v4.0.18/packages/vitest/package.json) includes ^22.0.0 and allows Vite 6/7; [Vite 7.3.1 manifest](https://raw.githubusercontent.com/vitejs/vite/v7.3.1/packages/vite/package.json) requires ^20.19.0 or >=22.12.0 | Meets both examined engine ranges. The actual Vitest/Vite/transitive tree must still be resolved and run on Windows. |
| Supertest 7.1.4 | [Tagged manifest](https://raw.githubusercontent.com/forwardemail/supertest/v7.1.4/package.json) specifies Node >=14.18.0 | Meets documented runtime requirement; HTTP integration execution remains unverified. |

The additional planned tsx runner's [upstream manifest](https://raw.githubusercontent.com/privatenumber/tsx/master/package.json)
specifies Node >=18. Use its Node-22-compatible maintained release and verify the worker/loader
path during implementation. Continue using TypeScript compilation and tsx as planned; native
TypeScript execution is not a replacement for typechecking or the selected development tooling.

**Remaining verification:** Select and lock exact compatible direct/transitive versions, verify
the better-sqlite3 Windows architecture/native binary or compiler path, exercise jose and the
TypeScript worker harness, and run typecheck/build/full tests under Node.js 22.23.4/npm 10.9.9.
The documented support evidence reveals no runtime requirement forcing Node 24, but none of
these installation/build/runtime checks has been executed. Existing T001/T016/T054 already cover
those checks; tasks.md does not explicitly require Node 24 and is unchanged.

## R-02 — Minimal separation

**Decision:** Thin HTTP handlers, a small business-service module, pure workflow/text rules, and
one concrete SQLite store with transaction helpers and prepared statements. Inject the store and
configuration as ordinary function arguments. No ORM, DI container, generic repositories, CQRS,
event bus, or separate deployable services.

**Rationale:** Business rules can be tested independently while HTTP and SQL remain separate.
Transaction ownership stays visible in the service rather than being split across controllers.

**Alternatives:** Controller-only SQL hides authorization and concurrency rules; a rich domain
framework or ports/adapters hierarchy adds ceremony. Concrete store functions provide the small
boundary required by constitution III without speculative abstractions.

## R-03 — SQLite and concurrency

**Decision:** better-sqlite3 with prepared/bound statements and short synchronous transactions.
Every mutation uses an IMMEDIATE transaction; check current permissions and request preconditions
inside it, then update using expected integer Version and permitted status/ownership predicates.
Require one affected row and increment Version once. Throw on failure and return success only after
commit. Set foreign_keys=ON, journal_mode=DELETE, synchronous=FULL, and a 1000 ms busy timeout per
connection. Read operations use one short read transaction for identity, roles, and request snapshot.

**Rationale:** SQLite serializes writers; IMMEDIATE reserves the writer before precondition reads.
Client Versions still detect stale intent even when writers execute sequentially. better-sqlite3
provides synchronous transaction wrappers and changed-row counts; callbacks must not await.
[Transactions](https://www.sqlite.org/lang_transaction.html),
[better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).

**Alternatives:** A plain read followed by an unconditional write loses updates. A conditional write
without coordinating role reads leaves a revocation race. Deferred transactions can fail while
upgrading a read to a writer. An ORM is unnecessary for three small tables. PostgreSQL is better
for many simultaneous writers but requires a separate service. WAL permits more reader/writer
overlap but still has one writer; rollback journaling is enough for this local low-volume MVP and
avoids additional WAL lifecycle concerns. [SQLite WAL](https://www.sqlite.org/wal.html).

**Tradeoff:** The synchronous driver and busy wait block the event loop. Lock timeout is 503
STORAGE_BUSY, not 409 VERSION_CONFLICT. Do not automatically replay a command with a newer Version.

## R-04 — Authentication and current authorization

**Decision:** jose signs/verifies HS256 JWTs with a random secret of at least 32 bytes, fixed issuer
changeflow, audience changeflow-api, subject=user ID, issued-at, and 15-minute expiry. Explicitly
allow only HS256 and require all these claims. Tokens carry no authoritative roles. The service
loads active user and current roles from SQLite for each operation, inside its transaction.

**Rationale:** Existing tokens lose a revoked role on the next transaction after revocation commits.
Disabling/deleting the user produces 401; removing a role produces 403 for that role's operations.
An operation already ordered before revocation can finish; revocation is not retroactive. Tokens
do not grant ownership or bypass self-review bans. [jose](https://github.com/panva/jose),
[JWT best practices](https://www.rfc-editor.org/info/rfc8725/).

**Alternatives:** Role-bearing JWTs alone keep revoked privileges until expiry. A denylist or
refresh-token subsystem is unnecessary with database lookups and short-lived tokens. Server-side
sessions are reasonable but JWT is requested. Asymmetric signing benefits multiple verifiers;
HS256 is sufficient for one issuer/verifier. No registration, role-management HTTP endpoints,
logout/revocation service, or password-reset workflow is added.

## R-05 — Passwords and local demo identities

**Decision:** Node crypto.scrypt with per-user random salt of at least 16 bytes, N=32768, r=8,
p=3, derived-key length 64 bytes, and maxmem=64 MiB. Store algorithm, parameters, salt, and hash.
Use asynchronous derivation outside database transactions and equal-length timingSafeEqual.
Use generic invalid-credentials responses and a dummy derivation for unknown usernames.
Bootstrap five local users: two Requesters, two Reviewers, one dual-role user. Generate demo
passwords on first explicit seed and show them once locally; never commit plaintext credentials.
Rerunning seed must not reset existing passwords or revoked roles. Disabled/no-role users are
additional test fixtures only. Login rechecks the user's active state after password derivation.

**Rationale:** scrypt is built in and avoids another native password dependency. The selected
work factors are one OWASP-listed configuration. Measure resource use in implementation;
do not silently reduce cost to make tests faster. [Node 22 crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html),
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

**Alternatives:** Argon2id is a good default with a dependency; bcrypt requires care over password
byte limits. Unsalted hashes and hardcoded demo passwords are rejected. Local loopback access
is assumed; Internet-facing credential-abuse controls are outside this demo scope.

## R-06 — Text validation and preservation

**Decision:** One pure validator trims a copy for measurement, rejects empty/non-string values,
and iterates Unicode code points. Maxima: Title 200, Description 5000, Reason 2000, reviewer
comment 2000. Use ECMAScript trim whitespace semantics consistently, including NBSP and BOM;
interior whitespace counts. No NFC/NFD normalization, grapheme counting, truncation, or use of
UTF-16 string.length for these limits. Persist the supplied text unchanged; trimming is for
validation, so no additional product normalization is introduced. Reject malformed Unicode
(unpaired surrogates) as 400 INVALID_REQUEST before storage to prevent lossy encoding round trips.
This is a transport-validity constraint, not a change to valid Unicode text limits.

**Rationale:** Astral characters count once, while base-plus-combining sequences count twice.
An OpenAPI maxLength on raw input would wrongly reject valid surrounding whitespace; annotate
the post-trim constraint and validate in the business layer. SQLite trim has different semantics,
so do not delegate this rule to it. [ECMAScript text processing](https://tc39.es/ecma262/multipage/text-processing.html).

**Alternatives:** Grapheme counting changes the confirmed requirement; database-only length checks
cannot reliably reproduce the chosen trimming rule. Storing trimmed text would impose extra
normalization not requested by the specification.

## R-07 — Contract and HTTP choices

**Decision:** OpenAPI 3.1 JSON plus a concise behavioral contract. JSON camelCase names map to
specification concepts; version represents Version. PUT replaces the three editable text fields;
named POST actions handle transitions. No generic status setter. Strict request bodies reject
unknown keys. Use 400 malformed request, 401 authentication, 403 authorization, 404 absent ID,
409 stale Version/invalid status with distinct codes, 422 text validation, 413 transport size,
415 unsupported content type, 503 storage unavailable, and 500 unexpected failure.

**Rationale:** Explicit commands expose the workflow without unnecessary endpoints. A Version in
the body is easy to demonstrate; errors are stable and do not disclose another user's request.
Successful review actions can return their changed row without granting later GET access outside
PendingReview. [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html).

**Alternatives:** PATCH would need omitted-field semantics; generic status updates allow invalid
transitions. ETag/If-Match is sound but body Version avoids mixing two concurrency conventions.
Full resource bodies on conflicts could leak data after reviewer visibility changes.

## R-08 — Verification and incremental delivery

**Decision:** Vitest, Supertest, real temporary SQLite files, separate assertion connections,
and worker/process-based contention fixtures. Give the six assignment cases stable test names.
Pure rule tests supplement HTTP/database integration tests. Use independent application workers
for true writer contention; a single-event-loop Promise.all is not proof of overlapping writes.
[Vitest](https://vitest.dev/guide/), [Supertest](https://github.com/forwardemail/supertest).

**Alternatives:** Mock-only tests miss persistence and transaction failures. Separate in-memory
connections do not share a database. Full external end-to-end infrastructure is unnecessary.

All planning unknowns are resolved. Implementation must verify toolchain/native-addon compatibility
and record actual check outcomes. No production availability, high throughput, distributed
deployment, audit history, frontend, AI, RAG, MCP, or Multi-Agent product capability is promised.
