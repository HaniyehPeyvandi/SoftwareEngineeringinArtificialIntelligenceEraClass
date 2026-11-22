# Feature Specification: ChangeFlow Change Request Workflow

**Feature Branch**: Not created; no branch hook is configured.

**Feature Directory**: `specs/001-change-request-workflow`

**Created**: 2026-11-22

**Status**: Clarify complete; text constraints confirmed; ready for planning.

**Input**: User description: Academic Change Request Management MVP in which employees
create and submit requests, reviewers approve or request changes, and the system prevents
self-approval and inconsistent concurrent updates.

**Authority**: [ChangeFlow Constitution](../../.specify/memory/constitution.md), version 1.0.0.

## Clarifications

### Session 2026-11-22

- Q: May a user who has both roles request changes on their own PendingReview request? → A: No. Owners cannot RequestChanges on their own requests, even with the Reviewer role.
- Q: Which requests may a Reviewer read using their Reviewer role? → A: Only other users' PendingReview requests. Owners retain separate access to their own requests in every status.
- Q: Must Title, Description, and Reason all contain non-whitespace text when a Draft is created or edited? → A: Yes. Require all three fields on creation, editing, and submission.
- Q: Must a Reviewer provide a comment when requesting changes? → A: Yes. Require a non-whitespace comment, saved with the decision and visible to the owner.
- Q: What should happen to the reviewer's comment after the owner resubmits the request? → A: Retain the latest comment through resubmission and approval; replace it on the next successful RequestChanges. No comment history is required.

- **Explicit MVP product decision (user-supplied, 2026-11-22)**: Title is required with a maximum
  of 200 characters; Description is required with a maximum of 5000; Reason is required with a
  maximum of 2000; reviewer comment is required for RequestChanges with a maximum of 2000.
  Each required field must contain at least one non-whitespace character. Measure all lengths
  consistently in Unicode code points after trimming surrounding whitespace. These constraints
  are product decisions, not requirements directly supplied by the assignment. This decision
  supplements the five confirmed answers above without changing them.

## User Scenarios & Testing *(mandatory)*

All scenarios describe required behavior, not executed tests. Rejected mutations MUST preserve
all previously persisted request fields and status. Unless stated otherwise, users are authenticated,
roles are current, required content is valid, and operations use the current request state.
RequestChanges attempts include a non-whitespace reviewer comment unless the scenario tests an
invalid comment. Proposal content means Title, Description, and Reason; it excludes review feedback.
Scenario IDs remain stable for traceability. All four stories are required for the complete MVP;
priorities order delivery rather than make lower-priority safety requirements optional.

### User Story 1 - Prepare and Submit My Request (Priority: P1)

As a Requester, I can create, inspect, edit, and submit my own Draft so a reviewer can assess it.

**Why this priority**: Establishes the request lifecycle and the employee's primary task.

**Independent Test**: Using a Requester account, create a request, change its content, submit it,
and retrieve it again to confirm ownership, content, and PendingReview status.

**Acceptance Scenarios**:

1. **AS-01 Given** a Requester and valid Title, Description, and Reason, **When** they create a
   request, **Then** it is persisted as Draft with their identity as Requester ID and a unique
   request identity, and they can retrieve its fields and status.
2. **AS-02 Given** the owner of a Draft with the Requester role, **When** they edit Title,
   Description, or Reason, **Then** the changed content is persisted and status remains Draft.
3. **AS-03 Given** an owner's complete Draft, **When** they Submit, **Then** the persisted status
   becomes PendingReview and content and ownership are preserved.
4. **AS-04 Given** a missing, empty, or whitespace-only Title, Description, or Reason, **When**
   a Requester creates or edits a request, or submits a request containing such content,
   **Then** validation fails and no invalid request or modification is persisted.
5. **AS-05 Given** a create or edit attempt that supplies a different Requester ID or a chosen
   status, **When** it is processed, **Then** it is rejected without changing ownership or status;
   only named workflow actions can change status after creation.

---

### User Story 2 - Review a Submitted Request (Priority: P1)

As a Reviewer, I can inspect requests awaiting review and approve them or request changes,
so only permitted decisions change their status.

**Why this priority**: Delivers the review outcome and enforces the central separation of duties.

**Independent Test**: Start with a prepared PendingReview request owned by another user;
retrieve its content and exercise each decision on separate requests, then inspect saved outcomes.

**Acceptance Scenarios**:

1. **AS-06 Given** a Reviewer and another user's PendingReview request, **When** they inspect
   requests awaiting review, **Then** they can identify the request and retrieve its Title,
   Description, Reason, Requester ID, current status, and Version. **Given** another user's Draft,
   ChangesRequested, or Approved request, **When** they attempt to read it using the Reviewer role,
   **Then** access is denied without disclosing its content. A dual-role owner's reads of their own
   requests remain permitted under FR-014.
2. **AS-07 Given** that request, **When** the Reviewer Approves, **Then** Approved is persisted
   without changing content or ownership.
3. **AS-08 Given** that request and a non-whitespace reviewer comment, **When** the Reviewer
   selects RequestChanges, **Then** ChangesRequested and the comment are persisted together,
   Version advances, and Title, Description, Reason, and ownership remain unchanged. The owner
   can retrieve the saved comment.
4. **AS-09 Given** a user who is both Requester and Reviewer and owns a PendingReview request,
   **When** they Approve it, **Then** self-approval is rejected and PendingReview remains persisted.
5. **AS-10 Given** an unauthenticated caller, **When** they attempt any protected read or action,
   **Then** access is rejected, no protected request content is disclosed, and nothing changes.
6. **AS-11 Given** an authenticated user without the role required for an operation, **When** they
   attempt it, **Then** access is rejected and persisted request state is unchanged. Exercise
   Create, Edit, Submit, Approve, RequestChanges, owner reads, and review reads separately.
7. **AS-12 Given** a Requester attempting to edit or submit someone else's Draft or
   ChangesRequested request, **When** the action is processed, **Then** it is rejected even if
   the caller also has the Reviewer role.
8. **AS-13 Given** a user attempting an operation from a status not permitted by the workflow
   table, **When** it is processed, **Then** it is rejected and persisted fields remain unchanged.
   Exercise every disallowed operation/status combination, including edits to Approved requests.
9. **AS-25 Given** an owner with the Requester role and an Approved request, **When** they edit
   Title, Description, or Reason using its current Version, **Then** the HTTP response reports
   rejection and the actual persisted database content, owner, status, and Version remain unchanged.

---

### User Story 3 - Revise and Resubmit a Returned Request (Priority: P2)

As a Requester, I can inspect, edit, and resubmit my returned request so review can continue.

**Why this priority**: Completes the revision loop without adding another workflow.

**Independent Test**: Start with an owned ChangesRequested request, edit it, resubmit it,
and retrieve it again to verify the revised content and PendingReview status.

**Acceptance Scenarios**:

1. **AS-14 Given** an owner with the Requester role and a ChangesRequested request, **When**
   they edit its content, **Then** the revision is persisted and status remains ChangesRequested.
2. **AS-15 Given** that complete revised request, **When** its owner Submits it, **Then**
   PendingReview is persisted with the revised content, original Requester ID, and latest saved
   reviewer comment unchanged.
3. **AS-16 Given** an owner's request in any of the four statuses, **When** the owner reads it,
   **Then** its latest saved fields, status, Version, and saved return comment, if present, are
   available. **Given** an unrelated Requester,
   **When** they attempt the same read, **Then** access is denied without disclosing its content.
4. **AS-27 Given** a request returned with comment C1, **When** its owner edits and resubmits it,
   **Then** C1 remains saved and visible to the owner. **When** an independent Reviewer subsequently
   Approves it, **Then** C1 remains saved and visible to the owner in Approved. In a separate review
   cycle, **When** an independent Reviewer instead successfully requests changes with C2,
   **Then** C2 replaces C1 in the same saved change as the new ChangesRequested status and Version.
   No comment history is exposed. Failed or conflicting decisions MUST retain the saved comment.

---

### User Story 4 - Preserve Newer Work During Conflicts (Priority: P1)

As a Requester or Reviewer, I need conflicting operations to fail explicitly so a newer change
or review decision cannot be silently lost.

**Why this priority**: Data integrity is required from the first increment that permits mutations.

**Independent Test**: Prepare two actions against the same saved state, coordinate their execution,
and inspect both outcomes and the final saved request. Repeat for edits and review decisions.

**Acceptance Scenarios**:

1. **AS-17 Given** two different edits based on the same owned Draft or ChangesRequested state,
   **When** they compete, **Then** at most one succeeds, the other reports a conflict, and the saved
   request contains exactly the successful edit with no silent overwrite or mixed content.
2. **AS-18 Given** two Reviewers acting on the same PendingReview state, **When** Approve competes
   with RequestChanges, **Then** exactly one valid decision succeeds and the other reports a
   conflict; the saved status matches the winner. Repeat with two Approve actions and with two
   RequestChanges actions; a stale duplicate cannot report a second successful transition.
3. **AS-19 Given** an edit and Submit based on the same editable state, **When** they compete,
   **Then** at most one succeeds and the other reports a conflict; submission never silently
   accepts different content and an edit never changes a request already submitted.
4. **AS-20 Given** permissions revoked before processing, or ownership/status changed since a
   caller's earlier read, **When** a mutation is attempted, **Then** current authorization and
   saved-state checks reject the invalid action and preserve newer state.
5. **AS-21 Given** a stale action rejected as a conflict, **When** the user retrieves current state,
   **Then** they can inspect the newer content/status and make a new decision; the failed action
   is not automatically reapplied.
6. **AS-24 Given** an owner who read Version V1 and a newer successful edit saved as Version V2,
   **When** the owner attempts an edit using outdated Version V1, **Then** the HTTP response reports
   a conflict and the actual persisted database state retains V2 and all newer content unchanged.

### Edge Cases

- **AS-22 Given** an identity for no existing request, **When** a caller attempts to read or
  mutate it, **Then** the operation is rejected without creating a request or disclosing content.
- Repeated submission or review: reject an action once its prerequisite status has changed;
  a stale action reports a conflict (AS-13, AS-18).
- A Reviewer role does not grant content-editing or ownership rights (AS-11, AS-12).
- A user with both roles retains owner edit/submit rights but cannot approve their own request
  (AS-02, AS-03, AS-09, AS-14, AS-15).
- No action can leave a partially updated request, transfer ownership, or create a status outside
  the four defined values (AS-05, AS-13, AS-17 through AS-20).
- **AS-23 Given** a dual-role owner and their PendingReview request, **When** they select
  RequestChanges, **Then** the action is rejected and all saved fields, including Version,
  remain unchanged. The Reviewer role does not grant an exception.
- **AS-26 Given** an independent authorized Reviewer and a PendingReview request with current
  Version, **When** RequestChanges is attempted with a missing, empty, or whitespace-only comment,
  **Then** validation fails and all persisted fields, including status, comment, and Version,
  remain unchanged. Exercise each invalid comment case separately.
- **AS-28 Given** valid permissions, ownership, status, Version, and all other required fields,
  **When** a field has exactly its maximum length after trimming surrounding whitespace,
  **Then** the operation succeeds and its intended state is persisted. **When** it exceeds that
  maximum by one Unicode code point, **Then** the HTTP response reports validation failure and
  no request is created or persisted fields changed, including status, comment, and Version.
  Exercise Title at 200/201, Description at 5000/5001, and Reason at 2000/2001 on creation,
  edits in Draft and ChangesRequested, and submission; exercise reviewer comment at 2000/2001
  on RequestChanges. No invalid value may be silently truncated to pass validation.
- **AS-29 Given** each required text field and its applicable operation, **When** length is
  measured, **Then** surrounding whitespace is excluded, internal whitespace is counted, and
  each Unicode code point counts once. Exercise boundary values with surrounding whitespace,
  supplementary-plane characters such as U+1F600 (one code point), and combining sequences such
  as U+0065 followed by U+0301 (two code points). Do not count bytes, encoding code units, or
  visually combined characters instead. Missing, empty, and whitespace-only values still fail
  validation. Verify the HTTP outcome and actual persisted state for accepted and rejected cases.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST authenticate callers and validate current roles on the server for
  every protected read and mutation; unauthenticated or unauthorized calls MUST be denied.
- **FR-002**: A user with the Requester role MUST be able to create a uniquely identifiable request
  with Title, Description, Reason, their authenticated identity as Requester ID, and Draft status.
- **FR-003**: Title, Description, and Reason MUST each contain non-whitespace text on creation,
  editing, and submission, including edits in Draft and ChangesRequested. Missing, empty, or
  whitespace-only values MUST be rejected without persisting the attempted change; incomplete
  Drafts MUST NOT be saved. Title MUST have at most 200 Unicode code points, Description at most
  5000, and Reason at most 2000, measured under FR-018. Overlength values MUST be rejected without
  persisting the attempted change.
- **FR-004**: Only an authenticated owner with the current Requester role MUST be permitted to edit
  Title, Description, and Reason, and only in Draft or ChangesRequested. Editing MUST retain status.
- **FR-005**: Only that owner with the Requester role MUST be permitted to Submit a Draft or
  ChangesRequested request, changing its status to PendingReview and preserving saved content.
- **FR-006**: Only a user with the current Reviewer role MUST be permitted to Approve a
  PendingReview request, changing its status to Approved and preserving proposal content,
  ownership, and the latest saved reviewer comment, if present.
- **FR-007**: Approval MUST be denied whenever the authenticated caller is the saved requester,
  regardless of their roles; no exception to self-approval prevention is permitted.
- **FR-008**: Only a user with the current Reviewer role MUST be permitted to RequestChanges on a
  PendingReview request, changing its status to ChangesRequested. The caller MUST differ from
  the requester, even when the requester also holds the Reviewer role. Proposal content and ownership
  MUST remain unchanged. A non-whitespace reviewer comment of at most 2000 Unicode code points,
  measured under FR-018, MUST be supplied and persisted with the ChangesRequested status in the
  same successful operation. Missing, empty, whitespace-only, or overlength comments MUST cause
  rejection with no saved changes. The saved comment MUST be visible to the owner through
  authorized reads; it MUST NOT be editable through owner content edits.
  The latest comment MUST be retained through owner edits, resubmission, and approval. A subsequent
  successful RequestChanges MUST replace it with the new required comment atomically with the
  status and Version change. No comment history is required; failed operations MUST retain it.
- **FR-009**: The system MUST enforce only the four named status transitions in the workflow table.
  All other transitions and edits in PendingReview or Approved MUST be rejected. Approved is terminal.
- **FR-010**: Requester ID MUST remain immutable. Supplied ownership/status overrides MUST be
  rejected; creation and named workflow actions alone MUST determine status.
- **FR-011**: Every mutation MUST validate the current authenticated user, required roles, saved
  ownership where applicable, current status, and whether the state acted upon is still current.
  A decision MUST NOT succeed if concurrent changes invalidate its preconditions before completion.
- **FR-012**: Conflicting or stale mutations MUST NOT silently overwrite newer changes, merge
  incompatible edits, or produce an invalid status. At most one competing mutation based on the
  same saved state may succeed; losers MUST receive an explicit conflict outcome. Each saved
  request MUST expose a Version identifying its current revision. Successful edits and transitions
  MUST advance Version; mutations using an outdated Version MUST be rejected without saved changes.
  The representation and transport of Version are deferred to planning.
- **FR-013**: Successful changes MUST persist all intended changes together. Rejected operations
  MUST cause no partial or additional business-state changes; later authorized reads MUST show the
  successful saved state. Conflict retries MUST require a new decision based on current state.
- **FR-014**: Owners with the Requester role MUST be able to retrieve their requests' current
  fields, status, Version, and saved return comment, if present, in all four statuses.
  Unrelated Requesters MUST NOT read other owners' requests or their return comments.
- **FR-015**: Reviewers MUST be able to identify and read requests awaiting review and retrieve
  their required fields and Version. Access granted by the Reviewer role MUST be limited to other
  users' PendingReview requests; reads of other users' Draft, ChangesRequested, or Approved requests
  MUST be denied. Owner access under FR-014 remains separate, including for dual-role users.
- **FR-016**: Rejected operations MUST provide a distinguishable outcome for unauthenticated
  access, denied permission, invalid content, invalid current status, or a concurrency conflict.
  No protected content may be disclosed to an unauthorized caller. Missing requests MUST NOT
  result in content disclosure or creation; error representation is deferred to planning.
- **FR-017**: Verification MUST automate all six assignment scenarios AT-01 through AT-06.
  Treat all six as critical: each MUST verify both the HTTP response outcome and actual persisted
  database state. Additional business-rule, authorization, transition, and concurrency coverage
  MUST satisfy constitution principle VIII as specified below. Optional failure-injection tests
  do not replace these obligations. No HTTP codes, routes, or storage technology are chosen here.
- **FR-018**: The system MUST measure lengths consistently for Title, Description, Reason, and
  reviewer comment by trimming surrounding whitespace and counting Unicode code points in the
  resulting text. Every required field MUST contain at least one non-whitespace character.
  Internal whitespace MUST count toward the maximum. Unicode code points MUST be counted as
  supplied after trimming, without combining multiple code points into one visual character.
  The same rule MUST apply to all relevant operations; overlength values MUST be rejected rather
  than silently truncated. These are explicit MVP product decisions, not assignment-supplied limits.

### Workflow and Permission Rules

Roles are cumulative, but ownership restrictions and self-approval denial override role membership.
Every row also requires valid identity, current permissions, valid content where relevant, and
current saved state. There are no implicit transitions or administrative overrides.

| Operation | Starting status | Required role and ownership | Result |
| --- | --- | --- | --- |
| Create | No request yet | Requester; caller becomes owner | Draft |
| Edit | Draft | Requester; owner | Draft, revised content |
| Submit | Draft | Requester; owner | PendingReview |
| Approve | PendingReview | Reviewer; not owner | Approved |
| RequestChanges | PendingReview | Reviewer; not owner; non-whitespace comment | ChangesRequested, latest comment saved |
| Edit | ChangesRequested | Requester; owner | ChangesRequested, revised content |
| Submit | ChangesRequested | Requester; owner | PendingReview |

### Key Entities *(include if feature involves data)*

- **User**: Authenticated employee identity with Requester, Reviewer, both, or neither role.
  Role assignment and authentication mechanisms are outside this feature's functional scope.
- **Change Request**: Uniquely identifiable proposal with Title, Description, Reason, immutable
  Requester ID, and Current status: Draft, PendingReview, ChangesRequested, or Approved.
  It has one owner and a Version identifying its current saved revision. Version is available
  with authorized reads and advances after each successful mutation. Its data representation,
  initial value, storage, and transport are not selected at this stage. A reviewer comment is
  required when returning a request for changes and is saved with that decision for the owner
  to read. The latest comment remains through edits, resubmission, and approval; the next successful
  RequestChanges replaces it. No comment history is required. A new Draft has no reviewer comment.
  Text constraints are Title 200, Description 5000, Reason 2000, and reviewer comment 2000 maximum
  Unicode code points after trimming surrounding whitespace, as defined by FR-003, FR-008, and FR-018.

### Automated Verification Scenarios

The user confirmed the assignment's exact six mandatory scenarios on 2026-11-22. AT-01 through
AT-06 below map one-to-one to that list in the same order. Each ID identifies a separate mandatory
automated scenario, not a group combining assignment scenarios. These specify future tests;
none have been implemented or run.

For this MVP, all six are critical. Each test MUST check the HTTP response outcome and independently
inspect the actual persisted database state, including content, owner, status, and Version where
applicable. A response assertion, mocked persistence, or a subsequent HTTP read alone is insufficient
evidence of actual database state. Specific HTTP codes and implementation details remain for planning.

| ID | Assignment scenario | Given / When / Then and saved-state assertions | Traceability |
| --- | --- | --- | --- |
| AT-01 | Successfully create a Change Request in Draft status. | Given an authenticated Requester and valid content, when Create is performed, then the HTTP response reports successful creation and the database contains a new Draft with that content, the caller as owner, and an initial Version. | AS-01; FR-002, FR-010, FR-012, FR-013, FR-017 |
| AT-02 | Successfully transition Draft to PendingReview through a valid Submit. | Given the owner's complete Draft and current Version, when a valid Submit is performed, then the HTTP response reports success and the database status becomes PendingReview, Version advances, and content/owner are preserved. | AS-03; FR-005, FR-009, FR-012, FR-013, FR-017 |
| AT-03 | Reject self-approval even when the requester has the Reviewer role. | Given a PendingReview request owned by an authenticated user with both Requester and Reviewer roles and its current Version, when that user attempts Approve, then the HTTP response reports denial and every persisted field, including status and Version, remains unchanged. | AS-09; FR-001, FR-007, FR-011, FR-013, FR-017 |
| AT-04 | Successfully approve a PendingReview request by an authorized independent Reviewer. | Given a PendingReview request and an authorized Reviewer other than its requester, when Approve is performed with current Version, then the HTTP response reports success and the database status becomes Approved, Version advances, and content/owner remain unchanged. | AS-07; FR-006, FR-009, FR-012, FR-013, FR-017 |
| AT-05 | Reject editing an Approved request. | Given an Approved request and its authenticated owner with the Requester role, when an otherwise valid edit is attempted using current Version, then the HTTP response reports rejection and actual persisted content, owner, status, and Version remain unchanged. | AS-25, AS-13; FR-004, FR-009, FR-013, FR-017 |
| AT-06 | Prevent silent overwriting of newer changes by a request using an outdated Version. | Given an authenticated owner with the Requester role who read Version V1 of an editable request and a successful newer edit saved as V2 without changing its editable status, when an otherwise valid update uses outdated Version V1, then the HTTP response reports a conflict and the database retains V2 and all newer saved content unchanged. | AS-24; FR-011 to FR-013, FR-016, FR-017 |

### Supplementary Verification Coverage

The assignment encourages additional authorization, invalid-transition, race-condition, and
persistence-failure tests but does not count them among its mandatory six. The existing constitution
independently requires business-rule, authorization, transition, and concurrency coverage. SV-01
through SV-05 therefore remain required for project compliance; SV-06 is encouraged and optional.
Critical supplementary cases MUST verify both HTTP response and actual persisted database state.

| ID | Required coverage | Acceptance scenarios |
| --- | --- | --- |
| SV-01 | Content edits, required-field validation, and rejected ownership/status overrides. Test missing, empty, and whitespace-only values separately. For Title, Description, and Reason, verify exact-max acceptance and max-plus-one rejection, surrounding/internal whitespace, supplementary-plane and combining code points under FR-018, and no silent truncation. Check HTTP responses and actual persisted state. | AS-02, AS-04, AS-05, AS-28, AS-29 |
| SV-02 | Review reads, RequestChanges with a required saved comment visible to the owner, invalid-comment rejection, owner revision/resubmission, and owner reads in all statuses. Verify comment lengths at 2000/2001 and Unicode/whitespace rules under FR-018. Verify latest-comment retention through edits/resubmission/approval and replacement on a subsequent return, including unchanged comments after failures. Verify HTTP response and actual persisted status, comment, and Version for these critical cases. | AS-06, AS-08, AS-14 to AS-16, AS-26 to AS-29 |
| SV-03 | Separate unauthenticated, wrong-role, non-owner, revoked-permission, missing-request, owner RequestChanges, and Reviewer reads outside other users' PendingReview denial cases; no protected disclosure or saved changes. | AS-06, AS-10 to AS-12, AS-16, AS-20, AS-22, AS-23 |
| SV-04 | Every disallowed operation/status combination and repeated transition, not merely the Approved edit covered by AT-05. | AS-13 |
| SV-05 | Coordinated edit/edit, edit/Submit, Approve/RequestChanges, Approve/Approve, and RequestChanges/RequestChanges races; inspect both responses and the final database state. Exercise both possible winners when operations differ and recovery after a conflict. | AS-17 to AS-21 |
| SV-06 (optional) | Given a valid mutation, when persistence fails before completion, then no successful completion is reported and no partial state is saved; inspect the failure response and actual database state. | FR-013, FR-016 |

## Success Criteria *(mandatory)*

### Measurable Outcomes

These are acceptance targets, not measured results. The evaluation set MUST include every
applicable scenario and the negative combinations specified above.

- **SC-001**: In 100% of valid scripted employee journeys, a request can be created, revised,
  and submitted with correct ownership and retained content; no extra lifecycle step is required.
- **SC-002**: All four allowed status transitions succeed for authorized actors in the evaluation
  set; 100% of disallowed operation/status combinations are rejected without saved changes.
- **SC-003**: Zero self-approvals succeed, including 100% rejection of attempts by dual-role owners;
  all tested unauthorized and non-owner operations are rejected without protected disclosure.
- **SC-004**: AT-06 always rejects outdated Version updates without losing newer changes. In
  20 coordinated repetitions of each conflicting pair in SV-05, exactly one valid
  action succeeds per pair and zero newer changes are overwritten. Both possible winners are
  exercised for differing operations; winning content and status remain consistent in every run.
- **SC-005**: All six assignment scenarios are automated and pass with both HTTP-response and
  actual-database-state assertions. Every critical supplementary case has both assertions;
  all 18 functional requirements map to acceptance scenarios and verification coverage, including
  exact-limit, overlength, trimming, and Unicode-code-point cases for all four text fields.
- **SC-006**: For each rejection category, the evaluation confirms the actor can distinguish the
  failure and, if still authorized, inspect current state to decide what to do next. All scripted
  correction/resubmission and conflict-recovery journeys finish without administrator intervention.

## Assumptions

Confirmed product decisions and contextual assumptions are distinguished below. No unresolved
product decisions remain identified for this MVP; no exceptions to self-approval prevention are implied.

- **A-01 — Content (confirmed)**: Title, Description, and Reason are required non-whitespace text
  on creation, editing, and submission; incomplete Drafts are not allowed. Their respective maximum
  lengths are 200, 5000, and 2000 Unicode code points after trimming surrounding whitespace.
  Reviewer comment is required for RequestChanges with a maximum of 2000 under the same rule.
  These user-confirmed MVP product limits are not directly supplied by the assignment. No additional
  formatting rules, attachments, or uniqueness of titles are assumed. FR-003, FR-008, and FR-018
  define validation; AS-04, AS-26, AS-28, and AS-29 define acceptance coverage.
- **A-02 — Review boundaries (confirmed)**: Reviewer access is limited to other users'
  PendingReview requests, without assignment to a particular reviewer. It grants no access to
  other users' Draft, ChangesRequested, or Approved requests. Dual-role owners retain owner reads
  in every status. Owner RequestChanges is forbidden, including for dual-role users; self-approval
  also remains forbidden in every case.
- **A-03 — Revision feedback (confirmed)**: RequestChanges requires a
  non-whitespace reviewer comment, saved with the status transition and visible to the owner.
  The comment is separate from the requester's Reason field. Retain the latest comment through
  edits, resubmission, and approval; replace it on the next successful RequestChanges. No comment
  history is required. Rejected operations preserve the saved comment.
- **A-04 — Identity dependency**: Valid employee identities and current role memberships are
  available to the system. Account enrollment, identity administration, and role management are
  outside this feature; no authentication technology is selected here.
- **A-05 — Lifecycle**: Approved is terminal; there is no deletion, withdrawal, rejection, reopening,
  reassignment, notification, reporting, search/filter feature, or audit-history product feature.
  Minimal retrieval needed to edit, review, and observe results is included by FR-014 and FR-015.
- **A-06 — Conflict behavior**: Stale actions fail explicitly and require a fresh user decision;
  no automatic merging or replay is assumed. No throughput or response-time commitment was
  supplied. SC-004 defines a bounded academic concurrency evaluation, not a production load target.
- **A-07 — Assignment source confirmed**: The user supplied the exact six mandatory scenarios
  on 2026-11-22. AT-01 through AT-06 match that list in order. Their inclusion is confirmed;
  execution and passing results remain future implementation-stage work, not assumptions or evidence.

### Clarify Agenda

Five questions were answered, followed by an explicit user-supplied product decision on field lengths
and counting. Review permissions, field completeness, required feedback, feedback retention, length
limits, and Unicode measurement are resolved. No product ambiguities remain identified within the
documented MVP scope. The assignment-source gap is resolved. Proceed to planning; technology and
architecture decisions remain outside this specification stage.

### Scope Boundaries

Included: protected creation, owner reads/edits/submission, review access, approval, return for
changes, resubmission, authorization, status validation, concurrency safety, and verification.
Excluded: Frontend, AI, RAG, MCP, Multi-Agent systems and the extra capabilities listed in A-05.
No technologies, databases, frameworks, architecture, or implementation contracts are chosen here.

### Traceability Summary

| Requirements | Acceptance scenarios | Automated verification | Success criteria |
| --- | --- | --- | --- |
| FR-001 | AS-09 to AS-12, AS-16, AS-20 | AT-03, SV-03 | SC-003 |
| FR-002, FR-003 | AS-01, AS-04, AS-28, AS-29 | AT-01, SV-01 | SC-001, SC-005 |
| FR-004, FR-005 | AS-02, AS-03, AS-12 to AS-15, AS-25, AS-27 | AT-02, AT-05, SV-01 to SV-04 | SC-001, SC-002 |
| FR-006, FR-007, FR-008 | AS-07 to AS-09, AS-11, AS-13, AS-23, AS-26 to AS-29 | AT-03, AT-04, SV-02 to SV-04 | SC-002, SC-003, SC-005 |
| FR-009, FR-010 | AS-05, AS-13, AS-25 | AT-01, AT-02, AT-04, AT-05, SV-01, SV-04 | SC-002 |
| FR-011, FR-012 | AS-17 to AS-20, AS-24 | AT-02, AT-04, AT-06, SV-03, SV-05 | SC-003, SC-004 |
| FR-013 | AS-01 to AS-29 where a mutation occurs | AT-01 to AT-06, SV-01 to SV-05; optional SV-06 | SC-001 to SC-005 |
| FR-014, FR-015 | AS-06, AS-10, AS-11, AS-16, AS-27 | SV-02, SV-03 | SC-001, SC-003 |
| FR-016 | AS-04, AS-10 to AS-13, AS-17 to AS-24, AS-26, AS-28, AS-29 | AT-06, SV-01 to SV-05; optional SV-06 | SC-003 to SC-006 |
| FR-017 | All acceptance scenarios | AT-01 to AT-06, SV-01 to SV-05 | SC-005 |
| FR-018 | AS-04, AS-26, AS-28, AS-29 | SV-01, SV-02 | SC-005 |
