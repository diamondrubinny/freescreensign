import { EventEmitter } from 'node:events';
import type { Redis } from 'ioredis';

/** Events pushed to connected players. */
export type ScreenEvent = { type: 'manifest.changed' } | { type: 'reload' } | { type: 'revoked' };

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

const EVENT_TYPES = new Set(['manifest.changed', 'reload', 'revoked']);

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
        const parsed = JSON.parse(message) as { screenId?: unknown; event?: { type?: unknown } };
        if (
          typeof parsed.screenId === 'string' &&
          typeof parsed.event?.type === 'string' &&
          EVENT_TYPES.has(parsed.event.type)
        ) {
          this.#handler(parsed.screenId, parsed.event as ScreenEvent);
        }
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
