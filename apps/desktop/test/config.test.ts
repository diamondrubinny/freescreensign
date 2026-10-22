// Rubinny — free and open-source digital signage. Powered by Rubinny · Open source.
// Copyright (C) 2026 The Rubinny Authors. Created by Diamond Rubinny.
// SPDX-License-Identifier: AGPL-3.0-only
// https://github.com/diamondrubinny/freescreensign · The attribution must be kept (LICENSING.md).

import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configPath, loadConfig, parseServerUrl, playerUrl, saveConfig } from '../src/config.js';
import { captureScale, isSameOrigin, isSetupPage } from '../src/security.js';

describe('server address', () => {
  it('accepts https, and http only on this machine', () => {
    expect(parseServerUrl(' https://signage.example.com/player/?x=1 ')).toBe(
      'https://signage.example.com',
    );
    expect(parseServerUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(parseServerUrl('http://localhost')).toBe('http://localhost');
    expect(parseServerUrl('http://signage.example.com')).toBeNull();
    expect(parseServerUrl('https://user:pass@signage.example.com')).toBeNull();
    expect(parseServerUrl('file:///etc/passwd')).toBeNull();
    expect(parseServerUrl('javascript:alert(1)')).toBeNull();
    expect(parseServerUrl('not a url')).toBeNull();
    expect(playerUrl('https://a.example')).toBe('https://a.example/player/');
  });

  it('saves atomically and ignores invalid stored values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rubinny-desktop-'));
    expect(loadConfig(dir)).toBeNull();
    saveConfig(dir, { serverOrigin: 'https://a.example' });
    expect(loadConfig(dir)).toEqual({ serverOrigin: 'https://a.example' });
    if (process.platform !== 'win32') expect(statSync(configPath(dir)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(configPath(dir), 'utf8'))).toEqual({
      serverOrigin: 'https://a.example',
    });
    writeFileSync(configPath(dir), JSON.stringify({ serverOrigin: 'http://evil.example' }));
    expect(loadConfig(dir)).toBeNull();
    writeFileSync(configPath(dir), '{broken');
    expect(loadConfig(dir)).toBeNull();
  });
});

describe('guards', () => {
  it('compares origins exactly', () => {
    expect(isSameOrigin('https://a.example/player/', 'https://a.example')).toBe(true);
    expect(isSameOrigin('https://a.example.evil.test/', 'https://a.example')).toBe(false);
    expect(isSameOrigin('http://a.example/', 'https://a.example')).toBe(false);
    expect(isSameOrigin('https://a.example:444/', 'https://a.example')).toBe(false);
    expect(isSameOrigin('garbage', 'https://a.example')).toBe(false);
  });

  it('recognizes only the bundled setup page', () => {
    const setup = 'file:///opt/rubinny/static/setup.html';
    expect(isSetupPage('file:///opt/rubinny/static/setup.html?x', setup)).toBe(true);
    expect(isSetupPage('file:///tmp/setup.html', setup)).toBe(false);
    expect(isSetupPage('https://a.example/opt/rubinny/static/setup.html', setup)).toBe(false);
  });

  it('scales screenshots down to 1920, never up', () => {
    expect(captureScale(3840, 2160)).toBe(0.5);
    expect(captureScale(1080, 1920)).toBe(1);
    expect(captureScale(800, 600)).toBe(1);
  });
});
