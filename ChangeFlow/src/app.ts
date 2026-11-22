import express from 'express';
import type { Config } from './config.js';
import type { SqliteDatabase } from './persistence/database.js';
import { createAuthService } from './business/auth.js';
import { createChangeRequestService } from './business/change-requests.js';
import { createStore } from './persistence/store.js';
import { BusinessError } from './business/rules.js';
import { bearerAuthentication } from './http/auth.js';
import { errorHandler } from './http/errors.js';
import { jsonBodyHandlers, mountLoginRoute, mountOwnerRoutes } from './http/routes.js';

export function createApp(config: Config, db: SqliteDatabase) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const store = createStore(db);
  mountLoginRoute(app, createAuthService(config, db, store));
  app.use('/api', bearerAuthentication(config), ...jsonBodyHandlers());
  mountOwnerRoutes(app, createChangeRequestService(db, store));
  app.use((_req, _res, next) => next(new BusinessError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
