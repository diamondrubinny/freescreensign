import type { FastifyInstance, FastifyReply } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { addDays, localDateSchema, zonedDateTime } from '@rubinny/shared';
import type { AppContext } from '../../context.js';
import { parse } from '../../lib/validation.js';
import { orgGuard, requireOrg } from '../auth/guards.js';

/** Longest report range, in days. */
export const MAX_REPORT_DAYS = 92;
const MAX_SUMMARY_ROWS = 1000;
const MAX_EVENT_ROWS = 50_000;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const reportQuerySchema = z
  .object({
    from: localDateSchema,
    to: localDateSchema,
    screenId: z.uuid().optional(),
    tz: z.string().max(64).refine(isTimeZone, 'Unknown time zone').default('Asia/Jerusalem'),
    format: z.enum(['json', 'csv']).default('json'),
    /** summary: one row per content; events: every play (CSV only). */
    view: z.enum(['summary', 'events']).default('summary'),
  })
  .refine((q) => q.from <= q.to, { message: 'from must not be after to', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) < MAX_REPORT_DAYS * 24 * 60 * 60 * 1000, {
    message: `At most ${String(MAX_REPORT_DAYS)} days`,
    path: ['to'],
  });

/**
 * A CSV cell. Text that a spreadsheet would run as a formula (=, +, -, @, tab, CR) is
 * prefixed with an apostrophe (CSV injection); every text cell is quoted.
 */
export function csvCell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const csvLine = (cells: (string | number)[]) => cells.map(csvCell).join(',');

export function reportRoutes(app: FastifyInstance, ctx: AppContext) {
  const viewer = { preHandler: orgGuard(ctx, 'VIEWER') };

  /** Proof of play: what was shown, how often and for how long, in a date range. */
  app.get('/api/v1/orgs/:orgId/reports/plays', viewer, async (request, reply) => {
    const org = requireOrg(request);
    const query = parse(reportQuerySchema, request.query);
    const start = zonedDateTime(`${query.from}T00:00`, query.tz);
    const end = zonedDateTime(`${addDays(query.to, 1)}T00:00`, query.tz);

    const base = ctx.db
      .selectFrom('play_events')
      .where('play_events.org_id', '=', org.id)
      .where('play_events.started_at', '>=', start)
      .where('play_events.started_at', '<', end)
      .$if(query.screenId !== undefined, (qb) =>
        qb.where('play_events.screen_id', '=', query.screenId ?? ''),
      );
    const filename = `rubinny-plays-${query.from}-${query.to}`;

    if (query.view === 'events') {
      const rows = await base
        .innerJoin('screens', 'screens.id', 'play_events.screen_id')
        .select([
          'play_events.started_at',
          'play_events.duration_ms',
          'play_events.content_name',
          'play_events.content_kind',
          'play_events.zone_id',
          'screens.name as screen_name',
        ])
        .orderBy('play_events.started_at')
        .limit(MAX_EVENT_ROWS)
        .execute();
      const time = new Intl.DateTimeFormat('sv-SE', {
        timeZone: query.tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      const lines = [
        csvLine([
          'started_at',
          'time_zone',
          'duration_seconds',
          'screen',
          'zone',
          'kind',
          'content',
        ]),
        ...rows.map((row) =>
          csvLine([
            time.format(row.started_at),
            query.tz,
            Math.round(row.duration_ms / 100) / 10,
            row.screen_name,
            row.zone_id,
            row.content_kind,
            row.content_name,
          ]),
        ),
      ];
      return sendCsv(reply, `${filename}-events.csv`, lines);
    }

    const rows = await base
      .select([
        'play_events.content_kind',
        sql<string | null>`max(coalesce(play_events.media_id, play_events.widget_id)::text)`.as(
          'content_id',
        ),
        sql<string>`(array_agg(play_events.content_name ORDER BY play_events.started_at DESC))[1]`.as(
          'name',
        ),
        sql<number>`count(*)::int`.as('plays'),
        sql<string>`sum(play_events.duration_ms)::bigint`.as('duration_ms'),
        sql<number>`count(DISTINCT play_events.screen_id)::int`.as('screens'),
      ])
      // Deleted content keeps its own row by name.
      .groupBy([
        'play_events.content_kind',
        sql`coalesce(play_events.media_id::text, play_events.widget_id::text, 'deleted:' || play_events.content_name)`,
      ])
      .orderBy(sql`count(*)`, 'desc')
      .limit(MAX_SUMMARY_ROWS)
      .execute();
    const items = rows.map((row) => ({
      kind: row.content_kind,
      contentId: row.content_id,
      name: row.name,
      plays: row.plays,
      durationMs: Number(row.duration_ms),
      screens: row.screens,
    }));

    if (query.format === 'csv') {
      return sendCsv(reply, `${filename}.csv`, [
        csvLine(['content', 'kind', 'plays', 'total_seconds', 'screens']),
        ...items.map((item) =>
          csvLine([
            item.name,
            item.kind,
            item.plays,
            Math.round(item.durationMs / 1000),
            item.screens,
          ]),
        ),
      ]);
    }
    return {
      report: {
        from: query.from,
        to: query.to,
        timeZone: query.tz,
        totals: {
          plays: items.reduce((sum, item) => sum + item.plays, 0),
          durationMs: items.reduce((sum, item) => sum + item.durationMs, 0),
        },
        items,
      },
    };
  });
}

function sendCsv(reply: FastifyReply, filename: string, lines: string[]): FastifyReply {
  return (
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .header('cache-control', 'no-store')
      // BOM: spreadsheet apps then read Hebrew correctly.
      .send(`\uFEFF${lines.join('\r\n')}\r\n`)
  );
}
