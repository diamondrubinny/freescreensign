import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';

/** Events pushed to connected players. */
export type ScreenEvent =
  | { type: 'manifest.changed' }
  | { type: 'reload' }
  | { type: 'revoked' }
  /** A wrapper with the "screenshot" capability uploads a screenshot for this request. */
  | { type: 'screenshot'; requestId: string };

export interface ScreenEvents {
  publish(screenId: string, event: ScreenEvent): Promise<void>;
  /** Registers the local delivery callback (one per server instance). */
  onEvent(handler: (screenId: string, event: ScreenEvent) => void): void;
  close(): Promise<void>;
}

/** Single-process implementation (development and unit tests). */
export class LocalScreenEvents implements ScreenEvents {
  readonly #emitter = new EventEmitter();

  publish(screenId: string, event: ScreenEvent): Promise<void> {
    this.#emitter.emit('event', screenId, event);
    return Promise.resolve();
  }

  onEvent(handler: (screenId: string, event: ScreenEvent) => void): void {
    this.#emitter.on('event', handler);
  }

  close(): Promise<void> {
    this.#emitter.removeAllListeners();
    return Promise.resolve();
  }
}

const EVENT_TYPES = new Set(['manifest.changed', 'reload', 'revoked', 'screenshot']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Only known events, with only their own fields, are delivered to players. */
function toScreenEvent(event: { type?: unknown; requestId?: unknown }): ScreenEvent | null {
  if (typeof event.type !== 'string' || !EVENT_TYPES.has(event.type)) return null;
  if (event.type === 'screenshot') {
    return typeof event.requestId === 'string' && UUID.test(event.requestId)
      ? { type: 'screenshot', requestId: event.requestId }
      : null;
  }
  return { type: event.type as 'manifest.changed' | 'reload' | 'revoked' };
}

/**
 * Valkey/Redis pub/sub so that events reach players connected to any server
 * instance (horizontal scaling). Requires a dedicated subscriber connection.
 */
export class RedisScreenEvents implements ScreenEvents {
  #handler: ((screenId: string, event: ScreenEvent) => void) | undefined;

  constructor(
    private readonly publisher: Redis,
    private readonly subscriber: Redis,
    private readonly channel = 'rubinny:screen-events',
  ) {
    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== this.channel || !this.#handler) return;
      try {
        const parsed = JSON.parse(message) as {
          screenId?: unknown;
          event?: { type?: unknown; requestId?: unknown };
        };
        const event = parsed.event ? toScreenEvent(parsed.event) : null;
        if (typeof parsed.screenId === 'string' && event) this.#handler(parsed.screenId, event);
      } catch {
        // Ignore malformed messages.
      }
    });
  }

  async start(): Promise<void> {
    await this.subscriber.subscribe(this.channel);
  }

  /**
   * Best effort: a failed publish must not fail the user's action. Players also
   * refetch their manifest periodically, so they converge anyway.
   */
  async publish(screenId: string, event: ScreenEvent): Promise<void> {
    await this.publisher
      .publish(this.channel, JSON.stringify({ screenId, event }))
      .catch(() => undefined);
  }

  onEvent(handler: (screenId: string, event: ScreenEvent) => void): void {
    this.#handler = handler;
  }

  async close(): Promise<void> {
    await this.subscriber.unsubscribe(this.channel).catch(() => undefined);
  }
}
