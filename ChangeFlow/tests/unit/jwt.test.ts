import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { SignJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { issueToken, verifyToken } from '../../src/business/auth.js';
import { bearerAuthentication } from '../../src/http/auth.js';
import { errorHandler } from '../../src/http/errors.js';

const config = loadConfig({ JWT_SECRET_BASE64: randomBytes(64).toString('base64') });
const subject = randomUUID();
const now = () => Math.floor(Date.now() / 1000);
function claims(): Record<string, unknown> {
  return { iss: 'changeflow', aud: 'changeflow-api', sub: subject, iat: now(), exp: now() + 900 };
}
async function signed(payload: Record<string, unknown>, algorithm = 'HS256', key = config.jwtSecret) {
  return new SignJWT(payload).setProtectedHeader({ alg: algorithm }).sign(key);
}
function middlewareApp() {
  const app = express();
  app.get('/test-only', bearerAuthentication(config), (_req, res) => res.json(res.locals));
  app.use(errorHandler);
  return app;
}

describe('T010/T013 JWT identity contract (test-only handler)', () => {
  it('issues a 15-minute HS256 token with identity claims only', async () => {
    const result = await issueToken(subject, config);
    expect(result).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    const payload = decodeJwt(result.accessToken);
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
    expect(payload.exp! - payload.iat!).toBe(900);
    expect(await verifyToken(result.accessToken, config)).toBe(subject);
  });

  it.each(['iss', 'aud', 'sub', 'iat', 'exp'])('requires %s', async field => {
    const payload = claims();
    delete payload[field];
    await expect(verifyToken(await signed(payload), config)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it.each([
    { iss: 'other' }, { aud: 'other' }, { sub: 'not-a-uuid' },
    { iat: now() + 60, exp: now() + 960 }, { iat: now() - 1000, exp: now() - 100 },
    { exp: now() + 3600 }, { iat: now() + 0.5 },
  ])('rejects invalid or expired claims: %#', async overrides => {
    await expect(verifyToken(await signed({ ...claims(), ...overrides }), config))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects foreign signatures, other algorithms, and unsigned/malformed tokens', async () => {
    for (const token of [await signed(claims(), 'HS256', randomBytes(64)), await signed(claims(), 'HS384'),
      'eyJhbGciOiJub25lIn0.eyJzdWIiOiJmb3JnZWQifQ.', 'not-a-token']) {
      await expect(verifyToken(token, config)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('middleware exposes subject only, ignoring even signed role/owner claims', async () => {
    const token = await signed({ ...claims(), roles: ['Reviewer'], requesterId: 'somebody' });
    const response = await request(middlewareApp()).get('/test-only').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ subject });
  });

  it.each([undefined, 'Basic x', 'Bearer', 'Bearer invalid', 'Bearer a.b.c extra'])('rejects bad bearer headers: %#', async header => {
    const pending = request(middlewareApp()).get('/test-only');
    if (header) pending.set('Authorization', header);
    const response = await pending;
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
