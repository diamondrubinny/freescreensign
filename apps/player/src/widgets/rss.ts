import { rssConfigSchema, type RssData, type WidgetConfig } from '@rubinny/shared';
import { defineWidget, el, every, textDirection } from '@rubinny/widget-sdk';
import { fitText } from './fit';

const REFRESH_MS = 10 * 60 * 1000;

/** Rotates through feed headlines prepared (and sanitized) by the Rubinny server. */
export const rssWidget = defineWidget<WidgetConfig<'rss'>>({
  type: 'rss',
  parseConfig: (config) => rssConfigSchema.parse(config),
  render(container, config, ctx) {
    const source = el('div', { className: 'w-rss-source', dir: 'auto' });
    const headline = el('p', { className: 'w-rss-title' });
    const root = el(
      'div',
      { className: 'w-rss', style: { color: config.textColor, background: config.background } },
      headline,
    );
    if (config.showSource) root.prepend(source);
    container.append(root);

    let items: RssData['items'] = [];
    let index = 0;
    const show = () => {
      const item = items.length > 0 ? items[index % items.length] : undefined;
      index++;
      headline.textContent = item?.title ?? '';
      headline.dir = item ? textDirection(item.title) : 'auto';
      fitText(headline, root);
    };
    const load = async () => {
      try {
        const data = await ctx.fetchData<RssData>();
        if (ctx.signal.aborted) return;
        items = data.items;
        source.textContent = data.title ?? '';
        if (index === 0) show();
      } catch {
        // No data yet (offline, feed down): keep what is shown.
      }
    };
    void load();
    every(config.itemDurationMs, ctx.signal, show);
    every(REFRESH_MS, ctx.signal, () => void load());
    return {
      destroy: () => {
        root.remove();
      },
    };
  },
});
