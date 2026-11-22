export const ROLES = ['Requester', 'Reviewer'] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const;
export type ChangeRequestStatus = (typeof STATUSES)[number];

export type MutationOperation = 'Create' | 'Edit' | 'Submit' | 'Approve' | 'RequestChanges';
export type Operation = MutationOperation | 'Login' | 'Read' | 'ListOwn' | 'ListPendingReview';

export interface CurrentIdentity {
  readonly id: string;
  readonly active: boolean;
  readonly roles: readonly Role[];
}

export interface Proposal {
  readonly title: string;
  readonly description: string;
  readonly reason: string;
}

export interface ChangeRequest extends Proposal {
  readonly id: string;
  readonly requesterId: string;
  readonly status: ChangeRequestStatus;
  readonly version: number;
  readonly reviewerComment: string | null;
}

export type OwnerOperation = 'Create' | 'ListOwn' | 'Read' | 'Edit' | 'Submit';
export type ReviewerOperation = 'ListPendingReview' | 'Read' | 'Approve' | 'RequestChanges';

export const ERROR_MESSAGES = {
  INVALID_REQUEST: 'The request is malformed.',
  UNAUTHENTICATED: 'Authentication is required.',
  INVALID_CREDENTIALS: 'Invalid username or password.',
  FORBIDDEN: 'The operation is not permitted.',
  NOT_FOUND: 'The request was not found.',
  VERSION_CONFLICT: 'Request changed; retrieve current state before trying again.',
  INVALID_STATUS: 'The operation is not allowed in the current status.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'The request body must use application/json.',
  VALIDATION_FAILED: 'One or more text fields are invalid.',
  STORAGE_BUSY: 'Storage is busy; the operation was not accepted.',
  STORAGE_UNAVAILABLE: 'Storage is unavailable; the operation was not accepted.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;
export interface FieldIssue {
  readonly field: 'title' | 'description' | 'reason' | 'comment';
  readonly reason: 'required' | 'too_long';
}

// Safe messages only: no supplied values, SQL, credentials, or protected rows.
// HTTP status/header mapping belongs to the later HTTP error adapter.
export class BusinessError extends Error {
  readonly code: ErrorCode;
  readonly fields: readonly FieldIssue[] | undefined;

  constructor(code: ErrorCode, fields?: readonly FieldIssue[]) {
    super(ERROR_MESSAGES[code]);
    this.name = 'BusinessError';
    this.code = code;
    this.fields = fields?.map(({ field, reason }) => ({ field, reason }));
  }
}

// Owner-specific access only. Independent Reviewer access is a separate branch.
export function assertOwnerOperation(
  actor: CurrentIdentity | undefined,
  operation: OwnerOperation,
  resource?: Pick<ChangeRequest, 'requesterId' | 'status' | 'version'>,
  expectedVersion?: number,
): void {
  if (!actor?.active) throw new BusinessError('UNAUTHENTICATED');
  if (!actor.roles.includes('Requester')) throw new BusinessError('FORBIDDEN');
  if (operation === 'Create' || operation === 'ListOwn') return;
  if (!resource) throw new BusinessError('NOT_FOUND');
  if (resource.requesterId !== actor.id) throw new BusinessError('FORBIDDEN');
  if (operation === 'Read') return;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion! < 1) throw new BusinessError('INVALID_REQUEST');
  if (expectedVersion !== resource.version) throw new BusinessError('VERSION_CONFLICT');
  if (resource.status !== 'Draft' && resource.status !== 'ChangesRequested') throw new BusinessError('INVALID_STATUS');
}

export function assertReviewerOperation(
  actor: CurrentIdentity | undefined,
  operation: ReviewerOperation,
  resource?: Pick<ChangeRequest, 'requesterId' | 'status' | 'version'>,
  expectedVersion?: number,
): void {
  if (!actor?.active) throw new BusinessError('UNAUTHENTICATED');
  if (!actor.roles.includes('Reviewer')) throw new BusinessError('FORBIDDEN');
  if (operation === 'ListPendingReview') return;
  if (!resource) throw new BusinessError('NOT_FOUND');
  // No role combination permits either self-review decision or a self-read
  // through this branch. Owner+Requester reads use assertOwnerOperation instead.
  if (resource.requesterId === actor.id) throw new BusinessError('FORBIDDEN');
  if (operation === 'Read') {
    if (resource.status !== 'PendingReview') throw new BusinessError('FORBIDDEN');
    return;
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion! < 1) throw new BusinessError('INVALID_REQUEST');
  if (expectedVersion !== resource.version) throw new BusinessError('VERSION_CONFLICT');
  if (resource.status !== 'PendingReview') throw new BusinessError('INVALID_STATUS');
}
