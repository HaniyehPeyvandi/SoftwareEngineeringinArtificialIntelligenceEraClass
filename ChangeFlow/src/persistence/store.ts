import Database from 'better-sqlite3';
import { BusinessError } from '../business/rules.js';
import type { ChangeRequest, CurrentIdentity, Proposal, Role } from '../business/rules.js';
import type { SqliteDatabase } from './database.js';

export interface StoredUser {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly active: boolean;
}

export function translateStorageError(error: unknown): BusinessError {
  if (error instanceof BusinessError) return error;
  if (error instanceof Database.SqliteError) {
    const code = error.code.split('_').slice(0, 2).join('_');
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') return new BusinessError('STORAGE_BUSY');
    if (['SQLITE_IOERR', 'SQLITE_CANTOPEN', 'SQLITE_FULL', 'SQLITE_READONLY',
      'SQLITE_CORRUPT', 'SQLITE_NOTADB', 'SQLITE_PERM', 'SQLITE_NOMEM',
      'SQLITE_PROTOCOL'].includes(code)) return new BusinessError('STORAGE_UNAVAILABLE');
  }
  if (error instanceof Error && 'code' in error &&
      ['EACCES', 'EPERM', 'ENOSPC', 'ENOENT', 'EROFS', 'EIO', 'EMFILE', 'ENFILE'].includes(String(error.code))) {
    return new BusinessError('STORAGE_UNAVAILABLE');
  }
  // Constraints, malformed SQL, and programming/invariant errors are not stale writes.
  return new BusinessError('INTERNAL_ERROR');
}

export function withStorageErrors<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    throw translateStorageError(error);
  }
}

export function createStore(db: SqliteDatabase) {
  const userByUsername = db.prepare<[string], {
    id: string; username: string; passwordHash: string; active: number;
  }>('SELECT id, username, password_hash AS passwordHash, active FROM users WHERE username = ?');
  const identityById = db.prepare<[string], { id: string; active: number }>(
    'SELECT id, active FROM users WHERE id = ?',
  );
  const rolesById = db.prepare<[string], { role: Role }>(
    'SELECT role FROM user_roles WHERE user_id = ? ORDER BY role',
  );
  const requestColumns = `id, title, description, reason, requester_id AS requesterId,
    status, version, reviewer_comment AS reviewerComment`;
  const requestById = db.prepare<[string], ChangeRequest>(`SELECT ${requestColumns} FROM change_requests WHERE id = ?`);
  const ownedRequests = db.prepare<[string], ChangeRequest>(
    `SELECT ${requestColumns} FROM change_requests WHERE requester_id = ? ORDER BY id`,
  );
  const pendingReviewRequests = db.prepare<[string], ChangeRequest>(
    `SELECT ${requestColumns} FROM change_requests
      WHERE status = 'PendingReview' AND requester_id <> ? ORDER BY id`,
  );
  const insertDraft = db.prepare<Proposal & { id: string; requesterId: string }>(`INSERT INTO change_requests
    (id, title, description, reason, requester_id, status, version, reviewer_comment)
    VALUES (@id, @title, @description, @reason, @requesterId, 'Draft', 1, NULL)`);
  type OwnerWrite = { id: string; requesterId: string; expectedVersion: number };
  const editOwned = db.prepare<OwnerWrite & Proposal>(`UPDATE change_requests
    SET title = @title, description = @description, reason = @reason, version = version + 1
    WHERE id = @id AND requester_id = @requesterId AND version = @expectedVersion
      AND status IN ('Draft', 'ChangesRequested') AND version < 9007199254740991`);
  const submitOwned = db.prepare<OwnerWrite>(`UPDATE change_requests SET status = 'PendingReview', version = version + 1
    WHERE id = @id AND requester_id = @requesterId AND version = @expectedVersion
      AND status IN ('Draft', 'ChangesRequested') AND version < 9007199254740991`);
  type ReviewerWrite = { id: string; reviewerId: string; expectedVersion: number };
  const approveIndependent = db.prepare<ReviewerWrite>(`UPDATE change_requests
    SET status = 'Approved', version = version + 1
    WHERE id = @id AND requester_id <> @reviewerId AND version = @expectedVersion
      AND status = 'PendingReview' AND version < 9007199254740991`);
  const returnIndependent = db.prepare<ReviewerWrite & { comment: string }>(`UPDATE change_requests
    SET status = 'ChangesRequested', reviewer_comment = @comment, version = version + 1
    WHERE id = @id AND requester_id <> @reviewerId AND version = @expectedVersion
      AND status = 'PendingReview' AND version < 9007199254740991`);

  function requireTransaction(): void {
    if (!db.inTransaction) throw new TypeError('Identity queries require the caller transaction.');
  }

  return {
    findRequestById(id: string): ChangeRequest | undefined {
      requireTransaction();
      return requestById.get(id);
    },
    listOwnedRequests(requesterId: string): ChangeRequest[] {
      requireTransaction();
      return ownedRequests.all(requesterId);
    },
    listPendingReviewRequests(reviewerId: string): ChangeRequest[] {
      requireTransaction();
      return pendingReviewRequests.all(reviewerId);
    },
    insertDraft(id: string, requesterId: string, proposal: Proposal): number {
      requireTransaction();
      return insertDraft.run({ ...proposal, id, requesterId }).changes;
    },
    editOwnedRequest(id: string, requesterId: string, expectedVersion: number, proposal: Proposal): number {
      requireTransaction();
      return editOwned.run({ ...proposal, id, requesterId, expectedVersion }).changes;
    },
    submitOwnedRequest(id: string, requesterId: string, expectedVersion: number): number {
      requireTransaction();
      return submitOwned.run({ id, requesterId, expectedVersion }).changes;
    },
    approveIndependentRequest(id: string, reviewerId: string, expectedVersion: number): number {
      requireTransaction();
      return approveIndependent.run({ id, reviewerId, expectedVersion }).changes;
    },
    returnIndependentRequest(id: string, reviewerId: string, expectedVersion: number, comment: string): number {
      requireTransaction();
      return returnIndependent.run({ id, reviewerId, expectedVersion, comment }).changes;
    },
    // Return inactive identities too: deciding 401/403 is business logic, not SQL.
    findIdentityById(id: string): CurrentIdentity | undefined {
      requireTransaction();
      return withStorageErrors(() => {
        const user = identityById.get(id);
        if (!user) return undefined;
        return { id: user.id, active: user.active === 1, roles: rolesById.all(id).map(row => row.role) };
      });
    },
    // Credential records are persistence-internal; never return them from an HTTP handler.
    findUserByUsername(username: string): StoredUser | undefined {
      requireTransaction();
      return withStorageErrors(() => {
        const user = userByUsername.get(username);
        return user ? { ...user, active: user.active === 1 } : undefined;
      });
    },
  };
}
