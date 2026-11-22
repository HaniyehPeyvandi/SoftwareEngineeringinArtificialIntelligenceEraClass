import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { BusinessError, ERROR_MESSAGES, ROLES, STATUSES } from '../../src/business/rules.js';
import { ConfigurationError, loadConfig } from '../../src/config.js';
import { initializeSchema, openDatabase, readTransaction, writeTransaction } from '../../src/persistence/database.js';
import { createStore, translateStorageError, withStorageErrors } from '../../src/persistence/store.js';
import { createDatabaseFixture } from '../support/database.js';

type Fixture = Awaited<ReturnType<typeof createDatabaseFixture>>;
const fixtures: Fixture[] = [];
async function fixture(seed = false): Promise<Fixture> {
  const result = await createDatabaseFixture({ seed });
  fixtures.push(result);
  return result;
}
afterEach(() => {
  const pending = fixtures.splice(0);
  const failures: unknown[] = [];
  for (const item of pending) {
    try { item.cleanup(); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw new AggregateError(failures, 'Foundation fixture cleanup failed.');
});

function insertUser(db: Database.Database, username = 'Owner'): string {
  const id = randomUUID();
  db.prepare('INSERT INTO users (id, username, password_hash, active) VALUES (?, ?, ?, 1)')
    .run(id, username, 'schema-test-only');
  return id;
}

describe('T005 shared vocabulary', () => {
  it('matches contract error codes and contains only the approved roles/statuses', () => {
    const contract = JSON.parse(readFileSync('specs/001-change-request-workflow/contracts/openapi.json', 'utf8'));
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual(contract.components.schemas.ErrorResponse.properties.error.properties.code.enum.sort());
    expect(ROLES).toEqual(['Requester', 'Reviewer']);
    expect(STATUSES).toEqual(['Draft', 'PendingReview', 'ChangesRequested', 'Approved']);
    const error = new BusinessError('VERSION_CONFLICT');
    expect(error.message).not.toMatch(/SELECT|password|sqlite/i);
    expect(error.code).toBe('VERSION_CONFLICT');
  });
});

describe('T006 configuration', () => {
  it('loads local defaults and the decoded key without creating a database', () => {
    const key = randomBytes(32);
    const config = loadConfig({ JWT_SECRET_BASE64: key.toString('base64') });
    expect(config).toMatchObject({ host: '127.0.0.1', port: 3000, databasePath: resolve('data/changeflow.sqlite'),
      jwtIssuer: 'changeflow', jwtAudience: 'changeflow-api', jwtLifetimeSeconds: 900 });
    expect(Buffer.from(config.jwtSecret)).toEqual(key);
    expect(existsSync(config.databasePath)).toBe(false);
  });

  it.each([
    {}, { JWT_SECRET_BASE64: '' }, { JWT_SECRET_BASE64: 'not valid base64!!' },
    { JWT_SECRET_BASE64: randomBytes(31).toString('base64') },
    { JWT_SECRET_BASE64: randomBytes(32).toString('base64').replace(/=$/, '') },
  ])('rejects absent, malformed, or undersized keys without disclosing them: %#', env => {
    expect(() => loadConfig(env)).toThrow(new ConfigurationError('JWT_SECRET_BASE64'));
  });

  it.each([
    ['PORT', '0'], ['PORT', '65536'], ['PORT', '3.5'], ['PORT', '3000x'], ['PORT', ''],
    ['HOST', 'http://localhost'], ['HOST', ''],
    ['DATABASE_PATH', ''], ['DATABASE_PATH', ':memory:'], ['DATABASE_PATH', 'file:demo.sqlite'],
    ['DATABASE_PATH', '\\\\server\\share\\demo.sqlite'], ['DATABASE_PATH', '//server/share/demo.sqlite'],
    ['DATABASE_PATH', '.'], ['DATABASE_PATH', 'data/'], ['DATABASE_PATH', 'bad\0path'],
  ])('rejects invalid %s setting %j', (field, value) => {
    expect(() => loadConfig({ JWT_SECRET_BASE64: randomBytes(32).toString('base64'), [field]: value }))
      .toThrow(new ConfigurationError(field));
  });

  it('accepts explicit valid local configuration', async () => {
    const f = await fixture();
    expect(loadConfig({ JWT_SECRET_BASE64: randomBytes(48).toString('base64'),
      DATABASE_PATH: f.databasePath, HOST: '::1', PORT: '65535' }))
      .toMatchObject({ databasePath: f.databasePath, host: '::1', port: 65535 });
  });
});

describe('T007 schema and transactions', () => {
  it('enforces connection settings, schema version, indexes, and idempotent initialization', async () => {
    const f = await fixture();
    const owner = insertUser(f.db);
    initializeSchema(f.db);
    for (const connection of [f.db, f.assertionDb, f.openConnection()]) {
      expect(connection.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(connection.pragma('journal_mode', { simple: true })).toBe('delete');
      expect(connection.pragma('synchronous', { simple: true })).toBe(2);
      expect(connection.pragma('busy_timeout', { simple: true })).toBe(1000);
      expect(connection.pragma('user_version', { simple: true })).toBe(1);
    }
    expect(f.snapshot().users[0]?.id).toBe(owner);
    const indexes = f.db.prepare<[], { name: string }>('PRAGMA index_list(change_requests)').all().map(row => row.name);
    expect(indexes).toContain('change_requests_requester_id');
    expect(indexes).toContain('change_requests_status_requester_id');
    expect(f.db.prepare<[], { name: string }>('PRAGMA index_info(change_requests_requester_id)').all().map(row => row.name))
      .toEqual(['requester_id']);
    expect(f.db.prepare<[], { name: string }>('PRAGMA index_info(change_requests_status_requester_id)').all().map(row => row.name))
      .toEqual(['status', 'requester_id']);
    expect(f.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('rejects invalid fields/relationships and preserves independently inspected rows', async () => {
    const f = await fixture();
    const owner = insertUser(f.db);
    f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(owner, 'Requester');
    const insert = f.db.prepare(`INSERT INTO change_requests
      (id, title, description, reason, requester_id, status, version, reviewer_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run(randomUUID(), 'Valid', 'Description', 'Reason', owner, 'Draft', 1, null);
    const before = f.snapshot();
    for (const [status, version, comment] of [
      ['Other', 1, null], ['Draft', 0, null], ['Draft', 1.5, null],
      ['Draft', 9007199254740992, null], ['Draft', 1, 'Comment'], ['ChangesRequested', 1, null],
    ]) {
      expect(() => insert.run(randomUUID(), 'Valid', 'Description', 'Reason', owner, status, version, comment)).toThrow();
    }
    expect(() => insert.run(randomUUID(), null, 'Description', 'Reason', owner, 'Draft', 1, null)).toThrow();
    expect(() => insert.run(randomUUID(), 'Valid', 'Description', 'Reason', randomUUID(), 'Draft', 1, null)).toThrow();
    expect(() => f.db.prepare('UPDATE users SET active = 2 WHERE id = ?').run(owner)).toThrow();
    expect(() => f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(owner, 'Admin')).toThrow();
    expect(() => f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(owner, 'Requester')).toThrow();
    expect(() => f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(randomUUID(), 'Reviewer')).toThrow();
    expect(() => f.db.prepare('INSERT INTO users VALUES (?, ?, ?, 1)').run(randomUUID(), 'Owner', 'hash')).toThrow();
    expect(() => f.db.prepare('INSERT INTO users VALUES (NULL, ?, ?, 1)').run('NullId', 'hash')).toThrow();
    expect(() => f.db.prepare('DELETE FROM users WHERE id = ?').run(owner)).toThrow();
    expect(f.snapshot()).toEqual(before);
    const spare = insertUser(f.db, 'Spare');
    f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(spare, 'Reviewer');
    f.db.prepare('DELETE FROM users WHERE id = ?').run(spare);
    expect(f.snapshot()).toEqual(before);
    insert.run(randomUUID(), 'Safe limit', 'Description', 'Reason', owner, 'Approved', Number.MAX_SAFE_INTEGER, 'Retained');
    expect(f.snapshot().requests).toHaveLength(2);
  });

  it('rolls back callback failures, forbids writes in read scope, and rejects async/nested callbacks', async () => {
    const f = await fixture();
    const before = f.snapshot();
    expect(() => writeTransaction(f.db, () => { insertUser(f.db); throw new Error('Abort'); })).toThrow('Abort');
    expect(f.snapshot()).toEqual(before);
    expect(() => readTransaction(f.db, () => insertUser(f.db))).toThrow();
    let invoked = false;
    expect(() => writeTransaction(f.db, async () => { invoked = true; })).toThrow(/synchronous/);
    expect(invoked).toBe(false);
    expect(() => writeTransaction(f.db, () => { insertUser(f.db); return Promise.resolve(); })).toThrow(/promise/i);
    expect(() => readTransaction(f.db, () => writeTransaction(f.db, () => insertUser(f.db)))).toThrow(/Nested/);
    expect(f.db.inTransaction).toBe(false);
    expect(f.db.pragma('query_only', { simple: true })).toBe(0);
    expect(f.snapshot()).toEqual(before);
    const id = writeTransaction(f.db, () => insertUser(f.db));
    expect(f.snapshot().users[0]?.id).toBe(id);
  });

  it('rejects unsupported schema versions and rolls back partially executed initialization', async () => {
    const f = await fixture();
    f.db.pragma('user_version = 2');
    expect(() => initializeSchema(f.db)).toThrow(new BusinessError('STORAGE_UNAVAILABLE'));
    expect(f.db.pragma('user_version', { simple: true })).toBe(2);
    f.db.exec('DROP TABLE change_requests; DROP TABLE user_roles; DROP TABLE users; CREATE TABLE user_roles (id TEXT); PRAGMA user_version = 0;');
    expect(() => initializeSchema(f.db)).toThrow();
    expect(f.db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([{ name: 'user_roles' }]);
    expect(f.db.pragma('user_version', { simple: true })).toBe(0);
    expect(f.db.inTransaction).toBe(false);
  });

  it('distinguishes a real writer reservation failure from a stale Version', async () => {
    const f = await fixture();
    const competitor = f.openConnection();
    const before = f.snapshot();
    competitor.exec('BEGIN IMMEDIATE');
    try {
      expect(() => withStorageErrors(() => writeTransaction(f.db, () => insertUser(f.db))))
        .toThrow(new BusinessError('STORAGE_BUSY'));
      expect(f.db.inTransaction).toBe(false);
    } finally { competitor.exec('ROLLBACK'); }
    expect(f.snapshot()).toEqual(before);
  });

  it('rolls back an actual COMMIT lock timeout before reporting storage failure', async () => {
    const f = await fixture();
    const reader = f.openConnection();
    const before = f.snapshot();
    reader.exec('BEGIN');
    reader.prepare('SELECT * FROM users').all();
    try {
      expect(() => withStorageErrors(() => writeTransaction(f.db, () => insertUser(f.db))))
        .toThrow(new BusinessError('STORAGE_BUSY'));
      expect(f.db.inTransaction).toBe(false);
    } finally { reader.exec('ROLLBACK'); }
    expect(f.snapshot()).toEqual(before);
  });
});

describe('T008 identity persistence and safe storage errors', () => {
  it('uses bound case-sensitive lookup and sees committed role/active changes in the next transaction', async () => {
    const f = await fixture(true);
    const store = createStore(f.db);
    const user = f.users.dualRole!;
    expect(() => store.findIdentityById(user.id)).toThrow(/transaction/);
    expect(() => store.findUserByUsername(user.username)).toThrow(/transaction/);
    const identity = readTransaction(f.db, () => store.findIdentityById(user.id));
    expect(identity).toEqual({ id: user.id, active: true, roles: ['Requester', 'Reviewer'] });
    expect(identity).not.toHaveProperty('passwordHash');
    expect(readTransaction(f.db, () => store.findUserByUsername(user.username)))
      .toMatchObject({ id: user.id, username: user.username, active: true });
    expect(readTransaction(f.db, () => store.findUserByUsername(user.username.toUpperCase()))).toBeUndefined();
    expect(readTransaction(f.db, () => store.findUserByUsername("' OR 1=1 --"))).toBeUndefined();
    expect(readTransaction(f.db, () => store.findIdentityById("' OR 1=1 --"))).toBeUndefined();
    const maintenance = f.openConnection();
    writeTransaction(maintenance, () => {
      maintenance.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(user.id, 'Reviewer');
      maintenance.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id);
    });
    expect(readTransaction(f.db, () => store.findIdentityById(user.id)))
      .toEqual({ id: user.id, active: false, roles: ['Requester'] });
    expect(f.snapshot().roles.filter(row => row.user_id === user.id)).toEqual([{ user_id: user.id, role: 'Requester' }]);
    expect(f.snapshot().users.find(row => row.id === user.id)?.active).toBe(0);
  }, 15000);

  it.each([
    ['SQLITE_BUSY_TIMEOUT', 'STORAGE_BUSY'], ['SQLITE_LOCKED', 'STORAGE_BUSY'],
    ['SQLITE_IOERR_WRITE', 'STORAGE_UNAVAILABLE'], ['SQLITE_CANTOPEN', 'STORAGE_UNAVAILABLE'],
    ['SQLITE_FULL', 'STORAGE_UNAVAILABLE'], ['SQLITE_CORRUPT', 'STORAGE_UNAVAILABLE'],
    ['SQLITE_READONLY', 'STORAGE_UNAVAILABLE'], ['SQLITE_CONSTRAINT_CHECK', 'INTERNAL_ERROR'],
    ['SQLITE_ERROR', 'INTERNAL_ERROR'],
  ])('maps %s to %s without leaking driver details', (code, expected) => {
    const translated = translateStorageError(new Database.SqliteError('sensitive SQL/path/value', code));
    expect(translated.code).toBe(expected);
    expect(JSON.stringify(translated)).not.toContain('sensitive');
    expect(translated.message).not.toContain('sensitive');
  });

  it('preserves business denials and sanitizes OS/programming failures', () => {
    const denial = new BusinessError('FORBIDDEN');
    expect(translateStorageError(denial)).toBe(denial);
    expect(translateStorageError(Object.assign(new Error('private path'), { code: 'ENOSPC' })).code).toBe('STORAGE_UNAVAILABLE');
    expect(translateStorageError(new TypeError('private fault')).code).toBe('INTERNAL_ERROR');
    expect(translateStorageError({ code: 'SQLITE_BUSY' }).code).toBe('INTERNAL_ERROR');
  });
});

describe('T009 independent real-file fixtures', () => {
  it('seeds controlled users/all statuses, isolates files, survives reopen, and closes connections before cleanup', async () => {
    const first = await fixture(true);
    const second = await fixture();
    expect(first.databasePath).not.toBe(second.databasePath);
    expect(first.assertionDb).not.toBe(first.db);
    expect(first.assertionDb.readonly).toBe(true);
    expect(first.snapshot().users).toHaveLength(7);
    expect(first.snapshot().roles.filter(row => row.user_id === first.users.noRole?.id)).toEqual([]);
    expect(first.snapshot().users.find(row => row.id === first.users.disabled?.id)?.active).toBe(0);
    expect(second.snapshot()).toEqual({ users: [], roles: [], requests: [] });
    expect(first.snapshot().requests.map(row => row.status).sort()).toEqual([...STATUSES].sort());
    const rows = first.snapshot().users;
    expect(new Set(rows.map(row => row.password_hash.split('$')[4])).size).toBe(7);
    for (const row of rows) {
      expect(row.password_hash).toMatch(/^scrypt\$32768\$8\$3\$/);
      expect(Buffer.from(row.password_hash.split('$')[4]!, 'base64')).toHaveLength(16);
      expect(Buffer.from(row.password_hash.split('$')[5]!, 'base64')).toHaveLength(64);
      expect(Object.values(first.users).some(user => user.password === row.password_hash)).toBe(false);
    }
    const before = first.snapshot();
    first.db.close();
    const reopened = openDatabase(first.databasePath, { fileMustExist: true });
    try {
      initializeSchema(reopened);
      expect(first.snapshot()).toEqual(before);
    } finally { reopened.close(); }
    const additional = first.openConnection();
    additional.exec('BEGIN IMMEDIATE');
    first.cleanup();
    first.cleanup();
    expect(first.assertionDb.open).toBe(false);
    expect(additional.open).toBe(false);
    expect(existsSync(first.directory)).toBe(false);
    expect(existsSync(second.databasePath)).toBe(true);
  }, 15000);
});
