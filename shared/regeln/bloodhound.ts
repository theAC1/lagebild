// Bloodhound-Aufträge (Linie für alle sichtbar, Meldungen nur an Leitung und Empfänger, nie ans Ziel): erteilen/aufheben Leitung
// und Gruppenführer an die eigene Einheit; quittieren/beendet/erreicht nur der Empfänger. Je Empfänger ein offener.
import type { BloodhoundAuftrag, BloodhoundEnde } from '../protocol.ts';
import { darfAuftrag, einheiten } from './rollen.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Lauf, type Zustand } from './typen.ts';

export const MAX_AUFTRAEGE_JE_LAGE = 1000;

export const offen = (a: BloodhoundAuftrag): boolean => a.ende === null;


const name = (z: Zustand, id: string): string => z.teilnehmerListe(true).find((x) => x.id === id)?.rufname ?? '?';

/** Beendet die offenen Aufträge `treffer` als 'aufgehoben' (Empfänger entfernt, Ziel gelöscht), mit Meldung je Auftrag. */
export function beendeAuftraege(l: Lauf, jetzt: number, treffer: BloodhoundAuftrag[], grund: string): void {
  for (const a of treffer) {
    const neu: BloodhoundAuftrag = { ...a, ende: 'aufgehoben', endeAm: jetzt };
    l.tu({ was: 'speichern', art: 'bloodhound', obj: neu, t: neu.erstelltAm }, { typ: 'bloodhound', auftrag: neu });
    l.meldung(`Bloodhound-Auftrag aufgehoben (${grund})`, null, [a.an]);
  }
}

export const BLOODHOUND_TYPEN = ['bloodhound.auftrag', 'bloodhound.aufheben', 'bloodhound.quittieren', 'bloodhound.beendet', 'bloodhound.erreicht'] as const;
type BloodhoundBefehl = Extract<Befehl, { typ: (typeof BLOODHOUND_TYPEN)[number] }>;

export function wendeBloodhound(z: Zustand, e: Ereignis & { msg: BloodhoundBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  const einheit = einheiten(z);
  const fuehrt = (an: string): boolean => darfAuftrag(t, an, einheit);
  const l = lauf(e);
  const speichere = (a: BloodhoundAuftrag): void => l.tu({ was: 'speichern', art: 'bloodhound', obj: a, t: a.erstelltAm }, { typ: 'bloodhound', auftrag: a });

  if (m.typ === 'bloodhound.auftrag') {
    if (!z.teilnehmerAktiv(m.an)) return nein('Empfänger nicht gefunden');
    if (!fuehrt(m.an)) return nein('Nur Leitung oder Gruppenführer der Einheit');
    if (z.teilnehmerListe().find((x) => x.id === m.an)?.rolle === 'beobachter') return nein('Beobachter bekommen keine Aufträge');
    const ziel = m.ziel;
    const vorhanden = ziel.art === 'punkt' ? true : ziel.art === 'teilnehmer' ? z.teilnehmerAktiv(ziel.id!) : !!z.eintrag(ziel.art, ziel.id!);
    if (!vorhanden) return nein('Ziel nicht gefunden');
    if (ziel.art === 'teilnehmer' && ziel.id === m.an) return nein('Ziel ist der Empfänger selbst');
    if (z.anzahl('bloodhound') >= MAX_AUFTRAEGE_JE_LAGE) return nein('Zu viele Bloodhound-Aufträge in dieser Lage');
    // ein offener Auftrag je Empfänger: der neue ersetzt den alten
    for (const alt of z.eintraege('bloodhound').filter((a) => offen(a) && a.an === m.an)) speichere({ ...alt, ende: 'aufgehoben', endeAm: jetzt });
    speichere({ id: e.neueId(), von: t.id, an: m.an, ziel, erstelltAm: jetzt, quittiertAm: null, ende: null, endeAm: null });
    l.meldung(`Bloodhound-Auftrag an ${name(z, m.an)}`, null, [m.an]);
    return l.fertig();
  }

  const a = z.eintrag('bloodhound', m.id);
  if (!a || !offen(a)) return nein('Auftrag nicht aktiv');
  if (m.typ === 'bloodhound.aufheben') {
    if (!fuehrt(a.an)) return nein('Nur Leitung oder Gruppenführer der Einheit');
  } else if (a.an !== t.id) return nein('Nur der Empfänger kann den Auftrag bearbeiten');
  if (m.typ === 'bloodhound.quittieren') {
    if (a.quittiertAm === null) speichere({ ...a, quittiertAm: jetzt });
    return l.fertig();
  }
  const ende: BloodhoundEnde = m.typ === 'bloodhound.aufheben' ? 'aufgehoben' : m.typ === 'bloodhound.beendet' ? 'beendet' : 'erreicht';
  speichere({ ...a, ende, endeAm: jetzt });
  l.meldung({ aufgehoben: `Bloodhound-Auftrag an ${name(z, a.an)} aufgehoben`, beendet: 'Bloodhound beendet', erreicht: 'Bloodhound-Ziel erreicht' }[ende], null, [a.an]);
  return l.fertig();
}
