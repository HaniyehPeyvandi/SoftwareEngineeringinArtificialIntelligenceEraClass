import type { RequestHandler } from 'express';
import type { Config } from '../config.js';
import { verifyToken } from '../business/auth.js';
import { BusinessError } from '../business/rules.js';

export function bearerAuthentication(config: Config): RequestHandler {
  return async (req, res, next) => {
    try {
      const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(req.get('authorization') ?? '');
      if (!match?.[1]) throw new BusinessError('UNAUTHENTICATED');
      res.locals.subject = await verifyToken(match[1], config);
      next();
    } catch (error) { next(error); }
  };
}
