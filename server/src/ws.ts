// WebSocket: Anmeldung per hallo, Snapshot, Deltas pro Lage, Rechte, Chat-Filter.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMsg, PING_MS, type Alarm, type Chat, type Lage, type Meldung, type Position, type ServerMsg, type Teilnehmer } from '../../shared/protocol.ts';
import type { Db } from './db.ts';
import { sichtbareAuftraege, verarbeiteZeichnen } from './zeichnen.ts';
import { log, neuerCode, rateLimiter, sha256 } from './sicherheit.ts';

const HALLO_TIMEOUT_MS = 5000;
const POS_MIN_ABSTAND_MS = 1000;
// Grenze/Freihand mit 2000 Punkten sind ~75 KB; bis zu 100 Zeichnungen je Nachricht
const MAX_NACHRICHT = 256 * 1024;
/** Je Teilnehmer gleichzeitig (Tabs, Reconnect-Überlappung); eine neue Verbindung schliesst die älteste. */
const MAX_VERBINDUNGEN_JE_TEILNEHMER = 3;
/** Je IP gleichzeitig offene Verbindungen ohne hallo. */
const MAX_OHNE_HALLO_JE_IP = 20;
export const MAX_MARKER_JE_LAGE = 2000;
export const MAX_SICHTUNGEN_JE_LAGE = 2000;
/** Snapshot: so viele Chats werden geladen, bevor nach Empfänger gefiltert wird (davon höchstens 500 gesendet). */
const CHAT_SNAPSHOT_ROH = 2000;

type Verbindung = { ws: WebSocket; lageId: string; id: string; rolle: Teilnehmer['rolle']; einheit: string; tokenHash: string; lebt: boolean };
type Ich = { v: Verbindung; t: Teilnehmer; lage: Lage };

export function sichtbar(c: Chat, empfaenger: { id: string; einheit: string }): boolean {
  if (c.von === empfaenger.id) return true;
  if (c.an.art === 'alle') return true;
  if (c.an.art === 'einheit') return c.an.einheit === empfaenger.einheit;
  return c.an.id === empfaenger.id;
}

export function starteWs(server: Server, db: Db, clientIp: (req: IncomingMessage) => string) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_NACHRICHT });
  const lagen = new Map<string, Set<Verbindung>>();
  // Limits je Teilnehmer, nicht je Verbindung: sonst vervielfacht jede weitere Verbindung desselben Tokens sie
  const limitNachrichten = rateLimiter(50, 10_000);
  const letztePos = new Map<string, number>();
  const ohneHallo = new Map<string, number>();

  const verbindungen = (lageId: string): Set<Verbindung> => lagen.get(lageId) ?? new Set();
  const senden = (ws: WebSocket, m: ServerMsg): void => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  };
  const anAlle = (lageId: string, m: ServerMsg): void => {
    const text = JSON.stringify(m);
    for (const v of verbindungen(lageId)) if (v.ws.readyState === v.ws.OPEN) v.ws.send(text);
  };
  const istOnline = (lageId: string, id: string): boolean => [...verbindungen(lageId)].some((v) => v.id === id);
  const mitOnline = (lageId: string, t: Teilnehmer): Teilnehmer => ({ ...t, online: istOnline(lageId, t.id) });
  const fehler = (v: Verbindung, meldung: string): void => senden(v.ws, { typ: 'fehler', meldung });

  /** 'beendet'; bei beendeter Lage bekommt die Leitung die Lage mit (sie darf noch exportieren und löschen). */
  const beendet = (rolle: Teilnehmer['rolle'], lage: Lage | undefined): ServerMsg =>
    rolle === 'leitung' && lage && lage.beendetAm !== null ? { typ: 'beendet', lage } : { typ: 'beendet' };

  /** Schliesst alle Verbindungen einer Lage (oder nur die eines Teilnehmers) mit 'beendet'. */
  function rauswerfen(lageId: string, nurId?: string): void {
    const lage = db.lage(lageId);
    for (const v of verbindungen(lageId)) {
      if (nurId && v.id !== nurId) continue;
      senden(v.ws, beendet(v.rolle, lage));
      verbindungen(lageId).delete(v);
      v.ws.close(4000, 'beendet');
    }
    if (!verbindungen(lageId).size) lagen.delete(lageId);
  }

  function meldung(lageId: string, von: string, status: string | null, text: string): void {
    const m: Meldung = { id: randomUUID(), von, status, text: text.slice(0, 200), t: Date.now() };
    db.speichern(lageId, 'meldung', m, m.t);
    anAlle(lageId, { typ: 'meldung', meldung: m });
  }

  function snapshot(v: Verbindung, lage: Lage): ServerMsg {
    const ich = { id: v.id, einheit: v.einheit };
    return {
      typ: 'snapshot',
      ich: v.id,
      lage,
      teilnehmer: db.teilnehmerListe(lage.id).map((t) => mitOnline(lage.id, t)),
      marker: db.eintraege(lage.id, 'marker'),
      // ponytail: nur die letzten CHAT_SNAPSHOT_ROH der Lage; wer viele fremde Einheits-/Direktchats verpasst, sieht weniger als 500
      chat: db.eintraege(lage.id, 'chat', CHAT_SNAPSHOT_ROH).filter((c) => sichtbar(c, ich)).slice(-500),
      sichtungen: db.eintraege(lage.id, 'sichtung'),
      ebenen: db.ebenenSicherstellen(lage.id),
      zeichnungen: db.eintraege(lage.id, 'zeichnung'),
      bloodhound: sichtbareAuftraege(db, lage.id, v),
      alarme: db.eintraege(lage.id, 'alarm').filter((a) => a.aufgehobenAm === null),
      meldungen: db.eintraege(lage.id, 'meldung', 200),
      serverZeit: Date.now(),
    };
  }

  function hallo(ws: WebSocket, token: string): Verbindung | undefined {
    const tokenHash = sha256(token);
    const gefunden = db.teilnehmerNachToken(tokenHash);
    const lage = gefunden && db.lage(gefunden.lageId);
    if (!gefunden || !lage || lage.beendetAm !== null) {
      senden(ws, beendet(gefunden?.teilnehmer.rolle ?? 'teilnehmer', lage));
      ws.close(4001, 'unbekannt oder beendet');
      return undefined;
    }
    const t = gefunden.teilnehmer;
    const v: Verbindung = { ws, lageId: lage.id, id: t.id, rolle: t.rolle, einheit: t.einheit, tokenHash, lebt: true };
    if (!lagen.has(lage.id)) lagen.set(lage.id, new Set());
    const set = lagen.get(lage.id)!;
    const eigene = [...set].filter((x) => x.id === t.id);
    for (const alt of eigene.slice(0, Math.max(0, eigene.length + 1 - MAX_VERBINDUNGEN_JE_TEILNEHMER))) {
      set.delete(alt);
      alt.ws.close(4004, 'zu viele Verbindungen');
    }
    set.add(v);
    const jetzt = { ...t, zuletzt: Date.now() };
    db.teilnehmerSpeichern(jetzt);
    senden(ws, snapshot(v, lage));
    anAlle(lage.id, { typ: 'teilnehmer', teilnehmer: mitOnline(lage.id, jetzt) });
    log('info', 'verbunden', { lageId: lage.id, teilnehmerId: t.id });
    return v;
  }

  function trennen(v: Verbindung): void {
    const set = lagen.get(v.lageId);
    if (!set?.delete(v)) return;
    if (!set.size) lagen.delete(v.lageId);
    const gefunden = db.teilnehmerNachToken(v.tokenHash);
    if (!gefunden) return;
    const t = { ...gefunden.teilnehmer, zuletzt: Date.now() };
    db.teilnehmerSpeichern(t);
    anAlle(v.lageId, { typ: 'teilnehmer', teilnehmer: mitOnline(v.lageId, t) });
  }

  const aktiveAlarme = (lageId: string, von: string): Alarm[] =>
    db.eintraege(lageId, 'alarm').filter((a) => a.von === von && a.aufgehobenAm === null);

  /** Position übernehmen: Teilnehmer, Spur (nur neue Fixes, kein Duplikat bei Stillstand), an alle. */
  function positionVerteilen(ich: Ich, pos: Position): void {
    if (!ich.t.pos || pos.t > ich.t.pos.t) db.spurAnhaengen(ich.lage.id, ich.t.id, pos);
    speichereTeilnehmer(ich, { pos });
    anAlle(ich.lage.id, { typ: 'pos', id: ich.t.id, pos });
  }

  function speichereTeilnehmer(ich: Ich, aenderung: Partial<Teilnehmer>): Teilnehmer {
    const t = { ...ich.t, ...aenderung, zuletzt: Date.now() };
    db.teilnehmerSpeichern(t);
    return mitOnline(ich.lage.id, t);
  }

  function verarbeite(ich: Ich, m: ClientMsg): void {
    const { v, t, lage } = ich;
    const leitung = t.rolle === 'leitung';
    const jetzt = Date.now();
    const u = {
      db,
      anAlle,
      anLeitungUnd: (lageId: string, id: string, msg: ServerMsg) => {
        for (const e of verbindungen(lageId)) if (e.rolle === 'leitung' || e.id === id) senden(e.ws, msg);
      },
      fehler: (text: string) => fehler(v, text),
      meldung: (lageId: string, von: string, text: string) => meldung(lageId, von, null, text),
    };
    if (verarbeiteZeichnen(u, t, lage, m)) return;
    switch (m.typ) {
      case 'hallo':
        return fehler(v, 'Bereits angemeldet');
      case 'pos': {
        if (jetzt - (letztePos.get(t.id) ?? 0) < POS_MIN_ABSTAND_MS) return;
        // Emission Control gilt nicht, solange ein eigener Alarm aktiv ist (wie ATAK-Notruf).
        if (!t.sendetPos && !aktiveAlarme(lage.id, t.id).length) return;
        letztePos.set(t.id, jetzt);
        // staleNach ist per Schema schon auf ≤ STALE_MAX_MS begrenzt und wird unverändert mitgespeichert.
        return positionVerteilen(ich, m.pos);
      }
      case 'sendetPos':
        return anAlle(lage.id, { typ: 'teilnehmer', teilnehmer: speichereTeilnehmer(ich, { sendetPos: m.an }) });
      case 'status': {
        // der eigene, inzwischen aus dem Set entfernte Status bleibt für Freitext-Meldungen gültig
        if (m.status !== t.status && !lage.statusSet.some((s) => s.key === m.status)) return fehler(v, 'Unbekannter Status');
        anAlle(lage.id, { typ: 'teilnehmer', teilnehmer: speichereTeilnehmer(ich, { status: m.status, statusText: m.text }) });
        return meldung(lage.id, t.id, m.status, m.text);
      }
      case 'marker.setzen': {
        const alt = m.marker.id ? db.eintrag(lage.id, 'marker', m.marker.id) : undefined;
        if (alt && alt.von !== t.id && !leitung) return fehler(v, 'Keine Berechtigung für diesen Marker');
        const id = m.marker.id ?? randomUUID();
        if (!alt && db.idVergeben('marker', id)) return fehler(v, 'Marker-ID bereits vergeben');
        if (!alt && db.anzahl(lage.id, 'marker') >= MAX_MARKER_JE_LAGE) return fehler(v, 'Zu viele Marker in dieser Lage');
        const marker = { ...m.marker, id, von: alt?.von ?? t.id, erstelltAm: alt?.erstelltAm ?? jetzt, geaendertAm: jetzt };
        db.speichern(lage.id, 'marker', marker, marker.erstelltAm);
        return anAlle(lage.id, { typ: 'marker', marker });
      }
      case 'marker.loeschen': {
        const alt = db.eintrag(lage.id, 'marker', m.id);
        if (!alt) return fehler(v, 'Marker nicht gefunden');
        if (alt.von !== t.id && !leitung) return fehler(v, 'Keine Berechtigung für diesen Marker');
        db.loeschen(lage.id, 'marker', m.id);
        return anAlle(lage.id, { typ: 'marker.geloescht', id: m.id });
      }
      case 'chat': {
        if (m.an.art === 'person' && !db.teilnehmerAktiv(lage.id, m.an.id)) return fehler(v, 'Empfänger nicht gefunden');
        const chat: Chat = { id: randomUUID(), von: t.id, an: m.an, text: m.text, t: jetzt };
        db.speichern(lage.id, 'chat', chat, jetzt);
        for (const e of verbindungen(lage.id)) if (sichtbar(chat, e)) senden(e.ws, { typ: 'chat', chat });
        return;
      }
      case 'sichtung': {
        const { fotoId } = m.sichtung;
        if (fotoId !== null && db.foto(fotoId)?.lageId !== lage.id) return fehler(v, 'Foto nicht gefunden');
        if (db.anzahl(lage.id, 'sichtung') >= MAX_SICHTUNGEN_JE_LAGE) return fehler(v, 'Zu viele Sichtungen in dieser Lage');
        const sichtung = { ...m.sichtung, id: randomUUID(), von: t.id, erstelltAm: jetzt };
        db.speichern(lage.id, 'sichtung', sichtung, jetzt);
        return anAlle(lage.id, { typ: 'sichtung', sichtung });
      }
      case 'alarm.ausloesen': {
        // Pro Person nur ein aktiver Alarm: ein neuer ersetzt den bestehenden.
        for (const alt of aktiveAlarme(lage.id, t.id)) {
          const aufgehoben = { ...alt, aufgehobenAm: jetzt };
          db.speichern(lage.id, 'alarm', aufgehoben, aufgehoben.t);
          anAlle(lage.id, { typ: 'alarm', alarm: aufgehoben });
        }
        if (m.pos) positionVerteilen(ich, m.pos);
        const pos = m.pos ?? t.pos;
        const alarm: Alarm = { id: randomUUID(), art: m.art, von: t.id, lat: pos?.lat ?? null, lon: pos?.lon ?? null, t: jetzt, quittiertVon: [], aufgehobenAm: null };
        db.speichern(lage.id, 'alarm', alarm, jetzt);
        anAlle(lage.id, { typ: 'alarm', alarm });
        return meldung(lage.id, t.id, null, `Alarm ausgelöst: ${m.art === 'notfall' ? 'Notfall' : 'Feindkontakt'}`);
      }
      case 'alarm.quittieren': {
        const alarm = db.eintrag(lage.id, 'alarm', m.id);
        if (!alarm || alarm.aufgehobenAm !== null) return fehler(v, 'Alarm nicht aktiv');
        if (alarm.quittiertVon.includes(t.id)) return;
        const neu = { ...alarm, quittiertVon: [...alarm.quittiertVon, t.id] };
        db.speichern(lage.id, 'alarm', neu, neu.t);
        return anAlle(lage.id, { typ: 'alarm', alarm: neu });
      }
      case 'alarm.aufheben': {
        const alarm = db.eintrag(lage.id, 'alarm', m.id);
        if (!alarm || alarm.aufgehobenAm !== null) return fehler(v, 'Alarm nicht aktiv');
        if (alarm.von !== t.id && !leitung) return fehler(v, 'Nur Auslöser oder Leitung können den Alarm aufheben');
        const neu = { ...alarm, aufgehobenAm: jetzt };
        db.speichern(lage.id, 'alarm', neu, neu.t);
        anAlle(lage.id, { typ: 'alarm', alarm: neu });
        return meldung(lage.id, t.id, null, `Alarm aufgehoben: ${alarm.art === 'notfall' ? 'Notfall' : 'Feindkontakt'}`);
      }
      case 'lage.statusSet': {
        if (!leitung) return fehler(v, 'Nur für die Leitung');
        if (new Set(m.statusSet.map((s) => s.key)).size !== m.statusSet.length) return fehler(v, 'Status-Schlüssel doppelt');
        const neu = { ...lage, statusSet: m.statusSet };
        db.lageSpeichern(neu);
        return anAlle(lage.id, { typ: 'lage', lage: neu });
      }
      case 'lage.beenden': {
        if (!leitung) return fehler(v, 'Nur für die Leitung');
        const neu = { ...lage, beendetAm: jetzt };
        db.lageSpeichern(neu);
        anAlle(lage.id, { typ: 'lage', lage: neu });
        log('info', 'lage beendet', { lageId: lage.id });
        return rauswerfen(lage.id);
      }
      case 'lage.codeErneuern': {
        if (!leitung) return fehler(v, 'Nur für die Leitung');
        const teilnehmerCode = neuerCode(8);
        db.teilnehmerCodeSetzen(lage.id, sha256(teilnehmerCode));
        log('info', 'teilnehmer-code erneuert', { lageId: lage.id });
        return senden(v.ws, { typ: 'code', teilnehmerCode });
      }
      case 'teilnehmer.entfernen': {
        if (!leitung) return fehler(v, 'Nur für die Leitung');
        if (m.id === t.id) return fehler(v, 'Sich selbst entfernen ist nicht möglich');
        if (!db.teilnehmerEntfernen(lage.id, m.id)) return fehler(v, 'Teilnehmer nicht gefunden');
        rauswerfen(lage.id, m.id);
        return anAlle(lage.id, { typ: 'teilnehmer.weg', id: m.id });
      }
    }
  }

  wss.on('connection', (ws, req) => {
    let v: Verbindung | undefined;
    let gewarnt = 0;
    const ip = clientIp(req);
    const offen = ohneHallo.get(ip) ?? 0;
    if (offen >= MAX_OHNE_HALLO_JE_IP) return ws.close(4029, 'zu viele Verbindungen');
    ohneHallo.set(ip, offen + 1);
    let gezaehlt = true;
    const freigeben = () => {
      if (!gezaehlt) return;
      gezaehlt = false;
      const n = (ohneHallo.get(ip) ?? 1) - 1;
      if (n > 0) ohneHallo.set(ip, n);
      else ohneHallo.delete(ip);
    };
    const timer = setTimeout(() => v || ws.close(4002, 'hallo fehlt'), HALLO_TIMEOUT_MS);

    ws.on('pong', () => v && (v.lebt = true));
    ws.on('close', () => {
      clearTimeout(timer);
      freigeben();
      if (v) trennen(v);
    });
    ws.on('error', (e) => log('warn', 'ws fehler', { fehler: e.message }));
    ws.on('message', (daten, binaer) => {
      const jetzt = Date.now();
      if (v && !limitNachrichten(v.id, jetzt)) {
        if (jetzt - gewarnt > 10_000) {
          gewarnt = jetzt;
          senden(ws, { typ: 'fehler', meldung: 'Zu viele Nachrichten' });
        }
        return;
      }
      let roh: unknown;
      try {
        roh = binaer ? undefined : JSON.parse(daten.toString());
      } catch {
        roh = undefined;
      }
      const p = ClientMsg.safeParse(roh);
      if (!v) {
        if (!p.success || p.data.typ !== 'hallo') return ws.close(4003, 'hallo erwartet');
        v = hallo(ws, p.data.token);
        if (v) {
          clearTimeout(timer);
          freigeben();
        }
        return;
      }
      if (!p.success) return fehler(v, 'Ungültige Nachricht');
      // Frisch laden: erfasst Entfernen, Beenden und Änderungen anderer Verbindungen.
      const gefunden = db.teilnehmerNachToken(v.tokenHash);
      const lage = gefunden && db.lage(gefunden.lageId);
      if (!gefunden || !lage || lage.beendetAm !== null) {
        senden(ws, beendet(v.rolle, gefunden ? lage : undefined));
        return ws.close(4000, 'beendet');
      }
      try {
        verarbeite({ v, t: gefunden.teilnehmer, lage }, p.data);
      } catch (e) {
        log('error', 'verarbeitung fehlgeschlagen', { typ: p.data.typ, fehler: e instanceof Error ? e.message : String(e) });
        fehler(v, 'Interner Fehler');
      }
    });
  });

  const ping = setInterval(() => {
    for (const set of lagen.values())
      for (const v of set) {
        if (!v.lebt) {
          v.ws.terminate();
          continue;
        }
        v.lebt = false;
        v.ws.ping();
        senden(v.ws, { typ: 'ping' }); // Protokoll-Pings sieht das JS im Browser nicht → Watchdog im Client
      }
  }, PING_MS);

  return {
    /** Lage gelöscht oder beendet: alle Verbindungen erhalten 'beendet'. */
    rauswerfen: (lageId: string): void => rauswerfen(lageId),
    schliessen(): void {
      clearInterval(ping);
      lagen.clear(); // trennen() soll nach dem Schliessen nicht mehr in die DB schreiben
      for (const c of wss.clients) c.terminate();
      wss.close();
    },
  };
}
