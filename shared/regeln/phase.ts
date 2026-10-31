// Phasen AP/LV/AN (Spec v6): was je Phase erlaubt ist, Phasenwechsel durch die Leitung, Debriefing-Notizen in AN.
import { MAX_NOTIZEN_JE_LAGE, MAX_PHASENWECHSEL, phaseVon, type Lage, type Notiz, type Phase } from '../protocol.ts';
import { beendeAuftraege, offen } from './bloodhound.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Zustand } from './typen.ts';

export const PHASE_TYPEN = ['lage.phase', 'notiz.neu', 'notiz.loeschen'] as const;
type PhaseBefehl = Extract<Befehl, { typ: (typeof PHASE_TYPEN)[number] }>;

export const PHASE_NAME: Record<Phase, string> = { ap: 'Aktionsplanung', lv: 'Lageverfolgung', an: 'Aktionsnachbearbeitung' };
/** Erlaubte Wechsel: vor und zurück, aber AP und AN nur über LV. */
export const WECHSEL: Record<Phase, Phase[]> = { ap: ['lv'], lv: ['ap', 'an'], an: ['lv'] };

/** Rollen und eigene Angaben sind kein Lageinhalt: in jeder Phase. */
const ROLLEN = ['ich.aendern', 'teilnehmer.aendern', 'leitung.uebergeben'] as const;
/** In AP erlaubt: planen und absprechen. Keine Position, kein Status, keine Sichtung, kein Alarm, kein Bloodhound. */
const AP = new Set<Befehl['typ']>([
  'sendetPos', 'marker.setzen', 'marker.loeschen', 'zeichnung.neu', 'zeichnung.aendern', 'zeichnung.loeschen',
  'ebene.neu', 'ebene.aendern', 'ebene.loeschen', 'taufe.neu', 'taufe.aendern', 'taufe.loeschen', 'lage.taufListen',
  'raster.setzen', 'raster.fixieren', 'raster.loeschen', 'chat', 'lage.statusSet', 'teilnehmer.entfernen', 'lage.phase', ...ROLLEN,
]);
const AN = new Set<Befehl['typ']>(['lage.phase', 'notiz.neu', 'notiz.loeschen', ...ROLLEN]);

/**
 * Sperre der Phase vor allen anderen Regeln: undefined = weiter prüfen. Positionen ausserhalb LV verwirft sie still
 * (ältere Geräte senden weiter), alles andere lehnt sie mit Grund ab.
 */
export function phasenSperre(lage: Lage, typ: Befehl['typ']): Ergebnis | undefined {
  const phase = phaseVon(lage);
  if (phase === 'lv') return typ === 'notiz.neu' || typ === 'notiz.loeschen' ? nein('Notizen nur in der Nachbearbeitung') : undefined;
  if (typ === 'pos') return { aenderungen: [], deltas: [] };
  if (phase === 'ap') return AP.has(typ) ? undefined : nein('In der Aktionsplanung nicht möglich');
  return AN.has(typ) ? undefined : nein('Nachbearbeitung: nur lesen');
}

export function wendePhase(z: Zustand, e: Ereignis & { msg: PhaseBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  if (t.rolle !== 'leitung') return nein('Nur für die Leitung');
  const l = lauf(e);
  switch (m.typ) {
    case 'lage.phase': {
      const alt = phaseVon(z.lage);
      if (!WECHSEL[alt].includes(m.phase)) return nein(`Wechsel ${alt.toUpperCase()} → ${m.phase.toUpperCase()} nicht möglich`);
      if (z.lage.phasen.length >= MAX_PHASENWECHSEL) return nein('Zu viele Phasenwechsel');
      if (alt === 'lv') {
        // Wiedergabe und Liste sollen sauber enden: offene Alarme und Aufträge schliessen
        for (const a of z.eintraege('alarm').filter((a) => a.aufgehobenAm === null)) {
          const neu = { ...a, aufgehobenAm: jetzt };
          l.tu({ was: 'speichern', art: 'alarm', obj: neu, t: neu.t }, { typ: 'alarm', alarm: neu });
        }
        beendeAuftraege(l, jetzt, z.eintraege('bloodhound').filter(offen), 'Phase gewechselt');
      }
      const lage = { ...z.lage, phasen: [...z.lage.phasen, { phase: m.phase, t: jetzt }] };
      l.tu({ was: 'lage', lage }, { typ: 'lage', lage });
      l.meldung(`Phase: ${PHASE_NAME[m.phase]}`);
      return l.fertig();
    }
    case 'notiz.neu': {
      if (m.t > jetzt) return nein('Zeitpunkt liegt in der Zukunft');
      if (z.anzahl('notiz') >= MAX_NOTIZEN_JE_LAGE) return nein('Zu viele Notizen in dieser Lage');
      const notiz: Notiz = { id: e.neueId(), von: t.id, t: m.t, text: m.text, erstelltAm: jetzt };
      l.tu({ was: 'speichern', art: 'notiz', obj: notiz, t: notiz.t }, { typ: 'notiz', notiz });
      return l.fertig();
    }
    case 'notiz.loeschen':
      if (!z.eintrag('notiz', m.id)) return nein('Notiz nicht gefunden');
      l.tu({ was: 'loeschen', art: 'notiz', id: m.id }, { typ: 'notiz.geloescht', id: m.id });
      return l.fertig();
  }
}
