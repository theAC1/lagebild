// Rate-Limits: welche IP zählt (CF-Connecting-IP nur vom vertrauten Proxy, IPv6 als /64) und wie der Limiter zählt.
import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { clientIp, ipSchluessel, rateLimiter } from '../src/sicherheit.ts';

const req = (remoteAddress: string, cf?: string) =>
  ({ socket: { remoteAddress }, headers: cf === undefined ? {} : { 'cf-connecting-ip': cf } }) as unknown as IncomingMessage;

describe('clientIp', () => {
  it('CF-Connecting-IP nur vom vertrauten Proxy (auch ::ffff:), ungültige Werte ignoriert; IPv6 auf /64 zusammengefasst', () => {
    const vertraut = new Set(['10.0.0.5']);
    expect(clientIp(req('10.0.0.5', '203.0.113.9'), vertraut)).toBe('203.0.113.9');
    expect(clientIp(req('::ffff:10.0.0.5', '203.0.113.9'), vertraut)).toBe('203.0.113.9');
    expect(clientIp(req('192.168.1.20', '203.0.113.9'), vertraut)).toBe('192.168.1.20');
    expect(clientIp(req('10.0.0.5', 'x' + 'a'.repeat(8000)), vertraut)).toBe('10.0.0.5');
    expect(ipSchluessel('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipSchluessel('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(ipSchluessel('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipSchluessel('::1')).toBe('0:0:0:0::/64');
  });
});

describe('rateLimiter', () => {
  it('zählt je Schlüssel im Fenster, frei() prüft ohne zu zählen; wächst nicht über maxSchluessel, sondern lehnt ab', () => {
    const l = rateLimiter(2, 1000);
    expect(l.frei('a', 0)).toBe(true);
    expect(l('a', 0)).toBe(true);
    expect(l('a', 0)).toBe(true);
    expect(l.frei('a', 0)).toBe(false);
    expect(l('a', 0)).toBe(false);
    expect(l.frei('a', 1000)).toBe(true); // Fenster abgelaufen
    const voll = rateLimiter(5, 60_000, 100);
    for (let i = 0; i < 1000; i++) voll(`k${i}`, 0);
    expect(voll.groesse()).toBe(100);
    expect(voll('neu', 0)).toBe(false);
    expect(voll('k1', 0)).toBe(true); // bekannte Schlüssel zählen weiter
    expect(voll('neu', 60_000)).toBe(true); // nach Ablauf wird aufgeräumt
  });
});
