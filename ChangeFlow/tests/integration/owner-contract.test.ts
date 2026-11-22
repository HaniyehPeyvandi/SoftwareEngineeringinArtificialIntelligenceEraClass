import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE, ownerContext, PROPOSAL, representation } from '../support/owner.js';

const ctx = ownerContext();
const contract = JSON.parse(readFileSync('specs/001-change-request-workflow/contracts/openapi.json', 'utf8'));

describe('T017 owner HTTP contract', () => {
  it('exposes the exact CreateBody/EditBody/VersionBody fields from OpenAPI', () => {
    for (const [schema, fields] of [
      ['CreateBody', ['title', 'description', 'reason']],
      ['EditBody', ['title', 'description', 'reason', 'version']], ['VersionBody', ['version']],
    ] as const) {
      expect(contract.components.schemas[schema].additionalProperties).toBe(false);
      expect(contract.components.schemas[schema].required.sort()).toEqual([...fields].sort());
    }
  });

  it('Create returns the exact response fields, JSON/no-store headers, and Location', async () => {
    const before = ctx.f.snapshot();
    const response = await ctx.http('post', '', PROPOSAL);
    const saved = ctx.f.snapshot();
    expect(response.status).toBe(201);
    expect(Object.keys(response.body).sort()).toEqual(Object.keys(contract.components.schemas.ChangeRequest.properties).sort());
    expect(response.headers.location).toBe(`${BASE}/${response.body.id}`);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(saved.requests).toHaveLength(before.requests.length + 1);
    expect(response.body).toEqual(representation(saved.requests.find(row => row.id === response.body.id)!));
  });

  it('GET /mine returns only the owner rows, all statuses, sorted by ID (AS-16)', async () => {
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', '/mine');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ items: before.requests.filter(row => row.requester_id === ctx.f.users.requesterA!.id).map(representation) });
  });

  it('GET /mine returns an empty items array for an owner with no requests', async () => {
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', '/mine', undefined, 'requesterB');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it.each(['Draft', 'PendingReview', 'ChangesRequested', 'Approved'] as const)('GET owner ID in %s returns its exact current fields/comment', async status => {
    const row = ctx.f.requests[status]!;
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', `/${row.id}`);
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(row));
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each(['Draft', 'ChangesRequested'] as const)('PUT %s replaces proposal only and increments Version once (AS-02/14)', async status => {
    const row = ctx.f.requests[status]!;
    const before = ctx.f.snapshot();
    const response = await ctx.http('put', `/${row.id}`, { ...PROPOSAL, version: row.version });
    const saved = ctx.f.snapshot();
    const expected = { ...row, ...PROPOSAL, version: row.version + 1 };
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(expected));
    expect(response.headers['cache-control']).toBe('no-store');
    expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
  });

  it('Submit ChangesRequested retains the saved comment and proposal (AS-15)', async () => {
    const row = ctx.f.requests.ChangesRequested!;
    const before = ctx.f.snapshot();
    const response = await ctx.http('post', `/${row.id}/submit`, { version: row.version });
    const expected = { ...row, status: 'PendingReview' as const, version: row.version + 1 };
    const saved = ctx.f.snapshot();
    expect(response.status).toBe(200);
    expect(response.body).toEqual(representation(expected));
    expect(saved).toEqual({ ...before, requests: before.requests.map(old => old.id === row.id ? expected : old) });
  });

  it.each([
    ['create missing reason', 'post', '', { title: 'T', description: 'D' }],
    ['create unknown key', 'post', '', { ...PROPOSAL, extra: 'x' }],
    ['create supplied Version', 'post', '', { ...PROPOSAL, version: 1 }],
    ['edit incomplete', 'put', 'edit', { title: 'T', version: 1 }],
    ['edit unknown key', 'put', 'edit', { ...PROPOSAL, version: 1, extra: 'x' }],
    ['submit extra content', 'post', 'submit', { version: 1, title: 'T' }],
  ] as const)('rejects strict body: %s', async (_name, method, action, body) => {
    const row = ctx.f.requests.Draft!;
    const suffix = action === 'edit' ? `/${row.id}` : action === 'submit' ? `/${row.id}/submit` : '';
    const before = ctx.f.snapshot();
    const response = await ctx.http(method, suffix, body);
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  for (const operation of ['edit', 'submit'] as const) {
    it.each([undefined, null, '1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, true])
    (`${operation} rejects missing/nonpositive/fractional/unsafe/wrong-type Version: %#`, async version => {
      const row = ctx.f.requests.Draft!;
      const body = { ...(operation === 'edit' ? PROPOSAL : {}), ...(version === undefined ? {} : { version }) };
      const before = ctx.f.snapshot();
      const response = await ctx.http(operation === 'edit' ? 'put' : 'post', `/${row.id}${operation === 'submit' ? '/submit' : ''}`, body);
      expect(ctx.f.snapshot()).toEqual(before);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_REQUEST');
    });
  }

  it.each(['get', 'put', 'submit'] as const)('%s rejects a malformed UUID before resource lookup', async action => {
    const before = ctx.f.snapshot();
    const response = await ctx.http(action === 'submit' ? 'post' : action, `/invalid-id${action === 'submit' ? '/submit' : ''}`,
      action === 'get' ? undefined : { ...(action === 'put' ? PROPOSAL : {}), version: 1 });
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
  });

  it('rejects malformed percent encoding in the request ID as a safe 400 response', async () => {
    const before = ctx.f.snapshot();
    const response = await ctx.http('get', '/%');
    expect(ctx.f.snapshot()).toEqual(before);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_REQUEST');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.text).not.toMatch(/URIError|decodeURIComponent|stack/);
  });

  it('rejects non-JSON bodies, malformed JSON, and oversize bodies with distinguishable safe errors', async () => {
    const before = ctx.f.snapshot();
    const media = await ctx.http('post').type('text').send('invalid');
    const malformed = await ctx.http('post').set('Content-Type', 'application/json').send('{');
    const large = await ctx.http('post', '', { ...PROPOSAL, title: 'x'.repeat(131073) });
    expect(ctx.f.snapshot()).toEqual(before);
    for (const [response, status, code] of [[media, 415, 'UNSUPPORTED_MEDIA_TYPE'], [malformed, 400, 'INVALID_REQUEST'],
      [large, 413, 'PAYLOAD_TOO_LARGE']] as const) {
      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(Object.keys(response.body)).toEqual(['error']);
    }
  });
});
