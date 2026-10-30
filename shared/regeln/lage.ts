// Teilnehmer, Position, Status, Marker, Chat, Sichtung, Alarm und Lage-Verwaltung (bisher in server/src/ws.ts).
import type { Alarm, Chat, Position, Teilnehmer } from '../protocol.ts';
import { beendeAuftraege, offen } from './bloodhound.ts';
import { lauf, nein, type Befehl, type Ereignis, type Ergebnis, type Lauf, type Zustand } from './typen.ts';

export const MAX_MARKER_JE_LAGE = 2000;
export const MAX_SICHTUNGEN_JE_LAGE = 2000;
/** Schnellere Positionen eines Teilnehmers werden still ignoriert. */
export const POS_MIN_ABSTAND_MS = 1000;

export const LAGE_TYPEN = [
  'pos', 'sendetPos', 'status', 'marker.setzen', 'marker.loeschen', 'chat', 'sichtung',
  'alarm.ausloesen', 'alarm.quittieren', 'alarm.aufheben', 'lage.statusSet', 'lage.beenden', 'teilnehmer.entfernen',
] as const;
type LageBefehl = Extract<Befehl, { typ: (typeof LAGE_TYPEN)[number] }>;

const aktiveAlarme = (z: Zustand, von: string): Alarm[] => z.eintraege('alarm').filter((a) => a.von === von && a.aufgehobenAm === null);
const alarmName = (a: Pick<Alarm, 'art'>): string => (a.art === 'notfall' ? 'Notfall' : 'Feindkontakt');

/** Position übernehmen: Teilnehmer, Spur (nur neue Fixes, kein Duplikat bei Stillstand), an alle. */
function position(l: Lauf, t: Teilnehmer, jetzt: number, pos: Position): void {
  if (!t.pos || pos.t > t.pos.t) l.tu({ was: 'spur', id: t.id, pos });
  l.tu({ was: 'teilnehmer', teilnehmer: { ...t, pos, zuletzt: jetzt } }, { typ: 'pos', id: t.id, pos });
}

export function wendeLage(z: Zustand, e: Ereignis & { msg: LageBefehl }): Ergebnis {
  const { autor: t, msg: m, jetzt } = e;
  const leitung = t.rolle === 'leitung';
  const lage = z.lage;
  const l = lauf(e);
  /** Eigenen Teilnehmer ändern und an alle (online setzt der Verteiler). */
  const teilnehmer = (aenderung: Partial<Teilnehmer>): void => {
    const neu = { ...t, ...aenderung, zuletzt: jetzt };
    l.tu({ was: 'teilnehmer', teilnehmer: neu }, { typ: 'teilnehmer', teilnehmer: neu });
  };

  switch (m.typ) {
    case 'pos': {
      if (jetzt - (z.letztePosAm(t.id) ?? 0) < POS_MIN_ABSTAND_MS) return l.fertig();
      // Emission Control gilt nicht, solange ein eigener Alarm aktiv ist (wie ATAK-Notruf). Sonst still ignoriert.
      if (!t.sendetPos && !aktiveAlarme(z, t.id).length) return l.fertig();
      // staleNach ist per Schema schon auf ≤ STALE_MAX_MS begrenzt und wird unverändert mitgespeichert.
      l.tu({ was: 'posAm', id: t.id, t: jetzt });
      position(l, t, jetzt, m.pos);
      return l.fertig();
    }
    case 'sendetPos':
      teilnehmer({ sendetPos: m.an });
      return l.fertig();
    case 'status': {
      // der eigene, inzwischen aus dem Set entfernte Status bleibt für Freitext-Meldungen gültig
      if (m.status !== t.status && !lage.statusSet.some((s) => s.key === m.status)) return nein('Unbekannter Status');
      teilnehmer({ status: m.status, statusText: m.text });
      l.meldung(m.text, m.status);
      return l.fertig();
    }
    case 'marker.setzen': {
      const alt = m.marker.id ? z.eintrag('marker', m.marker.id) : undefined;
      if (alt && alt.von !== t.id && !leitung) return nein('Keine Berechtigung für diesen Marker');
      const id = m.marker.id ?? e.neueId();
      if (!alt && z.idVergeben('marker', id)) return nein('Marker-ID bereits vergeben');
      if (!alt && z.anzahl('marker') >= MAX_MARKER_JE_LAGE) return nein('Zu viele Marker in dieser Lage');
      const marker = { ...m.marker, id, von: alt?.von ?? t.id, erstelltAm: alt?.erstelltAm ?? jetzt, geaendertAm: jetzt };
      l.tu({ was: 'speichern', art: 'marker', obj: marker, t: marker.erstelltAm }, { typ: 'marker', marker });
      return l.fertig();
    }
    case 'marker.loeschen': {
      const alt = z.eintrag('marker', m.id);
      if (!alt) return nein('Marker nicht gefunden');
      if (alt.von !== t.id && !leitung) return nein('Keine Berechtigung für diesen Marker');
      l.tu({ was: 'loeschen', art: 'marker', id: m.id });
      const auftraege = z.eintraege('bloodhound').filter((a) => offen(a) && a.ziel.art === 'marker' && a.ziel.id === m.id);
      beendeAuftraege(l, jetzt, auftraege, 'Marker gelöscht');
      l.sende({ typ: 'marker.geloescht', id: m.id });
      return l.fertig();
    }
    case 'chat': {
      if (m.an.art === 'person' && !z.teilnehmerAktiv(m.an.id)) return nein('Empfänger nicht gefunden');
      const chat: Chat = { id: e.neueId(), von: t.id, an: m.an, text: m.text, t: jetzt };
      l.tu({ was: 'speichern', art: 'chat', obj: chat, t: jetzt }, { typ: 'chat', chat });
      return l.fertig();
    }
    case 'sichtung': {
      const { fotoId } = m.sichtung;
      if (fotoId !== null && !z.fotoVorhanden(fotoId)) return nein('Foto nicht gefunden');
      if (z.anzahl('sichtung') >= MAX_SICHTUNGEN_JE_LAGE) return nein('Zu viele Sichtungen in dieser Lage');
      const sichtung = { ...m.sichtung, id: e.neueId(), von: t.id, erstelltAm: jetzt };
      l.tu({ was: 'speichern', art: 'sichtung', obj: sichtung, t: jetzt }, { typ: 'sichtung', sichtung });
      return l.fertig();
    }
    case 'alarm.ausloesen': {
      // Pro Person nur ein aktiver Alarm: ein neuer ersetzt den bestehenden.
      for (const alt of aktiveAlarme(z, t.id)) {
        const aufgehoben = { ...alt, aufgehobenAm: jetzt };
        l.tu({ was: 'speichern', art: 'alarm', obj: aufgehoben, t: aufgehoben.t }, { typ: 'alarm', alarm: aufgehoben });
      }
      if (m.pos) position(l, t, jetzt, m.pos);
      const pos = m.pos ?? t.pos;
      const alarm: Alarm = { id: e.neueId(), art: m.art, von: t.id, lat: pos?.lat ?? null, lon: pos?.lon ?? null, t: jetzt, quittiertVon: [], aufgehobenAm: null };
      l.tu({ was: 'speichern', art: 'alarm', obj: alarm, t: jetzt }, { typ: 'alarm', alarm });
      l.meldung(`Alarm ausgelöst: ${alarmName(m)}`);
      return l.fertig();
    }
    case 'alarm.quittieren': {
      const alarm = z.eintrag('alarm', m.id);
      if (!alarm || alarm.aufgehobenAm !== null) return nein('Alarm nicht aktiv');
      if (alarm.quittiertVon.includes(t.id)) return l.fertig();
      const neu = { ...alarm, quittiertVon: [...alarm.quittiertVon, t.id] };
      l.tu({ was: 'speichern', art: 'alarm', obj: neu, t: neu.t }, { typ: 'alarm', alarm: neu });
      return l.fertig();
    }
    case 'alarm.aufheben': {
      const alarm = z.eintrag('alarm', m.id);
      if (!alarm || alarm.aufgehobenAm !== null) return nein('Alarm nicht aktiv');
      if (alarm.von !== t.id && !leitung) return nein('Nur Auslöser oder Leitung können den Alarm aufheben');
      const neu = { ...alarm, aufgehobenAm: jetzt };
      l.tu({ was: 'speichern', art: 'alarm', obj: neu, t: neu.t }, { typ: 'alarm', alarm: neu });
      l.meldung(`Alarm aufgehoben: ${alarmName(alarm)}`);
      return l.fertig();
    }
    case 'lage.statusSet': {
      if (!leitung) return nein('Nur für die Leitung');
      if (new Set(m.statusSet.map((s) => s.key)).size !== m.statusSet.length) return nein('Status-Schlüssel doppelt');
      const neu = { ...lage, statusSet: m.statusSet };
      l.tu({ was: 'lage', lage: neu }, { typ: 'lage', lage: neu });
      return l.fertig();
    }
    case 'lage.beenden': {
      // Der Verteiler schliesst nach dem Delta mit beendeter Lage alle Verbindungen.
      if (!leitung) return nein('Nur für die Leitung');
      const neu = { ...lage, beendetAm: jetzt };
      l.tu({ was: 'lage', lage: neu }, { typ: 'lage', lage: neu });
      return l.fertig();
    }
    case 'teilnehmer.entfernen': {
      // Der Verteiler wirft den Entfernten vor dem Delta 'teilnehmer.weg' hinaus.
      if (!leitung) return nein('Nur für die Leitung');
      if (m.id === t.id) return nein('Sich selbst entfernen ist nicht möglich');
      if (!z.teilnehmerListe(true).some((x) => x.id === m.id)) return nein('Teilnehmer nicht gefunden');
      l.tu({ was: 'entfernen', id: m.id });
      const offene = z.eintraege('bloodhound').filter(offen);
      const anIhn = offene.filter((a) => a.an === m.id);
      beendeAuftraege(l, jetzt, anIhn, 'Empfänger entfernt');
      beendeAuftraege(l, jetzt, offene.filter((a) => !anIhn.includes(a) && a.ziel.art === 'teilnehmer' && a.ziel.id === m.id), 'Ziel entfernt');
      l.sende({ typ: 'teilnehmer.weg', id: m.id });
      return l.fertig();
    }
  }
}
