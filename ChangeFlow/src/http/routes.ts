import express from 'express';
import type { Express, RequestHandler } from 'express';
import type { createAuthService } from '../business/auth.js';
import type { createChangeRequestService } from '../business/change-requests.js';
import { BusinessError } from '../business/rules.js';
import type { Proposal } from '../business/rules.js';
import { isValidUnicode } from '../business/text.js';

export function jsonBodyHandlers(): RequestHandler[] {
  return [
    (req, _res, next) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
        next(new BusinessError('UNSUPPORTED_MEDIA_TYPE'));
      } else next();
    },
    express.json({ limit: '128kb', strict: true }),
    (req, _res, next) => {
      if (!isValidUnicode(req.body)) next(new BusinessError('INVALID_REQUEST'));
      else next();
    },
  ];
}

function exactBody(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) {
    throw new BusinessError('INVALID_REQUEST');
  }
  return value as Record<string, unknown>;
}

function proposalShape(body: Record<string, unknown>): Proposal {
  if (typeof body.title !== 'string' || typeof body.description !== 'string' || typeof body.reason !== 'string') {
    throw new BusinessError('INVALID_REQUEST');
  }
  return { title: body.title, description: body.description, reason: body.reason };
}

function requestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BusinessError('INVALID_REQUEST');
  }
  return value;
}

function requestVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new BusinessError('INVALID_REQUEST');
  return value;
}

export function mountOwnerRoutes(app: Express, service: ReturnType<typeof createChangeRequestService>): void {
  const base = '/api/change-requests';
  app.post(base, (req, res) => {
    const body = exactBody(req.body, ['title', 'description', 'reason']);
    const saved = service.create(res.locals.subject as string, proposalShape(body));
    res.location(`${base}/${saved.id}`).status(201).json(saved);
  });
  // Static list route must precede the UUID parameter route.
  app.get(`${base}/mine`, (_req, res) => res.json(service.listOwn(res.locals.subject as string)));
  app.get(`${base}/pending-review`, (_req, res) => res.json(service.listPendingReview(res.locals.subject as string)));
  app.get(`${base}/:id`, (req, res) => res.json(service.readRequest(res.locals.subject as string, requestId(req.params.id))));
  app.put(`${base}/:id`, (req, res) => {
    const id = requestId(req.params.id);
    const body = exactBody(req.body, ['title', 'description', 'reason', 'version']);
    res.json(service.edit(res.locals.subject as string, id, requestVersion(body.version), proposalShape(body)));
  });
  app.post(`${base}/:id/submit`, (req, res) => {
    const id = requestId(req.params.id);
    const body = exactBody(req.body, ['version']);
    res.json(service.submit(res.locals.subject as string, id, requestVersion(body.version)));
  });
  app.post(`${base}/:id/approve`, (req, res) => {
    const id = requestId(req.params.id);
    const body = exactBody(req.body, ['version']);
    res.json(service.approve(res.locals.subject as string, id, requestVersion(body.version)));
  });
  app.post(`${base}/:id/request-changes`, (req, res) => {
    const id = requestId(req.params.id);
    const body = exactBody(req.body, ['version', 'comment']);
    if (typeof body.comment !== 'string') throw new BusinessError('INVALID_REQUEST');
    res.json(service.requestChanges(res.locals.subject as string, id, requestVersion(body.version), body.comment));
  });
}

export function mountLoginRoute(app: Express, auth: ReturnType<typeof createAuthService>): void {
  app.post('/api/auth/login', ...jsonBodyHandlers(), async (req, res) => {
    const body: unknown = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 2 || !('username' in body) || !('password' in body) ||
        typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new BusinessError('INVALID_REQUEST');
    }
    res.json(await auth.login(body.username, body.password));
  });
}
