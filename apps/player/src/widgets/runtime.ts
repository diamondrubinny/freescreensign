import type { ManifestWidget } from '@rubinny/shared';
import type { WidgetContext, WidgetDefinition, WidgetInstance } from '@rubinny/widget-sdk';

export interface WidgetRuntimeOptions {
  registry: ReadonlyMap<string, WidgetDefinition<unknown>>;
  fetchData: (widgetId: string) => Promise<unknown>;
  timezone: () => string;
  now: () => Date;
  reducedMotion: () => boolean;
}

/**
 * Mounts widgets into zone layers. A failing widget (bad config, a crash while
 * rendering or destroying) is isolated: it shows nothing, and the player goes on.
 */
export class WidgetRuntime {
  constructor(private readonly options: WidgetRuntimeOptions) {}

  /** Renders the widget into `container` until `signal` aborts. Returns false if it could not. */
  mount(widget: ManifestWidget, container: HTMLElement, signal: AbortSignal): boolean {
    const definition = this.options.registry.get(widget.type);
    if (!definition) return false;
    let config: unknown;
    try {
      config = definition.parseConfig(widget.config);
    } catch {
      return false;
    }
    const { fetchData, now, timezone, reducedMotion } = this.options;
    const ctx: WidgetContext = {
      locale: widget.config.locale === 'en' ? 'en' : 'he',
      timezone: timezone(),
      now,
      fetchData: <T>() => fetchData(widget.id) as Promise<T>,
      signal,
      reducedMotion: reducedMotion(),
    };
    let instance: WidgetInstance;
    try {
      instance = definition.render(container, config, ctx);
    } catch {
      container.replaceChildren();
      return false;
    }
    signal.addEventListener(
      'abort',
      () => {
        try {
          instance.destroy();
        } catch {
          // A widget's cleanup failure must not affect the player.
        }
      },
      { once: true },
    );
    return true;
  }
}
