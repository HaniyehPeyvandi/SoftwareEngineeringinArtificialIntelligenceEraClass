# ChangeFlow Data Model

Design only; no migration or application code is created. Source: [spec.md](spec.md).
Decisions: [research.md](research.md). JSON/database names are camelCase/snake_case mappings of
the specification's concepts; version is its integer Version.

## Persistent entities

### users

| Column | SQLite type / constraint | Meaning |
| --- | --- | --- |
| id | TEXT primary key | Server-generated UUID; JWT subject; immutable |
| username | TEXT unique, not null | Exact case-sensitive local demo login name |
| password_hash | TEXT not null | Encoded algorithm, N/r/p, salt, and derived key; never returned |
| active | INTEGER not null, checked 0 or 1 | Current authentication eligibility |

Use a single encoded password record to keep hashing parameters with the credential. No plaintext
password column. Bootstrap uses scrypt from R-05. Login is the only unauthenticated operation.

### user_roles

| Column | SQLite type / constraint | Meaning |
| --- | --- | --- |
| user_id | TEXT foreign key to users.id | Identity holding the role |
| role | TEXT checked Requester or Reviewer | Current permission membership |

Composite primary key (user_id, role). Zero, one, or two memberships per user. No hierarchy or
administrator bypass. Enable foreign keys on every connection; delete roles with a deleted user.
User deletion is restricted when requests refer to that user; disable accounts instead. No HTTP
user deletion/role administration is in scope. Local maintenance updates and test fixtures must
commit role changes transactionally in the same database; do not cache roles in the application.

### change_requests

| Column | SQLite type / constraint | Meaning |
| --- | --- | --- |
| id | TEXT primary key | Server-generated UUID, returned on creation |
| title | TEXT not null | Required; trimmed measurement 1–200 code points |
| description | TEXT not null | Required; trimmed measurement 1–5000 code points |
| reason | TEXT not null | Required; trimmed measurement 1–2000 code points |
| requester_id | TEXT not null, foreign key users.id | Immutable original requester |
| status | TEXT not null, checked enum | Draft, PendingReview, ChangesRequested, Approved |
| version | INTEGER not null, checked positive safe integer | Starts at 1; increments per successful mutation |
| reviewer_comment | TEXT nullable | Latest return feedback; when present, trimmed measurement 1–2000 |

Enforce INTEGER storage type and range 1 through 9007199254740991 for version. Never wrap;
if no further safe increment is possible, fail without changes as 503 STORAGE_UNAVAILABLE.
ChangesRequested requires a non-null reviewer_comment. Draft starts with NULL comment.
PendingReview and Approved may retain a comment. Use database constraints for types, enum,
foreign keys, and structural invariants; the business validator enforces Unicode rules before
every write. Do not duplicate trimming in SQLite using a different whitespace definition.

Index requester_id for owner retrieval and (status, requester_id) for pending review access.
The academic dataset uses unpaginated minimal lists; no search/filter product is added.
No timestamps, approval history, attachments, soft deletion, or comment-history table is required.

## Text rules

Missing/non-string values are request-shape errors (400). A string whose trimmed copy is empty or
exceeds its limit is a business-validation error (422). Use one validator for all four text fields
and revalidate saved proposal content on Submit. Surrogate pairs represent one code point; base
plus combining mark represents two. Preserve input text in storage, including surrounding
whitespace. No normalization or truncation. Reject malformed Unicode transport strings before
conversion to SQLite UTF-8, rather than silently replacing unpaired surrogates. See R-06.

The supplied maxima are MVP product decisions, not assignment constraints. Tests must include
200/201, 5000/5001, 2000/2001, padded boundary values, Unicode whitespace, astral and combining
sequences, and no saved changes after rejection (AS-28/AS-29).

## Transitions and immutable fields

| Operation | Allowed starting state | Actor | Saved change |
| --- | --- | --- | --- |
| Create | None | Current Requester | New Draft, actor owner, Version 1, NULL comment |
| Edit | Draft / ChangesRequested | Owner with current Requester role | Three proposal fields, Version +1 |
| Submit | Draft / ChangesRequested | Owner with current Requester role | PendingReview, Version +1 |
| Approve | PendingReview | Current Reviewer, actor differs from owner | Approved, Version +1 |
| RequestChanges | PendingReview | Current Reviewer, actor differs from owner | ChangesRequested, required comment replaces latest, Version +1 |

All unlisted operations/states are forbidden. Edits/submission/approval preserve comment; review
decisions preserve proposal content and requester_id. RequestChanges cannot be used by an owner
with both roles. Approved is terminal. Owner content edits cannot set owner, status, or comment.

## Transaction and authorization ordering

1. Verify JWT cryptography/claims outside the database transaction; obtain subject only. Reject
   malformed envelopes early, without accessing protected resource data.
2. For Create/Edit/Submit/Approve/RequestChanges, begin a synchronous IMMEDIATE transaction.
3. Reload active user and roles. Reject absent/inactive user (401) or missing required role (403).
4. Load the request where applicable (404 if absent), then enforce ownership or independent-review
   constraint (403). Even a dual-role user is denied self-approval and self-return.
5. Compare submitted version to saved version (409 VERSION_CONFLICT), then check allowed status
   (409 INVALID_STATUS), then validate text (422). An obsolete version takes precedence over status
   for an otherwise authorized action. Do not include resource fields in these errors.
6. Execute one conditional UPDATE matching id, expected version, permitted starting status,
   and owner/non-owner predicate. Increment version in that statement; replace comment only on
   RequestChanges. Exactly one row must change. A zero-row result is a conflict, never success.
   Bound parameters only; no interpolated caller values. Create uses an INSERT in this transaction.
7. Read the saved row within the transaction, commit, and only then emit 201/200. Any thrown error
   rolls back. No await, password hashing, JWT signing, or network work inside these callbacks.

This is the update predicate design, not a migration or implemented SQL body:
`id = requestedId AND version = expectedVersion AND status IN allowedStates AND ownerCondition`.
Assignment of the new content/status/comment and increment of version occur together.

Use a read transaction for active-user/role lookup and authorized resource retrieval so each read
has one consistent snapshot. A read started before revocation commits can finish with that
snapshot; later transactions see revocation. Writers are serialized, so revocation committed
before a mutation's transaction takes effect immediately; it cannot undo a mutation ordered first.

Lock acquisition/commit timeout rolls back and maps to 503 STORAGE_BUSY. Other known storage
failures map to 503 STORAGE_UNAVAILABLE; unexpected invariant/programming errors map to 500.
Never label a busy failure as a stale Version, retry with a fresh Version, or report a successful
commit unless it occurred. Clients must retrieve current state and make a new decision after 409.

## Demo and test data lifecycle

Use one local file on local disk. Initialize schema explicitly, then idempotently bootstrap five
users with random passwords, unique salts, and server-side roles. Reopening preserves requests,
roles, passwords, and Versions. Never reset data on application startup. Tests use isolated
temporary files, with independent assertion connections and worker connections for contention.
