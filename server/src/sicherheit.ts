// Codes, Tokens, Hashing, Rate-Limits und Logging.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

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

/** Festes Zeitfenster je Schlüssel. Gibt false zurück, wenn das Limit erreicht ist. */
export function rateLimiter(max: number, fensterMs: number) {
  const zaehler = new Map<string, { n: number; bis: number }>();
  return (schluessel: string, jetzt = Date.now()): boolean => {
    let z = zaehler.get(schluessel);
    if (!z || z.bis <= jetzt) {
      // ponytail: Aufräumen nur bei Fensterwechsel; reicht für Übungsgrössen.
      if (zaehler.size > 10_000) for (const [k, v] of zaehler) if (v.bis <= jetzt) zaehler.delete(k);
      z = { n: 0, bis: jetzt + fensterMs };
      zaehler.set(schluessel, z);
    }
    return ++z.n <= max;
  };
}

/** Strukturiertes Log auf stderr. Nie Tokens oder Codes übergeben. */
export function log(level: 'info' | 'warn' | 'error', msg: string, felder: Record<string, unknown> = {}): void {
  if (level === 'info' && process.env.VITEST) return;
  process.stderr.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...felder }) + '\n');
}
