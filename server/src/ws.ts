// WebSocket: Anmeldung per hallo, Snapshot, Verteilung der Deltas pro Lage. Die fachlichen Regeln liegen in shared/regeln.
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMsg, MAX_NACHRICHT, PING_MS, type Lage, type ServerMsg, type Teilnehmer } from '../../shared/protocol.ts';
import { empfaengt, istAbgelehnt, sichtbar, sichtbareAuftraege, wende } from '../../shared/regeln/index.ts';
import type { Db } from './db.ts';
import { sichtAusDb, speichere } from './regeln.ts';
import { log, neuerCode, rateLimiter, sha256 } from './sicherheit.ts';

const HALLO_TIMEOUT_MS = 5000;
/** Je Teilnehmer gleichzeitig (Tabs, Reconnect-Überlappung); eine neue Verbindung schliesst die älteste. */
const MAX_VERBINDUNGEN_JE_TEILNEHMER = 3;
/** Je IP gleichzeitig offene Verbindungen ohne hallo. */
const MAX_OHNE_HALLO_JE_IP = 20;
/** Snapshot: so viele Chats werden geladen, bevor nach Empfänger gefiltert wird (davon höchstens 500 gesendet). */
const CHAT_SNAPSHOT_ROH = 2000;

type Verbindung = { ws: WebSocket; lageId: string; id: string; rolle: Teilnehmer['rolle']; einheit: string; tokenHash: string; lebt: boolean };
type Ich = { v: Verbindung; t: Teilnehmer; lage: Lage };

export function starteWs(server: Server, db: Db, clientIp: (req: IncomingMessage) => string) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_NACHRICHT });
  const lagen = new Map<string, Set<Verbindung>>();
  // Limits je Teilnehmer, nicht je Verbindung: sonst vervielfacht jede weitere Verbindung desselben Tokens sie
  const limitNachrichten = rateLimiter(50, 10_000);
  // Jeder Alarm bleibt gespeichert (aufgehoben) und alle werden je Alarm/Snapshot gelesen: eine Flut wächst unbegrenzt
  const limitAlarme = rateLimiter(10, 60_000);
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
      taufen: db.eintraege(lage.id, 'taufe'),
      bloodhound: sichtbareAuftraege(db.eintraege(lage.id, 'bloodhound'), v),
      raster: db.eintraege(lage.id, 'raster'),
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

  /** Ein Delta der Regeln verteilen: gefiltert nach Empfänger, `online` aus den Verbindungen; Entfernen und Beenden werfen hinaus. */
  function verteile(lageId: string, d: ServerMsg): void {
    if (d.typ === 'teilnehmer') return anAlle(lageId, { typ: 'teilnehmer', teilnehmer: mitOnline(lageId, d.teilnehmer) });
    if (d.typ === 'teilnehmer.weg') rauswerfen(lageId, d.id);
    if (d.typ === 'chat' || d.typ === 'bloodhound') {
      for (const e of verbindungen(lageId)) if (empfaengt(d, e)) senden(e.ws, d);
      return;
    }
    anAlle(lageId, d);
    if (d.typ === 'lage' && d.lage.beendetAm !== null) {
      log('info', 'lage beendet', { lageId });
      rauswerfen(lageId);
    }
  }

  function verarbeite(ich: Ich, m: ClientMsg): void {
    const { v, t, lage } = ich;
    const jetzt = Date.now();
    if (m.typ === 'hallo') return fehler(v, 'Bereits angemeldet');
    if (m.typ === 'lage.codeErneuern') {
      if (t.rolle !== 'leitung') return fehler(v, 'Nur für die Leitung');
      const teilnehmerCode = neuerCode(8);
      db.teilnehmerCodeSetzen(lage.id, sha256(teilnehmerCode));
      log('info', 'teilnehmer-code erneuert', { lageId: lage.id });
      return senden(v.ws, { typ: 'code', teilnehmerCode });
    }
    if (m.typ === 'alarm.ausloesen' && !limitAlarme(t.id, jetzt)) return fehler(v, 'Zu viele Alarme – bitte kurz warten');
    const r = wende(sichtAusDb(db, lage, letztePos), { autor: t, msg: m, jetzt, neueId: randomUUID });
    if (istAbgelehnt(r)) return fehler(v, r.abgelehnt);
    speichere(db, lage.id, r.aenderungen, letztePos);
    for (const d of r.deltas) verteile(lage.id, d);
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
