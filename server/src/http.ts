// HTTP: REST-API, statische Auslieferung des Clients, Sicherheits-Header. Startet auch den WebSocket.
import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync } from 'node:fs';
import { readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import type { z } from 'zod';
import { Beitreten, LageErstellen, phaseVon, STANDARD_STATUS, type Beigetreten, type Lage, type LageErstellt, type Protokoll, type ProtokollEintrag, type Teilnehmer } from '../../shared/protocol.ts';
import { meldungSichtbar, sichtbar, type Art, type Eintraege } from '../../shared/regeln/index.ts';
import { oeffneDb, type Db } from './db.ts';
import { geojson, gpx, type ExportDaten } from '../../shared/export.ts';
import { clientIp, corsKopf, gleich, log, neuerCode, neuesToken, rateLimiter, sha256 } from './sicherheit.ts';
import { starteWs } from './ws.ts';

export type Optionen = {
  port: number;
  dataDir: string;
  erstellPasswort: string;
  clientDir: string;
  /** Android-App zum Download: `lagebild.apk` + `version.json` (deploy/apk.sh), `web.json` + `web-<n>.zip` (deploy/web.sh). Vorgabe: <dataDir>/app */
  appDir?: string;
  host?: string;
  /** Socket-Adressen, deren `CF-Connecting-IP` gilt (cloudflared). Leer: immer die Socket-IP. */
  vertrauteProxies?: string[];
};

const MAX_JSON = 64 * 1024;
// Der Client sendet JPEG ≤ 1600 px (Qualität 0.8), also deutlich unter 2 MB; mehr wäre nur Plattenfüllung.
const MAX_FOTO = 2 * 1024 * 1024;
// ponytail: Kontingent nach Anzahl, nicht nach Bytes (Client verkleinert auf ≤ 1600 px). Worst case 300 × 2 MB je Lage.
const MAX_FOTOS_JE_LAGE = 300;
const MAX_UPLOADS_GLEICHZEITIG = 4;
/** Aktive Teilnehmende je Lage: der Teilnehmer-Code ist breit verteilt, ohne Grenze könnte er die Lage mit Beitritten fluten. */
export const MAX_TEILNEHMER_JE_LAGE = 1000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/** Bildformat nach Magic Bytes; nur JPEG, PNG, WebP. */
export function bildFormat(b: Buffer): 'jpg' | 'png' | 'webp' | undefined {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return undefined;
}

function csp(host: string | undefined): string {
  const eigener = host && /^[a-zA-Z0-9.-]+(:\d+)?$/.test(host) ? ` wss://${host} ws://${host}` : '';
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.geo.admin.ch",
    "font-src 'self' data:",
    `connect-src 'self'${eigener} https://*.geo.admin.ch`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

class HttpFehler extends Error {
  status: number;
  constructor(status: number, meldung: string) {
    super(meldung);
    this.status = status;
  }
}

function antwort(res: ServerResponse, status: number, body: unknown, typ = 'application/json'): void {
  const daten = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': typ, 'Cache-Control': 'no-store' }).end(daten);
}

async function body(req: IncomingMessage, max: number): Promise<Buffer> {
  const laenge = Number(req.headers['content-length'] ?? 0);
  if (laenge > max) throw new HttpFehler(413, 'Zu gross');
  const teile: Buffer[] = [];
  let n = 0;
  for await (const teil of req as AsyncIterable<Buffer>) {
    n += teil.length;
    if (n > max) throw new HttpFehler(413, 'Zu gross');
    teile.push(teil);
  }
  return Buffer.concat(teile);
}

async function jsonBody<T extends z.ZodType>(req: IncomingMessage, schema: T): Promise<z.infer<T>> {
  let roh: unknown;
  try {
    roh = JSON.parse((await body(req, MAX_JSON)).toString('utf8'));
  } catch (e) {
    if (e instanceof HttpFehler) throw e;
    throw new HttpFehler(400, 'Ungültiges JSON');
  }
  const p = schema.safeParse(roh);
  if (!p.success) throw new HttpFehler(400, 'Ungültige Eingabe');
  return p.data;
}

export async function starteServer(o: Optionen): Promise<{ server: Server; url: string; schliessen: () => Promise<void> }> {
  mkdirSync(join(o.dataDir, 'fotos'), { recursive: true });
  const db: Db = oeffneDb(join(o.dataDir, 'lagebild.sqlite'));
  const clientDir = resolve(o.clientDir);
  const fotoDir = resolve(o.dataDir, 'fotos');
  const appDir = resolve(o.appDir ?? join(o.dataDir, 'app'));
  const vertraut = new Set(o.vertrauteProxies ?? []);
  const ip = (req: IncomingMessage): string => clientIp(req, vertraut);
  const limitErstellen = rateLimiter(10, 60_000);
  // zählt nur falsche Codes: 30 Geräte hinter einem NAT sollen gleichzeitig beitreten können
  const limitBeitreten = rateLimiter(10, 10 * 60_000);
  const limitFoto = rateLimiter(10, 60_000);
  let uploads = 0;

  function auth(req: IncomingMessage, nurLeitung = false): { lage: Lage; teilnehmer: Teilnehmer } {
    const m = /^Bearer (\S{20,200})$/.exec(req.headers.authorization ?? '');
    const gefunden = m && db.teilnehmerNachToken(sha256(m[1]));
    const lage = gefunden && db.lage(gefunden.lageId);
    if (!gefunden || !lage) throw new HttpFehler(401, 'Nicht angemeldet');
    if (nurLeitung && gefunden.teilnehmer.rolle !== 'leitung') throw new HttpFehler(403, 'Nur für die Leitung');
    return { lage, teilnehmer: gefunden.teilnehmer };
  }

  function exportDaten(lage: Lage): ExportDaten {
    return {
      lage,
      teilnehmer: db.teilnehmerListe(lage.id, true),
      marker: db.eintraege(lage.id, 'marker'),
      sichtungen: db.eintraege(lage.id, 'sichtung'),
      ebenen: db.ebenenSicherstellen(lage.id),
      zeichnungen: db.eintraege(lage.id, 'zeichnung'),
      raster: db.eintraege(lage.id, 'raster'),
      taufen: db.eintraege(lage.id, 'taufe'),
      spuren: db.spuren(lage.id),
    };
  }

  /** Lagen von vor dem Protokoll (31.10.): Ereignisse aus den gespeicherten Einträgen; frühere Änderungen und Löschungen fehlen. */
  function ausBestand(lage: Lage): ProtokollEintrag[] {
    const e = <A extends Art>(art: A): Eintraege[A][] => db.eintraege(lage.id, art);
    const liste: ProtokollEintrag[] = [
      ...e('marker').map((marker) => ({ t: marker.erstelltAm, von: marker.von, d: { typ: 'marker' as const, marker } })),
      ...e('sichtung').map((sichtung) => ({ t: sichtung.erstelltAm, von: sichtung.von, d: { typ: 'sichtung' as const, sichtung } })),
      ...e('zeichnung').map((z) => ({ t: z.erstelltAm, von: z.von, d: { typ: 'zeichnungen' as const, zeichnungen: [z] } })),
      ...e('taufe').map((taufe) => ({ t: taufe.erstelltAm, von: taufe.von, d: { typ: 'taufe' as const, taufe } })),
      ...e('chat').map((chat) => ({ t: chat.t, von: chat.von, d: { typ: 'chat' as const, chat } })),
      ...e('meldung').map((meldung) => ({ t: meldung.t, von: meldung.von, d: { typ: 'meldung' as const, meldung } })),
      ...e('alarm').flatMap((alarm) => [
        { t: alarm.t, von: alarm.von, d: { typ: 'alarm' as const, alarm: { ...alarm, aufgehobenAm: null } } },
        ...(alarm.aufgehobenAm === null ? [] : [{ t: alarm.aufgehobenAm, von: alarm.von, d: { typ: 'alarm' as const, alarm } }]),
      ]),
      ...e('bloodhound').flatMap((auftrag) => [
        { t: auftrag.erstelltAm, von: auftrag.von, d: { typ: 'bloodhound' as const, auftrag: { ...auftrag, ende: null, endeAm: null } } },
        ...(auftrag.endeAm === null ? [] : [{ t: auftrag.endeAm, von: auftrag.von, d: { typ: 'bloodhound' as const, auftrag } }]),
      ]),
    ];
    return liste.sort((a, b) => a.t - b.t);
  }

  async function api(req: IncomingMessage, res: ServerResponse, pfad: string, url: URL): Promise<void> {
    const route = `${req.method} ${pfad}`;
    if (route === 'POST /api/lage') {
      if (!limitErstellen(ip(req))) throw new HttpFehler(429, 'Zu viele Versuche');
      const e = await jsonBody(req, LageErstellen);
      if (!gleich(e.erstellPasswort, o.erstellPasswort)) throw new HttpFehler(403, 'Erstell-Passwort falsch');
      const jetzt = Date.now();
      const lage: Lage = { id: randomUUID(), name: e.name, statusSet: STANDARD_STATUS, erstelltAm: jetzt, phasen: [{ phase: e.phase ?? 'lv', t: jetzt }] };
      const r: LageErstellt = { lageId: lage.id, teilnehmerCode: neuerCode(8), leitungCode: neuerCode(10) };
      db.lageErstellen(lage, sha256(r.teilnehmerCode), sha256(r.leitungCode));
      db.ebenenSicherstellen(lage.id);
      log('info', 'lage erstellt', { lageId: lage.id });
      return antwort(res, 201, r);
    }
    if (route === 'POST /api/beitreten') {
      const schluessel = ip(req);
      if (!limitBeitreten.frei(schluessel)) throw new HttpFehler(429, 'Zu viele Versuche');
      const e = await jsonBody(req, Beitreten);
      const gefunden = db.lageNachCodeHash(sha256(e.code));
      if (!gefunden) {
        limitBeitreten(schluessel);
        throw new HttpFehler(403, 'Code ungültig');
      }
      if (phaseVon(gefunden.lage) === 'an') throw new HttpFehler(410, 'Lage ist in der Nachbearbeitung');
      if (db.teilnehmerListe(gefunden.lage.id).length >= MAX_TEILNEHMER_JE_LAGE) throw new HttpFehler(507, 'Teilnehmer-Kontingent der Lage erschöpft');
      const { lage, rolle } = gefunden;
      const t: Teilnehmer = {
        id: randomUUID(),
        rufname: e.rufname,
        einheit: e.einheit,
        funktion: e.funktion,
        sidc: e.sidc,
        rolle,
        status: lage.statusSet[0].key,
        statusText: '',
        pos: null,
        sendetPos: true,
        online: false,
        zuletzt: Date.now(),
      };
      const token = neuesToken();
      db.teilnehmerErstellen(lage.id, t, sha256(token));
      log('info', 'beigetreten', { lageId: lage.id, teilnehmerId: t.id, rolle });
      const r: Beigetreten = { token, teilnehmerId: t.id, lageId: lage.id, rolle };
      return antwort(res, 201, r);
    }
    if (route === 'POST /api/foto') {
      const { lage, teilnehmer } = auth(req);
      if (phaseVon(lage) === 'an') throw new HttpFehler(410, 'Lage ist in der Nachbearbeitung');
      // Fotos gehören zu Sichtungen, und die gibt es nur in LV
      if (phaseVon(lage) === 'ap') throw new HttpFehler(409, 'Fotos erst in der Lageverfolgung');
      // alles vor dem Lesen des Bodys prüfen: der wird ganz im RAM gepuffert
      if (!limitFoto(teilnehmer.id)) throw new HttpFehler(429, 'Zu viele Fotos – bitte kurz warten');
      if (db.fotoAnzahl(lage.id) >= MAX_FOTOS_JE_LAGE) throw new HttpFehler(507, 'Foto-Kontingent der Lage erschöpft');
      if (uploads >= MAX_UPLOADS_GLEICHZEITIG) throw new HttpFehler(503, 'Server ausgelastet – bitte erneut versuchen');
      uploads++;
      try {
        const daten = await body(req, MAX_FOTO);
        const ext = bildFormat(daten);
        if (!ext) throw new HttpFehler(415, 'Nur JPEG, PNG oder WebP');
        const id = randomUUID();
        mkdirSync(join(fotoDir, lage.id), { recursive: true });
        await writeFile(join(fotoDir, lage.id, `${id}.${ext}`), daten);
        db.fotoSpeichern(id, lage.id, ext, teilnehmer.id);
        // Vertrag nennt die Antwort nicht; { fotoId } für SichtungInput.fotoId.
        return antwort(res, 201, { fotoId: id });
      } finally {
        uploads--;
      }
    }
    const foto = /^\/api\/foto\/([0-9a-f-]{36})$/.exec(pfad);
    if (req.method === 'GET' && foto) {
      const { lage } = auth(req);
      const f = db.foto(foto[1]);
      if (!f || f.lageId !== lage.id) throw new HttpFehler(404, 'Foto nicht gefunden');
      const daten = await readFile(join(fotoDir, lage.id, `${foto[1]}.${f.ext}`));
      res.writeHead(200, { 'Content-Type': MIME[`.${f.ext}`], 'Cache-Control': 'private, max-age=86400' }).end(daten);
      return;
    }
    if (route === 'GET /api/spuren') {
      const { lage } = auth(req);
      const seit = Number(url.searchParams.get('seit') ?? 0);
      if (!Number.isFinite(seit)) throw new HttpFehler(400, 'seit ungültig');
      return antwort(res, 200, db.spuren(lage.id, seit));
    }
    if (route === 'GET /api/protokoll') {
      const { lage, teilnehmer: ich } = auth(req);
      const roh = db.protokoll(lage.id);
      const sieht = (e: ProtokollEintrag): boolean =>
        e.d.typ === 'chat' ? sichtbar(e.d.chat, ich) : e.d.typ === 'meldung' ? meldungSichtbar(e.d.meldung, ich) : true;
      // ponytail: ganzes Protokoll in einer Antwort; bei sehr langen Lagen seitenweise laden
      // Bestandslagen: was vor dem ersten Protokolleintrag entstand, kommt aus den Einträgen
      const erst = roh[0]?.t ?? Infinity;
      const ereignisse = [...ausBestand(lage).filter((e) => e.t < erst), ...roh];
      const p: Protokoll = { teilnehmer: db.teilnehmerListe(lage.id, true), ereignisse: ereignisse.filter(sieht), spuren: db.spuren(lage.id) };
      return antwort(res, 200, p);
    }
    if (route === 'GET /api/export.gpx' || route === 'GET /api/export.geojson') {
      const { lage } = auth(req, true);
      const gpxFormat = pfad.endsWith('.gpx');
      const datei = `lage-${lage.erstelltAm}.${gpxFormat ? 'gpx' : 'geojson'}`;
      res.setHeader('Content-Disposition', `attachment; filename="${datei}"`);
      const d = exportDaten(lage);
      return gpxFormat
        ? antwort(res, 200, gpx(d), 'application/gpx+xml; charset=utf-8')
        : antwort(res, 200, JSON.stringify(geojson(d)), 'application/geo+json');
    }
    if (route === 'DELETE /api/lage') {
      const { lage } = auth(req, true);
      ws.rauswerfen(lage.id);
      db.lageLoeschen(lage.id);
      await rm(join(fotoDir, lage.id), { recursive: true, force: true });
      log('info', 'lage gelöscht', { lageId: lage.id });
      res.writeHead(204).end();
      return;
    }
    throw new HttpFehler(404, 'Nicht gefunden');
  }

  /**
   * `/app/…` aus dem Datenverzeichnis (nicht im Repo): APK, `version.json` (APK-Hinweis), `web.json` + `web-<n>.zip` (Live-Update
   * der Oberfläche). Die Bundles tragen ihren Stand im Namen und sind unveränderlich; alles andere wird immer neu geprüft.
   */
  async function appDatei(req: IncomingMessage, res: ServerResponse, pfad: string): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpFehler(405, 'Methode nicht erlaubt');
    const apk = pfad === '/app/lagebild.apk';
    const bundle = /^\/app\/web-\d{1,12}\.zip$/.test(pfad);
    if (!apk && !bundle && pfad !== '/app/version.json' && pfad !== '/app/web.json') throw new HttpFehler(404, 'Nicht gefunden');
    const datei = join(appDir, pfad.slice('/app/'.length));
    const info = await stat(datei).catch(() => undefined);
    if (!info?.isFile()) throw new HttpFehler(404, 'App nicht bereitgestellt');
    res.writeHead(200, {
      'Content-Type': apk ? 'application/vnd.android.package-archive' : bundle ? 'application/zip' : 'application/json',
      'Content-Length': info.size,
      'Cache-Control': bundle ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(apk ? { 'Content-Disposition': 'attachment; filename="lagebild.apk"' } : {}),
    });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(datei).on('error', () => res.destroy()).pipe(res);
  }

  async function statisch(req: IncomingMessage, res: ServerResponse, pfad: string): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpFehler(405, 'Methode nicht erlaubt');
    let datei = resolve(clientDir, '.' + pfad);
    if (datei !== clientDir && !datei.startsWith(clientDir + sep)) throw new HttpFehler(404, 'Nicht gefunden');
    const info = await stat(datei).catch(() => undefined);
    if (!info?.isFile()) {
      // SPA-Fallback nur für Pfade ohne Dateiendung.
      if (extname(pfad)) throw new HttpFehler(404, 'Nicht gefunden');
      datei = join(clientDir, 'index.html');
    }
    const inhalt = await readFile(datei).catch(() => {
      throw new HttpFehler(404, 'Client nicht gebaut');
    });
    const cache = pfad.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[extname(datei)] ?? 'application/octet-stream', 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : inhalt);
  }

  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', csp(req.headers.host));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const pfad = decodeURIComponent(url.pathname);
      const cors = corsKopf(req.headers.origin);
      for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
      if (req.method === 'OPTIONS' && cors['Access-Control-Allow-Origin'] && (pfad.startsWith('/api/') || pfad.startsWith('/app/'))) {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' }).end();
        return;
      }
      await (pfad.startsWith('/api/') ? api(req, res, pfad, url) : pfad.startsWith('/app/') ? appDatei(req, res, pfad) : statisch(req, res, pfad));
    } catch (e) {
      const status = e instanceof HttpFehler ? e.status : e instanceof URIError ? 400 : 500;
      // Body ungelesen (zu gross oder vorher abgelehnt) → Verbindung schliessen statt ihn abzuwarten
      if (status === 413 || status === 429 || status === 503 || status === 507) res.setHeader('Connection', 'close');
      if (status === 500) log('error', 'anfrage fehlgeschlagen', { pfad: req.url?.split('?')[0], fehler: e instanceof Error ? e.message : String(e) });
      if (!res.headersSent) antwort(res, status, { fehler: e instanceof HttpFehler ? e.message : 'Interner Fehler' });
      else res.destroy();
    }
  });
  const ws = starteWs(server, db, ip);

  await new Promise<void>((ok, nok) => server.once('error', nok).listen(o.port, o.host, ok));
  const adresse = server.address();
  const port = typeof adresse === 'object' && adresse ? adresse.port : o.port;
  return {
    server,
    url: `http://127.0.0.1:${port}`,
    async schliessen() {
      ws.schliessen();
      await new Promise<void>((ok) => server.close(() => ok()));
      db.schliessen();
    },
  };
}
