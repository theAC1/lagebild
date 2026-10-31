// Gerätekennung (Spec v7): Ed25519-Schlüsselpaar per WebCrypto, privat nicht exportierbar, in IndexedDB.
// Geräte-ID = base32(SHA-256(öffentlicher Schlüssel, raw))[0..16]; der Server leitet sie beim Beitritt selbst ab.
import { geraetIdAus, kurzKennung, type Challenge, type GeraetNachweis } from '../../../shared/protocol.ts';
import { postJson } from './store.svelte.ts';

export const ZU_ALT = 'Bitte App bzw. Browser aktualisieren – dieses Gerät kann sich nicht ausweisen (Ed25519 fehlt).';
const DB = 'lagebild-geraet';
const ABLAGE = 'schluessel';
const SCHLUESSEL = 'ed25519';

type Geraet = { paar: CryptoKeyPair; pub: string; id: string };
let geraet: Promise<Geraet> | undefined;

const b64url = (b: Uint8Array): string => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function anfrage<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((ok, nok) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => nok(r.error);
  });
}

function oeffne(): Promise<IDBDatabase> {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(ABLAGE);
  return anfrage(r);
}

async function laden(): Promise<Geraet> {
  if (!globalThis.crypto?.subtle) throw new Error(ZU_ALT);
  const db = await oeffne().catch(() => {
    throw new Error('Gerätespeicher nicht verfügbar – privates Surfen beenden oder Speicher freigeben.');
  });
  const lies = () => anfrage<CryptoKeyPair | undefined>(db.transaction(ABLAGE).objectStore(ABLAGE).get(SCHLUESSEL));
  let paar = await lies();
  if (!paar) {
    const neu = (await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']).catch(() => {
      throw new Error(ZU_ALT);
    })) as CryptoKeyPair;
    // add statt put: hat ein anderer Tab gleichzeitig ein Paar angelegt, gilt dessen
    paar = await anfrage(db.transaction(ABLAGE, 'readwrite').objectStore(ABLAGE).add(neu, SCHLUESSEL)).then(
      () => neu,
      async () => (await lies())!,
    );
  }
  db.close();
  const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
  return { paar, pub: b64url(roh), id: geraetIdAus(new Uint8Array(await crypto.subtle.digest('SHA-256', roh))) };
}

/** Schlüsselpaar und Kennung dieses Geräts (beim ersten Aufruf erzeugt). */
const meinGeraet = (): Promise<Geraet> =>
  (geraet ??= laden().catch((e) => {
    geraet = undefined;
    throw e;
  }));

/** Gekürzte Kennung dieses Geräts, z.B. «K7MP-3XQ9» (Profil). */
export const meineKennung = async (): Promise<string> => kurzKennung((await meinGeraet()).id);

/** Holt eine Challenge und signiert `text(challenge)` (beitrittsText bzw. eroeffnungsText) für Beitreten und Eröffnen. */
export async function ausweisen(text: (challenge: string) => string): Promise<GeraetNachweis> {
  const g = await meinGeraet();
  const { challenge } = await postJson<Challenge>('/api/challenge', {});
  const signatur = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, g.paar.privateKey, new TextEncoder().encode(text(challenge))));
  return { pub: g.pub, challenge, signatur: b64url(signatur) };
}
