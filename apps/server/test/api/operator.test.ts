// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { afterEach, describe, expect, it } from 'vitest';
import { parseClamavVersion } from '../../src/lib/clamav.js';
import type { OperatorProbes } from '../../src/modules/operator/routes.js';
import {
  Client,
  STRONG_PASSWORD,
  createHarness,
  enableMfa,
  insertOrg,
  insertUser,
  integrationEnabled,
  login,
  type Harness,
} from '../support/harness.js';

interface Status {
  version: { server: string; migration: string | null };
  services: { state: string; checks: Record<string, string> };
  clamav: { state: string; configured: boolean; signatures?: number | null };
  backup: { state: string; lastAt: string | null; encrypted?: boolean };
  disk: { state: string; freeBytes: number | null; databaseBytes: number };
  processing: { state: string; waiting: number };
  usage: { organizations: number; users: number; screens: number; online: number };
  mail: { state: string };
}

describe('clamd version line', () => {
  it('reads the engine, the signature version and their date', () => {
    expect(parseClamavVersion('ClamAV 1.4.1/27431/Sat Oct 17 07:35:12 2026\n')).toEqual({
      engine: '1.4.1',
      signatures: 27431,
      signaturesDate: new Date('2026-10-17T07:35:12Z'),
    });
    // Without a signature database (it is still downloading).
    expect(parseClamavVersion('ClamAV 1.4.1')).toEqual({
      engine: '1.4.1',
      signatures: null,
      signaturesDate: null,
    });
  });
});

describe.runIf(integrationEnabled)('server status for the operator', () => {
  let h: Harness;
  afterEach(() => h.close());

  const day = 24 * 3600_000;

  async function setUp(probes: OperatorProbes = {}) {
    h = await createHarness(
      {},
      {
        operator: probes,
        checks: [
          { name: 'database', check: () => Promise.resolve() },
          { name: 'clamav', check: () => Promise.reject(new Error('down')) },
        ],
      },
    );
    const operatorId = await insertUser(h.db, 'operator@example.com');
    await h.db
      .updateTable('users')
      .set({ is_operator: true })
      .where('id', '=', operatorId)
      .execute();
    await insertOrg(h.db, operatorId, 'School', false);
    const operator = await login(h.app, 'operator@example.com');
    return { operator, operatorId };
  }

  const status = async (client: Client) => {
    const res = await client.get('/api/v1/operator/status');
    expect(res.statusCode, res.body).toBe(200);
    return res.json<{ status: Status }>().status;
  };

  it('is hidden (404) from everyone but an operator with two-step verification', async () => {
    const { operator } = await setUp();
    await insertUser(h.db, 'admin@example.com');
    const other = await login(h.app, 'admin@example.com');
    await enableMfa(other);
    expect((await other.get('/api/v1/operator/status')).statusCode).toBe(404);
    expect((await new Client(h.app).get('/api/v1/operator/status')).statusCode).toBe(401);
    // An operator without two-step verification does not see it either.
    expect((await operator.get('/api/v1/operator/status')).statusCode).toBe(404);
    expect((await operator.get('/api/v1/auth/session')).json()).toMatchObject({
      user: { isOperator: true },
    });
    await enableMfa(operator);
    const body = await status(operator);
    expect(body.version.migration).toMatch(/^0020_operator$/);
    expect(body.version.server).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.usage).toMatchObject({ organizations: 1, users: 2, screens: 0, online: 0 });
    // No names or addresses, only numbers.
    expect(JSON.stringify(body)).not.toMatch(/@example\.com|School/);
  });

  it('warns about services, signatures, backups, disk, processing and mail', async () => {
    const now = Date.now();
    const { operator, operatorId } = await setUp({
      clamav: () =>
        Promise.resolve({
          engine: '1.4.1',
          signatures: 27000,
          signaturesDate: new Date(now - 5 * day),
        }),
      disk: () => Promise.resolve({ freeBytes: 15, totalBytes: 100 }),
    });
    await enableMfa(operator);
    let body = await status(operator);
    expect(body.services).toEqual({ state: 'error', checks: { database: 'up', clamav: 'down' } });
    expect(body.clamav).toMatchObject({ state: 'warning', signatures: 27000 });
    expect(body.backup).toEqual({ state: 'error', lastAt: null });
    expect(body.disk).toMatchObject({ state: 'warning', freeBytes: 15 });
    expect(body.disk.databaseBytes).toBeGreaterThan(0);
    expect(body.processing).toEqual({ state: 'ok', waiting: 0, oldestAt: null });
    expect(body.mail.state).toBe('warning');

    // A recent encrypted backup is fine; an unencrypted one is a warning; an old one an error.
    await h.db.insertInto('backup_runs').values({ size_bytes: 1000, encrypted: true }).execute();
    expect((await status(operator)).backup).toMatchObject({ state: 'ok', encrypted: true });
    await h.db.insertInto('backup_runs').values({ size_bytes: 1000, encrypted: false }).execute();
    expect((await status(operator)).backup.state).toBe('warning');
    await h.db.deleteFrom('backup_runs').execute();
    await h.db
      .insertInto('backup_runs')
      .values({ size_bytes: 1, encrypted: true, finished_at: new Date(now - 2 * day) })
      .execute();
    expect((await status(operator)).backup.state).toBe('error');

    // A file waiting for scanning for half an hour.
    const org = await h.db.selectFrom('organizations').select('id').executeTakeFirstOrThrow();
    await h.db
      .insertInto('media')
      .values({
        org_id: org.id,
        name: 'stuck.png',
        original_filename: 'stuck.png',
        kind: 'image',
        mime: 'image/png',
        size_bytes: 10,
        status: 'queued',
        created_by: operatorId,
        created_at: new Date(now - 30 * 60_000),
      })
      .execute();
    body = await status(operator);
    expect(body.processing).toMatchObject({ state: 'warning', waiting: 1 });
  });

  it('reports ClamAV that does not answer, and very low disk, as errors', async () => {
    const { operator } = await setUp({
      clamav: () => Promise.reject(new Error('refused')),
      disk: () => Promise.resolve({ freeBytes: 5, totalBytes: 100 }),
    });
    await enableMfa(operator);
    const body = await status(operator);
    expect(body.clamav).toEqual({ state: 'error', configured: true });
    expect(body.disk.state).toBe('error');
  });

  it('stops being an operator when the account is deleted', async () => {
    const { operator, operatorId } = await setUp();
    expect((await operator.delete('/api/v1/me', { password: STRONG_PASSWORD })).statusCode).toBe(
      204,
    );
    const row = await h.db
      .selectFrom('users')
      .select('is_operator')
      .where('id', '=', operatorId)
      .executeTakeFirstOrThrow();
    expect(row.is_operator).toBe(false);
  });
});
