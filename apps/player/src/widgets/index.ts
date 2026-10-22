// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import type { WidgetDefinition } from '@rubinny/widget-sdk';
import { clockWidget } from './clock';
import { countdownWidget } from './countdown';
import { designWidget } from './design';
import { menuWidget } from './menu';
import { qrWidget } from './qr';
import { rssWidget } from './rss';
import { tableWidget } from './table';
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
      tableWidget,
      menuWidget,
      designWidget,
    ] as WidgetDefinition<unknown>[]
  ).map((widget) => [widget.type, widget]),
);
