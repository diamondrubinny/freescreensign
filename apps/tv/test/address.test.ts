import { describe, expect, it } from 'vitest';
import { parseServer, playerUrl } from '../src/address';

describe('server address', () => {
  it('keeps the origin of an https address', () => {
    expect(parseServer(' https://Signage.Example.com/some/path?x=1 ')).toBe(
      'https://signage.example.com',
    );
    expect(parseServer('https://signage.example.com:8443')).toBe(
      'https://signage.example.com:8443',
    );
    expect(parseServer('https://signage.example.com:443/')).toBe('https://signage.example.com');
  });

  it('reads a bare host name as https', () => {
    expect(parseServer('signage.example.com')).toBe('https://signage.example.com');
    expect(parseServer('signage.example.com:8443')).toBe('https://signage.example.com:8443');
  });

  it('refuses anything but https', () => {
    for (const input of [
      'http://signage.example.com',
      'http://localhost:3000',
      'ftp://signage.example.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,hi',
    ]) {
      expect(parseServer(input), input).toBeNull();
    }
  });

  it('refuses credentials, spaces and empty input', () => {
    for (const input of [
      'https://user:secret@signage.example.com',
      'https://user@signage.example.com',
      'https://signage example.com',
      '',
      '   ',
      'https://',
    ]) {
      expect(parseServer(input), input).toBeNull();
    }
  });

  it('opens the web player of the server', () => {
    expect(playerUrl('https://signage.example.com')).toBe('https://signage.example.com/player/');
  });
});
