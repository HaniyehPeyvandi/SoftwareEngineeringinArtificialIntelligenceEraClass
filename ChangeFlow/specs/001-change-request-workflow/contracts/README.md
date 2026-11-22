# ChangeFlow HTTP Contract

Normative design: this document plus [openapi.json](openapi.json). No endpoints are implemented.
Base path `/api`; JSON names map to [data-model.md](../data-model.md). All responses carrying
credentials or request content use Cache-Control: no-store. Default host is local loopback.

## Endpoints

| Method and path | Body | Authentication / permission | Success |
| --- | --- | --- | --- |
| POST /auth/login | username, password | Public; active demo user and matching password | 200 TokenResponse |
| POST /change-requests | title, description, reason | Bearer; current Requester | 201 ChangeRequest; Location header |
| GET /change-requests/mine | None | Bearer; current Requester | 200 items containing own requests, all statuses |
| GET /change-requests/pending-review | None | Bearer; current Reviewer | 200 items containing other users' PendingReview only |
| GET /change-requests/{id} | None | Bearer; owner+Requester OR other owner+Reviewer+PendingReview | 200 ChangeRequest |
| PUT /change-requests/{id} | title, description, reason, version | Bearer; owner+Requester; Draft / ChangesRequested | 200 ChangeRequest |
| POST /change-requests/{id}/submit | version | Bearer; owner+Requester; Draft / ChangesRequested | 200 PendingReview |
| POST /change-requests/{id}/approve | version | Bearer; Reviewer; not owner; PendingReview | 200 Approved |
| POST /change-requests/{id}/request-changes | version, comment | Bearer; Reviewer; not owner; PendingReview | 200 ChangesRequested |

All paths in the table are relative to `/api`. Register static list routes before the ID route.
Lists return `{ "items": [] }` when empty, sorted by ID ascending. No pagination, filtering,
review assignment, or all-request admin endpoint is added. Roles are cumulative; forbidden
self-review overrides them. Both Approve and RequestChanges forbid the requester as actor.

## Request and response schemas

- UUID string IDs; JSON `version` is the specification's Version, a positive safe integer.
- CreateBody: exactly title, description, reason (strings). Draft status/owner/initial Version
  are server-controlled. Sending requesterId, status, roles, or version on Create is 400.
- EditBody: exactly title, description, reason, version. PUT replaces proposal fields, retaining
  status and comment. Missing fields and unknown fields are 400; no partial-update convention.
- VersionBody: exactly version. ReturnBody: exactly version and comment. No status override.
- ChangeRequest: id, title, description, reason, requesterId, status, version, reviewerComment.
  reviewerComment is null until a successful return. Response strings preserve the input text.
- TokenResponse: accessToken, tokenType="Bearer", expiresIn=900. Never expose password_hash,
  salts, signing secrets, or role credentials.
- ErrorResponse: `{ "error": { "code": "VERSION_CONFLICT", "message": "Request changed; retrieve current state before trying again." } }`.
  An optional fields array contains safe field names and validation reasons, never supplied values
  or protected resource content. Error codes are stable; message wording is not a test contract.

## Authentication and permission freshness

Send Authorization: Bearer JWT on every endpoint except login. Validate HS256 signature, issuer,
audience, iat, exp, and UUID sub. Tokens last 15 minutes; no refresh endpoint or token role authority.
Current active state and roles are loaded for each service operation from the same SQLite
transaction as protected reads/writes. Revoked roles take effect on subsequent transactions even
with an unexpired token. Missing/inactive users are 401; missing operation roles are 403. Local
role maintenance is not an HTTP product feature. JWTs are not an account/role-management system.

## Text validation

| Field | Required where | Maximum code points after surrounding trim |
| --- | --- | --- |
| title | Create, Edit, saved content checked on Submit | 200 |
| description | Create, Edit, saved content checked on Submit | 5000 |
| reason | Create, Edit, saved content checked on Submit | 2000 |
| comment | RequestChanges | 2000 |

Require a non-whitespace character; apply R-06 consistently. Count code points, not UTF-16 units,
bytes, or graphemes. Preserve original valid Unicode strings; trim a measurement copy only.
Reject malformed Unicode strings as invalid transport (400), never replace them silently.
OpenAPI input schemas use x-trimmed-max-codepoints rather than raw maxLength: surrounding
whitespace does not consume the product limit. The service remains the validator; a schema-only
check is insufficient. JSON envelopes have a separate 128 KiB transport limit, returning 413.
Extremely padded strings can exceed that envelope even if trimmed text would fit; this is an
explicit local-service transport limit, not a smaller text-field limit. No Unicode normalization.

## State and comment semantics

Create produces Draft. Submit allows Draft/ChangesRequested to PendingReview. Approve allows
PendingReview to Approved. RequestChanges allows PendingReview to ChangesRequested and saves
the required comment atomically. Only the latter replaces the latest comment. Edits, resubmission,
and approval preserve it. The owner can read the latest comment in every status; no history.

Every accepted edit/transition increments Version exactly once. Rejected calls change nothing.
Mutation success returns the changed row authorized by that operation, even if the independent
Reviewer loses GET visibility after the transition. It grants no additional read endpoint access.

## Errors, ordering, and conflict recovery

| HTTP | Error code | Meaning |
| --- | --- | --- |
| 400 | INVALID_REQUEST | Malformed JSON/Unicode, missing or unknown keys, wrong types, invalid UUID, missing/nonpositive/unsafe Version |
| 401 | UNAUTHENTICATED | Missing/invalid/expired token, missing/inactive subject; WWW-Authenticate: Bearer on protected routes |
| 401 | INVALID_CREDENTIALS | Generic invalid login, including disabled/unknown user |
| 403 | FORBIDDEN | Wrong current role, wrong owner, self-approval/self-return, forbidden read |
| 404 | NOT_FOUND | Syntactically valid ID does not exist |
| 409 | VERSION_CONFLICT | Otherwise authorized action uses stale Version or conditional update changes no row |
| 409 | INVALID_STATUS | Current Version supplied but action/edit not allowed in current status |
| 413 | PAYLOAD_TOO_LARGE | JSON envelope exceeds 128 KiB |
| 415 | UNSUPPORTED_MEDIA_TYPE | Body-bearing endpoint is not application/json |
| 422 | VALIDATION_FAILED | Present string is blank after trimming or exceeds its field limit |
| 503 | STORAGE_BUSY | SQLite lock/commit wait exceeds 1000 ms; rollback, no mutation accepted |
| 503 | STORAGE_UNAVAILABLE | Known persistence failure or Version cannot safely advance; no accepted mutation |
| 500 | INTERNAL_ERROR | Unexpected failure/invariant violation; no internal details exposed |

JWT verification precedes protected body handling; shape/transport checks precede service work.
Inside the transaction: current user/roles, existence, ownership/self-review, Version, status, text,
conditional write, commit. This makes an Approved edit with current Version INVALID_STATUS;
a stale otherwise-authorized action is VERSION_CONFLICT even if its old status also changed.
Never expose a current row, current Version, or latest comment in conflict/denial errors.

Forbidden existing IDs can be distinguished from nonexistent IDs, but neither error discloses
protected content. This is a documented academic-demo limitation. A future stricter privacy policy
would require a specification change before masking both as 404.

On 409, retrieve current state if still permitted, inspect it, and deliberately issue a new action.
Do not automatically replay. On 503, report failure and retry only by a new caller decision; do
not claim stale intent or successful persistence. Responses are emitted only after commit.
