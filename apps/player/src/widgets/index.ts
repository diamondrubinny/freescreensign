import type { WidgetDefinition } from '@rubinny/widget-sdk';
import { clockWidget } from './clock';
import { countdownWidget } from './countdown';
import { designWidget } from './design';
import { qrWidget } from './qr';
import { rssWidget } from './rss';
import { textWidget } from './text';
import { tickerWidget } from './ticker';
import { weatherWidget } from './weather';
import { webpageWidget } from './webpage';

/** Built-in widgets, all written against the public widget SDK. */
export const BUILT_IN_WIDGETS: ReadonlyMap<string, WidgetDefinition<unknown>> = new Map(
  (
    [
      clockWidget,
      textWidget,
      tickerWidget,
      qrWidget,
      rssWidget,
      weatherWidget,
      webpageWidget,
      countdownWidget,
      designWidget,
    ] as WidgetDefinition<unknown>[]
  ).map((widget) => [widget.type, widget]),
);
