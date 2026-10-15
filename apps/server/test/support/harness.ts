import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { Redis } from 'ioredis';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { createDb, migrateToLatest, type Db } from '../../src/db/database.js';
import { KeyRing } from '../../src/lib/crypto.js';
import { RedisLimiter } from '../../src/lib/limiter.js';
import { RedisKvCache } from '../../src/lib/kv-cache.js';
import { Storage, storageConfigFromEnv } from '../../src/lib/storage.js';
import { createMediaQueue } from '../../src/queue.js';
import { RedisScreenEvents } from '../../src/lib/screen-events.js';
import { startMediaWorker } from '../../src/worker/worker.js';
import { MemoryMailer } from '../../src/lib/mail/mailer.js';
import { hashPassword } from '../../src/lib/password.js';
import { base32Decode, totp } from '../../src/lib/totp.js';

/** Integration tests need real PostgreSQL + Valkey/Redis (see CONTRIBUTING.md). */
export const integrationEnabled = process.env.RUBINNY_INTEGRATION === '1';

export const PUBLIC_URL = 'http://localhost:3000';

export interface Harness {
  app: FastifyInstance;
  db: Db;
  env: Env;
  mailer: MemoryMailer;
  redis: Redis;
  events: RedisScreenEvents;
  storage?: Storage;
  close(): Promise<void>;
}

/** Media integration tests also need SeaweedFS/S3 and ClamAV (see CONTRIBUTING.md). */
export const mediaIntegrationEnabled =
  integrationEnabled &&
  process.env.RUBINNY_MEDIA_INTEGRATION === '1' &&
  Boolean(process.env.S3_ENDPOINT);

export async function createHarness(
  envOverrides: Record<string, string> = {},
  options: { media?: boolean } = {},
): Promise<Harness> {
  const suffix = randomBytes(6).toString('hex');
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    PUBLIC_URL,
    ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    MAIL_TRANSPORT: 'console',
    // Shared test buckets: objects are already namespaced by (unique) organization id.
    S3_BUCKET_QUARANTINE: 'rubinny-test-quarantine',
    S3_BUCKET_MEDIA: 'rubinny-test-media',
    ...envOverrides,
  });
  const schema = `test_${suffix}`;
  const admin = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 5,
    options: `-c search_path=${schema}`,
  });
  const db = createDb(pool);
  await migrateToLatest(db);

  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  const mailer = new MemoryMailer();

  const storageConfig = options.media ? storageConfigFromEnv(env) : null;
  const storage = storageConfig ? new Storage(storageConfig) : undefined;
  if (storage) await storage.ensureBuckets();
  const queuePrefix = `bull-${schema}`;
  const queue = storage ? createMediaQueue(env.REDIS_URL, queuePrefix) : undefined;
  /* eslint-disable no-console -- opt-in worker logs while debugging tests */
  const silent = process.env.TEST_WORKER_LOGS
    ? { info: console.info, warn: console.warn, error: console.error }
    : { info: () => undefined, warn: () => undefined, error: () => undefined };
  /* eslint-enable no-console */
  const worker = storage
    ? startMediaWorker(
        { db, storage, clamav: { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT }, log: silent },
        { redisUrl: env.REDIS_URL, concurrency: 2, prefix: queuePrefix },
      )
    : undefined;

  const subscriber = redis.duplicate();
  const events = new RedisScreenEvents(redis, subscriber, `rubinny:screen-events:${schema}`);
  await events.start();

  const app = await buildApp({
    env,
    logger: false,
    services: {
      db,
      keys: new KeyRing(env.ENCRYPTION_KEY),
      mailer,
      limiter: new RedisLimiter(redis, `rubinny:test:${schema}:`),
      cache: new RedisKvCache(redis, `rubinny:test:${schema}:cache:`),
      events,
      ...(storage && queue ? { media: { storage, queue } } : {}),
    },
  });

  return {
    app,
    db,
    env,
    mailer,
    redis,
    events,
    ...(storage ? { storage } : {}),
    async close() {
      await app.close();
      await events.close();
      await subscriber.quit();
      await worker?.close();
      await queue?.close();
      const bullKeys = await redis.keys(`${queuePrefix}:*`);
      if (bullKeys.length > 0) await redis.del(...bullKeys);
      const keys = await redis.keys(`rubinny:test:${schema}:*`);
      if (keys.length > 0) await redis.del(...keys);
      await redis.quit();
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A cookie-keeping API client, like a browser tab. */
export class Client {
  cookie: string | undefined;

  constructor(
    private readonly app: FastifyInstance,
    private readonly remoteAddress = '127.0.0.1',
  ) {}

  async request(
    method: Method,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({
      method,
      url,
      remoteAddress: this.remoteAddress,
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      ...(body !== undefined ? { payload: body as object } : {}),
    });
    const session = res.cookies.find((c) => c.name === 'rubinny_session');
    if (session) this.cookie = session.value ? `rubinny_session=${session.value}` : undefined;
    return res;
  }

  /** multipart/form-data upload with a single "file" field. */
  async upload(
    url: string,
    filename: string,
    data: Buffer,
    contentType = 'application/octet-stream',
  ) {
    const boundary = `----rubinny${randomBytes(8).toString('hex')}`;
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return this.app.inject({
      method: 'POST',
      url,
      remoteAddress: this.remoteAddress,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(payload.length),
      },
      payload,
    });
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, body?: unknown) => this.request('POST', url, body ?? {});
  put = (url: string, body?: unknown) => this.request('PUT', url, body ?? {});
  patch = (url: string, body?: unknown) => this.request('PATCH', url, body ?? {});
  delete = (url: string, body?: unknown) => this.request('DELETE', url, body);
}

export const STRONG_PASSWORD = 'correct horse battery staple';

let cachedHash: Promise<string> | undefined;

/** Inserts a verified user directly (fast path for tests that are not about registration). */
export async function insertUser(
  db: Db,
  email: string,
  options: { verified?: boolean; name?: string } = {},
): Promise<string> {
  cachedHash ??= hashPassword(STRONG_PASSWORD);
  const row = await db
    .insertInto('users')
    .values({
      email,
      name: options.name ?? email.split('@')[0] ?? 'user',
      password_hash: await cachedHash,
      email_verified_at: options.verified === false ? null : new Date(),
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function insertOrg(
  db: Db,
  ownerId: string,
  name = 'Org',
  requireAdminMfa = true,
): Promise<string> {
  const org = await db
    .insertInto('organizations')
    .values({ name, require_admin_mfa: requireAdminMfa })
    .returning('id')
    .executeTakeFirstOrThrow();
  await db
    .insertInto('memberships')
    .values({ org_id: org.id, user_id: ownerId, role: 'OWNER' })
    .execute();
  return org.id;
}

export async function login(app: FastifyInstance, email: string, ip?: string): Promise<Client> {
  const client = new Client(app, ip);
  const res = await client.post('/api/v1/auth/login', { email, password: STRONG_PASSWORD });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return client;
}

/** Extracts the token from the latest email's link fragment. */
export function tokenFromMail(mailer: MemoryMailer, to: string): string {
  const mail = mailer.lastTo(to);
  const match = mail?.text.match(/#token=([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error(`no token mail for ${to}`);
  return match[1];
}

export function currentCode(secretBase32: string, offsetMs = 0): string {
  return totp(base32Decode(secretBase32), Date.now() + offsetMs);
}

/** Enables MFA through the API for a logged-in client; returns the secret and recovery codes. */
export async function enableMfa(client: Client) {
  const setup = await client.post('/api/v1/auth/mfa/totp/setup', { password: STRONG_PASSWORD });
  const { secret } = setup.json<{ secret: string }>();
  const enabled = await client.post('/api/v1/auth/mfa/totp/enable', { code: currentCode(secret) });
  if (enabled.statusCode !== 200) throw new Error(`enable mfa failed: ${enabled.body}`);
  return { secret, recoveryCodes: enabled.json<{ recoveryCodes: string[] }>().recoveryCodes };
}
