import Database from 'better-sqlite3';
import { isAsyncFunction } from 'node:util/types';
import { BusinessError } from '../business/rules.js';

export type SqliteDatabase = Database.Database;
export const SCHEMA_VERSION = 1;

export function openDatabase(path: string, options: Database.Options = {}): SqliteDatabase {
  const db = new Database(path, { ...options, timeout: 1000 });
  try {
    db.pragma('foreign_keys = ON');
    const journal = db.pragma('journal_mode = DELETE', { simple: true });
    db.pragma('synchronous = FULL');
    db.pragma('busy_timeout = 1000');
    if (db.pragma('foreign_keys', { simple: true }) !== 1 || journal !== 'delete') {
      throw new BusinessError('STORAGE_UNAVAILABLE');
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function assertSynchronous<T>(db: SqliteDatabase, work: () => T): void {
  // Nested IMMEDIATE calls become savepoints in the driver and cannot acquire
  // the writer reservation promised by this API. Services own top-level scope.
  if (db.inTransaction) throw new TypeError('Nested transaction helpers are not permitted.');
  if (isAsyncFunction(work)) throw new TypeError('Transaction callbacks must be synchronous.');
}

// Wrap the entire call in withStorageErrors (store.ts), including BEGIN/COMMIT.
// The driver rejects returned promises/thenables and rolls back on callback or
// commit failure. No callback may schedule asynchronous database work.
export function writeTransaction<T>(db: SqliteDatabase, work: () => T): T {
  assertSynchronous(db, work);
  return db.transaction(work).immediate();
}

export function readTransaction<T>(db: SqliteDatabase, work: () => T): T {
  assertSynchronous(db, work);
  const wasReadOnly = db.pragma('query_only', { simple: true }) === 1;
  db.pragma('query_only = ON');
  try {
    return db.transaction(work).deferred();
  } finally {
    if (!wasReadOnly) db.pragma('query_only = OFF');
  }
}

export function initializeSchema(db: SqliteDatabase): void {
  writeTransaction(db, () => {
    const version = db.pragma('user_version', { simple: true });
    if (version === SCHEMA_VERSION) return;
    if (version !== 0) throw new BusinessError('STORAGE_UNAVAILABLE');

    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        username TEXT NOT NULL UNIQUE COLLATE BINARY,
        password_hash TEXT NOT NULL,
        active INTEGER NOT NULL CHECK (active IN (0, 1))
      ) STRICT;
      CREATE TABLE user_roles (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('Requester', 'Reviewer')),
        PRIMARY KEY (user_id, role)
      ) STRICT;
      CREATE TABLE change_requests (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        reason TEXT NOT NULL,
        requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK (status IN ('Draft', 'PendingReview', 'ChangesRequested', 'Approved')),
        version INTEGER NOT NULL CHECK (typeof(version) = 'integer' AND version BETWEEN 1 AND 9007199254740991),
        reviewer_comment TEXT,
        CHECK (status <> 'ChangesRequested' OR reviewer_comment IS NOT NULL),
        CHECK (status <> 'Draft' OR reviewer_comment IS NULL)
      ) STRICT;
      CREATE INDEX change_requests_requester_id ON change_requests(requester_id);
      CREATE INDEX change_requests_status_requester_id ON change_requests(status, requester_id);
      PRAGMA user_version = 1;
    `);
  });
}
