import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from '../config.js';
import { readTransaction } from '../persistence/database.js';
import type { SqliteDatabase } from '../persistence/database.js';
import { createStore, withStorageErrors } from '../persistence/store.js';
import { BusinessError } from './rules.js';
import type { CurrentIdentity, Role } from './rules.js';

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 } as const;
const dummySalt = randomBytes(16);
const dummyKey = randomBytes(64);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((accept, reject) => {
    scrypt(password, salt, 64, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else accept(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return ['scrypt', '32768', '8', '3', salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, record?: string): Promise<boolean> {
  const parts = record?.split('$');
  const salt = Buffer.from(parts?.[4] ?? '', 'base64');
  const expected = Buffer.from(parts?.[5] ?? '', 'base64');
  const valid = parts?.length === 6 && parts[0] === 'scrypt' && parts[1] === '32768' &&
    parts[2] === '8' && parts[3] === '3' && salt.length >= 16 && expected.length === 64 &&
    salt.toString('base64') === parts[4] && expected.toString('base64') === parts[5];
  // Always perform the same bounded derivation, including absent/corrupt records.
  // Stored work factors cannot cause arbitrary memory/CPU allocations.
  const candidate = await derive(password, valid ? salt : dummySalt);
  const matches = timingSafeEqual(candidate, valid ? expected : dummyKey);
  return Boolean(valid && matches);
}

export async function issueToken(subject: string, config: Config) {
  if (!UUID.test(subject)) throw new BusinessError('INTERNAL_ERROR');
  const issuedAt = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(config.jwtIssuer).setAudience(config.jwtAudience).setSubject(subject)
    .setIssuedAt(issuedAt).setExpirationTime(issuedAt + config.jwtLifetimeSeconds)
    .sign(config.jwtSecret);
  return { accessToken, tokenType: 'Bearer' as const, expiresIn: config.jwtLifetimeSeconds };
}

export async function verifyToken(token: string, config: Config): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, {
      algorithms: ['HS256'], issuer: config.jwtIssuer, audience: config.jwtAudience,
      requiredClaims: ['iss', 'aud', 'sub', 'iat', 'exp'], maxTokenAge: config.jwtLifetimeSeconds,
    });
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub) ||
        payload.aud !== config.jwtAudience || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
        payload.exp! - payload.iat! !== config.jwtLifetimeSeconds) throw new Error('Invalid claims');
    return payload.sub;
  } catch {
    throw new BusinessError('UNAUTHENTICATED');
  }
}

type IdentityStore = ReturnType<typeof createStore>;

// Must run inside the operation's existing transaction, alongside protected data
// access. The store enforces that scope and never caches role or active-state data.
export function requireCurrentIdentity(store: IdentityStore, subject: string, role?: Role): CurrentIdentity {
  const identity = store.findIdentityById(subject);
  if (!identity?.active) throw new BusinessError('UNAUTHENTICATED');
  if (role && !identity.roles.includes(role)) throw new BusinessError('FORBIDDEN');
  return identity;
}

export function createAuthService(config: Config, db: SqliteDatabase, store = createStore(db)) {
  return {
    async login(username: string, password: string) {
      const original = withStorageErrors(() => readTransaction(db, () => store.findUserByUsername(username)));
      const valid = await verifyPassword(password, original?.passwordHash);
      // Hashing is asynchronous and outside SQLite scope; recheck after it.
      const current = withStorageErrors(() => readTransaction(db, () => store.findUserByUsername(username)));
      if (!valid || !original?.active || !current?.active || current.id !== original.id ||
          current.passwordHash !== original.passwordHash) throw new BusinessError('INVALID_CREDENTIALS');
      return issueToken(current.id, config);
    },
  };
}
