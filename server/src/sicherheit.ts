// Codes, Tokens, Hashing, Gerätenachweis, Rate-Limits und Logging.
import { createHash, createPublicKey, randomBytes, randomInt, timingSafeEqual, verify } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { geraetIdAus, type GeraetNachweis } from '../../shared/protocol.ts';

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
 * Challenges für den Gerätenachweis (Spec v7): 32 Byte zufällig, `gueltigMs` gültig, einmal verwendbar, höchstens `max`
 * offen. ponytail: ist der Speicher voll (Flut aus sehr vielen IPs), gibt es bis zum Ablauf keine neuen; dann das Limit je IP senken.
 */
export function challenges(max = 10_000, gueltigMs = 2 * 60_000) {
  const offen = new Map<string, number>();
  return {
    /** Neue Challenge, undefined wenn der Speicher voll ist. */
    neu(jetzt = Date.now()): string | undefined {
      if (offen.size >= max) for (const [c, bis] of offen) if (bis <= jetzt) offen.delete(c);
      if (offen.size >= max) return undefined;
      const c = randomBytes(32).toString('base64url');
      offen.set(c, jetzt + gueltigMs);
      return c;
    },
    /** true, wenn `c` offen und nicht abgelaufen war; danach ist sie verbraucht. */
    einloesen(c: string, jetzt = Date.now()): boolean {
      const bis = offen.get(c);
      offen.delete(c);
      return bis !== undefined && bis > jetzt;
    },
  };
}

/** Geräte-ID aus dem Nachweis, wenn die Ed25519-Signatur über `text` stimmt; sonst undefined. Die Challenge prüft der Aufrufer. */
export function geraetId(g: GeraetNachweis, text: string): string | undefined {
  try {
    const schluessel = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: g.pub }, format: 'jwk' });
    if (!verify(null, Buffer.from(text), schluessel, Buffer.from(g.signatur, 'base64url'))) return undefined;
    return geraetIdAus(createHash('sha256').update(Buffer.from(g.pub, 'base64url')).digest());
  } catch {
    return undefined; // kein gültiger Ed25519-Schlüssel
  }
}

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

/** Ursprünge der Android-App (Capacitor-WebView: https://localhost, ältere Versionen capacitor://localhost). */
export const APP_ORIGINS: ReadonlySet<string> = new Set(['https://localhost', 'capacitor://localhost']);

/**
 * CORS-Kopfzeilen für die Android-App. Nur diese Ursprünge, nie `*`: Die API nutzt einen Bearer-Token statt Cookies,
 * ein fremder Ursprung bekäme also ohnehin nichts – er soll aber auch nicht lesen dürfen. Browser derselben Herkunft
 * senden keinen Preflight und brauchen nichts davon.
 */
export function corsKopf(origin: string | undefined): Record<string, string> {
  if (!origin || !APP_ORIGINS.has(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
}

/** Strukturiertes Log auf stderr. Nie Tokens oder Codes übergeben. */
export function log(level: 'info' | 'warn' | 'error', msg: string, felder: Record<string, unknown> = {}): void {
  if (level === 'info' && process.env.VITEST) return;
  process.stderr.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...felder }) + '\n');
}
