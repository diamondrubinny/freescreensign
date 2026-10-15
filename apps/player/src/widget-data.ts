import type { PlayerApi } from './api';

export interface WidgetDataStore {
  widgetData(widgetId: string): unknown;
  setWidgetData(widgetId: string, data: unknown): void;
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
      const cached = this.store.widgetData(widgetId);
      if (cached !== null) return cached;
      throw error;
    }
  }
}
