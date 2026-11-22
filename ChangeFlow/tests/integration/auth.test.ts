import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { createAuthService, requireCurrentIdentity, verifyToken } from '../../src/business/auth.js';
import { bearerAuthentication } from '../../src/http/auth.js';
import { errorHandler } from '../../src/http/errors.js';
import { readTransaction, writeTransaction } from '../../src/persistence/database.js';
import { createStore, withStorageErrors } from '../../src/persistence/store.js';
import { createDatabaseFixture } from '../support/database.js';

describe('T010/T015 authentication foundation over real SQLite', () => {
  let f: Awaited<ReturnType<typeof createDatabaseFixture>>;
  beforeAll(async () => { f = await createDatabaseFixture(); }, 15000);
  afterAll(() => f?.cleanup());
  const config = loadConfig({ JWT_SECRET_BASE64: randomBytes(32).toString('base64') });
  const app = () => createApp(config, f.db);
  const loginBody = () => ({ username: f.users.requesterA!.username, password: f.users.requesterA!.password });

  it('returns only the token contract and leaves persisted data unchanged', async () => {
    const before = f.snapshot();
    const response = await request(app()).post('/api/auth/login').send(loginBody());
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['accessToken', 'expiresIn', 'tokenType']);
    expect(response.body).toMatchObject({ expiresIn: 900, tokenType: 'Bearer' });
    expect(await verifyToken(response.body.accessToken, config)).toBe(f.users.requesterA!.id);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(f.snapshot()).toEqual(before);
  });

  it('uses indistinguishable wrong-password, unknown-user, and disabled-user errors', async () => {
    const before = f.snapshot();
    const bodies = [];
    for (const body of [{ ...loginBody(), password: 'incorrect' }, { username: 'absent', password: 'incorrect' },
      { username: f.users.disabled!.username, password: f.users.disabled!.password }]) {
      const response = await request(app()).post('/api/auth/login').send(body);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(response.body)).not.toMatch(/scrypt|password_hash|salt|SQLITE|JWT_SECRET/i);
      bodies.push(response.body);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect(bodies[1]).toEqual(bodies[2]);
    expect(f.snapshot()).toEqual(before);
  });

  it.each([{}, { username: 'only' }, { username: 1, password: 'x' },
    { username: 'x', password: 'x', roles: ['Reviewer'] }, { username: '\ud800', password: 'x' }])
  ('rejects invalid login shape/Unicode without changing SQLite: %#', async body => {
    const before = f.snapshot();
    const response = await request(app()).post('/api/auth/login').send(body);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
    expect(f.snapshot()).toEqual(before);
  });

  it('enforces malformed JSON, media type, envelope limit, and authentication-first ordering', async () => {
    const before = f.snapshot();
    const malformed = await request(app()).post('/api/auth/login').set('Content-Type', 'application/json').send('{');
    expect(malformed.status).toBe(400);
    const media = await request(app()).post('/api/auth/login').type('text').send('body');
    expect(media.status).toBe(415);
    const large = await request(app()).post('/api/auth/login').send({ username: 'x', password: 'x'.repeat(131073) });
    expect(large.status).toBe(413);
    const unauthenticated = await request(app()).post('/api/unimplemented').set('Content-Type', 'application/json').send('{');
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe('UNAUTHENTICATED');
    expect(f.snapshot()).toEqual(before);
  });

  it('checks current roles/active state from SQLite with an already issued token', async () => {
    const user = f.users.dualRole!;
    const store = createStore(f.db);
    const token = (await createAuthService(config, f.db, store).login(user.username, user.password)).accessToken;
    const harness = express();
    harness.get('/test-only', bearerAuthentication(config), (_req, res) => {
      withStorageErrors(() => readTransaction(f.db, () => requireCurrentIdentity(store, res.locals.subject as string, 'Reviewer')));
      res.json({ allowed: true });
    });
    harness.use(errorHandler);
    const get = () => request(harness).get('/test-only').set('Authorization', `Bearer ${token}`);
    expect((await get()).status).toBe(200);
    const maintenance = f.openConnection();
    try {
      writeTransaction(maintenance, () => maintenance.prepare('DELETE FROM user_roles WHERE user_id = ? AND role = ?').run(user.id, 'Reviewer'));
      const afterRevocation = f.snapshot();
      const denied = await get();
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
      expect(f.snapshot()).toEqual(afterRevocation);
      writeTransaction(maintenance, () => maintenance.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id));
      const afterDisable = f.snapshot();
      expect((await get()).status).toBe(401);
      expect(f.snapshot()).toEqual(afterDisable);
    } finally {
      writeTransaction(maintenance, () => {
        maintenance.prepare('UPDATE users SET active = 1 WHERE id = ?').run(user.id);
        maintenance.prepare('INSERT OR IGNORE INTO user_roles VALUES (?, ?)').run(user.id, 'Reviewer');
      });
    }
  });

  it('rechecks active state after asynchronous hashing without holding a transaction', async () => {
    const user = f.users.requesterB!;
    const pending = createAuthService(config, f.db).login(user.username, user.password);
    expect(f.db.inTransaction).toBe(false);
    const maintenance = f.openConnection();
    writeTransaction(maintenance, () => maintenance.prepare('UPDATE users SET active = 0 WHERE id = ?').run(user.id));
    const disabled = f.snapshot();
    try {
      await expect(pending).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(f.snapshot()).toEqual(disabled);
    } finally { maintenance.prepare('UPDATE users SET active = 1 WHERE id = ?').run(user.id); }
  });

  it('denies a deleted token subject and ignores signed role claims for a no-role identity', async () => {
    const { SignJWT } = await import('jose');
    const noRole = f.users.noRole!;
    const issuedAt = Math.floor(Date.now() / 1000);
    const claimed = await new SignJWT({ roles: ['Reviewer'] }).setProtectedHeader({ alg: 'HS256' })
      .setIssuer(config.jwtIssuer).setAudience(config.jwtAudience).setSubject(noRole.id)
      .setIssuedAt(issuedAt).setExpirationTime(issuedAt + 900).sign(config.jwtSecret);
    const store = createStore(f.db);
    const harness = express();
    harness.get('/test-only', bearerAuthentication(config), (_req, res) => {
      withStorageErrors(() => readTransaction(f.db, () => requireCurrentIdentity(store, res.locals.subject as string, 'Reviewer')));
      res.json({ allowed: true });
    });
    harness.use(errorHandler);
    const before = f.snapshot();
    const denied = await request(harness).get('/test-only').set('Authorization', `Bearer ${claimed}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect(f.snapshot()).toEqual(before);

    // Reviewer B has no owned fixture requests, so this maintenance deletion is legal.
    const user = f.users.reviewerB!;
    const token = (await createAuthService(config, f.db).login(user.username, user.password)).accessToken;
    const savedUser = before.users.find(row => row.id === user.id)!;
    f.db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    const deleted = f.snapshot();
    try {
      const response = await request(harness).get('/test-only').set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
      expect(f.snapshot()).toEqual(deleted);
    } finally {
      writeTransaction(f.db, () => {
        f.db.prepare('INSERT INTO users VALUES (?, ?, ?, ?)')
          .run(savedUser.id, savedUser.username, savedUser.password_hash, savedUser.active);
        f.db.prepare('INSERT INTO user_roles VALUES (?, ?)').run(user.id, 'Reviewer');
      });
    }
  });
});
