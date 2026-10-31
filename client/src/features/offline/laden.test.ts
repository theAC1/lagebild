import { describe, expect, it } from 'vitest';
import { anzahl, bereiche, type Gebiet } from './kacheln.ts';
import { ABSTAND_MS, drossel, ladeGebiet, type Stand, type Werkzeug } from './laden.ts';

const g0: Gebiet = {
  id: 'g', name: 'Test', bbox: [7.6, 46.75, 7.605, 46.755], karten: ['farbe', 'taufe'],
  erstellt: 0, zuletztGenutzt: 0, status: 'laeuft', erledigt: 0, gesamt: 0, bytes: 0,
};
const GESAMT = anzahl(bereiche(g0));

class FakeCache {
  daten = new Map<string, Response>();
  async match(url: string) {
    return this.daten.get(url)?.clone();
  }
  async put(url: string, r: Response) {
    this.daten.set(url, r);
  }
  async delete(url: string) {
    return this.daten.delete(url);
  }
}

function werkzeug(holen?: (url: string) => Promise<Response>) {
  const speicher = new FakeCache();
  const ansicht = new FakeCache();
  let uhr = 0;
  const geholt: string[] = [];
  const w: Werkzeug = {
    speicher: speicher as unknown as Cache,
    ansicht: ansicht as unknown as Cache,
    holen: (async (u: string) => {
      geholt.push(u);
      return holen ? holen(u) : new Response(new Uint8Array(10));
    }) as typeof fetch,
    schlafe: async (ms) => void (uhr += ms),
    jetzt: () => uhr,
  };
  return { w, speicher, ansicht, geholt };
}

describe('ladeGebiet', () => {
  it('lädt jede Kachel genau einmal und zählt die Bytes; Aktualisieren lädt vorhandene neu', async () => {
    const { w, speicher, geholt } = werkzeug();
    let stand: Stand | null = null;
    expect(await ladeGebiet(g0, w, () => true, (s) => (stand = s))).toBe('fertig');
    expect(new Set(geholt).size).toBe(GESAMT);
    expect(geholt).toHaveLength(GESAMT);
    expect(speicher.daten.size).toBe(GESAMT);
    expect(stand).toEqual({ erledigt: GESAMT, bytes: GESAMT * 10, wartet: false });
    await ladeGebiet({ ...g0, erneuern: true }, w, () => true, () => {});
    expect(geholt).toHaveLength(2 * GESAMT);
  });

  it('Wiederaufnahme nach Abbruch: nichts doppelt, nichts fehlt', async () => {
    const { w, speicher, geholt } = werkzeug();
    let stand: Stand = { erledigt: 0, bytes: 0, wartet: false };
    expect(await ladeGebiet(g0, w, () => geholt.length < 7, (s) => (stand = s))).toBe('angehalten');
    expect(stand.erledigt).toBeGreaterThan(0);
    expect(stand.erledigt).toBeLessThan(GESAMT);
    // App zu, beim nächsten Öffnen mit gespeichertem Stand weiter
    expect(await ladeGebiet({ ...g0, ...stand }, w, () => true, (s) => (stand = s))).toBe('fertig');
    expect(stand.erledigt).toBe(GESAMT);
    expect(stand.bytes).toBe(GESAMT * 10);
    expect(new Set(geholt).size).toBe(geholt.length);
    expect(speicher.daten.size).toBe(GESAMT);
  });

  it('wartet ohne Netz und lädt danach weiter; 404/400 gilt als erledigt, Serverfehler wird wiederholt', async () => {
    let fehler = 3;
    const offline = werkzeug(async () => {
      if (fehler-- > 0) throw new TypeError('Failed to fetch');
      return new Response(new Uint8Array(1));
    });
    const wartet: boolean[] = [];
    expect(await ladeGebiet(g0, offline.w, () => true, (s) => wartet.push(s.wartet))).toBe('fertig');
    expect(wartet).toContain(true);
    expect(wartet.at(-1)).toBe(false);

    let n = 0;
    const { w, speicher } = werkzeug(async () => {
      n++;
      if (n === 1) return new Response(null, { status: 503 });
      if (n === 2) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(1));
    });
    expect(await ladeGebiet(g0, w, () => true, () => {})).toBe('fertig');
    expect(speicher.daten.size).toBe(GESAMT - 1);
  });

  it('Speicher voll bricht mit Fehler ab', async () => {
    const { w, speicher } = werkzeug();
    speicher.put = async () => {
      throw new DOMException('voll', 'QuotaExceededError');
    };
    await expect(ladeGebiet(g0, w, () => true, () => {})).rejects.toThrow('voll');
  });

  it('verschiebt schon angezeigte Kacheln aus dem Workbox-Cache statt sie neu zu laden', async () => {
    const { w, speicher, ansicht, geholt } = werkzeug();
    const url = 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/5/16/11.jpeg';
    ansicht.daten.set(url, new Response(new Uint8Array(5), { headers: { 'content-type': 'image/jpeg' } }));
    await ladeGebiet(g0, w, () => true, () => {});
    expect(geholt).not.toContain(url);
    expect(ansicht.daten.has(url)).toBe(false);
    expect(speicher.daten.has(url)).toBe(true);
  });

});

describe('drossel', () => {
  it('hält je Dienst den Mindestabstand ein, Dienste unabhängig', async () => {
    let uhr = 0;
    const starts: Record<string, number[]> = {};
    const warte = drossel({ schlafe: async (ms) => void (uhr += ms), jetzt: () => uhr });
    const an = async (u: string) => {
      await warte(u);
      (starts[new URL(u).hostname] ??= []).push(uhr);
    };
    for (let i = 0; i < 4; i++) {
      await an('https://wmts.geo.admin.ch/a');
      await an('https://vectortiles.geo.admin.ch/b');
    }
    const abstaende = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]);
    for (const d of abstaende(starts['vectortiles.geo.admin.ch'])) expect(d).toBeGreaterThanOrEqual(ABSTAND_MS['vectortiles.geo.admin.ch'] - 1e-9);
    expect(uhr).toBeLessThan(4 * ABSTAND_MS['vectortiles.geo.admin.ch'] + 1);
  });
});
