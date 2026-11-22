import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly jwtSecret: Uint8Array;
  readonly jwtIssuer: 'changeflow';
  readonly jwtAudience: 'changeflow-api';
  readonly jwtLifetimeSeconds: 900;
}

export class ConfigurationError extends Error {
  constructor(field: string) {
    super(`Invalid configuration: ${field}.`);
    this.name = 'ConfigurationError';
  }
}

// Explicit invocation, with no import-time environment reads or filesystem writes.
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const host = env.HOST ?? '127.0.0.1';
  if (host !== 'localhost' && isIP(host) === 0) throw new ConfigurationError('HOST');

  const portText = env.PORT ?? '3000';
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigurationError('PORT');
  }

  const path = env.DATABASE_PATH ?? './data/changeflow.sqlite';
  // Require a local file, not an ephemeral database, SQLite URI, or network share.
  if (path.trim() === '' || path.includes('\0') || path === ':memory:' ||
      /^[\\/]{2}/.test(path) || /^file:/i.test(path) ||
      (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) ||
      /[\\/]$/.test(path)) {
    throw new ConfigurationError('DATABASE_PATH');
  }
  const databasePath = isAbsolute(path) ? path : resolve(path);
  if (existsSync(databasePath) && !statSync(databasePath).isFile()) {
    throw new ConfigurationError('DATABASE_PATH');
  }

  const encoded = env.JWT_SECRET_BASE64;
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new ConfigurationError('JWT_SECRET_BASE64');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length < 32 || key.toString('base64') !== encoded) {
    throw new ConfigurationError('JWT_SECRET_BASE64');
  }

  return {
    host, port, databasePath, jwtSecret: new Uint8Array(key),
    jwtIssuer: 'changeflow', jwtAudience: 'changeflow-api', jwtLifetimeSeconds: 900,
  };
}
