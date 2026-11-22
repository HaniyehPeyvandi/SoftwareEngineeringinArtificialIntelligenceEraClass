# ChangeFlow Constitution

## Core Principles

### I. Specification Before Implementation

Every feature or behavior change MUST have documented requirements and testable acceptance
criteria before implementation begins. Specifications MUST define applicable roles, ownership
rules, allowed state transitions, failure outcomes, and scope exclusions. Requirement changes
MUST be recorded before the corresponding implementation changes.

### II. Simple, Incremental Architecture

The architecture MUST use the simplest design that satisfies documented requirements and allows
small, independently verifiable increments. Every added abstraction, layer, or dependency MUST
address a current requirement or demonstrated maintenance need; speculative extensibility is
insufficient justification.

### III. Business Logic Separation

Business rules and workflow decisions MUST reside outside HTTP controllers and persistence
code. Controllers MUST handle HTTP concerns and delegate business operations; persistence code
MUST handle data access. Business logic MUST be testable without invoking an HTTP endpoint.
This separation MUST NOT require unnecessary frameworks or layers.

### IV. Server-Enforced Access Control

The server MUST authenticate callers and enforce authorization and role-based access control
for every protected operation. Access MUST be denied unless explicitly permitted. Client-supplied
identity, roles, or ownership claims MUST NOT be trusted as authorization evidence.

### V. No Self-Approval

A Change Request's requester MUST never approve that same Change Request, including when the
requester also holds the Reviewer role or any other role. The server MUST compare the
authenticated approver's identity with the persisted requester identity and reject self-approval
without persisting an approval or status change. No role grants an exception.

### VI. Validate Every Relevant Operation

Before executing a protected read or mutation, the server MUST validate the current user and
permissions and, where applicable, persisted ownership and current Change Request status.
Allowed operations and transitions MUST follow the specification. Failed checks MUST prevent
the protected operation; rejected mutations MUST leave persisted business state unchanged.
Mutation checks and writes MUST be coordinated so concurrent changes cannot invalidate a
decision and still allow it to commit.

### VII. Protect Against Lost Updates

Every mutation of shared Change Request state MUST use an atomic concurrency safeguard, such as
a version check or equivalent database mechanism. A stale or conflicting write MUST be rejected
with a documented conflict outcome and MUST NOT silently overwrite newer persisted state.
The chosen mechanism and conflict behavior MUST be documented and tested.

### VIII. Automated Verification of Critical Behavior

Automated tests MUST cover business rules, allowed and denied authorization, ownership checks,
valid and invalid state transitions, and competing updates. Tests MUST explicitly cover a
requester who is also a Reviewer attempting self-approval. Critical scenarios MUST verify actual
persisted state using integration tests, including successful transitions, rejected operations,
and concurrency conflicts; HTTP responses or mocks alone are insufficient evidence.

### IX. Consistent Project Artifacts

Specifications, API contracts, implementation, and tests MUST describe the same behavior.
Each acceptance criterion MUST be traceable to relevant implementation and automated checks.
Changes to roles, validation, transitions, errors, or concurrency behavior MUST update affected
artifacts in the same change. Known inconsistencies MUST be resolved before declaring completion.

### X. Document Decisions and Limits

Important architectural decisions MUST record their context, chosen approach, and tradeoffs in
the plan or a short decision record. Assumptions and limitations MUST be explicit and kept
current. An assumption that affects externally observable behavior MUST also appear in the
specification. Documentation MUST remain proportionate to an academic MVP.

### XI. Enforce MVP Scope

Implementation MUST remain within the documented backend Change Request MVP. Frontend, AI,
RAG, MCP, and Multi-Agent systems MUST NOT be implemented under this scope. Any proposal to add
them MUST first receive an explicit scope amendment under Governance and a corresponding
specification; technical convenience does not authorize scope expansion.

### XII. Truthful Validation Evidence

Build, test, and validation claims MUST reflect commands or checks actually executed and results
actually observed. Reports MUST identify the check, outcome, and material limitations. Checks
that were not run, failed, or were blocked MUST be labeled accordingly. Fabricated output,
invented passing results, and unsupported completion claims are prohibited.

## MVP Constraints

ChangeFlow is an academic backend MVP for Change Request workflows. Requirements and plans
MUST define the supported operations, roles, lifecycle, API behavior, and persistence approach
before implementing them. This constitution does not prescribe a framework, database, or
additional workflow features. Technology choices MUST satisfy the security, concurrency,
testability, and simplicity principles above.

## Development Workflow and Quality Gates

1. Document the feature specification and acceptance criteria before implementation.
2. Record a concise plan, API contracts, relevant decisions, and dependency-ordered tasks.
3. Implement and verify small increments against the specification and this constitution.
4. Before declaring a change complete, review artifact consistency and scope, execute applicable
   builds and automated tests, and inspect persisted state for critical scenarios.
5. Record the executed checks and observed outcomes. Missing, failed, or blocked required checks
   MUST remain visible and MUST prevent a claim that the change is fully validated.

Reviews MUST explicitly check server-side access control, the self-approval prohibition,
operation preconditions, concurrency protection, and corresponding test coverage when relevant.
Documentation-only changes require document validation; application builds and tests apply to
implementation changes.

## Governance

This constitution takes precedence over conflicting project templates, plans, and implementation
practices. Every specification, implementation change, and completion review MUST check compliance
with applicable principles. Violations MUST be corrected or addressed through an explicit
amendment before the affected work is accepted; they MUST NOT be silently waived.

Amendments MUST document the proposed change, rationale, affected artifacts, and any migration or
follow-up work. The project maintainer MUST explicitly approve amendments before affected work
proceeds. Accepted amendments MUST update this document, its version, and its amendment date;
affected specifications, plans, contracts, and tests MUST then be reconciled before completion.

Versions MUST follow semantic versioning: MAJOR for incompatible governance changes or principle
removals or redefinitions; MINOR for new principles, sections, or materially expanded guidance;
PATCH for clarifications that do not change obligations. Ratification records the initial adoption
date and MUST remain unchanged by later amendments.

**Version**: 1.0.0 | **Ratified**: 2026-11-22 | **Last Amended**: 2026-11-22
