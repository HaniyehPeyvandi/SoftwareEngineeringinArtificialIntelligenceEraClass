import type { ErrorRequestHandler } from 'express';
import { BusinessError } from '../business/rules.js';
import type { ErrorCode } from '../business/rules.js';
import { translateStorageError } from '../persistence/store.js';

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400, UNAUTHENTICATED: 401, INVALID_CREDENTIALS: 401, FORBIDDEN: 403,
  NOT_FOUND: 404, VERSION_CONFLICT: 409, INVALID_STATUS: 409, PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415, VALIDATION_FAILED: 422, STORAGE_BUSY: 503,
  STORAGE_UNAVAILABLE: 503, INTERNAL_ERROR: 500,
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  let safe: BusinessError;
  if (error instanceof BusinessError) safe = error;
  else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    safe = new BusinessError('PAYLOAD_TOO_LARGE');
  } else if (error instanceof URIError) {
    safe = new BusinessError('INVALID_REQUEST');
  } else if (error instanceof Error && 'type' in error &&
      ['entity.parse.failed', 'request.aborted', 'request.size.invalid'].includes(String(error.type))) {
    safe = new BusinessError('INVALID_REQUEST');
  } else if (error instanceof Error && 'type' in error &&
      ['charset.unsupported', 'encoding.unsupported'].includes(String(error.type))) {
    safe = new BusinessError('UNSUPPORTED_MEDIA_TYPE');
  } else safe = translateStorageError(error);
  res.set('Cache-Control', 'no-store');
  if (safe.code === 'UNAUTHENTICATED') res.set('WWW-Authenticate', 'Bearer');
  res.status(STATUS[safe.code]).json({ error: {
    code: safe.code, message: safe.message, ...(safe.fields ? { fields: safe.fields } : {}),
  } });
};
