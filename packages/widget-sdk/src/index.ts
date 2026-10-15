/**
 * Rubinny Widget SDK.
 *
 * A widget renders into a DOM container on a signage screen. Widgets must be
 * self-contained, safe and lightweight; see README.md for the rules.
 */

export type WidgetLocale = 'he' | 'en';

export interface WidgetContext {
  /** Language for any text the widget generates. */
  readonly locale: WidgetLocale;
  /** IANA time zone of the screen (e.g. "Asia/Jerusalem"). */
  readonly timezone: string;
  /** Current time; use instead of `new Date()` so the player can correct clock drift. */
  now(): Date;
  /**
   * Data prepared by the Rubinny server for data widgets (e.g. RSS, weather).
   * Widgets never access the network directly. When the screen is offline the
   * last known data is returned; rejects if none is available.
   */
  fetchData<T>(): Promise<T>;
  /** Aborted when the widget is removed. */
  readonly signal: AbortSignal;
  /** True when the screen requests reduced motion: avoid animation. */
  readonly reducedMotion: boolean;
}

export interface WidgetInstance {
  /** Release timers, listeners and DOM. Called exactly once. */
  destroy(): void;
}

export interface WidgetDefinition<Config> {
  /** Kebab-case identifier, unique per widget (e.g. "clock"). */
  readonly type: string;
  /** Validates untrusted configuration; must throw on invalid input. */
  parseConfig(config: unknown): Config;
  /** Renders into `container` (which fills the zone and is a CSS size container). */
  render(container: HTMLElement, config: Config, ctx: WidgetContext): WidgetInstance;
}

/** Identity helper that gives type inference to widget definitions. */
export function defineWidget<Config>(definition: WidgetDefinition<Config>): WidgetDefinition<Config> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(definition.type)) {
    throw new Error(`Invalid widget type "${definition.type}" (use kebab-case)`);
  }
  return definition;
}

/** Creates an element with text content only (never HTML) — the safe way to show strings. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: { className?: string; text?: string; dir?: 'auto' | 'rtl' | 'ltr'; style?: Partial<CSSStyleDeclaration> } = {},
  ...children: Node[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.dir) node.dir = options.dir;
  if (options.style) Object.assign(node.style, options.style);
  node.append(...children);
  return node;
}

/** setInterval that is cleared automatically when `signal` aborts. */
export function every(ms: number, signal: AbortSignal, task: () => void): void {
  const timer = setInterval(task, ms);
  signal.addEventListener('abort', () => {
    clearInterval(timer);
  }, { once: true });
}

/** Strong text direction of a string (first strong character), for RTL/LTR layout. */
export function textDirection(text: string): 'rtl' | 'ltr' {
  const match = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]|[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF]/.exec(text);
  return match && /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(match[0]) ? 'rtl' : 'ltr';
}
