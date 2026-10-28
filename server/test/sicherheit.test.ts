import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp, ipSchluessel, rateLimiter } from '../src/sicherheit.ts';

const req = (remoteAddress: string, cf?: string) =>
  ({ socket: { remoteAddress }, headers: cf === undefined ? {} : { 'cf-connecting-ip': cf } }) as unknown as IncomingMessage;

describe('clientIp', () => {
  const vertraut = new Set(['10.0.0.5']);
  it('nimmt CF-Connecting-IP nur vom vertrauten Proxy', () => {
    expect(clientIp(req('10.0.0.5', '203.0.113.9'), vertraut)).toBe('203.0.113.9');
    expect(clientIp(req('::ffff:10.0.0.5', '203.0.113.9'), vertraut)).toBe('203.0.113.9');
    expect(clientIp(req('192.168.1.20', '203.0.113.9'), vertraut)).toBe('192.168.1.20');
  });
  it('ignoriert ungültige Header-Werte (beliebig lange Schlüssel)', () => {
    expect(clientIp(req('10.0.0.5', 'x' + 'a'.repeat(8000)), vertraut)).toBe('10.0.0.5');
  });
  it('fasst IPv6 auf das /64 zusammen', () => {
    expect(ipSchluessel('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipSchluessel('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(ipSchluessel('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipSchluessel('::1')).toBe('0:0:0:0::/64');
  });
});

describe('rateLimiter', () => {
  it('frei() prüft ohne zu zählen', () => {
    const l = rateLimiter(2, 1000);
    expect(l.frei('a', 0)).toBe(true);
    expect(l('a', 0)).toBe(true);
    expect(l('a', 0)).toBe(true);
    expect(l.frei('a', 0)).toBe(false);
    expect(l.frei('a', 1000)).toBe(true); // Fenster abgelaufen
  });
  it('wächst nicht über maxSchluessel, sondern lehnt ab', () => {
    const l = rateLimiter(5, 60_000, 100);
    for (let i = 0; i < 1000; i++) l(`k${i}`, 0);
    expect(l.groesse()).toBe(100);
    expect(l('neu', 0)).toBe(false);
    expect(l('k1', 0)).toBe(true); // bekannte Schlüssel zählen weiter
    expect(l('neu', 60_000)).toBe(true); // nach Ablauf wird aufgeräumt
  });
});
