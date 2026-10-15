export type ServerEvent =
  { type: 'hello' } | { type: 'manifest.changed' } | { type: 'reload' } | { type: 'revoked' };

/**
 * WebSocket client with exponential reconnect. The token is sent in the first
 * message (never in the URL). Close code 4401 means the device was revoked.
 */
export class PlayerSocket {
  #ws: WebSocket | null = null;
  #attempt = 0;
  #stopped = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly onEvent: (event: ServerEvent) => void,
    private readonly onRevoked: () => void,
  ) {}

  start() {
    this.#stopped = false;
    this.#connect();
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#timer);
    this.#ws?.close();
  }

  #connect() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.#schedule();
      return;
    }
    this.#ws = ws;
    ws.addEventListener('open', () => {
      ws.send(JSON.stringify({ type: 'auth', token: this.token }));
    });
    ws.addEventListener('message', (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as ServerEvent;
        if (event.type === 'hello') this.#attempt = 0;
        this.onEvent(event);
      } catch {
        // ignore malformed messages
      }
    });
    ws.addEventListener('close', (event) => {
      if (event.code === 4401) {
        this.onRevoked();
        return;
      }
      this.#schedule();
    });
  }

  #schedule() {
    if (this.#stopped) return;
    const delay = Math.min(60_000, 1000 * 2 ** this.#attempt) * (0.5 + Math.random() / 2);
    this.#attempt++;
    this.#timer = setTimeout(() => {
      this.#connect();
    }, delay);
  }
}
