import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { initializeDatabaseFile } from '../../scripts/init-db.js';
import { seedDemoUsers } from '../../scripts/seed-demo.js';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { startServer } from '../../src/server.js';
import { hashPassword, verifyPassword } from '../../src/business/auth.js';
import { openDatabase, writeTransaction } from '../../src/persistence/database.js';
import { createDatabaseFixture } from '../support/database.js';

type Fixture = Awaited<ReturnType<typeof createDatabaseFixture>>;
const fixtures: Fixture[] = [];
async function fixture(): Promise<Fixture> {
  const f = await createDatabaseFixture({ seed: false });
  fixtures.push(f);
  return f;
}
afterEach(() => { for (const f of fixtures.splice(0)) f.cleanup(); });
const configFor = (f: Fixture) => loadConfig({ DATABASE_PATH: f.databasePath, JWT_SECRET_BASE64: randomBytes(32).toString('base64') });

describe('T012/T015 explicit bootstrap', () => {
  it('stores five salted scrypt credentials and server-side roles; every generated credential logs in', async () => {
    const f = await fixture();
    initializeDatabaseFile(f.databasePath);
    const pending = seedDemoUsers(f.db);
    expect(f.db.inTransaction).toBe(false);
    const created = await pending;
    expect(created).toHaveLength(5);
    const saved = f.snapshot();
    expect(saved.users).toHaveLength(5);
    expect(saved.roles.filter(row => row.role === 'Requester')).toHaveLength(3);
    expect(saved.roles.filter(row => row.role === 'Reviewer')).toHaveLength(3);
    expect(new Set(saved.users.map(row => row.password_hash.split('$')[4])).size).toBe(5);
    const app = createApp(configFor(f), f.db);
    for (const credential of created) {
      const row = saved.users.find(user => user.username === credential.username)!;
      expect(row.password_hash).not.toBe(credential.password);
      expect(row.password_hash).toMatch(/^scrypt\$32768\$8\$3\$/);
      const response = await request(app).post('/api/auth/login').send(credential);
      expect(response.status).toBe(200);
      expect(Object.keys(response.body).sort()).toEqual(['accessToken', 'expiresIn', 'tokenType']);
    }
    // Independently recompute one persisted record with Node crypto, rather than
    // relying only on production hash/verify agreeing with one another.
    const credential = created[0]!;
    const record = saved.users.find(user => user.username === credential.username)!.password_hash.split('$');
    const salt = Buffer.from(record[4]!, 'base64');
    expect(salt).toHaveLength(16);
    const derived = await new Promise<Buffer>((accept, reject) => {
      scrypt(credential.password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
        if (error) reject(error); else accept(key);
      });
    });
    expect(derived.equals(Buffer.from(record[5]!, 'base64'))).toBe(true);
    expect(f.snapshot()).toEqual(saved);
  }, 15000);

  it('preserves accounts, hashes, disabled state, revoked roles, and requests across rerun and reopen', async () => {
    const f = await fixture();
    const credentials = await seedDemoUsers(f.db);
    const owner = f.snapshot().users.find(user => user.username === 'requester-a')!;
    writeTransaction(f.db, () => {
      f.db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(owner.id);
      f.db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(owner.id);
      f.db.prepare(`INSERT INTO change_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), 'Existing request', 'Existing description', 'Existing reason', owner.id, 'Draft', 1, null);
    });
    const before = f.snapshot();
    expect(await seedDemoUsers(f.db)).toEqual([]);
    initializeDatabaseFile(f.databasePath);
    expect(f.snapshot()).toEqual(before);
    const reopened = openDatabase(f.databasePath, { fileMustExist: true });
    try { expect(await seedDemoUsers(reopened)).toEqual([]); } finally { reopened.close(); }
    expect(f.snapshot()).toEqual(before);
    // Remaining active accounts retain their original generated passwords.
    const credential = credentials.find(user => user.username === 'reviewer-a')!;
    const response = await request(createApp(configFor(f), f.db)).post('/api/auth/login').send(credential);
    expect(response.status).toBe(200);
    expect(f.snapshot()).toEqual(before);
  }, 15000);

  it('adds only a missing account and leaves all existing records untouched', async () => {
    const f = await fixture();
    await seedDemoUsers(f.db);
    f.db.prepare('DELETE FROM users WHERE username = ?').run('reviewer-b');
    const before = f.snapshot();
    const created = await seedDemoUsers(f.db);
    expect(created).toHaveLength(1);
    expect(created[0]?.username).toBe('reviewer-b');
    const after = f.snapshot();
    expect(after.users.filter(row => row.username !== 'reviewer-b')).toEqual(before.users);
    expect(after.roles.filter(row => before.users.some(user => user.id === row.user_id))).toEqual(before.roles);
  }, 15000);

  it('executes the actual db:init/db:seed npm scripts only on a private temporary database', async () => {
    const f = await fixture();
    const env = { ...process.env, DATABASE_PATH: f.databasePath, JWT_SECRET_BASE64: randomBytes(32).toString('base64') };
    const npmCli = process.env.npm_execpath;
    expect(npmCli).toBeTruthy();
    const run = (name: string) => spawnSync(process.execPath, [npmCli!, 'run', name], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
    const initialized = run('db:init');
    expect(initialized.status).toBe(0);
    const first = run('db:seed');
    expect(first.status).toBe(0);
    expect(first.stdout.includes('shown only on creation')).toBe(true);
    const snapshot = f.snapshot();
    expect(snapshot.users).toHaveLength(5);
    const rerun = run('db:seed');
    expect(rerun.status).toBe(0);
    expect(rerun.stdout.includes('existing credentials and roles preserved')).toBe(true);
    expect(rerun.stdout.includes('shown only on creation')).toBe(false);
    expect(f.snapshot()).toEqual(snapshot);
    // Child stdout contains disposable generated passwords: deliberately neither
    // print it nor include it in snapshots, assertion diagnostics, or reports.
  }, 90000);
});

describe('T011 password records', () => {
  it('uses distinct salts, preserves raw password text, and safely rejects altered work factors/records', async () => {
    const password = '  test-only raw password é  ';
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first === second).toBe(false);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword(password.trim(), first)).toBe(false);
    expect(await verifyPassword('wrong', first)).toBe(false);
    expect(await verifyPassword(password, first.replace('$32768$', '$999999999$'))).toBe(false);
    expect(await verifyPassword(password, 'malformed')).toBe(false);
    expect(await verifyPassword(password)).toBe(false);
  }, 15000);
});

describe('T014 server lifecycle', () => {
  it('starts without seeding, serves HTTP, and closes the listener and database idempotently', async () => {
    const f = await fixture();
    const running = await startServer({ ...configFor(f), port: 0 });
    try {
      expect(f.snapshot().users).toHaveLength(0);
      const response = await request(running.server).post('/api/auth/login').send({});
      expect(response.status).toBe(400);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(f.snapshot().users).toHaveLength(0);
    } finally { await running.close(); }
    await running.close();
    expect(running.db.open).toBe(false);
    expect(running.server.listening).toBe(false);
  });
});
