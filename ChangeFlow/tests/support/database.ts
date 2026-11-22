import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { BusinessError, STATUSES } from '../../src/business/rules.js';
import { hashPassword } from '../../src/business/auth.js';
import type { ChangeRequestStatus, Role } from '../../src/business/rules.js';
import { initializeSchema, openDatabase, readTransaction, writeTransaction } from '../../src/persistence/database.js';
import type { SqliteDatabase } from '../../src/persistence/database.js';

export interface TestUser {
  readonly id: string;
  readonly username: string;
  readonly password: string;
  readonly active: boolean;
  readonly roles: readonly Role[];
}

export interface RequestRow {
  id: string;
  title: string;
  description: string;
  reason: string;
  requester_id: string;
  status: ChangeRequestStatus;
  version: number;
  reviewer_comment: string | null;
}

export interface DatabaseSnapshot {
  users: { id: string; username: string; password_hash: string; active: number }[];
  roles: { user_id: string; role: Role }[];
  requests: RequestRow[];
}

const USER_DEFINITIONS = {
  requesterA: { roles: ['Requester'], active: true },
  requesterB: { roles: ['Requester'], active: true },
  reviewerA: { roles: ['Reviewer'], active: true },
  reviewerB: { roles: ['Reviewer'], active: true },
  dualRole: { roles: ['Requester', 'Reviewer'], active: true },
  noRole: { roles: [], active: true },
  disabled: { roles: ['Requester'], active: false },
} as const satisfies Record<string, { roles: readonly Role[]; active: boolean }>;

type UserName = keyof typeof USER_DEFINITIONS;

export function snapshotDatabase(assertionDb: SqliteDatabase): DatabaseSnapshot {
  // Must be called after the operation finishes. These queries use an independent
  // connection to committed data, never an HTTP response or a persistence mock.
  return readTransaction(assertionDb, () => ({
    users: assertionDb.prepare<[], DatabaseSnapshot['users'][number]>(
      'SELECT id, username, password_hash, active FROM users ORDER BY id',
    ).all(),
    roles: assertionDb.prepare<[], DatabaseSnapshot['roles'][number]>(
      'SELECT user_id, role FROM user_roles ORDER BY user_id, role',
    ).all(),
    requests: assertionDb.prepare<[], RequestRow>(
      'SELECT id, title, description, reason, requester_id, status, version, reviewer_comment FROM change_requests ORDER BY id',
    ).all(),
  }));
}

export async function createDatabaseFixture(options: { seed?: boolean } = {}) {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'changeflow-test-'));
  const databasePath = join(directory, 'test.sqlite');
  const connections = new Set<SqliteDatabase>();

  function openConnection(readonly = false): SqliteDatabase {
    const connection = openDatabase(databasePath, { readonly, fileMustExist: true });
    connections.add(connection);
    return connection;
  }

  function cleanup(): void {
    const failures: unknown[] = [];
    for (const connection of connections) {
      try {
        if (connection.open) {
          if (connection.inTransaction) connection.exec('ROLLBACK');
          connection.close();
        }
      } catch (error) {
        failures.push(error);
      }
    }
    // Do not remove files while a connection failed to close on Windows.
    if (failures.length) throw new AggregateError(failures, 'Test database cleanup failed.');
    const target = resolve(directory);
    if (!target.startsWith(temporaryRoot + sep) || !target.split(sep).at(-1)?.startsWith('changeflow-test-')) {
      throw new Error('Refusing to remove a path outside this fixture temporary directory.');
    }
    rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    connections.clear();
  }

  try {
    const db = openDatabase(databasePath);
    connections.add(db);
    initializeSchema(db);
    const assertionDb = openConnection(true);
    const users: Partial<Record<UserName, TestUser>> = {};
    const requests: Partial<Record<ChangeRequestStatus, RequestRow>> = {};

    if (options.seed !== false) {
      const prepared: { name: UserName; user: TestUser; hash: string }[] = [];
      for (const [name, definition] of Object.entries(USER_DEFINITIONS)) {
        const password = randomBytes(24).toString('base64');
        const user: TestUser = { id: randomUUID(), username: name, password, ...definition };
        prepared.push({ name: name as UserName, user, hash: await hashPassword(password) });
      }
      writeTransaction(db, () => {
        const insertUser = db.prepare('INSERT INTO users (id, username, password_hash, active) VALUES (?, ?, ?, ?)');
        const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)');
        for (const { name, user, hash } of prepared) {
          insertUser.run(user.id, user.username, hash, Number(user.active));
          for (const role of user.roles) insertRole.run(user.id, role);
          users[name] = user;
        }
        const owner = users.requesterA;
        if (!owner) throw new BusinessError('INTERNAL_ERROR');
        const insertRequest = db.prepare(`INSERT INTO change_requests
          (id, title, description, reason, requester_id, status, version, reviewer_comment)
          VALUES (@id, @title, @description, @reason, @requester_id, @status, @version, @reviewer_comment)`);
        for (const status of STATUSES) {
          const request: RequestRow = {
            id: randomUUID(), title: `Fixture ${status}`, description: 'Controlled proposal',
            reason: 'Controlled reason', requester_id: owner.id, status, version: 1,
            reviewer_comment: status === 'ChangesRequested' ? 'Please revise this proposal.' : null,
          };
          insertRequest.run(request);
          requests[status] = request;
        }
      });
    }

    return {
      directory, databasePath, db, assertionDb, users, requests,
      openConnection, cleanup,
      snapshot: () => snapshotDatabase(assertionDb),
    };
  } catch (error) {
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Fixture initialization and cleanup failed.');
    }
    throw error;
  }
}
