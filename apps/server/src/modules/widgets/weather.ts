// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { z } from 'zod';
import type { WeatherData, WidgetConfig } from '@rubinny/shared';

export const WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo.com (CC BY 4.0)';

/**
 * Builds a forecast request for an Open-Meteo compatible endpoint
 * (https://open-meteo.com/en/docs). Parameter names follow the official
 * documentation of the forecast API.
 */
export function weatherRequestUrl(
  endpoint: string,
  config: WidgetConfig<'weather'>,
  apiKey?: string,
): string {
  const url = new URL(endpoint);
  url.searchParams.set('latitude', config.latitude.toFixed(4));
  url.searchParams.set('longitude', config.longitude.toFixed(4));
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', String(Math.max(config.days, 1)));
  if (config.units === 'imperial') url.searchParams.set('temperature_unit', 'fahrenheit');
  if (apiKey) url.searchParams.set('apikey', apiKey);
  return url.toString();
}

const finite = z.number();
const responseSchema = z.object({
  current: z.object({ temperature_2m: finite, weather_code: z.number().int().min(0).max(99) }),
  daily: z
    .object({
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(16),
      weather_code: z.array(z.number().int().min(0).max(99).nullable()),
      temperature_2m_max: z.array(finite.nullable()),
      temperature_2m_min: z.array(finite.nullable()),
    })
    .optional(),
});

export class WeatherParseError extends Error {
  constructor() {
    super('Unexpected weather response');
    this.name = 'WeatherParseError';
  }
}

/** Normalizes the upstream response into the small shape the player renders. */
export function parseWeather(json: unknown, config: WidgetConfig<'weather'>): WeatherData {
  const result = responseSchema.safeParse(json);
  if (!result.success) throw new WeatherParseError();
  const { current, daily } = result.data;
  const days: WeatherData['daily'] = [];
  if (daily && config.days > 0) {
    daily.time.forEach((date, index) => {
      const min = daily.temperature_2m_min[index];
      const max = daily.temperature_2m_max[index];
      const code = daily.weather_code[index];
      if (days.length >= config.days || min == null || max == null || code == null) return;
      days.push({ date, min: Math.round(min), max: Math.round(max), weatherCode: code });
    });
  }
  return {
    units: config.units,
    current: { temperature: Math.round(current.temperature_2m), weatherCode: current.weather_code },
    daily: days,
    attribution: WEATHER_ATTRIBUTION,
  };
}
