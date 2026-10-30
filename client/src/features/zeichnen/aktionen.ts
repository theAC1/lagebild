// Senden an den Server mit Rückgängig-Verlauf. Alles, was Zeichnungen ändert, läuft hier durch.
import type { ClientMsg, ServerMsg } from '../../../../shared/protocol.ts';
import { beiNachricht, sendeBestaetigt, store } from '../../lib/store.svelte.ts';
import { toast } from '../../lib/ui.svelte.ts';
import { zuInhalt } from './logik.ts';
import { nachrichten, type Eintrag, type ZInhalt } from './verlauf.ts';
import { ablage, darf, verlauf, zn } from './zustand.svelte.ts';

const OHNE_VERBINDUNG = 'Keine Verbindung – Zeichnung nicht gespeichert.';

/** Zufällige ID ohne crypto.randomUUID (fehlt ausserhalb von HTTPS, z. B. im LAN über http). */
export function neueId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return `z${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

const idsVon = (m: ClientMsg): Set<string> =>
  new Set(m.typ === 'zeichnung.loeschen' ? m.ids : m.typ === 'zeichnung.neu' || m.typ === 'zeichnung.aendern' ? m.zeichnungen.map((z) => z.id!) : []);

/** Echo des Servers zu einer Zeichnungs-Nachricht. */
const echo = (msg: ClientMsg) => {
  const ids = idsVon(msg);
  return (m: ServerMsg) =>
    (m.typ === 'zeichnungen' && m.zeichnungen.some((z) => ids.has(z.id))) || (m.typ === 'zeichnungen.geloescht' && m.ids.some((id) => ids.has(id)));
};

/**
 * Nachrichten eines Verlaufsschritts senden. Lehnt der Server ab (Rechte, gesperrte Ebene), fliegt der Eintrag aus dem
 * Verlauf und die lokale Vorschau verfällt; der Fehlertext kommt als Toast vom Kern.
 */
async function sende(e: Eintrag, msgs: ClientMsg[]): Promise<boolean> {
  if (store.verbindung !== 'verbunden') {
    verlauf.entferne(e);
    zn.vorschau.clear();
    zn.verlaufStand++;
    toast(OHNE_VERBINDUNG);
    return false;
  }
  zn.verlaufStand++;
  // ponytail: Stücke (> 100) sind je für sich alles-oder-nichts; scheitert ein späteres, bleibt das frühere bestehen.
  const ergebnisse = await Promise.all(msgs.map((m) => sendeBestaetigt(m, echo(m))));
  if (ergebnisse.includes('abgelehnt')) {
    verlauf.entferne(e);
    zn.vorschau.clear();
    zn.verlaufStand++;
    return false;
  }
  if (ergebnisse.includes('unbestaetigt')) {
    zn.vorschau.clear(); // sonst bliebe eine nie bestätigte Fassung lokal stehen
    toast('Zeichnung nicht bestätigt – Verbindung prüfen.');
  }
  return true;
}

function tue(e: Eintrag): Promise<boolean> {
  verlauf.tue(e);
  return sende(e, nachrichten(e, 'vor'));
}

export function erstelle(inhalte: ZInhalt[]): Promise<boolean> {
  return inhalte.length ? tue({ typ: 'neu', zeichnungen: inhalte }) : Promise.resolve(false);
}

/** Neue Fassung bestehender Zeichnungen senden; bis zum Echo zeigt die Karte schon die neue Fassung. */
export function aendere(nachher: ZInhalt[]): Promise<boolean> {
  const vorher = nachher.map((z) => store.zeichnungen.get(z.id)).filter((z) => !!z);
  if (!vorher.length) return Promise.resolve(false);
  const neu = nachher.filter((z) => store.zeichnungen.has(z.id));
  for (const z of neu) zn.vorschau.set(z.id, z);
  return tue({ typ: 'aendern', vorher: vorher.map(zuInhalt), nachher: neu });
}

export function loesche(ids: string[]): Promise<boolean> {
  const alte = ids.map((id) => store.zeichnungen.get(id)).filter((z) => !!z && darf(z));
  if (!alte.length) return Promise.resolve(false);
  for (const z of alte) zn.auswahl.delete(z!.id);
  if (zn.griff && !store.zeichnungen.has(zn.griff.id)) zn.griff = null;
  return tue({ typ: 'loeschen', zeichnungen: alte.map((z) => ({ ...zuInhalt(z!), von: z!.von })) });
}

export function rueckgaengig(): void {
  const r = verlauf.rueckgaengig();
  if (!r) return toast('Nichts zum Rückgängigmachen');
  zn.griff = null;
  void sende(r.eintrag, r.msgs);
}

export function wiederholen(): void {
  const r = verlauf.wiederholen();
  if (!r) return toast('Nichts zum Wiederholen');
  zn.griff = null;
  void sende(r.eintrag, r.msgs);
}

/** Auswahl in die Zwischenablage (auch fremde Zeichnungen – Kopieren ist Lesen). */
export function kopiere(ids: string[]): void {
  const zs = ids.map((id) => store.zeichnungen.get(id)).filter((z) => !!z);
  if (!zs.length) return;
  ablage.inhalte = zs.map((z) => zuInhalt(z!));
  ablage.eingefuegt = 0;
  toast(zs.length === 1 ? 'Zeichnung kopiert – Ctrl+V fügt ein' : `${zs.length} Zeichnungen kopiert – Ctrl+V fügt ein`);
}

/** Vorschau verfällt, sobald der Server die Zeichnung bestätigt (oder ablehnt). Gibt die Abmeldung zurück. */
export function beobachteEcho(): () => void {
  return beiNachricht((m) => {
    if (m.typ === 'zeichnungen') for (const z of m.zeichnungen) zn.vorschau.delete(z.id);
    else if (m.typ === 'zeichnungen.geloescht' || m.typ === 'ebene.geloescht') {
      const ids = m.typ === 'ebene.geloescht' ? m.zeichnungIds : m.ids;
      for (const id of ids) {
        zn.vorschau.delete(id);
        zn.auswahl.delete(id);
      }
      if (zn.griff && ids.includes(zn.griff.id)) zn.griff = null;
      if (zn.mobilBearbeiten && ids.includes(zn.mobilBearbeiten)) zn.mobilBearbeiten = null;
    } else if (m.typ === 'snapshot') zn.vorschau.clear();
  });
}
