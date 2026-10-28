// Codes, Tokens, Hashing, Rate-Limits und Logging.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/** Ohne verwechselbare Zeichen (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function neuerCode(laenge: number): string {
  let code = '';
  for (let i = 0; i < laenge; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export const neuesToken = (): string => randomBytes(32).toString('base64url');

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** Zeitkonstanter Vergleich beliebig langer Strings (über deren Hashes). */
export const gleich = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/**
 * Festes Zeitfenster je Schlüssel. Aufruf zählt einen Versuch und gibt false zurück, wenn das Limit erreicht ist.
 * `frei()` prüft ohne zu zählen. Höchstens `maxSchluessel` Einträge: ist die Map voll, wird abgelehnt statt gewachsen.
 */
export function rateLimiter(max: number, fensterMs: number, maxSchluessel = 10_000) {
  const zaehler = new Map<string, { n: number; bis: number }>();
  const aktuell = (k: string, jetzt: number) => {
    const z = zaehler.get(k);
    return z && z.bis > jetzt ? z : undefined;
  };
  const platz = (jetzt: number): boolean => {
    if (zaehler.size >= maxSchluessel) for (const [k, v] of zaehler) if (v.bis <= jetzt) zaehler.delete(k);
    return zaehler.size < maxSchluessel;
  };
  const zaehle = (schluessel: string, jetzt = Date.now()): boolean => {
    let z = aktuell(schluessel, jetzt);
    if (!z) {
      zaehler.delete(schluessel);
      if (!platz(jetzt)) return false;
      z = { n: 0, bis: jetzt + fensterMs };
      zaehler.set(schluessel, z);
    }
    return ++z.n <= max;
  };
  const frei = (schluessel: string, jetzt = Date.now()): boolean => {
    const z = aktuell(schluessel, jetzt);
    return z ? z.n < max : platz(jetzt);
  };
  return Object.assign(zaehle, { frei, groesse: () => zaehler.size });
}

const ohneV4Praefix = (ip: string): string => ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');

/** Limiter-Schlüssel einer IP: IPv4 unverändert, IPv6 auf das /64 gekürzt (ein Anschluss hat meist ein ganzes /64). */
export function ipSchluessel(roh: string): string {
  const ip = ohneV4Praefix(roh.trim());
  if (isIP(ip) !== 6) return ip.slice(0, 45);
  const [links, rechts] = ip.split('%')[0].split('::');
  const l = links ? links.split(':') : [];
  const r = rechts ? rechts.split(':') : [];
  const gruppen = rechts === undefined ? l : [...l, ...Array(Math.max(0, 8 - l.length - r.length)).fill('0'), ...r];
  return `${gruppen.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

/**
 * Client-IP für Rate-Limits. `CF-Connecting-IP` zählt nur, wenn die Anfrage von einem vertrauten Proxy
 * (cloudflared, Env TRUSTED_PROXY) kommt – sonst könnte jeder im LAN den Header frei wählen.
 */
export function clientIp(req: IncomingMessage, vertraut: ReadonlySet<string>): string {
  const socket = ohneV4Praefix(req.socket.remoteAddress ?? '');
  const cf = req.headers['cf-connecting-ip'];
  const ip = vertraut.has(socket) && typeof cf === 'string' && isIP(cf.trim()) ? cf : socket;
  return ipSchluessel(ip) || 'unbekannt';
}

/** Strukturiertes Log auf stderr. Nie Tokens oder Codes übergeben. */
export function log(level: 'info' | 'warn' | 'error', msg: string, felder: Record<string, unknown> = {}): void {
  if (level === 'info' && process.env.VITEST) return;
  process.stderr.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...felder }) + '\n');
}
