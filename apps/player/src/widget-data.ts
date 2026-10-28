// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { WidgetDataGoneError, type PlayerApi } from './api';

export interface WidgetDataStore {
  widgetData(widgetId: string): unknown;
  setWidgetData(widgetId: string, data: unknown): void;
  forgetWidgetData(widgetId: string): void;
}

/**
 * Fetches widget data from the Rubinny server and keeps the last good copy, so
 * data widgets keep showing content while the screen is offline.
 */
export class WidgetDataClient {
  constructor(
    private readonly api: Pick<PlayerApi, 'widgetData'>,
    private readonly token: () => string | null,
    private readonly store: WidgetDataStore,
  ) {}

  async get(widgetId: string): Promise<unknown> {
    const token = this.token();
    try {
      if (!token) throw new Error('not paired');
      const data = await this.api.widgetData(token, widgetId);
      this.store.setWidgetData(widgetId, data);
      return data;
    } catch (error) {
      // Gone for good (not a network problem): an old copy would show what no longer exists.
      if (error instanceof WidgetDataGoneError) {
        this.store.forgetWidgetData(widgetId);
        throw error;
      }
      const cached = this.store.widgetData(widgetId);
      if (cached !== null) return cached;
      throw error;
    }
  }
}
