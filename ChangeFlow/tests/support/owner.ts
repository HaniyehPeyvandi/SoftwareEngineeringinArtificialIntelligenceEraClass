import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { issueToken } from '../../src/business/auth.js';
import { writeTransaction } from '../../src/persistence/database.js';
import { createDatabaseFixture } from './database.js';
import type { DatabaseSnapshot, RequestRow } from './database.js';

type Fixture = Awaited<ReturnType<typeof createDatabaseFixture>>;
export type Actor = 'requesterA' | 'requesterB' | 'reviewerA' | 'reviewerB' | 'dualRole' | 'noRole' | 'disabled' | 'anonymous';
export const PROPOSAL = { title: 'Upgrade the shared service', description: 'Schedule a controlled change.', reason: 'Improve reliability.' };
export const BASE = '/api/change-requests';

export function representation(row: RequestRow) {
  return { id: row.id, title: row.title, description: row.description, reason: row.reason,
    requesterId: row.requester_id, status: row.status, version: row.version, reviewerComment: row.reviewer_comment };
}

// Test infrastructure only. Each HTTP test receives a new real file. The private
// template supplies already-hashed users; requests are copied by committed INSERTs,
// never by a rollback that could conceal whether application writes committed.
export function ownerContext() {
  let template: Fixture;
  let baseline: DatabaseSnapshot;
  let f: Fixture;
  let app: Express;
  const tokens: Partial<Record<Actor, string>> = {};
  const config = loadConfig({ JWT_SECRET_BASE64: randomBytes(32).toString('base64') });

  beforeAll(async () => {
    template = await createDatabaseFixture();
    baseline = template.snapshot();
    const loginApp = createApp({ ...config, databasePath: template.databasePath }, template.db);
    for (const [name, user] of Object.entries(template.users)) {
      if (!user.active) tokens[name as Actor] = (await issueToken(user.id, config)).accessToken;
      else {
        const response = await request(loginApp).post('/api/auth/login').send({ username: user.username, password: user.password });
        expect(response.status, 'Owner fixture login must succeed before behavioral tests execute.').toBe(200);
        tokens[name as Actor] = response.body.accessToken as string;
      }
    }
  }, 60000);

  beforeEach(async () => {
    f = await createDatabaseFixture({ seed: false });
    writeTransaction(f.db, () => {
      const insertUser = f.db.prepare('INSERT INTO users VALUES (@id, @username, @password_hash, @active)');
      const insertRole = f.db.prepare('INSERT INTO user_roles VALUES (@user_id, @role)');
      const insertRequest = f.db.prepare(`INSERT INTO change_requests VALUES
        (@id, @title, @description, @reason, @requester_id, @status, @version, @reviewer_comment)`);
      for (const row of baseline.users) insertUser.run(row);
      for (const row of baseline.roles) insertRole.run(row);
      for (const row of baseline.requests) insertRequest.run(row);
    });
    Object.assign(f.users, template.users);
    for (const [status, row] of Object.entries(template.requests)) Object.assign(f.requests, { [status]: { ...row } });
    app = createApp({ ...config, databasePath: f.databasePath }, f.db);
  });
  afterEach(() => f?.cleanup());
  afterAll(() => template?.cleanup());

  return {
    get f() { return f; },
    get app() { return app; },
    token: (actor: Exclude<Actor, 'anonymous'>) => tokens[actor]!,
    http(method: 'get' | 'post' | 'put', suffix = '', body?: string | object, actor: Actor = 'requesterA') {
      const pending = request(app)[method](BASE + suffix);
      if (actor !== 'anonymous') pending.set('Authorization', `Bearer ${tokens[actor]}`);
      if (body !== undefined) pending.send(body);
      return pending;
    },
  };
}
