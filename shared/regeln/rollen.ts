// Rollen (Spec v7): wer fremde Objekte ändern darf, Beobachter, eigene Angaben, Rolle/Einheit setzen, Leitung übergeben,
// Wiederbeitritt desselben Geräts.
import type { CodeRolle, Rolle, Teilnehmer } from '../protocol.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Zustand } from './typen.ts';

export const ROLLE_NAME: Record<Rolle, string> = { leitung: 'Leitung', gruppenfuehrer: 'Gruppenführer', teilnehmer: 'Teilnehmer', beobachter: 'Beobachter' };
const RANG: Record<Rolle, number> = { beobachter: 0, teilnehmer: 1, gruppenfuehrer: 2, leitung: 3 };
/** Alle ausser Beobachter: wer Lageinhalt sendet (Oberfläche blendet die übrigen Knöpfe aus). */
export const OHNE_BEOBACHTER: Rolle[] = ['leitung', 'gruppenfuehrer', 'teilnehmer'];

type Wer = Pick<Teilnehmer, 'id' | 'rolle' | 'einheit'>;
/** Einheit eines (auch entfernten) Teilnehmers; undefined = unbekannt. */
export type EinheitVon = (id: string) => string | undefined;

/** «Darf ändern» (auch löschen): Ersteller (nicht als Beobachter), Gruppenführer derselben Einheit wie der Ersteller, Leitung. */
export const darfAendern = (wer: Wer, von: string, einheitVon: EinheitVon): boolean =>
  wer.rolle === 'leitung' || (wer.rolle !== 'beobachter' && von === wer.id) || (wer.rolle === 'gruppenfuehrer' && einheitVon(von) === wer.einheit);

/** Bloodhound-Auftrag an `an` erteilen oder aufheben: Leitung, Gruppenführer der Einheit von `an`. */
export const darfAuftrag = (wer: Wer, an: string, einheitVon: EinheitVon): boolean =>
  wer.rolle === 'leitung' || (wer.rolle === 'gruppenfuehrer' && einheitVon(an) === wer.einheit);

/** Einheiten aus dem Zustand, je Ereignis höchstens einmal gelesen. */
export function einheiten(z: Zustand): EinheitVon {
  let m: Map<string, string> | undefined;
  return (id) => (m ??= new Map(z.teilnehmerListe(true).map((t) => [t.id, t.einheit]))).get(id);
}

/**
 * Wiederbeitritt desselben Geräts: gleicher Eintrag, Rufname und Funktion aus dem Beitritt, die Rolle wird höchstens
 * angehoben (ein Code gibt nie Leitung). Ein entfernter Eintrag kommt wie neu zurück: Angaben und Rolle allein aus dem Beitritt.
 */
export function wiederbeitritt(alt: Teilnehmer, entfernt: boolean, neu: Pick<Teilnehmer, 'rufname' | 'funktion' | 'einheit' | 'sidc'>, code: CodeRolle): Teilnehmer {
  const { rufname, funktion, einheit, sidc } = neu;
  if (entfernt) return { ...alt, rufname, funktion, einheit, sidc, rolle: code };
  return { ...alt, rufname, funktion, rolle: RANG[alt.rolle] > RANG[code] ? alt.rolle : code };
}

/** Beobachter sehen nur: Positionen still verwerfen, eigene Angaben erlauben, alles andere ablehnen. undefined = weiter prüfen. */
export function beobachterSperre(e: Ereignis): Ergebnis | undefined {
  if (e.autor.rolle !== 'beobachter' || e.msg.typ === 'ich.aendern') return undefined;
  return e.msg.typ === 'pos' ? { aenderungen: [], deltas: [] } : nein('Beobachter: nur lesen');
}

export const ROLLEN_TYPEN = ['ich.aendern', 'teilnehmer.aendern', 'leitung.uebergeben'] as const;
type RollenBefehl = Extract<Befehl, { typ: (typeof ROLLEN_TYPEN)[number] }>;

export function wendeRollen(z: Zustand, e: Ereignis & { msg: RollenBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  const l = lauf(e);
  const speichere = (x: Teilnehmer): void => l.tu({ was: 'teilnehmer', teilnehmer: x }, { typ: 'teilnehmer', teilnehmer: x });

  if (m.typ === 'ich.aendern') {
    // sonst holte sich ein Gruppenführer Rechte über eine fremde Einheit; seine Einheit setzt die Leitung
    if (t.rolle === 'gruppenfuehrer' && m.einheit !== undefined && m.einheit !== t.einheit) return nein('Die Einheit eines Gruppenführers ändert die Leitung');
    const neu = { ...t, rufname: m.rufname ?? t.rufname, funktion: m.funktion ?? t.funktion, einheit: m.einheit ?? t.einheit, sidc: m.sidc ?? t.sidc, zuletzt: jetzt };
    speichere(neu);
    if (neu.rufname !== t.rufname) l.meldung(`${t.rufname} heisst jetzt ${neu.rufname}`);
    return l.fertig();
  }

  if (t.rolle !== 'leitung') return nein('Nur für die Leitung');
  if (m.id === t.id) return nein('Nicht für sich selbst');
  const ziel = z.teilnehmerListe().find((x) => x.id === m.id);
  if (!ziel) return nein('Teilnehmer nicht gefunden');

  if (m.typ === 'teilnehmer.aendern') {
    const neu = { ...ziel, rolle: m.rolle ?? ziel.rolle, einheit: m.einheit ?? ziel.einheit };
    if (neu.rolle === ziel.rolle && neu.einheit === ziel.einheit) return l.fertig();
    speichere(neu);
    if (neu.rolle !== ziel.rolle) l.meldung(`${ziel.rufname} ist jetzt ${ROLLE_NAME[neu.rolle]}`);
    if (neu.einheit !== ziel.einheit) l.meldung(`${ziel.rufname} ist jetzt in ${neu.einheit}`);
    return l.fertig();
  }

  // leitung.uebergeben: genau eine Leitung, die bisherige wird Teilnehmer
  if (ziel.rolle === 'beobachter') return nein('Beobachter können nicht Leitung werden');
  if (!ziel.online) return nein(`${ziel.rufname} ist nicht verbunden`);
  speichere({ ...t, rolle: 'teilnehmer', zuletzt: jetzt });
  speichere({ ...ziel, rolle: 'leitung' });
  l.meldung(`Leitung an ${ziel.rufname} übergeben`);
  return l.fertig();
}
