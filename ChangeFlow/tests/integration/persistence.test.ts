import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { initializeSchema, writeTransaction } from '../../src/persistence/database.js';
import { initializeDatabaseFile } from '../../scripts/init-db.js';
import { seedDemoUsers } from '../../scripts/seed-demo.js';
import { createDatabaseFixture, snapshotDatabase } from '../support/database.js';
import type { DatabaseSnapshot, RequestRow } from '../support/database.js';
import { BASE, ownerContext, PROPOSAL, representation } from '../support/owner.js';

const ctx = ownerContext();
type Fixture = Awaited<ReturnType<typeof createDatabaseFixture>>;
type Credential = { username: string; password: string };
type Identity = 'owner' | 'reviewerA' | 'reviewerB';

// A real connection lifecycle, not another SELECT on the original open handle.
// All connections to this fixture file close at each checkpoint; subsequent
// operations run against a newly constructed app and independently reopened SQL.
async function durableClient(f: Fixture, credentials: Record<Identity, Credential>) {
  const config = loadConfig({ DATABASE_PATH: f.databasePath, JWT_SECRET_BASE64: randomBytes(32).toString('base64') });
  let db = f.db;
  let assertion = f.assertionDb;
  let app = createApp(config, db);
  const tokens = {} as Record<Identity, string>;
  const initial = snapshotDatabase(assertion);
  for (const [actor, credential] of Object.entries(credentials)) {
    const response = await request(app).post('/api/auth/login').send({ username: credential.username, password: credential.password });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    tokens[actor as Identity] = response.body.accessToken as string;
    expect(snapshotDatabase(assertion)).toEqual(initial);
  }
  function send(method: 'get' | 'post' | 'put', suffix: string, body?: object, actor: Identity = 'owner') {
    const pending = request(app)[method](BASE + suffix).set('Authorization', `Bearer ${tokens[actor]}`);
    if (body) pending.send(body);
    return pending;
  }
  function snapshot() { return snapshotDatabase(assertion); }
  function schema() { return assertion.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name').all(); }
  function reopen(expected: DatabaseSnapshot, initialize = false) {
    expect(snapshot()).toEqual(expected);
    const priorSchema = schema();
    const priorVersion = assertion.pragma('user_version', { simple: true });
    db.close();
    assertion.close();
    expect(db.open).toBe(false);
    expect(assertion.open).toBe(false);
    if (initialize) { initializeDatabaseFile(f.databasePath); initializeDatabaseFile(f.databasePath); }
    db = f.openConnection();
    assertion = f.openConnection(true);
    if (initialize) { initializeSchema(db); initializeSchema(db); }
    app = createApp(config, db);
    expect(snapshot()).toEqual(expected);
    expect(schema()).toEqual(priorSchema);
    expect(assertion.pragma('user_version', { simple: true })).toBe(priorVersion);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(assertion.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('journal_mode', { simple: true })).toBe('delete');
    expect(db.pragma('synchronous', { simple: true })).toBe(2);
    expect(assertion.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(assertion.pragma('foreign_key_check')).toEqual([]);
  }
  return {
    get db() { return db; }, get app() { return app; }, send, snapshot, reopen,
    async create() {
      const before = snapshot();
      const response = await send('post', '', PROPOSAL);
      expect(response.status).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      const owner = before.users.find(user => user.username === credentials.owner.username)!;
      const row: RequestRow = { ...PROPOSAL, id: response.body.id as string, requester_id: owner.id,
        status: 'Draft', version: 1, reviewer_comment: null };
      expect(response.headers.location).toBe(`${BASE}/${row.id}`);
      expect(response.body).toEqual(representation(row));
      expect(before.requests.some(saved => saved.id === row.id)).toBe(false);
      reopen({ ...before, requests: [...before.requests, row].sort((a, b) => a.id < b.id ? -1 : 1) });
      return row;
    },
    async mutate(row: RequestRow, method: 'post' | 'put', suffix: string, body: object, actor: Identity, expected: RequestRow) {
      const before = snapshot();
      expect(before.requests.find(saved => saved.id === row.id)).toEqual(row);
      const response = await send(method, `/${row.id}${suffix}`, body, actor);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual(representation(expected));
      reopen({ ...before, requests: before.requests.map(saved => saved.id === row.id ? expected : saved) });
      return expected;
    },
  };
}

const fixtureCredentials = () => ({ owner: ctx.f.users.requesterA!, reviewerA: ctx.f.users.reviewerA!, reviewerB: ctx.f.users.reviewerB! });

describe('T053 real SQLite close/reopen durability (FR-013; SV-02/05)', () => {
  it('retains every committed creation, submission, revision and decision through complete connection restarts', async () => {
    const client = await durableClient(ctx.f, fixtureCredentials());
    let row = await client.create();
    row = await client.mutate(row, 'post', '/submit', { version: row.version }, 'owner', { ...row, status: 'PendingReview', version: 2 });
    const c1 = ' \u00a0First durable feedback \u{1f600}\ufeff ';
    row = await client.mutate(row, 'post', '/request-changes', { version: row.version, comment: c1 }, 'reviewerA',
      { ...row, status: 'ChangesRequested', version: 3, reviewer_comment: c1 });
    row = await client.mutate(row, 'put', '', { ...PROPOSAL, title: 'First durable revision', version: row.version }, 'owner',
      { ...row, title: 'First durable revision', version: 4 });
    row = await client.mutate(row, 'post', '/submit', { version: row.version }, 'owner', { ...row, status: 'PendingReview', version: 5 });
    const c2 = '\tLatest durable feedback e\u0301\n';
    row = await client.mutate(row, 'post', '/request-changes', { version: row.version, comment: c2 }, 'reviewerB',
      { ...row, status: 'ChangesRequested', version: 6, reviewer_comment: c2 });
    row = await client.mutate(row, 'put', '', { ...PROPOSAL, title: 'Final durable revision', version: row.version }, 'owner',
      { ...row, ...PROPOSAL, title: 'Final durable revision', version: 7 });
    row = await client.mutate(row, 'post', '/submit', { version: row.version }, 'owner', { ...row, status: 'PendingReview', version: 8 });
    row = await client.mutate(row, 'post', '/approve', { version: row.version }, 'reviewerA', { ...row, status: 'Approved', version: 9 });
    const before = client.snapshot();
    const ownerRead = await client.send('get', `/${row.id}`);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body).toEqual(representation(row));
    expect(client.snapshot()).toEqual(before);
    const reviewerRead = await client.send('get', `/${row.id}`, undefined, 'reviewerA');
    expect(reviewerRead.status).toBe(403);
    expect(reviewerRead.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
    expect(client.snapshot()).toEqual(before);
    client.reopen(before, true);
  }, 30000);

  it('retains the complete newer row after stale and invalid writes, including after reopening', async () => {
    const client = await durableClient(ctx.f, fixtureCredentials());
    const original = ctx.f.requests.ChangesRequested!;
    const row = await client.mutate(original, 'put', '', { ...PROPOSAL, version: original.version }, 'owner',
      { ...original, ...PROPOSAL, version: 2 });
    const before = client.snapshot();
    for (const [body, status, code] of [
      [{ ...PROPOSAL, title: 'Stale overwrite attempt', version: 1 }, 409, 'VERSION_CONFLICT'],
      [{ ...PROPOSAL, title: '  ', version: 2 }, 422, 'VALIDATION_FAILED'],
    ] as const) {
      const response = await client.send('put', `/${row.id}`, body);
      expect(response.status).toBe(status);
      expect(response.body).toEqual({ error: { code, message: expect.any(String),
        ...(status === 422 ? { fields: [{ field: 'title', reason: 'required' }] } : {}) } });
      expect(response.headers['cache-control']).toBe('no-store');
      client.reopen(before);
    }
  });

  it('repeated file/schema initialization preserves all four states, users, roles, hashes, versions and schema metadata', async () => {
    const client = await durableClient(ctx.f, fixtureCredentials());
    const before = client.snapshot();
    expect(new Set(before.requests.map(row => row.status)).size).toBe(4);
    client.reopen(before, true);
    client.reopen(before, true);
    const response = await client.send('get', '/mine');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: before.requests.map(representation) });
    expect(client.snapshot()).toEqual(before);
  });

  it('real demo seed reruns preserve HTTP-created work, hashes/passwords, revoked roles and disabled state after initialization/reopen', async () => {
    const f = await createDatabaseFixture({ seed: false });
    try {
      const generated = await seedDemoUsers(f.db);
      expect(generated).toHaveLength(5);
      const credential = (username: string) => generated.find(user => user.username === username)!;
      const client = await durableClient(f, { owner: credential('requester-a'), reviewerA: credential('reviewer-a'), reviewerB: credential('reviewer-b') });
      let row = await client.create();
      row = await client.mutate(row, 'post', '/submit', { version: row.version }, 'owner', { ...row, status: 'PendingReview', version: 2 });
      row = await client.mutate(row, 'post', '/request-changes', { version: row.version, comment: 'Durable seed feedback.' }, 'reviewerA',
        { ...row, status: 'ChangesRequested', version: 3, reviewer_comment: 'Durable seed feedback.' });
      row = await client.mutate(row, 'put', '', { ...PROPOSAL, reason: 'Seed must preserve this revision.', version: row.version }, 'owner',
        { ...row, reason: 'Seed must preserve this revision.', version: 4 });
      row = await client.mutate(row, 'post', '/submit', { version: row.version }, 'owner', { ...row, status: 'PendingReview', version: 5 });
      row = await client.mutate(row, 'post', '/approve', { version: row.version }, 'reviewerB', { ...row, status: 'Approved', version: 6 });
      const maintenance = f.openConnection();
      try {
        writeTransaction(maintenance, () => {
          maintenance.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(row.requester_id, 'Requester');
          maintenance.prepare("DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE username = ?) AND role = ?").run('reviewer-a', 'Reviewer');
          maintenance.prepare('UPDATE users SET active = 0 WHERE username = ?').run('requester-b');
        });
      } finally { maintenance.close(); }
      const before = client.snapshot();
      expect(await seedDemoUsers(client.db)).toEqual([]);
      expect(client.snapshot()).toEqual(before);
      client.reopen(before, true);
      expect(await seedDemoUsers(client.db)).toEqual([]);
      expect(client.snapshot()).toEqual(before);
      client.reopen(before, true);
      // Original generated passwords still authenticate. Roles are not restored,
      // and a disabled account stays disabled. Never print generated credentials.
      for (const username of ['requester-a', 'reviewer-a', 'reviewer-b', 'dual-role', 'requester-b']) {
        const response = await request(client.app).post('/api/auth/login').send(credential(username));
        expect(response.status).toBe(username === 'requester-b' ? 401 : 200);
        expect(response.headers['cache-control']).toBe('no-store');
        if (username === 'requester-b') expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        expect(client.snapshot()).toEqual(before);
      }
      for (const [actor, suffix] of [['owner', `/${row.id}`], ['reviewerA', '/pending-review']] as const) {
        const response = await client.send('get', suffix, undefined, actor);
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: { code: 'FORBIDDEN', message: expect.any(String) } });
        expect(client.snapshot()).toEqual(before);
      }
    } finally { f.cleanup(); }
  }, 60000);
});
