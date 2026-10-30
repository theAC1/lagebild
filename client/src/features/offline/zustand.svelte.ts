// Offline-Gebiete verwalten: Liste (localStorage), Download-Warteschlange (eines nach dem anderen), Löschen, Ablauf.
import { ANSICHT_CACHE, beiTreffer, oeffneSpeicher } from '../../lib/kachelspeicher.ts';
import { lies, schreibe, toast } from '../../lib/ui.svelte.ts';
import { abgelaufen, anzahl, bereiche, enthaelt, kachelVon, zuLoeschen, type Bbox, type Gebiet, type OfflineKarte } from './kacheln.ts';
import { ladeGebiet } from './laden.ts';

const KEY = 'lagebild.offline.gebiete';
const KEY_UMRISSE = 'lagebild.offline.umrisse';

function geladen(): Gebiet[] {
  try {
    const g = JSON.parse(lies(KEY) ?? '[]');
    return Array.isArray(g) ? g : [];
  } catch {
    return [];
  }
}

class OfflineZustand {
  gebiete = $state<Gebiet[]>(geladen());
  /** ID des Gebiets, das gerade lädt */
  aktiv = $state<string | null>(null);
  /** Download hängt an fehlendem Netz */
  wartet = $state(false);
  umrisse = $state(lies(KEY_UMRISSE) !== '0');
  /** Rechteck aufziehen läuft (Panel ist dann zu) */
  aufziehen = $state(false);
  speicher = $state<{ belegt: number; frei: number; dauerhaft: boolean } | null>(null);
}

export const offline = new OfflineZustand();

let speicherTimer: ReturnType<typeof setTimeout> | undefined;
/** Liste sichern; Fortschritt höchstens jede Sekunde (ein Abbruch lädt dann ein paar Kacheln doppelt an, findet sie aber im Speicher). */
function sichere(sofort = false): void {
  if (!sofort) {
    speicherTimer ??= setTimeout(() => sichere(true), 1000);
    return;
  }
  clearTimeout(speicherTimer);
  speicherTimer = undefined;
  schreibe(KEY, JSON.stringify(offline.gebiete));
}

function aendere(id: string, neu: Partial<Gebiet>, sofort = true): void {
  offline.gebiete = offline.gebiete.map((g) => (g.id === id ? { ...g, ...neu } : g));
  sichere(sofort);
}

export const gebiet = (id: string): Gebiet | undefined => offline.gebiete.find((g) => g.id === id);

export function setzeUmrisse(an: boolean): void {
  offline.umrisse = an;
  schreibe(KEY_UMRISSE, an ? null : '0');
}

export async function aktualisiereSpeicher(): Promise<void> {
  const s = await navigator.storage?.estimate?.().catch(() => null);
  if (!s) return;
  const dauerhaft = (await navigator.storage.persisted?.().catch(() => false)) ?? false;
  offline.speicher = { belegt: s.usage ?? 0, frei: Math.max(0, (s.quota ?? 0) - (s.usage ?? 0)), dauerhaft };
}

// --- Warteschlange ---

let lauf: Promise<void> | null = null;

/** Startet das nächste Gebiet mit Status «laeuft», falls gerade keines lädt. */
export function pumpe(): void {
  if (lauf) return;
  const g = offline.gebiete.find((x) => x.status === 'laeuft');
  if (!g) return;
  lauf = lade(g.id).finally(() => {
    lauf = null;
    offline.aktiv = null;
    offline.wartet = false;
    pumpe();
  });
}

async function lade(id: string): Promise<void> {
  const speicher = await oeffneSpeicher();
  const g = gebiet(id);
  if (!g) return;
  if (!speicher) return aendere(id, { status: 'pausiert', fehler: 'kein Speicher (nur über https)' }); // sonst pumpt die Schlange endlos
  offline.aktiv = id;
  const werkzeug = {
    speicher,
    ansicht: await oeffneSpeicher(ANSICHT_CACHE),
    holen: fetch.bind(globalThis),
    schlafe: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    jetzt: Date.now,
  };
  try {
    const ende = await ladeGebiet(g, werkzeug, () => gebiet(id)?.status === 'laeuft', (s) => {
      offline.wartet = s.wartet;
      if (gebiet(id)) aendere(id, { erledigt: s.erledigt, bytes: s.bytes }, false);
    });
    if (ende === 'fertig' && gebiet(id)) {
      aendere(id, { status: 'fertig', erneuern: false, fehler: undefined });
      toast(`Offline-Karte «${g.name}» geladen.`);
    }
  } catch (e) {
    const voll = e instanceof DOMException && e.name === 'QuotaExceededError';
    if (gebiet(id)) aendere(id, { status: 'pausiert', fehler: voll ? 'Speicher voll' : 'Fehler beim Speichern' });
    toast(voll ? 'Speicher voll: Download pausiert.' : 'Offline-Karte: Speichern fehlgeschlagen, pausiert.');
  }
  void aktualisiereSpeicher();
}

/** Laufenden Download dieses Gebiets anhalten und abwarten. */
async function halteAn(id: string): Promise<void> {
  if (offline.aktiv === id && lauf) await lauf;
}

// --- Aktionen ---

export function neuesGebiet(bbox: Bbox, karten: OfflineKarte[], name: string, jetzt = Date.now(), voll = false): Gebiet {
  const g: Gebiet = {
    id: crypto.randomUUID(),
    name,
    bbox,
    karten,
    voll,
    erstellt: jetzt,
    zuletztGenutzt: jetzt,
    status: 'laeuft',
    erledigt: 0,
    gesamt: anzahl(bereiche({ bbox, karten, voll })),
    bytes: 0,
  };
  offline.gebiete = [...offline.gebiete, g];
  sichere(true);
  void navigator.storage?.persist?.().catch(() => false).then(aktualisiereSpeicher); // sonst darf der Browser bei Platznot räumen
  pumpe();
  return g;
}

export function pausiere(id: string): void {
  aendere(id, { status: 'pausiert' });
}

export function setzeFort(id: string): void {
  aendere(id, { status: 'laeuft', fehler: undefined });
  pumpe();
}

/** Alles neu laden (vorhandene Kacheln werden überschrieben). */
export async function aktualisiere(id: string): Promise<void> {
  aendere(id, { status: 'pausiert' });
  await halteAn(id);
  aendere(id, { status: 'laeuft', erneuern: true, erledigt: 0, bytes: 0, fehler: undefined, zuletztGenutzt: Date.now() });
  pumpe();
}

export function benenne(id: string, name: string): void {
  const n = name.trim();
  if (n) aendere(id, { name: n.slice(0, 80) });
}

/** Gebiet entfernen; Kacheln, die ein anderes Gebiet braucht, bleiben. */
export async function loesche(id: string): Promise<void> {
  const g = gebiet(id);
  if (!g) return;
  aendere(id, { status: 'pausiert' });
  await halteAn(id);
  offline.gebiete = offline.gebiete.filter((x) => x.id !== id);
  sichere(true);
  pumpe();
  const speicher = await oeffneSpeicher();
  if (speicher) for (const url of zuLoeschen(g, offline.gebiete)) await speicher.delete(url);
  void aktualisiereSpeicher();
}

/** Beim Start: abgelaufene Gebiete löschen, unterbrochene Downloads fortsetzen, Nutzung mitschreiben. */
export function starte(): void {
  for (const g of abgelaufen(offline.gebiete, Date.now())) {
    void loesche(g.id);
    toast(`Offline-Karte «${g.name}» nach 60 Tagen ohne Nutzung gelöscht.`, 6000);
  }
  beiTreffer(merkeNutzung);
  pumpe();
}

/** Kachel aus dem Speicher angezeigt → Gebiete, deren Rechteck sie trifft, gelten als genutzt (höchstens minütlich). */
function merkeNutzung(url: string): void {
  const k = kachelVon(url);
  if (!k) return;
  const jetzt = Date.now();
  for (const g of offline.gebiete) {
    if (jetzt - g.zuletztGenutzt > 60_000 && enthaelt(g, k, true)) aendere(g.id, { zuletztGenutzt: jetzt }, false);
  }
}
