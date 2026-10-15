import type { Env } from './config/env.js';
import type { Db } from './db/database.js';
import type { KeyRing } from './lib/crypto.js';
import type { Limiter } from './lib/limiter.js';
import type { Mailer } from './lib/mail/mailer.js';
import type { ScreenEvents } from './lib/screen-events.js';
import type { Storage } from './lib/storage.js';
import type { MediaQueue } from './queue.js';

/** Shared services passed explicitly to route modules (no hidden globals). */
export interface AppContext {
  env: Env;
  db: Db;
  keys: KeyRing;
  mailer: Mailer;
  limiter: Limiter;
  /** Pushes events (manifest changes, reload) to connected players. */
  events: ScreenEvents;
  /** Present when object storage is configured; media routes are disabled otherwise. */
  media?: { storage: Storage; queue: MediaQueue };
}
